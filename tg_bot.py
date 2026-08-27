import asyncio
import logging
import os
import sys
import time

from aiogram import Bot, Dispatcher, html
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from server import (
    OfficialOpportunitySource,
    SessionLocal,
    TelegramLinkCode,
    TelegramSubscription,
    User,
    classify_gas_level,
    get_subscription_state,
    get_live_gas_price,
    hash_secret,
)
from telegram_locales import get_text, normalize_language

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
dp = Dispatcher()


def get_start_code(message: Message) -> str:
    parts = (message.text or "").split(maxsplit=1)
    return parts[1].strip() if len(parts) == 2 else ""


def fallback_language(message: Message) -> str:
    language_code = (message.from_user.language_code or "").lower() if message.from_user else ""
    if language_code.startswith("zh"):
        return "zh"
    if language_code.startswith("en"):
        return "en"
    return "ru"


async def private_chat_only(message: Message) -> bool:
    if message.chat.type == ChatType.PRIVATE:
        return True
    await message.answer(get_text(fallback_language(message), "private_only"))
    return False


@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return

    code = get_start_code(message)
    if not code:
        await message.answer(get_text(fallback_language(message), "welcome"))
        return

    now_ts = int(time.time())
    db = SessionLocal()
    try:
        code_digest = hash_secret(code)
        # New codes are stored as digests. Accepting the raw value as a
        # fallback keeps already-issued, short-lived codes usable during a
        # rolling local update; no newly issued code is stored in plaintext.
        link = db.query(TelegramLinkCode).filter(
            TelegramLinkCode.code.in_((code_digest, code)),
            TelegramLinkCode.used.is_(False),
            TelegramLinkCode.expires_at > now_ts,
        ).first()
        if not link:
            await message.answer(get_text(fallback_language(message), "invalid_link"))
            return

        language = normalize_language(link.language)

        account = db.query(User).filter(User.username == link.username).first()
        if not account or get_subscription_state(account, now_ts)["status"] == "expired":
            link.used = True
            db.commit()
            await message.answer(get_text(language, "invalid_link"))
            return

        chat_id = str(message.chat.id)
        occupied = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == chat_id,
            TelegramSubscription.username != link.username,
        ).first()
        if occupied:
            await message.answer(get_text(language, "chat_taken"))
            return

        # Claim the one-time code atomically before changing the subscription.
        # Concurrent /start requests can therefore never relink one account to
        # two different chats with the same token.
        claimed = db.query(TelegramLinkCode).filter(
            TelegramLinkCode.code == link.code,
            TelegramLinkCode.used.is_(False),
            TelegramLinkCode.expires_at > now_ts,
        ).update({TelegramLinkCode.used: True}, synchronize_session=False)
        if claimed != 1:
            db.rollback()
            await message.answer(get_text(language, "invalid_link"))
            return

        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.username == link.username,
        ).first()
        if subscription:
            subscription.chat_id = chat_id
            subscription.language = language
            subscription.updated_at = now_ts
        else:
            db.add(TelegramSubscription(
                username=link.username,
                chat_id=chat_id,
                language=language,
                linked_at=now_ts,
                updated_at=now_ts,
            ))
        db.commit()
        name = html.quote(message.from_user.first_name or "user")
        await message.answer(get_text(language, "linked", name=name))
    except Exception:
        db.rollback()
        logging.exception("Telegram account linking failed")
        await message.answer(get_text(fallback_language(message), "link_failed"))
    finally:
        db.close()


@dp.message(Command("status"))
async def status_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return
    db = SessionLocal()
    try:
        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == str(message.chat.id)
        ).first()
        if subscription:
            await message.answer(get_text(subscription.language, "status_active"))
        else:
            await message.answer(get_text(fallback_language(message), "status_inactive"))
    finally:
        db.close()


@dp.message(Command("unlink"))
async def unlink_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return
    db = SessionLocal()
    try:
        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == str(message.chat.id)
        ).first()
        if not subscription:
            await message.answer(get_text(fallback_language(message), "unlink_none"))
            return
        db.delete(subscription)
        db.commit()
        await message.answer(get_text(subscription.language, "unlinked"))
    finally:
        db.close()


@dp.message(Command("opportunities"))
async def opportunities_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return
    db = SessionLocal()
    try:
        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == str(message.chat.id)
        ).first()
        language = subscription.language if subscription else fallback_language(message)
        lines = [get_text(language, "opportunities_title")]
        sources = db.query(OfficialOpportunitySource).order_by(OfficialOpportunitySource.id.asc()).all()
        for source in sources:
            summary = getattr(source, f"summary_{language}", source.summary_en)
            lines.append(
                f"\n<b>{html.quote(source.name)}</b> ({html.quote(source.network)})\n"
                f"{html.quote(summary)}\n{source.official_url}"
            )
        await message.answer("\n".join(lines), disable_web_page_preview=True)
    finally:
        db.close()


@dp.message(Command("gas"))
async def gas_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return
    db = SessionLocal()
    try:
        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == str(message.chat.id)
        ).first()
        language = subscription.language if subscription else fallback_language(message)
        gas = get_live_gas_price("Base")
        level = classify_gas_level("Base", gas)
        level_key = f"gas_level_{level}"
        await message.answer(get_text(language, "gas_report", gas=html.quote(str(gas)), level=get_text(language, level_key)))
    finally:
        db.close()


@dp.message(Command("help"))
async def help_handler(message: Message) -> None:
    db = SessionLocal()
    try:
        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == str(message.chat.id)
        ).first()
        language = subscription.language if subscription else fallback_language(message)
        await message.answer(get_text(language, "help"))
    finally:
        db.close()


async def main() -> None:
    if not TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
    bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    asyncio.run(main())
