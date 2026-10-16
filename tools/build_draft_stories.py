"""Build docs/rm_story_drafts_ready.xlsx from the full backlog (rm_story_4):
- "Drafts - assign": the 6 Draft stories rewritten for the API route, paste-ready (plain + HTML).
- "In flight - fixes": only the corrections the Ready / Work-in-progress stories need.
- "Build order".
Names below are the ones seen in Dev; anything not yet seen is marked [CONFIRM] and is filled from
the Discovery step (first acceptance criterion of STRY0067506).
"""
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_related_record_stories import CODE, P, TABLE, UL, to_html, to_text  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "rm_story_drafts_ready.xlsx"

BASE = ("Already working in Dev: system properties x_mig.adaptive.url (https://api2.clarizen.com/v2.0/services), "
        "x_mig.adaptive.key, x_mig.asana.token, x_mig.asana.project_gid (1208928603143252 = HR Project Portfolio 2026); "
        "Data Source 'Adaptive Projects - API' -> u_import_adaptive_projects -> Import Adaptive Projects Transform Map "
        "(PRJ0010675 created). Key rule for every map: correlation_id = \"ADAPTIVE:\" + Adaptive id "
        "(e.g. ADAPTIVE:/Project/5afh...) or \"ASANA:\" + Asana gid. Scripts: repo folder servicenow/.")

