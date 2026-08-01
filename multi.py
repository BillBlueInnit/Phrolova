# -*- coding: utf-8 -*-
"""
角色猜谜游戏 - 多人模式 模块

包含：
- 多人模式的全局内存状态（房间 / 匹配队列）
- 房间构建与回合推进逻辑
- WebSocket 实时推送（独立端口 5001）
- 后台房间管理器线程
- 所有 /api/multi/* HTTP 接口

依赖 core.py 提供的核心公共函数。
"""

import random
import string
import time
import threading
import secrets
import asyncio
import json

from flask import Blueprint, jsonify, request
import websockets
from websockets.asyncio.server import serve as ws_serve

# 从 core 导入公共函数，不再依赖 app
from core import (
    get_connection,
    build_compare,
    all_match,
    apply_score,
    authenticate_player,
    ensure_player,
)

multi_bp = Blueprint('multi_routes', __name__)


# ------------------------------------------------------------------
# 多人模式全局内存状态
# ------------------------------------------------------------------
ROOMS = {}                          # room_code -> room dict
MATCH_QUEUE = []                    # 随机匹配等待队列（存放 {player_id}）
ROOM_LOCK = threading.Lock()        # 保护上述状态
FORFEIT_NOTICES = {}                # winner_id -> 强制胜利通知（等待对方前端拉取）

BEST_OF = 3                         # 三局两胜
ROUND_TIME_LIMIT = 90               # 每局 1分30秒
MULTI_WIN = 30                      # 多人胜 +30
MULTI_LOSE = -30                    # 多人负 -30
MAX_ATTEMPTS = 4                    # 每局（双方）最多 4 次猜测
ENTER_GAME_DELAY = 2                # 匹配/加入成功后，双方统一等待 2 秒再进入对局（此时才开始计时）


def gen_room_code():
    """生成 6 位不重复房间号。"""
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=6))
        if code not in ROOMS:
            return code


# ------------------------------------------------------------------
# 多人模式：房间与游戏状态
# ------------------------------------------------------------------
def new_slot(player_id):
    return {
        'player_id': player_id,
        'guesses': [],      # [{character:{...}, compare:{...}}]
        'attempts': 0,
        'round_wins': 0,
    }


def new_room(player1):
    """创建一个新的房间并返回 code 与 room。"""
    code = gen_room_code()
    room = {
        'code': code,
        'best_of': BEST_OF,
        'status': 'waiting',                 # waiting / playing / finished
        'players': [new_slot(player1)],
        'round': 0,
        'round_status': 'idle',              # idle / active / finished
        'round_start': None,                 # 本局开始时间戳
        'round_resolved_at': None,           # 本局结算时间戳（用于延迟推进下一局）
        'round_winner': None,                # 0 / 1 / None
        'target': None,
        'overall_winner': None,
        'round_ready_at': None,              # 第一局计划开启时刻（匹配后延迟 ENTER_GAME_DELAY 秒）
    }
    ROOMS[code] = room
    return code, room


def add_player(room, player_id):
    """第二名玩家加入。

    不再立即开启第一局计时，而是把真正开局安排到 ENTER_GAME_DELAY 秒之后，
    与客户端「匹配/加入成功后统一等待 2 秒再进入对局」的节奏对齐，
    避免客户端进入对局时第一局计时已经空耗掉数秒。
    真正的第一局由后台房间管理器线程在 round_ready_at 到达时通过 start_round 开启。
    """
    room['players'].append(new_slot(player_id))
    room['status'] = 'playing'
    room['round_ready_at'] = time.time() + ENTER_GAME_DELAY


