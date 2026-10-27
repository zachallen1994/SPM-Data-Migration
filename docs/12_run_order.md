# Run order: full Adaptive / Asana load

The pattern for every step: **run the Data Source** (Load All Records) → open the new **import set** →
**Transform** → select **every map listed for that step** (they run by their Order) → check the import log.
A step only finds the records loaded by the steps before it, so keep the order.

## 0. Before the first step
- Every Data Source: `PILOT = []`. Projects: `PROJECT_TYPES` and `STATES` as agreed.
- Delete old rows from the staging tables (or transform only the newest import set).
- "Restrict time card to unassigned user" rule: off in Dev for now (later: the `x_mig.migration_running` condition).

## Run settings (system properties - no script edits in TEST / PROD)
| Property | Used by | Value |
|---|---|---|
| `x_mig.adaptive.pilot` | Projects data source | project names separated by `;`, or `all` |
| `x_mig.adaptive.states` | Projects data source | e.g. `Active;On Hold` |
| `x_mig.adaptive.project_types` | Projects data source | e.g. `Project` |
| `x_mig.adaptive.batch` | Projects data source | e.g. `2/7` = 2nd of 7 equal batches; blank = all |
| `x_mig.adaptive.scope` | Related, Budget, Time Cards data sources | `latest` = projects of the latest projects load (the current batch); `all`; or numbers / names separated by `;` |

Batch run: set `batch` = 1/7 and `scope` = latest, run steps 2-7, then batch = 2/7, and so on. A final run with
`batch` blank and `scope` = all picks up anything missed (re-runs update, never duplicate).

## Adaptive

| # | Data Source | Then transform with these maps | Target |
|---|---|---|---|
| 1 | Adaptive Programs - API | Import Adaptive Programs | pm_program |
| 2 | Adaptive Projects - API | Import Adaptive Projects Transform Map **and** Import Adaptive Demands Transform Map | pm_project, dmn_demand (linked to programs) |
| 3 | Adaptive Tasks (related template, ENTITY = Task) | Import Adaptive Project Tasks Transform Map | pm_project_task |
| 4 | Adaptive Resources - API | Resources - Tasks, Resources - Projects, Resources - Assignments | task / project team, resource assignments |
| 5 | Adaptive Issues, Adaptive Risks, Adaptive Lessons Learned, Adaptive Status History (any order) | each one's own map | issue, risk, u_lessons_learned, project_status |
| 6 | Adaptive Budget Lines - API | Import Adaptive Budget Lines (100) **and** Import Adaptive Actuals (200) | cost_plan, fm_expense_line |
| 7 | Adaptive Time Cards - API | Import Adaptive Time Cards | time_card |
| 7a | Fix Script `timecards_set_processed.js` | (none) | cards Submitted → Approved, so hours roll up |
| 8 | Fix Script `attachments_fix_script.js` (last) | (none) | files on every migrated record |

## Asana (separate, after its scope is confirmed)

| # | Data Source | Maps |
|---|---|---|
| A1 | Asana Portfolio - API (MODE = 'projects', SOURCE = 'tracker') | the Asana projects map |
| A2 | Asana Work Plan - API (MODE = 'tasks') | the Asana project tasks map |

## Re-running
Every map coalesces on correlation_id (risks: task + short description; time cards: user + task + week), so a
re-run updates and does not duplicate. Re-run from the step that changed **and every step after it**.
