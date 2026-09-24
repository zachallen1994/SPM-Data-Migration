"""Generate ServiceNow Agile user stories (rm_epic / rm_story) for the migration build.

Inputs:  config/user_stories.yaml, mapping/servicenow_transform_maps.csv, mapping/decisions.csv
Outputs: mapping/servicenow_user_stories.xlsx  (sheets ready to import into rm_epic / rm_story)
         docs/09_servicenow_user_stories.md    (readable version)
"""
from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .common import load_yaml, read_csv

FONT = Font(name="Arial", size=10)
BOLD = Font(name="Arial", size=10, bold=True)
HEAD = Font(name="Arial", size=10, bold=True, color="FFFFFF")
FILL = PatternFill("solid", fgColor="1F4E78")
WRAP = Alignment(wrap_text=True, vertical="top")
OPEN_ITEMS = ("D1", "D2", "D8", "D11", "D12", "D13", "D17", "D18")


def _settings(r: dict) -> str:
    parts = []
    if r["coalesce"] == "Yes":
        parts.append("COALESCE")
    if r["field_kind"] and r["field_kind"] not in ("String / text", "Helper"):
        parts.append(r["field_kind"])
    if r["referenced_value_field"]:
        parts.append(f"referenced value field = {r['referenced_value_field']}")
    if r["choice_action"]:
        parts.append(f"choice action = {r['choice_action']}")
    if r["script"]:
        parts.append(f"script: {r['script']}")
    if r["target_field_status"].startswith("PROPOSED"):
        parts.append("field created in MIG-02")
    return "; ".join(parts)


def field_map_rows(spec: list[dict], import_table: str) -> list[dict]:
    return [r for r in spec if r["import_set_table"] == import_table and r["field_kind"] != "Helper"]


def helper_columns(spec: list[dict], import_table: str) -> list[str]:
    return [r["source_column"] for r in spec if r["import_set_table"] == import_table and r["field_kind"] == "Helper"]


def _field_map_text(spec: list[dict], import_table: str) -> str:
    rows = field_map_rows(spec, import_table)
    width = max((len(r["source_column"]) for r in rows), default=10)
    lines = [f"FIELD MAPS for {import_table} ({len(rows)}). Source column -> target field | settings"]
    lines += [f"  {r['source_column']:<{width}} -> {r['target_field']}"
              + (f" | {_settings(r)}" if _settings(r) else "") for r in rows]
    helpers = helper_columns(spec, import_table)
    if helpers:
        lines.append(f"  NO field map (read by scripts): {', '.join(helpers)}")
    return "\n".join(lines)


def _description(story: dict, spec: list[dict], conventions: str) -> str:
    parts = [f"As a {story['as_a']}, I want {story['i_want']}, so that {story['so_that']}.",
             "", "STEPS", story["steps"].rstrip()]
    if story.get("field_maps"):
        parts += ["", _field_map_text(spec, story["field_maps"]), "", conventions.rstrip()]
    if story.get("depends_on"):
        parts += ["", f"DEPENDS ON: {story['depends_on']}"]
    return "\n".join(parts)


def _priority_value(label: str) -> int | str:
    return int(label[0]) if label and label[0].isdigit() else label


