# 01: ServiceNow SPM target model

> Field names below are the common out-of-the-box names. **Confirm them against your
> instance** by exporting `sys_dictionary` and running
> `python -m spm_migration.cli validate-fields`. Choice values, such as the numbers
> stored behind `state`, must come from your own `sys_choice` export.

## 1. Tables you will load

| Order | Table | What it is | Key relationships |
|---|---|---|---|
| 0 | `sys_user`, `sys_user_group` | People and groups. **Match existing records; don't create them** unless agreed | Matched by `email` |
| 0 | `cmn_department`, `business_unit`, `cmn_location` | Org structure | Matched by `name` |
| 0 | `pm_portfolio`, `pm_program` | Portfolios and programs. Usually created by hand; there are only a few | Matched by `name` |
| 0 | `fiscal_period` | Required before any cost plans. Generate it from the fiscal calendar | — |
| 1 | `dmn_demand` | Demand. Extends `task` | `portfolio`, `primary_program`, `assigned_to` |
| 2 | `pm_project` | Project. Extends `planned_task`, which extends `task` | `primary_portfolio`, `primary_program`, `project_manager`, `demand` |
| 3 | `pm_project_task` | Project task, phase or milestone. Extends `planned_task` | `parent` (planned_task), `top_task` (the project) |
| 4 | `planned_task_rel_planned_task` | Dependencies | `parent` = predecessor, `child` = successor, `type` (fs/ss/ff/sf), `lag` |
| 5 | `project_status` | Status report | `project`, `as_on`, `overall_health`, `schedule`, `cost`, `scope` |
| 6 | `resource_plan` / `resource_allocation` | Resourcing. *Optional; usually only for active work* | `task`, `user_resource` or `group_resource` |
| 6 | `cost_plan`, `benefit_plan` | Financials. *Optional; needs `fiscal_period`* | `task`, `start_fiscal_period`, `end_fiscal_period` |
| 6 | `risk`, `issue` (project risks and issues) | RAID. *Optional* | `task` / `project` |
| 7 | `sys_attachment` | Files. Loaded with the Attachment API | `table_name`, `table_sys_id` |

Portfolio and program tables differ by release and entitlement. Some instances use
`pm_portfolio` plus `pm_program`; newer ones may also have `sn_align_*` or Strategic
Planning tables. Check which ones your instance actually uses.

## 2. Keys and idempotency

Every table that extends `task` already has two fields you can use:

| Field | Value we set | Why |
|---|---|---|
| `correlation_id` | `ASANA:1204567890123456` or `ADAPTIVE:/Project/abc123` | **Coalesce key** in every transform map. Re-runs update records instead of inserting duplicates |
| `correlation_display` | `Asana` or `Adaptive Work` | Lets you filter a list view by source |

If the implementation team provides these two fields (ideally on `task`, so projects,
tasks and demands all inherit them), the migration fills them:

| Field | Type | Purpose |
|---|---|---|
| `u_legacy_id` | String (100) | Human-readable source ID, such as the Adaptive SYSID `P-00123` or the Asana gid. Show it on forms |
| `u_legacy_url` | URL | Link back to the source record during hypercare |

`pm_project_task` has no business key of its own, so `correlation_id` is the only
reliable way to find a task's parent while loading.

## 3. Demand essentials (`dmn_demand`)

| Field | Notes |
|---|---|
| `short_description` | Name. Max 160 characters; the pipeline truncates |
| `description` | Long text |
| `type` | Choices are usually *project, change, enhancement, defect*. Almost everything you migrate will be **project** |
| `category` | Usually *strategic* or *operational*. Get the values from `sys_choice` |
| `state` | Draft, Submitted, Screening, Qualified, Approved, Completed, Deferred, Incomplete and so on. **Loading directly into Approved or Completed may fire approval workflows**. See the gotchas below |
| `assigned_to` | Demand manager. Some releases have a separate `demand_manager` field |
| `opened_by` | Submitter or requester. Some releases also have `submitter` or `requested_by`. Confirm in the dictionary |
| `portfolio`, `primary_program` | References. Match by name |
| `start_date`, `due_date` | Requested timeframe |
| `business_case` | Justification text, if the source has it |
| `priority`, `risk`, `size` and the scoring fields | Map if the source has them, otherwise leave them for demand managers to fill in |

