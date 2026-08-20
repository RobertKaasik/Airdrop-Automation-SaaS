"""Build compact AIRDROP-X walkthrough GIFs used on the public landing page."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
W, H = 960, 540
BG = "#07060b"
PANEL = "#0f0c16"
PANEL_2 = "#15101f"
LINE = "#2b213b"
TEXT = "#f5f3f8"
MUTED = "#948da0"
PURPLE = "#a855f7"
PURPLE_2 = "#d8b4fe"
CYAN = "#67e8f9"
GREEN = "#4ade80"
YELLOW = "#facc15"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_SEMIBOLD = Path(r"C:\Windows\Fonts\seguisb.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_ZH_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_ZH_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")

LANG = "ru"
COPY = {
    "ru": {
        "connected": "ПОДКЛЮЧЕНО", "one_wallet": "ОДИН КОШЕЛЁК", "account": "Аккаунт", "looter": "Looter",
        "actions": "Центр действий", "wallets": "Кошельки", "networks": "Сети", "settings": "Настройки",
        "gas_title": "Газ и бюджет до подписи", "gas_subtitle": "Проверка стоимости и лимитов перед действием в кошельке",
        "network": "Сеть", "gas_level": "Уровень газа", "low_gas": "НИЗКИЙ · 0.02 Gwei", "daily_limit": "Дневной лимит",
        "monthly_limit": "Месячный лимит", "estimate": "ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА", "of_daily": "из дневного лимита",
        "check_ready": "Проверить готовность", "save_limits": "Сохранить лимиты",
        "wallet_title": "Кошельки и сетевой профиль", "wallet_subtitle": "Публичные адреса, имя и необязательный прокси — без передачи ключей",
        "main_wallet": "Основной кошелёк", "activity_wallet": "Base activity", "active": "АКТИВНЫЙ", "monitoring": "МОНИТОРИНГ",
        "connection_profile": "ПРОФИЛЬ ПОДКЛЮЧЕНИЯ", "italy_proxy": "Прокси Италия", "credentials_hidden": "SOCKS5 · учётные данные скрыты", "ready": "ГОТОВО",
        "checks_title": "Официальные проверки", "checks_subtitle": "Источники протоколов и результаты для сохранённого публичного адреса",
        "official_source": "Официальный источник", "verified": "ПРОВЕРЕНО", "no_drop": "НЕТ РАЗДАЧИ",
        "source_waiting": "Источник ожидает проверки", "waiting": "ОЖИДАНИЕ",
        "checks_note": "AIRDROP-X не заявляет награду без подтверждённого официального источника.",
        "telegram_title": "Telegram без лишнего шума", "telegram_subtitle": "Выберите события, которые действительно важны",
        "operation_confirm": "Подтверждение операции", "low_gas_event": "Низкий газ", "system_status": "Системные статусы",
        "operation_confirmed": "Операция подтверждена", "just_now": "только что", "received": "ПОЛУЧЕНО",
    },
    "en": {
        "connected": "CONNECTED", "one_wallet": "ONE WALLET", "account": "Account", "looter": "Looter",
        "actions": "Action center", "wallets": "Wallets", "networks": "Networks", "settings": "Settings",
        "gas_title": "Gas and budget before signing", "gas_subtitle": "Review costs and limits before opening your wallet",
        "network": "Network", "gas_level": "Gas level", "low_gas": "LOW · 0.02 Gwei", "daily_limit": "Daily limit",
        "monthly_limit": "Monthly limit", "estimate": "ESTIMATED COST", "of_daily": "of the daily limit",
        "check_ready": "Check readiness", "save_limits": "Save limits",
        "wallet_title": "Wallets and connection profile", "wallet_subtitle": "Public addresses, labels, and an optional proxy — no private keys",
        "main_wallet": "Main wallet", "activity_wallet": "Base activity", "active": "ACTIVE", "monitoring": "MONITORING",
        "connection_profile": "CONNECTION PROFILE", "italy_proxy": "Italy proxy", "credentials_hidden": "SOCKS5 · credentials hidden", "ready": "READY",
        "checks_title": "Official checks", "checks_subtitle": "Protocol sources and results for a saved public address",
        "official_source": "Official source", "verified": "VERIFIED", "no_drop": "NO DROP",
        "source_waiting": "Source awaiting review", "waiting": "PENDING",
        "checks_note": "AIRDROP-X never reports a reward without a confirmed official source.",
        "telegram_title": "Telegram without the noise", "telegram_subtitle": "Choose the events that actually matter",
        "operation_confirm": "Operation confirmation", "low_gas_event": "Low gas", "system_status": "System status",
        "operation_confirmed": "Operation confirmed", "just_now": "just now", "received": "RECEIVED",
    },
    "zh": {
        "connected": "已连接", "one_wallet": "单一钱包", "account": "账户", "looter": "检查器",
        "actions": "操作中心", "wallets": "钱包", "networks": "网络", "settings": "设置",
        "gas_title": "签名前的 Gas 与预算", "gas_subtitle": "打开钱包前检查费用和限额",
        "network": "网络", "gas_level": "Gas 水平", "low_gas": "低 · 0.02 Gwei", "daily_limit": "每日限额",
        "monthly_limit": "每月限额", "estimate": "预计费用", "of_daily": "占每日限额",
        "check_ready": "检查准备情况", "save_limits": "保存限额",
        "wallet_title": "钱包与连接配置", "wallet_subtitle": "公开地址、名称和可选代理——无需私钥",
        "main_wallet": "主钱包", "activity_wallet": "Base 活动", "active": "当前使用", "monitoring": "监控中",
        "connection_profile": "连接配置", "italy_proxy": "意大利代理", "credentials_hidden": "SOCKS5 · 凭据已隐藏", "ready": "就绪",
        "checks_title": "官方检查", "checks_subtitle": "已保存公开地址的协议来源与结果",
        "official_source": "官方来源", "verified": "已验证", "no_drop": "暂无空投",
        "source_waiting": "来源等待审核", "waiting": "等待中",
        "checks_note": "没有经过确认的官方来源，AIRDROP-X 不会显示奖励。",
        "telegram_title": "精简的 Telegram 通知", "telegram_subtitle": "只选择真正重要的事件",
        "operation_confirm": "操作确认", "low_gas_event": "低 Gas", "system_status": "系统状态",
        "operation_confirmed": "操作已确认", "just_now": "刚刚", "received": "已收到",
    },
}


def font(size: int, bold: bool = False, semibold: bool = False) -> ImageFont.FreeTypeFont:
    if LANG == "zh":
        path = FONT_ZH_BOLD if bold or semibold else FONT_ZH_REGULAR
    else:
        path = FONT_BOLD if bold else FONT_SEMIBOLD if semibold else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


F12 = font(12)
F13 = font(13)
F14 = font(14)
F15 = font(15, semibold=True)
F17 = font(17, semibold=True)
F20 = font(20, bold=True)
F24 = font(24, bold=True)
F30 = font(30, bold=True)


def tr(key: str) -> str:
    return COPY[LANG][key]


def configure_language(language: str) -> None:
    global LANG, F12, F13, F14, F15, F17, F20, F24, F30
    LANG = language
    F12 = font(12)
    F13 = font(13)
    F14 = font(14)
    F15 = font(15, semibold=True)
    F17 = font(17, semibold=True)
    F20 = font(20, bold=True)
    F24 = font(24, bold=True)
    F30 = font(30, bold=True)


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def pulse(frame: int, period: int = 28) -> float:
    return 0.5 + 0.5 * math.sin(frame / period * math.tau)


def cursor_position(frame: int, points: list[tuple[int, int, int]]) -> tuple[int, int]:
    """Interpolate a cursor through a short, readable UI walkthrough."""
    if frame <= points[0][0]:
        return points[0][1], points[0][2]
    for start, end in zip(points, points[1:]):
        if frame <= end[0]:
            progress = ease((frame - start[0]) / max(1, end[0] - start[0]))
            return (
                int(start[1] + (end[1] - start[1]) * progress),
                int(start[2] + (end[2] - start[2]) * progress),
            )
    return points[-1][1], points[-1][2]


def draw_cursor(draw: ImageDraw.ImageDraw, x: int, y: int, click: float = 0.0) -> None:
    """Draw a visible mouse pointer and an optional click ripple."""
    if click > 0:
        radius = int(10 + click * 13)
        shade = int(215 - click * 90)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=(190, 115, 255, shade), width=3)
    points = [(x, y), (x + 2, y + 25), (x + 8, y + 19), (x + 15, y + 31), (x + 21, y + 28), (x + 14, y + 17), (x + 25, y + 15)]
    draw.polygon(points, fill="#fbf9ff", outline="#08060c")


def base_frame(frame: int, title: str, subtitle: str, active: int) -> Image.Image:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    for y in range(H):
        tint = int(10 + 12 * y / H)
        draw.line((0, y, W, y), fill=(7 + tint // 4, 5 + tint // 6, 12 + tint // 2))
    for x in range(30, W, 42):
        for y in range(26, H, 42):
            alpha = 22 + int(18 * pulse(frame + x + y, 70))
            draw.ellipse((x, y, x + 1, y + 1), fill=(alpha, alpha - 8, alpha + 16))

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((600, -130, 1030, 300), fill=(110, 36, 190, 42))
    gd.ellipse((-150, 330, 350, 720), fill=(34, 211, 238, 22))
    image = Image.alpha_composite(image.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(55)))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((28, 24, 932, 516), radius=22, fill=PANEL, outline=LINE, width=1)
    draw.line((28, 74, 932, 74), fill=LINE, width=1)
    draw.ellipse((48, 45, 56, 53), fill="#ff6b6b")
    draw.ellipse((64, 45, 72, 53), fill="#ffd166")
    draw.ellipse((80, 45, 88, 53), fill="#57cc99")
    draw.text((105, 40), "AIRDROP—X / CONTROL CENTER", font=F12, fill=MUTED)
    draw.rounded_rectangle((790, 36, 907, 61), radius=12, fill="#171221", outline="#352847")
    draw.ellipse((806, 44, 814, 52), fill=GREEN)
    draw.text((823, 40), tr("connected"), font=F12, fill=TEXT)

    draw.rounded_rectangle((46, 94, 218, 495), radius=16, fill="#0b0910", outline=LINE)
    draw.rounded_rectangle((64, 112, 104, 152), radius=12, fill="#7c3aed")
    draw.text((75, 122), "AX", font=F14, fill="white")
    draw.text((116, 116), "AIRDROP—X", font=F15, fill=TEXT)
    draw.text((116, 136), tr("one_wallet"), font=F12, fill=MUTED)
    labels = [tr("account"), tr("looter"), tr("actions"), tr("wallets"), tr("networks"), tr("settings")]
    for index, label in enumerate(labels):
        y = 180 + index * 47
        selected = index == active
        if selected:
            draw.rounded_rectangle((60, y - 8, 204, y + 30), radius=10, fill="#21142e", outline="#6d3d91")
            draw.rounded_rectangle((60, y - 8, 64, y + 30), radius=2, fill=PURPLE)
        draw.text((78, y), label, font=F13, fill=TEXT if selected else MUTED)

    draw.text((248, 104), title, font=F24, fill=TEXT)
    draw.text((248, 137), subtitle, font=F13, fill=MUTED)
    return image


def label(draw: ImageDraw.ImageDraw, x: int, y: int, text: str) -> None:
    draw.text((x, y), text.upper(), font=F12, fill=MUTED)


def input_box(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], value: str, accent: bool = False) -> None:
    draw.rounded_rectangle(box, radius=10, fill="#09080c", outline=PURPLE if accent else LINE, width=1)
    draw.text((box[0] + 14, box[1] + 11), value, font=F14, fill=TEXT)


def button(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, glow_amount: float = 0) -> None:
    if glow_amount > 0:
        width = int(2 + glow_amount * 3)
        draw.rounded_rectangle(box, radius=11, fill="#f7f4fb", outline=(190, 123, 255), width=width)
    else:
        draw.rounded_rectangle(box, radius=11, fill="#f7f4fb")
    bounds = draw.textbbox((0, 0), text, font=F14)
    tx = box[0] + (box[2] - box[0] - (bounds[2] - bounds[0])) / 2
    ty = box[1] + (box[3] - box[1] - (bounds[3] - bounds[1])) / 2 - 2
    draw.text((tx, ty), text, font=F14, fill="#0d0912")


def make_gas_frame(frame: int) -> Image.Image:
    image = base_frame(frame, tr("gas_title"), tr("gas_subtitle"), 2)
    draw = ImageDraw.Draw(image)
    label(draw, 248, 179, tr("network"))
    input_box(draw, (248, 200, 520, 241), "Base (ETH)")
    label(draw, 544, 179, tr("gas_level"))
    draw.rounded_rectangle((544, 200, 906, 241), radius=10, fill="#09110d", outline="#1f5b38")
    dot = 5 + int(pulse(frame) * 3)
    draw.ellipse((563 - dot, 221 - dot, 563 + dot, 221 + dot), fill=GREEN)
    draw.text((580, 211), tr("low_gas"), font=F14, fill="#b8f7cc")
    label(draw, 248, 264, tr("daily_limit"))
    input_box(draw, (248, 285, 520, 329), "$10.00")
    label(draw, 544, 264, tr("monthly_limit"))
    input_box(draw, (544, 285, 906, 329), "$50.00")

    progress = ease((frame - 7) / 18)
    draw.rounded_rectangle((248, 351, 906, 412), radius=13, fill=PANEL_2, outline=LINE)
    draw.text((267, 364), tr("estimate"), font=F12, fill=MUTED)
    draw.text((267, 383), f"${1.27 * progress:.2f}", font=F20, fill=TEXT)
    draw.text((356, 387), tr("of_daily"), font=F13, fill=MUTED)
    draw.rounded_rectangle((248, 432, 514, 478), radius=11, fill="#10101a", outline="#604183")
    draw.text((267, 445), tr("check_ready"), font=F14, fill=PURPLE_2)
    button(draw, (530, 432, 906, 478), tr("save_limits"), pulse(frame, 32))
    cursor_x, cursor_y = cursor_position(frame, [(0, 420, 220), (12, 665, 220), (26, 380, 455), (38, 700, 455), (47, 700, 455)])
    click = max(0.0, 1.0 - abs(frame - 29) / 4) if frame < 35 else max(0.0, 1.0 - abs(frame - 41) / 4)
    draw_cursor(draw, cursor_x, cursor_y, click)
    return image


def make_wallet_frame(frame: int) -> Image.Image:
    image = base_frame(frame, tr("wallet_title"), tr("wallet_subtitle"), 3)
    draw = ImageDraw.Draw(image)
    slide = ease((frame - 4) / 14)
    cards = [
        (tr("main_wallet"), "0x5e53…fc66", tr("active"), GREEN),
        (tr("activity_wallet"), "0x7eA4…bd0d", tr("monitoring"), CYAN),
    ]
    for idx, (name, address, status, color) in enumerate(cards):
        y = 178 + idx * 91
        x = int(248 + (1 - slide) * (45 + idx * 25))
        draw.rounded_rectangle((x, y, 906, y + 72), radius=13, fill="#0a090e", outline=LINE)
        draw.rounded_rectangle((x + 15, y + 15, x + 55, y + 55), radius=12, fill="#1f1530")
        draw.text((x + 28, y + 25), str(idx + 1), font=F15, fill=PURPLE_2)
        draw.text((x + 68, y + 13), name, font=F15, fill=TEXT)
        draw.text((x + 68, y + 38), address, font=F13, fill=MUTED)
        draw.text((792, y + 25), status, font=F12, fill=color)

    reveal = ease((frame - 18) / 12)
    draw.rounded_rectangle((248, 371, 906, 472), radius=13, fill=PANEL_2, outline="#3b2a4f")
    draw.text((266, 387), tr("connection_profile"), font=F12, fill=MUTED)
    draw.text((266, 411), tr("italy_proxy"), font=F15, fill=TEXT)
    draw.text((266, 438), tr("credentials_hidden"), font=F13, fill=MUTED)
    check_x = int(770 + (1 - reveal) * 20)
    draw.rounded_rectangle((check_x, 398, 885, 445), radius=12, fill="#0b1b12", outline="#255b38")
    status = tr("ready")
    status_bounds = draw.textbbox((0, 0), status, font=F12)
    status_x = check_x + (885 - check_x - (status_bounds[2] - status_bounds[0])) / 2
    draw.text((status_x, 410), status, font=F12, fill=GREEN)
    cursor_x, cursor_y = cursor_position(frame, [(0, 478, 214), (15, 478, 305), (28, 610, 428), (40, 844, 421), (47, 844, 421)])
    click = max(0.0, 1.0 - abs(frame - 41) / 4)
    draw_cursor(draw, cursor_x, cursor_y, click)
    return image


def make_checks_frame(frame: int) -> Image.Image:
    image = base_frame(frame, tr("checks_title"), tr("checks_subtitle"), 1)
    draw = ImageDraw.Draw(image)
    scan = min(1.0, frame / 30)
    draw.rounded_rectangle((248, 178, 906, 220), radius=10, fill="#09080c", outline=LINE)
    draw.text((266, 190), "0x5e53…fc66", font=F14, fill=TEXT)
    draw.rounded_rectangle((724, 187, 889, 211), radius=10, fill="#21142e")
    draw.rounded_rectangle((724, 187, 724 + int(165 * scan), 211), radius=10, fill="#6d28d9")
    percent = f"{int(scan * 100)}%"
    percent_bounds = draw.textbbox((0, 0), percent, font=F12)
    percent_x = 724 + (165 - (percent_bounds[2] - percent_bounds[0])) / 2
    draw.text((percent_x, 188), percent, font=F12, fill="white")
    rows = [
        ("Base", tr("official_source"), tr("verified"), GREEN),
        ("Arbitrum", tr("official_source"), tr("no_drop"), MUTED),
        ("Optimism", tr("source_waiting"), tr("waiting"), YELLOW),
    ]
    for idx, (network, source, result, color) in enumerate(rows):
        y = 244 + idx * 69
        shown = ease((frame - (7 + idx * 6)) / 10)
        x = int(248 + (1 - shown) * 35)
        draw.rounded_rectangle((x, y, 906, y + 55), radius=12, fill="#0a090e", outline=LINE)
        draw.ellipse((x + 16, y + 16, x + 39, y + 39), fill="#2a1840")
        draw.text((x + 50, y + 8), network, font=F15, fill=TEXT)
        draw.text((x + 50, y + 30), source, font=F12, fill=MUTED)
        draw.text((779, y + 20), result, font=F12, fill=color)
    draw.text((248, 468), tr("checks_note"), font=F12, fill=PURPLE_2)
    cursor_x, cursor_y = cursor_position(frame, [(0, 430, 198), (13, 805, 199), (29, 850, 272), (40, 850, 341), (47, 850, 341)])
    draw_cursor(draw, cursor_x, cursor_y)
    return image


def make_telegram_frame(frame: int) -> Image.Image:
    image = base_frame(frame, tr("telegram_title"), tr("telegram_subtitle"), 5)
    draw = ImageDraw.Draw(image)
    events = [
        (tr("operation_confirm"), frame >= 11),
        (tr("low_gas_event"), frame >= 23),
        (tr("system_status"), False),
    ]
    for idx, (name, enabled) in enumerate(events):
        y = 178 + idx * 55
        draw.text((248, y + 9), name, font=F14, fill=TEXT)
        x = 843
        draw.rounded_rectangle((x, y + 5, 906, y + 35), radius=15, fill="#40205e" if enabled else "#17131e")
        knob_x = x + 45 if enabled else x + 17
        draw.ellipse((knob_x - 11, y + 9, knob_x + 11, y + 31), fill=PURPLE_2 if enabled else MUTED)

    pop = ease((frame - 28) / 10)
    notify_y = int(382 + (1 - pop) * 18)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((248, notify_y, 906, notify_y + 90), radius=16, fill=(126, 34, 206, 100))
    image = Image.alpha_composite(image, shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((248, notify_y, 906, notify_y + 90), radius=16, fill="#12101a", outline="#5e3a78")
    draw.rounded_rectangle((266, notify_y + 18, 316, notify_y + 68), radius=15, fill="#7141d7")
    draw.text((279, notify_y + 33), "AB", font=F14, fill="white")
    draw.text((334, notify_y + 16), tr("operation_confirmed"), font=F15, fill=TEXT)
    draw.text((334, notify_y + 43), f"Base · 0.0001 ETH · {tr('just_now')}", font=F13, fill=MUTED)
    draw.rounded_rectangle((772, notify_y + 26, 889, notify_y + 57), radius=15, fill="#0b1b12", outline="#255b38")
    draw.ellipse((783, notify_y + 36, 793, notify_y + 46), fill=GREEN)
    received = tr("received")
    received_bounds = draw.textbbox((0, 0), received, font=F12)
    received_x = 802 + (80 - (received_bounds[2] - received_bounds[0])) / 2
    draw.text((received_x, notify_y + 33), received, font=F12, fill=GREEN)
    cursor_x, cursor_y = cursor_position(frame, [(0, 780, 198), (9, 875, 198), (18, 875, 253), (27, 875, 253), (38, 640, 360), (47, 640, 360)])
    first_click = max(0.0, 1.0 - abs(frame - 10) / 4)
    second_click = max(0.0, 1.0 - abs(frame - 22) / 4)
    draw_cursor(draw, cursor_x, cursor_y, max(first_click, second_click))
    return image


def save_gif(name: str, maker, frames_count: int = 48) -> None:
    frames = [maker(index).convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for index in range(frames_count)]
    destination = ROOT / name
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=75,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"{destination.name}: {destination.stat().st_size // 1024} KiB")


def main() -> None:
    makers = {
        "gas": make_gas_frame,
        "wallets": make_wallet_frame,
        "checks": make_checks_frame,
        "telegram": make_telegram_frame,
    }
    for language in ("ru", "en", "zh"):
        configure_language(language)
        for name, maker in makers.items():
            save_gif(f"demo-{name}-{language}.gif", maker)


if __name__ == "__main__":
    main()
