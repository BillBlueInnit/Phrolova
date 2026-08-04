from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..compare import (
    all_match,
    build_compare_by_type,
    draw_target_by_type,
    get_skeleton_names,
    lookup_guess_by_name,
)
from ..db import get_connection
from ..players import apply_single_score, authenticate_player, ensure_single_score_columns

game_bp = Blueprint("game", __name__)

_player_targets: dict[str, dict] = {}


def _json_body():
    return request.get_json(silent=True) or {}


@game_bp.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "success"})


@game_bp.route("/api/names", methods=["GET"])
def names():
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name, attribute, star_rating, weapon, birthplace, version FROM characters ORDER BY name"
            )
            rows = cursor.fetchall()
    finally:
        connection.close()
    return jsonify({"status": "success", "names": rows})


@game_bp.route("/api/skeleton_names", methods=["GET"])
def skeleton_names():
    return jsonify({"status": "success", "names": get_skeleton_names()})


@game_bp.route("/api/draw", methods=["GET", "POST"])
def draw():
    quiz_type = request.args.get("type", "resonator") if request.method == "GET" else "resonator"
    difficulty = request.args.get("difficulty", "normal") if request.method == "GET" else "normal"

    if request.method == "POST":
        data = _json_body()
        quiz_type = (data.get("type") or quiz_type).strip()
        difficulty = (data.get("difficulty") or difficulty).strip()
        player_id = (data.get("player_id") or "").strip()
        token = (data.get("token") or "").strip()
        player = authenticate_player({"player_id": player_id, "token": token}) if player_id else None

        row = draw_target_by_type(quiz_type, difficulty)
        if not row:
            return jsonify({"status": "error", "message": "数据库中没有目标数据"}), 404

        if player:
            _player_targets[player_id] = {"target": row, "quiz_type": quiz_type, "attempts": 0}

        return jsonify({"status": "success", "type": quiz_type, "character": row})

    row = draw_target_by_type(quiz_type, difficulty)
    if not row:
        return jsonify({"status": "error", "message": "数据库中没有目标数据"}), 404
    return jsonify({"status": "success", "type": quiz_type, "character": row})


@game_bp.route("/api/guess", methods=["POST"])
def guess():
    ensure_single_score_columns()
    data = _json_body()
    guess_name = (data.get("guess") or "").strip()
    player_id = (data.get("player_id") or "").strip()
    token = (data.get("token") or "").strip()

    if not guess_name:
        return jsonify({"status": "error", "message": "请输入名称"}), 400

    player = authenticate_player({"player_id": player_id, "token": token})

    if player:
        session = _player_targets.get(player_id)
        if not session or not session.get("target"):
            return jsonify({"status": "error", "message": "请先抽取目标再开始猜测"}), 400

        target = session["target"]
        quiz_type = session["quiz_type"]
        session["attempts"] += 1
        attempts = session["attempts"]

        guess_row = lookup_guess_by_name(quiz_type, guess_name)
        if not guess_row:
            return jsonify({"status": "error", "message": f"数据库中不存在名为「{guess_name}」的目标"}), 404

        compare_result = build_compare_by_type(target, guess_row, quiz_type)
        score = None
        if all_match(compare_result):
            score = apply_single_score(player_id, quiz_type, attempts)
            del _player_targets[player_id]

        limit = 4 if quiz_type == "resonator" else 8
        if attempts >= limit and not score:
            del _player_targets[player_id]

        return jsonify({
            "status": "success", "type": quiz_type,
            "guess": guess_row, "compare": compare_result,
            "score": score, "attempts": attempts, "limit": limit,
        })

    target = data.get("target")
    quiz_type = data.get("type", "resonator")
    if not target:
        return jsonify({"status": "error", "message": "缺少目标数据，请先抽取随机目标"}), 400

    guess_row = lookup_guess_by_name(quiz_type, guess_name)
    if not guess_row:
        return jsonify({"status": "error", "message": f"数据库中不存在名为「{guess_name}」的目标"}), 404

    compare_result = build_compare_by_type(target, guess_row, quiz_type)
    limit = 4 if quiz_type == "resonator" else 8
    return jsonify({
        "status": "success", "type": quiz_type,
        "guess": guess_row, "compare": compare_result,
        "score": None, "limit": limit,
    })
