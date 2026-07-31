# -*- coding: utf-8 -*-
"""
角色猜谜游戏 - Flask 后端
随机抽取一个角色作为目标，玩家猜测角色后按颜色规则对比展示。

包含：
- 单人模式（原有玩法）
- 多人模式（两人对抗、三局两胜、每局 1分30秒限时）
- 排行榜 / 得分统计
"""

import random
import string
import time
import threading
import os

from flask import Flask, jsonify, request, render_template, send_from_directory
import pymysql
from pymysql.cursors import DictCursor
from config import DB_CONFIG

app = Flask(__name__)

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


def get_connection():
    """建立数据库连接。"""
    return pymysql.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=DB_CONFIG['database'],
        charset=DB_CONFIG['charset'],
        cursorclass=DictCursor,
    )


def gen_room_code():
    """生成 6 位不重复房间号。"""
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=6))
        if code not in ROOMS:
            return code


# ------------------------------------------------------------------
# 对比逻辑
# ------------------------------------------------------------------
# 绿色：完全一样（match）
# 橙色：相差不大（near）—— 仅限星级和版本
#        星级只有 4 和 5，两者不同即视为相邻档位 -> 相差不大
#        版本相减绝对值 <= 0.2 -> 相差不大
# 灰色：完全不一样（different）
# ------------------------------------------------------------------

def compare_field(target_val, guess_val, field_name):
    """
    返回 'match'（绿色）、'near'（橙色）、'different'（灰色）。
    """
    if target_val == guess_val:
        return 'match'

    if field_name == 'star_rating':
        return 'near'

    if field_name == 'version':
        if abs(float(target_val) - float(guess_val)) <= 0.2:
            return 'near'
        return 'different'

    return 'different'


def build_compare(target, guess):
    """根据目标角色与猜测角色构建各项对比结果。"""
    return {
        'attribute':   compare_field(target['attribute'],   guess['attribute'],   'attribute'),
        'star_rating': compare_field(target['star_rating'], guess['star_rating'], 'star_rating'),
        'weapon':      compare_field(target['weapon'],      guess['weapon'],      'weapon'),
        'birthplace':  compare_field(target['birthplace'],  guess['birthplace'],  'birthplace'),
        'version':     compare_field(target['version'],     guess['version'],     'version'),
    }


def all_match(compare):
    """是否全部字段匹配（即猜中）。"""
    return all(v == 'match' for v in compare.values())


def match_count(compare):
    """统计匹配(match)的字段数。"""
    return sum(1 for v in compare.values() if v == 'match')


# ------------------------------------------------------------------
# 玩家 / 得分 相关
# ------------------------------------------------------------------
def get_player(player_id):
    """按 player_id 查询玩家，不存在返回 None。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM players WHERE player_id = %s", (player_id,))
            row = cursor.fetchone()
    finally:
        conn.close()
    return row


def create_player(player_id):
    """新建玩家（初始 0 分），返回新行。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO players (player_id, score) VALUES (%s, 0)", (player_id,))
        conn.commit()
    finally:
        conn.close()
    return {'player_id': player_id, 'score': 0}


def ensure_player(player_id):
    """确保玩家存在，返回其信息。"""
    p = get_player(player_id)
    if p:
        return p
    return create_player(player_id)


def apply_score(player_id, delta):
    """给玩家加减分（可传入负数）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET score = score + %s WHERE player_id = %s",
                (delta, player_id),
            )
        conn.commit()
    finally:
        conn.close()


# ------------------------------------------------------------------
# 单人模式相关
# ------------------------------------------------------------------
@app.route('/')
def index():
    """首页。"""
    return render_template('index.html')


@app.route('/api/draw')
def draw():
    """从数据库中随机抽取一个角色作为目标。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        return jsonify({'status': 'error', 'message': '数据库中没有角色数据'})

    return jsonify({'status': 'success', 'character': row})


@app.route('/api/names')
def names():
    """返回所有角色的名称及补全展示所需的信息。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name, attribute, star_rating FROM characters ORDER BY name")
            rows = cursor.fetchall()
    finally:
        conn.close()

    return jsonify({'status': 'success', 'names': rows})


@app.route('/api/guess', methods=['POST'])
def guess():
    """
    接收目标角色（前端抽取的）和玩家猜测的角色名。
    从数据库取出猜测角色的数据，与目标角色逐项对比并返回。
    """
    data = request.get_json()
    target = data.get('target')
    guess_name = (data.get('guess') or '').strip()

    if not target:
        return jsonify({'status': 'error', 'message': '缺少目标角色数据，请先抽取随机角色'})
    if not guess_name:
        return jsonify({'status': 'error', 'message': '请输入角色名'})

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters WHERE name = %s", (guess_name,))
            guess_char = cursor.fetchone()
    finally:
        conn.close()

    if not guess_char:
        return jsonify({'status': 'error', 'message': f'数据库中不存在名为「{guess_name}」的角色'})

    compare = build_compare(target, guess_char)
    return jsonify({
        'status': 'success',
        'target': target,
        'guess': guess_char,
        'compare': compare,
    })


# ------------------------------------------------------------------
# 玩家 ID / 排行榜 接口
# ------------------------------------------------------------------
@app.route('/api/player/init', methods=['POST'])
def player_init():
    """前端加载时调用，确保设备 player_id 存在，返回玩家信息。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    p = ensure_player(pid)
    return jsonify({'status': 'success', 'player': p})


