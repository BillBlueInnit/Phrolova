from __future__ import annotations

from flask import Flask, jsonify
from flask_socketio import SocketIO

from .config import get_settings
from .multiplayer import MultiplayerManager
from .players import ensure_password_column, ensure_secret_column, ensure_stats_columns
from .routes import auth_bp, game_bp, leaderboard_bp

socketio = SocketIO(cors_allowed_origins="*", async_mode="gevent", path="/socket.io")
multiplayer_manager = MultiplayerManager(socketio)


def create_app():
    settings = get_settings()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = settings.secret_key

    app.register_blueprint(auth_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(leaderboard_bp)

    @app.route("/", methods=["GET"])
    def root():
        return jsonify({"status": "success", "message": "Phrolova server running"})

    socketio.init_app(app)
    multiplayer_manager.register_handlers()

    ensure_secret_column()
    ensure_password_column()
    ensure_stats_columns()

    return app


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    socketio.run(app, host="0.0.0.0", port=settings.server_port)
