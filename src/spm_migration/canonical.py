"""Normalize raw Asana / Adaptive extracts into one shared (canonical) staging model.

Staging outputs (data/staging/):
  work_items.csv       project/demand candidates: Asana projects, Asana tracker items (tasks in
                       a portfolio-tracker project), Asana intake tasks, Adaptive projects/requests
  tasks.csv            WBS rows (tasks, subtasks, milestones, optional phase rows)
  dependencies.csv     predecessor -> successor links
  status_updates.csv   project status history
  multi_homed_tasks.csv Asana tasks that live in more than one project

Asana patterns supported (settings.asana):
  standard project        project = work item, its tasks = WBS
  intake_project_gids     each top-level task = a request (demand candidate)
  tracker_project_gids    each top-level task = a project/demand; its subtasks = WBS
  plan links (CSV)        a separate Asana "plan" project whose tasks are the WBS of a tracker item
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from .common import (iso_date, parse_date, parse_percent, read_csv, read_jsonl, repair_text,
                     split_multi, write_csv)

WORK_ITEM_COLUMNS = [
    "source_system", "source_type", "source_id", "source_key", "source_url",
    "name", "description", "owner_email", "requester_email", "team", "department",
    "portfolio", "program", "project_type", "status", "phase", "health", "priority",
    "start_date", "end_date", "actual_start", "actual_end", "percent_complete",
    "created_at", "updated_at", "completed_at", "archived",
    "planned_cost", "actual_cost", "planned_hours", "actual_hours",
    "task_count", "open_task_count",
]
# Business attributes promoted from custom fields (Asana custom_field_map / Adaptive field_map)
EXTENDED_COLUMNS = [
    "business_owner", "executive_sponsor", "capital_id", "cost_center", "business_unit",
    "impacted_business_units", "sites", "business_category", "expense_type", "funding_type",
    "funding_source", "size", "estimate_type", "it_integrations", "strategy_focus",
    "strategy_timeline", "coes_engaged", "cross_impacts", "go_live_date",
    "request_received", "request_assigned", "estimate_complete", "ready_for_delivery",
    "project_assigned", "health_budget", "health_resource", "health_risk",
    "health_schedule", "health_scope", "status_notes", "tags",
]
TASK_COLUMNS = [
    "source_system", "source_id", "source_key", "source_url", "project_source_id",
    "parent_source_id", "level", "order", "name", "description", "assignee_email",
    "additional_assignees", "status", "is_milestone", "is_phase", "start_date", "end_date",
    "actual_start", "actual_end", "percent_complete", "planned_hours", "actual_hours",
    "custom_fields",
]
DEPENDENCY_COLUMNS = ["source_system", "predecessor_id", "successor_id", "type", "lag_days"]
STATUS_COLUMNS = ["source_system", "project_source_id", "as_on", "health", "title", "text", "author_email"]

DATE_KEYS = {"start_date", "end_date", "actual_start", "actual_end", "created_at", "updated_at",
             "completed_at", "go_live_date", "request_received", "request_assigned",
             "estimate_complete", "ready_for_delivery", "project_assigned"}
TEXT_KEYS = {"name", "description", "status_notes"}


# --------------------------------------------------------------------------- Asana

def _asana_custom(obj: dict) -> dict:
    """{field name: value}; people-type fields become a comma list of emails (or names)."""
    out = {}
    for cf in obj.get("custom_fields") or []:
        name = cf.get("name")
        if not name:
            continue
        people = cf.get("people_value")
        if people:
            value = ", ".join(p.get("email") or p.get("name", "") for p in people)
        else:
            value = cf.get("display_value")
        if value not in (None, ""):
            out[name] = value
    return out


def _email(user: Any) -> str:
    return (user or {}).get("email", "").strip().lower() if isinstance(user, dict) else ""


def _promote(rec: dict, custom: dict, cf_map: dict) -> dict:
    for canon, field in (cf_map or {}).items():
        if field and custom.get(field) not in (None, ""):
            value = custom[field]
            rec[canon] = iso_date(value) if canon in DATE_KEYS else value
    return rec


def _section_for(task: dict, project_gid: str) -> dict | None:
    for m in task.get("memberships") or []:
        if (m.get("project") or {}).get("gid") == project_gid and m.get("section"):
            return m["section"]
    return None


def _asana_work_item_from_task(t: dict, source_type: str, project_gid: str, cfg: dict) -> dict:
    """Intake request or tracker item: an Asana *task* that becomes a project/demand."""
    custom = _asana_custom(t)
    rec = {
        "source_system": "asana", "source_type": source_type,
        "source_id": t["gid"], "source_key": t["gid"], "source_url": t.get("permalink_url"),
        "name": repair_text(t.get("name")), "description": repair_text(t.get("notes")),
        "owner_email": _email(t.get("assignee")),
        "requester_email": _email(t.get("created_by")),
        "status": "completed" if t.get("completed") else "open",
        "start_date": iso_date(t.get("start_on")), "end_date": iso_date(t.get("due_on") or t.get("due_at")),
        "created_at": iso_date(t.get("created_at")), "updated_at": iso_date(t.get("modified_at")),
        "completed_at": iso_date(t.get("completed_at")), "archived": False,
        "tags": ", ".join(tag.get("name", "") for tag in t.get("tags") or []),
        "task_count": t.get("num_subtasks") or 0, "custom_fields": custom,
    }
    section = _section_for(t, project_gid)
    if section and cfg.get("tracker_section_as"):
        rec[cfg["tracker_section_as"]] = section.get("name", "")
    return _promote(rec, custom, cfg.get("custom_field_map"))


def _asana_wbs_row(t: dict, project_source_id: str, parent: str, today: date, cfg: dict) -> dict:
    custom = _asana_custom(t)
    tmap = cfg.get("task_custom_field_map") or {}
    status = custom.get(tmap.get("status", ""), "")
    if not status:
        start = parse_date(t.get("start_on"))
        status = ("completed" if t.get("completed")
                  else "in_progress" if start and start <= today else "not_started")
    pct = parse_percent(custom.get(tmap.get("percent_complete", ""), ""))
    if pct == "" or t.get("completed"):
        pct = 100 if t.get("completed") else (pct if pct != "" else 0)
    milestone_re = cfg.get("milestone_name_regex")
    is_milestone = t.get("resource_subtype") == "milestone" or bool(
        milestone_re and re.search(milestone_re, t.get("name") or ""))
    assignee = _email(t.get("assignee"))
    followers = [_email(f) for f in t.get("followers") or []]
    start, end = iso_date(t.get("start_on")), iso_date(t.get("due_on") or t.get("due_at"))
    return {
        "source_system": "asana", "source_id": t["gid"], "source_key": t["gid"],
        "source_url": t.get("permalink_url"), "project_source_id": project_source_id,
        "parent_source_id": parent, "name": repair_text(t.get("name")),
        "description": repair_text(t.get("notes")), "assignee_email": assignee,
        "additional_assignees": ", ".join(f for f in followers if f and f != assignee),
        "status": status, "is_milestone": is_milestone, "is_phase": False,
        "start_date": start or end, "end_date": end or start,
        "actual_end": iso_date(t.get("completed_at")), "percent_complete": pct,
        "custom_fields": custom,
    }


def _deps(t: dict) -> list[dict]:
    return [{"source_system": "asana", "predecessor_id": d["gid"], "successor_id": t["gid"],
             "type": "fs", "lag_days": 0} for d in t.get("dependencies") or []]


def normalize_asana(raw_dir: Path, cfg: dict, today: date, plan_links: dict[str, str]) -> dict[str, list[dict]]:
    projects = list(read_jsonl(raw_dir / "projects.jsonl"))
    raw_tasks = list(read_jsonl(raw_dir / "tasks.jsonl"))
    portfolio_of: dict[str, str] = {}
    for item in read_jsonl(raw_dir / "portfolio_items.jsonl"):
        portfolio_of.setdefault(item["item_gid"], item["portfolio_name"])
    intake = {str(g) for g in cfg.get("intake_project_gids") or []}
    trackers = {str(g) for g in cfg.get("tracker_project_gids") or []}
    # Projects built from export files carry their role (see exports.py)
    intake |= {p["gid"] for p in projects if p.get("_role") == "intake"}
    trackers |= {p["gid"] for p in projects if p.get("_role") == "tracker"}

    tasks: dict[str, dict] = {}
    multi_homed = []
    for t in raw_tasks:
        if t["gid"] in tasks:
            continue
        tasks[t["gid"]] = t
        homes = {m["project"]["gid"] for m in t.get("memberships") or [] if m.get("project")}
        if len(homes) > 1:
            multi_homed.append({"source_id": t["gid"], "name": t.get("name"),
                                "assigned_project": t["_project_gid"], "all_projects": sorted(homes)})
    by_project: dict[str, list[dict]] = defaultdict(list)
    for t in tasks.values():
        by_project[t["_project_gid"]].append(t)

    work_items, out_tasks, deps, statuses = [], [], [], []
    for p in projects:
        gid = p["gid"]
        custom = _asana_custom(p)
        status_type = (p.get("current_status_update") or {}).get("status_type") or ""
        ptasks = by_project.get(gid, [])
        source_type = ("asana_plan_project" if gid in plan_links else
                       "asana_intake_project" if gid in intake else
                       "asana_tracker_project" if gid in trackers else "asana_project")
        status = ("completed" if p.get("completed") else "archived" if p.get("archived")
                  else "on_hold" if status_type == "on_hold" else "active")
        work_items.append(_promote({
            "source_system": "asana", "source_type": source_type,
            "source_id": gid, "source_key": gid, "source_url": p.get("permalink_url"),
            "name": repair_text(p.get("name")), "description": repair_text(p.get("notes")),
            "owner_email": _email(p.get("owner")), "team": (p.get("team") or {}).get("name"),
            "portfolio": portfolio_of.get(gid, ""), "status": status, "health": status_type,
            "start_date": iso_date(p.get("start_on")), "end_date": iso_date(p.get("due_on")),
            "created_at": iso_date(p.get("created_at")), "updated_at": iso_date(p.get("modified_at")),
            "completed_at": iso_date(p.get("completed_at")), "archived": bool(p.get("archived")),
            "custom_fields": custom,
        }, custom, cfg.get("custom_field_map")))

        if gid in intake:
            for t in ptasks:
                if not t.get("parent"):
                    item = _asana_work_item_from_task(t, "asana_intake_task", gid, cfg)
                    item["portfolio"] = portfolio_of.get(gid, "")
                    work_items.append(item)
            continue

        if gid in trackers:
            tmap = {t["gid"]: t for t in ptasks}

            def root_of(t: dict) -> dict:
                seen = set()
                while (t.get("parent") or {}).get("gid") in tmap and t["gid"] not in seen:
                    seen.add(t["gid"])
                    t = tmap[t["parent"]["gid"]]
                return t

            for t in ptasks:
                root = root_of(t)
                if root is t:
                    item = _asana_work_item_from_task(t, "asana_tracker_item", gid, cfg)
                    item.setdefault("portfolio", portfolio_of.get(gid, ""))
                    work_items.append(item)
                else:
                    parent = t["parent"]["gid"]
                    out_tasks.append(_asana_wbs_row(t, root["gid"], "" if parent == root["gid"] else parent,
                                                    today, cfg))
                deps.extend(_deps(t))
            continue

        # Standard project (or a plan project whose WBS belongs to a tracker item)
        owner_id = plan_links.get(gid, gid)
        phase_rows = {}
        if cfg.get("sections_as_phases"):
            for t in ptasks:
                sec = _section_for(t, gid)
                if sec and sec["gid"] not in phase_rows and not (
                        cfg.get("skip_untitled_sections", True) and re.match(r"(?i)untitled section", sec.get("name") or "")):
                    phase_rows[sec["gid"]] = {
                        "source_system": "asana", "source_id": f"section-{sec['gid']}",
                        "source_key": sec.get("name"), "project_source_id": owner_id, "parent_source_id": "",
                        "name": sec.get("name") or "(Untitled section)", "is_phase": True,
                        "is_milestone": False, "status": "", "custom_fields": {},
                    }
            out_tasks.extend(phase_rows.values())
        for t in ptasks:
            parent = (t.get("parent") or {}).get("gid") or ""
            if not parent and phase_rows:
                sec = _section_for(t, gid)
                parent = f"section-{sec['gid']}" if sec and sec["gid"] in phase_rows else ""
            out_tasks.append(_asana_wbs_row(t, owner_id, parent, today, cfg))
            deps.extend(_deps(t))

    for su in read_jsonl(raw_dir / "status_updates.jsonl"):
        statuses.append({"source_system": "asana",
                         "project_source_id": plan_links.get(su["_project_gid"], su["_project_gid"]),
                         "as_on": iso_date(su.get("created_at")), "health": su.get("status_type"),
                         "title": repair_text(su.get("title")), "text": repair_text(su.get("text")),
                         "author_email": _email(su.get("author"))})

    # Roll up task counts / % complete from the WBS actually attached to each work item
    stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for t in out_tasks:
        if t.get("is_phase"):
            continue
        s = stats[t["project_source_id"]]
        s[0] += 1
        if t.get("percent_complete") == 100 or str(t.get("status", "")).lower() == "completed":
            s[1] += 1
    for w in work_items:
        if w["source_type"] == "asana_intake_task":
            continue
        total, done = stats.get(w["source_id"], [0, 0])
        w["task_count"], w["open_task_count"] = total, total - done
        if total and w.get("percent_complete") in (None, ""):
            w["percent_complete"] = round(100 * done / total)
    rollup_conflicts = _rollup_task_fields(work_items, out_tasks, cfg.get("task_rollups") or {})
    return {"work_items": work_items, "tasks": out_tasks, "dependencies": deps,
            "status_updates": statuses, "multi_homed_tasks": multi_homed,
            "rollup_conflicts": rollup_conflicts}


def _rollup_task_fields(work_items: list[dict], tasks: list[dict], rollups: dict) -> list[dict]:
    """Fill project-level fields from task-level custom fields ('parent.<field>' mappings).

    rollups = {canonical_field: task custom field name}. The most common task value wins,
    but only when the project has no value of its own. Multi-select values count per item.
    Projects whose tasks disagree are reported in rollup_conflicts.csv.
    """
    if not rollups:
        return []
    values: dict[tuple, Counter] = defaultdict(Counter)
    for t in tasks:
        custom = t.get("custom_fields") or {}
        for canon, field in rollups.items():
            for v in split_multi(custom.get(field, "")):
                values[(t["project_source_id"], canon)][v] += 1
    conflicts = []
    for w in work_items:
        for canon, field in rollups.items():
            counts = values.get((w["source_id"], canon))
            if not counts:
                continue
            winner = counts.most_common(1)[0][0]
            existing = w.get(canon) or ""
            if not existing:
                w[canon] = winner
            if len(counts) > 1 or (existing and existing != winner):
                conflicts.append({"source_system": w["source_system"], "source_id": w["source_id"],
                                  "name": w.get("name"), "field": canon, "task_field": field,
                                  "project_value": existing, "task_values": dict(counts),
                                  "used": existing or winner})
    return conflicts


# --------------------------------------------------------------------------- Adaptive

_REF_RE = re.compile(r"^/[A-Za-z_]+/[^/]+$")


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
    if isinstance(value, list):                          # multi-select pick lists
        return "; ".join(str(_scalar(v)) for v in value if v not in (None, ""))
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


def _ref_tail(value: Any) -> Any:
    """'/PickListValue/Normal' -> 'Normal'; '/State/A; /State/B' -> 'A; B'; others untouched."""
    if not isinstance(value, str) or not value.startswith("/"):
        return value
    parts = [p.strip() for p in value.split(";")]
    if all(_REF_RE.match(p) for p in parts):
        return "; ".join(p.rsplit("/", 1)[-1] for p in parts)
    return value


def _adaptive_custom(entity: dict) -> dict:
    return {k: _ref_tail(_scalar(v)) for k, v in entity.items() if k.startswith("C_") and v not in (None, "")}


def _adaptive_record(e: dict, fmap: dict, keep_refs: set) -> dict:
    rec: dict[str, Any] = {}
    for canon, api in fmap.items():
        val = get_path(e, api)
        if canon not in keep_refs:
            val = _ref_tail(val)
        if canon in DATE_KEYS:
            val = iso_date(val)
        elif canon in TEXT_KEYS:
            val = repair_text(val)
        elif canon.endswith("_email"):
            val = str(val or "").strip().lower()
        rec[canon] = val
    return rec


def normalize_adaptive(raw_dir: Path, cfg: dict, today: date) -> dict[str, list[dict]]:
    fmap = cfg["field_map"]
    work_items, tasks, deps = [], [], []
    for entity_name, spec in cfg["entities"].items():
        role = spec["role"]
        rows = list(read_jsonl(raw_dir / f"{entity_name}.jsonl"))
        if role in ("project", "request"):
            for e in rows:
                rec = {"source_system": "adaptive", "source_type": f"adaptive_{role}", "source_id": e["id"],
                       **_adaptive_record(e, fmap[role], set()),
                       "custom_fields": _adaptive_custom(e), "archived": False}
                work_items.append(rec)
        elif role in ("task", "milestone"):
            for e in rows:
                rec = _adaptive_record(e, fmap["task"], {"project_id", "parent_id"})
                project_id, parent_id = str(rec.pop("project_id", "")), str(rec.pop("parent_id", ""))
                rec.update({"source_system": "adaptive", "source_id": e["id"],
                            "project_source_id": project_id,
                            "parent_source_id": "" if parent_id == project_id else parent_id,
                            "is_milestone": role == "milestone", "is_phase": False,
                            "percent_complete": parse_percent(rec.get("percent_complete")),
                            "custom_fields": _adaptive_custom(e)})
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


def _columns(base: list[str], rows: list[dict]) -> list[str]:
    cols = list(base)
    for r in rows:
        for k in r:
            if k not in cols and k != "custom_fields":
                cols.append(k)
    return cols + (["custom_fields"] if "custom_fields" not in cols else [])


def load_plan_links(path: str | Path) -> dict[str, str]:
    """plan_project_gid -> tracker_item_gid from config/asana_plan_links.csv."""
    return {r["plan_project_gid"].strip(): r["tracker_item_gid"].strip()
            for r in read_csv(path) if r.get("plan_project_gid") and r.get("tracker_item_gid")}


def normalize(settings: dict, today: date) -> dict[str, int]:
    raw = Path(settings["paths"]["raw"])
    staging = Path(settings["paths"]["staging"])
    combined: dict[str, list[dict]] = defaultdict(list)
    if (raw / "asana").exists() and "asana" in settings:
        links = load_plan_links(settings["asana"].get("plan_links_file", "config/asana_plan_links.csv"))
        links.update(load_plan_links(raw / "asana" / "plan_links_from_exports.csv"))
        for k, v in normalize_asana(raw / "asana", settings["asana"], today, links).items():
            combined[k].extend(v)
    if (raw / "adaptive").exists() and "adaptive" in settings:
        for k, v in normalize_adaptive(raw / "adaptive", settings["adaptive"], today).items():
            combined[k].extend(v)
    combined["tasks"] = assign_levels_and_order(combined["tasks"])
    wi = combined["work_items"]
    return {
        "work_items": write_csv(staging / "work_items.csv", wi, _columns(WORK_ITEM_COLUMNS + EXTENDED_COLUMNS, wi)),
        "tasks": write_csv(staging / "tasks.csv", combined["tasks"], TASK_COLUMNS),
        "dependencies": write_csv(staging / "dependencies.csv", combined["dependencies"], DEPENDENCY_COLUMNS),
        "status_updates": write_csv(staging / "status_updates.csv", combined["status_updates"], STATUS_COLUMNS),
        "multi_homed_tasks": write_csv(staging / "multi_homed_tasks.csv", combined["multi_homed_tasks"],
                                       ["source_id", "name", "assigned_project", "all_projects"]),
        "rollup_conflicts": write_csv(staging / "rollup_conflicts.csv", combined["rollup_conflicts"],
                                      ["source_system", "source_id", "name", "field", "task_field",
                                       "project_value", "task_values", "used"]),
    }
