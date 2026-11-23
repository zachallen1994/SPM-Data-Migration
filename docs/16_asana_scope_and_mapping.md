# Asana -> ServiceNow: requirements (single source of truth)

Status: REQUIREMENTS - reorganized 2026-11-23. No configuration changes until the open decisions (section 6) are
answered. Every later change starts here.

## 0. Priority (confirmed 2026-11-23)

1. EVERY row of HR Project Portfolio 2026 (the Excel file) - project + its subtasks.
2. Other real projects (e.g. Project Warren) - project + sections / tasks / subtasks as project tasks.
3. ALL attachments on all of them (project, task, subtask).

## 1. Scope - which Asana items become ServiceNow PROJECTS

| # | Requirement | Source of truth | Status |
|---|---|---|---|
| R1 | **Every row of the "HR Project Portfolio 2026" Asana project is a ServiceNow project - INCLUDING rows marked complete** (the Excel export `Asana_Project_Fields.xlsx`), except rows that have a parent task (those are project tasks). Rows with no PM Assigned load with Project manager empty. | Excel export = Asana register | Confirmed 2026-11-23 |
| R2 | **Other Asana projects** (not the register) are in scope when **active** (not marked complete / archived - completed subtasks do not matter) and **owned by** one of the HR PMs or Richard Becker (rbecker0@mercy.com). Start dates in 2025 are included - no date filter. | Asana owner / "PM Assigned" | Confirmed 2026-11-23 - **list to be confirmed** (section 5) |
| R2a | Not projects, excluded: Asana's automatic "<name>'s previously assigned tasks" projects, "Sample ..." test projects, names starting "(Closed)" | Proposed - Richard to confirm | Open |
| R3 | An R1 row and an R2 project that are the same initiative become ONE ServiceNow project (row's fields, project's tasks). | Pairs confirmed by Richard | Open (D3) |

HR PMs: Jennifer Angle, Carrie Lynn, Keith McClure, Katie McDearmon, Lynne Hayes, Matthew Caldwell, Ian Whitis,
Amanda Warfield, Mallory Trucksis, + Richard Becker. (Both email domains.)

## 2. Structure - one ServiceNow model, two Asana shapes

| ServiceNow | Normal Asana project (e.g. Project Warren) | Register (HR Project Portfolio 2026) |
|---|---|---|
| Project | the Asana project | each row (Well-being Program, AMR, Annual Enrollment) |
| Level-1 summary task | each section (Compensation, HRTS) | - |
| Project task | each task (Associate Job Mapping) | each subtask of the row (Nayya, Ayble) |
| Child task | subtasks, any depth | sub-subtasks |
| A section becomes | a task | the Functional Area of each row's project (Benefits & Well-Being = a grouping, not a record) |

Scalability: the only per-structure setting is which Asana project(s) are registers (today one). Every other in-scope
project is loaded as a normal project with no per-project configuration. Fields that mean the same thing but are named
differently per Asana project (status: PMO Status / Status_Dim / Task Status; start: built-in / custom "Start Date")
are read from an ordered list of names.

## 3. Project fields

| ServiceNow | Register row (R1) | Normal project (R2) |
|---|---|---|
| Name | row name | project name |
| Project manager, Assigned to | "PM Assigned" (N/A, TBD = blank) | project owner |
| Business Owner | "HRSP / SME / Project Lead" | blank |
| Planned start / end | start / due date | project start / due date |
| State | "Project Status" (Not Started = Pending, Started/Scoping = Investigating, In Progress/Delayed = Work in Progress, On Hold = WIP + On Hold ticked) | Open / Work in Progress (D5) |
| Portfolio | HR | HR |
| Functional Area | section (Benefits & Well-Being split by HR COEs Engaged / name) | blank |
| Project Category | "Project Type" | blank |
| IT Required | "I&T Integrations Needed" | blank |
| Funding Type | "Funding" | blank |
| Sites | "Organization" (RSFH = Roper St. Francis Healthcare, GBS = Global Business Services, BSMH = D4) | blank |
| Priority | "Size/Complexity" | blank |
| Description | notes + Size, I&T, Strategy Focus/Timeline, Organization, HR COEs, Cross-Impacts | project notes |

