"""Redis-backed room time-to-live tracking.

Each multiplayer room is stored in Redis with the key ``room:{code}`` and a
TTL of ``PHROLOVA_ROOM_TTL`` (default 1800s). Any in-room socket activity
(create / join / guess / heartbeat) refreshes the TTL, so rooms that stay
inactive for 30 minutes are automatically expired and cleaned up.

Redis is treated as optional: if it cannot be reached the manager falls back
to in-memory operation so the game keeps working without a Redis server.
"""
from __future__ import annotations

import time
from typing import Any

try:
    import redis
    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover - redis may be absent
    _REDIS_AVAILABLE = False
    redis = None  # type: ignore[assignment]

from ..config import get_settings

_redis: "redis.Redis | None" = None
_redis_ok = False


def get_redis() -> "redis.Redis | None":
    """Return a shared Redis client, or None if unavailable."""
    if not _REDIS_AVAILABLE:
        return None
    global _redis, _redis_ok
    if _redis_ok and _redis is not None:
        return _redis
    settings = get_settings()
    try:
        _redis = redis.Redis(  # type: ignore[union-attr]
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            decode_responses=True,
        )
        _redis.ping()  # type: ignore[union-attr]
        _redis_ok = True
    except Exception:  # pragma: no cover - depends on environment
        _redis = None
        _redis_ok = False
    return _redis


def room_key(code: str) -> str:
    return f"room:{code}"


def ttl_seconds() -> int:
    return get_settings().room_ttl


def set_room_ttl(code: str) -> bool:
    """SETEX the room key so it auto-expires after the TTL window."""
    r = get_redis()
    if r is None:
        return False
    try:
        r.setex(room_key(code), ttl_seconds(), "1")
        return True
    except Exception:
        return False


def refresh_room_ttl(code: str) -> bool:
    """EXPIRE the room key (resets the inactivity countdown)."""
    r = get_redis()
    if r is None:
        return False
    try:
        return bool(r.expire(room_key(code), ttl_seconds()))
    except Exception:
        return False


def delete_room_ttl(code: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(room_key(code))
    except Exception:
        pass


def expired_room_codes(known_codes: list[str]) -> list[str]:
    """Return the subset of room codes whose Redis TTL has lapsed."""
    r = get_redis()
    if r is None:
        return []
    expired: list[str] = []
    try:
        for code in known_codes:
            ttl = r.ttl(room_key(code))
            # ttl == -2 means the key does not exist (already expired/deleted).
            if ttl is not None and ttl < 0:
                expired.append(code)
    except Exception:
        pass
    return expired
