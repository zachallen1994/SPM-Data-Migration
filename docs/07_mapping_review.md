# 07: Mapping review of the source and target field files

Reviewed on 2026-09-22 against five workbooks:

| File | What it is | Used for |
|---|---|---|
| `Asana_Project_Fields.xlsx` (HR_Project_Portfolio_2026) | Export of the HR portfolio tracker: 97 rows (80 top-level, 17 subtasks) and 23 columns | Asana project-level mapping |
| `Asana_Task_Level_Fields.xlsx` (HR Fields) | Asana task-level plan template: 18 rows, sections used as phases | Asana WBS mapping |
| `Proj_Data_Mapping_08172026_1.xlsx` | Adaptive Work (Nordic IT PMO) project fields: 28 fields with types and pick lists. The *ServiceNow Equivalent* column is empty | Adaptive mapping (the empty column is filled in here) |
| `Project_Form_Fields_1.xlsx` | ServiceNow project form design: tabs, custom fields and choice lists | Target model |
| `Demand_Form_Fields.xlsx` | ServiceNow demand form design | Target model |

The detailed output is in `mapping/mapping_workbook.xlsx`, which has these sheets: Decisions, Data
Quality, Asana to ServiceNow, Adaptive to ServiceNow, ServiceNow Form Fields and Value Maps. The
same content is in the `mapping/*.csv` files. This document covers the headlines.

---

## 1. Headline findings (read these first)

**A1. In Asana, a "project" is a task.** The HR portfolio lives in *one* Asana project. Each
top-level task is a project or program, sections are HR COE areas (18 of them), and subtasks are
workstreams. A standard Asana migration would have created **one** ServiceNow project with 97
tasks. The pipeline now has a *tracker* mode (`asana.tracker_project_gids`): every top-level task
becomes a project or demand, and its subtasks become WBS tasks.

**A2. The detailed plans sit in separate Asana projects.** The task-level file is a phased plan
(Project Initiation → Analysis/Design → Build → Test → Communicate → Train → Go-Live → Post
Go-Live). Nothing in the data links a plan project to its tracker row. You supply the link in
`config/asana_plan_links.csv` (tracker task ID → plan project ID). The plan's tasks then become the
WBS of that project, with its sections as phases.

**A3. People are names, not emails, and the names vary.** `PM Assigned` holds 13 display names
plus `N/A` (9 rows), `TBD` (3) and blanks (4). The same person appears as a short and a full first
name in different fields. The pipeline now matches on email, full name, and a nickname crosswalk
(`data/reference/user_crosswalk.csv`). It treats N/A and TBD as blank, and
`users_referenced.csv` lists anything that didn't match.

**A4. Business Category means different things on Demand and Project.** Both forms use
`u_business_category`, but with different choice lists: the demand list has 17 values and the
project list has 11. Only *Infrastructure* and *Security* match exactly, and the project list has
no HR value. Converting a demand to a project would lose the category, and HR projects would load
with it blank. **Unify the list before the build freezes (decision D1).** Stored values also need
cleaning up: `urgent care` contains a space, and the demand list mixes cases.

**A5. The ServiceNow forms have no home for about 10 source fields that drive reporting.**
These are the Nordic lifecycle dates (Request Received → Project Assigned), Next Go-Live Date,
Estimate Type, cost center, Risk Health, and several HR attributes. The recommendation (D6, D11,
D12, D13) is:
- Create **11 fields**: 7 lifecycle and estimate fields, `u_cost_center`, `u_risk_health`,
  `u_legacy_id` and `u_legacy_url`.
- Keep the six HR-only attributes as a readable *"Migrated from Asana"* block in the description.

**A6. Adaptive health belongs on status reports, not the project.** The six Adaptive RAG fields
(Budget, overall, Resource, Risk, Schedule, Scope) and *Update Notes* map to one `project_status`
record per project. They land in overall_health, cost, resources, risk (new field), schedule,
scope and comments. That keeps the project form clean and the status history in ServiceNow's
native format.

**A7. Request variables can't be migrated.** The *Notes* and *Preferences* tabs on both form
workbooks repeat the 33 catalog-request variables. Migrated records have no request item, so
those variables stay empty. If leadership reports on any of them (Market President approval,
Priority Justification, Sites), they need to be real fields on the demand.

**A8. There's source data to clean up before the final extract** (details in `data_quality.csv`):
- 27 of the 65 open HR items are already past their due date.
- 2 items have no dates at all.
- 7 Notes fields have garbled characters (now repaired automatically).
- The Adaptive pick lists disagree between the two sheets of the mapping file.
- The ServiceNow Sites list is missing Paducah and St Petersburg.

