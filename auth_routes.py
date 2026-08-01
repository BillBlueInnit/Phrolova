# -*- coding: utf-8 -*-
"""角色猜谜游戏 - 账号/玩家/排行榜 路由模块"""

import random
import time
import threading
import io
import base64
import os
import secrets
from PIL import ImageFont
from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from core import (
    get_connection,
    get_player,
    create_player,
    set_player_secret,
    ensure_player,
    authenticate_player,
    ensure_secret_column,
    ensure_password_column,
    set_password,
)

auth_bp = Blueprint('auth_routes', __name__)

# ------------------------------------------------------------------
# 人机验证码（本地运行，自动生成 3数字+2字母 图片 + 干扰线条）
# ------------------------------------------------------------------
CAPTCHA_LOCK = threading.Lock()
CAPTCHAS = {}
CAPTCHA_TTL = 180

def _clean_captchas():
    now = time.time()
    expired = [k for k, v in CAPTCHAS.items() if v['expire'] < now]
    for k in expired:
        CAPTCHAS.pop(k, None)

def _gen_captcha_text():
    digits = ''.join(random.choices('0123456789', k=3))
    letters = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=2))
    chars = list(digits + letters)
    random.shuffle(chars)
    return ''.join(chars)

_FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
]

def _load_font(size):
    for path in _FONT_CANDIDATES:
        try:
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default()
    except Exception:
        return None

def _make_captcha_image(text):
    # 在函数内部导入 Pillow，避免模块加载时因缺少依赖而失败
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise RuntimeError("Pillow 未安装")
    width, height = 132, 46
    img = Image.new('RGB', (width, height), (22, 27, 47))
    draw = ImageDraw.Draw(img)
    font = _load_font(28)
    for _ in range(150):
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        c = random.randint(120, 255)
        draw.point((x, y), fill=(c, c, c))
    for _ in range(5):
        x1 = random.randint(-10, width)
        y1 = random.randint(0, height)
        x2 = random.randint(-10, width)
        y2 = random.randint(0, height)
        draw.line((x1, y1, x2, y2), fill=(random.randint(70, 190),
                                          random.randint(70, 190),
                                          random.randint(70, 190)), width=1)
    step = width // (len(text) + 1)
    for i, ch in enumerate(text):
        color = (random.randint(200, 255),
                 random.randint(180, 255),
                 random.randint(120, 220))
        x = step + i * step + random.randint(-3, 3)
        y = random.randint(6, 14)
        draw.text((x, y), ch, font=font, fill=color)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf.getvalue()

@auth_bp.route('/api/auth/captcha', methods=['GET'])
def auth_captcha():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return jsonify({'status': 'error', 'message': '验证码服务不可用（缺少 Pillow）'})
    text = _gen_captcha_text()
    captcha_id = secrets.token_hex(8)
    try:
        raw = _make_captcha_image(text)
    except RuntimeError as e:
        return jsonify({'status': 'error', 'message': str(e)})
    data_uri = 'data:image/png;base64,' + base64.b64encode(raw).decode('ascii')
    with CAPTCHA_LOCK:
        _clean_captchas()
        CAPTCHAS[captcha_id] = {'text': text, 'expire': time.time() + CAPTCHA_TTL}
    return jsonify({'status': 'success', 'captcha_id': captcha_id, 'image': data_uri})

def verify_captcha(captcha_id, user_input):
    if not captcha_id or not user_input:
        return False
    with CAPTCHA_LOCK:
        rec = CAPTCHAS.pop(captcha_id, None)
        if not rec or rec['expire'] < time.time():
            return False
        return secrets.compare_digest(rec['text'].upper(),
                                      user_input.strip().upper())

# ------------------------------------------------------------------
# 玩家 ID / 排行榜 接口
# ------------------------------------------------------------------
@auth_bp.route('/api/player/init', methods=['POST'])
def player_init():
    try:
        ensure_secret_column()
        ensure_password_column()
    except Exception:
        pass
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    p = ensure_player(pid)
    return jsonify({'status': 'success', 'player': p, 'token': p['secret']})

