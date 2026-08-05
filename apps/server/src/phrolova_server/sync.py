"""Sync nanoka.cc scraper data into the MySQL database.

Call `sync_all()` to pull latest data from nanoka.cc and upsert into
characters / sound_skeletons tables.
"""
from __future__ import annotations

import sys
import os

from phrolova_server.db import get_connection

# Characters to skip during sync (unreleased / duplicates)
_SKIP_CHAR_NAMES = {"清宵", "景燃"}
_SKIP_CHAR_PREFIXES = ("漂泊者",)


def _normalize_set(value: str) -> frozenset[str]:
    """Split comma-separated set_name into a sorted frozenset for comparison."""
    return frozenset(s.strip() for s in value.split(",") if s.strip())


def _echo_data_equal(a: dict, b: dict) -> bool:
    """Compare two echo data dicts, using set comparison for set_name."""
    for key in a:
        if key == "set_name":
            if _normalize_set(a[key]) != _normalize_set(b.get(key, "")):
                return False
        elif a[key] != b.get(key):
            return False
    return True


def _should_skip_char(name: str) -> bool:
    return name in _SKIP_CHAR_NAMES or name.startswith(_SKIP_CHAR_PREFIXES)

# Resolve repo root (sync.py → phrolova_server → src → server → apps → repo root)
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))


def _import_scraper():
    """Lazy-import the scraper so the server can start without it."""
    if _REPO_ROOT not in sys.path:
        sys.path.insert(0, _REPO_ROOT)
    last_err = None
    for module_name in ("nanoka_scraper", "phrolova_server.nanoka_scraper"):
        try:
            mod = __import__(module_name, fromlist=[
                "get_latest_version", "fetch_character_data", "fetch_echo_data",
                "fetch_sonata_data", "fetch_echo_detail",
                "ELEMENT_MAP", "WEAPON_MAP",
                "INTENSITY_TO_COST", "_filter_placeholder_items",
            ])
            return (
                mod.get_latest_version,
                mod.fetch_character_data,
                mod.fetch_echo_data,
                mod.fetch_sonata_data,
                mod.fetch_echo_detail,
                mod.ELEMENT_MAP,
                mod.WEAPON_MAP,
                mod.INTENSITY_TO_COST,
                mod._filter_placeholder_items,
            )
        except Exception as e:
            last_err = e
    raise RuntimeError(f"无法导入 scraper: {last_err}") from last_err


# ── Character sync ──

def _upsert_character(cur, name, attr, star, weapon, ver, allowed: set[str] | None, overrides: dict | None = None):
    """Upsert a character row, optionally only updating specified fields, with manual overrides."""
    all_fields = {"attribute": attr, "star_rating": star, "weapon": weapon}
    if overrides:
        for k in list(overrides):
            if k in all_fields and overrides[k] is not None:
                ov = str(overrides[k])
                if k == "star_rating":
                    try: all_fields[k] = int(ov)
                    except ValueError: pass
                else:
                    all_fields[k] = ov
    if allowed is not None:
        selected = {k: v for k, v in all_fields.items() if k in allowed}
    else:
        selected = all_fields
    if not selected:
        return
    set_clause = ", ".join(f"`{k}` = %s" for k in selected)
    vals = list(selected.values())
    # For INSERT: all columns, using selected values where available, NULL for others
    cur.execute(
        f"INSERT INTO characters (name, attribute, star_rating, weapon, birthplace, version) "
        f"VALUES (%s, %s, %s, %s, %s, %s) "
        f"ON DUPLICATE KEY UPDATE {set_clause}",
        (name,
         selected.get("attribute", attr),
         selected.get("star_rating", star),
         selected.get("weapon", weapon),
         "", ver,
         *vals),
    )


def _element_cn_to_db(raw: str) -> str:
    mapping = {
        "冰": "冷凝", "火": "热熔", "雷": "导电",
        "风": "气动", "光": "衍射", "暗": "湮灭",
        "零": "湮灭",
    }
    return mapping.get(raw, raw)


def _weapon_cn_to_db(raw: str) -> str:
    return raw


