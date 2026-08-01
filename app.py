# -*- coding: utf-8 -*-
"""角色猜谜游戏 - Flask 核心模块（应用实例 + 单人模式路由）"""

import os
import secrets
from flask import Flask, jsonify, request, render_template, send_from_directory
from config import DB_CONFIG
from core import (
    get_connection, compare_field, build_compare, all_match, match_count,
    generate_token, ensure_secret_column, get_player, create_player,
    set_player_secret, ensure_player, apply_score, authenticate_player,
    ensure_password_column
)
from auth_routes import auth_bp
from multi import multi_bp

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

# ------------------------------------------------------------------
# 单人模式相关路由
# ------------------------------------------------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/draw')
def draw():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        return jsonify({'status': 'error', 'message': '数据库中没有角色数据'})
    return jsonify({'status': 'success', 'character': row})

@app.route('/api/names')
def names():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name, attribute, star_rating FROM characters ORDER BY name")
            rows = cursor.fetchall()
    finally:
        conn.close()
    return jsonify({'status': 'success', 'names': rows})

@app.route('/api/guess', methods=['POST'])
def guess():
    data = request.get_json()
    target = data.get('target')
    guess_name = (data.get('guess') or '').strip()
    if not target:
        return jsonify({'status': 'error', 'message': '缺少目标角色数据，请先抽取随机角色'})
    if not guess_name:
        return jsonify({'status': 'error', 'message': '请输入角色名'})
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters WHERE name = %s", (guess_name,))
            guess_char = cursor.fetchone()
    finally:
        conn.close()
    if not guess_char:
        return jsonify({'status': 'error', 'message': f'数据库中不存在名为「{guess_name}」的角色'})
    compare = build_compare(target, guess_char)
    return jsonify({
        'status': 'success',
        'target': target,
        'guess': guess_char,
        'compare': compare,
    })

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon'
    )

# ------------------------------------------------------------------
# 注册蓝图
# ------------------------------------------------------------------
app.register_blueprint(auth_bp)
app.register_blueprint(multi_bp)

# ------------------------------------------------------------------
# 主入口
# ------------------------------------------------------------------
if __name__ == '__main__':
    from multi import start_background_threads, WS_PORT
    try:
        start_background_threads()
        print(f'[startup] WebSocket 推送服务已启动于端口 {WS_PORT}')
    except Exception as e:
        print(f'[startup] WebSocket 服务启动失败：{e}')
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)