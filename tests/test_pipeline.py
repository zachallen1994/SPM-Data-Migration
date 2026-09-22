"""End-to-end test: sample Asana + Adaptive raw extracts -> ServiceNow load files."""
import shutil
from pathlib import Path

import pytest
import yaml

from spm_migration import cli
from spm_migration.common import read_csv

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture()
def run_dir(tmp_path):
    shutil.copytree(FIXTURES / "raw", tmp_path / "raw")
    settings = yaml.safe_load((ROOT / "config/settings.example.yaml").read_text())
    settings["paths"] = {k: str(tmp_path / k) for k in ("raw", "staging", "load", "reference")}
    settings["as_of_date"] = "2026-09-22"
    settings["asana"]["intake_project_gids"] = ["300"]
    (tmp_path / "reference").mkdir()
    (tmp_path / "reference/sys_user.csv").write_text(
        "email,user_name\npat.pm@example.com,pat\ndev@example.com,dev\npm2@example.com,pm2\n")
    (tmp_path / "settings.yaml").write_text(yaml.safe_dump(settings))
    (tmp_path / "overrides.csv").write_text(
        "source_system,source_id,target_class,include_tasks,demand_link,note\n"
        "asana,600,demand,,,Owner says still an idea\n")
    args = ["--settings", str(tmp_path / "settings.yaml"), "--overrides", str(tmp_path / "overrides.csv"),
            "--rules", str(ROOT / "config/classification.yaml"),
            "--mapping", str(ROOT / "config/target_mapping.yaml"),
            "--value-maps", str(ROOT / "mapping/value_maps.csv")]
    assert cli.main(["run-all", *args]) == 0
    return tmp_path


def by(rows, key="correlation_id"):
    return {r[key]: r for r in rows}


def test_classification(run_dir):
    rows = {(r["source_system"], r["source_id"]): r
            for r in read_csv(run_dir / "staging/work_items_classified.csv")}
    cls = {k: r["target_class"] for k, r in rows.items()}
    assert cls[("asana", "100")] == "project"
    assert cls[("asana", "200")] == "demand"             # pipeline portfolio
    assert cls[("asana", "300")] == "skip"               # intake board container
    assert cls[("asana", "301")] == "demand"             # intake task
    assert cls[("asana", "400")] == "skip"               # template
    assert cls[("asana", "500")] == "skip"               # old closed
    assert cls[("asana", "600")] == "demand"             # override beats empty-shell review rule
    assert rows[("asana", "600")]["classification_rule"] == "override"
    assert cls[("asana", "700")] == "project"            # recent completed, header only
    assert rows[("asana", "700")]["include_tasks"] == "false"
    assert cls[("adaptive", "/Project/A1")] == "project"
    assert cls[("adaptive", "/Project/A2")] == "review"  # proposal phase but already has a task
    assert rows[("adaptive", "/Project/A2")]["classification_rule"] == "pre_approval_stage_with_tasks_needs_review"
    review_ids = {r["source_id"] for r in read_csv(run_dir / "staging/classification_review.csv")}
    assert review_ids == {"/Project/A2"}
    assert cls[("adaptive", "/Project/A3")] == "skip"
    assert cls[("adaptive", "/EnhancementRequest/R1")] == "demand"


def test_demand_load_file(run_dir):
    demands = by(read_csv(run_dir / "load/01_dmn_demand.csv"))
    crm = demands["ASANA:301"]
    assert crm["state"] == "submitted"
    assert crm["opened_by"] == "migration.unassigned@example.com"   # requester not in sys_user
    assert crm["business_case"] == "Save $1M"
    assert crm["priority"] == "3"
    assert demands["ADAPTIVE:/EnhancementRequest/R1"]["assigned_to"] == "pm2@example.com"
    assert demands["ADAPTIVE:/EnhancementRequest/R1"]["due_date"] == "2027-01-31"
    assert demands["ASANA:200"]["portfolio"] == "FY27 Pipeline"


def test_project_and_task_load_files(run_dir):
    projects = by(read_csv(run_dir / "load/02_pm_project.csv"))
    erp = projects["ASANA:100"]
    assert erp["state"] == "2" and erp["project_manager"] == "pat.pm@example.com"
    assert erp["description"] == "Upgrade the ERP"
    assert erp["primary_portfolio"] == "Enterprise Delivery"
    assert projects["ADAPTIVE:/Project/A1"]["u_legacy_id"] == "P-00001"
    assert projects["ASANA:700"]["state"] == "3"

    tasks = read_csv(run_dir / "load/03_pm_project_task.csv")
    t = by(tasks)
    assert t["ASANA:102"]["u_parent_correlation_id"] == "ASANA:101"
    assert t["ASANA:102"]["u_level"] == "2"
    assert t["ASANA:101"]["u_parent_correlation_id"] == "ASANA:100"
    assert t["ASANA:102"]["start_date"] == "2026-01-29"            # due-only task -> start = due
    assert t["ASANA:104"]["milestone"] == "true"
    assert t["ADAPTIVE:/Task/T2"]["u_parent_correlation_id"] == "ADAPTIVE:/Task/T1"
    assert t["ADAPTIVE:/Milestone/M1"]["milestone"] == "true"
    assert "ASANA:701" not in t                                     # header-only project
    levels = [int(r["u_level"]) for r in tasks]
    assert levels == sorted(levels)                                 # parents before children

    excluded = {r["source_id"]: r["exclusion_reason"] for r in read_csv(run_dir / "load/excluded_tasks.csv")}
    assert excluded["701"] == "project loaded header-only"