def sync_characters(version: str | None = None, entries: list[dict] | None = None) -> dict:
    """Pull character data from nanoka and upsert into characters table."""
    get_latest_version, fetch_character_data, _, _, _, ELEMENT_MAP, WEAPON_MAP, _, _filter_placeholder_items = _import_scraper()

    if version is None:
        version = get_latest_version()

    data = fetch_character_data(version)
    if not data:
        return {"ok": False, "message": "获取角色数据失败"}

    items = _filter_placeholder_items(data)
    entry_map: dict[str, set[str] | None] = {}
    overwrite_map: dict[str, dict[str, Any]] = {}
    if entries is not None:
        for e in entries:
            name = e.get("name", "")
            fields = e.get("fields")
            entry_map[name] = set(fields) if fields else None
            if e.get("overwrites"):
                overwrite_map[name] = e["overwrites"]
        items = [(cid, info) for cid, info in items if info.get("zh", "") in entry_map]
    inserted, updated, errors = 0, 0, 0
    seen_names: set[str] = set()
    conn = get_connection()

    try:
        with conn.cursor() as cur:
            for char_id, info in items:
                zh = info.get("zh", "").strip()
                if not zh or zh in seen_names:
                    continue
                seen_names.add(zh)
                if _should_skip_char(zh):
                    continue
                # If any similar-named entry already exists in DB, skip
                cur.execute("SELECT 1 FROM characters WHERE name = %s OR name LIKE %s LIMIT 1", (zh, f"{zh}%"))
                if cur.fetchone():
                    continue
                attribute = _element_cn_to_db(ELEMENT_MAP.get(info.get("element", 0), "?"))
                star = info.get("rank", 0)
                weapon = _weapon_cn_to_db(WEAPON_MAP.get(info.get("weapon", 0), "?"))
                ver = _char_id_to_version(char_id)

                try:
                    allowed = entry_map.get(zh) if entries is not None else None
                    _upsert_character(cur, zh, attribute, star, weapon, ver, allowed)
                    updated += 1
                except Exception:
                    errors += 1
                except Exception:
                    errors += 1

        conn.commit()
    finally:
        conn.close()

    return {
        "ok": True,
        "table": "characters",
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
        "total": len(items),
        "version": version,
    }


