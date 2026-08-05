from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    db_charset: str
    secret_key: str
    server_port: int
    admin_user: str
    admin_password: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        db_host=os.getenv("PHROLOVA_DB_HOST", "127.0.0.1"),
        db_port=int(os.getenv("PHROLOVA_DB_PORT", "3306")),
        db_name=os.getenv("PHROLOVA_DB_NAME", "phrolova_game"),
        db_user=os.getenv("PHROLOVA_DB_USER", "root"),
        db_password=os.getenv("PHROLOVA_DB_PASSWORD", ""),
        db_charset=os.getenv("PHROLOVA_DB_CHARSET", "utf8mb4"),
        secret_key=os.getenv("PHROLOVA_SECRET_KEY", "phrolova-dev-secret"),
        server_port=int(os.getenv("PHROLOVA_SERVER_PORT", "5000")),
        admin_user=os.getenv("PHROLOVA_ADMIN_USER", "admin"),
        admin_password=os.getenv("PHROLOVA_ADMIN_PASSWORD", "phrolova2024"),
    )