DRAFTS = [
    dict(num="STRY0067504", pts=1, assign="Yes", deps="-",
         title="Configure AdaptiveWork API connection settings (Dev, Test, Prod)",
         body=[
             (P, "No Outbound REST Message record is needed: every Data Source and script calls the API directly "
                 "(sn_ws.RESTMessageV2) and reads the address and key from system properties. This is how the working "
                 "'Adaptive Projects - API' Data Source runs in Dev."),
             (P, "This story is complete when:"),
             (UL, [
                 "System properties exist: x_mig.adaptive.url (string) = https://api2.clarizen.com/v2.0/services; "
                 "x_mig.adaptive.key (password2). No key appears in any script.",
                 "Test 1 (Scripts - Background): POST {url}/data/query with "
                 "{\"q\":\"SELECT Name FROM Project\",\"paging\":{\"from\":0,\"limit\":2}} and header "
                 "Authorization: ApiKey <key> returns 200 and two projects.",
                 "Test 2: GET {url}/metadata/describeEntities?typeNames=Project returns 200 (GET - POST returns 404).",
                 "The key value is switched to the svc_sn_migration service account key when issued.",
                 "The same properties are created in Test and Prod (values are entered per instance; they do not move "
                 "with code), and Test 1 passes in each.",
             ]),
         ]),
    dict(num="STRY0067506", pts=8, assign="Yes", deps="STRY0067504; projects loaded (STRY0066697)",
         title="Create API Data Sources and Staging Tables for AdaptiveWork Entities",
         body=[
             (P, BASE),
             (P, "No Scheduled Data Imports: each Data Source is Type 'Custom (Load by Script)' and is run by hand in "
                 "build order (scheduling adds nothing for a one-time migration)."),
             (P, "This story is complete when:"),
             (UL, [
                 "Discovery: servicenow/discovery_background_script.js is run in Scripts - Background and its output is "
                 "attached to this story. It lists the real Adaptive entity and field names; every [CONFIRM] below is "
                 "filled from it before building that Data Source.",
                 "Each staging table below has String(100) columns Correlation ID, Parent Correlation ID, "
                 "Project Correlation ID (added like Correlation ID on u_import_adaptive_projects).",
                 "Each Data Source uses servicenow/adaptive_related_data_source.js with only its CONFIG block changed "
                 "(ENTITY, PROJECT_FIELD, MAP of column label -> Adaptive field). The script loads records only for "
                 "projects already in pm_project with an ADAPTIVE: correlation_id, follows paging, and flattens "
                 "references ({\"id\":\"/State/Active\"} -> Active; dates -> yyyy-MM-dd).",
                 "Load All Records on each completes with no import-log errors, and the log line 'rows loaded: N "
                 "(for M projects)' matches Adaptive for the pilot projects.",
                 "Demands: not built until the Demand vs Project rule is confirmed (STRY0066695).",
             ]),
             (TABLE, ["Data Source", "Staging table", "ENTITY", "PROJECT_FIELD", "Used by"], [
                 ["Adaptive Projects - API (done)", "u_import_adaptive_projects", "Project", "-", "STRY0066697, STRY0066701"],
                 ["Adaptive Tasks - API", "u_import_adaptive_project_tasks", "Task", "Project", "STRY0066699"],
                 ["Adaptive Milestones - API", "u_import_adaptive_project_tasks", "Milestone", "Project",
                  "STRY0066699 (Milestone = '=true')"],
                 ["Adaptive Risks - API", "u_import_adaptive_risks", "[CONFIRM] Risk", "[CONFIRM]", "STRY0066718"],
                 ["Adaptive Issues - API", "u_import_adaptive_issues", "[CONFIRM] Issue", "[CONFIRM]", "STRY0066715"],
                 ["Adaptive Lessons - API", "[new] u_import_adaptive_lessons", "C_PMOLessonsLearned", "C_RelatedWorkItem",
                  "STRY0067099"],
                 ["Adaptive Resources - API", "[new] u_import_adaptive_resources", "[CONFIRM] resource link entity",
                  "[CONFIRM]", "STRY0066702"],
                 ["Adaptive Time - API", "[new] u_import_adaptive_time", "[CONFIRM] timesheet entity", "[CONFIRM]",
                  "STRY0066702"],
             ]),
         ]),
    dict(num="STRY0066701", pts=3, assign="Yes", deps="STRY0066697",
         title="Create Transform Map: Migrate Adaptive Health to Status Reports (project_status)",
         body=[
             (P, BASE),
             (P, "Source: Adaptive keeps health on the project (Health, Schedule/Budget/Resource/Scope/Risk Health, "
                 "Update Notes), already loaded into u_import_adaptive_projects. No extra API call: a second transform "
                 "map on the same staging table creates one status report per project. Asana: not in scope (HR "
                 "portfolio items have no status reports)."),
             (P, "This story is complete when:"),
             (UL, [
                 "System property x_mig.status_as_on (string, yyyy-MM-dd) = the migration date. A fixed date makes "
                 "reruns update the same report.",
                 "Transform map 'Import Adaptive Status Reports': u_import_adaptive_projects -> project_status, Order 200 "
                 "(project map Order 100). Run Transform selects both maps.",
                 "Field map [Script] -> project, Coalesce = true: sys_id of the pm_project whose correlation_id = "
                 "source.u_correlation_id (skip row if none).",
                 "Field map [Script] -> as_on, Coalesce = true: gs.getProperty('x_mig.status_as_on').",
                 "onBefore below sets the 5 health fields (value table below) and comments; a project with no health "
                 "values gets no report. Choice action on the health fields = Reject.",
                 "Staging column names used: u_health, u_schedule_health, u_budget_health, u_resource_health, "
                 "u_scope_health, u_risk_health, u_update_notes (dev confirms on the table's Columns tab).",
                 "Done when each pilot project has 1 status report matching Adaptive's colours, and a rerun adds none.",
             ]),
             (CODE, "(function runTransformScript(source, map, log, target) {\n"
                    "    var rag = { 'on target': 'green', 'on plan': 'green', 'needs attention': 'yellow', 'in trouble': 'red' };\n"
                    "    function c(v) { return rag[(v + '').toLowerCase().trim()] || ''; }\n"
                    "    target.overall_health = c(source.u_health);\n"
                    "    target.schedule  = c(source.u_schedule_health);\n"
                    "    target.cost      = c(source.u_budget_health);\n"
                    "    target.resources = c(source.u_resource_health);\n"
                    "    target.scope     = c(source.u_scope_health);\n"
                    "    if (!target.overall_health && !target.schedule && !target.cost && !target.resources && !target.scope) { ignore = true; return; }\n"
                    "    var risk = source.u_risk_health + '';\n"
                    "    var notes = (source.u_update_notes + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');\n"
                    "    target.comments = (risk ? 'Risk health (Adaptive): ' + risk + '\\n' : '') + notes;\n"
                    "})(source, map, log, target);"),
             (TABLE, ["Adaptive value", "project_status value"], [
                 ["On Target / On Plan", "green"], ["Needs Attention", "yellow"], ["In Trouble", "red"], ["blank", "(empty)"],
             ]),
         ]),
    dict(num="STRY0066702", pts=8, assign="Yes (scope as written)", deps="STRY0067506 (Resources, Time); STRY0066699",
         title="Migrate Adaptive Resource Assignments and Time (actual effort) to Project Tasks",
         body=[
             (P, BASE),
             (P, "Scope: (1) the people on each task, (2) hours already worked per task. NOT in scope unless the BA "
                 "decides otherwise: rate models, weekly time cards, resource plans/allocations (they create cost and "
                 "Resource Management records that need fiscal periods, rates and approvals)."),
             (P, "This story is complete when:"),
             (UL, [
                 "Resources: transform map u_import_adaptive_resources -> pm_project_task. [Script] -> correlation_id "
                 "(Coalesce = true) returns source.u_project_correlation_id (the task the person is linked to).",
                 "Resources onBefore: if no pm_project_task has that correlation_id, ignore = true (this map never "
                 "creates tasks). First person -> assigned_to; others are added to additional_assignee_list without "
                 "duplicates. Users match sys_user on email; no match -> log.warn, field left as is.",
                 "Links on a project (ADAPTIVE:/Project/...) go through a second map on the same staging table -> "
                 "pm_project (same rules), adding people to the project's additional_assignee_list.",
                 "Time: the 'Adaptive Time - API' Data Source sums hours per work item and inserts one row per task "
                 "(Project Correlation ID = the task, Total Hours).",
                 "Time map u_import_adaptive_time -> pm_project_task, same coalesce and same 'never create' guard; "
                 "Total Hours -> the task's actual effort field (dev confirms the element name in the pm_project_task "
                 "dictionary).",
                 "Asana: no separate feed. Assignee and collaborators come with the Asana work plan (STRY0065275); "
                 "time only if Discovery shows actual_time_minutes.",
                 "Done when 5 pilot tasks show the same people and total hours as Adaptive, and a rerun changes nothing.",
             ]),
         ]),
    dict(num="STRY0066723", pts=5, assign="Yes (build now, run last)", deps="All record loads",
         title="Migrate Legacy Attachments from Asana and Adaptive via API",
         body=[
             (P, BASE),
             (P, "Replaces manual download/upload. Script: servicenow/attachments_fix_script.js (Fix Script)."),
             (P, "This story is complete when:"),
             (UL, [
                 "Asana: for each migrated record with an ASANA: correlation_id, GET "
                 "https://app.asana.com/api/1.0/attachments?parent=<gid>&opt_fields=name,host,size,download_url,view_url.",
                 "Files with host = asana are downloaded from download_url (a short-lived signed link: fetched "
                 "immediately and WITHOUT the Asana token) and saved with RESTMessageV2.saveResponseBodyAsAttachment"
                 "(table, sys_id, file name).",
                 "Files hosted elsewhere (Google Drive, Box, Dropbox, OneDrive) cannot be downloaded: their name and "
                 "view_url are added as a work note on the record.",
                 "Adaptive: files linked to each ADAPTIVE: record; the link query and download path are set at the top of "
                 "the script from the Discovery output (ADAPTIVE_LINK_QUERY, ADAPTIVE_DOWNLOAD) [CONFIRM].",
                 "Tables: pm_project, pm_project_task, dmn_demand, risk, issue (as loaded).",
                 "Run 1 with DRY_RUN = true; System Logs (source x_mig.attachments) shows what would be copied. "
                 "Run 2 with DRY_RUN = false.",
                 "Rerun-safe: a file with the same name already on the record is skipped. Files over 50 MB are logged "
                 "for manual copy.",
                 "Done when the final log line shows failed = 0 (or each failure is listed and resolved) and 10 files "
                 "are opened successfully in ServiceNow.",
             ]),
         ]),
    dict(num="STRY0066721", pts=6, assign="HOLD", deps="BA decision: budget source + cost plans vs demand totals",
         title="Create Transform Map: Migrate Adaptive Budgets to Cost Plans (cost_plan)",
         body=[
             (P, "Not ready to assign: two answers are needed first, otherwise the dev builds against a guess."),
             (UL, [
                 "Where budgets live in Adaptive: project fields or a budget/expense entity (the Discovery output in "
                 "STRY0067506 lists the candidates).",
                 "Cost plans or demand budget totals (STRY0066695) - not both: cost plans roll up and overwrite the totals.",
             ]),
             (P, "Once answered, the acceptance criteria will be:"),
             (UL, [
                 "Data Source on the confirmed source: one row per project per expense type (Capex/Opex), Correlation ID "
                 "= 'ADAPTIVE:' + project id + ':' + expense type.",
                 "Transform -> cost_plan, coalesce on correlation_id; task = pm_project / dmn_demand via Project "
                 "Correlation ID.",
                 "Capex/Opex and category convert in field map scripts (dev confirms field names in the cost_plan dictionary).",
                 "start_date / end_date = project start / end so ServiceNow builds cost_plan_breakdown; fiscal periods "
                 "must exist for those dates.",
                 "Done when pilot project totals equal Adaptive.",
             ]),
         ]),
]

