"""Shared helpers: config loading, JSONL/CSV I/O, date parsing."""
from __future__ import annotations

import csv
import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Iterator

import yaml

SYSTEM_PREFIX = {"asana": "ASANA", "adaptive": "ADAPTIVE"}
SYSTEM_DISPLAY = {"asana": "Asana", "adaptive": "Adaptive Work"}


def load_yaml(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_settings(path: str | Path) -> dict:
    """Load settings YAML, expanding ${ENV_VAR} references."""
    text = Path(path).read_text(encoding="utf-8")
    text = re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), ""), text)
    return yaml.safe_load(text) or {}


def read_jsonl(path: str | Path) -> Iterator[dict]:
    path = Path(path)
    if not path.exists():
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path: str | Path, rows: Iterable[dict]) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def read_csv(path: str | Path) -> list[dict]:
    path = Path(path)
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: str | Path, rows: list[dict], columns: list[str] | None = None) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if columns is None:
        columns = []
        for row in rows:
            for key in row:
                if key not in columns:
                    columns.append(key)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: _cell(row.get(k)) for k in columns})
    return len(rows)


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def parse_date(value: Any) -> date | None:
    """Accept YYYY-MM-DD, ISO timestamps (with Z or offset) or date objects."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def iso_date(value: Any) -> str:
    d = parse_date(value)
    return d.isoformat() if d else ""


def correlation_id(source_system: str, source_id: str) -> str:
    return f"{SYSTEM_PREFIX[source_system]}:{source_id}" if source_id else ""


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}
