# -*- coding: utf-8 -*-
"""核心公共函数模块，供 app.py 和 auth_routes.py 等使用。"""
import os
import json
import secrets
import pymysql
from pymysql.cursors import DictCursor
from werkzeug.security import generate_password_hash
from PIL import Image
from config import DB_CONFIG

# 声骸套装图片目录（图片文件名 = 套装名，如 啸谷长风.png）
SET_IMAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'imgs')

# 颜色族 -> 粗分大族（用于“相似”判定与图片置白）
_COLOR_GROUPS = {
    'green': 'green', 'teal': 'green',
    'blue': 'blue', 'cyan': 'blue',
    'purple': 'purple',
    'red': 'warm', 'orange': 'warm', 'magenta': 'warm', 'pink': 'warm',
    'yellow': 'yellow',
    'gray': 'neutral', 'white': 'neutral', 'black': 'neutral',
}

# 各对比状态对应的底色大族（用于判断图片是否需置白）
_STATUS_BG_GROUP = {
    'match': 'green',
    'near': 'warm',
    'different': 'neutral',
}

_SET_FAMILY_CACHE = {}

# ------------------------------------------------------------------
# 声骸难度/地区相似分组（来源 static/divide.json）
# 每个键的数组视为一个「相似组」：
#   - 掉落位置：同组（如 今州、黑海岸 同属 "1.0"）视为相似 -> orange
#   - 技能属性：属性键列出其所属套装，用于将「猜测属性」与目标套装关联
# ------------------------------------------------------------------
DIVIDE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'divide.json')

# member -> 它所属的所有分组名（由 divide.json 所有数组反向建立）
_DIVIDE_MEMBER_GROUPS = None
# 套装 -> 该套装所关联的属性名集合（divide.json 属性键的反向索引）
_DIVIDE_SET_TO_ATTRS = None