---

## 2. Project vs. Demand rules for *your* data

These are now in `config/classification.yaml`. The first rule that matches wins, and
`overrides.csv` beats every rule.

| Source | Condition | Result | Why |
|---|---|---|---|
| Both | `Project Status` / `State` = Cancelled | Skip | Cancelled work isn't carried forward. Override to demand if the PMO wants rejection history |
| Both | Completed and ended more than 2 years ago | Skip | Archive only |
| Both | Completed within the last 2 years | Project, **header only** | Reporting history without the WBS |
| Adaptive | State = **Requested** or **Draft** | **Demand** | Still in Nordic intake or estimation |
| Adaptive | State = Active or On Hold, **no Ready For Delivery and no Project Assigned date**, Phase blank or Initiation | Review | Probably still estimating, so possibly a demand |
| Adaptive | Active or On Hold (everything else) | Project | |
| Asana HR | `Not Started` or `Started/Scoping` **and** PM is blank, TBD or N/A | Review | Nobody owns delivery yet, so it may be a demand |
| Asana HR | No status and no dates | Review | Placeholder or idea |
| Asana HR | In Progress, Delayed, On Hold, Not Started with a PM | Project | Planned HR work with an owner |
| Asana | The tracker project itself, plan projects, templates | Skip | Containers |

**Result of running the actual HR export through the pipeline** (80 top-level rows, 17 subtasks):

| Outcome | Count | Rule |
|---|---|---|
| Project with WBS | 60 | `active_asana_projects`. This includes the 4 Ireland program rows that have no status, loaded as Pending |
| Project, header only (Completed) | 13 | `recently_completed_projects_header_only` |
| Review | 5 | `asana_not_started_without_pm_needs_review`: 3 Not Started with PM = N/A, 2 with PM = TBD |
| Skip (Cancelled) | 2 | `cancelled_work_is_skipped` |
| WBS tasks | 17 | The subtasks, under their tracker items |
| Unmapped values | 0 | Every status, type, size and funding value has a value-map entry |

Asana HR produces **few or no demands** automatically. That's expected, because this tracker lists
approved HR work. Future HR demand will come through the ServiceNow intake (Demand Type = HR).

---

## 3. Recommended field mapping (summary)

The full detail is in the *Asana to ServiceNow* and *Adaptive to ServiceNow* sheets.

### Adaptive (Nordic IT PMO) → `pm_project` / `dmn_demand`

| Adaptive field | ServiceNow field | Note |
|---|---|---|
| Name / Project Description | `short_description` / `description` | |
| Manager | `project_manager` (demand: `assigned_to`) | |
| Business Sponsor | `u_business_owner` | Free text that may list several people. The first name that resolves is used, and the full text is kept in the description block (D10) |
| CN# | `u_cn` | Loaded as a string, so leading zeros survive |
| Dept # for Expense | `u_cost_center` **(new)** | Or `department` (D11) |
| Region (multi) | `u_sites` (list) | Each value is mapped to the Sites list. Region values are still needed (DQ11) |
| Next Go-Live Date | `u_next_go_live_date` **(new)** | |
| Planned Finish | `end_date` / `due_date` | **Start date is missing from the sheet but required**. It's now in the extract |
| Project Funding Type (19 pools) | `u_funding_source` | Make it a choice list |
| Funding Type (Opex/Capex) | `expense_type` **and** `u_funding_type` | D4 |
| State | `state` | Requested/Draft → demand |
| Phase | `phase` | D5, to align with a ServiceNow phase template |
| Budget/Health/Resource/Risk/Schedule/Scope Health | `project_status`: cost / overall_health / resources / `u_risk_health` / schedule / scope | On Target and On Plan → green, Needs Attention → yellow, In Trouble → red |
| Update Notes | `project_status.comments` | |
| Estimate Type + 5 lifecycle dates | `u_estimate_type`, `u_request_received`, `u_request_assigned`, `u_estimate_complete`, `u_ready_for_delivery`, `u_project_assigned` **(new)** | These also drive classification |
| Customers | `business_unit` | Customer values are still needed |
| Business Category | `u_business_category` | Exact stored values for projects. The demand list needs D1 |

### Asana HR tracker → `pm_project` / `dmn_demand`

