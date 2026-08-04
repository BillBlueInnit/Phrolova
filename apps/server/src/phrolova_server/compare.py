from __future__ import annotations

import json
import os
import secrets
from pathlib import Path
from typing import Any

from PIL import Image
from werkzeug.security import generate_password_hash

from .db import get_connection

BASE_DIR = Path(__file__).resolve().parent
DIVIDE_FILE = BASE_DIR / "data" / "divide.json"
SET_IMAGE_DIR = BASE_DIR / "assets" / "set_images"

_COLOR_GROUPS = {
    "green": "green",
    "teal": "green",
    "blue": "blue",
    "cyan": "blue",
    "purple": "purple",
    "red": "warm",
    "orange": "warm",
    "magenta": "warm",
    "pink": "warm",
    "yellow": "yellow",
    "gray": "neutral",
    "white": "neutral",
    "black": "neutral",
}

_STATUS_BG_GROUP = {
    "match": "green",
    "near": "warm",
    "different": "neutral",
}

_SET_FAMILY_CACHE: dict[str, str] = {}
_DIVIDE_MEMBER_GROUPS: dict[str, set[str]] | None = None
_DIVIDE_SET_TO_ATTRS: dict[str, set[str]] | None = None


def _load_divide():
    global _DIVIDE_MEMBER_GROUPS, _DIVIDE_SET_TO_ATTRS
    if _DIVIDE_MEMBER_GROUPS is None:
        member_groups: dict[str, set[str]] = {}
        set_attrs: dict[str, set[str]] = {}
        try:
            with DIVIDE_FILE.open("r", encoding="utf-8") as file:
                data = json.load(file)
            for group_name, members in data.items():
                if not isinstance(members, list):
                    continue
                for member in members:
                    normalized = (member or "").strip()
                    if not normalized:
                        continue
                    member_groups.setdefault(normalized, set()).add(group_name)
                    if group_name != "全属性" and str(group_name)[0].isalpha():
                        set_attrs.setdefault(normalized, set()).add(group_name)
        except Exception:
            member_groups, set_attrs = {}, {}
        _DIVIDE_MEMBER_GROUPS = member_groups
        _DIVIDE_SET_TO_ATTRS = set_attrs
    return _DIVIDE_MEMBER_GROUPS, _DIVIDE_SET_TO_ATTRS


def divide_member_groups():
    return _load_divide()[0]


def divide_set_to_attrs():
    return _load_divide()[1]


def _classify_rgb(r: int, g: int, b: int) -> str:
    maximum = max(r, g, b)
    minimum = min(r, g, b)
    delta = maximum - minimum
    if delta < 25:
        return "gray"
    if r >= g and r >= b:
        if b > g:
            return "magenta"
        if g > 150:
            return "yellow"
        return "orange"
    if g >= r and g >= b:
        if b > r:
            return "teal"
        return "green"
    if r > g:
        return "purple"
    return "blue"


def set_has_image(name: str) -> bool:
    return (SET_IMAGE_DIR / f"{name}.png").is_file()


def image_color_family(name: str) -> str:
    if name in _SET_FAMILY_CACHE:
        return _SET_FAMILY_CACHE[name]
    family = "neutral"
    try:
        image = Image.open(SET_IMAGE_DIR / f"{name}.png").convert("RGBA")
        pixels = list(image.getdata())
        opaque = [(r, g, b) for (r, g, b, a) in pixels if a > 100]
        if opaque:
            count = len(opaque)
            family = _classify_rgb(
                sum(pixel[0] for pixel in opaque) // count,
                sum(pixel[1] for pixel in opaque) // count,
                sum(pixel[2] for pixel in opaque) // count,
            )
    except Exception:
        family = "neutral"
    _SET_FAMILY_CACHE[name] = family
    return family


def split_field(value: Any) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).replace("，", ",").split(",") if item.strip()]


def _cell_status(target_list: list[str], guess_list: list[str]) -> str:
    if not guess_list:
        return "different"
    target_set = set(target_list)
    guess_set = set(guess_list)
    if guess_set == target_set:
        return "match"
    if guess_set & target_set:
        return "partial"
    return "different"


def compare_skill_attributes(
    target_attrs: list[str],
    guess_attrs: list[str],
    target_sets: list[str] | None = None,
):
    set_to_attrs = divide_set_to_attrs()
    inferred: set[str] = set()
    if target_sets:
        for set_name in target_sets:
            inferred |= set(set_to_attrs.get(set_name, set()))

    result = []
    for attr in guess_attrs:
        if attr in target_attrs:
            status = "match"
        elif attr in inferred:
            status = "near"
        else:
            status = "different"
        result.append({"attr": attr, "status": status})
    return result


def need_whiten(name: str, status: str) -> bool:
    if not set_has_image(name):
        return False
    image_group = _COLOR_GROUPS.get(image_color_family(name), "neutral")
    return image_group == _STATUS_BG_GROUP.get(status, "neutral")


def compare_sets(target_sets: list[str], guess_sets: list[str]):
    target_groups = {
        _COLOR_GROUPS.get(image_color_family(set_name), "neutral")
        for set_name in target_sets
        if set_has_image(set_name)
    }
    result = []
    for set_name in guess_sets:
        if set_name in target_sets:
            status = "match"
        elif set_has_image(set_name) and _COLOR_GROUPS.get(image_color_family(set_name), "neutral") in target_groups:
            status = "near"
        else:
            status = "different"
        result.append(
            {
                "set": set_name,
                "status": status,
                "has_image": set_has_image(set_name),
                "whiten": need_whiten(set_name, status),
            }
        )
    return result