def _load_divide():
    """解析 static/divide.json，建立 成员->分组 与 套装->属性 两类索引（带缓存）。"""
    global _DIVIDE_MEMBER_GROUPS, _DIVIDE_SET_TO_ATTRS
    if _DIVIDE_MEMBER_GROUPS is None:
        member_groups = {}
        set_attrs = {}
        try:
            with open(DIVIDE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for group_name, members in data.items():
                if not isinstance(members, list):
                    continue
                for m in members:
                    m = (m or '').strip()
                    if not m:
                        continue
                    member_groups.setdefault(m, set()).add(group_name)
                    if group_name != '全属性' and str(group_name)[0].isalpha():
                        set_attrs.setdefault(m, set()).add(group_name)
        except Exception:
            member_groups, set_attrs = {}, {}
        _DIVIDE_MEMBER_GROUPS = member_groups
        _DIVIDE_SET_TO_ATTRS = set_attrs
    return _DIVIDE_MEMBER_GROUPS, _DIVIDE_SET_TO_ATTRS


def divide_member_groups():
    """返回 成员 -> 所属分组集合 的反向索引。"""
    return _load_divide()[0]


def divide_set_to_attrs():
    """返回 套装 -> 所属属性集合 的反向索引。"""
    return _load_divide()[1]


def _classify_rgb(r, g, b):
    """根据平均 RGB 粗略划分图片主色族。"""
    mx = max(r, g, b)
    mn = min(r, g, b)
    d = mx - mn
    if d < 25:
        return 'gray'
    if r >= g and r >= b:
        if b > g:
            return 'magenta'
        if g > 150:
            return 'yellow'
        return 'orange'
    elif g >= r and g >= b:
        if b > r:
            return 'teal'
        return 'green'
    else:  # b 主
        if r > g:
            return 'purple'
        return 'blue'


def set_has_image(name):
    return os.path.isfile(os.path.join(SET_IMAGE_DIR, name + '.png'))


def image_color_family(name):
    """返回某个套装图片的主色族（带缓存）。无图片返回 'neutral'。"""
    if name in _SET_FAMILY_CACHE:
        return _SET_FAMILY_CACHE[name]
    fam = 'neutral'
    try:
        im = Image.open(os.path.join(SET_IMAGE_DIR, name + '.png')).convert('RGBA')
        px = list(im.getdata())
        op = [(r, g, b) for (r, g, b, a) in px if a > 100]
        if op:
            n = len(op)
            fam = _classify_rgb(sum(p[0] for p in op) // n,
                                sum(p[1] for p in op) // n,
                                sum(p[2] for p in op) // n)
    except Exception:
        fam = 'neutral'
    _SET_FAMILY_CACHE[name] = fam
    return fam


def split_field(val):
    """按中英文逗号拆分字段为字符串数组（去空白、去空项）。"""
    if not val:
        return []
    return [x.strip() for x in str(val).replace('，', ',').split(',') if x.strip()]


def _cell_status(target_list, guess_list):
    """计算逗号分离字段的「整格底色」状态（表示当前猜中集合的数量是否正确）：
    - match（绿）：猜测集合与目标集合完全一致（数量、内容都齐全）
    - partial（黄）：至少猜中一个但未完全命中（数量不对，缺项或多余）
    - different（灰）：一个都没猜中
    """
    if not guess_list:
        return 'different'
    tset = set(target_list)
    gset = set(guess_list)
    if gset == tset:
        return 'match'
    if gset & tset:
        return 'partial'
    return 'different'


def compare_skill_attributes(target_attrs, guess_attrs, target_sets=None):
    """每个玩家猜到的技能属性单独上底色：
    - 与目标属性相同 -> match（绿）
    - 同属 divide.json 同一数组（由目标套装关联出的属性）-> near（橙）
    - 其余 -> different（灰）
    """
    set_to_attrs = divide_set_to_attrs()
    # 由目标所拥有的套装推导出目标可能归属的属性集合（divide.json 反向索引）
    inferred = set()
    if target_sets:
        for s in target_sets:
            inferred |= set(set_to_attrs.get(s, set()))

    result = []
    for a in guess_attrs:
        if a in target_attrs:
            st = 'match'
        elif a in inferred:
            st = 'near'
        else:
            st = 'different'
        result.append({'attr': a, 'status': st})
    return result


def need_whiten(name, status):
    """当图片主色族与将要应用的目标底色大族相同，应先把图片改为白色。"""
    if not set_has_image(name):
        return False
    return _COLOR_GROUPS.get(image_color_family(name), 'neutral') == _STATUS_BG_GROUP.get(status, 'neutral')


def compare_sets(target_sets, guess_sets):
    """每个玩家猜到的套装单独上底色：
    - 与目标套装相同 -> match（绿）
    - 图片主色与目标同色系（粗分大族相同，如都是绿色系）-> near（橙）
    - 其余 -> different（灰）
    """
    target_groups = {
        _COLOR_GROUPS.get(image_color_family(s), 'neutral')
        for s in target_sets
        if set_has_image(s)
    }
    result = []
    for s in guess_sets:
        if s in target_sets:
            st = 'match'
        elif set_has_image(s) and _COLOR_GROUPS.get(image_color_family(s), 'neutral') in target_groups:
            st = 'near'
        else:
            st = 'different'
        result.append({
            'set': s,
            'status': st,
            'has_image': set_has_image(s),
            'whiten': need_whiten(s, st),
        })
    return result


def compare_drop_locations(target_locs, guess_locs):
    """每个玩家猜到的掉落位置单独上底色：
    - 位置在目标内 -> match（绿）
    - 与任一本命区同属 divide.json 同一数组（如 今州/黑海岸 同属 "1.0"）-> near（橙）
    - 其余 -> different（灰）
    """
    member_groups = divide_member_groups()
    target_groups = set()
    for t in target_locs:
        target_groups |= member_groups.get(t, set())

    result = []
    for loc in guess_locs:
        if loc in target_locs:
            st = 'match'
        elif member_groups.get(loc, set()) & target_groups:
            st = 'near'
        else:
            st = 'different'
        result.append({'loc': loc, 'status': st})
    return result


# ------------------------------------------------------------------
# 数据库连接
# ------------------------------------------------------------------
def get_connection():
    return pymysql.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=DB_CONFIG['database'],
        charset=DB_CONFIG['charset'],
        cursorclass=DictCursor,
    )

# ------------------------------------------------------------------
# 对比逻辑
# ------------------------------------------------------------------
def compare_field(target_val, guess_val, field_name):
    if target_val == guess_val:
        return 'match'
    if field_name == 'star_rating':
        return 'near'
    if field_name == 'version':
        if abs(float(target_val) - float(guess_val)) <= 0.25:
            return 'near'
        return 'different'
    return 'different'

def build_compare(target, guess):
    return {
        'attribute':   compare_field(target['attribute'],   guess['attribute'],   'attribute'),
        'star_rating': compare_field(target['star_rating'], guess['star_rating'], 'star_rating'),
        'weapon':      compare_field(target['weapon'],      guess['weapon'],      'weapon'),
        'birthplace':  compare_field(target['birthplace'],  guess['birthplace'],  'birthplace'),
        'version':     compare_field(target['version'],     guess['version'],     'version'),
    }

def _list_field_match(v):
    """逗号分离字段（dict 结构 {cell, items}）是否完全命中（整格 green = 数量/内容全对）。"""
    if not isinstance(v, dict) or 'items' not in v:
        return False
    return bool(v.get('items')) and v.get('cell') == 'match'

def all_match(compare):
    """判断是否全部字段完全匹配。逗号分离字段以整格状态判断，其余字段逐值判断。"""
    for v in compare.values():
        if isinstance(v, dict) and 'items' in v:      # 逗号分离字段
            if not _list_field_match(v):
                return False
        elif isinstance(v, list):                      # 兼容旧格式
            if not v:
                return False
            for item in v:
                if item.get('status') != 'match':
                    return False
        elif v != 'match':
            return False
    return True

def match_count(compare):
    """统计完全匹配的字段数（含逐项对比的字段）。"""
    count = 0
    for v in compare.values():
        if isinstance(v, dict) and 'items' in v:      # 逗号分离字段
            if _list_field_match(v):
                count += 1
        elif isinstance(v, list):                      # 兼容旧格式
            if v and all(item.get('status') == 'match' for item in v):
                count += 1
        elif v == 'match':
            count += 1
    return count

# ------------------------------------------------------------------
# 声骸（Sound Skeleton）相关逻辑
# ------------------------------------------------------------------
def draw_sound_skeleton(difficulty='normal'):
    """随机抽一个声骸作为目标。
    difficulty='easy' 时只从 4cost 声骸中抽取；其余难度抽取全部声骸。
    """
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            if difficulty == 'easy':
                cursor.execute("SELECT * FROM sound_skeletons WHERE cost = 4 ORDER BY RAND() LIMIT 1")
            else:
                cursor.execute("SELECT * FROM sound_skeletons ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        conn.close()
    return row

def get_skeleton_names():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name, skill_attribute, cost, set_name FROM sound_skeletons ORDER BY name")
            rows = cursor.fetchall()
    finally:
        conn.close()
    return rows

def compare_field_skeleton(target_val, guess_val, field_name):
    """声骸字段对比：
    - COST 视为数值，相差 ±1 显示近（orange），相同为 match
    - 其余字段（技能属性/异相/套装/掉落位置）只有相同/不同
    """
    if target_val == guess_val:
        return 'match'
    if field_name == 'cost':
        if abs(int(target_val) - int(guess_val)) <= 1:
            return 'near'
        return 'different'
    return 'different'

def build_compare_skeleton(target, guess):
    """构建声骸对比结果。

    技能属性 / 所属套装 / 掉落位置 都是「逗号分离」多值字段：
    每个被猜到的值单独上底色，同时返回整格 cell 状态（绿=数量全对，黄=数量不对，灰=全没猜中）。
    """
    target_attrs = split_field(target['skill_attribute'])
    guess_attrs = split_field(guess['skill_attribute'])
    target_sets = split_field(target['set_name'])
    guess_sets = split_field(guess['set_name'])
    target_locs = split_field(target['drop_location'])
    guess_locs = split_field(guess['drop_location'])
    return {
        'skill_attribute': {
            'cell': _cell_status(target_attrs, guess_attrs),
            'items': compare_skill_attributes(target_attrs, guess_attrs, target_sets),
        },
        'cost':             compare_field_skeleton(target['cost'], guess['cost'], 'cost'),
        'is_aberration':    compare_field_skeleton(target['is_aberration'], guess['is_aberration'], 'is_aberration'),
        'set_name': {
            'cell': _cell_status(target_sets, guess_sets),
            'items': compare_sets(target_sets, guess_sets),
        },
        'drop_location': {
            'cell': _cell_status(target_locs, guess_locs),
            'items': compare_drop_locations(target_locs, guess_locs),
        },
    }

def build_compare_by_type(target, guess, quiz_type):
    """根据猜谜类型选择角色对照或声骸对照。"""
    if quiz_type == 'skeleton':
        return build_compare_skeleton(target, guess)
    return build_compare(target, guess)

def draw_target_by_type(quiz_type, difficulty='normal'):
    """根据猜谜类型随机抽取目标（角色或声骸）。
    difficulty: 仅声骸使用 —— 'easy' 只抽 4cost，其余抽全部。
    """
    if quiz_type == 'skeleton':
        return draw_sound_skeleton(difficulty)
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM characters ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        conn.close()
    return row

# ------------------------------------------------------------------
# 玩家 / 得分 相关
# ------------------------------------------------------------------
def generate_token():
    return secrets.token_hex(16)

SECRET_PREPARED = False
PASSWORD_PREPARED = False

def ensure_secret_column():
    global SECRET_PREPARED
    if SECRET_PREPARED:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE players ADD COLUMN secret VARCHAR(64) NOT NULL DEFAULT ''")
                conn.commit()
            except Exception:
                conn.rollback()
        SECRET_PREPARED = True
    finally:
        conn.close()

def ensure_password_column():
    global PASSWORD_PREPARED
    if PASSWORD_PREPARED:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE players ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT ''")
                conn.commit()
            except Exception:
                conn.rollback()
        PASSWORD_PREPARED = True
    finally:
        conn.close()

STATS_PREPARED = False

def ensure_stats_columns():
    """为已存在的 players 表补充 胜场(wins) / 总场次(matches) 两列（幂等）。"""
    global STATS_PREPARED
    if STATS_PREPARED:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            for _col, _ddl in (('wins', 'wins INT NOT NULL DEFAULT 0'),
                               ('matches', 'matches INT NOT NULL DEFAULT 0')):
                try:
                    cursor.execute(f"ALTER TABLE players ADD COLUMN {_ddl}")
                except Exception:
                    conn.rollback()   # 列已存在则跳过
        conn.commit()
        STATS_PREPARED = True
    finally:
        conn.close()

def get_player(player_id):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM players WHERE player_id = %s", (player_id,))
            row = cursor.fetchone()
    finally:
        conn.close()
    return row

def create_player(player_id):
    secret = generate_token()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO players (player_id, score, secret) VALUES (%s, 0, %s)",
                (player_id, secret),
            )
        conn.commit()
    finally:
        conn.close()
    return {'player_id': player_id, 'score': 0, 'secret': secret}

def set_player_secret(player_id):
    secret = generate_token()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE players SET secret = %s WHERE player_id = %s", (secret, player_id))
        conn.commit()
    finally:
        conn.close()
    return secret

def ensure_player(player_id):
    p = get_player(player_id)
    if not p:
        return create_player(player_id)
    if not p.get('secret'):
        p['secret'] = set_player_secret(player_id)
    return p

def apply_score(player_id, delta):
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

def record_match(winner_id, loser_id):
    """结算一场已完成的整场比赛胜率数据：两名玩家总场次各 +1，胜者胜场 +1。"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE players SET matches = matches + 1, wins = wins + 1 WHERE player_id = %s",
                (winner_id,),
            )
            cursor.execute(
                "UPDATE players SET matches = matches + 1 WHERE player_id = %s",
                (loser_id,),
            )
        conn.commit()
    finally:
        conn.close()

def authenticate_player(data_or_args):
    pid = (data_or_args.get('player_id') or '').strip()
    token = (data_or_args.get('token') or '').strip()
    if not pid or not token:
        return None
    p = get_player(pid)
    if not p or not p.get('secret'):
        return None
    if not secrets.compare_digest(p['secret'], token):
        return None
    return p

def set_password(player_id, password):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE players SET password = %s WHERE player_id = %s",
                           (generate_password_hash(password), player_id))
        conn.commit()
    finally:
        conn.close()