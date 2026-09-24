# 09: ServiceNow user stories: Asana + Adaptive to ServiceNow SPM

Generated from `config/user_stories.yaml` and `mapping/servicenow_transform_maps.csv`. The import-ready
version is `mapping/servicenow_user_stories.xlsx` (Epics and Stories sheets for rm_epic / rm_story).

## Conventions for every import set / transform map story

```
CONVENTIONS FOR EVERY IMPORT SET / TRANSFORM MAP STORY
- Load files come from the migration team: data/load/asana/*.csv and data/load/adaptive/*.csv.
  Headers have NO "u_" prefix. ServiceNow adds it when it creates the import set table, so
  staging column u_<name> maps to target field <name> (out-of-box) or u_<name> (custom).
  There must never be a u_u_ column. If you see one, the file was edited by hand - ask for a
  fresh file.
- One import set table + one transform map per source per target table
  (u_imp_asana_* and u_imp_adaptive_*).
- Coalesce on correlation_id only (ASANA:<id> / ADAPTIVE:<id>). Re-loading the same file must
  UPDATE, never duplicate.
- Transform map settings: Run business rules = true; Enforce mandatory fields = false for
  mock loads, true for the final load; Copy empty fields = false; Order = 100.
- Reference fields to sys_user: Referenced value field name = email, Choice action = ignore.
  NEVER "create" - it would create user records.
- Reference fields to portfolio / program / business unit / department: Referenced value
  field name = name; Choice action = reject during mock loads (surfaces missing reference
  data), ignore for the final load.
- Choice fields: Choice action = reject during mock loads (bad values fail loudly instead of
  becoming new choices).
- Date fields: Date format = yyyy-MM-dd.
- Helper columns (project_correlation_id, parent_correlation_id, level, demand_correlation_id,
  include_tasks, predecessor/successor_correlation_id) get NO field map; the scripts read them.
- Business rules, record ownership and demand/project classification are handled upstream by
  the migration pipeline. Transform maps stay (almost) 1:1 - do not re-implement mapping
  logic in ServiceNow.
- Target fields, choice values and reference data (portfolios, programs, business units,
  sites) are owned by the implementation team. If a field map's target field or value is
  missing, raise it with the migration lead (MIG-02). Do not create it as part of the migration.
```

## Open items that affect the build

| ID | Topic | Recommendation | Status |
|---|---|---|---|
| DEMAND-RULE | Adaptive demand condition | Applied upstream; provisional State = Requested/Draft | Open |
| D1 | Business Category | (a) One merged list with snake_case stored values incl. Human Resources. Fix before go-live - changing stored values later means a data-fix script | Open |
| D2 | Asana HR structure | (a) as you mapped, but merge the single-project sections (Risk Mitigation; PCC/HR Committee meetings; HR Services) and treat Ireland Projects / Nursing Projects / GBS Initiatives as programs if they are really programs | Decided (COE -> portfolio) - consolidation open |
| D8 | Business units | (a) Create BSMH / RSFH / GBS business units; External Partners -> leave blank | Open |
| D17 | Entity/Organization -> Business Category | (b) Entity is an organization, not a work category - it already loads into business_unit and impacted_business_units. Add 'Human Resources' to the unified category list (D1) | Open |
| D18 | u_sites field type | Confirm in sys_dictionary (reference column on the u_sites entry). The transform-map script assumes (a) | Open |

## EPIC-1: SPM Migration - Load prerequisites (target readiness, load settings, shared script)

Before any load: confirm the target fields, choices and reference data built by the
implementation team match the load files, apply the load-safety settings, and add the shared
script include.

### MIG-01: Load user and load-safety settings
*Story points: 2 · Priority: 2 - High*

**As a** ServiceNow developer, **I want** a safe load configuration, **so that** migration loads don't trigger notifications or other side effects.

**Steps**

```
1. Create user migration.unassigned (active, no roles, email migration.unassigned@<domain>).
   Unmatched people load as this user; the placeholder email is set in the pipeline's settings.yaml.
2. Create system property spm.migration.pass (string, default "2"). It is used by the
   two-pass close in MIG-09.
3. In sub-production, turn outbound email off (glide.email.smtp.active = false) before any
   load, or add a condition that suppresses notifications for records whose
   correlation_display is 'Asana' or 'Adaptive Work'.
4. Only if loads will use the Import Set REST API (optional): create an integration user
   with roles import_set_loader + import_transformer and give its credentials to the
   migration team.
```

