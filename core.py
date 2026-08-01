# -*- coding: utf-8 -*-
"""核心公共函数模块，供 app.py 和 auth_routes.py 等使用。"""
import secrets
import pymysql
from pymysql.cursors import DictCursor
from werkzeug.security import generate_password_hash
from config import DB_CONFIG

# ------------------------------------------------------------------
# 数据库连接
# ------------------------------------------------------------------
def get_connection():
    return pymysql.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=DB_CONFIG['database'],
        charset=DB_CONFIG['charset'],
        cursorclass=DictCursor,
    )

# ------------------------------------------------------------------
# 对比逻辑
# ------------------------------------------------------------------
def compare_field(target_val, guess_val, field_name):
    if target_val == guess_val:
        return 'match'
    if field_name == 'star_rating':
        return 'near'
    if field_name == 'version':
        if abs(float(target_val) - float(guess_val)) <= 0.25:
            return 'near'
        return 'different'
    return 'different'

def build_compare(target, guess):
    return {
        'attribute':   compare_field(target['attribute'],   guess['attribute'],   'attribute'),
        'star_rating': compare_field(target['star_rating'], guess['star_rating'], 'star_rating'),
        'weapon':      compare_field(target['weapon'],      guess['weapon'],      'weapon'),
        'birthplace':  compare_field(target['birthplace'],  guess['birthplace'],  'birthplace'),
        'version':     compare_field(target['version'],     guess['version'],     'version'),
    }

def all_match(compare):
    return all(v == 'match' for v in compare.values())

def match_count(compare):
    return sum(1 for v in compare.values() if v == 'match')

# ------------------------------------------------------------------
# 玩家 / 得分 相关
# ------------------------------------------------------------------
def generate_token():
    return secrets.token_hex(16)

SECRET_PREPARED = False
PASSWORD_PREPARED = False

def ensure_secret_column():
    global SECRET_PREPARED
    if SECRET_PREPARED:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE players ADD COLUMN secret VARCHAR(64) NOT NULL DEFAULT ''")
                conn.commit()
            except Exception:
                conn.rollback()
        SECRET_PREPARED = True
    finally:
        conn.close()

def ensure_password_column():
    global PASSWORD_PREPARED
    if PASSWORD_PREPARED:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE players ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT ''")
                conn.commit()
            except Exception:
                conn.rollback()
        PASSWORD_PREPARED = True
    finally:
        conn.close()

def get_player(player_id):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM players WHERE player_id = %s", (player_id,))
            row = cursor.fetchone()
    finally:
        conn.close()
    return row

def create_player(player_id):
    secret = generate_token()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO players (player_id, score, secret) VALUES (%s, 0, %s)",
                (player_id, secret),
            )
        conn.commit()
    finally:
        conn.close()
    return {'player_id': player_id, 'score': 0, 'secret': secret}

def set_player_secret(player_id):
    secret = generate_token()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE players SET secret = %s WHERE player_id = %s", (secret, player_id))
        conn.commit()
    finally:
        conn.close()
    return secret

def ensure_player(player_id):
    p = get_player(player_id)
    if not p:
        return create_player(player_id)
    if not p.get('secret'):
        p['secret'] = set_player_secret(player_id)
    return p

def apply_score(player_id, delta):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET score = score + %s WHERE player_id = %s",
                (delta, player_id),
            )
        conn.commit()
    finally:
        conn.close()

def authenticate_player(data_or_args):
    pid = (data_or_args.get('player_id') or '').strip()
    token = (data_or_args.get('token') or '').strip()
    if not pid or not token:
        return None
    p = get_player(pid)
    if not p or not p.get('secret'):
        return None
    if not secrets.compare_digest(p['secret'], token):
        return None
    return p

def set_password(player_id, password):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE players SET password = %s WHERE player_id = %s",
                           (generate_password_hash(password), player_id))
        conn.commit()
    finally:
        conn.close()