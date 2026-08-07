"""Admin routes — authentication (captcha), rate limiting, data sync."""
from __future__ import annotations

import hashlib
import hmac
import threading
import time
import traceback
from collections import defaultdict, deque
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from phrolova_server.config import get_settings
from phrolova_server.db import get_connection
from phrolova_server.sync import (
    preview_all,
    preview_characters,
    preview_echoes,
    sync_all,
    sync_characters,
    sync_echoes,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

_sync_result: dict | None = None
_sync_lock = threading.Lock()

# Ring buffer for recent error logs (viewable from admin panel)
_logs: deque[dict] = deque(maxlen=50)


def _log(level: str, message: str):
    entry = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "level": level,
        "message": message,
    }
    _logs.append(entry)
    print(f"[admin] [{level}] {message}", flush=True)

# ── Rate limiting ──
_rate_window: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 5    # max requests
_RATE_WINDOW = 60  # seconds


def _check_rate(key: str) -> bool:
    now = time.time()
    window = _rate_window[key]
    window[:] = [t for t in window if t > now - _RATE_WINDOW]
    if len(window) >= _RATE_LIMIT:
        return False

    window.append(now)
    return True


# ── Stateless admin tokens (HMAC-signed, survives server restart) ──
_SESSION_TTL = 7200  # 2 hours


def _make_token(username: str) -> str:
    settings = get_settings()
    expiry = int(time.time() + _SESSION_TTL)
    payload = f"{username}:{expiry}"
    sig = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{sig}:{payload}"


def _verify_token(token: str) -> bool:
    if not token:
        return False
    try:
        sig, payload = token.split(":", 1)
        username, expiry_str = payload.split(":", 1)
        expiry = int(expiry_str)
        if time.time() > expiry:
            return False
        settings = get_settings()
        expected = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except (ValueError, IndexError):
        return False


def _require_admin():
    """Decorator-like guard — returns error response or None."""
    token = request.headers.get("X-Admin-Token", "")
    if not _verify_token(token):
        return jsonify({"status": "error", "message": "未授权，请先登录"}), 401
    return None


# ── Routes ──

@admin_bp.route("/login", methods=["POST"])
def admin_login():
    ip = request.remote_addr or "unknown"
    if not _check_rate(f"login:{ip}"):
        return jsonify({"status": "error", "message": "登录过于频繁，请稍后再试"}), 429

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "")

    settings = get_settings()
    if not hmac.compare_digest(username, settings.admin_user):
        return jsonify({"status": "error", "message": "账号或密码错误"}), 401
    if not hmac.compare_digest(password, settings.admin_password):
        return jsonify({"status": "error", "message": "账号或密码错误"}), 401

    token = _make_token(username)
    return jsonify({"status": "success", "token": token})


@admin_bp.route("/sync/preview", methods=["POST"])
def preview_sync():
    auth_err = _require_admin()
    if auth_err:
        return auth_err
    data = request.get_json(silent=True) or {}
    sync_type = (data.get("type") or "all").strip()
    try:
        if sync_type == "characters":
            result = {"characters": preview_characters()}
        elif sync_type == "echoes":
            result = {"echoes": preview_echoes()}
        else:
            result = preview_all()
        return jsonify({"status": "success", "result": result})
    except Exception as e:
        tb = traceback.format_exc()
        _log("ERROR", f"preview_sync({sync_type}): {e}\n{tb}")
        return jsonify({"status": "error", "message": f"{type(e).__name__}: {e}"}), 500


@admin_bp.route("/sync", methods=["POST"])
def trigger_sync():
    auth_err = _require_admin()
    if auth_err:
        return auth_err

    global _sync_result
    if _sync_lock.locked():
        return jsonify({"status": "busy", "message": "同步任务已在运行中"}), 409

    data = request.get_json(silent=True) or {}
    sync_type = (data.get("type") or "all").strip()
    entries = data.get("entries")  # Optional: [{name, fields?}, ...]

    def _run():
        global _sync_result
        try:
            _log("INFO", f"sync {sync_type} started (entries={bool(entries)})")
            if sync_type == "characters":
                _sync_result = {"characters": sync_characters(entries=entries)}
            elif sync_type == "echoes":
                _sync_result = {"echoes": sync_echoes(entries=entries)}
            else:
                _sync_result = sync_all(entries=entries)
            _log("INFO", f"sync {sync_type} completed")
        except Exception as e:
            tb = traceback.format_exc()
            _log("ERROR", f"sync {sync_type}: {e}\n{tb}")
            _sync_result = {"ok": False, "message": f"{type(e).__name__}: {e}"}

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return jsonify({"status": "started", "message": "同步任务已启动"})