def draw_target():
    """随机抽一名角色作为本局目标。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        conn.close()
    return row


def start_round(room):
    """开始新的一个回合：抽目标、重置猜测、启动计时。"""
    room['round'] += 1
    room['round_status'] = 'active'
    room['round_winner'] = None
    room['round_start'] = time.time()
    room['round_resolved_at'] = None
    room['target'] = draw_target()
    for slot in room['players']:
        slot['guesses'] = []
        slot['attempts'] = 0


def round_time_left(room):
    """当前局剩余秒数。"""
    if room['round_start'] is None:
        return ROUND_TIME_LIMIT
    elapsed = time.time() - room['round_start']
    return max(0, int(ROUND_TIME_LIMIT - elapsed))


def player_index(room, player_id):
    for i, slot in enumerate(room['players']):
        if slot['player_id'] == player_id:
            return i
    return -1


def cleanup_stale_rooms():
    """清理已结束超过 5 分钟的房间，避免内存无限增长。"""
    now = time.time()
    stale = []
    for code, room in ROOMS.items():
        if room['status'] == 'finished' and room['round_start'] and (now - room['round_start']) > 300:
            stale.append(code)
    for code in stale:
        ROOMS.pop(code, None)


def purge_finished_rooms_for(player_id):
    """将玩家从所有已结束的房间中移除，并清理空/未满的房间。
    用于解决「对抗结束后再次创建房间提示已在房间内」的问题。"""
    to_delete = []
    for code, room in list(ROOMS.items()):
        if room['status'] == 'finished':
            room['players'] = [p for p in room['players'] if p['player_id'] != player_id]
            # 已结束的房间一旦有玩家离开，剩下人数 < 2 就没有保留价值，直接删除
            if len(room['players']) < 2:
                to_delete.append(code)
    for code in to_delete:
        ROOMS.pop(code, None)


def resolve_round(room):
    """超时/耗尽猜测时，只有完全猜中(所有字段匹配)的玩家获胜；否则（含双方都没猜对）判平局返回 None。"""
    for i, slot in enumerate(room['players']):
        if slot['guesses'] and all_match(slot['guesses'][-1]['compare']):
            return i
    return None


def finish_round(room, winner_index):
    """结束当前局。winner_index 为 0/1/None(平局)。
    仅在某方达到两胜、整场结束时一次性结算整场比分（胜 +30 / 负 -30）。"""
    room['round_status'] = 'finished'
    room['round_winner'] = winner_index
    room['round_resolved_at'] = time.time()
    if winner_index is not None:
        room['players'][winner_index]['round_wins'] += 1

    for idx, slot in enumerate(room['players']):
        if slot['round_wins'] >= (BEST_OF // 2 + 1):
            room['status'] = 'finished'
            room['overall_winner'] = idx
            # 整场结算：胜者 +30，负者 -30
            apply_score(room['players'][idx]['player_id'], MULTI_WIN)
            apply_score(room['players'][1 - idx]['player_id'], MULTI_LOSE)
            return


def build_room_view(room, viewer_idx):
    """返回给 viewer 的房间视图：自己完整、对手打码但保留背景颜色。"""
    mine = room['players'][viewer_idx]
    opponent_idx = 1 - viewer_idx
    has_opponent = opponent_idx < len(room['players'])
    opponent = room['players'][opponent_idx] if has_opponent else None
    target = room['target']
    target = target if (room['round_status'] == 'finished' or room['status'] == 'finished') else None

    def reveal_rows(guesses):
        return [
            {'revealed': True, 'guess': g['character'], 'compare': g['compare']}
            for g in guesses
        ]

    def mask_rows(guesses):
        return [
            {
                'revealed': False,
                'guess': {
                    'name': '***',
                    'attribute': '***',
                    'star_rating': '***',
                    'weapon': '***',
                    'birthplace': '***',
                    'version': '***',
                },
                'compare': g['compare'],
            }
            for g in guesses
        ]

    return {
        'room_code': room['code'],
        'best_of': room['best_of'],
        'room_status': room['status'],
        'round_status': room['round_status'],
        'round': room['round'],
        'round_winner': room['round_winner'],
        'round_wins': [slot['round_wins'] for slot in room['players']],
        'time_left': round_time_left(room),
        'time_limit': ROUND_TIME_LIMIT,
        'round_start': room['round_start'],
        'target': target,
        'target_version': room['target']['version'] if room['target'] else None,
        'overall_winner': room['overall_winner'],
        'players': [
            {
                'player_id': mine['player_id'],
                'round_wins': mine['round_wins'],
                'guesses': reveal_rows(mine['guesses']),
                'is_me': True,
            },
            {
                'player_id': opponent['player_id'] if opponent else '',
                'round_wins': opponent['round_wins'] if opponent else 0,
                'guesses': mask_rows(opponent['guesses']) if opponent else [],
                'is_me': False,
            },
        ],
        'opponent_id': opponent['player_id'] if opponent else '',
    }


# ------------------------------------------------------------------
# WebSocket 实时推送（多人模式）
# 架构说明：
# - 每个已鉴权的设备在 /ws 建立一个长连接，服务器据此把房间状态变化
#   （开局、出牌、超时、弃权等）毫秒级推送给双方，取代原先的秒级 HTTP 轮询。
# - 所有 HTTP 接口仍是权威状态来源；WebSocket 只负责「通知」。
# - 后台房间管理器（ROOM_MANAGER_THREAD）每秒扫描一次，主动结算超时、
#   推进下一局并推送，使对局完全由服务器驱动、客户端被动渲染。
# ------------------------------------------------------------------
WS_PORT = 5001               # WebSocket 服务端口（与主服务分离）
CLIENT_CONNS = {}            # player_id -> 该玩家的 WebSocket 连接（运行在 WS 专属线程）
WS_LOOP = None               # WS 专属事件循环句柄（供其他线程向它投递发送任务）

WS_LOCK = threading.Lock()   # 保护 CLIENT_CONNS 的跨线程读写
ws_send_pool = []            # 简单任务队列： (player_id, payload) 由 ws 线程批量发送
WS_POOL_LOCK = threading.Lock()


def ws_push_to_loop(player_id, payload):
    """把要向某玩家推送的消息投递到 WS 线程的执行队列，线程安全。"""
    with WS_POOL_LOCK:
        ws_send_pool.append((player_id, payload))


async def _ws_flush():
    """在 WS 事件循环内批量发送队列中的消息。"""
    while True:
        tasks = []
        with WS_POOL_LOCK:
            if ws_send_pool:
                tasks = ws_send_pool[:]
                ws_send_pool.clear()
        for player_id, payload in tasks:
            conn = CLIENT_CONNS.get(player_id)
            if conn is None:
                continue
            try:
                await conn.send(json.dumps(payload, ensure_ascii=False))
            except Exception:
                with WS_LOCK:
                    if CLIENT_CONNS.get(player_id) is conn:
                        CLIENT_CONNS.pop(player_id, None)
        # 每次发送后稍微让步，避免空转占用过多 CPU
        await asyncio.sleep(0.01)


def ws_send(player_id, payload):
    """向指定玩家推送一条 JSON 消息（跨线程安全）。"""
    if not player_id:
        return
    ws_push_to_loop(player_id, payload)


def notify_room_players(room, event='room_updated'):
    """把当前房间视图推送给该房间内所有玩家。"""
    for i, slot in enumerate(room.get('players', [])):
        view = build_room_view(room, i)
        view['player_index'] = i
        view['type'] = event
        ws_send(slot['player_id'], view)


async def _ws_handler(ws):
    """单个 WebSocket 连接的会话逻辑：先鉴权，再保持连接接收心跳。"""
    player_id = None
    try:
        async for raw in ws:
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            mtype = msg.get('type')
            if mtype == 'auth' and player_id is None:
                p = authenticate_player({
                    'player_id': (msg.get('player_id') or '').strip(),
                    'token': (msg.get('token') or '').strip(),
                })
                if p is not None:
                    player_id = p['player_id']
                    with WS_LOCK:
                        CLIENT_CONNS[player_id] = ws
                    try:
                        await ws.send(json.dumps({'type': 'auth_ack'}))
                    except Exception:
                        pass
                    # 连接建立后，若玩家已在某个对局中，立即推送当前房间状态，
                    # 让刷新/重连的玩家能无缝回到对局。
                    with ROOM_LOCK:
                        for room in ROOMS.values():
                            if any(s['player_id'] == player_id for s in room['players']):
                                if room['status'] in ('playing', 'finished'):
                                    notify_room_players(room, 'room_updated')
                    # 若正在随机匹配排队中，也回一个排队状态，以便 UI 恢复
                    with ROOM_LOCK:
                        if any(q.get('player_id') == player_id for q in MATCH_QUEUE):
                            ws_send(player_id, {'type': 'matching'})
            elif mtype == 'ping':
                try:
                    await ws.send(json.dumps({'type': 'pong'}))
                except Exception:
                    pass
    except Exception:
        pass
    finally:
        if player_id is not None:
            with WS_LOCK:
                if CLIENT_CONNS.get(player_id) is ws:
                    CLIENT_CONNS.pop(player_id, None)


def _run_ws_server(done_event):
    """在独立线程中运行 asyncio 的 WebSocket 服务器。"""
    global WS_LOOP

    async def main():
        global WS_LOOP
        WS_LOOP = asyncio.get_running_loop()
        # 启动常驻的消息冲刷协程
        asyncio.get_running_loop().create_task(_ws_flush())
        async with ws_serve(_ws_handler, "0.0.0.0", WS_PORT):
            await asyncio.Future()   # 永远运行
    try:
        asyncio.run(main())
    except Exception:
        pass
    finally:
        done_event.set()


def _run_room_manager(done_event):
    """后台房间管理器线程：秒级扫描房间，主动结算超时/推进对局并推送。"""
    while True:
        try:
            time.sleep(0.8)
            with ROOM_LOCK:
                changed_codes = []
                for code, room in list(ROOMS.items()):
                    before = (room['round_status'], room['status'])
                    # 延迟开局：匹配/加入成功后等待 ENTER_GAME_DELAY 秒再开启第一局计时，
                    # 与客户端「等待 2 秒后进入对局」同步，保证进入对局时计时从整段开始。
                    if (room['status'] == 'playing'
                            and room['round_status'] == 'idle'
                            and room.get('round_ready_at') is not None
                            and time.time() >= room['round_ready_at']):
                        start_round(room)
                    # 超时自动结算
                    if room['round_status'] == 'active' and round_time_left(room) <= 0:
                        w = resolve_round(room)
                        finish_round(room, w)
                    # 兜底：单局结算超过 60s 仍无客户端推进下一局时自动推进
                    r_at = room.get('round_resolved_at')
                    if (room['round_status'] == 'finished'
                            and room['status'] != 'finished'
                            and r_at and (time.time() - r_at) >= 60):
                        start_round(room)
                    if (before[0], before[1]) != (room['round_status'], room['status']):
                        changed_codes.append(code)
                    # 清理过期房间
                for code in changed_codes:
                    room = ROOMS.get(code)
                    if room:
                        notify_room_players(room, 'room_updated')
        except Exception:
            pass


def start_background_threads():
    """启动 WebSocket 服务器线程与房间管理器线程（在 __main__ 中调用）。"""
    ws_done = threading.Event()
    t_ws = threading.Thread(target=_run_ws_server, args=(ws_done,), daemon=True)
    t_ws.start()
    r_done = threading.Event()
    t_mgr = threading.Thread(target=_run_room_manager, args=(r_done,), daemon=True)
    t_mgr.start()
    return ws_done, r_done


# ------------------------------------------------------------------
# 多人模式：接口
# ------------------------------------------------------------------
@multi_bp.route('/api/multi/create', methods=['POST'])
def multi_create():
    """创建房间并返回房间号。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    ensure_player(pid)

    with ROOM_LOCK:
        # 先清理已结束房间中自己的记录，避免「对抗结束后无法再次创建房间」
        purge_finished_rooms_for(pid)
        for room in ROOMS.values():
            if any(p['player_id'] == pid for p in room['players']):
                return jsonify({'status': 'success', 'room_code': room['code'],
                                'room_status': room['status'], 'in_room': True})
        if any(q.get('player_id') == pid for q in MATCH_QUEUE):
            return jsonify({'status': 'error', 'message': '你正在匹配中'})
        cleanup_stale_rooms()
        code, _room = new_room(pid)
    return jsonify({'status': 'success', 'room_code': code})