**Acceptance criteria**

- migration.unassigned exists and is active.
- A test load in sub-prod sends no email notifications.
- (If used) the integration user can POST to /api/now/import/<table> and nothing else.

### MIG-02: Target readiness check: fields, choices and reference data match the load files
*Story points: 3 · Priority: 1 - Critical*

**As a** ServiceNow developer, **I want** to confirm that every target field, choice value and reference record the load files use already exists (the implementation team builds them), **so that** migrated data lands in the intended fields with valid values, and nothing is dropped or rejected.

**Steps**

```
Fields, choices and reference data are built by the implementation team. This story only
checks that the migration matches them. Nothing is created here.
1. Export sys_dictionary (name, element, internal_type, reference) for task, planned_task,
   pm_project, pm_project_task, dmn_demand, project_status and planned_task_rel_planned_task.
   Export sys_choice (name, element, value, label) for the same tables. Send both to the
   migration lead, who runs `validate-fields` against them.
2. Target fields: every target_field on the 'Field Maps' sheet must exist. Custom fields marked
   "confirm exists" (for example u_legacy_id, u_next_go_live_date, the Nordic lifecycle dates,
   u_cost_center, u_risk_health) are pending the implementation team. For each missing field,
   either the implementation team adds it, or the migration lead drops that column from the
   load files.
3. Choice values: the load files carry STORED values, for example state integers,
   u_funding_type, u_demand_type, u_business_category, expense_type, investment_class and size.
   `validate-fields` lists any value that is not in sys_choice. The migration team fixes its
   value maps to match; the choices themselves are not changed.
4. Reference data: confirm that every portfolio, program, business unit, site and cost-center
   name in the load files exists. Filter the distinct values in the load file against each
   table. Gaps go to the implementation team.
5. u_sites: record which table the list field references. The list-field script needs it.
6. Repeat steps 1-4 in Test and in Prod before loading each instance.
```

**Acceptance criteria**

- `validate-fields` reports 0 errors for missing fields and invalid choice values.
- Each missing field or reference record is resolved: added by the implementation team, or
  dropped from the load files.
- The mock load has 0 reference or choice rejects.

### MIG-03: Shared script include SPMMigrationUtil
*Story points: 2 · Priority: 2 - High · Depends on: MIG-01*

**As a** ServiceNow developer, **I want** one script include for correlation, user and list lookups, **so that** every transform map resolves parents, projects, demands and list fields the same way.

**Steps**

```
1. System Definition > Script Includes > New. Name: SPMMigrationUtil. Client callable: false.
   Accessible from: All application scopes.
2. Paste the code from docs/05_servicenow_build.md section 3. It has these methods:
   - col(source, name): returns source.u_<name>
   - byCorrelation(table, correlation_id): sys_id of the record with that correlation_id
     (cached per transform)
   - userByEmail(email): sys_id of the active sys_user with that email
3. Add unit tests in a background script: byCorrelation returns '' for an unknown ID and a
   sys_id for a known one.
```

**Acceptance criteria**

- Background-script checks pass.
- byCorrelation queries by correlation_id only, and works for pm_project, planned_task and dmn_demand.

## EPIC-2: SPM Migration - Asana to ServiceNow (in-flight HR projects and tasks)

Import sets and transform maps that load in-flight Asana HR portfolio items as
pm_project records, with their project tasks (WBS) and dependencies.
Asana facts the developer should know:
- Each Asana "project" in the HR portfolio tracker is really a task; the pipeline has
  already turned each one into a project row.
- Sections (COE areas) become portfolios, and plan sections become phase tasks.
- Owners arrive as emails the pipeline resolved from names.
- The HR tracker has no Asana status updates, so no Asana status-report map is needed.
  If asana/05_project_status.csv ever has rows, copy MIG-12.

### MIG-04: Asana: import set + transform map for in-flight projects (u_imp_asana_project -> pm_project)
*Story points: 5 · Priority: 1 - Critical · Depends on: MIG-02, MIG-03*

**As a** PMO lead, **I want** in-flight Asana HR projects to load into pm_project, **so that** HR work is managed and reported in ServiceNow from go-live.

**Steps**

