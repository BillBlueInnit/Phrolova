from __future__ import annotations

import math
import random
import string
import threading
import time
from copy import deepcopy
from typing import Any

from flask import request
from flask_socketio import SocketIO, emit, join_room as socket_join_room

from ..compare import all_match, build_compare_by_type, draw_target_by_type, lookup_guess_by_name
from ..players import apply_score, authenticate_player, ensure_stats_columns, record_match


class MultiplayerManager:
    best_of_default = 3
    resonator_attempts = 4
    skeleton_attempts = 8
    resonator_round_time = 90
    skeleton_round_time = 150
    enter_game_delay = 2
    next_round_delay = 5
    room_ttl_after_finish = 300

    def __init__(self, socketio: SocketIO):
        self.socketio = socketio
        self.rooms: dict[str, dict[str, Any]] = {}
        self.match_queue: list[dict[str, str]] = []
        self.player_to_room: dict[str, str] = {}
        self.sid_to_player: dict[str, str] = {}
        self.lock = threading.RLock()
        self.background_started = False

    def register_handlers(self):
        if not self.background_started:
            self.socketio.start_background_task(self._room_manager_loop)
            self.background_started = True

        @self.socketio.on("connect")
        def handle_connect(auth):
            payload = auth or {}
            player = authenticate_player(payload)
            if not player:
                return False
            player_id = player["player_id"]
            with self.lock:
                old_sid = next(
                    (sid for sid, pid in self.sid_to_player.items() if pid == player_id),
                    None,
                )
                if old_sid:
                    self.sid_to_player.pop(old_sid, None)
                self.sid_to_player[request.sid] = player_id
            socket_join_room(player_id)
            emit(
                "multi:authed",
                {
                    "playerId": player_id,
                    "message": "实时连接已建立",
                },
            )
            self._resume_existing_state(player_id)
            return True

        @self.socketio.on("disconnect")
        def handle_disconnect():
            with self.lock:
                self.sid_to_player.pop(request.sid, None)

        @self.socketio.on("multi:resume_room")
        def handle_resume_room():
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            self._resume_existing_state(player_id)

        @self.socketio.on("multi:create_room")
        def handle_create_room(payload):
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            quiz_type = payload.get("quizType", "resonator")
            best_of = payload.get("bestOf", self.best_of_default)
            difficulty = payload.get("difficulty", "hard")
            with self.lock:
                self._purge_finished_rooms_for(player_id)
                current_room = self._get_player_room(player_id)
                if current_room and current_room["status"] != "finished":
                    self._emit_room_state(current_room)
                    self._emit_to_player(
                        player_id,
                        "multi:room_created",
                        {"roomCode": current_room["code"], "message": "你已在房间中"},
                    )
                    return
                self._remove_from_queue(player_id)
                room = self._new_room(player_id, quiz_type, best_of, difficulty)
                self.player_to_room[player_id] = room["code"]
            self._emit_to_player(
                player_id,
                "multi:room_created",
                {
                    "roomCode": room["code"],
                    "quizType": room["quiz_type"],
                    "bestOf": room["best_of"],
                    "difficulty": room["difficulty"],
                },
            )
            self._emit_room_state(room)

        @self.socketio.on("multi:join_room")
        def handle_join_room(payload):
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            room_code = (payload.get("roomCode") or "").strip().upper()
            if not room_code:
                self._emit_error(player_id, "请输入房间号")
                return
            with self.lock:
                self._purge_finished_rooms_for(player_id)
                room = self.rooms.get(room_code)
                if not room:
                    self._emit_error(player_id, "房间不存在")
                    return
                if room["status"] != "waiting":
                    self._emit_error(player_id, "房间已开始或已结束")
                    return
                if any(slot["player_id"] == player_id for slot in room["players"]):
                    self._emit_room_state(room)
                    return
                if self._get_player_room(player_id):
                    self._emit_error(player_id, "你已在其他房间中")
                    return
                room["players"].append(self._new_slot(player_id))
                room["status"] = "countdown"
                room["countdown_end_at"] = time.time() + self.enter_game_delay
                room["updated_at"] = time.time()
                self.player_to_room[player_id] = room["code"]
            self._emit_to_player(player_id, "multi:room_joined", {"roomCode": room_code})
            self._emit_countdown_started(room)
            self._emit_room_state(room)

        @self.socketio.on("multi:queue_join")
        def handle_queue_join(payload):
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            quiz_type = payload.get("quizType", "resonator")
            difficulty = payload.get("difficulty", "hard")
            best_of = payload.get("bestOf", self.best_of_default)
            with self.lock:
                self._purge_finished_rooms_for(player_id)
                if self._get_player_room(player_id):
                    room = self._get_player_room(player_id)
                    if room:
                        self._emit_room_state(room)
                    return
                queued = any(item["player_id"] == player_id for item in self.match_queue)
                if queued:
                    self._emit_to_player(player_id, "multi:matching", {"message": "已在匹配队列中"})
                    return
                match_index = next(
                    (
                        index
                        for index, item in enumerate(self.match_queue)
                        if item["player_id"] != player_id
                        and item["quiz_type"] == quiz_type
                        and item["difficulty"] == difficulty
                        and item["best_of"] == best_of
                    ),
                    None,
                )
                if match_index is None:
                    self.match_queue.append(
                        {
                            "player_id": player_id,
                            "quiz_type": quiz_type,
                            "difficulty": difficulty,
                            "best_of": best_of,
                        }
                    )
                    self._emit_to_player(player_id, "multi:matching", {"message": "已进入匹配队列"})
                    return
                opponent = self.match_queue.pop(match_index)
                room = self._new_room(opponent["player_id"], quiz_type, best_of, difficulty)
                room["players"].append(self._new_slot(player_id))
                room["status"] = "countdown"
                room["countdown_end_at"] = time.time() + self.enter_game_delay
                room["updated_at"] = time.time()
                self.player_to_room[opponent["player_id"]] = room["code"]
                self.player_to_room[player_id] = room["code"]
            self._emit_countdown_started(room)
            self._emit_room_state(room)

        @self.socketio.on("multi:queue_cancel")
        def handle_queue_cancel():
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            with self.lock:
                removed = self._remove_from_queue(player_id)
            message = "已取消匹配" if removed else "当前不在匹配队列中"
            self._emit_to_player(player_id, "multi:matching", {"message": message, "inQueue": False})

        @self.socketio.on("multi:submit_guess")
        def handle_submit_guess(payload):
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            room_code = (payload.get("roomCode") or "").strip().upper()
            guess_name = (payload.get("guessName") or "").strip()
            if not room_code or not guess_name:
                self._emit_error(player_id, "提交参数不完整")
                return

            with self.lock:
                room = self.rooms.get(room_code)
                if not room:
                    self._emit_error(player_id, "房间不存在")
                    return
                if room["status"] != "playing" or room["round_status"] != "active":
                    self._emit_error(player_id, "当前回合不可提交猜测")
                    return
                player_index = self._player_index(room, player_id)
                if player_index < 0:
                    self._emit_error(player_id, "你不在该房间内")
                    return
                slot = room["players"][player_index]
                if slot["attempts"] >= self.max_attempts(room["quiz_type"]):
                    self._emit_error(player_id, "本局猜测次数已用尽")
                    return

            guess_row = lookup_guess_by_name(room["quiz_type"], guess_name)
            if not guess_row:
                self._emit_error(player_id, f"数据库中不存在名为「{guess_name}」的目标")
                return

            with self.lock:
                room = self.rooms.get(room_code)
                if not room or room["status"] != "playing" or room["round_status"] != "active":
                    self._emit_error(player_id, "当前回合不可提交猜测")
                    return
                player_index = self._player_index(room, player_id)
                if player_index < 0:
                    self._emit_error(player_id, "你不在该房间内")
                    return
                slot = room["players"][player_index]
                compare_result = build_compare_by_type(room["target"], guess_row, room["quiz_type"])
                slot["guesses"].append({"character": guess_row, "compare": compare_result})
                slot["attempts"] += 1
                room["updated_at"] = time.time()

                self._emit_to_player(
                    player_id,
                    "multi:guess_result",
                    {
                        "guess": guess_row,
                        "compare": compare_result,
                        "attemptsUsed": slot["attempts"],
                        "attemptsLeft": self.max_attempts(room["quiz_type"]) - slot["attempts"],
                    },
                )

                if all_match(compare_result):
                    self._finish_round(room, player_index)
                elif all(player["attempts"] >= self.max_attempts(room["quiz_type"]) for player in room["players"]):
                    self._finish_round(room, self._resolve_round(room))

            self._emit_room_state(room)

        @self.socketio.on("multi:leave_room")
        def handle_leave_room(payload):
            player_id = self._player_id_from_sid()
            if not player_id:
                return
            room_code = (payload.get("roomCode") or "").strip().upper()
            with self.lock:
                room = self.rooms.get(room_code)
                if not room:
                    self._emit_to_player(player_id, "multi:opponent_forfeit", {"message": "房间已不存在"})
                    return
                player_index = self._player_index(room, player_id)
                if player_index < 0:
                    self._emit_error(player_id, "你不在该房间内")
                    return
                if room["status"] == "waiting":
                    room["players"] = [slot for slot in room["players"] if slot["player_id"] != player_id]
                    self.player_to_room.pop(player_id, None)
                    self.rooms.pop(room["code"], None)
                    self._emit_to_player(player_id, "multi:match_finished", {"message": "已退出房间"})
                    return
                if room["status"] in ("countdown", "playing") and len(room["players"]) >= 2:
                    winner_index = 1 - player_index
                    self._finish_match_by_forfeit(room, winner_index, player_index)
                self.player_to_room.pop(player_id, None)
                room["updated_at"] = time.time()
            self._emit_room_state(room)

    def max_attempts(self, quiz_type: str) -> int:
        return self.skeleton_attempts if quiz_type == "skeleton" else self.resonator_attempts

    def round_time_limit(self, quiz_type: str) -> int:
        return self.skeleton_round_time if quiz_type == "skeleton" else self.resonator_round_time

    def multi_score(self, quiz_type: str, difficulty: str, best_of: int) -> int:
        if quiz_type != "skeleton":
            return {1: 10, 3: 30, 5: 50}.get(best_of, 30)
        if difficulty == "easy":
            return {1: 5, 3: 10, 5: 15}.get(best_of, 10)
        return {1: 30, 3: 50, 5: 70}.get(best_of, 50)

    def _player_id_from_sid(self) -> str | None:
        with self.lock:
            return self.sid_to_player.get(request.sid)

    def kick_player(self, player_id: str):
        with self.lock:
            sids = [sid for sid, pid in self.sid_to_player.items() if pid == player_id]
            for sid in sids:
                self.socketio.emit("multi:kicked", {"message": "账号在别处登录"}, to=sid)
                self.sid_to_player.pop(sid, None)

    def _emit_error(self, player_id: str, message: str):
        self._emit_to_player(player_id, "multi:error", {"message": message})

    def _emit_to_player(self, player_id: str, event: str, payload: dict[str, Any]):
        self.socketio.emit(event, payload, to=player_id)

    def _emit_to_room_players(self, room: dict[str, Any], event: str, payload: dict[str, Any]):
        for slot in room["players"]:
            self._emit_to_player(slot["player_id"], event, deepcopy(payload))

    def _new_slot(self, player_id: str):
        return {"player_id": player_id, "guesses": [], "attempts": 0, "round_wins": 0}

    def _gen_room_code(self) -> str:
        chars = string.ascii_uppercase + string.digits
        while True:
            code = "".join(random.choices(chars, k=6))
            if code not in self.rooms:
                return code

    def _new_room(self, player_id: str, quiz_type: str, best_of: int, difficulty: str):
        if best_of not in (1, 3, 5):
            best_of = self.best_of_default
        code = self._gen_room_code()
        room = {
            "code": code,
            "quiz_type": quiz_type,
            "best_of": best_of,
            "difficulty": difficulty,
            "status": "waiting",
            "players": [self._new_slot(player_id)],
            "round": 0,
            "round_status": "idle",
            "round_start": None,
            "round_resolved_at": None,
            "round_winner": None,
            "target": None,
            "overall_winner": None,
            "countdown_end_at": None,
            "created_at": time.time(),
            "updated_at": time.time(),
            "finished_at": None,
            "forfeit_by": None,
            "round_history": [],
        }
        self.rooms[code] = room
        return room

    def _player_index(self, room: dict[str, Any], player_id: str) -> int:
        for index, slot in enumerate(room["players"]):
            if slot["player_id"] == player_id:
                return index
        return -1

    def _get_player_room(self, player_id: str):
        code = self.player_to_room.get(player_id)
        if not code:
            return None
        return self.rooms.get(code)

    def _remove_from_queue(self, player_id: str) -> bool:
        before = len(self.match_queue)
        self.match_queue = [item for item in self.match_queue if item["player_id"] != player_id]
        return len(self.match_queue) != before

    def _purge_finished_rooms_for(self, player_id: str):
        code = self.player_to_room.get(player_id)
        if code:
            room = self.rooms.get(code)
            if room and room["status"] == "finished":
                self.player_to_room.pop(player_id, None)
                room["players"] = [slot for slot in room["players"] if slot["player_id"] != player_id]
                if len(room["players"]) < 2:
                    self.rooms.pop(code, None)

    def _cleanup_stale_rooms(self):
        now = time.time()
        stale_codes = [
            code
            for code, room in self.rooms.items()
            if room["status"] == "finished" and room["finished_at"] and now - room["finished_at"] > self.room_ttl_after_finish
        ]
        for code in stale_codes:
            room = self.rooms.pop(code, None)
            if not room:
                continue
            for slot in room["players"]:
                self.player_to_room.pop(slot["player_id"], None)

    def _round_time_left(self, room: dict[str, Any]) -> int:
        limit = self.round_time_limit(room["quiz_type"])
        if room["round_start"] is None:
            return limit
        elapsed = time.time() - room["round_start"]
        return max(0, int(limit - elapsed))

    def _countdown_left(self, room: dict[str, Any]) -> int:
        if not room["countdown_end_at"]:
            return 0
        return max(0, math.ceil(room["countdown_end_at"] - time.time()))

    def _start_round(self, room: dict[str, Any]):
        room["status"] = "playing"
        room["round"] += 1
        room["round_status"] = "active"
        room["round_winner"] = None
        room["round_start"] = time.time()
        room["round_resolved_at"] = None
        room["countdown_end_at"] = None
        room["target"] = draw_target_by_type(room["quiz_type"], room["difficulty"])
        room["updated_at"] = time.time()
        for slot in room["players"]:
            slot["guesses"] = []
            slot["attempts"] = 0
        self._emit_to_room_players(
            room,
            "multi:round_started",
            {
                "roomCode": room["code"],
                "round": room["round"],
                "quizType": room["quiz_type"],
                "difficulty": room["difficulty"],
                "timeLimit": self.round_time_limit(room["quiz_type"]),
            },
        )

    def _resolve_round(self, room: dict[str, Any]):
        for index, slot in enumerate(room["players"]):
            if slot["guesses"] and all_match(slot["guesses"][-1]["compare"]):
                return index
        return None

    def _finish_round(self, room: dict[str, Any], winner_index: int | None):
        room["round_status"] = "resolved"
        room["round_winner"] = winner_index
        room["round_resolved_at"] = time.time()
        room["updated_at"] = time.time()
        round_guesses = []
        for slot in room["players"]:
            round_guesses.append({
                "player_id": slot["player_id"],
                "guesses": [{"revealed": True, "guess": item["character"], "compare": item["compare"]} for item in slot["guesses"]],
            })
        room.setdefault("round_history", []).append({
            "round": room["round"],
            "target": room["target"],
            "players": round_guesses,
        })
        if winner_index is not None:
            room["players"][winner_index]["round_wins"] += 1

        best_of = room["best_of"]
        threshold = best_of // 2 + 1
        for index, slot in enumerate(room["players"]):
            if slot["round_wins"] >= threshold:
                room["status"] = "finished"
                room["overall_winner"] = index
                room["finished_at"] = time.time()
                score = self.multi_score(room["quiz_type"], room["difficulty"], best_of)
                winner_id = room["players"][index]["player_id"]
                loser_id = room["players"][1 - index]["player_id"]
                apply_score(winner_id, score)
                apply_score(loser_id, -score)
                record_match(winner_id, loser_id)
                self._emit_to_player(
                    winner_id,
                    "multi:match_finished",
                    {
                        "roomCode": room["code"],
                        "overallWinner": index,
                        "scoreDelta": score,
                        "target": room["target"],
                    },
                )
                self._emit_to_player(
                    loser_id,
                    "multi:match_finished",
                    {
                        "roomCode": room["code"],
                        "overallWinner": index,
                        "scoreDelta": -score,
                        "target": room["target"],
                    },
                )
                break
        self._emit_to_room_players(
            room,
            "multi:round_finished",
            {
                "roomCode": room["code"],
                "round": room["round"],
                "roundWinner": winner_index,
                "roundWins": [slot["round_wins"] for slot in room["players"]],
                "target": room["target"],
                "overallWinner": room["overall_winner"],
            },
        )

    def _finish_match_by_forfeit(self, room: dict[str, Any], winner_index: int, loser_index: int):
        room["status"] = "finished"
        room["round_status"] = "resolved"
        room["round_winner"] = winner_index
        room["overall_winner"] = winner_index
        room["round_resolved_at"] = time.time()
        room["finished_at"] = time.time()
        room["forfeit_by"] = room["players"][loser_index]["player_id"]
        room["players"][winner_index]["round_wins"] = max(
            room["players"][winner_index]["round_wins"],
            room["best_of"] // 2 + 1,
        )

        score = self.multi_score(room["quiz_type"], room["difficulty"], room["best_of"])
        winner_id = room["players"][winner_index]["player_id"]
        loser_id = room["players"][loser_index]["player_id"]
        apply_score(winner_id, score)
        apply_score(loser_id, -score)
        record_match(winner_id, loser_id)
        self._emit_to_player(
            winner_id,
            "multi:opponent_forfeit",
            {
                "message": "对手已退出，本场判定你获胜",
                "scoreDelta": score,
            },
        )
        self._emit_to_player(
            loser_id,
            "multi:match_finished",
            {
                "roomCode": room["code"],
                "overallWinner": winner_index,
                "scoreDelta": -score,
                "forfeit": True,
            },
        )

    def _build_room_view(self, room: dict[str, Any], viewer_index: int):
        mine = room["players"][viewer_index]
        opponent_index = 1 - viewer_index
        opponent = room["players"][opponent_index] if opponent_index < len(room["players"]) else None
        quiz_type = room["quiz_type"]
        masked_fields = (
            ["name", "skill_attribute", "set_name", "drop_location"]
            if quiz_type == "skeleton"
            else ["name", "attribute", "weapon", "birthplace"]
        )

        def reveal_rows(guesses):
            return [{"revealed": True, "guess": item["character"], "compare": item["compare"]} for item in guesses]

        def mask_rows(guesses):
            rows = []
            for item in guesses:
                masked = dict(item["character"])
                for field in masked_fields:
                    masked[field] = "***"
                rows.append({"revealed": False, "guess": masked, "compare": item["compare"]})
            return rows

        room_state = {
            "roomCode": room["code"],
            "quizType": room["quiz_type"],
            "difficulty": room["difficulty"],
            "bestOf": room["best_of"],
            "scoreDelta": self.multi_score(room["quiz_type"], room["difficulty"], room["best_of"]),
            "roomStatus": room["status"],
            "roundStatus": room["round_status"],
            "round": room["round"],
            "roundWinner": room["round_winner"],
            "roundWins": [slot["round_wins"] for slot in room["players"]],
            "timeLeft": self._round_time_left(room) if room["round_status"] == "active" else 0,
            "timeLimit": self.round_time_limit(room["quiz_type"]),
            "countdownLeft": self._countdown_left(room),
            "target": room["target"] if room["round_status"] == "resolved" or room["status"] == "finished" else None,
            "targetVersion": room["target"]["version"] if room["quiz_type"] != "skeleton" and room["target"] else None,
            "targetCost": room["target"]["cost"] if room["quiz_type"] == "skeleton" and room["target"] else None,
            "overallWinner": room["overall_winner"],
            "forfeitBy": room["forfeit_by"],
            "players": [
                {
                    "playerId": mine["player_id"],
                    "roundWins": mine["round_wins"],
                    "attemptsUsed": mine["attempts"],
                    "attemptsLimit": self.max_attempts(room["quiz_type"]),
                    "guesses": reveal_rows(mine["guesses"]),
                    "isMe": True,
                },
                {
                    "playerId": opponent["player_id"] if opponent else "",
                    "roundWins": opponent["round_wins"] if opponent else 0,
                    "attemptsUsed": opponent["attempts"] if opponent else 0,
                    "attemptsLimit": self.max_attempts(room["quiz_type"]),
                    "guesses": (
                        reveal_rows(opponent["guesses"]) if room["status"] == "finished"
                        else mask_rows(opponent["guesses"]) if opponent else []
                    ),
                    "isMe": False,
                },
            ],
            "opponentId": opponent["player_id"] if opponent else "",
            "roundHistory": room.get("round_history", []),
        }
        return room_state

    def _emit_room_state(self, room: dict[str, Any]):
        with self.lock:
            for index, slot in enumerate(room["players"]):
                payload = self._build_room_view(room, index)
                self._emit_to_player(slot["player_id"], "multi:room_state", payload)

    def _emit_countdown_started(self, room: dict[str, Any]):
        self._emit_to_room_players(
            room,
            "multi:countdown_started",
            {
                "roomCode": room["code"],
                "countdownLeft": self._countdown_left(room),
                "quizType": room["quiz_type"],
                "difficulty": room["difficulty"],
                "bestOf": room["best_of"],
            },
        )

    def _resume_existing_state(self, player_id: str):
        with self.lock:
            room = self._get_player_room(player_id)
            if room:
                self._emit_room_state(room)
                return
            queued = any(item["player_id"] == player_id for item in self.match_queue)
        if queued:
            self._emit_to_player(player_id, "multi:matching", {"message": "已在匹配队列中"})

    def _room_manager_loop(self):
        ensure_stats_columns()
        while True:
            with self.lock:
                for room in list(self.rooms.values()):
                    now = time.time()
                    if room["status"] == "countdown" and room["countdown_end_at"] and now >= room["countdown_end_at"]:
                        self._start_round(room)
                        self._emit_room_state(room)
                        continue
                    if room["status"] == "playing" and room["round_status"] == "active" and self._round_time_left(room) <= 0:
                        self._finish_round(room, self._resolve_round(room))
                        self._emit_room_state(room)
                        continue
                    if (
                        room["status"] == "playing"
                        and room["round_status"] == "resolved"
                        and room["round_resolved_at"]
                        and now - room["round_resolved_at"] >= self.next_round_delay
                    ):
                        self._start_round(room)
                        self._emit_room_state(room)
                self._cleanup_stale_rooms()
            self.socketio.sleep(1)
