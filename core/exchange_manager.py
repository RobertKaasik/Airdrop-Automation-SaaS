import asyncio
import logging
import os
import re
from decimal import Decimal, InvalidOperation

import ccxt.async_support as ccxt

from .database import SessionLocal
from .models import UserProfile


logger = logging.getLogger("AIRDROP_X.exchange_manager")


class ExchangeConfigurationError(RuntimeError):
    pass


class ExchangeUnavailableError(RuntimeError):
    pass


class ExchangeManager:
    """Read-only OKX subaccount balance verification; no transfer methods exist."""

    def __init__(self) -> None:
        self.api_key = os.getenv("OKX_API_KEY", "").strip()
        self.api_secret = os.getenv("OKX_API_SECRET", "").strip()
        self.api_password = os.getenv("OKX_API_PASSWORD", "").strip()

    def _create_client(self):
        if not all((self.api_key, self.api_secret, self.api_password)):
            raise ExchangeConfigurationError(
                "Для сверки баланса не настроены read-only ключи OKX."
            )

        return ccxt.okx(
            {
                "apiKey": self.api_key,
                "secret": self.api_secret,
                "password": self.api_password,
                "enableRateLimit": True,
                "timeout": 20_000,
            }
        )

    @staticmethod
    def _get_subaccount_id(profile_id: int, user_id: int) -> str:
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
                raise ValueError("Профиль не найден или недоступен.")

            if not profile.exchange_subaccount_id:
                raise ExchangeConfigurationError(
                    "Для профиля не указан идентификатор субсчёта биржи."
                )

            return profile.exchange_subaccount_id

    async def check_subaccount_balance(
        self,
        profile_id: int,
        user_id: int,
        asset: str,
    ) -> Decimal:
        symbol = asset.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,20}", symbol):
            raise ValueError("Некорректный тикер актива.")

        subaccount_id = await asyncio.to_thread(
            self._get_subaccount_id,
            profile_id,
            user_id,
        )

        client = None
        try:
            client = self._create_client()
            balance = await client.fetch_balance(params={"subAcct": subaccount_id})
            raw_value = (balance.get("free") or {}).get(symbol)

            if raw_value is None:
                return Decimal("0")

            return Decimal(str(raw_value))

        except InvalidOperation as error:
            raise ExchangeUnavailableError(
                "Биржа вернула баланс в неподдерживаемом формате."
            ) from error
        except ccxt.BaseError as error:
            logger.warning(
                "OKX balance lookup failed for profile_id=%s: %s",
                profile_id,
                type(error).__name__,
            )
            raise ExchangeUnavailableError(
                "Не удалось получить баланс субсчёта. Повторите позже."
            ) from error
        finally:
            if client is not None:
                try:
                    await client.close()
                except Exception:
                    logger.warning(
                        "Could not close temporary OKX client for profile_id=%s",
                        profile_id,
                    )
