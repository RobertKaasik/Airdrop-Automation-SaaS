import asyncio
import ctypes
import json
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import unquote, urlsplit

from playwright.async_api import BrowserContext, Playwright, async_playwright

try:
    from playwright_stealth import stealth_async
except ImportError:
    # Защитный fallback на случай отсутствия библиотеки в runtime
    async def stealth_async(context: BrowserContext) -> None:
        pass

from .database import SessionLocal
from .models import ProfileRun, UserProfile

logger = logging.getLogger("AIRDROP_X.profile_manager")


class ProfileBusyError(RuntimeError):
    """Исключение: профиль уже запущен или заблокирован другим процессом."""
    pass


class ProfileConfigurationError(ValueError):
    """Исключение: ошибки валидации конфигурации, прокси или метаданных."""
    pass


@dataclass
class ActiveProfileSession:
    profile_id: int
    user_id: int
    run_id: int
    context: BrowserContext
    playwright: Playwright
    lock_path: Path
    lock_token: str


class BrowserProfileManager:
    """
    Промышленный менеджер браузерных профилей Playwright с изоляцией контекстов,
    атомарной блокировкой на уровне ОС, жестким контролем прокси и аппаратным антидетектом.
    """

    _STALE_CORRUPTED_LOCK_SECONDS = 300

    def __init__(
        self,
        base_profiles_path: str = "./browser_profiles",
        headless: bool = False,
    ) -> None:
        self.base_path = Path(base_profiles_path).resolve()
        self.user_data_path = self.base_path / "data"
        self.locks_path = self.base_path / "locks"

        self.user_data_path.mkdir(parents=True, exist_ok=True)
        self.locks_path.mkdir(parents=True, exist_ok=True)

        self.headless = headless
        self._active_sessions: Dict[int, ActiveProfileSession] = {}

    @staticmethod
    def _default_environment_metadata() -> Dict[str, Any]:
        """Базовый надежный фингерпринт по умолчанию."""
        return {
            "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "platform": "Win32",
            "vendor": "Google Inc. (NVIDIA)",
            "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
            "viewport": {"width": 1366, "height": 768},
            "locale": "ru-RU",
            "canvas_seed": 777,
        }

    @staticmethod
    def _is_process_alive(pid: int) -> bool:
        """Проверка существования и активности процесса в Linux/Windows."""
        if pid <= 0:
            return False

        if pid == os.getpid():
            return True

        if os.name != "nt":
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return False
            except PermissionError:
                return True
            return True

        # Реализация для Windows через OpenProcess
        process_query_limited_information = 0x1000
        still_active = 259
        handle = ctypes.windll.kernel32.OpenProcess(
            process_query_limited_information,
            False,
            pid,
        )

        if not handle:
            return False

        try:
            exit_code = ctypes.c_ulong()
            if not ctypes.windll.kernel32.GetExitCodeProcess(
                handle,
                ctypes.byref(exit_code),
            ):
                return False
            return exit_code.value == still_active
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)

    def _lock_path(self, profile_id: int) -> Path:
        return self.locks_path / f"profile-{profile_id}.lock"

    @staticmethod
    def _read_lock(lock_path: Path) -> Dict[str, Any]:
        return json.loads(lock_path.read_text(encoding="utf-8"))

    def _acquire_lock(self, profile_id: int) -> tuple[Path, str]:
        """Атомарный захват блокировки профиля с защитой от гонки (O_CREAT | O_EXCL)."""
        lock_path = self._lock_path(profile_id)
        token = secrets.token_urlsafe(24)
        payload = {
            "pid": os.getpid(),
            "token": token,
            "profile_id": profile_id,
            "run_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                current = self._read_lock(lock_path)
                current_pid = int(current["pid"])
            except (OSError, ValueError, KeyError, json.JSONDecodeError):
                try:
                    age = datetime.now().timestamp() - lock_path.stat().st_mtime
                except OSError:
                    return self._acquire_lock(profile_id)

                if age < self._STALE_CORRUPTED_LOCK_SECONDS:
                    raise ProfileBusyError(
                        f"Профиль {profile_id} уже запускается. Повторите позднее."
                    )

                lock_path.unlink(missing_ok=True)
                return self._acquire_lock(profile_id)

            if self._is_process_alive(current_pid):
                raise ProfileBusyError(f"Профиль {profile_id} уже активен в процессе PID {current_pid}.")

            # Процесс умер, сбрасываем stale lock
            lock_path.unlink(missing_ok=True)
            return self._acquire_lock(profile_id)

        try:
            with os.fdopen(fd, "w", encoding="utf-8") as lock_file:
                json.dump(payload, lock_file)
            return lock_path, token
        except Exception:
            lock_path.unlink(missing_ok=True)
            raise

    def _attach_run_to_lock(self, lock_path: Path, token: str, run_id: int) -> None:
        """Связывание идентификатора ProfileRun с лок-файлом."""
        data = self._read_lock(lock_path)
        if data.get("token") != token:
            raise ProfileBusyError("Lock профиля был заменён другим процессом.")

        data["run_id"] = run_id
        lock_path.write_text(json.dumps(data), encoding="utf-8")

    def _release_lock(self, lock_path: Path, token: str) -> None:
        """Безопасное освобождение системного лока."""
        try:
            data = self._read_lock(lock_path)
        except (OSError, ValueError, json.JSONDecodeError):
            return

        if data.get("token") == token:
            lock_path.unlink(missing_ok=True)

    @staticmethod
    def _parse_proxy(proxy_value: Optional[str]) -> Optional[Dict[str, str]]:
        """
        Строгий парсинг прокси. Поддерживает форматы:
        - http://login:password@host:port
        - socks5://login:password@host:port
        - host:port:login:password
        - host:port
        При ошибках формата выбрасывает ProfileConfigurationError (не выпускает браузер в открытый интернет).
        """
        if not proxy_value or not proxy_value.strip():
            raise ProfileConfigurationError(
                "Для запуска изолированного профиля требуется настроенный прокси."
            )

        raw = proxy_value.strip()

        try:
            if "://" in raw:
                parsed = urlsplit(raw)
                scheme = parsed.scheme.lower()

                if scheme not in {"http", "https", "socks5", "socks5h"}:
                    raise ProfileConfigurationError(
                        f"Неподдерживаемый протокол прокси '{scheme}'. Разрешены только http://, https://, socks5://."
                    )

                if not parsed.hostname or parsed.port is None:
                    raise ProfileConfigurationError("У прокси отсутствует хост или порт.")

                host = parsed.hostname
                if ":" in host and not host.startswith("["):
                    host = f"[{host}]"

                result: Dict[str, str] = {"server": f"{scheme}://{host}:{parsed.port}"}

                if parsed.username is not None:
                    if parsed.password is None:
                        raise ProfileConfigurationError("Для авторизации прокси требуются и логин, и пароль.")
                    result["username"] = unquote(parsed.username)
                    result["password"] = unquote(parsed.password)

                return result

            parts = raw.split(":")
            if len(parts) == 2:
                host, port = parts[0].strip(), parts[1].strip()
                if not host or not port.isdigit() or not 1 <= int(port) <= 65535:
                    raise ProfileConfigurationError("Некорректный хост или порт прокси.")
                return {"server": f"http://{host}:{port}"}

            if len(parts) == 4:
                host, port, username, password = [p.strip() for p in parts]
                if not host or not port.isdigit() or not 1 <= int(port) <= 65535:
                    raise ProfileConfigurationError("Некорректный хост или порт прокси.")
                if not username or not password:
                    raise ProfileConfigurationError("Логин и пароль прокси не могут быть пустыми.")
                return {
                    "server": f"http://{host}:{port}",
                    "username": username,
                    "password": password,
                }

            raise ProfileConfigurationError(
                "Некорректный формат прокси. Укажите host:port:user:pass или http://user:pass@host:port."
            )

        except ValueError as error:
            raise ProfileConfigurationError(f"Ошибка валидации прокси: {error}") from error

    def _load_profile_data(self, profile_id: int, user_id: int) -> Dict[str, Any]:
        """Синхронная загрузка и валидация данных профиля с отделением от сессии БД."""
        with SessionLocal() as db:
            profile = (
                db.query(UserProfile)
                .filter(
                    UserProfile.id == profile_id,
                    UserProfile.user_id == user_id,
                )
                .first()
            )

            if not profile:
                raise ValueError(f"Профиль ID {profile_id} не найден или не принадлежит пользователю.")

            if profile.status != "active":
                raise ProfileConfigurationError("Профиль отключён и недоступен для запуска.")

            existing_meta = profile.environment_metadata or {}
            if not isinstance(existing_meta, dict):
                raise ProfileConfigurationError("environment_metadata должен быть JSON-объектом.")

            metadata = {
                **self._default_environment_metadata(),
                **existing_meta,
            }

            # Сохраняем обновленные дефолты при необходимости
            if metadata != existing_meta:
                profile.environment_metadata = metadata
                db.commit()

            return {
                "profile_id": profile.id,
                "profile_name": profile.profile_name,
                "proxy_configuration": profile.proxy_configuration,
                "environment_metadata": metadata,
            }

    @staticmethod
    def _create_run(profile_id: int, user_id: int, proxy_server: Optional[str] = None) -> int:
        """Создание записи журнала ProfileRun со статусом starting."""
        with SessionLocal() as db:
            run = ProfileRun(
                profile_id=profile_id,
                user_id=user_id,
                status="starting",
                proxy_ip=proxy_server,
            )
            db.add(run)
            db.commit()
            return run.id

    @staticmethod
    def _set_run_status(run_id: int, status: str, message: Optional[str] = None) -> None:
        """Обновление статуса журнала выполнения ProfileRun."""
        with SessionLocal() as db:
            run = db.get(ProfileRun, run_id)
            if not run:
                return

            run.status = status
            run.log_message = message
            if status in {"completed", "stopped", "failed"}:
                run.end_time = datetime.now(timezone.utc)
            db.commit()

    @staticmethod
    def _get_anti_detect_script(metadata: Dict[str, Any]) -> str:
        """
        Генерация безопасной JS-инъекции антидетекта:
        - Экранирование конфига через json.dumps (защита от сломанного JS).
        - Подмена WebGL1 / WebGL2 (UNMASKED_VENDOR / UNMASKED_RENDERER).
        - Детерминированный шум Canvas на базе canvas_seed (устойчивый отпечаток).
        - Защита от утечки реального IP через WebRTC (очистка iceServers).
        - Подмена параметров объекта screen и оконных габаритов.
        """
        viewport = metadata.get("viewport") or {}
        width = int(viewport.get("width") or metadata.get("width") or 1366)
        height = int(viewport.get("height") or metadata.get("height") or 768)

        config = {
            "ua": str(metadata.get("ua") or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"),
            "platform": str(metadata.get("platform") or "Win32"),
            "vendor": str(metadata.get("vendor") or "Google Inc. (NVIDIA)"),
            "renderer": str(metadata.get("renderer") or "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "width": width,
            "height": height,
            "canvas_seed": int(metadata.get("canvas_seed") or 777),
        }

        config_json = json.dumps(config)

        return f"""
        const AX_CFG = {config_json};
        (() => {{
            // 1. Подмена User-Agent и Platform
            if (AX_CFG.ua) {{
                try {{
                    Object.defineProperty(navigator, 'userAgent', {{ get: () => AX_CFG.ua }});
                    Object.defineProperty(navigator, 'appVersion', {{ get: () => AX_CFG.ua.replace(/^Mozilla\\//, '') }});
                }} catch (e) {{}}
            }}
            if (AX_CFG.platform) {{
                try {{
                    Object.defineProperty(navigator, 'platform', {{ get: () => AX_CFG.platform }});
                }} catch (e) {{}}
            }}

            // 2. WebGL 1 & WebGL 2 Spoofing
            const spoofWebGL = (proto) => {{
                if (!proto) return;
                const originalGetParameter = proto.getParameter;
                proto.getParameter = function(param) {{
                    // UNMASKED_VENDOR_WEBGL
                    if (param === 37445 && AX_CFG.vendor) {{
                        return AX_CFG.vendor;
                    }}
                    // UNMASKED_RENDERER_WEBGL
                    if (param === 37446 && AX_CFG.renderer) {{
                        return AX_CFG.renderer;
                    }}
                    return originalGetParameter.apply(this, arguments);
                }};
            }};

            if (window.WebGLRenderingContext) spoofWebGL(WebGLRenderingContext.prototype);
            if (window.WebGL2RenderingContext) spoofWebGL(WebGL2RenderingContext.prototype);

            // 3. Canvas Spoofing (Детерминированный шум на основе seed)
            if (window.CanvasRenderingContext2D && typeof AX_CFG.canvas_seed === 'number') {{
                const seed = Math.abs(AX_CFG.canvas_seed);
                const noise = (seed % 5) + 1;
                
                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {{
                    const image = originalGetImageData.apply(this, arguments);
                    const len = image.data.length;
                    const step = Math.max(4, Math.floor(len / 64));
                    for (let i = 0; i < len; i += step * 4) {{
                        image.data[i] = (image.data[i] + noise) % 256;
                    }}
                    return image;
                }};

                if (window.HTMLCanvasElement) {{
                    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                    HTMLCanvasElement.prototype.toDataURL = function(type, encoderOptions) {{
                        const ctx = this.getContext('2d');
                        if (ctx && this.width > 0 && this.height > 0) {{
                            try {{
                                const sampleW = Math.min(this.width, 8);
                                const sampleH = Math.min(this.height, 8);
                                const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
                                ctx.putImageData(imgData, 0, 0);
                            }} catch (e) {{}}
                        }}
                        return originalToDataURL.apply(this, arguments);
                    }};
                }}
            }}

            // 4. Защита от утечки реального IP через WebRTC
            if (window.RTCPeerConnection) {{
                const originalRTCPeerConnection = window.RTCPeerConnection;
                window.RTCPeerConnection = function(config, ...args) {{
                    const safeConfig = config ? {{ ...config, iceServers: [] }} : {{ iceServers: [] }};
                    return new originalRTCPeerConnection(safeConfig, ...args);
                }};
                window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
            }}

            // 5. Подмена параметров экрана и окна
            if (AX_CFG.width && AX_CFG.height) {{
                const w = AX_CFG.width;
                const h = AX_CFG.height;
                const screenProps = {{
                    width: w,
                    height: h,
                    availWidth: w,
                    availHeight: h,
                    colorDepth: 24,
                    pixelDepth: 24
                }};
                for (const [prop, val] of Object.entries(screenProps)) {{
                    try {{
                        Object.defineProperty(window.screen, prop, {{ get: () => val }});
                    }} catch (e) {{}}
                }}
                try {{
                    Object.defineProperty(window, 'innerWidth', {{ get: () => w }});
                    Object.defineProperty(window, 'innerHeight', {{ get: () => h }});
                    Object.defineProperty(window, 'outerWidth', {{ get: () => w }});
                    Object.defineProperty(window, 'outerHeight', {{ get: () => h }});
                }} catch (e) {{}}
            }}
        }})();
        """

    async def launch_profile(self, profile_id: int, user_id: int) -> BrowserContext:
        """
        Запускает изолированный persistent контекст профиля с полной маскировкой.
        Возвращает объект BrowserContext. Закрытие выполняется через close_profile(profile_id).
        """
        profile_data = await asyncio.to_thread(self._load_profile_data, profile_id, user_id)
        proxy_config = self._parse_proxy(profile_data["proxy_configuration"])
        lock_path, token = await asyncio.to_thread(self._acquire_lock, profile_id)

        run_id: Optional[int] = None
        playwright: Optional[Playwright] = None
        context: Optional[BrowserContext] = None

        try:
            proxy_server_ip = proxy_config.get("server") if proxy_config else None
            run_id = await asyncio.to_thread(self._create_run, profile_id, user_id, proxy_server_ip)
            await asyncio.to_thread(self._attach_run_to_lock, lock_path, token, run_id)

            playwright = await async_playwright().start()

            metadata = profile_data["environment_metadata"]
            viewport_conf = metadata.get("viewport") or {"width": 1366, "height": 768}

            launch_options: Dict[str, Any] = {
                "user_data_dir": str(self.user_data_path / str(profile_id)),
                "headless": self.headless,
                "viewport": {
                    "width": int(viewport_conf.get("width", 1366)),
                    "height": int(viewport_conf.get("height", 768)),
                },
                "user_agent": metadata.get("ua"),
                "locale": metadata.get("locale", "ru-RU"),
                "args": [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
                ],
            }

            if proxy_config is not None:
                launch_options["proxy"] = proxy_config

            context = await playwright.chromium.launch_persistent_context(**launch_options)

            # Применяем базовый стелс
            await stealth_async(context)

            # Внедряем глубокую детерминированную инъекцию антидетекта
            js_injection = self._get_anti_detect_script(metadata)
            await context.add_init_script(js_injection)

            await asyncio.to_thread(self._set_run_status, run_id, "running")

            session = ActiveProfileSession(
                profile_id=profile_id,
                user_id=user_id,
                run_id=run_id,
                context=context,
                playwright=playwright,
                lock_path=lock_path,
                lock_token=token,
            )
            self._active_sessions[profile_id] = session

            context.on(
                "close",
                lambda: asyncio.create_task(
                    self._handle_external_context_close(profile_id, token)
                ),
            )

            logger.info("Профиль ID %s успешно запущен (Run ID: %s).", profile_id, run_id)
            return context

        except Exception as exc:
            if context is not None:
                try:
                    await context.close()
                except Exception:
                    pass

            if playwright is not None:
                try:
                    await playwright.stop()
                except Exception:
                    pass

            if run_id is not None:
                await asyncio.to_thread(
                    self._set_run_status,
                    run_id,
                    "failed",
                    f"Ошибка запуска: {str(exc)[:450]}",
                )

            await asyncio.to_thread(self._release_lock, lock_path, token)
            logger.error("Сбой запуска профиля ID %s: %s", profile_id, exc)
            raise

    async def _handle_external_context_close(self, profile_id: int, token: str) -> None:
        """Обработчик закрытия окна браузера пользователем вручную."""
        session = self._active_sessions.get(profile_id)
        if not session or session.lock_token != token:
            return

        self._active_sessions.pop(profile_id, None)
        try:
            await session.playwright.stop()
        except Exception:
            pass
        finally:
            await asyncio.to_thread(
                self._set_run_status,
                session.run_id,
                "stopped",
                "Браузерный контекст закрыт пользователем.",
            )
            await asyncio.to_thread(
                self._release_lock,
                session.lock_path,
                session.lock_token,
            )
            logger.info("Профиль ID %s корректно остановлен после закрытия окна.", profile_id)

    async def close_profile(self, profile_id: int) -> bool:
        """Штатная остановка профиля, освобождение лока и обновление ProfileRun."""
        session = self._active_sessions.pop(profile_id, None)
        if session is None:
            return False

        close_error: Optional[Exception] = None
        try:
            await session.context.close()
        except Exception as error:
            close_error = error

        try:
            await session.playwright.stop()
        except Exception as error:
            if close_error is None:
                close_error = error
        finally:
            await asyncio.to_thread(
                self._set_run_status,
                session.run_id,
                "completed",
                "Профиль штатно завершил работу.",
            )
            await asyncio.to_thread(
                self._release_lock,
                session.lock_path,
                session.lock_token,
            )
            logger.info("Профиль ID %s закрыт, блокировка снята.", profile_id)

        if close_error is not None:
            raise close_error
        return True

    async def shutdown(self) -> None:
        """Завершение работы всех активных сессий при остановке сервера."""
        for profile_id in list(self._active_sessions):
            try:
                await self.close_profile(profile_id)
            except Exception as e:
                logger.error("Ошибка при остановке профиля ID %s во время shutdown: %s", profile_id, e)
