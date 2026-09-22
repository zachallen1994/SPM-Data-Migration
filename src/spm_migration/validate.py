"""Check target_mapping.yaml columns and value-map outputs against the instance's own
sys_dictionary / sys_choice exports (data/reference/). Table inheritance is followed so
fields defined on task/planned_task count for pm_project, dmn_demand, etc.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from .common import load_yaml, read_csv, write_csv

# Parent chain for the tables we load (extend if your instance differs)
PARENTS = {
    "pm_project": "planned_task",
    "pm_project_task": "planned_task",
    "planned_task": "task",
    "dmn_demand": "task",
}


def _lineage(table: str) -> list[str]:
    chain = [table]
    while chain[-1] in PARENTS:
        chain.append(PARENTS[chain[-1]])
    return chain


def run(settings: dict, mapping_path: str | Path, value_maps_path: str | Path) -> list[dict]:
    ref = Path(settings["paths"]["reference"])
    dictionary = read_csv(ref / "sys_dictionary.csv")
    if not dictionary:
        raise FileNotFoundError(f"{ref / 'sys_dictionary.csv'} not found - export sys_dictionary "
                                "(columns name, element) for the target tables first")
    fields: dict[str, set] = defaultdict(set)
    for d in dictionary:
        if d.get("element"):
            fields[d["name"]].add(d["element"])
    choices: dict[tuple, set] = defaultdict(set)
    for c in read_csv(ref / "sys_choice.csv"):
        choices[(c["name"], c["element"])].add(c["value"])

    vmap_targets: dict[str, set] = defaultdict(set)
    for r in read_csv(value_maps_path):
        if r["target_value"]:
            vmap_targets[r["map_name"]].add(r["target_value"])

    issues = []
    mapping = load_yaml(mapping_path)
    for table, spec in mapping["targets"].items():
        lineage = _lineage(table)
        for col, cspec in spec["columns"].items():
            if col.startswith("u_") and col not in set().union(*(fields[t] for t in lineage)):
                issues.append({"table": table, "column": col, "severity": "info",
                               "issue": "helper/custom column - create on target or use only in transform script"})
                continue
            owner = next((t for t in lineage if col in fields[t]), None)
            if not owner:
                issues.append({"table": table, "column": col, "severity": "ERROR",
                               "issue": f"not found on {' -> '.join(lineage)} in sys_dictionary"})
                continue
            allowed = set().union(*(choices.get((t, col), set()) for t in lineage))
            produced = set(vmap_targets.get(cspec.get("value_map", ""), set()))
            if "const" in cspec:
                produced.add(str(cspec["const"]))
            if allowed and produced - allowed:
                issues.append({"table": table, "column": col, "severity": "ERROR",
                               "issue": f"values not in sys_choice: {sorted(produced - allowed)}"})
    write_csv(Path(settings["paths"]["staging"]) / "field_validation.csv", issues,
              ["table", "column", "severity", "issue"])
    return issues
