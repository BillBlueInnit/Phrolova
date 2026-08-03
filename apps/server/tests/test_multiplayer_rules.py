from flask_socketio import SocketIO

from phrolova_server.multiplayer import MultiplayerManager


def build_manager():
    return MultiplayerManager(SocketIO(async_mode="threading"))


def test_multiplayer_score_table_matches_design():
    manager = build_manager()

    assert manager.multi_score("resonator", "hard", 1) == 10
    assert manager.multi_score("resonator", "hard", 3) == 30
    assert manager.multi_score("resonator", "hard", 5) == 50
    assert manager.multi_score("skeleton", "easy", 1) == 5
    assert manager.multi_score("skeleton", "easy", 3) == 10
    assert manager.multi_score("skeleton", "hard", 5) == 70


def test_attempt_and_timer_rules_match_existing_game():
    manager = build_manager()

    assert manager.max_attempts("resonator") == 4
    assert manager.max_attempts("skeleton") == 8
    assert manager.round_time_limit("resonator") == 90
    assert manager.round_time_limit("skeleton") == 150
