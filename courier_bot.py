# -*- coding: utf-8 -*-
"""Курьерский бот: каждые 15 минут шлёт в Telegram погоду, примерную ставку и что надеть.

Запуск в GitHub Actions: секреты TG_TOKEN и TG_CHAT_ID.
Локально: python courier_bot.py --once [--dry]   (dry = напечатать сообщение, не слать)
          python courier_bot.py --setup          (узнать свой chat_id: отправь боту /start)
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

DEFAULT_CONFIG = {
    "city": "Новосибирск, Заельцовский район",
    "lat": 55.05,
    "lon": 82.92,
    "base_rate": 350,
    "timezone_note": "Asia/Novosibirsk",
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg.update(json.load(f))
    return cfg


# ---------------------------------------------------------------- weather

# WMO weather interpretation codes -> короткое русское описание
WMO = {
    0: "ясно", 1: "в основном ясно", 2: "переменная облачность", 3: "пасмурно",
    45: "туман", 48: "изморозь",
    51: "морось", 53: "морось", 55: "сильная морось",
    56: "ледяная морось", 57: "сильная ледяная морось",
    61: "небольшой дождь", 63: "дождь", 65: "сильный дождь",
    66: "ледяной дождь", 67: "сильный ледяной дождь",
    71: "небольшой снег", 73: "снег", 75: "сильный снег", 77: "снежные зёрна",
    80: "ливень", 81: "ливень", 82: "сильный ливень",
    85: "снежный ливень", 86: "сильный снежный ливень",
    95: "гроза", 96: "гроза с градом", 99: "сильная гроза с градом",
}


def http_get_json(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "courier-bot/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_weather(cfg):
    """Текущая погода + ближайший час прогноза с Open-Meteo (без ключа)."""
    params = urllib.parse.urlencode({
        "latitude": cfg["lat"],
        "longitude": cfg["lon"],
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
        "hourly": "precipitation_probability,apparent_temperature",
        "forecast_hours": 2,
        "timezone": "auto",
    })
    data = http_get_json(f"https://api.open-meteo.com/v1/forecast?{params}")
    cur = data["current"]
    hourly = data["hourly"]
    # ближайший час прогноза берём со сдвигом 1 (индекс 0 = текущий час)
    rain_prob = max(hourly["precipitation_probability"][:2])
    feels_next = hourly["apparent_temperature"][1]
    return {
        "temp": cur["temperature_2m"],
        "feels": cur["apparent_temperature"],
        "feels_next": feels_next,
        "wind": cur["wind_speed_10m"],
        "precip": cur["precipitation"],
        "code": cur["weather_code"],
        "desc": WMO.get(cur["weather_code"], "погода неизвестная"),
        "rain_prob": rain_prob,
    }


# ---------------------------------------------------------------- rate & clothes

def rate_advice(cfg, w):
    """Примерная ставка в час: базовая + множители за погоду и время."""
    base = cfg["base_rate"]
    mult = 1.0
    reasons = []
    code = w["code"]
    if code in (61, 63, 80, 81, 51, 53, 55, 56, 66):
        mult += 0.30; reasons.append("дождь +30%")
    elif code in (65, 82, 67, 95, 96, 99):
        mult += 0.45; reasons.append("сильный дождь/гроза +45%")
    if code in (71, 73, 75, 77, 85, 86):
        mult += 0.40; reasons.append("снег +40%")
    if w["feels"] <= -15:
        mult += 0.50; reasons.append("мороз ниже −15 +50%")
    elif w["feels"] <= -5:
        mult += 0.25; reasons.append("холод +25%")
    now = datetime.now()
    weekday = now.weekday()  # 0 = пн
    hour = now.hour
    if weekday >= 4 and hour >= 17:
        mult += 0.20; reasons.append("пятничный вечер/выходные +20%")
    elif hour >= 18 or hour <= 10:
        mult += 0.10; reasons.append("вечер/утро +10%")
    low = int(round(base * mult / 10) * 10)
    high = int(round(base * mult * 1.15 / 10) * 10)
    return base, low, high, reasons


def clothes_advice(w):
    tips = []
    feels = w["feels"]
    code = w["code"]
    rainy = code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99)
    snowy = code in (71, 73, 75, 77, 85, 86, 48)
    if feels <= -20:
        tips.append("🥶 Дичайший мороз: термобельё + флиска + зимняя куртка, две пары перчаток, балаклава, тёплые носки. Бери термос.")
    elif feels <= -10:
        tips.append("🧊 Мороз: термобельё или флиска под куртку, перчатки, шапка, шарф на лицо.")
    elif feels <= 0:
        tips.append("🧥 Холодно: тёплая куртка, шапка, перчатки — руки на руле мёрзнут первыми.")
    elif feels <= 8:
        tips.append("🎽 Прохладно: демисезонная куртка, под ней кофта.")
    elif feels <= 20:
        tips.append("👕 Нормально: кофта или худи, на жаре снимешь.")
    else:
        tips.append("🥵 Жарко: футболка, кепка/панама, бери воды — на солнышке на велосипеде/пешком духота.")
    if rainy:
        if w["rain_prob"] >= 60:
            tips.append("🌧 Вероятность дождя {}% — непромокаемая куртка и чехол на сумку обязательны.".format(w["rain_prob"]))
        else:
            tips.append("🌦 Может накрапывать — закинь дождевик, он лёгкий.")
        if code in (95, 96, 99):
            tips.append("⚡ Гроза: аккуратнее на дороге, прячься от открытых мест.")
    if snowy:
        tips.append("❄ Снег: непромокаемая обувь, чехол на рюкзак.")
    if w["wind"] >= 10:
        tips.append("💨 Ветер {} м/с — ветровка сверху, на скутере сдувает.".format(int(w["wind"])))
    if w["feels_next"] - w["feels"] <= -5:
        tips.append("📉 К следующему часу похолодает до {}° — одевайся с запасом.".format(int(w["feels_next"])))
    return tips


# ---------------------------------------------------------------- telegram

def tg_api(token, method, payload=None):
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def tg_send(token, chat_id, text):
    return tg_api(token, "sendMessage", {"chat_id": chat_id, "text": text})


def build_message(cfg, w):
    base, low, high, reasons = rate_advice(cfg, w)
    weather_icon = "☀️" if w["code"] == 0 else ("⛅" if w["code"] in (1, 2) else ("☁️" if w["code"] == 3 else "🌧"))
    lines = [
        f"{weather_icon} Погода — {cfg['city']}: {w['desc']}, {w['temp']:.0f}° (ощущается как {w['feels']:.0f}°)",
        f"💨 Ветер {w['wind']:.0f} м/с · 🌧 Шанс осадков ближайшие 2 ч: {w['rain_prob']}%",
        "",
        f"💰 Ставка сейчас ~{low}–{high} ₽/час (база {base} ₽)",
    ]
    if reasons:
        lines.append("   Накинуто: " + ", ".join(reasons))
    else:
        lines.append("   Накидки нет — обычный спрос.")
    lines.append("")
    lines.append("👔 Что надеть:")
    lines += ["  " + t for t in clothes_advice(w)]
    return "\n".join(lines)


# ---------------------------------------------------------------- modes

def run_setup(token):
    """Печатаем chat_id первого, кто напишет боту."""
    offset = 0
    print("Отправь боту /start в Telegram (10 минут на ожидание)...")
    deadline = time.time() + 600
    while time.time() < deadline:
        try:
            res = tg_api(token, "getUpdates",
                         {"offset": offset, "timeout": 25})
        except Exception as e:
            print("Ошибка сети:", e)
            time.sleep(5)
            continue
        for upd in res.get("result", []):
            offset = upd["update_id"] + 1
            msg = upd.get("message") or upd.get("edited_message")
            if not msg:
                continue
            chat_id = msg["chat"]["id"]
            name = msg["chat"].get("first_name") or msg["chat"].get("title") or ""
            print(f"\n✅ Твой chat_id: {chat_id} ({name})")
            print("Положи его в секрет репозитория TG_CHAT_ID.")
            return
    print("Сообщение от тебя так и не пришло — запусти ещё раз.")


def main():
    args = sys.argv[1:]
    token = os.environ.get("TG_TOKEN")
    chat_id = os.environ.get("TG_CHAT_ID")
    dry = "--dry" in args

    if "--setup" in args:
        if not token:
            token = input("Вставь токен бота от @BotFather: ").strip()
        run_setup(token)
        return

    cfg = load_config()
    w = get_weather(cfg)
    text = build_message(cfg, w)

    if dry:
        print(text)
        return

    if not token or not chat_id:
        print("Нет TG_TOKEN или TG_CHAT_ID в переменных окружения / секретах", file=sys.stderr)
        sys.exit(1)
    tg_send(token, chat_id, text)
    print("Отправлено.")


if __name__ == "__main__":
    main()
