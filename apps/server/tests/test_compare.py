from phrolova_server.compare import build_compare, build_compare_skeleton


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
