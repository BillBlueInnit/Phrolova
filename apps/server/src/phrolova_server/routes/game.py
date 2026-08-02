from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..compare import (
    build_compare_by_type,
    draw_target_by_type,
    get_skeleton_names,
    lookup_guess_by_name,
)
from ..db import get_connection

game_bp = Blueprint("game", __name__)


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
            cursor.execute("SELECT name, attribute, star_rating FROM characters ORDER BY name")
            rows = cursor.fetchall()
    finally:
        connection.close()
    return jsonify({"status": "success", "names": rows})


@game_bp.route("/api/skeleton_names", methods=["GET"])
def skeleton_names():
    return jsonify({"status": "success", "names": get_skeleton_names()})


@game_bp.route("/api/draw", methods=["GET"])
def draw():
    quiz_type = request.args.get("type", "resonator")
    difficulty = request.args.get("difficulty", "normal")
    row = draw_target_by_type(quiz_type, difficulty)
    if not row:
        return jsonify({"status": "error", "message": "数据库中没有目标数据"}), 404
    return jsonify({"status": "success", "type": quiz_type, "character": row})


@game_bp.route("/api/guess", methods=["POST"])
def guess():
    data = _json_body()
    target = data.get("target")
    guess_name = (data.get("guess") or "").strip()
    quiz_type = data.get("type", "resonator")
    if not target:
        return jsonify({"status": "error", "message": "缺少目标数据，请先抽取随机目标"}), 400
    if not guess_name:
        return jsonify({"status": "error", "message": "请输入名称"}), 400
    guess_row = lookup_guess_by_name(quiz_type, guess_name)
    if not guess_row:
        return jsonify({"status": "error", "message": f"数据库中不存在名为「{guess_name}」的目标"}), 404
    compare_result = build_compare_by_type(target, guess_row, quiz_type)
    return jsonify(
        {
            "status": "success",
            "type": quiz_type,
            "target": target,
            "guess": guess_row,
            "compare": compare_result,
        }
    )