IN_FLIGHT = [
    ("STRY0067932", "Ready", "Asana API Connection",
     "AC 1: no Outbound REST Message record is needed - the Data Source script calls Asana directly and reads the token from property x_mig.asana.token (same as Adaptive). "
     "Staging table is u_import_asana_hr_project_portfolio (story says u_imp_asana_hr_portfolio). "
     "Project GID = 1208928603143252 (HR Project Portfolio 2026; workspace 5286451799521 is not the project). "
     "Use a Data Source 'Custom (Load by Script)' instead of a Scheduled Job, so the transform map runs on the loaded "
     "rows: servicenow/asana_data_source.js (MODE 'projects'; MODE 'tasks' for the work plan) already does AC 2-5. "
     "Add assignee.name and gid to opt_fields. Token is in property x_mig.asana.token (password2), proven 200 in Dev."),
    ("STRY0066697", "Work in progress", "Adaptive Projects -> pm_project",
     "Working in Dev. Remaining: (1) scripts for project_manager, u_funding_type, u_sites must return blank on no match "
     "(they write 'undefined'); (2) add field map Project Description -> description; (3) Business Sponsor -> "
     "u_business_owner (not u_executive_sponsor; Adaptive has no executive sponsor); (4) staging table name is "
     "u_import_adaptive_projects; (5) Planned Finish blank -> DueDate? (BA decision)."),
    ("STRY0066699", "Work in progress", "Adaptive Work Plans -> pm_project_task",
     "Feed = 'Adaptive Tasks - API' + 'Adaptive Milestones - API' (STRY0067506). Staging needs Correlation ID / "
     "Parent Correlation ID / Project Correlation ID. Milestones are a separate Adaptive entity (milestone = true). "
     "Run the transform twice (children can arrive before parents). Task state values need BA sign-off."),
    ("STRY0066695", "Work in progress", "Adaptive -> Demands",
     "Blocked until the Demand vs Project rule exists. 'Upstream pipeline' no longer exists: conversions go in the "
     "transform map. Total Budget -> financial_return is wrong (that is expected return). u_executive_sponsor: Adaptive "
     "only has Business Sponsor -> u_business_owner."),
    ("STRY0066715", "Work in progress", "Adaptive Issues -> issue",
     "Coalesce on correlation_id (\"ADAPTIVE:\" + issue id) instead of parent + title (titles repeat). Feed = 'Adaptive "
     "Issues - API'. Remove 'upstream pipeline' wording; conversions stay in the map. Confirm 'Investigating' exists "
     "on issue state."),
    ("STRY0066718", "Work in progress", "Adaptive Risks -> risk",
     "Coalesce on correlation_id (\"ADAPTIVE:\" + risk id) instead of parent + identifier. Feed = 'Adaptive Risks - API'."),
    ("STRY0067099", "Work in progress", "Adaptive Lessons -> u_lessons_learned",
     "correlation_id must be \"ADAPTIVE:\" + id (not the bare /C_PMOLessonsLearned/123), and u_project must look up "
     "\"ADAPTIVE:\" + C_RelatedWorkItem.id - project correlation_ids carry the ADAPTIVE: prefix, so the bare id "
     "finds nothing. Feed = 'Adaptive Lessons - API' (does this). Parsing example comment is wrong ('Other' returns "
     "'Other'). Confirm u_lessons_learned has correlation_id."),
    ("STRY0065263", "Work in progress", "Asana -> pm_project",
     "Switch from CSV to the API feed (STRY0067932). correlation_id = \"ASANA:\" + gid (gid now available). Only "
     "top-level portfolio items are projects; skip Completed/Cancelled. Several mappings conflict with the new HR form "
     "(Section -> u_functional_area, Entity -> u_sites, no u_business_category, primary_goal, impacted_business_units): "
     "see the 12 questions in mapping/Asana_HR_Project_to_ServiceNow.xlsx."),
    ("STRY0065275", "Work in progress", "Asana -> pm_project_task",
     "Switch to the API feed (asana_data_source.js MODE 'tasks'): Task ID (gid) and Assignee Email now come through, "
     "so the earlier blocker is gone. Parent and project come from Parent / Project Correlation ID (not names). "
     "Dependency table is planned_task_rel_planned_task."),
]