@admin_bp.route("/logs", methods=["GET"])
def admin_logs():
    auth_err = _require_admin()
    if auth_err:
        return auth_err
    return jsonify({"status": "success", "logs": list(_logs)})


@admin_bp.route("/sync/status", methods=["GET"])
def sync_status():
    auth_err = _require_admin()
    if auth_err:
        return auth_err
    if _sync_lock.locked():
        return jsonify({"status": "running", "result": None})
    return jsonify({"status": "idle", "result": _sync_result})


@admin_bp.route("/data", methods=["GET"])
def admin_data():
    auth_err = _require_admin()
    if auth_err:
        return auth_err
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, attribute, star_rating, weapon, birthplace, version FROM characters ORDER BY name")
            chars = [{
                "name": r["name"], "attribute": r["attribute"], "star_rating": r["star_rating"],
                "weapon": r["weapon"], "birthplace": r["birthplace"], "version": float(r["version"]) if r["version"] is not None else None,
            } for r in cur.fetchall()]
            cur.execute("SELECT name, skill_attribute, cost, is_aberration, set_name, drop_location FROM sound_skeletons ORDER BY name")
            echoes = [{
                "name": r["name"], "skill_attribute": r["skill_attribute"], "cost": r["cost"],
                "is_aberration": r["is_aberration"], "set_name": r["set_name"], "drop_location": r["drop_location"],
            } for r in cur.fetchall()]
        return jsonify({"status": "success", "data": {"characters": chars, "echoes": echoes}})
    finally:
        conn.close()


@admin_bp.route("/update", methods=["POST"])
def admin_update():
    """Direct DB update for manual table edits — no remote fetch."""
    auth_err = _require_admin()
    if auth_err:
        return auth_err
    data = request.get_json(silent=True) or {}
    entries = data.get("entries") or []
    if not entries:
        return jsonify({"status": "error", "message": "无数据"}), 400

    conn = get_connection()
    updated = 0
    try:
        with conn.cursor() as cur:
            for entry in entries:
                name = entry.get("name", "").strip()
                overrides = entry.get("overwrites") or {}
                if not name or not overrides:
                    continue
                # Try characters table first
                cur.execute("SELECT 1 FROM characters WHERE name = %s", (name,))
                if cur.fetchone():
                    sets = []
                    vals = []
                    char_fields = {"attribute", "star_rating", "weapon", "birthplace", "version"}
                    for f, v in overrides.items():
                        if f in char_fields:
                            sets.append(f"`{f}` = %s")
                            vals.append(int(v) if f == "star_rating" else v)
                    if sets:
                        vals.append(name)
                        cur.execute(f"UPDATE characters SET {', '.join(sets)} WHERE name = %s", vals)
                        if cur.rowcount > 0:
                            updated += 1
                    continue
                # Try sound_skeletons table
                cur.execute("SELECT 1 FROM sound_skeletons WHERE name = %s", (name,))
                if cur.fetchone():
                    sets = []
                    vals = []
                    echo_fields = {"skill_attribute", "cost", "is_aberration", "set_name", "drop_location"}
                    for f, v in overrides.items():
                        if f in echo_fields:
                            sets.append(f"`{f}` = %s")
                            vals.append(int(v) if f == "cost" else v)
                    if sets:
                        vals.append(name)
                        cur.execute(f"UPDATE sound_skeletons SET {', '.join(sets)} WHERE name = %s", vals)
                        if cur.rowcount > 0:
                            updated += 1
            conn.commit()
    finally:
        conn.close()
    return jsonify({"status": "success", "updated": updated})


@admin_bp.route("/logout", methods=["POST"])
def admin_logout():
    return jsonify({"status": "success"})