## 4. Project essentials (`pm_project`)

| Field | Notes |
|---|---|
| `short_description`, `description` | Name and description |
| `project_manager` | Reference to `sys_user` |
| `state` | Stored as integers in most releases, for example `-5` Pending, `1` Open, `2` Work in Progress, `3` Closed Complete, `4` Closed Incomplete, `7` Closed Skipped. **Check `sys_choice`**. `mapping/value_maps.csv` holds these stored values, so correct them there |
| `phase` | Present on some releases and in phase-based project templates |
| `start_date`, `end_date` | Planned dates. **Setting these on a project with tasks may be overridden by the schedule engine**. See the gotchas |
| `work_start`, `work_end` | Actual dates |
| `percent_complete` | Rolls up from tasks when tasks exist |
| `primary_portfolio`, `primary_program` | References |
| `demand` | Links a project to the demand it came from |
| `department`, `business_unit`, `priority`, `risk` | Optional |
| `time_constraint` | `start_on_specific_date` keeps the imported start date. `asap` lets the engine move it |

Cost fields such as `planned_cost` and `actual_cost` **roll up from cost plans and
expense lines**. Don't write them directly. If you need historical totals, load one
cost plan per project, or store the totals in custom fields.

## 5. Project task essentials (`pm_project_task`)

| Field | Notes |
|---|---|
| `short_description`, `description` | |
| `parent` | Parent task, or the project for top-level tasks. The transform script resolves it from `u_parent_correlation_id` |
| `top_task` | The project. Resolved from `u_project_correlation_id` |
| `assigned_to` | One assignee. Extra Asana collaborators are dropped or go into the description |
| `start_date`, `end_date`, `duration` | Planned dates |
| `work_start`, `work_end` | Actuals |
| `percent_complete`, `state` | |
| `milestone` | true or false. A milestone has zero duration |
| `time_constraint` | Set `start_on_specific_date` to keep dates |
| `wbs_order` or `order` | Sort order among siblings |

## 6. Load-order and schedule-engine gotchas (read these before mock load 1)

1. **Parents before children.** Task rows are sorted by depth, but ServiceNow import
   sets process in row order only inside one load. Load level 1, then level 2, and so
   on, or rely on the sorted file within a single import.
2. **The schedule engine recalculates dates.** When a task is inserted, the project
   schedule is recalculated, and tasks with `time_constraint = asap` move to the
   project start. To keep source dates:
   - Load every project and task with `time_constraint = start_on_specific_date`.
   - Load dependencies **last**. Adding a dependency can push successor dates. Where
     source dates break a dependency (a successor starting before its predecessor
     ends), decide to either keep the dependency or keep the dates.
   - Consider loading tasks with the project calculation set to **manual** where your
     release supports it (`calculation` field or the project's schedule settings), then
     switching back.
3. **Closed records and business rules.** Loading a project straight into Closed
   Complete, or a demand straight into Approved, can trigger approvals, notifications,
   or rules that reject a close while child tasks are open. The options are:
   - Load closed tasks before closing the project (two passes: insert open, then
     update state).
   - Or uncheck *Run business rules* on the transform map. This is faster, but you
     must then set `top_task`, rollups and `sys_class_name` yourself. **Not
     recommended** for tasks.
4. **Notifications.** Turn off email in sub-production (`glide.email.smtp.active =
   false`), or use the transform script's `workflow = false` option on large loads,
   so thousands of "You have been assigned" emails don't go out.
5. **Numbering.** ServiceNow assigns new PRJ, PRJTASK and DMND numbers. Keep the
   source ID in `u_legacy_id`. Don't try to preserve source numbers in `number`.
6. **Users.** Resolve users by `email` (case-insensitive). Unmatched users go to a
   placeholder user and are listed in `data/load/users_unmatched.csv`.
7. **Journal history.** Work notes and comments get the load date as their
   timestamp. To keep original dates, either put history in an attachment, or write
   `sys_journal_field` rows by script. That route is supported only with care and
   should be tested first.
8. **Volume.** Import set loads of more than about 50k rows run faster when split
   into batches. Use scheduled data imports or the Import Set API
   (`POST /api/now/import/{staging_table}/insertMultiple`).
