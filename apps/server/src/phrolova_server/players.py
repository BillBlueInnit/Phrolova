from __future__ import annotations

import secrets
from threading import Lock

from werkzeug.security import generate_password_hash

from .db import get_connection

_secret_prepared = False
_password_prepared = False
_stats_prepared = False
_single_score_prepared = False
_prepare_lock = Lock()


def generate_token() -> str:
    return secrets.token_hex(16)


def single_score_column(quiz_type: str) -> str:
    return "single_resonator_score" if quiz_type == "resonator" else "single_skeleton_score"


def public_player(player: dict | None):
    if not player:
        return None
    return {
        "player_id": player["player_id"],
        "score": int(player.get("score", 0)),
        "wins": int(player.get("wins", 0)),
        "matches": int(player.get("matches", 0)),
        "single_resonator_score": int(player.get("single_resonator_score", 0)),
        "single_skeleton_score": int(player.get("single_skeleton_score", 0)),
    }


def ensure_secret_column():
    global _secret_prepared
    if _secret_prepared:
        return
    with _prepare_lock:
        if _secret_prepared:
            return
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                try:
                    cursor.execute("ALTER TABLE players ADD COLUMN secret VARCHAR(64) NOT NULL DEFAULT ''")
                    connection.commit()
                except Exception:
                    connection.rollback()
            _secret_prepared = True
        finally:
            connection.close()


def ensure_password_column():
    global _password_prepared
    if _password_prepared:
        return
    with _prepare_lock:
        if _password_prepared:
            return
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                try:
                    cursor.execute("ALTER TABLE players ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT ''")
                    connection.commit()
                except Exception:
                    connection.rollback()
            _password_prepared = True
        finally:
            connection.close()


def ensure_stats_columns():
    global _stats_prepared
    if _stats_prepared:
        return
    with _prepare_lock:
        if _stats_prepared:
            return
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                for ddl in (
                    "ALTER TABLE players ADD COLUMN wins INT NOT NULL DEFAULT 0",
                    "ALTER TABLE players ADD COLUMN matches INT NOT NULL DEFAULT 0",
                ):
                    try:
                        cursor.execute(ddl)
                    except Exception:
                        connection.rollback()
                connection.commit()
            _stats_prepared = True
        finally:
            connection.close()


def ensure_single_score_columns():
    global _single_score_prepared
    if _single_score_prepared:
        return
    with _prepare_lock:
        if _single_score_prepared:
            return
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                for ddl in (
                    "ALTER TABLE players ADD COLUMN single_resonator_score INT NOT NULL DEFAULT 0",
                    "ALTER TABLE players ADD COLUMN single_skeleton_score INT NOT NULL DEFAULT 0",
                ):
                    try:
                        cursor.execute(ddl)
                    except Exception:
                        connection.rollback()
                connection.commit()
            _single_score_prepared = True
        finally:
            connection.close()


def get_player(player_id: str):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM players WHERE player_id = %s", (player_id,))
            row = cursor.fetchone()
    finally:
        connection.close()
    return row


def create_player(player_id: str):
    secret = generate_token()
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO players (player_id, score, secret) VALUES (%s, 0, %s)",
                (player_id, secret),
            )
        connection.commit()
    finally:
        connection.close()
    return {"player_id": player_id, "score": 0, "secret": secret, "wins": 0, "matches": 0}


def set_player_secret(player_id: str):
    secret = generate_token()
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE players SET secret = %s WHERE player_id = %s", (secret, player_id))
        connection.commit()
    finally:
        connection.close()
    return secret


def ensure_player(player_id: str):
    player = get_player(player_id)
    if not player:
        return create_player(player_id)
    if not player.get("secret"):
        player["secret"] = set_player_secret(player_id)
    return player


def apply_score(player_id: str, delta: int):
    """Apply score delta. Score cannot go below 0."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET score = GREATEST(0, score + %s) WHERE player_id = %s",
                (delta, player_id),
            )
        connection.commit()
    finally:
        connection.close()


def apply_single_score(player_id: str, quiz_type: str, attempts: int):
    base = 100 if quiz_type == "resonator" else 150
    limit = 4 if quiz_type == "resonator" else 8
    bonus = max(0, limit - attempts) * 20
    delta = base + bonus
    column = single_score_column(quiz_type)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE players SET {column} = {column} + %s WHERE player_id = %s",
                (delta, player_id),
            )
        connection.commit()
    finally:
        connection.close()
    return delta


def record_match(winner_id: str, loser_id: str):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET matches = matches + 1, wins = wins + 1 WHERE player_id = %s",
                (winner_id,),
            )
            cursor.execute(
                "UPDATE players SET matches = matches + 1 WHERE player_id = %s",
                (loser_id,),
            )
        connection.commit()
    finally:
        connection.close()


def authenticate_player(data_or_args: dict):
    player_id = (data_or_args.get("player_id") or "").strip()
    token = (data_or_args.get("token") or "").strip()
    if not player_id or not token:
        return None
    player = get_player(player_id)
    if not player or not player.get("secret"):
        return None
    if not secrets.compare_digest(player["secret"], token):
        return None
    return player


def set_password(player_id: str, password: str):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET password = %s WHERE player_id = %s",
                (generate_password_hash(password), player_id),
            )
        connection.commit()
    finally:
        connection.close()


def update_player_id(old_id: str, new_id: str):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET player_id = %s WHERE player_id = %s",
                (new_id, old_id),
            )
        connection.commit()
    finally:
        connection.close()


_kick_sockets_hook = None


def set_kick_sockets_hook(hook):
    global _kick_sockets_hook
    _kick_sockets_hook = hook


def kick_player_sockets(player_id: str):
    if _kick_sockets_hook:
        _kick_sockets_hook(player_id)
