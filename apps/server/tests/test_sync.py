"""Unit tests for sync module — mapping and preview logic."""
from unittest.mock import MagicMock, patch

from phrolova_server import sync


class TestCharIdToVersion:
    def test_standard_id(self):
        assert sync._char_id_to_version("1104") == 1.4
        assert sync._char_id_to_version("1202") == 2.2
        assert sync._char_id_to_version("2501") == 5.1

    def test_bad_id_returns_default(self):
        assert sync._char_id_to_version("abc") == 1.0
        assert sync._char_id_to_version("") == 1.0


class TestElementMapping:
    def test_cn_to_db(self):
        assert sync._element_cn_to_db("冰") == "冷凝"
        assert sync._element_cn_to_db("火") == "热熔"
        assert sync._element_cn_to_db("雷") == "导电"
        assert sync._element_cn_to_db("风") == "气动"
        assert sync._element_cn_to_db("光") == "衍射"
        assert sync._element_cn_to_db("暗") == "湮灭"
        assert sync._element_cn_to_db("零") == "湮灭"

    def test_unknown_passthrough(self):
        assert sync._element_cn_to_db("未知") == "未知"


class TestWeaponMapping:
    def test_passthrough(self):
        assert sync._weapon_cn_to_db("迅刀") == "迅刀"
        assert sync._weapon_cn_to_db("长刃") == "长刃"
        assert sync._weapon_cn_to_db("佩枪") == "佩枪"
        assert sync._weapon_cn_to_db("臂铠") == "臂铠"
        assert sync._weapon_cn_to_db("音感仪") == "音感仪"


class TestEchoRankToCost:
    def test_empty_rank_returns_4(self):
        assert sync._echo_rank_to_cost([]) == 4

    def test_max_value(self):
        assert sync._echo_rank_to_cost([1, 3, 4]) == 4
        assert sync._echo_rank_to_cost([1]) == 1
        assert sync._echo_rank_to_cost([4, 1]) == 4


class TestEchoCodeToAttribute:
    def test_known_codes(self):
        assert sync._echo_code_to_attribute("Ice") == "冷凝"
        assert sync._echo_code_to_attribute("Fire") == "热熔"
        assert sync._echo_code_to_attribute("Thunder") == "导电"
        assert sync._echo_code_to_attribute("Wind") == "气动"
        assert sync._echo_code_to_attribute("Light") == "衍射"
        assert sync._echo_code_to_attribute("Dark") == "湮灭"

    def test_case_insensitive(self):
        assert sync._echo_code_to_attribute("ice") == "冷凝"
        assert sync._echo_code_to_attribute("FIRE") == "热熔"

    def test_unknown_returns_default(self):
        assert sync._echo_code_to_attribute("") == "湮灭"
        assert sync._echo_code_to_attribute("Unknown") == "湮灭"


class TestPreviewCharacters:
    def test_new_and_changed_entries(self):
        mock_char_data = {
            "1101": {"zh": "秧秧", "element": 4, "rank": 4, "weapon": 1},
        }
        mock_db_rows = [
            {"name": "秧秧", "attribute": "气动", "star_rating": 3, "weapon": "佩枪"},
        ]

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_cursor.fetchall.return_value = mock_db_rows

        placeholder_filter = lambda data: list(data.items())
        with patch.object(sync, "get_connection", return_value=mock_conn), \
             patch.object(sync, "_import_scraper", return_value=(
                 lambda: "v1", lambda v: mock_char_data, None, None, None,
                 {4: "风"}, {1: "佩枪"}, {0: 1, 1: 3, 2: 4, 3: 4},
                 placeholder_filter,
             )):
            result = sync.preview_characters()

        assert result["ok"] is True
        assert result["total_remote"] == 1
        assert result["new"] == []
        assert len(result["changed"]) == 1  # star_rating differs
        assert result["changed"][0]["name"] == "秧秧"
        assert result["changed"][0]["before"]["star_rating"] == 3
        assert result["changed"][0]["after"]["star_rating"] == 4


class TestPreviewEchoes:
    def test_new_entry(self):
        mock_echo_data = {
            "e1": {"zh": "梦魇", "intensity": 2, "group": [1], "code": "Dark", "phantom": ""},
        }
        mock_db_rows: list = []

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_cursor.fetchall.return_value = mock_db_rows

        placeholder_filter = lambda data: list(data.items())
        with patch.object(sync, "get_connection", return_value=mock_conn), \
             patch.object(sync, "_import_scraper", return_value=(
                 lambda: "v1", None, lambda v: mock_echo_data, lambda v: {"1": {"id": 1, "name": {"zh": "不息"}}}, None,
                 None, None, {0: 1, 1: 3, 2: 4, 3: 4},
                 placeholder_filter,
             )):
            result = sync.preview_echoes()

        assert result["ok"] is True
        assert result["total_remote"] == 1
        assert result["total_local"] == 0
        assert len(result["new"]) == 1
        assert result["new"][0]["name"] == "梦魇"
        assert result["new"][0]["cost"] == 4  # intensity=2 → cost=4
        assert result["new"][0]["set_name"] == "不息"  # group 1 → name from sonata
        assert result["new"][0]["skill_attribute"] == "湮灭"


class TestSyncFailOnMissingData:
    def test_empty_character_data(self):
        with patch.object(sync, "_import_scraper", return_value=(
            lambda: "v1", lambda v: {}, None, None, None, {}, {}, {0: 1, 1: 3, 2: 4, 3: 4}, None,
        )):
            result = sync.sync_characters()
            assert result["ok"] is False

    def test_empty_echo_data(self):
        with patch.object(sync, "_import_scraper", return_value=(
            lambda: "v1", None, lambda v: {}, lambda v: {}, None, {}, {}, {0: 1, 1: 3, 2: 4, 3: 4}, None,
        )):
            result = sync.sync_echoes()
            assert result["ok"] is False