def test_dependencies_status_and_reports(run_dir):
    deps = read_csv(run_dir / "load/04_planned_task_rel_planned_task.csv")
    pairs = {(d["u_predecessor_correlation_id"], d["u_successor_correlation_id"]): d for d in deps}
    assert ("ASANA:101", "ASANA:103") in pairs
    assert pairs[("ADAPTIVE:/Task/T1", "ADAPTIVE:/Milestone/M1")]["lag"] == "2.0"
    assert len(read_csv(run_dir / "load/excluded_dependencies.csv")) == 1   # 999 not extracted

    statuses = read_csv(run_dir / "load/05_project_status.csv")
    health = {(s["u_project_correlation_id"], s["as_on"]): s["overall_health"] for s in statuses}
    assert health[("ASANA:100", "2026-09-01")] == "yellow"
    assert health[("ADAPTIVE:/Project/A1", "2026-09-10")] == "red"   # synthetic from TrackStatus

    users = {u["email"]: u["matched"] for u in read_csv(run_dir / "load/users_referenced.csv")}
    assert users["requester@example.com"] == "NO"
    assert users["dev@example.com"] == "yes"
    multi = read_csv(run_dir / "staging/multi_homed_tasks.csv")
    assert [m["source_id"] for m in multi] == ["103"]


def test_validate_fields(run_dir, tmp_path):
    ref = run_dir / "reference"
    (ref / "sys_dictionary.csv").write_text(
        "name,element\n"
        "task,correlation_id\ntask,correlation_display\ntask,short_description\ntask,description\n"
        "task,assigned_to\ntask,opened_by\ntask,state\ntask,priority\ntask,due_date\n"
        "planned_task,start_date\nplanned_task,end_date\nplanned_task,work_start\nplanned_task,work_end\n"
        "planned_task,percent_complete\nplanned_task,time_constraint\nplanned_task,wbs_order\n"
        "planned_task,milestone\ndmn_demand,type\ndmn_demand,category\ndmn_demand,portfolio\n"
        "dmn_demand,primary_program\ndmn_demand,department\ndmn_demand,start_date\ndmn_demand,business_case\n"
        "pm_project,project_manager\npm_project,phase\npm_project,primary_portfolio\n"
        "pm_project,primary_program\npm_project,department\n"
        "planned_task_rel_planned_task,type\nplanned_task_rel_planned_task,lag\n"
        "project_status,as_on\nproject_status,overall_health\n")
    (ref / "sys_choice.csv").write_text("name,element,value\nproject_status,overall_health,green\n"
                                        "project_status,overall_health,red\n")
    args = ["--settings", str(run_dir / "settings.yaml"), "--mapping", str(ROOT / "config/target_mapping.yaml"),
            "--value-maps", str(ROOT / "mapping/value_maps.csv")]
    assert cli.main(["validate-fields", *args]) == 1
    issues = read_csv(run_dir / "staging/field_validation.csv")
    errors = {(i["table"], i["column"]) for i in issues if i["severity"] == "ERROR"}
    assert ("project_status", "comments") in errors                  # not in dictionary
    assert ("project_status", "overall_health") in errors            # yellow not in choices
    assert ("pm_project", "short_description") not in errors         # inherited from task


def test_reconcile(run_dir):
    (run_dir / "reference/sn_pm_project.csv").write_text(
        "number,correlation_id\nPRJ001,ASANA:100\nPRJ002,ASANA:777\n")
    args = ["--settings", str(run_dir / "settings.yaml"), "--mapping", str(ROOT / "config/target_mapping.yaml")]
    assert cli.main(["reconcile", *args]) == 0
    summary = {r["table"]: r for r in read_csv(run_dir / "load/reconciliation_summary.csv")}
    assert summary["pm_project"]["missing"] == "2" and summary["pm_project"]["unexpected"] == "1"
    detail = read_csv(run_dir / "load/reconciliation_detail.csv")
    assert {"table": "pm_project", "correlation_id": "ASANA:777",
            "problem": "in ServiceNow but not in load file"} in detail
