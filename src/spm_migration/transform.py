"""Turn classified canonical staging data into ServiceNow import-set CSVs.

Outputs (data/load/):
  01_dmn_demand.csv ... 05_project_status.csv   one per target in config/target_mapping.yaml
  excluded_tasks.csv       tasks not loaded (parent classified demand/skip/review, or header-only)
  excluded_dependencies.csv links whose predecessor or successor is not being loaded
  unmapped_values.csv      source values with no value_map entry -> fill mapping/value_maps.csv
  users_referenced.csv     every user value used (email or display name) and what it resolved to
"""
from __future__ import annotations

import html
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .common import (SYSTEM_DISPLAY, correlation_id, iso_date, load_yaml, parse_percent,
                     read_csv, repair_text, split_multi, truthy, write_csv)

BLANK_USER_TOKENS = {"", "n/a", "na", "tbd", "none", "-", "unassigned", "unknown"}


class ValueMaps:
    def __init__(self, rows: list[dict]):
        self.maps: dict[tuple, str] = {}
        for r in rows:
            key = (r["map_name"], r["source_system"].strip().lower(), r["source_value"].strip().lower())
            self.maps[key] = r["target_value"]
        self.unmapped: Counter = Counter()

    def lookup(self, map_name: str, system: str, value: Any, passthrough: bool = False) -> str:
        v = "" if value is None else str(value).strip()
        for sys_key in (system, "*"):
            key = (map_name, sys_key, v.lower())
            if key in self.maps:
                return self.maps[key]
        if v and not passthrough:
            self.unmapped[(map_name, system, v)] += 1
            return ""
        return v


class UserResolver:
    """Resolve source people (emails *or* display names) to sys_user emails.

    Sources: data/reference/sys_user.csv (email + name or first_name/last_name) and
    data/reference/user_crosswalk.csv (source_value,email) for nicknames/aliases,
    e.g. 'Jen Smith' -> jennifer.smith@org.com.
    """

    def __init__(self, sys_users: list[dict], crosswalk: list[dict], placeholder: str):
        self.placeholder = placeholder.lower()
        self.have_reference = bool(sys_users)
        self.emails = {u["email"].strip().lower() for u in sys_users if u.get("email")}
        self.by_name: dict[str, str] = {}
        for u in sys_users:
            email = (u.get("email") or "").strip().lower()
            names = [u.get("name", ""), f"{u.get('first_name', '')} {u.get('last_name', '')}"]
            for n in names:
                key = " ".join(n.lower().split())
                if key and email:
                    self.by_name.setdefault(key, email)
        for c in crosswalk:
            key = " ".join((c.get("source_value") or "").lower().split())
            if key and c.get("email"):
                self.by_name[key] = c["email"].strip().lower()
        self.seen: Counter = Counter()
        self.result: dict[str, str] = {}

    def lookup(self, value: Any) -> str:
        """Resolved email, or '' when blank/unresolvable (and records what happened)."""
        v = " ".join(str(value or "").strip().lower().split())
        if v in BLANK_USER_TOKENS:
            return ""
        self.seen[v] += 1
        if "@" in v:
            email = v if (not self.have_reference or v in self.emails) else ""
        else:
            email = self.by_name.get(v, "")
        self.result[v] = email
        return email

    def resolve(self, value: Any, placeholder: bool = True) -> str:
        email = self.lookup(value)
        return email or (self.placeholder if placeholder else "")


def _html_strip(text: str) -> str:
    text = re.sub(r"<br\s*/?>|</p>|</li>", "\n", text, flags=re.I)
    return repair_text(html.unescape(re.sub(r"<[^>]+>", "", text)))


def _get(row: dict, field: str) -> Any:
    if field.startswith("custom."):
        custom = row.get("custom_fields") or {}
        if isinstance(custom, str):
            custom = json.loads(custom) if custom else {}
        return custom.get(field[len("custom."):], "")
    return row.get(field, "")


