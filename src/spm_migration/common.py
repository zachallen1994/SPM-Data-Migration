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


def staging_header(target_field: str) -> str:
    """CSV header for a load-file column. ServiceNow prefixes every import-set column with
    'u_', so headers carry NO prefix: 'short_description' -> staging u_short_description,
    'business_owner' -> staging u_business_owner -> target custom field u_business_owner."""
    return target_field[2:] if target_field.startswith("u_") else target_field


def correlation_id(source_system: str, source_id: str) -> str:
    return f"{SYSTEM_PREFIX[source_system]}:{source_id}" if source_id else ""


_MOJIBAKE_MARKERS = ("¬", "‚Ä", "Ã", "Â")


def repair_text(value: Any) -> str:
    """Undo UTF-8-read-as-MacRoman/cp1252 damage (e.g. '¬∑¬†' -> '· ') and tidy whitespace."""
    text = "" if value is None else str(value)
    if any(m in text for m in _MOJIBAKE_MARKERS):
        for codec in ("mac_roman", "cp1252"):
            try:
                text = text.encode(codec).decode("utf-8")
                break
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def split_multi(value: Any) -> list[str]:
    """Split multi-select values: lists, 'a, b', 'a; b' or newline-separated."""
    if value in (None, ""):
        return []
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[;,\n]", str(value))
    return [str(i).strip() for i in items if str(i).strip()]


def parse_percent(value: Any) -> float | str:
    """'50%' -> 50, 0.5 -> 50 (fractions from Asana/Excel), 75 -> 75."""
    if value in (None, ""):
        return ""
    text = str(value).strip()
    has_pct = text.endswith("%")
    try:
        n = float(text.rstrip("%").strip())
    except ValueError:
        return ""
    if not has_pct and 0 < n <= 1 and "." in text:
        n *= 100
    return round(n, 2)


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}