```
1. Create the import set table: System Import Sets > Load Data > Create table.
   Label "Asana Project Import", name u_imp_asana_project. File: data/load/asana/02_pm_project.csv.
   Header row 1. Check the columns: u_correlation_id, u_short_description,
   u_business_owner, ... and NO u_u_ columns.
2. Create the transform map: System Import Sets > Administration > Transform Maps > New.
   Name "Asana Project to pm_project". Source table u_imp_asana_project. Target table pm_project.
   Apply the settings from CONVENTIONS.
3. Click "Auto Map Matching Fields", then check each field map against the list below.
   Delete any field map on a helper column (demand_correlation_id, include_tasks).
4. Set coalesce = true on u_correlation_id -> correlation_id (the only coalesce field).
5. For reference and choice fields, set Referenced value field name and Choice action as listed.
6. u_sites / impacted_business_units: add the list-field script from docs/05 section 4.
   impacted_business_units applies to Asana; u_sites is Adaptive-only.
7. Add the onBefore script "u_imp_<source>_project -> pm_project" from docs/05 section 4
   (demand link + optional two-pass close).
8. Transform a 5-row sample and check the records on the Project form.
```

**Field maps: `u_imp_asana_project`** (25)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_project_manager` | `project_manager` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_business_owner` | `u_business_owner` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_executive_sponsor` | `u_executive_sponsor` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_state` | `state` | Choice; choice action = reject |
| `u_start_date` | `start_date` | Date |
| `u_end_date` | `end_date` | Date |
| `u_work_start` | `work_start` | Date |
| `u_work_end` | `work_end` | Date |
| `u_percent_complete` | `percent_complete` | Number |
| `u_primary_portfolio` | `primary_portfolio` | Reference pm_portfolio; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_primary_program` | `primary_program` | Reference pm_program; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_investment_class` | `investment_class` | Choice; choice action = reject |
| `u_funding_type` | `u_funding_type` | Choice; choice action = reject |
| `u_expense_type` | `expense_type` | Choice; choice action = reject |
| `u_business_category` | `u_business_category` | Choice; choice action = reject |
| `u_business_unit` | `business_unit` | Reference business_unit; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_impacted_business_units` | `impacted_business_units` | List; script: split names -> sys_ids of the referenced table |
| `u_priority` | `priority` | Choice; choice action = reject |
| `u_time_constraint` | `time_constraint` | Choice; choice action = reject |

No field map (read by scripts): `u_demand_correlation_id`, `u_include_tasks`

**Acceptance criteria**

- Loading asana/02_pm_project.csv creates one pm_project per row, and correlation_id
  starts with "ASANA:".
- Re-loading the same file gives 0 inserts and N updates (idempotent).
- project_manager, u_business_owner and assigned_to resolve by email; no new sys_user
  records are created. Unmatched people load as migration.unassigned or blank.
- primary_portfolio resolves for every row whose portfolio exists (MIG-02).
- state holds stored integers; no new choice values are created.
- start_date and end_date match the file (time_constraint = start_on_specific_date).
- The description ends with the "--- Migrated from Asana ---" attribute block.

### MIG-05: Asana: import set + transform map for project tasks (u_imp_asana_task -> pm_project_task)
*Story points: 5 · Priority: 1 - Critical · Depends on: MIG-04*

**As a** project manager, **I want** my Asana plan (phases, milestones, tasks, subtasks) under my project in ServiceNow, **so that** I can keep running the in-flight project without rebuilding the plan.

**Steps**

```
1. Create the import set table u_imp_asana_task from data/load/asana/03_pm_project_task.csv.
2. Create the transform map "Asana Task to pm_project_task" (target pm_project_task).
   Apply the CONVENTIONS settings. Run business rules MUST be true (top_task, WBS, rollups).
3. Auto Map Matching Fields, then check against the list below. Delete the field maps on
   helper columns (project_correlation_id, parent_correlation_id, level).
4. Coalesce on u_correlation_id only.
5. Add the onBefore script "u_imp_<source>_task -> pm_project_task" from docs/05 section 4.
   It sets:
   - target.top_task = the project, found by project_correlation_id
   - target.parent = the parent task, found by parent_correlation_id (or the project if
     the two IDs are equal)
   If either is not found, it sets error = true and logs it.
6. additional_assignee_list: add a field map script that splits the emails and calls
   SPMMigrationUtil.userByEmail(), returning a comma-separated list of sys_ids.
7. The file is sorted by level (phases first, then tasks, then subtasks). Load it in ONE
   import so parents are inserted before their children. For very large files, split by
   the level column and load level 1, then 2, then 3.