def _char_id_to_version(char_id: str) -> float:
    try:
        n = int(char_id)
        major = (n // 100) % 10
        minor = n % 100
        return float(f"{major}.{minor}")
    except (ValueError, TypeError):
        return 1.0


# ── Echo / sound_skeleton sync ──

def _upsert_echo(cur, name, attr, cost, is_ab, set_name, drop_loc, allowed: set[str] | None):
    all_fields = {
        "skill_attribute": attr, "cost": cost, "is_aberration": is_ab,
        "set_name": set_name, "drop_location": drop_loc,
    }
    if allowed is not None:
        selected = {k: v for k, v in all_fields.items() if k in allowed}
    else:
        selected = all_fields
    if not selected:
        return

    set_parts = []
    vals = []
    for k, v in selected.items():
        if k == "is_aberration":
            set_parts.append("is_aberration = IF(VALUES(is_aberration) = '有', '有', is_aberration)")
        elif k == "drop_location":
            set_parts.append("drop_location = IF(VALUES(drop_location) != '', VALUES(drop_location), drop_location)")
        else:
            set_parts.append(f"`{k}` = VALUES(`{k}`)")
            vals.append(v)
    # For INSERT VALUES, include all selected
    cur.execute(
        f"INSERT INTO sound_skeletons (name, skill_attribute, cost, is_aberration, set_name, drop_location) "
        f"VALUES (%s, %s, %s, %s, %s, %s) "
        f"ON DUPLICATE KEY UPDATE {', '.join(set_parts)}",
        (name, attr, cost, is_ab, set_name, drop_loc),
    )


def _echo_rank_to_cost(rank_list: list) -> int:
    if not rank_list:
        return 4
    return max(rank_list) if max(rank_list) > 0 else 4


def sync_echoes(version: str | None = None, entries: list[dict] | None = None) -> dict:
    """Pull echo data from nanoka and upsert into sound_skeletons table."""
    get_latest_version, _, fetch_echo_data, _, fetch_echo_detail, ELEMENT_MAP, _, INTENSITY_TO_COST, _filter_placeholder_items = _import_scraper()

    if version is None:
        version = get_latest_version()

    data = fetch_echo_data(version)
    if not data:
        return {"ok": False, "message": "获取声骸数据失败"}

    items = _filter_placeholder_items(data)
    entry_map: dict[str, set[str] | None] = {}
    if entries is not None:
        for e in entries:
            name = e.get("name", "")
            fields = e.get("fields")
            entry_map[name] = set(fields) if fields else None
        items = [(cid, info) for cid, info in items if info.get("zh", "") in entry_map]
    inserted, updated, errors = 0, 0, 0
    seen_names: set[str] = set()
    conn = get_connection()

    try:
        with conn.cursor() as cur:
            for echo_id, info in items:
                zh = info.get("zh", "").strip()
                if not zh or zh in seen_names:
                    continue
                seen_names.add(zh)
                intensity = info.get("intensity", 0)
                cost = INTENSITY_TO_COST.get(intensity, 4)

                # Fetch echo detail for accurate skill_attribute and set_name
                detail = fetch_echo_detail(version, echo_id) if fetch_echo_detail else None
                if detail:
                    skill_element = None
                    for dmg in detail.get("skill", {}).get("damage", {}).values():
                        if isinstance(dmg, dict) and "element" in dmg:
                            skill_element = dmg["element"]
                            break
                    if skill_element is not None and skill_element in ELEMENT_MAP:
                        attr = _element_cn_to_db(ELEMENT_MAP[skill_element])
                    else:
                        attr = _echo_code_to_attribute(info.get("code", ""))
                    detail_groups = detail.get("group", {})
                    set_names_list = [g.get("name", "") for g in detail_groups.values() if g.get("name")]
                    set_name = ", ".join(set_names_list) if set_names_list else ""
                    drop_loc = detail.get("place", "")
                else:
                    attr = _echo_code_to_attribute(info.get("code", ""))
                    set_name = ""
                    drop_loc = ""

                is_ab = "有" if info.get("phantom", "") else "无"

                try:
                    allowed = entry_map.get(zh) if entries is not None else None
                    _upsert_echo(cur, zh, attr, cost, is_ab, set_name, drop_loc, allowed)
                    updated += 1
                except Exception:
                    errors += 1

        conn.commit()
    finally:
        conn.close()

    return {
        "ok": True,
        "table": "sound_skeletons",
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
        "total": len(items),
        "version": version,
    }


def _echo_code_to_attribute(code: str) -> str:
    mapping = {
        "Ice": "冷凝", "Fire": "热熔", "Thunder": "导电",
        "Wind": "气动", "Light": "衍射", "Dark": "湮灭",
    }
    for key, val in mapping.items():
        if key.lower() in code.lower():
            return val
    return "湮灭"


# ── Preview (diff only, no writes) ──

def preview_characters(version: str | None = None) -> dict:
    """Compare remote character data with DB, return diff without applying."""
    get_latest_version, fetch_character_data, _, _, _, ELEMENT_MAP, WEAPON_MAP, _, _filter_placeholder_items = _import_scraper()

    if version is None:
        version = get_latest_version()

    data = fetch_character_data(version)
    if not data:
        return {"ok": False, "message": "获取角色数据失败"}

    items = _filter_placeholder_items(data)

    # Build local first so we can deduplicate against existing DB entries
    conn = get_connection()
    local = {}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, attribute, star_rating, weapon FROM characters")
            for row in cur.fetchall():
                local[row["name"]] = {
                    "attribute": row["attribute"],
                    "star_rating": row["star_rating"],
                    "weapon": row["weapon"],
                }
    finally:
        conn.close()

    remote = {}
    seen_names: set[str] = set()
    for char_id, info in items:
        zh = info.get("zh", "").strip()
        if not zh or zh in seen_names or _should_skip_char(zh):
            continue
        seen_names.add(zh)
        # Skip if nanoka name is a prefix of a DB entry (e.g. "漂泊者" matches "漂泊者-衍射")
        if any(local_name.startswith(zh) and local_name != zh for local_name in local):
            continue
        remote[zh] = {
            "attribute": _element_cn_to_db(ELEMENT_MAP.get(info.get("element", 0), "?")),
            "star_rating": info.get("rank", 0),
            "weapon": _weapon_cn_to_db(WEAPON_MAP.get(info.get("weapon", 0), "?")),
        }

    new_entries = []
    changed_entries = []
    for name, rdata in remote.items():
        if name not in local:
            new_entries.append({"name": name, **rdata})
        elif rdata != local[name]:
            changed_entries.append({"name": name, "before": local[name], "after": rdata})

    return {
        "ok": True,
        "table": "characters",
        "version": version,
        "total_remote": len(remote),
        "total_local": len(local),
        "new": new_entries,
        "changed": changed_entries,
        "unchanged": len(remote) - len(new_entries) - len(changed_entries),
    }


def preview_echoes(version: str | None = None) -> dict:
    """Compare remote echo data with DB, return diff without applying."""
    get_latest_version, _, fetch_echo_data, fetch_sonata_data, _, ELEMENT_MAP, _, INTENSITY_TO_COST, _filter_placeholder_items = _import_scraper()

    if version is None:
        version = get_latest_version()

    sonata = fetch_sonata_data(version) if fetch_sonata_data else {}
    group_map: dict[int, str] = {}
    for gid_str, g in sonata.items():
        try:
            gid = int(gid_str)
        except (ValueError, TypeError):
            continue
        gname = g.get("name", {})
        zh = gname.get("zh", "") if isinstance(gname, dict) else str(gname) if gname else ""
        if gid is not None and zh:
            group_map[gid] = zh

    data = fetch_echo_data(version)
    if not data:
        return {"ok": False, "message": "获取声骸数据失败"}

    items = _filter_placeholder_items(data)
    remote = {}
    seen_names: set[str] = set()
    for echo_id, info in items:
        zh = info.get("zh", "").strip()
        if not zh or zh in seen_names:
            continue
        seen_names.add(zh)
        intensity = info.get("intensity", 0)
        cost = INTENSITY_TO_COST.get(intensity, 4)
        element = info.get("element")
        if isinstance(element, int) and element in ELEMENT_MAP:
            attr = _element_cn_to_db(ELEMENT_MAP[element])
        else:
            code = info.get("code", "")
            attr = _echo_code_to_attribute(code)
        is_ab = "有" if info.get("phantom", "") else "无"
        groups = info.get("group", [])
        set_name = ", ".join(group_map.get(g, str(g)) for g in groups) if groups else ""
        remote[zh] = {
            "skill_attribute": attr,
            "cost": cost,
            "is_aberration": is_ab,
            "set_name": set_name,
            "drop_location": "",
        }

    conn = get_connection()
    local = {}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, skill_attribute, cost, is_aberration, set_name FROM sound_skeletons")
            for row in cur.fetchall():
                local[row["name"]] = {
                    "skill_attribute": row["skill_attribute"],
                    "cost": row["cost"],
                    "is_aberration": row["is_aberration"],
                    "set_name": row["set_name"],
                }
    finally:
        conn.close()

    new_entries = []
    changed_entries = []
    for name, rdata in remote.items():
        if name not in local:
            new_entries.append({"name": name, **rdata})
        elif not _echo_data_equal(rdata, local[name]):
            changed_entries.append({"name": name, "before": local[name], "after": rdata})

    return {
        "ok": True,
        "table": "sound_skeletons",
        "version": version,
        "total_remote": len(remote),
        "total_local": len(local),
        "new": new_entries,
        "changed": changed_entries,
        "unchanged": len(remote) - len(new_entries) - len(changed_entries),
    }


def preview_all() -> dict:
    get_latest_version, *_ = _import_scraper()
    version = get_latest_version()
    return {
        "version": version,
        "characters": preview_characters(version),
        "echoes": preview_echoes(version),
    }


# ── Orchestration ──

def sync_all(entries: list[dict] | None = None) -> dict:
    get_latest_version, *_ = _import_scraper()
    version = get_latest_version()
    char_result = sync_characters(version, entries=entries)
    echo_result = sync_echoes(version, entries=entries)
    return {
        "version": version,
        "characters": char_result,
        "echoes": echo_result,
    }
