# 03: Adaptive Work (fka Clarizen) source

## 1. Object model and ServiceNow equivalents

```
Organization
 ├── Portfolio ───────────────────────────→ pm_portfolio
 ├── Program ─────────────────────────────→ pm_program
 ├── Project ─────────────────────────────→ pm_project  or  dmn_demand (Draft or proposal phase)
 │    ├── Milestone ──────────────────────→ pm_project_task (milestone = true)
 │    ├── Task (any depth, Parent) ───────→ pm_project_task
 │    ├── Link (dependency) ──────────────→ planned_task_rel_planned_task
 │    ├── ResourceLink / RegularAssignment→ assigned_to, resource_plan
 │    ├── Timesheet / Expense ────────────→ time_card / expense_line (usually out of scope)
 │    ├── Issue / Risk ───────────────────→ issue / risk
 │    └── Discussion posts, Documents ────→ history attachment / sys_attachment
 └── Request (Case) ──────────────────────→ dmn_demand
```

Adaptive Work has a **real work breakdown structure**, with parents, milestones,
dependencies, planned vs. actual dates and effort. Of the two sources, it maps most
cleanly onto ServiceNow projects. The work is mainly in states, custom fields and
financials.

## 2. Where demand lives in Adaptive Work

| Pattern | How to recognize it | Classification |
|---|---|---|
| **Request entity** (Case) | Entity `EnhancementRequest` in the API (labelled "Request" in the UI; confirm with the metadata API) | `dmn_demand` |
| **Draft projects** | `State = Draft`, with no actual start | `dmn_demand` |
| **Proposal or ideation phase** | `Phase` (or a custom field such as `C_Stage`) = Initiation, Proposal, Ideation or Business Case | `dmn_demand` |
| **Cancelled projects** | `State = Cancelled` | Usually **skip**. Or load as a demand in the Deferred or Incomplete state if portfolio history matters |

## 3. Extraction (REST API v2)

1. **Find the data center.** Call `POST https://api.clarizen.com/v2.0/services/authentication/getServerDefinition`.
   The response's `serverLocation` is the base URL for every other call. You can
   also set `adaptive.base_url` directly.
2. **Authenticate.** Send the header `Authorization: ApiKey <key>`. This is
   preferred. The alternative is `POST {base}/authentication/login`, then send
   `Authorization: Session <sessionId>`.
3. **Discover fields.** Before building the field list, run
   `POST {base}/metadata/describeEntities` with body
   `{"typeNames":["Project","Task","Milestone","EnhancementRequest","Link"]}`. It
   returns every field's API name, including `C_` custom fields. Paste the output into
   the mapping workshop.
4. **Query with CZQL** (Clarizen Query Language):
   ```json
   POST {base}/data/query
   {"q": "SELECT Name, SYSID, State, Phase, ProjectManager.Email FROM Project WHERE State <> 'Cancelled'",
    "paging": {"from": 0, "limit": 1000}}
   ```
   The response contains `entities` and `paging.hasMore`. Pass the returned `paging`
   back in to get the next page.

`src/spm_migration/adaptive_extract.py` runs one CZQL query per entity in
`settings.yaml → adaptive.entities`, using the field lists there, and writes
`data/raw/adaptive/<entity>.jsonl`.

**Reference fields** such as `ProjectManager` and `Parent` come back as
`{"id": "/User/xyz"}`. Use dot notation such as `ProjectManager.Email` or
`Parent.Name` in the SELECT to get readable values in the same call.

## 4. Adaptive fields that need thought

| Adaptive field | Challenge | Recommendation |
|---|---|---|
| `State` | Draft, Active, On Hold, Completed, Cancelled | Draft → demand (usually). The rest map to `pm_project.state` through `value_maps.csv` |
| `Phase` | Values are set per organization | Map to `pm_project.phase` if you use phase-based templates. Otherwise it only drives classification |
| `TrackStatus` / `OverallSummary` / RAG custom fields | Health indicators | Becomes `project_status.overall_health` and the schedule, cost and scope indicators |
| `StartDate` / `DueDate` | Planned | `start_date` / `end_date` |
| `ActualStartDate` / `ActualEndDate` | Actuals | `work_start` / `work_end` |
| `PercentCompleted` | 0–100 | `percent_complete` |
| `Work`, `ActualEffort`, `RemainingEffort` | Durations, sometimes returned as `{value, unit}` | Convert to hours. The normalizer handles both a plain number and the `{value, unit}` form |
| `PlannedBudget`, `ActualCost`, `PlannedRevenue` | Rolled-up financials | **Don't** write them into `pm_project` cost fields. Either load a `cost_plan`, or store the totals in custom fields for reference |
| `Parent` on Task | WBS hierarchy | `pm_project_task.parent` (via `u_parent_correlation_id`) |
| `Project` on Task | The owning project | `top_task` (via `u_project_correlation_id`) |
| `Link` entity | `Predecessor`, `Successor`, `DependencyType`, `Lag` | `planned_task_rel_planned_task`. Convert lag to ServiceNow's duration format |
| `SYSID` | Human-readable ID such as `P-00123` | `u_legacy_id` |
| `C_*` custom fields | Tenant-specific | List them in `settings.yaml`. The normalizer puts them all in `custom_fields` JSON for `custom.<Field>` mapping |