8. After the load, open 3 projects in Planning Console / Gantt and compare them with Asana.
```

**Field maps: `u_imp_asana_task`** (17)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_wbs_order` | `wbs_order` | direct |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_assigned_to` | `assigned_to` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_additional_assignee_list` | `additional_assignee_list` | List of sys_user; script: split emails -> SPMMigrationUtil.userByEmail() |
| `u_state` | `state` | Choice; choice action = reject |
| `u_milestone` | `milestone` | True/False |
| `u_start_date` | `start_date` | Date |
| `u_end_date` | `end_date` | Date |
| `u_work_start` | `work_start` | Date |
| `u_work_end` | `work_end` | Date |
| `u_percent_complete` | `percent_complete` | Number |
| `u_time_constraint` | `time_constraint` | Choice; choice action = reject |

No field map (read by scripts): `u_project_correlation_id`, `u_parent_correlation_id`, `u_level`

**Acceptance criteria**

- Every task row has parent and top_task populated; 0 rows end in error for a missing parent.
- Phase rows (Asana sections such as Project Initiation, Build, Test) appear as level-1
  tasks, with their tasks nested underneath.
- Tasks with "Milestone" in the name load with milestone = true.
- % Complete of 0.5 in Asana shows as 50.
- Planned dates are unchanged after load (the schedule engine does not move them).
- Re-loading gives 0 inserts.

### MIG-06: Asana: import set + transform map for task dependencies (u_imp_asana_dependency)
*Story points: 2 · Priority: 3 - Moderate · Depends on: MIG-05*

**As a** project manager, **I want** Asana "blocked by" links to become ServiceNow dependencies, **so that** the critical path is preserved.

**Steps**

```
1. Create the import set table u_imp_asana_dependency from data/load/asana/04_planned_task_rel_planned_task.csv.
2. Create the transform map to planned_task_rel_planned_task.
3. Create two scripted field maps, BOTH coalesce = true:
   - parent = byCorrelation('planned_task', source.u_predecessor_correlation_id)
   - child = byCorrelation('planned_task', source.u_successor_correlation_id)
4. Map type (fs) and lag directly.
5. Add an onBefore script that sets ignore = true when parent or child cannot be found.
6. Load AFTER MIG-05, then spot-check that successor dates did not move. If they did,
   record the project for a date review.
```

**Field maps: `u_imp_asana_dependency`** (4)

| Source column | Target field | Settings |
|---|---|---|
| `u_predecessor_correlation_id` | `parent` | COALESCE; Reference (scripted); script: answer = new SPMMigrationUtil().byCorrelation('planned_task', source.u_predecessor_correlation_id); |
| `u_successor_correlation_id` | `child` | COALESCE; Reference (scripted); script: answer = new SPMMigrationUtil().byCorrelation('planned_task', source.u_successor_correlation_id); |
| `u_type` | `type` | Choice; choice action = reject |
| `u_lag` | `lag` | Number |

**Acceptance criteria**

- One planned_task_rel_planned_task row per file row.
- Re-loading creates no duplicates.
- Rows with unknown tasks are ignored and logged, not half-created.

### MIG-07: (Optional) Asana: import set + transform map for demands (u_imp_asana_demand -> dmn_demand)
*Story points: 2 · Priority: 4 - Low · Depends on: MIG-08*

**As a** HR PMO lead, **I want** Asana items that the business re-classifies as demands to load as dmn_demand, **so that** nothing on the review list is lost.

**Steps**

```
Build only if asana/01_dmn_demand.csv has rows after the classification review (today it
has 0). Otherwise it follows the same steps and field list as MIG-08, using source table
u_imp_asana_demand and file data/load/asana/01_dmn_demand.csv. u_demand_type arrives as
the HR stored value.
```

**Field maps: `u_imp_asana_demand`** (26)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_type` | `type` | Choice; choice action = reject |
| `u_demand_type` | `u_demand_type` | Choice; choice action = reject |
| `u_category` | `category` | Choice; choice action = reject |
| `u_state` | `state` | Choice; choice action = reject |
| `u_assigned_to` | `assigned_to` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_opened_by` | `opened_by` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_business_owner` | `u_business_owner` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_executive_sponsor` | `u_executive_sponsor` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_portfolio` | `portfolio` | Reference pm_portfolio; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_primary_program` | `primary_program` | Reference pm_program; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_funding_type` | `u_funding_type` | Choice; choice action = reject |
| `u_expense_type` | `expense_type` | Choice; choice action = reject |
| `u_business_category` | `u_business_category` | Choice; choice action = reject |
| `u_business_unit` | `business_unit` | Reference business_unit; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_impacted_business_units` | `impacted_business_units` | List; script: split names -> sys_ids of the referenced table |
| `u_size` | `size` | Choice; choice action = reject |
| `u_start_date` | `start_date` | Date |
| `u_due_date` | `due_date` | Date |
| `u_priority` | `priority` | Choice; choice action = reject |
| `u_business_case` | `business_case` | direct |

