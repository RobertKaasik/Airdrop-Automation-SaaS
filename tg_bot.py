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

from server import SessionLocal, TelegramLinkCode, TelegramSubscription
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
        link = db.query(TelegramLinkCode).filter(
            TelegramLinkCode.code == code,
            TelegramLinkCode.used.is_(False),
            TelegramLinkCode.expires_at > now_ts,
        ).first()
        if not link:
            await message.answer(get_text(fallback_language(message), "invalid_link"))
            return

        language = normalize_language(link.language)

        chat_id = str(message.chat.id)
        occupied = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == chat_id,
            TelegramSubscription.username != link.username,
        ).first()
        if occupied:
            await message.answer(get_text(language, "chat_taken"))
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
        link.used = True
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