def _sheet(wb: Workbook, title: str, headers: list[str], rows: list[list], widths: dict[str, int]) -> None:
    ws = wb.create_sheet(title)
    ws.append(headers)
    for row in rows:
        ws.append(row)
    for cell in ws[1]:
        cell.font, cell.fill, cell.alignment = HEAD, FILL, WRAP
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font, cell.alignment = FONT, WRAP
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths.get(h, 18)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def build(stories_path: str | Path, spec_path: str | Path, decisions_path: str | Path,
          xlsx_out: str | Path, md_out: str | Path) -> tuple[Path, Path]:
    cfg = load_yaml(stories_path)
    spec = read_csv(spec_path)
    decisions = [d for d in read_csv(decisions_path) if d["id"] in OPEN_ITEMS]
    epics = {e["key"]: e for e in cfg["epics"]}
    conventions = cfg["conventions"]

    wb = Workbook()
    wb.remove(wb.active)
    readme = wb.create_sheet("Read Me")
    lines = [
        (f"{cfg['product']}: ServiceNow user stories", True),
        ("", False),
        ("How to load these into ServiceNow Agile Development:", True),
        ("1. Import the 'Epics' sheet into rm_epic (System Import Sets > Load Data; map short_description, description).", False),
        ("2. Import the 'Stories' sheet into rm_story. Map epic by name to rm_epic.short_description, and", False),
        ("   map short_description, description, acceptance_criteria, story_points and priority (1-4).", False),
        ("3. Attach or link the 'Field Maps' sheet to stories MIG-05 to MIG-13. It lists every field map per import set table.", False),
        ("4. The 'key' column (MIG-xx) is a working reference; put it in the story title or a tag if you want to keep it.", False),
        ("", False),
        ("Sheets: Epics | Stories | Field Maps (build sheet per transform map) | Open Items (decisions that affect the build)", False),
        ("Regenerate after mapping changes: python -m spm_migration.cli user-stories", False),
        ("", False),
        ("Conventions that apply to every import set / transform map story:", True),
    ] + [(ln, False) for ln in conventions.strip().splitlines()]
    for i, (text, bold) in enumerate(lines, 1):
        c = readme.cell(row=i, column=1, value=text)
        c.font = BOLD if bold else FONT
    readme.column_dimensions["A"].width = 130

    _sheet(wb, "Epics", ["key", "short_description", "description"],
           [[e["key"], e["short_description"], e["description"].strip()] for e in cfg["epics"]],
           {"key": 10, "short_description": 60, "description": 110})

    story_rows = []
    for s in cfg["stories"]:
        story_rows.append([s["key"], epics[s["epic"]]["short_description"], s["short_description"],
                           _description(s, spec, conventions), s["acceptance"].strip(), s["points"],
                           _priority_value(s["priority"]), s.get("depends_on", ""), s.get("field_maps", "")])
    _sheet(wb, "Stories", ["key", "epic", "short_description", "description", "acceptance_criteria",
                           "story_points", "priority", "depends_on", "import_set_table"],
           story_rows, {"key": 9, "epic": 30, "short_description": 45, "description": 100,
                        "acceptance_criteria": 60, "story_points": 8, "priority": 8, "depends_on": 18,
                        "import_set_table": 24})

    by_table = {s["field_maps"]: s["key"] for s in cfg["stories"] if s.get("field_maps")}
    fm_headers = ["story", "source_system", "import_set_table", "load_file", "source_column", "target_table",
                  "target_field", "field_kind", "coalesce", "referenced_value_field", "choice_action", "script",
                  "target_field_status", "notes"]
    fm_rows = [[by_table.get(r["import_set_table"], "")] + [r[h] for h in fm_headers[1:]]
               for r in spec if r["import_set_table"] in by_table]
    _sheet(wb, "Field Maps", fm_headers, fm_rows,
           {"story": 8, "import_set_table": 24, "load_file": 34, "source_column": 30, "target_field": 30,
            "field_kind": 22, "script": 45, "target_field_status": 28, "notes": 50})

    _sheet(wb, "Open Items", ["id", "topic", "question", "recommendation", "status"],
           [["DEMAND-RULE", "Adaptive demand condition",
             "Which Adaptive records become demands? Provisional rule: State = Requested or Draft.",
             "Applied upstream in config/classification.yaml. No ServiceNow change needed when it is finalised.",
             "Open"]] + [[d["id"], d["topic"], d["question"], d["recommendation"], d["status"]] for d in decisions],
           {"id": 12, "topic": 26, "question": 70, "recommendation": 70, "status": 20})

    xlsx_out = Path(xlsx_out)
    wb.save(xlsx_out)

    md = [f"# 09: ServiceNow user stories: {cfg['release']}", "",
          "Generated from `config/user_stories.yaml` and `mapping/servicenow_transform_maps.csv`. The import-ready",
          "version is `mapping/servicenow_user_stories.xlsx` (Epics and Stories sheets for rm_epic / rm_story).",
          "", "## Conventions for every import set / transform map story", "", "```", conventions.strip(), "```", "",
          "## Open items that affect the build", "",
          "| ID | Topic | Recommendation | Status |", "|---|---|---|---|",
          "| DEMAND-RULE | Adaptive demand condition | Applied upstream; provisional State = Requested/Draft | Open |"]
    md += [f"| {d['id']} | {d['topic']} | {d['recommendation']} | {d['status']} |" for d in decisions]
    for e in cfg["epics"]:
        md += ["", f"## {e['key']}: {e['short_description']}", "", e["description"].strip()]
        for s in [s for s in cfg["stories"] if s["epic"] == e["key"]]:
            md += ["", f"### {s['key']}: {s['short_description']}",
                   f"*Story points: {s['points']} · Priority: {s['priority']}"
                   + (f" · Depends on: {s['depends_on']}*" if s.get("depends_on") else "*"), "",
                   f"**As a** {s['as_a']}, **I want** {s['i_want']}, **so that** {s['so_that']}.", "",
                   "**Steps**", "", "```", s["steps"].strip(), "```"]
            if s.get("field_maps"):
                rows = field_map_rows(spec, s["field_maps"])
                md += ["", f"**Field maps: `{s['field_maps']}`** ({len(rows)})", "",
                       "| Source column | Target field | Settings |", "|---|---|---|"]
                md += [f"| `{r['source_column']}` | `{r['target_field']}` | {_settings(r) or 'direct'} |" for r in rows]
                helpers = helper_columns(spec, s["field_maps"])
                if helpers:
                    md += ["", "No field map (read by scripts): " + ", ".join(f"`{h}`" for h in helpers)]
            md += ["", "**Acceptance criteria**", "", s["acceptance"].strip()]
    md_out = Path(md_out)
    md_out.write_text("\n".join(md) + "\n", encoding="utf-8")
    return xlsx_out, md_out