BUILD_ORDER = [
    ("1", "STRY0067504", "Connection settings (system properties) in Dev, Test, Prod - no REST Message record"),
    ("2", "STRY0066697 fixes", "Project map fixes, rerun -> 'updated' not 'inserted'"),
    ("3", "STRY0067932 / STRY0065263", "Asana portfolio via API"),
    ("4", "STRY0067506", "Discovery, then Tasks/Milestones, Risks, Issues, Lessons, Resources, Time Data Sources"),
    ("5", "STRY0066699 / STRY0065275", "Work plans (transform twice)"),
    ("6", "STRY0066701", "Status reports (second map on projects)"),
    ("7", "STRY0066718 / STRY0066715 / STRY0067099", "Risks, issues, lessons"),
    ("8", "STRY0066702", "People and actual effort on tasks"),
    ("9", "STRY0066695", "Demands (when rule exists)"),
    ("10", "STRY0066721", "Cost plans (when decided)"),
    ("11", "STRY0066723", "Attachments - always last"),
]


def sheet(wb, title, head, rows, widths):
    ws = wb.create_sheet(title)
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F4E78")
    for r in rows:
        ws.append(list(r))
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows():
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "B2"
    return ws


def main():
    wb = Workbook()
    wb.remove(wb.active)
    ws = sheet(wb, "Drafts - assign", ["Number", "Assign now?", "Short description", "Points", "Depends on",
                                       "Acceptance criteria", "Acceptance criteria (HTML - paste into ServiceNow)"],
               [(s["num"], s["assign"], s["title"], s["pts"], s["deps"], to_text(s["body"]), to_html(s["body"]))
                for s in DRAFTS],
               [13, 14, 40, 7, 26, 100, 40])
    for r in range(2, ws.max_row + 1):
        hold = ws.cell(r, 2).value == "HOLD"
        ws.cell(r, 2).fill = PatternFill("solid", fgColor="FCE4D6" if hold else "E2EFDA")
    sheet(wb, "In flight - fixes", ["Number", "State", "Story", "What needs correcting"], IN_FLIGHT, [13, 16, 34, 120])
    sheet(wb, "Build order", ["Step", "Story", "What"], BUILD_ORDER, [6, 40, 80])
    wb.save(OUT)
    print(OUT, len(DRAFTS), "drafts,", sum(s["pts"] for s in DRAFTS if s["assign"] != "HOLD"), "points assignable")


if __name__ == "__main__":
    main()