def _first_value(row: dict, spec: dict) -> Any:
    if "const" in spec:
        return spec["const"]
    sources = spec.get("from", [])
    sources = sources if isinstance(sources, list) else [sources]
    return next((v for v in (_get(row, s) for s in sources) if v not in (None, "")), "")


def map_row(row: dict, columns: dict, vmaps: ValueMaps, users: UserResolver) -> dict:
    """Apply one target's column specs to a canonical row (see config/target_mapping.yaml)."""
    out = {}
    system = row.get("source_system", "")
    for col, spec in columns.items():
        value: Any = _first_value(row, spec)
        t = spec.get("transform", "")
        vm = spec.get("value_map")
        passthrough = spec.get("passthrough", False)

        if t in ("list", "first"):
            items = split_multi(value) or ([""] if vm else [])   # blank still honours a blank-value map row
            if vm:
                items = [vmaps.lookup(vm, system, i, passthrough) for i in items]
            items = list(dict.fromkeys(i for i in items if i))
            value = (items[0] if items else "") if t == "first" else ",".join(items)
        elif t == "user_first":
            value = next((e for e in (users.lookup(i) for i in split_multi(value)) if e), "")
            if not value and spec.get("placeholder"):
                value = users.placeholder
        elif t == "user_list":
            value = ",".join(dict.fromkeys(e for e in (users.lookup(i) for i in split_multi(value)) if e))
        else:
            if vm:
                value = vmaps.lookup(vm, system, value, passthrough)
            if t == "date":
                value = iso_date(value)
            elif t == "user":
                value = users.resolve(value, placeholder=True)
            elif t == "user_optional":
                value = users.resolve(value, placeholder=False)
            elif t.startswith("truncate:"):
                value = repair_text(value)[: int(t.split(":", 1)[1])]
            elif t == "number":
                try:
                    value = round(float(value), 2) if value not in ("", None) else ""
                except ValueError:
                    value = ""
            elif t == "percent":
                value = parse_percent(value)
            elif t == "bool":
                value = "true" if truthy(value) else "false"
            elif t in ("html_strip", "clean"):
                value = _html_strip(str(value))

        if spec.get("append"):
            # Source attributes with no ServiceNow home: keep them readable in a text field
            lines = [f"{label}: {repair_text(_get(row, field))}"
                     for label, field in spec["append"].items() if _get(row, field) not in (None, "")]
            if lines:
                header = spec.get("append_header", f"Migrated from {SYSTEM_DISPLAY.get(system, system)}")
                value = (f"{value}\n\n" if value else "") + f"--- {header} ---\n" + "\n".join(lines)
        if value in ("", None) and "default" in spec:
            value = spec["default"]
        out[col] = value
    return out