@multi_bp.route('/api/multi/join', methods=['POST'])
def multi_join():
    """通过房间号加入房间。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    ensure_player(pid)

    with ROOM_LOCK:
        # 清理玩家在已结束房间中的残留，避免影响加入
        purge_finished_rooms_for(pid)
        room = ROOMS.get(code)
        if not room:
            return jsonify({'status': 'error', 'message': '房间不存在'})
        if room['status'] != 'waiting':
            return jsonify({'status': 'error', 'message': '该房间已开始或已结束'})
        if any(p['player_id'] == pid for p in room['players']):
            return jsonify({'status': 'error', 'message': '你已在该房间中'})
        for r in ROOMS.values():
            if any(p['player_id'] == pid for p in r['players']):
                return jsonify({'status': 'error', 'message': '你已在其他房间中'})
        if any(q.get('player_id') == pid for q in MATCH_QUEUE):
            return jsonify({'status': 'error', 'message': '你正在匹配中'})

        add_player(room, pid)
        _game_started = True
    # 双方向各自推送「开局」，使其在 2 秒倒计时后同时进入对局
    if _game_started:
        with ROOM_LOCK:
            room = ROOMS.get(code)
            if room:
                notify_room_players(room, 'game_started')
    return jsonify({'status': 'success', 'room_code': code})


@multi_bp.route('/api/multi/random_match', methods=['POST'])
def multi_random_match():
    """随机匹配。若已有等待者则配对开局；否则进入队列返回 room_code=null。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    ensure_player(pid)

    with ROOM_LOCK:
        cleanup_stale_rooms()
        # 清理已结束房间中自己的记录，避免随机匹配时被当成「仍在房间内」
        purge_finished_rooms_for(pid)
        for room in ROOMS.values():
            if any(p['player_id'] == pid for p in room['players']):
                return jsonify({'status': 'success', 'room_code': room['code'],
                                'room_status': room['status'],
                                'in_queue': False, 'already_in_room': True})
        if any(q.get('player_id') == pid for q in MATCH_QUEUE):
            return jsonify({'status': 'success', 'room_code': None, 'in_queue': True})

        opponent = None
        for q in MATCH_QUEUE:
            if q.get('player_id') != pid:
                opponent = q
                break
        if opponent:
            MATCH_QUEUE.remove(opponent)
            opp_id = opponent['player_id']
            code, room = new_room(opp_id)
            add_player(room, pid)
            # 随机匹配配对成功：推送给双方「开局」，使其 2 秒后同时进入
            _paired = True
        else:
            _paired = False
    if _paired:
        with ROOM_LOCK:
            room = ROOMS.get(code)
            if room:
                notify_room_players(room, 'game_started')
        return jsonify({'status': 'success', 'room_code': code, 'in_queue': False,
                        'opponent': opp_id})
    else:
        with ROOM_LOCK:
            MATCH_QUEUE.append({'player_id': pid, 'since': time.time()})
    return jsonify({'status': 'success', 'room_code': None, 'in_queue': True})


