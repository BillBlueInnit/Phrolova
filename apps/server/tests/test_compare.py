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