## 4. Task fields

| ServiceNow | Asana |
|---|---|
| Name | task name |
| Parent | parent task, else its section (normal projects), else the project |
| Planned start / end | start date (built-in, else custom "Start Date") / due date; only a due date = one-day task; no dates = placed by ServiceNow within its parent |
| State | completed box, status "Complete", or name starting "(Closed)" = Closed Complete; "In Progress" = Work in Progress; else Open |
| % complete | custom "% Complete"; closed = 100 |
| Actual start / end (closed tasks) | planned start / due date |
| Assigned to | Asana assignee (by email) |
| Description | notes + free-text "Assigned To" (e.g. "Billie") + Asana status |

## 4a. Attachments (required - confirmed 2026-11-23)

EVERY file on an in-scope project, task or subtask (any level) is brought over: files stored in Asana are copied to
the matching ServiceNow project / task; linked files (Drive, Box, OneDrive) are kept as a link in work notes.
Not reachable through the task API and to be confirmed: files on project Messages / the project Overview (brief).
All tasks are loaded, completed ones included, so their files have a record to land on.

## 5. How the scope list is produced and confirmed (no Asana UI access needed)

1. Run `background_scripts/asana_pm_scope_preview.js` (read-only, reads Asana with the migration token). It lists:
   every register row (R1) and every other Asana project matching R2, with owner, dates, status and a link, plus
   possible doubles (R3).
2. Export the output and send it to Richard Becker: "These are the Asana items we will migrate. Confirm, strike, or add."
3. His answer is recorded here (section 7) and becomes the only scope. Additions outside the rule go into the
   property x_mig.asana.include; exclusions into a skip list.

## 6. Open decisions

| # | Decision | Owner |
|---|---|---|
| D1 | ~~R1: all rows or only active~~ -> ALL rows, completed included (decided 2026-11-23) | done |
| D2 | ~~Rows with no PM~~ -> in scope, PM empty (decided 2026-11-23) | done |
| D3 | R3: which register rows have their plan in a separate Asana project (e.g. AMR / "2026 AMR (Jen)", Job Profiles / 3 phase projects, Pay Practice Optimization) | Richard / Jen Angle |
| D4 | Sites value for "BSMH" | BA |
| D5 | State for normal projects (no status field in Asana) | BA |
| D6 | Is the extra-project list (section 5) complete - anything owned by someone else that must come? | Richard |
| D7 | R2a exclusions (previously-assigned-tasks, Sample, (Closed)) | Richard |
| D8 | Files on project Messages / Overview: needed? (separate API) | Richard |

## 7. Confirmed scope list

(to be filled from section 5)

## 8. Acceptance (per environment)

1. Project count = confirmed list (section 7).
2. `asana_compare.js` (DEV): 0 NOT IN SERVICENOW, 0 "undefined"; TEST/PROD: spot check.
3. Three projects checked against Asana: AMR (register row), Project Warren (normal project, Workbench tree), Ireland
   HR ServiceNow Integration (row without PM).
4. Task counts per project = Asana.

## 9. Build pieces (for reference - applied only after section 6 is answered)

Data source: servicenow/asana_data_source.js (one script, MODE projects / tasks).
Maps: built by background_scripts/asana_projects_map_setup.js and asana_tasks_map_setup.js (no manual pasting).

## 10. Build changes these decisions require (to apply after D3, D6, D7 are answered)

| Change | Piece |
|---|---|
| Register rows: load completed rows too (state Closed Complete) | data source: completed filter off for register rows |
| No date filter for R2 | data source: FROM / TO removed |
| R2a exclusions by name | data source: skip list |
| Attachments on every task / subtask of every in-scope project | attachments script: already covers projects + tasks loaded; run after the full task load |
