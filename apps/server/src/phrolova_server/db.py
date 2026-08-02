from __future__ import annotations

import pymysql
from pymysql.cursors import DictCursor

from .config import get_settings


def get_connection():
    settings = get_settings()
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset=settings.db_charset,
        cursorclass=DictCursor,
        autocommit=False,
    )
