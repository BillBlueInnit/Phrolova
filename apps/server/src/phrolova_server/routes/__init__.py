from .auth import auth_bp
from .game import game_bp
from .leaderboard import leaderboard_bp
from .admin import admin_bp

__all__ = ["auth_bp", "game_bp", "leaderboard_bp", "admin_bp"]
