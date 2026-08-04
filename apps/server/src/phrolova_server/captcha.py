from __future__ import annotations

import base64
import io
import os
import random
import secrets
import threading
import time
from pathlib import Path

from PIL import ImageFont

CAPTCHA_TTL = 180
CAPTCHAS: dict[str, dict[str, float | str]] = {}
CAPTCHA_LOCK = threading.Lock()

_BASE_DIR = Path(__file__).resolve().parent
_BUNDLED_FONT = _BASE_DIR / "assets" / "fonts" / "arialbd.ttf"

_FONT_CANDIDATES = [
    str(_BUNDLED_FONT),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
]


def _clean_captchas():
    now = time.time()
    expired = [key for key, value in CAPTCHAS.items() if value["expire"] < now]
    for key in expired:
        CAPTCHAS.pop(key, None)


def _gen_captcha_text():
    digits = "".join(random.choices("0123456789", k=3))
    letters = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ", k=2))
    chars = list(digits + letters)
    random.shuffle(chars)
    return "".join(chars)


def _load_font(size: int):
    for path in _FONT_CANDIDATES:
        try:
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _make_captcha_image(text: str):
    from PIL import Image, ImageDraw

    width, height = 132, 46
    image = Image.new("RGB", (width, height), (22, 27, 47))
    draw = ImageDraw.Draw(image)
    font = _load_font(32)
    for _ in range(150):
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        color = random.randint(120, 255)
        draw.point((x, y), fill=(color, color, color))
    for _ in range(4):
        x1 = random.randint(-10, width)
        y1 = random.randint(0, height)
        x2 = random.randint(-10, width)
        y2 = random.randint(0, height)
        draw.line(
            (x1, y1, x2, y2),
            fill=(random.randint(70, 190), random.randint(70, 190), random.randint(70, 190)),
            width=1,
        )
    step = width // (len(text) + 1)
    for index, char in enumerate(text):
        color = (random.randint(200, 255), random.randint(180, 255), random.randint(120, 220))
        x = step + index * step + random.randint(-2, 2)
        y = random.randint(2, 10)
        draw.text((x, y), char, font=font, fill=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()


def create_captcha():
    text = _gen_captcha_text()
    captcha_id = secrets.token_hex(8)
    raw = _make_captcha_image(text)
    data_uri = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    with CAPTCHA_LOCK:
        _clean_captchas()
        CAPTCHAS[captcha_id] = {"text": text, "expire": time.time() + CAPTCHA_TTL}
    return {"captcha_id": captcha_id, "image": data_uri}


def verify_captcha(captcha_id: str, user_input: str) -> bool:
    if not captcha_id or not user_input:
        return False
    with CAPTCHA_LOCK:
        record = CAPTCHAS.pop(captcha_id, None)
        if not record or record["expire"] < time.time():
            return False
        return secrets.compare_digest(str(record["text"]).upper(), user_input.strip().upper())
