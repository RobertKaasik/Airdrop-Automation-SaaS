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

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
dp = Dispatcher()


def get_start_code(message: Message) -> str:
    parts = (message.text or "").split(maxsplit=1)
    return parts[1].strip() if len(parts) == 2 else ""


async def private_chat_only(message: Message) -> bool:
    if message.chat.type == ChatType.PRIVATE:
        return True
    await message.answer("Для защиты данных подключение доступно только в личном чате с ботом.")
    return False


@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    if not await private_chat_only(message):
        return

    code = get_start_code(message)
    if not code:
        await message.answer(
            "Добро пожаловать в AIRDROP-X. Откройте раздел Telegram в настройках панели и используйте кнопку подключения.\n\n"
            "Команды: /status — состояние подключения, /unlink — отключить уведомления, /help — помощь."
        )
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
            await message.answer("Ссылка устарела или уже использована. Создайте новую ссылку в настройках панели.")
            return

        chat_id = str(message.chat.id)
        occupied = db.query(TelegramSubscription).filter(
            TelegramSubscription.chat_id == chat_id,
            TelegramSubscription.username != link.username,
        ).first()
        if occupied:
            await message.answer("Этот Telegram-чат уже подключён к другому аккаунту AIRDROP-X.")
            return

        subscription = db.query(TelegramSubscription).filter(
            TelegramSubscription.username == link.username,
        ).first()
        if subscription:
            subscription.chat_id = chat_id
            subscription.updated_at = now_ts
        else:
            db.add(TelegramSubscription(
                username=link.username,
                chat_id=chat_id,
                linked_at=now_ts,
                updated_at=now_ts,
            ))
        link.used = True
        db.commit()
        await message.answer(
            f"Готово, {html.bold(html.quote(message.from_user.first_name or 'пользователь'))}. "
            "Уведомления AIRDROP-X подключены к этому личному чату.\n\n"
            "Бот не запрашивает приватные ключи и не выполняет транзакции."
        )
    except Exception:
        db.rollback()
        logging.exception("Telegram account linking failed")
        await message.answer("Не удалось завершить подключение. Попробуйте создать новую ссылку в панели.")
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
            await message.answer("Уведомления AIRDROP-X подключены и активны. /unlink — отключить их.")
        else:
            await message.answer("Этот чат ещё не подключён. Откройте настройки AIRDROP-X и создайте ссылку подключения.")
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
            await message.answer("В этом чате нет активного подключения.")
            return
        db.delete(subscription)
        db.commit()
        await message.answer("Готово. Уведомления отключены. Повторно подключить их можно в настройках панели.")
    finally:
        db.close()


@dp.message(Command("help"))
async def help_handler(message: Message) -> None:
    await message.answer(
        "AIRDROP-X использует Telegram только для добровольно подключённых уведомлений.\n\n"
        "/status — состояние подключения\n/unlink — отключить уведомления"
    )


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