**Acceptance criteria**

- Same criteria as MIG-08, for Asana rows.

## EPIC-3: SPM Migration - Adaptive (Clarizen) to ServiceNow (projects, tasks, demands)

Import sets and transform maps that load Adaptive Work (Nordic IT PMO) records into
ServiceNow. Most records become pm_project records (with tasks, dependencies and status
reports); some become dmn_demand records. The demand condition will be confirmed later.
It is applied upstream by the pipeline (config/classification.yaml), so the ServiceNow
build does not depend on it: demands arrive in adaptive/01_dmn_demand.csv, projects in
adaptive/02_pm_project.csv. Provisional rule: Adaptive State = Requested or Draft -> Demand.

### MIG-08: Adaptive: import set + transform map for demands (u_imp_adaptive_demand -> dmn_demand)
*Story points: 5 · Priority: 1 - Critical · Depends on: MIG-02, MIG-03*

**As a** Nordic PMO lead, **I want** Adaptive requests that are still in intake or estimation to load as demands, **so that** they continue through ServiceNow demand management instead of being forced into projects.

**Steps**

```
CONTEXT
- Which Adaptive records are demands is decided upstream. The condition is to be
  confirmed; provisionally State = Requested or Draft. Every row in
  adaptive/01_dmn_demand.csv is a demand, so no routing logic is needed in ServiceNow.
- dmn_demand stays OUT-OF-BOX apart from the custom fields on the Demand form:
  u_demand_type, u_business_owner, u_executive_sponsor, u_cn, u_funding_type,
  u_funding_source, u_business_category and u_sites. Adaptive attributes with no demand
  field (estimate type, lifecycle dates, cost center) are already written into the
  description by the pipeline.
- The demand and project tables share most field names, but a few differ:
  - end date: due_date on demand, end_date on project
  - portfolio: portfolio on demand, primary_portfolio on project
  - owner: assigned_to (Demand manager) on demand, project_manager on project
STEPS
1. Create the import set table u_imp_adaptive_demand from data/load/adaptive/01_dmn_demand.csv.
2. Create the transform map "Adaptive Demand to dmn_demand" (target dmn_demand) with the
   CONVENTIONS settings.
3. Auto Map Matching Fields, then check against the list below. Coalesce on u_correlation_id.
4. state: the file carries stored demand states (e.g. submitted, draft). Loading directly
   into approved/completed can start approval flows. Test with 2 rows first; if a flow
   starts, add the load condition from MIG-01 step 3 to that flow.
5. u_sites: add the list-field script (docs/05 section 4).
6. Confirm that the demand-to-project conversion carries the custom fields (u_cn,
   u_funding_*, u_business_*, u_sites) onto the new project. That way migrated demands
   convert cleanly later.
```

**Field maps: `u_imp_adaptive_demand`** (28)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_type` | `type` | Choice; choice action = reject |
| `u_demand_type` | `u_demand_type` | Choice; choice action = reject |
| `u_category` | `category` | Choice; choice action = reject |
| `u_state` | `state` | Choice; choice action = reject |
| `u_assigned_to` | `assigned_to` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_opened_by` | `opened_by` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_business_owner` | `u_business_owner` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_executive_sponsor` | `u_executive_sponsor` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_portfolio` | `portfolio` | Reference pm_portfolio; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_primary_program` | `primary_program` | Reference pm_program; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_cn` | `u_cn` | direct |
| `u_funding_type` | `u_funding_type` | Choice; choice action = reject |
| `u_funding_source` | `u_funding_source` | direct |
| `u_expense_type` | `expense_type` | Choice; choice action = reject |
| `u_business_category` | `u_business_category` | Choice; choice action = reject |
| `u_sites` | `u_sites` | List; script: split names -> sys_ids of the referenced table |
| `u_business_unit` | `business_unit` | Reference business_unit; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_size` | `size` | Choice; choice action = reject |
| `u_start_date` | `start_date` | Date |
| `u_due_date` | `due_date` | Date |
| `u_priority` | `priority` | Choice; choice action = reject |
| `u_business_case` | `business_case` | direct |