@multi_bp.route('/api/multi/cancel_match', methods=['POST'])
def multi_cancel_match():
    """取消随机匹配排队。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    with ROOM_LOCK:
        MATCH_QUEUE[:] = [q for q in MATCH_QUEUE if q.get('player_id') != pid]
    return jsonify({'status': 'success'})


@multi_bp.route('/api/multi/room_state', methods=['GET'])
def multi_room_state():
    """轮询房间状态（含超时结算 / 局推进）。"""
    pid = (request.args.get('player_id') or '').strip()
    code = (request.args.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    # 鉴权：防止拿着他人 player_id 查看/触发房间结算
    if not authenticate_player(request.args):
        return jsonify({'status': 'error', 'message': '身份校验失败，无权访问该房间'})

    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room:
            return jsonify({'status': 'error', 'message': '房间不存在或已结束'})
        idx = player_index(room, pid)
        if idx < 0:
            return jsonify({'status': 'error', 'message': '你不在该房间中'})
        # 延迟开局：匹配成功后等待窗口到期时，把第一局正式开启
        # （round_status 仍为 idle 时才会触发，避免重复 start_round）。
        if (room['status'] == 'playing'
                and room['round_status'] == 'idle'
                and room.get('round_ready_at') is not None
                and time.time() >= room['round_ready_at']):
            start_round(room)

        # 超时自动结算
        if room['round_status'] == 'active' and round_time_left(room) <= 0:
            w = resolve_round(room)
            finish_round(room, w)

        # 兜底：单局结算超 30 秒仍无前端发起 next_round，则自动推进下一局，避免卡死
        resolved_at = room.get('round_resolved_at')
        if (room['round_status'] == 'finished' and room['status'] != 'finished'
                and resolved_at and (time.time() - resolved_at) >= 30):
            start_round(room)

        data = build_room_view(room, idx)
        data['player_index'] = idx
        data['status'] = 'success'
    return jsonify(data)


@multi_bp.route('/api/multi/guess', methods=['POST'])
def multi_guess():
    """多人模式玩家猜测。服务端保存猜测、判定胜负、结算得分。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    guess_name = (data.get('guess') or '').strip()
    if not pid or not code or not guess_name:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    # 鉴权：只能用本人的设备凭证为自己的身份提交猜测
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})

    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room:
            return jsonify({'status': 'error', 'message': '房间不存在或已结束'})
        if room['status'] != 'playing' or room['round_status'] != 'active':
            return jsonify({'status': 'error', 'message': '当前不在可猜测的局中'})

        idx = player_index(room, pid)
        if idx < 0:
            return jsonify({'status': 'error', 'message': '你不在该房间中'})
        slot = room['players'][idx]

        if slot['attempts'] >= MAX_ATTEMPTS:
            return jsonify({'status': 'error', 'message': f'你本局已用完 {MAX_ATTEMPTS} 次猜测机会'})

        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM characters WHERE name = %s", (guess_name,))
                guess_char = cursor.fetchone()
        finally:
            conn.close()

        if not guess_char:
            return jsonify({'status': 'error', 'message': f'数据库中不存在名为「{guess_name}」的角色'})

        compare = build_compare(room['target'], guess_char)
        slot['guesses'].append({'character': guess_char, 'compare': compare})
        slot['attempts'] += 1

        won = all_match(compare)
        result = {'status': 'success', 'won': won, 'attempt': slot['attempts']}

        if won:
            finish_round(room, idx)
            _notify = True
        elif all(p['attempts'] >= MAX_ATTEMPTS for p in room['players']):
            w = resolve_round(room)
            finish_round(room, w)
            _notify = True
        else:
            _notify = True
        _guess_room_code = code

    # 猜测导致状态变化：把最新房间视图实时推送给双方
    if _notify:
        with ROOM_LOCK:
            room = ROOMS.get(_guess_room_code)
            if room:
                notify_room_players(room, 'room_updated')
    return jsonify(result)