@auth_bp.route('/api/player/update_id', methods=['POST'])
def player_update_id():
    data = request.get_json() or {}
    old_id = (data.get('old_id') or '').strip()
    new_id = (data.get('new_id') or '').strip()
    if not old_id or not new_id:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    if len(new_id) > 64:
        return jsonify({'status': 'error', 'message': 'ID 过长'})
    if not authenticate_player({'player_id': old_id, 'token': data.get('token')}):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    other = get_player(new_id)
    if other and other['player_id'] != old_id:
        return jsonify({'status': 'error', 'message': '该玩家ID已被占用'})
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET player_id = %s WHERE player_id = %s",
                (new_id, old_id),
            )
        conn.commit()
    finally:
        conn.close()
    p = get_player(new_id)
    return jsonify({'status': 'success', 'player': p, 'token': p['secret']})

@auth_bp.route('/api/player/score', methods=['POST'])
def player_score():
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    p = get_player(pid)
    return jsonify({'status': 'success', 'player': p, 'delta': 0})

@auth_bp.route('/api/leaderboard')
def leaderboard():
    TOP_N = 40
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT player_id, score FROM players "
                "ORDER BY score DESC, player_id ASC LIMIT %s",
                (TOP_N,),
            )
            top = cursor.fetchall()
            my_info = None
            pid = (request.args.get('player_id') or '').strip()
            if pid:
                in_top = any(r['player_id'] == pid for r in top)
                if in_top:
                    my_info = {'player_id': pid, 'in_top': True}
                else:
                    cursor.execute("SELECT score FROM players WHERE player_id = %s", (pid,))
                    row = cursor.fetchone()
                    if row:
                        cursor.execute("SELECT COUNT(*) AS c FROM players WHERE score > %s", (row['score'],))
                        greater = cursor.fetchone()['c']
                        cursor.execute(
                            "SELECT COUNT(*) AS c FROM players WHERE score = %s AND player_id < %s",
                            (row['score'], pid),
                        )
                        same_before = cursor.fetchone()['c']
                        my_info = {
                            'player_id': pid,
                            'score': row['score'],
                            'rank': greater + same_before + 1,
                            'in_top': False,
                        }
    finally:
        conn.close()
    return jsonify({'status': 'success', 'leaderboard': top, 'my_info': my_info})

# ------------------------------------------------------------------
# 账号：注册 / 登录 / 退出
# ------------------------------------------------------------------
@auth_bp.route('/api/auth/register', methods=['POST'])
def auth_register():
    try:
        ensure_password_column()
    except Exception:
        pass
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')
    captcha_id = (data.get('captcha_id') or '').strip()
    captcha_text = (data.get('captcha_text') or '').strip()
    if not username:
        return jsonify({'status': 'error', 'message': '账号不能为空'})
    if len(username) > 64:
        return jsonify({'status': 'error', 'message': '账号过长（最多64字符）'})
    if len(password) < 6:
        return jsonify({'status': 'error', 'message': '密码至少 6 位'})
    if not verify_captcha(captcha_id, captcha_text):
        return jsonify({'status': 'error', 'message': '验证码错误或已过期'})
    if get_player(username):
        return jsonify({'status': 'error', 'message': '该账号已被注册'})
    p = create_player(username)
    set_password(username, password)
    p = get_player(username)
    return jsonify({'status': 'success', 'player': p, 'token': p['secret'],
                    'message': '注册成功，已自动登录'})

@auth_bp.route('/api/auth/login', methods=['POST'])
def auth_login():
    try:
        ensure_password_column()
    except Exception:
        pass
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')
    captcha_id = (data.get('captcha_id') or '').strip()
    captcha_text = (data.get('captcha_text') or '').strip()
    if not username or not password:
        return jsonify({'status': 'error', 'message': '请输入账号和密码'})
    if not verify_captcha(captcha_id, captcha_text):
        return jsonify({'status': 'error', 'message': '验证码错误或已过期'})
    p = get_player(username)
    if not p or not p.get('password'):
        return jsonify({'status': 'error', 'message': '账号不存在'})
    if not check_password_hash(p['password'], password):
        return jsonify({'status': 'error', 'message': '账号或密码错误'})
    if not p.get('secret'):
        p['secret'] = set_player_secret(username)
    return jsonify({'status': 'success', 'player': p, 'token': p['secret'],
                    'message': '登录成功'})

@auth_bp.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    return jsonify({'status': 'success', 'message': '已退出登录'})