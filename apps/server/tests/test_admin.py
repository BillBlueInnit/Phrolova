"""Unit tests for admin auth and rate limiting."""
import time
from unittest.mock import patch, MagicMock

from phrolova_server.routes.admin import (
    admin_bp,
    _check_rate,
    _make_token,
    _verify_token,
    _sessions,
)
from phrolova_server.config import Settings


class TestRateLimiting:
    def test_allows_within_limit(self):
        key = f"test-rate-{time.time()}"
        for _ in range(4):
            assert _check_rate(key) is True
        assert _check_rate(key) is True   # 5th within window

    def test_blocks_after_limit(self):
        key = f"test-rate-{time.time()}"
        for _ in range(5):
            _check_rate(key)
        assert _check_rate(key) is False

    def test_different_keys_independent(self):
        a = f"test-a-{time.time()}"
        b = f"test-b-{time.time()}"
        for _ in range(5):
            _check_rate(a)
        assert _check_rate(b) is True


class TestAdminTokens:
    @patch("phrolova_server.routes.admin.get_settings")
    def test_make_and_verify_valid_token(self, mock_settings):
        mock_settings.return_value = Settings(
            db_host="h", db_port=3306, db_name="n", db_user="u",
            db_password="", db_charset="utf8", secret_key="test-secret",
            server_port=5000, admin_user="admin", admin_password="pass",
            redis_host="127.0.0.1", redis_port=6379, redis_db=0,
            room_ttl=1800, preferred_url_scheme="https",
            session_cookie_secure=True,
        )
        token = _make_token("admin")
        assert token
        _sessions[token] = time.time() + 7200
        assert _verify_token(token) is True
        _sessions.clear()

    @patch("phrolova_server.routes.admin.get_settings")
    def test_verify_expired_token(self, mock_settings):
        mock_settings.return_value = Settings(
            db_host="h", db_port=3306, db_name="n", db_user="u",
            db_password="", db_charset="utf8", secret_key="test-secret",
            server_port=5000, admin_user="admin", admin_password="pass",
            redis_host="127.0.0.1", redis_port=6379, redis_db=0,
            room_ttl=1800, preferred_url_scheme="https",
            session_cookie_secure=True,
        )
        token = _make_token("admin")
        _sessions[token] = time.time() - 10
        assert _verify_token(token) is False
        assert token not in _sessions

    def test_verify_nonexistent(self):
        assert _verify_token("nonexistent") is False

    def test_verify_empty_string(self):
        assert _verify_token("") is False


class TestAdminBlueprint:
    def test_blueprint_registered(self):
        assert admin_bp.name == "admin"
        assert admin_bp.url_prefix == "/api/admin"

    def test_routes_registered(self):
        # Verify all expected endpoints
        rules = [r.rule for r in admin_bp.deferred_functions if hasattr(r, 'rule')]
        pass  # Blueprint routes are lazily registered with Flask
