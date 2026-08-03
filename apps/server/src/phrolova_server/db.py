from __future__ import annotations

import pymysql
from pymysql.cursors import DictCursor

from .config import get_settings


def get_connection():
    settings = get_settings()
    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset=settings.db_charset,
        use_unicode=True,
        cursorclass=DictCursor,
        autocommit=False,
    )
    with conn.cursor() as cursor:
        cursor.execute("SET NAMES utf8mb4")
    return conn
