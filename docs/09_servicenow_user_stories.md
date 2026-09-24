# 09: ServiceNow user stories (SPM Data Migration)

9 stories, 37 points. Each story covers one source file and one target table.
The shared rules are written once in **Migration Standards** (below, and in `docs/Migration_Standards.docx` for the epic).
The import-ready version is `mapping/servicenow_user_stories.xlsx`.

| Key | Story | Points | Depends on |
|---|---|---|---|
| MIG-01 | Asana Data Migration - Import HR Projects (Asana HR portfolio CSV -> pm_project) | 5 | - |
| MIG-02 | Asana Data Migration - Import Project Tasks (Asana HR plan CSV -> pm_project_task) | 5 | MIG-01 |
| MIG-03 | Adaptive Data Migration - Import Projects (Adaptive Projects export -> pm_project) | 5 | - |
| MIG-04 | Adaptive Data Migration - Import Demands (Adaptive Projects export -> dmn_demand) | 3 | MIG-03 |
| MIG-05 | Adaptive Data Migration - Import Project Tasks and Milestones (Adaptive Tasks export -> pm_project_task) | 5 | MIG-03 |
| MIG-06 | Data Migration - Task Dependencies, both sources (-> planned_task_rel_planned_task) | 3 | MIG-02, MIG-05 |
| MIG-07 | Adaptive Data Migration - Import Status Reports (Adaptive Projects export -> project_status) | 3 | MIG-03 |
| MIG-08 | Data Migration - Mock Loads, Reconciliation and Rollback | 5 | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07 |
| MIG-09 | Data Migration - Production Cutover Load | 3 | MIG-08 |

## SPM Data Migration - Migration Standards

These rules apply to every migration story. The stories only list what is specific to them. Scope: in-flight projects from Asana (HR) and Adaptive Work (Nordic IT PMO), plus Adaptive records that become Demands.

**1. Ownership**

- Fields, choice values and reference data (portfolios, business units, sites) are built by the implementation team. Do not create them during the migration.
- Before building a story, confirm its target fields and choice values exist. Raise anything missing with the migration lead; don't work around it.
- Choice values in the stories are ServiceNow defaults. Confirm the stored values with the implementation team (sys_choice) before the build.

**2. Source files**

- Source files are the system owners' exports: Asana HR portfolio CSV, Asana plan CSVs (one per project), Adaptive Projects, Adaptive Tasks/Milestones and Adaptive Dependencies (Excel).
- The column layout is frozen after mock load 1. Nobody opens or re-saves the files in Excel, because Excel corrupts the long Asana IDs.
- Create each staging table with Load Data from the sample file. ServiceNow names each column u_ + the header.
- Optional column 'Migration Target' (Project / Demand / Skip), filled in by the PMO: when present, it overrides the story's routing rule.

**3. Match key (every table)**

- correlation_id = "ASANA:" + Task ID, or "ADAPTIVE:" + SYSID. It is the only coalesce field.
- correlation_display = "Asana" or "Adaptive Work".
- Re-loading a file must update records. It must never create duplicates.

**4. Transform map settings**

- Run business rules = true. Copy empty fields = false.
- Enforce mandatory fields = false for mock loads, true for the final load.
- Choice fields have choice action = reject. Reference fields have choice action = reject in mock loads and ignore in the final load. Never "create".

**5. People**

- Match an active sys_user by email first, then by full name (sys_user.name). For a list of names, match each one.
- If there is no match: project_manager gets the placeholder user 'Migration Unassigned' (provided by the implementation team); every other people field stays blank. Log the value and the correlation_id.
- Never create users.

**6. Dates, numbers and text**

- Accept yyyy-MM-dd and Excel dates. If only one of start or end is present, use it for both.
- time_constraint = start_on_specific_date on projects and tasks, so the ServiceNow schedule keeps the source dates.
- % Complete: a value of 1 or less is a fraction (0.5 = 50).
- short_description is at most 160 characters. Strip HTML from long text.

