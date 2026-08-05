# -*- coding: utf-8 -*-
"""鸣潮 nanoka.cc 图片与信息爬取脚本

从 static.nanoka.cc (nanoka.cc 的 CDN) 爬取鸣潮的角色和声骸图片及信息。

API 结构:
  - https://static.nanoka.cc/manifest.json                       版本清单
  - https://static.nanoka.cc/ww/<version>/character.json         角色列表
  - https://static.nanoka.cc/ww/<version>/echo.json              声骸列表
  - https://static.nanoka.cc/ww/<version>/zh/character/<id>.json 角色详情
  - https://static.nanoka.cc/ww/<version>/zh/echo/<id>.json      声骸详情

图片 URL 构造:
  原始 icon 路径形如 /Game/Aki/UI/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_31079_UI.T_IconMonsterHead_31079_UI
  转换规则: 去掉 /Game/Aki/UI/ 前缀, 取第一个 '.' 之前的部分,
            再拼成 https://static.nanoka.cc/assets/ww/<path>.webp
"""
import time
import httpx

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

STATIC_BASE = "https://static.nanoka.cc"
MANIFEST_URL = f"{STATIC_BASE}/manifest.json"

SESSION = httpx.Client(headers=HEADERS, trust_env=False)

REQUEST_DELAY = 0.3
MAX_RETRIES = 3

# 元素 / 武器类型映射
ELEMENT_MAP = {
    0: "零", 1: "冰", 2: "火", 3: "雷", 4: "风", 5: "光", 6: "暗",
}
WEAPON_MAP = {
    1: "长刃", 2: "迅刀", 3: "佩枪", 4: "臂铠", 5: "音感仪",
}
# intensity → cost 映射
INTENSITY_TO_COST = {0: 1, 1: 3, 2: 4, 3: 4}


def fetch_with_retry(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = SESSION.get(url, timeout=30, params=params)
            if r.status_code == 200:
                return r
            if r.status_code == 404:
                return r
        except httpx.HTTPError:
            pass
        if attempt < MAX_RETRIES:
            time.sleep(REQUEST_DELAY * attempt * 2)
    return None


def get_latest_version():
    r = fetch_with_retry(MANIFEST_URL)
    if r is None or r.status_code != 200:
        raise RuntimeError(f"无法获取 manifest.json: {r}")
    data = r.json()
    ww = data.get("ww", {})
    latest = ww.get("latest", "")
    if not latest:
        raise RuntimeError(f"manifest.json 中未找到 ww.latest")
    return latest


def fetch_character_data(version):
    url = f"{STATIC_BASE}/ww/{version}/character.json"
    r = fetch_with_retry(url)
    if r is None or r.status_code != 200:
        return {}
    return r.json()


def fetch_echo_data(version):
    url = f"{STATIC_BASE}/ww/{version}/echo.json"
    r = fetch_with_retry(url)
    if r is None or r.status_code != 200:
        return {}
    return r.json()


def fetch_sonata_data(version):
    """Fetch sonata.json for group ID → name mapping."""
    url = f"{STATIC_BASE}/ww/{version}/sonata.json"
    r = fetch_with_retry(url)
    if r is None or r.status_code != 200:
        return {}
    return r.json()


def fetch_echo_detail(version, echo_id):
    """Fetch echo detail JSON for skill attribute and group info."""
    url = f"{STATIC_BASE}/ww/{version}/zh/echo/{echo_id}.json"
    r = fetch_with_retry(url)
    if r is None or r.status_code != 200:
        return None
    return r.json()


def _filter_placeholder_items(data):
    items = []
    for item_id, info in data.items():
        zh = info.get("zh", "")
        if zh in ("敬请期待", "Stay tuned", ""):
            continue
        items.append((item_id, info))
    items.sort(key=lambda x: x[0])
    return items
