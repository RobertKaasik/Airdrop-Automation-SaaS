"""Isolated, non-custodial browser profiles built on standard Playwright.

Each profile uses a separate Chromium ``user_data_dir``. Chromium itself then
keeps its cookies, cache, IndexedDB and local storage in that folder. The
manager supports one proxy per profile and can be used from several worker
threads, provided each worker opens a different profile folder.

This is intentionally ordinary browser automation for QA and user-controlled
websites. It does not alter ``navigator.webdriver``, WebGL/canvas values,
permissions, or other browser identity signals, and it does not attempt to
bypass Cloudflare, WAF, CAPTCHAs or website access rules.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Optional, TypeVar, cast
from urllib.parse import unquote, urlparse

try:
    from playwright.sync_api import BrowserContext, Page, Playwright, sync_playwright

    PLAYWRIGHT_AVAILABLE = True
except ImportError:  # Keeps configuration validation usable before installation.
    BrowserContext = Any  # type: ignore[misc,assignment]
    Page = Any  # type: ignore[misc,assignment]
    Playwright = Any  # type: ignore[misc,assignment]
    sync_playwright = None  # type: ignore[assignment]
    PLAYWRIGHT_AVAILABLE = False


T = TypeVar("T")
PROFILE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$")
SAFE_ENVIRONMENT_KEYS = {
    "locale",
    "timezone_id",
    "viewport",
    "screen",
    "device_scale_factor",
    "color_scheme",
    "user_agent",
}
UNSUPPORTED_STEALTH_KEYS = {
    "automation",
    "canvas",
    "fingerprint",
    "navigator",
    "permissions",
    "stealth",
    "webdriver",
    "webgl",
}


class BrowserProfileError(RuntimeError):
    """Base error for profile configuration and lifecycle failures."""


class ProfileBusyError(BrowserProfileError):
    """Raised when the same persistent profile is already open elsewhere."""


@dataclass(frozen=True)
class ProxySettings:
    """Playwright-compatible proxy settings.

    Passwords are kept only in memory. The manager never writes them to a
    profile file or logs them.
    """

    server: str
    username: Optional[str] = None
    password: Optional[str] = None
    bypass: Optional[str] = None

    @classmethod
    def from_value(cls, value: Optional[str | Mapping[str, Any]]) -> Optional["ProxySettings"]:
        if value is None or value == "":
            return None
        if isinstance(value, Mapping):
            server = str(value.get("server", "")).strip()
            username = _clean_optional_string(value.get("username"))
            password = _clean_optional_string(value.get("password"))
            bypass = _clean_optional_string(value.get("bypass"))
            return cls._validate(server, username, password, bypass)
        if not isinstance(value, str):
            raise BrowserProfileError("proxy must be a string or a dictionary")

        raw = value.strip()
        if not raw:
            return None
        # Supports the existing project format: ip:port:login:password.
        if "://" not in raw:
            try:
                host, port, username, password = raw.rsplit(":", 3)
            except ValueError as exc:
                raise BrowserProfileError(
                    "proxy must use server URL or ip:port:login:password format"
                ) from exc
            return cls._validate(f"http://{host}:{port}", username, password, None)

        parsed = urlparse(raw)
        if parsed.username or parsed.password:
            hostname = parsed.hostname or ""
            if not hostname or parsed.port is None:
                raise BrowserProfileError("proxy URL must include a host and port")
            server = f"{parsed.scheme}://{hostname}:{parsed.port}"
            return cls._validate(
                server,
                unquote(parsed.username or "") or None,
                unquote(parsed.password or "") or None,
                None,
            )
        return cls._validate(raw, None, None, None)

    @classmethod
    def _validate(
        cls,
        server: str,
        username: Optional[str],
        password: Optional[str],
        bypass: Optional[str],
    ) -> "ProxySettings":
        parsed = urlparse(server)
        if parsed.scheme.lower() not in {"http", "https", "socks5"}:
            raise BrowserProfileError("proxy supports only http, https or socks5")
        hostname = parsed.hostname or ""
        try:
            port = parsed.port
        except ValueError as exc:
            raise BrowserProfileError("proxy port is invalid") from exc
        if not hostname or port is None or not 1 <= port <= 65535:
            raise BrowserProfileError("proxy must include a valid host and port")
        _validate_public_proxy_host(hostname)
        if (username is None) != (password is None):
            raise BrowserProfileError("proxy credentials require both username and password")
        return cls(server=server, username=username, password=password, bypass=bypass)

    def to_playwright(self) -> dict[str, str]:
        result = {"server": self.server}
        if self.username is not None:
            result["username"] = self.username
            result["password"] = self.password or ""
        if self.bypass:
            result["bypass"] = self.bypass
        return result


@dataclass(frozen=True)
class BrowserProfileSettings:
    """Validated profile settings accepted by :class:`BrowserProfileManager`."""

    profile_id: str
    user_data_dir: Path
    proxy: Optional[ProxySettings] = None
    headless: bool = False
    channel: Optional[str] = None
    environment: Optional[dict[str, Any]] = None

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> "BrowserProfileSettings":
        profile_id = str(raw.get("profile_id") or raw.get("id") or "").strip()
        if not PROFILE_ID_RE.fullmatch(profile_id):
            raise BrowserProfileError(
                "profile_id must contain only letters, digits, dots, hyphens or underscores"
            )
        directory = str(raw.get("user_data_dir") or raw.get("data_dir") or "").strip()
        if not directory:
            raise BrowserProfileError("user_data_dir is required")
        user_data_dir = Path(directory).expanduser().resolve()
        if user_data_dir == Path(user_data_dir.anchor):
            raise BrowserProfileError("user_data_dir cannot be a filesystem root")

        environment = dict(raw.get("environment") or raw.get("fingerprint") or {})
        _validate_environment(environment)
        channel = _clean_optional_string(raw.get("channel"))
        if channel not in {None, "chromium", "chrome", "msedge"}:
            raise BrowserProfileError("channel must be chromium, chrome or msedge")
        raw_headless = raw.get("headless", False)
        if not isinstance(raw_headless, bool):
            raise BrowserProfileError("headless must be true or false")
        return cls(
            profile_id=profile_id,
            user_data_dir=user_data_dir,
            proxy=ProxySettings.from_value(raw.get("proxy")),
            headless=raw_headless,
            channel=channel,
            environment=environment,
        )


class _ProfileDirectoryLock:
    """Cross-thread/process lock stored inside one profile's data directory."""

    filename = ".airdrop_x_profile.lock"

    def __init__(self, directory: Path, profile_id: str):
        self.directory = directory
        self.profile_id = profile_id
        self.path = directory / self.filename
        self.token = secrets.token_urlsafe(18)
        self._acquired = False

    def acquire(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        payload = {
            "profile_id": self.profile_id,
            "pid": os.getpid(),
            "thread_id": threading.get_ident(),
            "started_at": int(time.time()),
            "token": self.token,
        }
        try:
            descriptor = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            raise ProfileBusyError(
                f"Profile '{self.profile_id}' is already open. Close it before reusing this folder."
            ) from exc
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
            self._acquired = True
        except Exception:
            self.path.unlink(missing_ok=True)
            raise

    def release(self) -> None:
        if not self._acquired:
            return
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if payload.get("token") == self.token:
                self.path.unlink(missing_ok=True)
        except (OSError, ValueError, json.JSONDecodeError):
            # Do not delete a lock that we cannot prove belongs to this session.
            pass
        finally:
            self._acquired = False


class BrowserProfileSession:
    """A live persistent context that must be used and closed on one thread."""

    def __init__(
        self,
        settings: BrowserProfileSettings,
        context: BrowserContext,
        lock: _ProfileDirectoryLock,
        on_close: Callable[[], None],
    ) -> None:
        self.settings = settings
        self.context = context
        self._lock = lock
        self._on_close = on_close
        self._thread_id = threading.get_ident()
        self._closed = False

    def new_page(self) -> Page:
        self._ensure_owner_thread()
        if self._closed:
            raise BrowserProfileError("profile session is already closed")
        return self.context.new_page()

    def close(self) -> None:
        if self._closed:
            return
        self._ensure_owner_thread()
        try:
            self.context.close()
        finally:
            self._closed = True
            self._lock.release()
            self._on_close()

    def __enter__(self) -> "BrowserProfileSession":
        self._ensure_owner_thread()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()

    def _ensure_owner_thread(self) -> None:
        if threading.get_ident() != self._thread_id:
            raise BrowserProfileError(
                "A Playwright profile session cannot be used from another thread"
            )


class BrowserProfileManager:
    """Launch isolated Playwright profiles safely from one or more threads.

    A single manager instance may be shared by a ``ThreadPoolExecutor``. Every
    worker receives its own Playwright driver through ``threading.local``.
    Opening the same ``user_data_dir`` twice is rejected before Chromium starts.
    """

    def __init__(self, browser_type: str = "chromium") -> None:
        if browser_type != "chromium":
            raise BrowserProfileError("Only Chromium is currently supported")
        self.browser_type = browser_type
        self._thread_local = threading.local()

    def open_profile(self, settings: Mapping[str, Any] | BrowserProfileSettings) -> BrowserProfileSession:
        """Open one persistent profile. No browser action is performed yet."""

        config = (
            settings
            if isinstance(settings, BrowserProfileSettings)
            else BrowserProfileSettings.from_dict(settings)
        )
        lock = _ProfileDirectoryLock(config.user_data_dir, config.profile_id)
        lock.acquire()
        try:
            launch_options: dict[str, Any] = {
                "user_data_dir": str(config.user_data_dir),
                "headless": config.headless,
                **_playwright_environment_options(config.environment or {}),
            }
            if config.channel:
                launch_options["channel"] = config.channel
            if config.proxy:
                launch_options["proxy"] = config.proxy.to_playwright()
            context = self._get_playwright().chromium.launch_persistent_context(**launch_options)
        except Exception:
            lock.release()
            raise

        self._thread_local.active_sessions = getattr(self._thread_local, "active_sessions", 0) + 1
        return BrowserProfileSession(config, context, lock, self._release_session)

    def run_parallel(
        self,
        profiles: Iterable[Mapping[str, Any] | BrowserProfileSettings],
        worker: Callable[[BrowserProfileSession], T],
        max_workers: int = 4,
    ) -> list[T]:
        """Run a callback for different profiles concurrently.

        ``worker`` receives a live session and must only operate on that session.
        Exceptions from any profile are re-raised to the caller after all active
        workers have had a chance to close their browser contexts.
        """

        profile_list = list(profiles)
        if max_workers < 1:
            raise BrowserProfileError("max_workers must be at least one")
        if not profile_list:
            return []

        def run_one(profile: Mapping[str, Any] | BrowserProfileSettings) -> T:
            try:
                with self.open_profile(profile) as session:
                    return worker(session)
            finally:
                self.shutdown_current_thread()

        pending_marker = object()
        results: list[object] = [pending_marker] * len(profile_list)
        with ThreadPoolExecutor(max_workers=min(max_workers, len(profile_list))) as executor:
            futures = {
                executor.submit(run_one, profile): index
                for index, profile in enumerate(profile_list)
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()
        if any(result is pending_marker for result in results):
            raise BrowserProfileError("A parallel profile task did not return a result")
        return cast(list[T], results)

    def shutdown_current_thread(self) -> None:
        """Release the Playwright driver created in the current worker thread."""

        if getattr(self._thread_local, "active_sessions", 0):
            return
        playwright = getattr(self._thread_local, "playwright", None)
        if playwright is not None:
            playwright.stop()
            self._thread_local.playwright = None

    @staticmethod
    def inspect_lock(user_data_dir: str | Path) -> Optional[dict[str, Any]]:
        """Return lock metadata for diagnosis; never removes another session's lock."""

        path = Path(user_data_dir).expanduser().resolve() / _ProfileDirectoryLock.filename
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, json.JSONDecodeError):
            return None

    def _get_playwright(self) -> Playwright:
        if not PLAYWRIGHT_AVAILABLE or sync_playwright is None:
            raise BrowserProfileError(
                "Playwright is not installed. Run: pip install -r requirements.txt, then: playwright install chromium"
            )
        playwright = getattr(self._thread_local, "playwright", None)
        if playwright is None:
            playwright = sync_playwright().start()
            self._thread_local.playwright = playwright
        return playwright

    def _release_session(self) -> None:
        self._thread_local.active_sessions = max(
            0, getattr(self._thread_local, "active_sessions", 1) - 1
        )


def _clean_optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _validate_public_proxy_host(hostname: str) -> None:
    try:
        address = ipaddress.ip_address(hostname.strip("[]"))
        if not address.is_global:
            raise BrowserProfileError("proxy must use a public address")
        return
    except ValueError:
        pass
    hostname = hostname.lower().rstrip(".")
    if (
        not hostname
        or hostname in {"localhost", "localhost.localdomain"}
        or hostname.endswith(".local")
        or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", hostname)
    ):
        raise BrowserProfileError("proxy host is invalid")


def _validate_environment(environment: Mapping[str, Any]) -> None:
    unsupported = {str(key).lower() for key in environment} & UNSUPPORTED_STEALTH_KEYS
    if unsupported:
        labels = ", ".join(sorted(unsupported))
        raise BrowserProfileError(f"Unsupported browser-masking settings: {labels}")
    unknown = set(environment) - SAFE_ENVIRONMENT_KEYS
    if unknown:
        labels = ", ".join(sorted(str(item) for item in unknown))
        raise BrowserProfileError(f"Unsupported environment settings: {labels}")

    for name in ("viewport", "screen"):
        value = environment.get(name)
        if value is None:
            continue
        if not isinstance(value, Mapping):
            raise BrowserProfileError(f"{name} must contain width and height")
        width, height = value.get("width"), value.get("height")
        if not isinstance(width, int) or not isinstance(height, int) or width < 320 or height < 200:
            raise BrowserProfileError(f"{name} width and height are invalid")
    scale = environment.get("device_scale_factor")
    if scale is not None and (not isinstance(scale, (int, float)) or not 0.5 <= scale <= 4):
        raise BrowserProfileError("device_scale_factor must be between 0.5 and 4")
    color_scheme = environment.get("color_scheme")
    if color_scheme is not None and color_scheme not in {"light", "dark", "no-preference"}:
        raise BrowserProfileError("color_scheme is invalid")


def _playwright_environment_options(environment: Mapping[str, Any]) -> dict[str, Any]:
    """Translate only standard Playwright testing options to launch options."""

    options: dict[str, Any] = {}
    for key in SAFE_ENVIRONMENT_KEYS:
        if key in environment:
            options[key] = environment[key]
    return options
