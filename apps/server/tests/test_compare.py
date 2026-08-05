from phrolova_server.compare import (
    build_compare,
    build_compare_skeleton,
    compare_field,
    compare_field_skeleton,
    _cell_status,
    _is_near_version,
    _normalize_version,
    split_field,
)
from phrolova_server.compare import all_match as is_all_match


# ── split_field ──

def test_split_field_comma():
    assert split_field("湮灭,治疗") == ["湮灭", "治疗"]

def test_split_field_chinese_comma():
    assert split_field("今州，黑海岸") == ["今州", "黑海岸"]

def test_split_field_single():
    assert split_field("湮灭") == ["湮灭"]

def test_split_field_empty():
    assert split_field("") == []


# ── _normalize_version ──

def test_normalize_version_float():
    assert _normalize_version(2.0) == "2.0"
    assert _normalize_version(2.5) == "2.5"

def test_normalize_version_int():
    assert _normalize_version(2) == "2.0"

def test_normalize_version_string():
    assert _normalize_version("2.0") == "2.0"
    assert _normalize_version("2") == "2.0"


# ── _is_near_version ──

def test_is_near_exact_match():
    assert _is_near_version("2.0", "2.0")

def test_is_near_adjacent():
    assert _is_near_version("2.0", "2.1")
    assert _is_near_version("2.5", "2.7")

def test_is_near_far():
    assert not _is_near_version("1.0", "2.0")

def test_is_near_invalid():
    assert not _is_near_version("abc", "1.0")
    assert not _is_near_version("", "")


# ── compare_field (resonator) ──

def test_compare_field_match():
    assert compare_field("湮灭", "湮灭", "attribute") == "match"
    assert compare_field(5, 5, "star_rating") == "match"
    assert compare_field(2.5, 2.5, "version") == "match"

def test_compare_field_different():
    assert compare_field("湮灭", "冷凝", "attribute") == "different"
    assert compare_field("长刃", "佩枪", "weapon") == "different"

def test_compare_field_star_always_near():
    assert compare_field(5, 4, "star_rating") == "near"
    assert compare_field(5, 1, "star_rating") == "near"

def test_compare_field_version_near():
    assert compare_field(2.5, 2.4, "version") == "near"
    assert compare_field(2.5, 2.7, "version") == "near"


# ── compare_field_skeleton ──

def test_compare_field_skeleton_cost_near():
    assert compare_field_skeleton(4, 3, "cost") == "near"
    assert compare_field_skeleton(4, 5, "cost") == "near"

def test_compare_field_skeleton_cost_far():
    assert compare_field_skeleton(4, 1, "cost") == "different"

def test_compare_field_skeleton_is_aberration():
    assert compare_field_skeleton("有", "有", "is_aberration") == "match"
    assert compare_field_skeleton("有", "无", "is_aberration") == "different"


# ── _cell_status ──

def test_cell_status_exact_match():
    assert _cell_status(["A", "B"], ["A", "B"]) == "match"

def test_cell_status_partial_with_statuses():
    assert _cell_status(["A", "B"], ["A"], ["match"]) == "partial"

def test_cell_status_no_green():
    assert _cell_status(["A", "B"], ["C"], ["different"]) == "different"

def test_cell_status_green_but_count_diff_ge_2():
    assert _cell_status(["A", "B", "C"], ["A"], ["match"]) == "different"

def test_cell_status_empty_guess():
    assert _cell_status(["A"], []) == "different"

def test_cell_status_legacy_fallback():
    assert _cell_status(["A", "B"], ["A"]) == "partial"
    assert _cell_status(["A"], ["B"]) == "different"


# ── all_match ──

def test_all_match_resonator():
    compare = {"attribute": "match", "star_rating": "match", "weapon": "match",
               "birthplace": "match", "version": "match"}
    assert is_all_match(compare) is True

def test_all_match_resonator_fail():
    compare = {"attribute": "match", "star_rating": "near", "weapon": "match",
               "birthplace": "match", "version": "match"}
    assert is_all_match(compare) is False

