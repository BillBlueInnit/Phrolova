from __future__ import annotations

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from ..captcha import create_captcha, verify_captcha
from ..players import (
    authenticate_player,
    create_player,
    ensure_password_column,
    ensure_player,
    ensure_secret_column,
    ensure_stats_columns,
    get_player,
    kick_player_sockets,
    public_player,
    set_password,
    set_player_secret,
    update_player_id,
)

auth_bp = Blueprint("auth", __name__)


def _json_body():
    return request.get_json(silent=True) or {}


@auth_bp.route("/api/auth/captcha", methods=["GET"])
def auth_captcha():
    captcha = create_captcha()
    return jsonify({"status": "success", **captcha})


@auth_bp.route("/api/player/init", methods=["POST"])
def player_init():
    ensure_secret_column()
    ensure_password_column()
    ensure_stats_columns()
    data = _json_body()
    player_id = (data.get("player_id") or "").strip()
    if not player_id:
        return jsonify({"status": "error", "message": "缺少玩家ID"}), 400
    player = ensure_player(player_id)
    kick_player_sockets(player_id)
    return jsonify({"status": "success", "player": public_player(player), "token": player["secret"]})


@auth_bp.route("/api/player/update_id", methods=["POST"])
def player_update_id():
    data = _json_body()
    old_id = (data.get("old_id") or "").strip()
    new_id = (data.get("new_id") or "").strip()
    if not old_id or not new_id:
        return jsonify({"status": "error", "message": "参数不完整"}), 400
    if len(new_id) > 64:
        return jsonify({"status": "error", "message": "ID 过长"}), 400
    if not authenticate_player({"player_id": old_id, "token": data.get("token")}):
        return jsonify({"status": "error", "message": "身份校验失败"}), 403
    other = get_player(new_id)
    if other and other["player_id"] != old_id:
        return jsonify({"status": "error", "message": "该玩家ID已被占用"}), 409
    update_player_id(old_id, new_id)
    player = get_player(new_id)
    return jsonify({"status": "success", "player": public_player(player), "token": player["secret"]})


@auth_bp.route("/api/player/score", methods=["POST"])
def player_score():
    data = _json_body()
    player_id = (data.get("player_id") or "").strip()
    if not player_id:
        return jsonify({"status": "error", "message": "缺少玩家ID"}), 400
    player = get_player(player_id)
    return jsonify({"status": "success", "player": public_player(player), "delta": 0})


@auth_bp.route("/api/auth/register", methods=["POST"])
def auth_register():
    ensure_password_column()
    ensure_secret_column()
    ensure_stats_columns()
    data = _json_body()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    captcha_id = (data.get("captcha_id") or "").strip()
    captcha_text = (data.get("captcha_text") or "").strip()
    if not username:
        return jsonify({"status": "error", "message": "账号不能为空"}), 400
    if len(username) > 64:
        return jsonify({"status": "error", "message": "账号过长（最多64字符）"}), 400
    if len(password) < 6:
        return jsonify({"status": "error", "message": "密码至少 6 位"}), 400
    if not verify_captcha(captcha_id, captcha_text):
        return jsonify({"status": "error", "message": "验证码错误或已过期"}), 400
    if get_player(username):
        return jsonify({"status": "error", "message": "该账号已被注册"}), 409
    player = create_player(username)
    set_password(username, password)
    player = get_player(username)
    return jsonify(
        {
            "status": "success",
            "player": public_player(player),
            "token": player["secret"],
            "message": "注册成功，已自动登录",
        }
    )


@auth_bp.route("/api/auth/login", methods=["POST"])
def auth_login():
    ensure_password_column()
    ensure_secret_column()
    ensure_stats_columns()
    data = _json_body()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    captcha_id = (data.get("captcha_id") or "").strip()
    captcha_text = (data.get("captcha_text") or "").strip()
    if not username or not password:
        return jsonify({"status": "error", "message": "请输入账号和密码"}), 400
    if not verify_captcha(captcha_id, captcha_text):
        return jsonify({"status": "error", "message": "验证码错误或已过期"}), 400
    player = get_player(username)
    if not player or not player.get("password"):
        return jsonify({"status": "error", "message": "账号不存在"}), 404
    if not check_password_hash(player["password"], password):
        return jsonify({"status": "error", "message": "账号或密码错误"}), 401
    player["secret"] = set_player_secret(username)
    kick_player_sockets(username)
    return jsonify(
        {
            "status": "success",
            "player": public_player(player),
            "token": player["secret"],
            "message": "登录成功",
        }
    )


@auth_bp.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    return jsonify({"status": "success", "message": "已退出登录"})