**Acceptance criteria**

- One dmn_demand per row. correlation_id starts with "ADAPTIVE:", and u_legacy_id holds
  the Adaptive SYSID (once the implementation team has added it).
- type = project, u_demand_type = the New Project stored value, and
  category = strategic unless the file says otherwise.
- u_business_owner resolves by email; opened_by resolves or is migration.unassigned.
- No approval or notification fires on load.
- Re-loading gives 0 inserts.
- A migrated demand converts to a project with its custom fields intact.

### MIG-09: Adaptive: import set + transform map for projects (u_imp_adaptive_project -> pm_project)
*Story points: 5 · Priority: 1 - Critical · Depends on: MIG-02, MIG-03, MIG-08*

**As a** Nordic PMO lead, **I want** active and recently completed Adaptive projects in pm_project, with every Nordic field, **so that** delivery, go-live and cycle-time reporting continue in ServiceNow.

**Steps**

```
1. Create the import set table u_imp_adaptive_project from data/load/adaptive/02_pm_project.csv.
2. Create the transform map "Adaptive Project to pm_project".
   TIP: build it like MIG-04. It has the same target and mostly the same fields, plus the
   Adaptive-only fields: u_cn, u_funding_source, u_sites, u_cost_center,
   u_next_go_live_date, u_estimate_type, the 5 lifecycle dates, and phase.
3. Auto Map Matching Fields, then check against the list below. Coalesce on u_correlation_id.
4. Reuse the onBefore script "u_imp_<source>_project -> pm_project" (docs/05 section 4):
   - Demand link: if demand_correlation_id is set, target.demand = that demand's sys_id.
   - Two-pass close: when spm.migration.pass = 1, closed projects are inserted as
     Work in Progress, and the second pass sets the final state after tasks are loaded.
5. u_sites: list-field script. u_cost_center: Referenced value field name = code.
6. Header-only projects (completed in the last 2 years) have no rows in the task file.
   That is expected.
```

**Field maps: `u_imp_adaptive_project`** (36)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_project_manager` | `project_manager` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_business_owner` | `u_business_owner` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_executive_sponsor` | `u_executive_sponsor` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_state` | `state` | Choice; choice action = reject |
| `u_phase` | `phase` | Choice; choice action = reject |
| `u_start_date` | `start_date` | Date |
| `u_end_date` | `end_date` | Date |
| `u_work_start` | `work_start` | Date |
| `u_work_end` | `work_end` | Date |
| `u_percent_complete` | `percent_complete` | Number |
| `u_primary_portfolio` | `primary_portfolio` | Reference pm_portfolio; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_primary_program` | `primary_program` | Reference pm_program; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_investment_class` | `investment_class` | Choice; choice action = reject |
| `u_cn` | `u_cn` | direct |
| `u_funding_type` | `u_funding_type` | Choice; choice action = reject |
| `u_funding_source` | `u_funding_source` | direct |
| `u_expense_type` | `expense_type` | Choice; choice action = reject |
| `u_business_category` | `u_business_category` | Choice; choice action = reject |
| `u_sites` | `u_sites` | List; script: split names -> sys_ids of the referenced table |
| `u_business_unit` | `business_unit` | Reference business_unit; referenced value field = name; choice action = reject (mock loads) / ignore (final) |
| `u_cost_center` | `u_cost_center` | Reference cmn_cost_center; referenced value field = code; choice action = ignore; confirm field exists (MIG-02) |
| `u_priority` | `priority` | Choice; choice action = reject |
| `u_time_constraint` | `time_constraint` | Choice; choice action = reject |
| `u_next_go_live_date` | `u_next_go_live_date` | Date; confirm field exists (MIG-02) |
| `u_estimate_type` | `u_estimate_type` | Choice; choice action = reject; confirm field exists (MIG-02) |
| `u_request_received` | `u_request_received` | Date; confirm field exists (MIG-02) |
| `u_request_assigned` | `u_request_assigned` | Date; confirm field exists (MIG-02) |
| `u_estimate_complete` | `u_estimate_complete` | Date; confirm field exists (MIG-02) |
| `u_ready_for_delivery` | `u_ready_for_delivery` | Date; confirm field exists (MIG-02) |
| `u_project_assigned` | `u_project_assigned` | Date; confirm field exists (MIG-02) |

