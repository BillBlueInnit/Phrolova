# -*- coding: utf-8 -*-
"""
数据库连接配置
请根据你的 MySQL 环境修改以下参数
"""

import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', '123456'),
    'database': os.getenv('DB_NAME', 'phrolova_game'),
    'charset': 'utf8mb4',
}