**7. Description block (fields with no ServiceNow home)**

- Keep the source description/notes first. Then add a line '--- Migrated from Asana ---' (or Adaptive Work), then one 'Label: value' line per listed field. Skip blank values.

**8. Hierarchy and load order**

- Load in this order: Adaptive projects, then Adaptive demands, then Asana projects, then Asana tasks, then Adaptive tasks, then dependencies, then status reports.
- If a task's parent isn't found, put the task directly under its project and log it. Run each task transform twice; the second run fixes parents that loaded later.

**9. Logging, testing and rollback**

- Every fallback or skipped row writes log.warn with its correlation_id.
- After each load, compare the row counts in the file with the ServiceNow records, and review the import log.
- Every migrated record can be found by correlation_display, so the rollback deletes by it (children first).
- Suppress email notifications during sub-production loads.

---

## MIG-01: Asana Data Migration - Import HR Projects (Asana HR portfolio CSV -> pm_project)
*5 points · Priority 1 - Critical*

As a ServiceNow Developer, I need an Import Set and Transform Map for the Asana HR portfolio CSV, so that in-flight HR projects load into pm_project with their owner, dates, status and portfolio.

- **Source:** Asana HR portfolio CSV. Each top-level row is a project (in Asana, each project is a task in one portfolio project). Rows that have a Parent task are workstreams.
- **Target:** pm_project. Staging table u_imp_asana_projects.
- **Match key:** correlation_id = "ASANA:" + Task ID
- **Prerequisite:** The implementation team has created the portfolios named by the Section/Column values.

| Source | ServiceNow | Rule |
|---|---|---|
| Task ID | `correlation_id` | "ASANA:" + value (coalesce) |
| Name | `short_description` | Direct |
| Notes | `description` | Then the description block (below) |
| PM Assigned | `project_manager` | People rule; N/A, TBD and blank count as no match |
| HRSP / SME / Project Lead | `u_business_owner` | People rule |
| Start Date / Due Date | `start_date / end_date` | Date rule |
| Project Status | `state` | Not Started -5, Started/Scoping 1, In Progress 2, Delayed 2, On Hold -3, blank -5 |
| Section/Column | `primary_portfolio` | pm_portfolio by name (the COE area) |
| Project Type | `investment_class` | Project -> change, Annual Program -> run, Project/Annual Program -> change |
| Funding | `expense_type / u_funding_type` | CapEx -> capex / Capex required; OpEx -> opex / Opex required |
| Entity/Organization | `business_unit` | First value (BSMH, RSFH, GBS) by name |
| (constant) | `time_constraint` | start_on_specific_date |

**Description block:** Section/Column, Size/Complexity, I&T Integrations Needed, Strategy Focus, Strategy Timeline, HR COEs Engaged, HR Cross-Impacts, Entity/Organization

**Rules**

- Routing: ignore rows whose Project Status is Completed or Cancelled (in-flight scope only), and rows whose Migration Target is Skip.
- Rows with a Parent task: a second transform map on the same staging table loads them into pm_project_task. top_task and parent = the pm_project whose short_description = Parent task (Asana source). Use the same field rules as MIG-02.

**Out of scope:** Assignee (blank in the export); Tags; Cost Center (blank); u_business_category (waiting for the HR category value, decision D17)

**Acceptance criteria**

1. One pm_project per in-flight top-level row; Completed and Cancelled rows are not loaded.
2. project_manager is resolved, or set to Migration Unassigned with a log entry; no users are created.
3. primary_portfolio is set for every row whose section has a matching portfolio.
4. Workstream rows appear as project tasks under their project.
5. Loading the same file again creates 0 new records.
6. The HR PMO checks 5 sample projects side by side with Asana.

---

## MIG-02: Asana Data Migration - Import Project Tasks (Asana HR plan CSV -> pm_project_task)
*5 points · Priority 1 - Critical · Depends on MIG-01*