def test_all_match_skeleton():
    compare = {
        "skill_attribute": {"cell": "match", "items": [{"attr": "A", "status": "match"}]},
        "cost": "match",
        "is_aberration": "match",
        "set_name": {"cell": "match", "items": [{"set": "X", "status": "match"}]},
        "drop_location": {"cell": "match", "items": [{"loc": "Y", "status": "match"}]},
    }
    assert is_all_match(compare) is True


# ── resonator compare ──

def test_resonator_compare_marks_star_rating_as_near():
    target = {
        "attribute": "湮灭",
        "star_rating": 5,
        "weapon": "音感仪",
        "birthplace": "未知",
        "version": 2.5,
    }
    guess = {
        "attribute": "导电",
        "star_rating": 4,
        "weapon": "长刃",
        "birthplace": "今州",
        "version": 2.2,
    }

    result = build_compare(target, guess)

    assert result["attribute"] == "different"
    assert result["star_rating"] == "near"
    assert result["weapon"] == "different"
    assert result["version"] == "different"


def test_skeleton_compare_marks_multi_value_fields():
    target = {
        "skill_attribute": "湮灭,治疗",
        "cost": 4,
        "is_aberration": "无",
        "set_name": "不绝余音,隐世回光",
        "drop_location": "今州,黑海岸",
    }
    guess = {
        "skill_attribute": "湮灭",
        "cost": 3,
        "is_aberration": "无",
        "set_name": "隐世回光",
        "drop_location": "今州",
    }

    result = build_compare_skeleton(target, guess)

    assert result["cost"] == "near"
    assert result["is_aberration"] == "match"
    assert result["skill_attribute"]["cell"] == "partial"
    assert result["set_name"]["cell"] == "partial"
    assert result["drop_location"]["cell"] == "partial"


def test_skeleton_cell_gray_when_count_diff_ge_2():
    """Has green token but count diff >= 2 → cell should be gray (different)."""
    target = {
        "skill_attribute": "湮灭,治疗,导电",
        "cost": 4,
        "is_aberration": "无",
        "set_name": "不绝余音,隐世回光,轻云出月",
        "drop_location": "今州,黑海岸,拉古那",
    }
    guess = {
        "skill_attribute": "湮灭",
        "cost": 3,
        "is_aberration": "无",
        "set_name": "隐世回光",
        "drop_location": "今州",
    }

    result = build_compare_skeleton(target, guess)

    assert result["skill_attribute"]["cell"] == "different"
    assert result["set_name"]["cell"] == "different"
    assert result["drop_location"]["cell"] == "different"


def test_skeleton_cell_gray_when_no_green():
    """No green tokens at all → cell should be gray (different)."""
    target = {
        "skill_attribute": "湮灭,治疗",
        "cost": 4,
        "is_aberration": "无",
        "set_name": "不绝余音,隐世回光",
        "drop_location": "今州,黑海岸",
    }
    guess = {
        "skill_attribute": "冷凝",
        "cost": 3,
        "is_aberration": "无",
        "set_name": "凝夜白霜",
        "drop_location": "拉古那",
    }

    result = build_compare_skeleton(target, guess)

    assert result["skill_attribute"]["cell"] == "different"
    assert result["set_name"]["cell"] == "different"
    assert result["drop_location"]["cell"] == "different"


def test_skeleton_cell_orange_when_count_diff_is_1():
    """Has green token and count diff = 1 → cell should be orange (partial)."""
    target = {
        "skill_attribute": "湮灭,治疗",
        "cost": 4,
        "is_aberration": "无",
        "set_name": "不绝余音,隐世回光",
        "drop_location": "今州,黑海岸",
    }
    guess = {
        "skill_attribute": "湮灭",
        "cost": 3,
        "is_aberration": "无",
        "set_name": "隐世回光",
        "drop_location": "今州",
    }

    result = build_compare_skeleton(target, guess)

    assert result["skill_attribute"]["cell"] == "partial"
    assert result["set_name"]["cell"] == "partial"
    assert result["drop_location"]["cell"] == "partial"