@app.route('/api/player/update_id', methods=['POST'])
def player_update_id():
    """玩家修改自己的 ID。需保证新 ID 未被其他玩家占用。"""
    data = request.get_json() or {}
    old_id = (data.get('old_id') or '').strip()
    new_id = (data.get('new_id') or '').strip()
    if not old_id or not new_id:
        return jsonify({'status': 'error', 'message': '参数不完整'})
    if len(new_id) > 64:
        return jsonify({'status': 'error', 'message': 'ID 过长'})
    other = get_player(new_id)
    if other and other['player_id'] != old_id:
        return jsonify({'status': 'error', 'message': '该玩家ID已被占用'})

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET player_id = %s WHERE player_id = %s",
                (new_id, old_id),
            )
        conn.commit()
    finally:
        conn.close()
    p = get_player(new_id)
    return jsonify({'status': 'success', 'player': p})


@app.route('/api/player/score', methods=['POST'])
def player_score():
    """[已移除] 单人模式得分接口。单人模式已不参与计分，此接口保留空壳以免外部依赖报错。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
    p = get_player(pid)
    return jsonify({'status': 'success', 'player': p, 'delta': 0})


@app.route('/api/leaderboard')
def leaderboard():
    """返回排行榜（玩家ID + 得分，降序）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT player_id, score FROM players ORDER BY score DESC, player_id ASC")
            rows = cursor.fetchall()
    finally:
        conn.close()
    return jsonify({'status': 'success', 'leaderboard': rows})


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
    }
    ROOMS[code] = room
    return code, room


def add_player(room, player_id):
    """第二名玩家加入并开赛。"""
    room['players'].append(new_slot(player_id))
    room['status'] = 'playing'
    start_round(room)


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
# 多人模式：接口
# ------------------------------------------------------------------
@app.route('/api/multi/create', methods=['POST'])
def multi_create():
    """创建房间并返回房间号。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
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


@app.route('/api/multi/join', methods=['POST'])
def multi_join():
    """通过房间号加入房间。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})
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
    return jsonify({'status': 'success', 'room_code': code})


@app.route('/api/multi/random_match', methods=['POST'])
def multi_random_match():
    """随机匹配。若已有等待者则配对开局；否则进入队列返回 room_code=null。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
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
            return jsonify({'status': 'success', 'room_code': code, 'in_queue': False,
                            'opponent': opp_id})
        MATCH_QUEUE.append({'player_id': pid, 'since': time.time()})
    return jsonify({'status': 'success', 'room_code': None, 'in_queue': True})


@app.route('/api/multi/cancel_match', methods=['POST'])
def multi_cancel_match():
    """取消随机匹配排队。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    with ROOM_LOCK:
        MATCH_QUEUE[:] = [q for q in MATCH_QUEUE if q.get('player_id') != pid]
    return jsonify({'status': 'success'})


@app.route('/api/multi/room_state', methods=['GET'])
def multi_room_state():
    """轮询房间状态（含超时结算 / 局推进）。"""
    pid = (request.args.get('player_id') or '').strip()
    code = (request.args.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})

    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room:
            return jsonify({'status': 'error', 'message': '房间不存在或已结束'})
        idx = player_index(room, pid)
        if idx < 0:
            return jsonify({'status': 'error', 'message': '你不在该房间中'})

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


@app.route('/api/multi/guess', methods=['POST'])
def multi_guess():
    """多人模式玩家猜测。服务端保存猜测、判定胜负、结算得分。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    guess_name = (data.get('guess') or '').strip()
    if not pid or not code or not guess_name:
        return jsonify({'status': 'error', 'message': '参数不完整'})

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
            return jsonify(result)

        # 双方都用尽猜测则本局提前结算
        if all(p['attempts'] >= MAX_ATTEMPTS for p in room['players']):
            w = resolve_round(room)
            finish_round(room, w)

        return jsonify(result)


@app.route('/api/multi/next_round', methods=['POST'])
def multi_next_round():
    """单局结束后由前端调用，确认玩家已看完结果后开始下一局。"""
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
    if not pid or not code:
        return jsonify({'status': 'error', 'message': '参数不完整'})

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
    return jsonify({'status': 'success'})


@app.route('/api/multi/my_room')
def multi_my_room():
    """查询玩家当前是否在某个房间中，以及房间状态（用于左下角返回按钮）。"""
    pid = (request.args.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
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


@app.route('/api/multi/forfeit_notice', methods=['GET'])
def multi_forfeit_notice():
    """拉取并清除「对手弃权、判定你胜利」的通知。

    当一个玩家在对战中主动退出时，为留在房间内的玩家生成一条通知，
    前端轮询到后弹出提示框。
    """
    pid = (request.args.get('player_id') or '').strip()
    if not pid:
        return jsonify({'status': 'error', 'message': '缺少玩家ID'})
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


@app.route('/api/multi/leave_room', methods=['POST'])
def multi_leave_room():
    """玩家离开房间。

    - 对战中有人离开：离开者判负、另一方判胜，结算分数并删除房间。
    - 等待中/已结束：仅移除该玩家，若房间人数不足 2 则删除房间。
    """
    data = request.get_json() or {}
    pid = (data.get('player_id') or '').strip()
    code = (data.get('room_code') or '').strip().upper()
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
                FORFEIT_NOTICES[room['players'][winner_idx]['player_id']] = {
                    'winner_id': room['players'][winner_idx]['player_id'],
                    'loser_id': room['players'][loser_idx]['player_id'],
                }
                ROOMS.pop(code, None)
            else:
                room['players'] = [p for p in room['players'] if p['player_id'] != pid]
                if len(room['players']) < 2:
                    ROOMS.pop(code, None)
    return jsonify({'status': 'success'})

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
    os.path.join(app.root_path, 'static'),
    'favicon.ico',
    mimetype='image/vnd.microsoft.icon'
)


# ------------------------------------------------------------------
# 主入口
# ------------------------------------------------------------------
if __name__ == '__main__':
    print(ROOMS)
    app.run(host='0.0.0.0', port=5000, debug=True)
