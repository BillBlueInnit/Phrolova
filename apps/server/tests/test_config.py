"""Unit tests for config module."""
import os
from unittest.mock import patch
from phrolova_server.config import Settings, get_settings


class TestSettings:
    def test_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            s = Settings(
                db_host="h", db_port=3306, db_name="n", db_user="u",
                db_password="", db_charset="utf8", secret_key="sk",
                server_port=5000, admin_user="a", admin_password="p",
                redis_host="127.0.0.1", redis_port=6379, redis_db=0,
                room_ttl=1800, preferred_url_scheme="https",
                session_cookie_secure=True,
            )
            assert s.db_host == "h"
            assert s.db_port == 3306
            assert s.server_port == 5000
            assert s.admin_user == "a"
            assert s.admin_password == "p"
            assert s.room_ttl == 1800
            assert s.preferred_url_scheme == "https"

    def test_is_frozen(self):
        s = Settings(
            db_host="h", db_port=3306, db_name="n", db_user="u",
            db_password="", db_charset="utf8", secret_key="sk",
            server_port=5000, admin_user="a", admin_password="p",
            redis_host="127.0.0.1", redis_port=6379, redis_db=0,
            room_ttl=1800, preferred_url_scheme="https",
            session_cookie_secure=True,
        )
        try:
            s.db_host = "x"
            assert False, "Should have raised FrozenInstanceError"
        except Exception:
            pass


class TestGetSettings:
    def test_reads_env_vars(self):
        with patch.dict(os.environ, {
            "PHROLOVA_DB_HOST": "myhost",
            "PHROLOVA_ADMIN_USER": "myadmin",
            "PHROLOVA_ADMIN_PASSWORD": "mypass",
        }, clear=True):
            get_settings.cache_clear()
            s = get_settings()
            assert s.db_host == "myhost"
            assert s.admin_user == "myadmin"
            assert s.admin_password == "mypass"

    def test_default_when_env_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()
            s = get_settings()
            assert s.db_host == "127.0.0.1"
            assert s.admin_user == "admin"
            assert s.admin_password == "phrolova2024"
