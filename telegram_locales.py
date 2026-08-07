TEXTS = {
    "ru": {
        "private_only": "Для защиты данных подключение доступно только в личном чате с ботом.",
        "welcome": "Добро пожаловать в AIRDROP-X. Откройте раздел Telegram в настройках панели и используйте кнопку подключения.\n\nКоманды: /status — состояние подключения, /unlink — отключить уведомления, /help — помощь.",
        "invalid_link": "Ссылка устарела или уже использована. Создайте новую ссылку в настройках панели.",
        "chat_taken": "Этот Telegram-чат уже подключён к другому аккаунту AIRDROP-X.",
        "linked": "Готово, <b>{name}</b>. Уведомления AIRDROP-X подключены к этому личному чату.\n\nБот не запрашивает приватные ключи и не выполняет транзакции.",
        "link_failed": "Не удалось завершить подключение. Попробуйте создать новую ссылку в панели.",
        "status_active": "Уведомления AIRDROP-X подключены и активны. /unlink — отключить их.",
        "status_inactive": "Этот чат ещё не подключён. Откройте настройки AIRDROP-X и создайте ссылку подключения.",
        "unlink_none": "В этом чате нет активного подключения.",
        "unlinked": "Готово. Уведомления отключены. Повторно подключить их можно в настройках панели.",
        "help": "AIRDROP-X использует Telegram только для добровольно подключённых уведомлений.\n\n/status — состояние подключения\n/unlink — отключить уведомления",
    },
    "en": {
        "private_only": "For data protection, connection is available only in a private chat with the bot.",
        "welcome": "Welcome to AIRDROP-X. Open the Telegram section in the panel settings and use the connection button.\n\nCommands: /status — connection status, /unlink — disable notifications, /help — help.",
        "invalid_link": "This link has expired or was already used. Create a new link in the panel settings.",
        "chat_taken": "This Telegram chat is already linked to a different AIRDROP-X account.",
        "linked": "Done, <b>{name}</b>. AIRDROP-X notifications are connected to this private chat.\n\nThe bot never requests private keys and does not execute transactions.",
        "link_failed": "The connection could not be completed. Create a new link in the panel and try again.",
        "status_active": "AIRDROP-X notifications are connected and active. Use /unlink to disable them.",
        "status_inactive": "This chat is not linked yet. Open AIRDROP-X settings and create a connection link.",
        "unlink_none": "There is no active connection in this chat.",
        "unlinked": "Done. Notifications are disabled. You can reconnect them in the panel settings.",
        "help": "AIRDROP-X uses Telegram only for opt-in notifications.\n\n/status — connection status\n/unlink — disable notifications",
    },
    "zh": {
        "private_only": "为保护数据，只能在与机器人的私人聊天中连接。",
        "welcome": "欢迎使用 AIRDROP-X。请在面板设置中打开 Telegram 部分并使用连接按钮。\n\n命令：/status — 连接状态，/unlink — 关闭通知，/help — 帮助。",
        "invalid_link": "链接已过期或已被使用。请在面板设置中创建新链接。",
        "chat_taken": "此 Telegram 聊天已连接到另一个 AIRDROP-X 账户。",
        "linked": "完成，<b>{name}</b>。AIRDROP-X 通知已连接到此私人聊天。\n\n机器人绝不会索取私钥，也不会执行交易。",
        "link_failed": "无法完成连接。请在面板中创建新链接后重试。",
        "status_active": "AIRDROP-X 通知已连接并处于活动状态。使用 /unlink 可关闭通知。",
        "status_inactive": "此聊天尚未连接。请打开 AIRDROP-X 设置并创建连接链接。",
        "unlink_none": "此聊天没有活动连接。",
        "unlinked": "完成。通知已关闭。你可以在面板设置中重新连接。",
        "help": "AIRDROP-X 只使用 Telegram 发送用户自愿启用的通知。\n\n/status — 连接状态\n/unlink — 关闭通知",
    },
}


def normalize_language(language: str | None) -> str:
    return language if language in TEXTS else "ru"


def get_text(language: str | None, key: str, **kwargs) -> str:
    return TEXTS[normalize_language(language)][key].format(**kwargs)
