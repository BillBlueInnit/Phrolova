from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..db import get_connection
from ..players import ensure_single_score_columns, ensure_stats_columns

leaderboard_bp = Blueprint("leaderboard", __name__)


def _resolve_score_column(mode: str, quiz_type: str) -> str:
    if mode == "single":
        return "single_resonator_score" if quiz_type == "resonator" else "single_skeleton_score"
    return "score"


@leaderboard_bp.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    mode = (request.args.get("mode") or "multi").strip()
    quiz_type = (request.args.get("type") or "resonator").strip()
    score_col = _resolve_score_column(mode, quiz_type)

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    try:
        page_size = min(int(request.args.get("page_size", 20)), 100)
    except ValueError:
        page_size = 20
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    offset = (page - 1) * page_size

    ensure_stats_columns()
    ensure_single_score_columns()

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM players")
            total = cursor.fetchone()["total"]
            total_pages = max((total + page_size - 1) // page_size, 1)

            cursor.execute(
                f"SELECT player_id, score, wins, matches, "
                f"single_resonator_score, single_skeleton_score "
                f"FROM players ORDER BY {score_col} DESC, player_id ASC LIMIT %s OFFSET %s",
                (page_size, offset),
            )
            top = cursor.fetchall()
            for idx, row in enumerate(top):
                row["rank"] = offset + idx + 1
                row["sort_score"] = int(row.get(score_col, 0))
                row["win_rate"] = round(row["wins"] * 100.0 / row["matches"], 1) if row["matches"] else 100.0

            my_info = None
            player_id = (request.args.get("player_id") or "").strip()
            if player_id:
                in_top = any(row["player_id"] == player_id for row in top)
                if in_top:
                    my_row = next(row for row in top if row["player_id"] == player_id)
                    my_info = {
                        "player_id": player_id,
                        "score": my_row["sort_score"],
                        "rank": my_row["rank"],
                        "in_top": True,
                    }
                else:
                    cursor.execute(
                        f"SELECT player_id, {score_col} AS score FROM players WHERE player_id = %s",
                        (player_id,),
                    )
                    my_row = cursor.fetchone()
                    if my_row and my_row["score"] is not None:
                        cursor.execute(
                            f"SELECT COUNT(*) AS c FROM players WHERE {score_col} > %s",
                            (my_row["score"],),
                        )
                        greater = cursor.fetchone()["c"]
                        cursor.execute(
                            f"SELECT COUNT(*) AS c FROM players WHERE {score_col} = %s AND player_id < %s",
                            (my_row["score"], player_id),
                        )
                        same_before = cursor.fetchone()["c"]
                        my_info = {
                            "player_id": player_id,
                            "score": my_row["score"],
                            "rank": greater + same_before + 1,
                            "in_top": False,
                        }
    finally:
        connection.close()
    return jsonify({
        "status": "success",
        "leaderboard": top,
        "my_info": my_info,
        "mode": mode,
        "type": quiz_type,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    })
