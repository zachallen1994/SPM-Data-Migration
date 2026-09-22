"""Rule-based Project / Demand / Skip / Review classification with manual overrides."""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from .common import load_yaml, parse_date, read_csv, truthy, write_csv

VALID_CLASSES = {"project", "demand", "skip", "review"}


def field_value(row: dict, field: str) -> Any:
    if field.startswith("custom."):
        custom = row.get("custom_fields") or {}
        if isinstance(custom, str):
            custom = json.loads(custom) if custom else {}
        return custom.get(field[len("custom."):], "")
    return row.get(field, "")


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def check(value: Any, op: str, arg: Any, today: date) -> bool:
    s = "" if value is None else str(value).strip()
    if op == "equals":
        return s.lower() == str(arg).lower()
    if op == "not_equals":
        return s.lower() != str(arg).lower()
    if op == "in":
        return s.lower() in {str(a).lower() for a in arg}
    if op == "not_in":
        return s.lower() not in {str(a).lower() for a in arg}
    if op == "regex":
        return re.search(arg, s) is not None
    if op == "empty":
        return (s == "") == bool(arg)
    if op == "not_empty":
        return (s != "") == bool(arg)
    if op in ("gt", "lt"):
        n = _num(s)
        return n is not None and (n > arg if op == "gt" else n < arg)
    if op in ("older_than_days", "newer_than_days"):
        d = parse_date(s)
        if not d:
            return False
        age = (today - d).days
        return age > arg if op == "older_than_days" else age <= arg
    raise ValueError(f"Unknown operator '{op}'")


def rule_matches(row: dict, rule: dict, today: date) -> bool:
    for field, conds in (rule.get("when") or {}).items():
        for op, arg in conds.items():
            if not check(field_value(row, field), op, arg, today):
                return False
    return True


def classify_rows(rows: list[dict], rules_cfg: dict, overrides: list[dict], today: date) -> list[dict]:
    rules = rules_cfg.get("rules") or []
    default = rules_cfg.get("default", "review")
    ov = {(o["source_system"].strip().lower(), o["source_id"].strip()): o for o in overrides if o.get("source_id")}
    out = []
    for row in rows:
        row = dict(row)
        o = ov.get((row["source_system"], str(row["source_id"])))
        if o:
            cls = o["target_class"].strip().lower()
            if cls not in VALID_CLASSES:
                raise ValueError(f"Override for {row['source_id']} has invalid target_class '{cls}'")
            row.update(target_class=cls, classification_rule="override",
                       classification_confidence="override",
                       classification_note=o.get("note", ""), demand_link=o.get("demand_link", ""),
                       include_tasks=not (o.get("include_tasks", "") and not truthy(o["include_tasks"])))
        else:
            for rule in rules:
                if rule_matches(row, rule, today):
                    row.update(target_class=rule["target"], classification_rule=rule["name"],
                               classification_confidence="rule",
                               classification_note=rule.get("note", ""),
                               include_tasks=rule.get("include_tasks", True))
                    break
            else:
                row.update(target_class=default, classification_rule="default",
                           classification_confidence="default", classification_note="",
                           include_tasks=True)
            row.setdefault("demand_link", "")
        out.append(row)
    return out


def run(settings: dict, rules_path: str | Path, overrides_path: str | Path, today: date) -> dict[str, int]:
    staging = Path(settings["paths"]["staging"])
    rows = read_csv(staging / "work_items.csv")
    result = classify_rows(rows, load_yaml(rules_path), read_csv(overrides_path), today)
    cols = list(rows[0].keys()) if rows else []
    cols += ["target_class", "classification_rule", "classification_confidence",
             "classification_note", "include_tasks", "demand_link"]
    review = [r for r in result if r["target_class"] == "review"]
    review_cols = ["source_system", "source_type", "source_id", "source_key", "source_url", "name",
                   "owner_email", "portfolio", "status", "phase", "task_count", "open_task_count",
                   "updated_at", "classification_rule", "classification_note"]
    for r in review:
        r["decision (project/demand/skip)"] = ""
    summary = Counter((r["source_system"], r["source_type"], r["target_class"], r["classification_rule"]) for r in result)
    summary_rows = [{"source_system": k[0], "source_type": k[1], "target_class": k[2], "rule": k[3], "count": n}
                    for k, n in sorted(summary.items())]
    write_csv(staging / "work_items_classified.csv", result, cols)
    write_csv(staging / "classification_review.csv", review, review_cols + ["decision (project/demand/skip)"])
    write_csv(staging / "classification_summary.csv", summary_rows)
    return dict(Counter(r["target_class"] for r in result))
