# Asana -> ServiceNow: scope and mapping (single source of truth)

Status: DRAFT - to be confirmed line by line before any further build. Nothing is changed in DEV/TEST/PROD until
this page is confirmed. Every later change must update this page first.

## 1. Scope - which Asana items become ServiceNow PROJECTS

| # | Rule | Example | Confirm |
|---|---|---|---|
| S1 | Every **active** Asana project (not marked complete, not archived, name not starting "(Closed)") whose **owner** is on the HR PM list (Richard Becker's email) | Project Warren, Ireland WFM, Definity VMS Transition (if owned by a listed PM) | ☐ |
| S2 | Every **active row** of the "HR Project Portfolio 2026" list, whoever the PM is | AMR, Well-being Program, Ireland HR ServiceNow Integration | ☐ |
| S3 | A row (S2) and a project (S1) that are the same initiative load as ONE project: the row's fields, the project's tasks (property x_mig.asana.plan_links) | Job Profiles + its 3 phase projects; AMR + "2026 AMR (Jen)" | ☐ |
| S4 | No date window (active = in scope) | | ☐ |

HR PM list: Jennifer Angle, Carrie Lynn, Keith McClure, Katie McDearmon, Lynne Hayes, Matthew Caldwell, Ian Whitis,
Amanda Warfield, Mallory Trucksis (both email domains).

## 2. Scope - PROJECT TASKS

| # | Rule | Confirm |
|---|---|---|
| T1 | S1 project: **all its tasks and every level of subtasks** (e.g. Project Warren > HRTS > Health Benefit Plan Build > its 4 subtasks) | ☐ |
| T2 | S2 row: its subtasks (e.g. Annual Enrollment > Nayya, Virtual Benefit Fairs, Ayble) | ☐ |
| T3 | Completed tasks are loaded too (as Closed Complete), so the plan is whole | ☐ |
| T4 | Asana **sections** (e.g. HRTS, Benefits): loaded as a top-level task each, with the section's tasks under it - OR not loaded (kept as text) | ☐ choose |

## 3. Project fields

| ServiceNow field | Asana source (S2 row) | Asana source (S1 project) | Confirm |
|---|---|---|---|
| Name | row name | project name | ☐ |
| Project manager | "PM Assigned" | project owner | ☐ |
| Assigned to | same as Project manager | same | ☐ |
| Business Owner | "HRSP / SME / Project Lead" | blank | ☐ |
| Planned start / end | start / due date | project start / due date | ☐ |
| State | "Project Status" (Not Started=Pending, In Progress/Delayed=WIP, On Hold=WIP+On Hold) | Open (Asana project has no status field) | ☐ |
| Portfolio | HR | HR | ☐ |
| Functional Area | section (Benefits & Well-Being split by HR COEs) | blank | ☐ |
| Project Category | "Project Type" | blank | ☐ |
| IT Required | "I&T Integrations Needed" | blank | ☐ |
| Funding Type | "Funding" | blank | ☐ |
| Sites | "Organization" (RSFH = Roper St. Francis Healthcare, GBS = Global Business Services, BSMH = ?) | blank | ☐ |
| Priority | "Size/Complexity" | blank | ☐ |
| Detailed description | notes + Size, I&T, Strategy Focus/Timeline, Organization, HR COEs, Cross-Impacts | project notes | ☐ |

## 4. Task fields (Project Warren example: Health Benefit Plan Build)

| ServiceNow task field | Asana source | Confirm |
|---|---|---|
| Short description | task name | ☐ |
| Parent | parent task (subtasks) or the project / section | ☐ |
| Assigned to | Assignee (Tricia Figg) | ☐ |
| Planned start | custom "Start Date" (Sep 1), else Asana start date, else = due date | ☐ |
| Planned end | Due date (Oct 23) | ☐ |
| State | completed = Closed Complete; else "PMO Status"/"Task Status": In Progress = WIP; else Open | ☐ |
| % complete | custom "% Complete" (50%) | ☐ |
| Actual start / end (closed tasks) | planned start / due date | ☐ |
| Description | notes | ☐ |

## 5. Acceptance - per environment, before sign-off

1. `asana_compare.js` (DEV) / manual spot check (TEST, PROD): 0 "NOT IN SERVICENOW", 0 "undefined".
2. Spot check 3 projects against Asana: one S2 row (AMR), one S1 project (Project Warren), one with no PM (Ireland).
3. Task count per project = Asana (Project Warren, Annual Enrollment).

## 6. Moving between environments

One update set, built only after DEV passes section 5, containing: both Asana data sources, both Asana transform
maps with ALL field maps and transform scripts. Reference data and properties set by hand per instance:
portfolio "HR", x_mig.asana.token / project_gid / plan_links, Sites / Functional Area choices.
