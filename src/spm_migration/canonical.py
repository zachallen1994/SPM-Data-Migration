"""Normalize raw Asana / Adaptive extracts into one shared (canonical) staging model.

Staging outputs (data/staging/):
  work_items.csv       project/demand candidates (one row per Asana project, Asana intake
                       task, Adaptive project or Adaptive request)
  tasks.csv            WBS rows (tasks, subtasks, milestones, optional phase rows)
  dependencies.csv     predecessor -> successor links
  status_updates.csv   project status history
  multi_homed_tasks.csv Asana tasks that live in more than one project
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from .common import iso_date, parse_date, read_jsonl, write_csv

WORK_ITEM_COLUMNS = [
    "source_system", "source_type", "source_id", "source_key", "source_url",
    "name", "description", "owner_email", "requester_email", "team", "department",
    "portfolio", "program", "project_type", "status", "phase", "health", "priority",
    "start_date", "end_date", "actual_start", "actual_end", "percent_complete",
    "created_at", "updated_at", "completed_at", "archived",
    "planned_cost", "actual_cost", "planned_hours", "actual_hours",
    "task_count", "open_task_count", "custom_fields",
]
TASK_COLUMNS = [
    "source_system", "source_id", "source_key", "source_url", "project_source_id",
    "parent_source_id", "level", "order", "name", "description", "assignee_email",
    "status", "is_milestone", "is_phase", "start_date", "end_date", "actual_start",
    "actual_end", "percent_complete", "planned_hours", "actual_hours", "custom_fields",
]
DEPENDENCY_COLUMNS = ["source_system", "predecessor_id", "successor_id", "type", "lag_days"]
STATUS_COLUMNS = ["source_system", "project_source_id", "as_on", "health", "title", "text", "author_email"]


# --------------------------------------------------------------------------- Asana

def _asana_custom(obj: dict) -> dict:
    return {cf["name"]: cf.get("display_value") for cf in obj.get("custom_fields") or []
            if cf.get("name") and cf.get("display_value") not in (None, "")}


def _email(user: Any) -> str:
    return (user or {}).get("email", "").strip().lower() if isinstance(user, dict) else ""


def _asana_task_status(task: dict, today: date) -> str:
    if task.get("completed"):
        return "completed"
    start = parse_date(task.get("start_on"))
    return "in_progress" if start and start <= today else "not_started"


def normalize_asana(raw_dir: Path, cfg: dict, today: date) -> dict[str, list[dict]]:
    projects = list(read_jsonl(raw_dir / "projects.jsonl"))
    raw_tasks = list(read_jsonl(raw_dir / "tasks.jsonl"))
    portfolio_of: dict[str, str] = {}
    for item in read_jsonl(raw_dir / "portfolio_items.jsonl"):
        portfolio_of.setdefault(item["item_gid"], item["portfolio_name"])
    intake = set(str(g) for g in cfg.get("intake_project_gids") or [])
    cf_map = cfg.get("custom_field_map") or {}

    # De-duplicate tasks (multi-homed tasks show up under every project they belong to)
    tasks: dict[str, dict] = {}
    multi_homed = []
    for t in raw_tasks:
        if t["gid"] in tasks:
            continue
        tasks[t["gid"]] = t
        homes = [m["project"]["gid"] for m in t.get("memberships") or [] if m.get("project")]
        if len(set(homes)) > 1:
            multi_homed.append({"source_id": t["gid"], "name": t.get("name"),
                                "assigned_project": t["_project_gid"], "all_projects": sorted(set(homes))})

    work_items, out_tasks, deps, statuses = [], [], [], []
    by_project: dict[str, list[dict]] = defaultdict(list)
    for t in tasks.values():
        by_project[t["_project_gid"]].append(t)

    def promoted(custom: dict, key: str) -> str:
        field = cf_map.get(key)
        return str(custom.get(field, "")) if field else ""

    for p in projects:
        gid = p["gid"]
        custom = _asana_custom(p)
        status_type = (p.get("current_status_update") or {}).get("status_type") or ""
        ptasks = by_project.get(gid, [])
        if p.get("completed"):
            status = "completed"
        elif p.get("archived"):
            status = "archived"
        elif status_type == "on_hold":
            status = "on_hold"
        else:
            status = "active"
        work_items.append({
            "source_system": "asana",
            "source_type": "asana_intake_project" if gid in intake else "asana_project",
            "source_id": gid, "source_key": gid, "source_url": p.get("permalink_url"),
            "name": p.get("name"), "description": p.get("notes"),
            "owner_email": _email(p.get("owner")),
            "requester_email": promoted(custom, "requester_email").lower(),
            "team": (p.get("team") or {}).get("name"),
            "department": promoted(custom, "department"),
            "portfolio": portfolio_of.get(gid, ""), "program": promoted(custom, "program"),
            "status": status, "phase": promoted(custom, "phase"), "health": status_type,
            "priority": promoted(custom, "priority"),
            "start_date": iso_date(p.get("start_on")), "end_date": iso_date(p.get("due_on")),
            "created_at": iso_date(p.get("created_at")), "updated_at": iso_date(p.get("modified_at")),
            "completed_at": iso_date(p.get("completed_at")), "archived": bool(p.get("archived")),
            "percent_complete": _pct_done(ptasks),
            "task_count": len(ptasks), "open_task_count": sum(1 for t in ptasks if not t.get("completed")),
            "custom_fields": custom,
        })

        if gid in intake:
            # Each intake task is a request -> demand candidate, not a WBS row
            for t in ptasks:
                if t.get("parent"):
                    continue
                tc = _asana_custom(t)
                work_items.append({
                    "source_system": "asana", "source_type": "asana_intake_task",
                    "source_id": t["gid"], "source_key": t["gid"], "source_url": t.get("permalink_url"),
                    "name": t.get("name"), "description": t.get("notes"),
                    "owner_email": _email(t.get("assignee")),
                    "requester_email": (promoted(tc, "requester_email") or _email(t.get("created_by"))).lower(),
                    "department": promoted(tc, "department"), "program": promoted(tc, "program"),
                    "portfolio": portfolio_of.get(gid, ""),
                    "status": "completed" if t.get("completed") else "open",
                    "phase": promoted(tc, "phase"), "priority": promoted(tc, "priority"),
                    "start_date": iso_date(t.get("start_on")), "end_date": iso_date(t.get("due_on") or t.get("due_at")),
                    "created_at": iso_date(t.get("created_at")), "updated_at": iso_date(t.get("modified_at")),
                    "completed_at": iso_date(t.get("completed_at")), "archived": False,
                    "task_count": t.get("num_subtasks") or 0, "custom_fields": tc,
                })
            continue

        phase_rows = {}
        if cfg.get("sections_as_phases"):
            for t in ptasks:
                sec = _section_for(t, gid)
                if sec and sec["gid"] not in phase_rows:
                    phase_rows[sec["gid"]] = {
                        "source_system": "asana", "source_id": f"section-{sec['gid']}",
                        "source_key": sec.get("name"), "project_source_id": gid, "parent_source_id": "",
                        "name": sec.get("name") or "(Untitled section)", "is_phase": True,
                        "is_milestone": False, "status": "", "custom_fields": {},
                    }
            out_tasks.extend(phase_rows.values())

        for t in ptasks:
            parent = (t.get("parent") or {}).get("gid") or ""
            if not parent and phase_rows:
                sec = _section_for(t, gid)
                parent = f"section-{sec['gid']}" if sec else ""
            start, end = iso_date(t.get("start_on")), iso_date(t.get("due_on") or t.get("due_at"))
            out_tasks.append({
                "source_system": "asana", "source_id": t["gid"], "source_key": t["gid"],
                "source_url": t.get("permalink_url"), "project_source_id": gid, "parent_source_id": parent,
                "name": t.get("name"), "description": t.get("notes"),
                "assignee_email": _email(t.get("assignee")),
                "status": _asana_task_status(t, today),
                "is_milestone": t.get("resource_subtype") == "milestone", "is_phase": False,
                "start_date": start or end, "end_date": end or start,
                "actual_end": iso_date(t.get("completed_at")),
                "percent_complete": 100 if t.get("completed") else 0,
                "custom_fields": _asana_custom(t),
            })
            for dep in t.get("dependencies") or []:
                deps.append({"source_system": "asana", "predecessor_id": dep["gid"],
                             "successor_id": t["gid"], "type": "fs", "lag_days": 0})

    for su in read_jsonl(raw_dir / "status_updates.jsonl"):
        statuses.append({"source_system": "asana", "project_source_id": su["_project_gid"],
                         "as_on": iso_date(su.get("created_at")), "health": su.get("status_type"),
                         "title": su.get("title"), "text": su.get("text"),
                         "author_email": _email(su.get("author"))})

    return {"work_items": work_items, "tasks": out_tasks, "dependencies": deps,
            "status_updates": statuses, "multi_homed_tasks": multi_homed}


def _section_for(task: dict, project_gid: str) -> dict | None:
    for m in task.get("memberships") or []:
        if (m.get("project") or {}).get("gid") == project_gid and m.get("section"):
            return m["section"]
    return None


def _pct_done(tasks: list[dict]) -> int | str:
    if not tasks:
        return ""
    return round(100 * sum(1 for t in tasks if t.get("completed")) / len(tasks))


# --------------------------------------------------------------------------- Adaptive

def get_path(entity: dict, path: str) -> Any:
    """Resolve 'ProjectManager.Email' against nested or flat CZQL results."""
    if path in entity:
        return _scalar(entity[path])
    cur: Any = entity
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return ""
        cur = cur[part]
    return _scalar(cur)


def _scalar(value: Any) -> Any:
    if isinstance(value, dict):
        if "value" in value and "unit" in value:          # duration {value, unit}
            return _to_hours(value)
        if "id" in value:                                # bare reference / pick-list
            return str(value["id"])
        return json.dumps(value)
    return "" if value is None else value


def _to_hours(duration: dict) -> float | str:
    try:
        v = float(duration["value"])
    except (TypeError, ValueError):
        return ""
    unit = str(duration.get("unit", "Hours")).lower()
    factor = {"minutes": 1 / 60, "hours": 1, "days": 8, "weeks": 40, "months": 160}.get(unit, 1)
    return round(v * factor, 2)


def _ref_tail(ref: str) -> str:
    """'/PickListValue/Normal' -> 'Normal'; plain values untouched."""
    return ref.rsplit("/", 1)[-1] if isinstance(ref, str) and ref.startswith("/") else ref


def _adaptive_custom(entity: dict) -> dict:
    return {k: _scalar(v) for k, v in entity.items() if k.startswith("C_") and v not in (None, "")}


def normalize_adaptive(raw_dir: Path, cfg: dict, today: date) -> dict[str, list[dict]]:
    fmap = cfg["field_map"]
    work_items, tasks, deps = [], [], []
    for entity_name, spec in cfg["entities"].items():
        role = spec["role"]
        rows = list(read_jsonl(raw_dir / f"{entity_name}.jsonl"))
        if role in ("project", "request"):
            m = fmap[role]
            for e in rows:
                rec = {"source_system": "adaptive",
                       "source_type": f"adaptive_{role}", "source_id": e["id"]}
                for canon, api in m.items():
                    val = get_path(e, api)
                    rec[canon] = _ref_tail(val) if canon in ("status", "phase", "health", "priority", "project_type") else val
                for k in ("owner_email", "requester_email"):
                    rec[k] = str(rec.get(k) or "").strip().lower()
                for k in ("start_date", "end_date", "actual_start", "actual_end", "created_at", "updated_at"):
                    rec[k] = iso_date(rec.get(k))
                rec["custom_fields"] = _adaptive_custom(e)
                rec["archived"] = False
                work_items.append(rec)
        elif role in ("task", "milestone"):
            m = fmap["task"]
            for e in rows:
                project_id = str(get_path(e, m["project_id"]))
                parent_id = str(get_path(e, m["parent_id"]))
                rec = {"source_system": "adaptive", "source_id": e["id"],
                       "project_source_id": project_id,
                       "parent_source_id": "" if parent_id == project_id else parent_id,
                       "is_milestone": role == "milestone", "is_phase": False}
                for canon, api in m.items():
                    if canon not in ("project_id", "parent_id"):
                        rec[canon] = get_path(e, api)
                rec["status"] = _ref_tail(rec.get("status", ""))
                rec["assignee_email"] = str(rec.get("assignee_email") or "").lower()
                for k in ("start_date", "end_date", "actual_start", "actual_end"):
                    rec[k] = iso_date(rec.get(k))
                rec["custom_fields"] = _adaptive_custom(e)
                tasks.append(rec)
        elif role == "dependency":
            m = fmap["dependency"]
            for e in rows:
                lag = get_path(e, m["lag"])
                deps.append({"source_system": "adaptive",
                             "predecessor_id": str(get_path(e, m["predecessor_id"])),
                             "successor_id": str(get_path(e, m["successor_id"])),
                             "type": _ref_tail(get_path(e, m["type"])) or "fs",
                             "lag_days": round(float(lag) / 8, 2) if lag not in ("", None) else 0})

    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for t in tasks:
        counts[t["project_source_id"]][0] += 1
        if str(t.get("status", "")).lower() not in ("completed", "cancelled"):
            counts[t["project_source_id"]][1] += 1
    for w in work_items:
        w["task_count"], w["open_task_count"] = counts.get(w["source_id"], [0, 0])
    return {"work_items": work_items, "tasks": tasks, "dependencies": deps,
            "status_updates": [], "multi_homed_tasks": []}


# --------------------------------------------------------------------------- driver

def assign_levels_and_order(tasks: list[dict]) -> list[dict]:
    """Compute WBS level (1 = directly under project), sibling order, and sort parents first."""
    by_id = {(t["source_system"], t["source_id"]): t for t in tasks}

    def level(t: dict, seen: set) -> int:
        pid = t.get("parent_source_id")
        key = (t["source_system"], pid)
        if not pid or key not in by_id or key in seen:
            if pid and key not in by_id:
                t["parent_source_id"] = ""       # orphan -> attach to project
            return 1
        return level(by_id[key], seen | {key}) + 1

    sibling_counter: dict[tuple, int] = defaultdict(int)
    for t in tasks:
        t["level"] = level(t, {(t["source_system"], t["source_id"])})
        sib = (t["source_system"], t["project_source_id"], t.get("parent_source_id") or "")
        sibling_counter[sib] += 1
        t["order"] = sibling_counter[sib]
    return sorted(tasks, key=lambda t: (t["level"],))


def normalize(settings: dict, today: date) -> dict[str, int]:
    raw = Path(settings["paths"]["raw"])
    staging = Path(settings["paths"]["staging"])
    combined: dict[str, list[dict]] = defaultdict(list)
    if (raw / "asana").exists() and "asana" in settings:
        for k, v in normalize_asana(raw / "asana", settings["asana"], today).items():
            combined[k].extend(v)
    if (raw / "adaptive").exists() and "adaptive" in settings:
        for k, v in normalize_adaptive(raw / "adaptive", settings["adaptive"], today).items():
            combined[k].extend(v)
    combined["tasks"] = assign_levels_and_order(combined["tasks"])
    return {
        "work_items": write_csv(staging / "work_items.csv", combined["work_items"], WORK_ITEM_COLUMNS),
        "tasks": write_csv(staging / "tasks.csv", combined["tasks"], TASK_COLUMNS),
        "dependencies": write_csv(staging / "dependencies.csv", combined["dependencies"], DEPENDENCY_COLUMNS),
        "status_updates": write_csv(staging / "status_updates.csv", combined["status_updates"], STATUS_COLUMNS),
        "multi_homed_tasks": write_csv(staging / "multi_homed_tasks.csv", combined["multi_homed_tasks"],
                                       ["source_id", "name", "assigned_project", "all_projects"]),
    }