def compare_drop_locations(target_locs: list[str], guess_locs: list[str]):
    member_groups = divide_member_groups()
    target_groups: set[str] = set()
    for loc in target_locs:
        target_groups |= member_groups.get(loc, set())

    result = []
    for loc in guess_locs:
        if loc in target_locs:
            status = "match"
        elif member_groups.get(loc, set()) & target_groups:
            status = "near"
        else:
            status = "different"
        result.append({"loc": loc, "status": status})
    return result


# 有序版本号数组：相邻两个版本视为相近版本
_VERSION_ORDER = [
    "1.0", "1.1", "1.2", "1.3", "1.4",
    "2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8",
    "3.0", "3.1", "3.2", "3.3", "3.4", "3.5",
]
_VERSION_INDEX = {v: i for i, v in enumerate(_VERSION_ORDER)}


def _is_adjacent_version(a: Any, b: Any) -> bool:
    """判断两个版本号在有序数组中是否相邻"""
    ia = _VERSION_INDEX.get(str(a).strip())
    ib = _VERSION_INDEX.get(str(b).strip())
    if ia is None or ib is None:
        return False
    return abs(ia - ib) == 1


def compare_field(target_val: Any, guess_val: Any, field_name: str) -> str:
    if target_val == guess_val:
        return "match"
    if field_name == "star_rating":
        return "near"
    if field_name == "version":
        if _is_adjacent_version(target_val, guess_val):
            return "near"
        return "different"
    return "different"


def build_compare(target: dict[str, Any], guess: dict[str, Any]):
    return {
        "attribute": compare_field(target["attribute"], guess["attribute"], "attribute"),
        "star_rating": compare_field(target["star_rating"], guess["star_rating"], "star_rating"),
        "weapon": compare_field(target["weapon"], guess["weapon"], "weapon"),
        "birthplace": compare_field(target["birthplace"], guess["birthplace"], "birthplace"),
        "version": compare_field(target["version"], guess["version"], "version"),
    }


def _list_field_match(value: Any) -> bool:
    if not isinstance(value, dict) or "items" not in value:
        return False
    return bool(value.get("items")) and value.get("cell") == "match"


def all_match(compare_result: dict[str, Any]) -> bool:
    for value in compare_result.values():
        if isinstance(value, dict) and "items" in value:
            if not _list_field_match(value):
                return False
        elif isinstance(value, list):
            if not value:
                return False
            for item in value:
                if item.get("status") != "match":
                    return False
        elif value != "match":
            return False
    return True


def match_count(compare_result: dict[str, Any]) -> int:
    count = 0
    for value in compare_result.values():
        if isinstance(value, dict) and "items" in value:
            if _list_field_match(value):
                count += 1
        elif isinstance(value, list):
            if value and all(item.get("status") == "match" for item in value):
                count += 1
        elif value == "match":
            count += 1
    return count


def draw_sound_skeleton(difficulty: str = "normal"):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            if difficulty == "easy":
                cursor.execute("SELECT * FROM sound_skeletons WHERE cost = 4 ORDER BY RAND() LIMIT 1")
            else:
                cursor.execute("SELECT * FROM sound_skeletons ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        connection.close()
    return row


def get_skeleton_names():
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name, skill_attribute, cost, is_aberration, set_name, drop_location FROM sound_skeletons ORDER BY name"
            )
            rows = cursor.fetchall()
    finally:
        connection.close()
    return rows


def compare_field_skeleton(target_val: Any, guess_val: Any, field_name: str) -> str:
    if target_val == guess_val:
        return "match"
    if field_name == "cost":
        if abs(int(target_val) - int(guess_val)) <= 1:
            return "near"
        return "different"
    return "different"


def build_compare_skeleton(target: dict[str, Any], guess: dict[str, Any]):
    target_attrs = split_field(target["skill_attribute"])
    guess_attrs = split_field(guess["skill_attribute"])
    target_sets = split_field(target["set_name"])
    guess_sets = split_field(guess["set_name"])
    target_locs = split_field(target["drop_location"])
    guess_locs = split_field(guess["drop_location"])
    return {
        "skill_attribute": {
            "cell": _cell_status(target_attrs, guess_attrs),
            "items": compare_skill_attributes(target_attrs, guess_attrs, target_sets),
        },
        "cost": compare_field_skeleton(target["cost"], guess["cost"], "cost"),
        "is_aberration": compare_field_skeleton(target["is_aberration"], guess["is_aberration"], "is_aberration"),
        "set_name": {
            "cell": _cell_status(target_sets, guess_sets),
            "items": compare_sets(target_sets, guess_sets),
        },
        "drop_location": {
            "cell": _cell_status(target_locs, guess_locs),
            "items": compare_drop_locations(target_locs, guess_locs),
        },
    }


def build_compare_by_type(target: dict[str, Any], guess: dict[str, Any], quiz_type: str):
    if quiz_type == "skeleton":
        return build_compare_skeleton(target, guess)
    return build_compare(target, guess)


def draw_target_by_type(quiz_type: str, difficulty: str = "normal"):
    if quiz_type == "skeleton":
        return draw_sound_skeleton(difficulty)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM characters ORDER BY RAND() LIMIT 1")
            row = cursor.fetchone()
    finally:
        connection.close()
    return row


def lookup_guess_by_name(quiz_type: str, guess_name: str):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            if quiz_type == "skeleton":
                cursor.execute("SELECT * FROM sound_skeletons WHERE name = %s", (guess_name,))
            else:
                cursor.execute("SELECT * FROM characters WHERE name = %s", (guess_name,))
            row = cursor.fetchone()
    finally:
        connection.close()
    return row
