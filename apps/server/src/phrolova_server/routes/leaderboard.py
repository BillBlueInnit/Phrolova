from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..db import get_connection
from ..players import ensure_stats_columns

leaderboard_bp = Blueprint("leaderboard", __name__)


@leaderboard_bp.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    top_n = 40
    ensure_stats_columns()
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT player_id, score, wins, matches FROM players "
                "ORDER BY score DESC, player_id ASC LIMIT %s",
                (top_n,),
            )
            top = cursor.fetchall()
            for row in top:
                row["win_rate"] = round(row["wins"] * 100.0 / row["matches"], 1) if row["matches"] else 100.0

            my_info = None
            player_id = (request.args.get("player_id") or "").strip()
            if player_id:
                in_top = any(row["player_id"] == player_id for row in top)
                if in_top:
                    my_info = {"player_id": player_id, "in_top": True}
                else:
                    cursor.execute("SELECT score, wins, matches FROM players WHERE player_id = %s", (player_id,))
                    row = cursor.fetchone()
                    if row:
                        cursor.execute("SELECT COUNT(*) AS c FROM players WHERE score > %s", (row["score"],))
                        greater = cursor.fetchone()["c"]
                        cursor.execute(
                            "SELECT COUNT(*) AS c FROM players WHERE score = %s AND player_id < %s",
                            (row["score"], player_id),
                        )
                        same_before = cursor.fetchone()["c"]
                        my_info = {
                            "player_id": player_id,
                            "score": row["score"],
                            "wins": row["wins"],
                            "matches": row["matches"],
                            "win_rate": round(row["wins"] * 100.0 / row["matches"], 1) if row["matches"] else 100.0,
                            "rank": greater + same_before + 1,
                            "in_top": False,
                        }
    finally:
        connection.close()
    return jsonify({"status": "success", "leaderboard": top, "my_info": my_info})