No field map (read by scripts): `u_demand_correlation_id`, `u_include_tasks`

**Acceptance criteria**

- One pm_project per row. The Adaptive SYSID shows in u_legacy_id.
- u_cn, u_funding_type, u_funding_source, u_business_category, u_sites and the lifecycle
  dates are populated wherever the file has values.
- Completed projects end in Closed Complete after pass 2, with no errors from
  "open child task" rules.
- Projects whose demand_correlation_id is set are linked to the demand from MIG-08.
- Re-loading gives 0 inserts.

### MIG-10: Adaptive: import set + transform map for project tasks (u_imp_adaptive_task -> pm_project_task)
*Story points: 3 · Priority: 2 - High · Depends on: MIG-09*

**As a** project manager, **I want** my Adaptive work breakdown (tasks, milestones, hierarchy) under my ServiceNow project, **so that** in-flight IT projects keep their plan.

**Steps**

```
Same build as MIG-05: import set table u_imp_adaptive_task from
data/load/adaptive/03_pm_project_task.csv, the same onBefore script, and coalesce on
u_correlation_id. Adaptive has no collaborators, so there is no
additional_assignee_list field map. Adaptive milestones already arrive with
milestone = true.
```

**Field maps: `u_imp_adaptive_task`** (16)

| Source column | Target field | Settings |
|---|---|---|
| `u_correlation_id` | `correlation_id` | COALESCE; String |
| `u_correlation_display` | `correlation_display` | direct |
| `u_legacy_id` | `u_legacy_id` | confirm field exists (MIG-02) |
| `u_legacy_url` | `u_legacy_url` | confirm field exists (MIG-02) |
| `u_wbs_order` | `wbs_order` | direct |
| `u_short_description` | `short_description` | direct |
| `u_description` | `description` | direct |
| `u_assigned_to` | `assigned_to` | Reference sys_user; referenced value field = email; choice action = ignore |
| `u_state` | `state` | Choice; choice action = reject |
| `u_milestone` | `milestone` | True/False |
| `u_start_date` | `start_date` | Date |
| `u_end_date` | `end_date` | Date |
| `u_work_start` | `work_start` | Date |
| `u_work_end` | `work_end` | Date |
| `u_percent_complete` | `percent_complete` | Number |
| `u_time_constraint` | `time_constraint` | Choice; choice action = reject |

No field map (read by scripts): `u_project_correlation_id`, `u_parent_correlation_id`, `u_level`

**Acceptance criteria**

- Same criteria as MIG-05, for Adaptive rows.
- The Adaptive parent/child hierarchy matches in the Gantt for 3 sampled projects.

### MIG-11: Adaptive: import set + transform map for dependencies (u_imp_adaptive_dependency)
*Story points: 2 · Priority: 3 - Moderate · Depends on: MIG-10*

**As a** project manager, **I want** Adaptive predecessor links, including type and lag, to become ServiceNow dependencies, **so that** schedules keep their logic.

**Steps**

```
Same build as MIG-06: import set table u_imp_adaptive_dependency from
data/load/adaptive/04_planned_task_rel_planned_task.csv. The type arrives as fs / ss / ff / sf,
and lag is in days.
```

**Field maps: `u_imp_adaptive_dependency`** (4)

| Source column | Target field | Settings |
|---|---|---|
| `u_predecessor_correlation_id` | `parent` | COALESCE; Reference (scripted); script: answer = new SPMMigrationUtil().byCorrelation('planned_task', source.u_predecessor_correlation_id); |
| `u_successor_correlation_id` | `child` | COALESCE; Reference (scripted); script: answer = new SPMMigrationUtil().byCorrelation('planned_task', source.u_successor_correlation_id); |
| `u_type` | `type` | Choice; choice action = reject |
| `u_lag` | `lag` | Number |

**Acceptance criteria**

- Same criteria as MIG-06.
- Type and lag match Adaptive for 5 sampled links.

### MIG-12: Adaptive: import set + transform map for status reports (u_imp_adaptive_status -> project_status)
*Story points: 3 · Priority: 2 - High · Depends on: MIG-09*

**As a** PMO lead, **I want** each project's last Adaptive health (6 indicators + update notes) as a ServiceNow status report, **so that** RAG reporting is continuous on day one.

**Steps**