As a ServiceNow Developer, I need an Import Set and Transform Map for the Asana HR project-task CSV, so that in-flight tasks, sub-tasks and milestones load into pm_project_task under the correct project, with hierarchy, assignments and dates preserved.

- **Source:** Asana plan CSV, one file per project. The migration lead adds a 'Project ID' column (the portfolio row's Task ID) before the load.
- **Target:** pm_project_task. Staging table u_imp_asana_project_tasks.
- **Match key:** correlation_id = "ASANA:" + Task ID
- **Prerequisite:** MIG-01 is loaded.

| Source | ServiceNow | Rule |
|---|---|---|
| Task ID | `correlation_id` | "ASANA:" + value (coalesce) |
| Task Name | `short_description` | Direct |
| Project ID | `top_task` | pm_project where correlation_id = "ASANA:" + value |
| Parent task | `parent` | Parent task in the same project (by ID if the export has one, otherwise by name); if blank or not found, the project |
| Assigned To | `assigned_to` | People rule |
| Collaborators | `additional_assignee_list` | Split on commas; people rule for each name; skip unmatched |
| Start Date / Due Date | `start_date / end_date` | Date rule |
| Task Status | `state` | Not Started -5, In Progress 2, Completed 3 |
| % Complete | `percent_complete` | 0.5 -> 50 |
| Notes | `description` | Then the description block |
| Task Name contains "Milestone" | `milestone` | true; start = end = due date |
| (constant) | `time_constraint` | start_on_specific_date |

**Description block:** Section, COE, Entity/Organization

**Rules**

- Ignore rows whose Project ID doesn't match a loaded project (log them).

**Out of scope:** Dependencies (MIG-06); Tags; creating fields or users

**Acceptance criteria**

1. One pm_project_task per row, with correlation_id "ASANA:<Task ID>".
2. Every task has top_task set to its project. Sub-tasks sit under their parent task; any fallback is logged.
3. Tasks with "Milestone" in the name have milestone = true.
4. Dates match the CSV after load (the schedule hasn't moved them).
5. "In Progress" / 0.5 shows as Work in Progress / 50%.
6. No users are created; unmatched people are in the import log.
7. Loading the same file again creates 0 new records.
8. The HR PMO checks 5 sample tasks against Asana.

---

## MIG-03: Adaptive Data Migration - Import Projects (Adaptive Projects export -> pm_project)
*5 points · Priority 1 - Critical*

As a ServiceNow Developer, I need an Import Set and Transform Map for the Adaptive Projects export, so that in-flight Nordic IT projects load into pm_project with their owner, funding, category, sites and dates.

- **Source:** Adaptive Projects export (Excel), one row per project. Includes SYSID and the 28 Nordic fields.
- **Target:** pm_project. Staging table u_imp_adaptive_projects (also used by MIG-04 and MIG-07).
- **Match key:** correlation_id = "ADAPTIVE:" + SYSID
- **Prerequisite:** The implementation team has created the business units (Customers values) and sites.

| Source | ServiceNow | Rule |
|---|---|---|
| SYSID | `correlation_id` | "ADAPTIVE:" + value (coalesce) |
| Name | `short_description` | Direct |
| Project Description | `description` | Then the description block |
| Manager | `project_manager` | People rule |
| Business Sponsor | `u_business_owner` | People rule; if several names, use the first that matches |
| CN# | `u_cn` | Direct, as text (keep leading zeros) |
| Region | `u_sites` | Split on ; or ,; match each site by name; skip unmatched and log |
| Start Date / Planned Finish | `start_date / end_date` | Date rule |
| Actual Start Date / Actual End Date | `work_start / work_end` | Date rule |
| % Complete | `percent_complete` | Number |
| Project Funding Type | `u_funding_source` | Direct |
| Funding Type | `expense_type / u_funding_type` | Capex -> capex / Capex required; Opex -> opex / Opex required |
| State | `state` | Active 2, On Hold -3 |
| Customers | `business_unit` | business_unit by name |
| Business Category | `u_business_category` | Construction/Relocation -> construction_relocation, Onboarding... -> onboarding, Application -> application, Epic -> epic, GHC... -> ghc, Infrastructure -> infrastructure, Medical Group -> medical_group, Revenue Cycle... -> revenue_cycle, RSFH -> rsfh, Security -> security, Urgent Care -> urgent care |
| (constant) | `time_constraint` | start_on_specific_date |

**Description block:** Phase, Dept # for Expense, Next Go-Live Date, Estimate Type, Request Received, Request Assigned, Estimate Complete, Ready For Delivery, Project Assigned

**Rules**

- Routing: load only rows whose State is Active or On Hold (or whose Migration Target is Project). Requested and Draft rows go to MIG-04. Completed and Cancelled rows are ignored.

**Out of scope:** Health fields and Update Notes (MIG-07); financial amounts; creating fields for the description-block values

**Acceptance criteria**

1. One pm_project per Active/On Hold row; the other states are not loaded here.
2. u_cn keeps leading zeros; u_sites holds every matched site.
3. u_business_category and business_unit are set where the export has values; misses are logged.
4. The description block shows the lifecycle dates and estimate type.
5. Loading the same file again creates 0 new records.
6. The Nordic PMO checks 5 sample projects against Adaptive.

---

## MIG-04: Adaptive Data Migration - Import Demands (Adaptive Projects export -> dmn_demand)
*3 points · Priority 1 - Critical · Depends on MIG-03*

As a ServiceNow Developer, I need a second Transform Map on the Adaptive Projects staging table that loads intake records into dmn_demand, so that requests still being estimated continue through Demand Management instead of becoming projects.

- **Source:** Same file and staging table as MIG-03 (u_imp_adaptive_projects).
- **Target:** dmn_demand (out-of-box plus the Demand form's custom fields).
- **Match key:** correlation_id = "ADAPTIVE:" + SYSID
- **Prerequisite:** MIG-03 is built, because the same staging table is used.

| Source | ServiceNow | Rule |
|---|---|---|
| SYSID | `correlation_id` | "ADAPTIVE:" + value (coalesce) |
| Name | `short_description` | Direct |
| Project Description | `description` | Then the description block |
| (constant) | `type` | project |
| (constant) | `u_demand_type` | New Project (stored value from the implementation team) |
| (constant) | `category` | strategic |
| State | `state` | Requested -> submitted, Draft -> draft |
| Manager | `assigned_to` | People rule (Demand manager) |
| Business Sponsor | `u_business_owner` | People rule; first name that matches |
| CN# | `u_cn` | Direct, as text (keep leading zeros) |
| Funding Type | `expense_type / u_funding_type` | Same as MIG-03 |
| Project Funding Type | `u_funding_source` | Direct |
| Region | `u_sites` | Same as MIG-03 |
| Customers | `business_unit` | business_unit by name |
| Business Category | `u_business_category` | Demand list: Construction/Relocation -> Construction Renovation Relocation, Epic -> EHR, Infrastructure -> Infrastructure, Security -> Security, Revenue Cycle... -> Rev Cycle, Onboarding... -> Employed Physician Onboarding; others blank and logged |
| Start Date / Planned Finish | `start_date / due_date` | Date rule |

**Description block:** Dept # for Expense, Estimate Type, Request Received, Request Assigned, Estimate Complete

**Rules**

- Routing: load only rows whose State is Requested or Draft (or whose Migration Target is Demand). The final demand condition is still being confirmed, so keep it in one place in the onBefore script.
- Loading must not start approvals or notifications. Test with 2 rows first.

**Out of scope:** Assessments and scoring; converting demands to projects

**Acceptance criteria**

1. One dmn_demand per Requested/Draft row; no row loads as both a demand and a project.
2. type, u_demand_type and category are set. state holds the stored values.
3. No approval or notification fires on load.
4. Loading the same file again creates 0 new records.

---

## MIG-05: Adaptive Data Migration - Import Project Tasks and Milestones (Adaptive Tasks export -> pm_project_task)
*5 points · Priority 2 - High · Depends on MIG-03*

As a ServiceNow Developer, I need an Import Set and Transform Map for the Adaptive Tasks and Milestones export, so that each in-flight Adaptive project keeps its work breakdown, assignments and dates in ServiceNow.

- **Source:** Adaptive Tasks export (Excel), plus the Milestones export (the same columns in a second file or sheet, loaded into the same staging table). Project ID and Parent ID contain SYSIDs.
- **Target:** pm_project_task. Staging table u_imp_adaptive_tasks.
- **Match key:** correlation_id = "ADAPTIVE:" + SYSID
- **Prerequisite:** MIG-03 is loaded.

| Source | ServiceNow | Rule |
|---|---|---|
| SYSID | `correlation_id` | "ADAPTIVE:" + value (coalesce) |
| Name | `short_description` | Direct |
| Description | `description` | Direct |
| Project ID | `top_task` | pm_project where correlation_id = "ADAPTIVE:" + value |
| Parent ID | `parent` | Task where correlation_id = "ADAPTIVE:" + value; if Parent ID = Project ID or not found, the project |
| Manager | `assigned_to` | People rule |
| State | `state` | Draft -5, Active 2, On Hold -3, Completed 3, Cancelled 7 |
| Start Date / Due Date | `start_date / end_date` | Date rule |
| Actual Start Date / Actual End Date | `work_start / work_end` | Date rule |
| % Complete | `percent_complete` | Number |
| (Milestones file) | `milestone` | true; start = end = due date |
| (constant) | `time_constraint` | start_on_specific_date |

**Rules**

- Ignore rows whose project wasn't loaded (demands, and completed or cancelled projects), and log them.

**Out of scope:** Dependencies (MIG-06); resource assignments; timesheets

**Acceptance criteria**

1. Every task of a loaded project has top_task and parent set; the hierarchy matches Adaptive for 3 sample projects.
2. Milestones load with milestone = true.
3. Dates match the export after load.
4. Loading the same file again creates 0 new records.

---

## MIG-06: Data Migration - Task Dependencies, both sources (-> planned_task_rel_planned_task)
*3 points · Priority 3 - Moderate · Depends on MIG-02, MIG-05*

As a ServiceNow Developer, I need task dependencies from both sources created after the tasks load, so that migrated project schedules keep their predecessor logic.

- **Source:** Adaptive Dependencies export (Predecessor ID, Successor ID, Type, Lag) and the Asana 'Blocked By (Dependencies)' column, already staged in u_imp_asana_project_tasks.
- **Target:** planned_task_rel_planned_task. Staging table u_imp_adaptive_dependencies for Adaptive; a fix script for Asana.
- **Match key:** parent (predecessor) + child (successor), both coalesce
- **Prerequisite:** MIG-02 and MIG-05 are loaded.

| Source | ServiceNow | Rule |
|---|---|---|
| Predecessor ID | `parent` | Task where correlation_id = "ADAPTIVE:" + value |
| Successor ID | `child` | Task where correlation_id = "ADAPTIVE:" + value |
| Type | `type` | Finish to Start -> fs, Start to Start -> ss, Finish to Finish -> ff, Start to Finish -> sf |
| Lag | `lag` | Hours / 8 = days |
| Asana: Blocked By | `parent` | Fix script: for each Asana task, look up each blocking task (by ID or by name in the same project) and create an fs dependency |

**Rules**

- If either task isn't found, skip the row and log it. Never create a half-linked record.

**Out of scope:** Re-planning dates that dependencies push out (log them for PMO review)

**Acceptance criteria**

1. One dependency per source link; running it again creates no duplicates.
2. Links with missing tasks are skipped and logged.
3. For 5 sample links, type and lag match the source.

---

## MIG-07: Adaptive Data Migration - Import Status Reports (Adaptive Projects export -> project_status)
*3 points · Priority 2 - High · Depends on MIG-03*

As a ServiceNow Developer, I need a third Transform Map on the Adaptive Projects staging table that creates one status report per migrated project, so that RAG health and the latest update notes are visible on day one.

- **Source:** Same staging table as MIG-03 (u_imp_adaptive_projects).
- **Target:** project_status
- **Match key:** project (the pm_project with correlation_id "ADAPTIVE:" + SYSID) + as_on, both coalesce
- **Prerequisite:** MIG-03 is loaded.

| Source | ServiceNow | Rule |
|---|---|---|
| SYSID | `project` | pm_project where correlation_id = "ADAPTIVE:" + value |
| Last Updated On | `as_on` | Date rule; load date if blank |
| Health | `overall_health` | On Target/On Plan -> green, Needs Attention -> yellow, In Trouble -> red |
| Schedule Health | `schedule` | Same values |
| Budget Health | `cost` | Same values |
| Resource Health | `resources` | Same values |
| Scope Health | `scope` | Same values |
| Update Notes + Risk Health | `comments` | Update Notes, then 'Risk health: <value>' |

**Rules**

- Load only rows whose project was loaded in MIG-03 and that have at least one health value or notes.

**Out of scope:** Status history (the latest status only)

**Acceptance criteria**

1. One status report per migrated project with health or notes.
2. The project's status tab shows the RAG values.
3. Loading again creates no duplicates.

---

## MIG-08: Data Migration - Mock Loads, Reconciliation and Rollback
*5 points · Priority 1 - Critical · Depends on MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07*

As the Migration Lead, I need the full load rehearsed, reconciled and reversible, so that the production cutover is predictable and signed off before the blackout.

- **Source:** All MIG-01 to MIG-07 files.
- **Target:** Dev (mock 1), Test (mocks 2 and 3).
- **Prerequisite:** MIG-01 to MIG-07 are built.

**Rules**

- Mock 1 (Dev): about 15 hand-picked records covering a project with sub-tasks, a milestone, a demand, an unmatched user, a multi-site project and a completed project (which must be ignored).
- Mocks 2 and 3 (Test): full exports, loaded in the standard order. Time each load. Mock 3 follows the cutover steps exactly.
- Reconcile: rows per file (after routing) = records per table in ServiceNow; review the import log for fallbacks.
- Rollback script: delete migrated records by correlation_display, children first (dependencies, status reports, tasks, projects, demands). Test it in Test.

**Acceptance criteria**

1. Mock 3 finishes with 0 transform errors and matching counts for every table.
2. A second run of every load creates 0 new records.
3. The rollback removes every migrated record and nothing else.
4. The HR and Nordic PMOs sign off the sample records.

---

## MIG-09: Data Migration - Production Cutover Load
*3 points · Priority 1 - Critical · Depends on MIG-08*

As the Migration Lead, I need the final exports loaded into Production during the blackout, so that ServiceNow becomes the system of record for all in-flight projects and demands.

- **Source:** The final exports, taken right after Asana and Adaptive are frozen.
- **Target:** Production
- **Prerequisite:** MIG-08 is signed off, and the implementation team's fields, choices and reference data are in Production.

**Rules**

- Set Enforce mandatory fields = true and reference choice action = ignore.
- Load in the standard order, running each task transform twice. Then reconcile.
- Go / no-go with the PMOs. Use the rollback script if it's no-go.
- Turn notifications back on after sign-off.

**Acceptance criteria**

1. Production counts match the final exports for every table.
2. The PMOs sign off, and the source tools stay read-only.
