# Go-live runbook: Adaptive (and Asana) to ServiceNow SPM

Every step = run the **Data Source** (Load All Records) -> open its import set -> **Transform** with the maps listed
-> check the **Import Log** before the next step. A step only finds records created by the steps before it.

## A. Before go-live day (PROD ready)

| # | Item | Owner | Done |
|---|---|---|---|
| A1 | Update set(s) in PROD: data sources, staging tables **with every column** (labels exactly as in TEST), transform maps, field map + transform scripts | Migration | ☐ |
| A2 | Properties: `x_mig.adaptive.url`, `x_mig.adaptive.key` (PROD key), `x_mig.adaptive.pilot` = `all`, `x_mig.adaptive.states` = `Active;On Hold`, `x_mig.adaptive.project_types` = `Project`, `x_mig.adaptive.scope` = `all` (blank batch) | Migration | ☐ |
| A3 | Old Opex/Capex Budget and Actuals maps **inactive** | Migration | ☐ |
| A4 | Choices and reference data exist: project State *Work in Progress*, rate models (BSMH, COV, UVA, WMH, NCH, RFSH, CRH, HCPH), cost types, Sites / Business Category / Estimate Type / Groups choices | Implementation team | ☐ |
| A5 | Decisions applied: labor cost on migrated time (no), time card preference on projects, `operational_work_type` value, fast load for tasks (`FAST_LOAD`) yes/no, time cards rules on (PART E) or fast (PART F) | Implementation team | ☐ |
| A6 | Rules for the load window: "Restrict time card to unassigned user" and any blocking rule conditioned on `x_mig.migration_running` | Implementation team | ☐ |
| A7 | Email / notifications suppressed for the load window | Platform team | ☐ |
| A8 | Someone with **fix script / background script** rights in PROD for the attachments step and checks | Platform team | ☐ |
| A9 | Adaptive change freeze agreed (no edits during the load) | Client | ☐ |

## B. Go-live day

| # | Data Source | Transform with | Check in the Import Log | TEST time |
|---|---|---|---|---|
| 0 | Set `x_mig.migration_running` = true; confirm notifications off; Adaptive frozen | | | |
| 1 | Adaptive Programs - API | Import Adaptive Programs | ~5 programs, no date errors | minutes |
| 2 | Adaptive Projects - API | Import Adaptive Projects **and** Import Adaptive Demands | "skipped by State", unmapped phases, no errors | ~15 min |
| 3 | Adaptive Tasks (`PARENT_TABLES = ['pm_project']`) | Import Adaptive Project Tasks (**once**) | errors; "Validate ... dates" rows for the BA | hours (run overnight) |
| 4 | Adaptive Resources (project level) | Import Adaptive Resources | "No ServiceNow user" names | hours |
| 5 | Issues, Risks, Lessons Learned, Status History (Jan 2025+, one per day) | each one's own map | counts per project | ~2 h status history |
| 6 | Adaptive Budget Lines - API | Budget Lines (100) **and** Actuals (200) | "No ServiceNow cost type" lines | minutes |
| 7 | Adaptive Time Entries - API | Import Adaptive Time Cards | users / work items skipped; cards Processed | longest step |
| 8 | Fix Script `attachments_fix_script.js` (last) | | files copied / skipped | |
| 9 | Asana: Portfolio - API, then Work Plan - API | Asana projects map, Asana tasks map | | |

Too long for one window? Run steps 2-7 in batches: `x_mig.adaptive.batch` = 1/7, `x_mig.adaptive.scope` = `latest`,
steps 2-7, then 2/7 ... 7/7. Finish with batch blank and scope `all` (catch-up; re-runs update, never duplicate).

## C. After the load (sign-off)

| # | Check | Script / where |
|---|---|---|
| C1 | Project / demand counts match Adaptive (Active + On Hold, type Project) | `project_load_check.js` |
| C2 | No record is both a project and a demand | `demand_project_duplicates_check.js` |
| C3 | 2-3 projects end to end vs Adaptive: dates, tasks, % complete, resources, budget, actual effort | `project_compare_check.js`, `task_dates_check.js`, `timecard_totals_check.js` |
| C4 | Import logs: collect "No ServiceNow user", "no choice matches", "Unmapped" for the BA | import logs |
| C5 | `x_mig.migration_running` = false; notifications back on; rules back to normal | |
| C6 | Adaptive read-only / retired as agreed | Client |

## D. If something goes wrong

- Re-running a step is safe (every map coalesces), **except**: existing projects / tasks do not take new dates or a
  new parent ("Disable the Change of Planned Dates", "Change Parent"). For a bad task load of a project, use
  `tasks_reset_for_project.js` (DRY_RUN first), then load that project's tasks and time again (`scope` = its number).
- A record loaded as the wrong type (demand vs project): `duplicate_remove_with_related.js` (DRY_RUN first).
- Out-of-scope projects loaded by mistake: `out_of_scope_cleanup.js` (DRY_RUN first).