@multi_bp.route('/api/multi/next_round', methods=['POST'])
def multi_next_round():
    """单局结束后由前端调用，确认玩家已看完结果后开始下一局。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败'})

    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room:
            return jsonify({'status': 'error', 'message': '房间不存在或已结束'})
        idx = player_index(room, pid)
        if idx < 0:
            return jsonify({'status': 'error', 'message': '你不在该房间中'})
        # 仅在单局已结束且还未整场结束时启动下一局；由加锁保证不会重复 start_round
        if room['round_status'] == 'finished' and room['status'] != 'finished':
            start_round(room)
            _started = True
        else:
            _started = False
        _nr_code = code
    # 下一局开始：实时通知双方刷新为新的对局视图（含新的计时起点）
    if _started:
        with ROOM_LOCK:
            room = ROOMS.get(_nr_code)
            if room:
                notify_room_players(room, 'room_updated')
    return jsonify({'status': 'success'})


@multi_bp.route('/api/multi/my_room')
def multi_my_room():
    """查询玩家当前是否在某个房间中，以及房间状态（用于左下角返回按钮）。"""
    pid = (request.args.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    if not authenticate_player(request.args):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    with ROOM_LOCK:
        for code, room in ROOMS.items():
            if any(p['player_id'] == pid for p in room['players']):
                return jsonify({
                    'status': 'success',
                    'in_room': True,
                    'room_code': code,
                    'room_status': room['status'],
                })
    return jsonify({'status': 'success', 'in_room': False})


@multi_bp.route('/api/multi/forfeit_notice', methods=['GET'])
def multi_forfeit_notice():
    """拉取并清除「对手弃权、判定你胜利」的通知。

    当一个玩家在对战中主动退出时，为留在房间内的玩家生成一条通知，
    前端轮询到后弹出提示框。
    """
    pid = (request.args.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    if not authenticate_player(request.args):
        return jsonify({'status': 'error', 'message': '身份校验失败'})
    with ROOM_LOCK:
        notice = FORFEIT_NOTICES.pop(pid, None)
    if notice:
        return jsonify({
            'status': 'success',
            'forfeit': True,
            'winner_id': notice['winner_id'],
            'loser_id': notice['loser_id'],
            'message': f'对手 {notice["loser_id"]} 已主动放弃对局，判定你获得胜利！',
        })
    return jsonify({'status': 'success', 'forfeit': False})


@multi_bp.route('/api/multi/leave_room', methods=['POST'])
def multi_leave_room():
    """玩家离开房间。

    - 对战中有人离开：离开者判负、另一方判胜，结算分数并删除房间。
    - 等待中/已结束：仅移除该玩家，若房间人数不足 2 则删除房间。
    """
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    # 身份鉴权：必须是「本人设备」凭证才能代表该玩家退出，
    # 否则攻击者可伪造对手的 player_id 使其被判负。
    if not authenticate_player(data):
        return jsonify({'status': 'error', 'message': '身份校验失败，无权执行该操作'})
    with ROOM_LOCK:
        # 先从中立处理匹配队列
        MATCH_QUEUE[:] = [q for q in MATCH_QUEUE if q.get('player_id') != pid]
        room = ROOMS.get(code)
        if room:
            idx = player_index(room, pid)
            if idx < 0:
                return jsonify({'status': 'success'})
            if room['status'] == 'playing' and len(room['players']) >= 2:
                # 对战中退出：离开者判负，对方判胜
                loser_idx, winner_idx = idx, 1 - idx
                apply_score(room['players'][loser_idx]['player_id'], MULTI_LOSE)
                apply_score(room['players'][winner_idx]['player_id'], MULTI_WIN)
                # 记录强制胜利通知，供对方前端拉取并提示
                winner_id = room['players'][winner_idx]['player_id']
                loser_id = room['players'][loser_idx]['player_id']
                FORFEIT_NOTICES[winner_id] = {
                    'winner_id': winner_id,
                    'loser_id': loser_id,
                }
                ROOMS.pop(code, None)
                # 实时推送「对手弃权，判定你胜利」给获胜方
                ws_send(winner_id, {
                    'type': 'forfeit',
                    'winner_id': winner_id,
                    'loser_id': loser_id,
                    'message': f'对手 {loser_id} 已主动放弃对局，判定你获得胜利！',
                })
            else:
                room['players'] = [p for p in room['players'] if p['player_id'] != pid]
                if len(room['players']) < 2:
                    ROOMS.pop(code, None)
    return jsonify({'status': 'success'})