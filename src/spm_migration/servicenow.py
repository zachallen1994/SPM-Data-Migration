"""ServiceNow side of the load: transform-map build spec and (optional) Import Set API push.

Each source gets its own import set (staging) tables and transform maps:
  Asana:    u_imp_asana_demand / _project / _task / _dependency / _status
  Adaptive: u_imp_adaptive_demand / _project / _task / _dependency / _status

Column naming: load-file headers carry no 'u_' prefix and ServiceNow adds one when it
creates the staging table. So staging column `u_<name>` maps to target field `<name>`
(out-of-box) or `u_<name>` (custom). There is never a `u_u_` column.

transform_map_spec()  -> mapping/servicenow_transform_maps.csv, one row per field map per
                         source, with coalesce, referenced value field, choice action and script.
push()                -> sends data/load/<source>/*.csv rows to the Import Set API
                         (POST /api/now/import/<staging table>). The transform map runs as it
                         does for a manual load. Dry run unless execute=True.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

import requests

from .common import load_yaml, read_csv, staging_header, write_csv

log = logging.getLogger(__name__)

SOURCES = ("asana", "adaptive")
# Custom fields that already exist on the ServiceNow forms (Project/Demand Form Fields workbooks)
EXISTING_CUSTOM = {"u_business_owner", "u_executive_sponsor", "u_cn", "u_funding_type",
                   "u_funding_source", "u_business_category", "u_sites", "u_demand_type"}
# Columns that only feed transform scripts (never a field map)
HELPER_COLUMNS = {"u_project_correlation_id", "u_parent_correlation_id", "u_level",
                  "u_demand_correlation_id", "u_include_tasks",
                  "u_predecessor_correlation_id", "u_successor_correlation_id"}
REFERENCE_BY_NAME = {"primary_portfolio": "pm_portfolio", "portfolio": "pm_portfolio",
                     "primary_program": "pm_program", "business_unit": "business_unit",
                     "department": "cmn_department"}
# Fields only one source can populate (skip the field map on the other source's transform map)
ADAPTIVE_ONLY = {"u_cn", "u_funding_source", "u_cost_center", "u_next_go_live_date", "u_estimate_type",
                 "u_request_received", "u_request_assigned", "u_estimate_complete",
                 "u_ready_for_delivery", "u_project_assigned", "u_sites", "phase",
                 "schedule", "cost", "resources", "scope", "u_risk_health"}
ASANA_ONLY = {"additional_assignee_list", "impacted_business_units"}
SHORT = {"dmn_demand": "demand", "pm_project": "project", "pm_project_task": "task",
         "planned_task_rel_planned_task": "dependency", "project_status": "status"}
SCRIPTED_COALESCE = {("planned_task_rel_planned_task", "u_predecessor_correlation_id"): "parent",
                     ("planned_task_rel_planned_task", "u_successor_correlation_id"): "child",
                     ("project_status", "u_project_correlation_id"): "project"}


def import_table_name(source: str, table: str, overrides: dict | None = None) -> str:
    return ((overrides or {}).get(source) or {}).get(table) or f"u_imp_{source}_{SHORT.get(table, table)}"


def import_column(col: str) -> str:
    """Staging-table column ServiceNow creates for a load-file column ('u_cn' -> 'u_cn')."""
    return f"u_{staging_header(col).lower()}"


def applies_to(source: str, col: str) -> bool:
    return not ((source == "asana" and col in ADAPTIVE_ONLY) or (source == "adaptive" and col in ASANA_ONLY))


def _field_row(source: str, table: str, import_table: str, load_file: str, col: str, spec: dict) -> dict:
    t = spec.get("transform", "")
    src_col = import_column(col)
    row = {"source_system": source, "import_set_table": import_table, "load_file": f"{source}/{load_file}",
           "source_column": src_col, "target_table": table, "target_field": col, "field_kind": "",
           "coalesce": "", "referenced_value_field": "", "choice_action": "", "script": "",
           "target_field_status": "", "notes": ""}
    if col.startswith("u_"):
        row["target_field_status"] = ("helper - no field map" if col in HELPER_COLUMNS
                                      else "exists (custom)" if col in EXISTING_CUSTOM
                                      else "PROPOSED - create before load")
    else:
        row["target_field_status"] = "out-of-box - verify with validate-fields"

    if (table, col) in SCRIPTED_COALESCE:
        target = SCRIPTED_COALESCE[(table, col)]
        lookup = "planned_task" if table == "planned_task_rel_planned_task" else "pm_project"
        row.update(target_field=target, field_kind="Reference (scripted)", coalesce="Yes",
                   script=f"answer = new SPMMigrationUtil().byCorrelation('{lookup}', source.{src_col});",
                   target_field_status="out-of-box", notes="Field map script (docs/05 section 4)")
    elif col in HELPER_COLUMNS:
        row.update(field_kind="Helper", target_field="(none - read by onBefore script)",
                   notes="No field map; used by the onBefore script")
    elif col == "correlation_id":
        row.update(field_kind="String", coalesce="Yes", notes="Coalesce key - re-loads update instead of duplicating")
    elif t in ("user", "user_optional", "user_first"):
        row.update(field_kind="Reference sys_user", referenced_value_field="email", choice_action="ignore",
                   notes="Never 'create' - it would create users")
    elif t == "user_list":
        row.update(field_kind="List of sys_user", script="split emails -> SPMMigrationUtil.userByEmail()",
                   notes="Field map script (docs/05 section 4, list fields)")
    elif t == "list":
        row.update(field_kind="List", script="split names -> sys_ids of the referenced table",
                   notes="Field map script (docs/05 section 4, list fields). Confirm what u_sites references (D18)")
    elif col in REFERENCE_BY_NAME:
        row.update(field_kind=f"Reference {REFERENCE_BY_NAME[col]}", referenced_value_field="name",
                   choice_action="reject (mock loads) / ignore (final)",
                   notes="Records must exist before the load")
    elif col == "u_cost_center":
        row.update(field_kind="Reference cmn_cost_center", referenced_value_field="code",
                   choice_action="ignore")
    elif t == "date":
        row.update(field_kind="Date", notes="Date format yyyy-MM-dd")
    elif "value_map" in spec or "const" in spec:
        row.update(field_kind="Choice", choice_action="reject",
                   notes=f"Values from value map '{spec.get('value_map', 'constant')}' - must be stored values")
    elif t in ("number", "percent"):
        row["field_kind"] = "Number"
    elif t == "bool":
        row["field_kind"] = "True/False"
    else:
        row["field_kind"] = "String / text"
    return row


def transform_map_spec(mapping_path: str | Path, out_path: str | Path,
                       import_tables: dict | None = None) -> list[dict]:
    rows = []
    for source in SOURCES:
        for table, spec in load_yaml(mapping_path)["targets"].items():
            import_table = import_table_name(source, table, import_tables)
            for col, cspec in spec["columns"].items():
                if applies_to(source, col):
                    rows.append(_field_row(source, table, import_table, spec["file"], col, cspec))
    write_csv(out_path, rows, list(rows[0].keys()))
    return rows


# --------------------------------------------------------------------------- Import Set API

class ImportSetClient:
    def __init__(self, instance_url: str, username: str, password: str, max_retries: int = 5):
        if not (instance_url and username and password):
            raise ValueError("servicenow.instance_url / username / password are required for --execute")
        self.base = instance_url.rstrip("/")
        self.session = requests.Session()
        self.session.auth = (username, password)
        self.session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})
        self.max_retries = max_retries

    def insert(self, import_table: str, record: dict) -> dict:
        """Synchronous single-row insert: the transform runs and the result comes back."""
        for attempt in range(self.max_retries):
            resp = self.session.post(f"{self.base}/api/now/import/{import_table}", json=record, timeout=120)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(int(resp.headers.get("Retry-After", 2 ** attempt)))
                continue
            if resp.status_code >= 400:
                return {"status": "http_error", "error_message": f"{resp.status_code}: {resp.text[:300]}"}
            results = (resp.json().get("result") or [{}])
            return results[0] if isinstance(results, list) else results
        return {"status": "http_error", "error_message": "retries exhausted"}


def push(settings: dict, mapping_path: str | Path, only: list[str] | None = None,
         execute: bool = False, limit: int | None = None, sources: tuple = SOURCES) -> list[dict]:
    """Send per-source load files to the Import Set API in load order (demands, projects, tasks, ...)."""
    sn = settings.get("servicenow", {})
    load = Path(settings["paths"]["load"])
    client = ImportSetClient(sn.get("instance_url", ""), sn.get("username", ""), sn.get("password", "")) \
        if execute else None
    results, summary = [], []
    for source in sources:
        for table, spec in load_yaml(mapping_path)["targets"].items():
            if only and table not in only:
                continue
            rows = read_csv(load / source / spec["file"])[: limit or None]
            if not rows:
                continue
            import_table = import_table_name(source, table, sn.get("import_tables"))
            counts: dict[str, int] = {}
            for i, row in enumerate(rows, 1):
                record = {f"u_{k.lower()}": v for k, v in row.items() if v != ""}
                if not execute:
                    status, res = "dry_run", {}
                else:
                    res = client.insert(import_table, record)
                    status = res.get("status", "unknown")
                counts[status] = counts.get(status, 0) + 1
                results.append({"source_system": source, "target_table": table, "import_set_table": import_table,
                                "row": i, "correlation_id": row.get("correlation_id") or row.get("project_correlation_id", ""),
                                "status": status, "target_sys_id": res.get("sys_id", ""),
                                "error_message": res.get("error_message", "") or res.get("status_message", "")})
            log.info("%s/%s -> %s: %d rows %s", source, spec["file"], import_table, len(rows), counts)
            summary.append({"source_system": source, "target_table": table, "import_set_table": import_table,
                            "rows": len(rows), **counts})
    write_csv(load / "push_results.csv", results,
              ["source_system", "target_table", "import_set_table", "row", "correlation_id", "status",
               "target_sys_id", "error_message"])
    return summary
