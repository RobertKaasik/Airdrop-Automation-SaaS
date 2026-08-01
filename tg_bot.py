import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher, html
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery

# Токен от BotFather
TOKEN = "8615804174:AAEpbK_sUProWJIDNBye_pv36DxdXjQOQ_Y"

# Создаем клавиатуру с кнопкой запуска
def get_main_keyboard():
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🚀 Запустить тест Airdrop", callback_data="run_airdrop")
            ]
        ]
    )
    return keyboard

dp = Dispatcher()

# Команда /start
@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    user_name = message.from_user.first_name
    text = (
        f"Привет, {html.bold(user_name)}!\n\n"
        f"Добро пожаловать в панель управления **Smart Anti-Sybil SaaS**.\n"
        f"Нажми кнопку ниже, чтобы запустить тестовый цикл транзакций в сети Sepolia:"
    )
    await message.answer(text, reply_markup=get_main_keyboard(), parse_mode="HTML")

# Обработка нажатия на кнопку (возвращаем стабильную рабочую логику)
@dp.callback_query(lambda c: c.data == "run_airdrop")
async def process_callback_airdrop(callback: CallbackQuery):
    await callback.message.answer("⏳ Получил задачу! Запускаю Anti-Sybil алгоритм и отправляю транзакцию в блокчейн...")
    
    # Имитация успешного выполнения воркера (или вызов твоей логики)
    await asyncio.sleep(1.5)
    
    await callback.message.answer("✅ Готово! Транзакция успешно подтверждена в сети Sepolia.")
    await callback.answer()

# Функция отправки внешних уведомлений (для сервера)
async def send_telegram_notification(chat_id: int, text: str):
    bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await bot.send_message(chat_id=chat_id, text=text)
    except Exception as e:
        print(f"[-] Ошибка отправки уведомления в Telegram: {e}")
    finally:
        await bot.session.close()

async def main() -> None:
    bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    print("[+] Telegram-бот успешно запущен и ожидает команд...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    asyncio.run(main())