"""Compare what we meant to load (data/load/*.csv) with what ServiceNow holds.

Export each target table from ServiceNow as CSV with at least `correlation_id`
(filter correlation_idSTARTSWITHASANA^ORcorrelation_idSTARTSWITHADAPTIVE) and save as
data/reference/sn_<table>.csv, e.g. sn_pm_project.csv. Tables without correlation_id
(dependencies, status reports) are compared by row count only.
"""
from __future__ import annotations

from pathlib import Path

from .common import load_yaml, read_csv, write_csv


def run(settings: dict, mapping_path: str | Path) -> list[dict]:
    load, ref = Path(settings["paths"]["load"]), Path(settings["paths"]["reference"])
    summary, detail = [], []
    for table, spec in load_yaml(mapping_path)["targets"].items():
        expected = read_csv(load / spec["file"])
        export = ref / f"sn_{table}.csv"
        if not export.exists():
            summary.append({"table": table, "expected": len(expected), "in_servicenow": "",
                            "missing": "", "unexpected": "", "note": f"no export at {export.name}"})
            continue
        actual = read_csv(export)
        if "correlation_id" not in spec["columns"]:
            summary.append({"table": table, "expected": len(expected), "in_servicenow": len(actual),
                            "missing": max(0, len(expected) - len(actual)), "unexpected": "",
                            "note": "row count only"})
            continue
        want = {r["correlation_id"] for r in expected}
        have = {r.get("correlation_id", "") for r in actual}
        missing, extra = sorted(want - have), sorted(have - want - {""})
        detail += [{"table": table, "correlation_id": c, "problem": "missing in ServiceNow"} for c in missing]
        detail += [{"table": table, "correlation_id": c, "problem": "in ServiceNow but not in load file"} for c in extra]
        summary.append({"table": table, "expected": len(want), "in_servicenow": len(have),
                        "missing": len(missing), "unexpected": len(extra), "note": ""})
    write_csv(load / "reconciliation_summary.csv", summary,
              ["table", "expected", "in_servicenow", "missing", "unexpected", "note"])
    write_csv(load / "reconciliation_detail.csv", detail, ["table", "correlation_id", "problem"])
    return summary