```
1. Create the import set table u_imp_adaptive_status from data/load/adaptive/05_project_status.csv.
2. Create the transform map to project_status with these two coalesce fields:
   - project: scripted field map, byCorrelation('pm_project', source.u_project_correlation_id)
   - as_on: mapped directly
3. Map overall_health, schedule, cost, resources, scope and u_risk_health. The values are
   green / yellow / red, and the choice action is reject.
4. Map comments (Adaptive Update Notes).
5. Load after MIG-09.
```

**Field maps: `u_imp_adaptive_status`** (9)

| Source column | Target field | Settings |
|---|---|---|
| `u_project_correlation_id` | `project` | COALESCE; Reference (scripted); script: answer = new SPMMigrationUtil().byCorrelation('pm_project', source.u_project_correlation_id); |
| `u_as_on` | `as_on` | Date |
| `u_overall_health` | `overall_health` | Choice; choice action = reject |
| `u_schedule` | `schedule` | Choice; choice action = reject |
| `u_cost` | `cost` | Choice; choice action = reject |
| `u_resources` | `resources` | Choice; choice action = reject |
| `u_scope` | `scope` | Choice; choice action = reject |
| `u_risk_health` | `u_risk_health` | Choice; choice action = reject; confirm field exists (MIG-02) |
| `u_comments` | `comments` | direct |

**Acceptance criteria**

- One status report per migrated project that had health or notes in Adaptive.
- The Project status tab shows the RAG indicators.
- Re-loading does not duplicate reports.

## EPIC-4: SPM Migration - Test, reconcile and cut over

Mock loads, reconciliation, performance timing, rollback and the production cutover.

### MIG-13: Mock load 1: smoke test with hand-picked records
*Story points: 3 · Priority: 1 - Critical · Depends on: MIG-04, MIG-05, MIG-06, MIG-08, MIG-09, MIG-10, MIG-11, MIG-12*

**As a** migration lead, **I want** about 10 hand-picked records per transform map loaded end to end, **so that** we find mapping and script defects before a full-volume load.

**Steps**

```
1. The migration team provides sample files covering these cases:
   - deep subtasks, milestones and dependencies
   - a closed project
   - an unmatched user and a multi-name sponsor
   - a multi-site Adaptive project
   - an Adaptive demand
2. Load them in this order: Adaptive demands, Asana projects, Adaptive projects, Asana
   tasks, Adaptive tasks, dependencies, status reports.
3. Log every transform error and reject in the story, and fix them in the transform maps
   or report them to the migration team (mapping/value issues).
4. Load the same files again to prove idempotency.
```

**Acceptance criteria**

- 0 transform errors on the second run.
- Re-running inserts 0 records.
- No sys_user records are created.
- The business signs off the sample records.

### MIG-14: Full-volume mock loads, reconciliation, timing and rollback
*Story points: 5 · Priority: 1 - Critical · Depends on: MIG-13*

**As a** migration lead, **I want** full-volume loads that reconcile and a tested rollback, **so that** cutover is predictable.

**Steps**

```
1. Load all files in the MIG-13 order and record the duration of each load.
2. Export pm_project, dmn_demand and pm_project_task with correlation_id to CSV, and hand
   them to the migration team for `reconcile`.
3. Write a fix script that deletes the migration records by correlation_display
   (Asana / Adaptive Work). Children go first: dependencies, status reports, tasks,
   projects, then demands. Test it in sub-prod.
4. Repeat the load once to rehearse it (mock 3).
```

**Acceptance criteria**

- The reconcile report shows 0 missing and 0 unexpected records per table.
- Load timings are documented.
- The rollback script removes all migrated records and nothing else.

### MIG-15: Production cutover
*Story points: 3 · Priority: 1 - Critical · Depends on: MIG-14*

**As a** migration lead, **I want** the build promoted and the final data loaded into production, **so that** Asana and Adaptive can be frozen and decommissioned.

**Steps**

```
1. Promote the migration build (transform maps, script include, load settings) to prod, and
   re-run the MIG-02 readiness check against prod.
2. The source tools are frozen, and the migration team delivers the final files.
3. Set Enforce mandatory fields = true and reference choice action = ignore. Load in the
   MIG-13 order, then run pass 2.
4. Run reconcile and the business spot-check. Go or no-go decision.
5. Re-enable notifications, and keep u_legacy_url visible for hypercare.
```

**Acceptance criteria**

- Production reconciles 100% against the final files.
- The business signs off.
- The rollback script is available but not needed.