def run(settings: dict, mapping_path: str | Path, value_maps_path: str | Path) -> dict[str, int]:
    paths = settings["paths"]
    staging, load, ref = Path(paths["staging"]), Path(paths["load"]), Path(paths["reference"])
    mapping = load_yaml(mapping_path)
    vmaps = ValueMaps(read_csv(value_maps_path))

    placeholder = settings.get("servicenow", {}).get("placeholder_user_email", "migration.unassigned@example.com")
    users = UserResolver(read_csv(ref / "sys_user.csv"), read_csv(ref / "user_crosswalk.csv"), placeholder)

    items = read_csv(staging / "work_items_classified.csv")
    for w in items:
        w["correlation_id"] = correlation_id(w["source_system"], w["source_id"])
        w["correlation_display"] = SYSTEM_DISPLAY[w["source_system"]]
    project_keys = {(w["source_system"], w["source_id"]) for w in items if w["target_class"] == "project"}
    full_wbs = {(w["source_system"], w["source_id"]) for w in items
                if w["target_class"] == "project" and truthy(w.get("include_tasks", "true"))}
    cls_of = {(w["source_system"], w["source_id"]): w["target_class"] for w in items}

    # Tasks: keep only those under projects loaded with WBS
    tasks, excluded_tasks = [], []
    for t in read_csv(staging / "tasks.csv"):
        key = (t["source_system"], t["project_source_id"])
        if key in full_wbs:
            t["correlation_id"] = correlation_id(t["source_system"], t["source_id"])
            t["correlation_display"] = SYSTEM_DISPLAY[t["source_system"]]
            t["project_correlation_id"] = correlation_id(t["source_system"], t["project_source_id"])
            t["parent_correlation_id"] = (correlation_id(t["source_system"], t["parent_source_id"])
                                          if t.get("parent_source_id") else t["project_correlation_id"])
            tasks.append(t)
        else:
            reason = ("project loaded header-only" if key in project_keys
                      else f"parent classified {cls_of.get(key, 'not extracted')}")
            excluded_tasks.append({**t, "exclusion_reason": reason})
    loaded_task_ids = {(t["source_system"], t["source_id"]) for t in tasks}

    deps, excluded_deps = [], []
    for d in read_csv(staging / "dependencies.csv"):
        s = d["source_system"]
        if (s, d["predecessor_id"]) in loaded_task_ids and (s, d["successor_id"]) in loaded_task_ids:
            d["predecessor_correlation_id"] = correlation_id(s, d["predecessor_id"])
            d["successor_correlation_id"] = correlation_id(s, d["successor_id"])
            deps.append(d)
        else:
            excluded_deps.append({**d, "exclusion_reason": "predecessor or successor not loaded"})

    # Status reports: history where available, else one synthetic "as migrated" report
    statuses = []
    have_status = set()
    for s in read_csv(staging / "status_updates.csv"):
        key = (s["source_system"], s["project_source_id"])
        if key in project_keys:
            s["project_correlation_id"] = correlation_id(*key)
            statuses.append(s)
            have_status.add(key)
    health_fields = ("health", "health_budget", "health_resource", "health_risk", "health_schedule",
                     "health_scope", "status_notes")
    for w in items:
        key = (w["source_system"], w["source_id"])
        if key in project_keys and key not in have_status and any(w.get(f) for f in health_fields):
            statuses.append({"source_system": w["source_system"], "project_correlation_id": w["correlation_id"],
                             "as_on": w.get("updated_at") or w.get("created_at"),
                             "title": "Status at migration", "text": w.get("status_notes", ""),
                             **{f: w.get(f, "") for f in health_fields if f != "status_notes"}})

    sources = {"work_items": items, "tasks": tasks, "dependencies": deps, "status_updates": statuses}
    counts = {}
    for table, spec in mapping["targets"].items():
        rows = sources[spec["source"]]
        if spec.get("target_class"):
            rows = [r for r in rows if r.get("target_class") == spec["target_class"]]
        mapped = [map_row(r, spec["columns"], vmaps, users) for r in rows]
        counts[table] = write_csv(load / spec["file"], mapped, list(spec["columns"].keys()))

    write_csv(load / "excluded_tasks.csv", excluded_tasks)
    write_csv(load / "excluded_dependencies.csv", excluded_deps)
    write_csv(load / "unmapped_values.csv",
              [{"map_name": m, "source_system": s, "source_value": v, "occurrences": n}
               for (m, s, v), n in sorted(vmaps.unmapped.items())],
              ["map_name", "source_system", "source_value", "occurrences"])
    write_csv(load / "users_referenced.csv",
              [{"source_value": v, "references": n, "resolved_email": users.result.get(v, ""),
                "matched": "yes" if users.result.get(v) else "NO"}
               for v, n in users.seen.most_common()],
              ["source_value", "references", "resolved_email", "matched"])
    counts["unmapped_values"] = len(vmaps.unmapped)
    counts["excluded_tasks"] = len(excluded_tasks)
    return counts