| Asana field | ServiceNow field | Note |
|---|---|---|
| Name / Notes | `short_description` / `description` | Encoding repaired |
| Section/Column | `primary_program`, under a *Human Resources* portfolio | D2 |
| PM Assigned | `project_manager` | Matched by name through the crosswalk |
| Start / Due Date | `start_date` / `end_date` | |
| Project Status | `state` | Delayed → Work in Progress (D7) |
| Project Type | `investment_class` | Annual Program → **Run**, Project → **Change** |
| Size/Complexity | demand `size`; for projects, the description block | |
| Funding | `expense_type` / `u_funding_type` | Only 2 rows are populated |
| Entity/Organization (multi) | `business_unit` (first value) and `impacted_business_units` | D8 |
| HRSP / SME / Project Lead | `u_business_owner` | D10 |
| I&T Integrations, Strategy Focus, Strategy Timeline, HR COEs Engaged, HR Cross-Impacts | Description block | D6 |
| Parent task | WBS task under the tracker item | D3 |
| Assignee, Tags, Cost Center, Blocked By/Blocking | Not migrated (blank in the export) | Dependencies are still supported if used |
| (constant) | `u_demand_type` = HR, `u_business_category` = Human Resources (demands) | |

### Asana task-level plan → `pm_project_task`

| Asana field | ServiceNow field | Note |
|---|---|---|
| Section | Phase-level task | *Untitled section* tasks sit directly under the project |
| Task Name containing "Milestone" | `milestone = true` | The template has no milestone task type |
| Task Status / % Complete | `state` / `percent_complete` | 0.5 is converted to 50 |
| Assigned To / Collaborators | `assigned_to` / `additional_assignee_list` | |
| COE, Entity/Organization, Tags | Not migrated | Kept at project level |

---

## 4. ServiceNow build changes this implies

| # | Change | Table | Why |
|---|---|---|---|
| 1 | One unified **Business Category** list with snake_case stored values, including Human Resources | `u_business_category` on both tables | A4, D1 |
| 2 | Fix the typos in labels and choices (DQ12) and the stored value `urgent care` (DQ13) | sys_choice | Much cheaper before data exists |
| 3 | Add **Paducah** and **St Petersburg** to Sites, or confirm they map to Kentucky / retired | Sites table | DQ14 |
| 4 | New fields: `u_legacy_id`, `u_legacy_url`, `u_next_go_live_date`, `u_estimate_type`, `u_request_received`, `u_request_assigned`, `u_estimate_complete`, `u_ready_for_delivery`, `u_project_assigned`, `u_cost_center` | `pm_project` (the first 5 intake fields on `dmn_demand` too) | A5 |
| 5 | `u_risk_health` | `project_status` | A6 |
| 6 | Make `u_funding_source` a choice list with the 19 funding pools | both | D4 |
| 7 | Create the **Human Resources** portfolio, the HR programs, the BSMH/RSFH/GBS business units and the IT PMO portfolio or programs | reference data | D2, D8 |
| 8 | Two project templates: IT PMO phases and HR phases | project templates | D5 |
| 9 | For `u_sites`, add a transform script that turns site names into sys_ids (the snippet is in doc 05, section 4) | transform map | It's a list field |

---

## 5. What changed in this kit

- **Asana tracker mode, plan-project links, sections as phases, milestones by name, "Untitled
  section" handling.** Code is in `canonical.py`; settings are in `settings.example.yaml`.
- **User matching by display name and crosswalk**, with N/A and TBD treated as blank.
  Code is in `transform.py`.
- **New transforms:**
  - `list` and `first` handle multi-select values.
  - `percent` converts fractions like 0.5.
  - `append` adds the description block for fields with no ServiceNow home.
  - Garbled text is repaired automatically.
- **Status reports** now carry all six Adaptive health indicators and the update notes.
- **`target_mapping.yaml`, `value_maps.csv` and `classification.yaml`** are rewritten for your
  actual fields and pick lists.
- **Six mapping sheets** in `mapping/mapping_workbook.xlsx`. The tests cover every pattern above,
  using synthetic data.

## 6. What I still need from you

1. **Adaptive API names.** Run `describe-adaptive` against the tenant, or send a field list with
   the API names of the 28 fields. The `C_` names in `settings.example.yaml` are guesses.
2. **Region and Customers pick-list values** from Adaptive.
3. **ServiceNow `sys_dictionary` and `sys_choice` exports** for the target tables, so that
   `validate-fields` can confirm every out-of-the-box field name and stored value (state
   integers, expense_type, investment_class, size, u_demand_type, u_funding_type).
4. **Answers to the open decisions**, D1–D16. D1, D2, D4 and D12 block the ServiceNow build.
5. **The list of Asana plan projects** and which tracker row each one belongs to.
