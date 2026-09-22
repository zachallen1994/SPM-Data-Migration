# 02: Asana source

## 1. Object model and ServiceNow equivalents

```
Workspace / Organization
 ├── Teams ─────────────────────────────→ department or assignment group (optional)
 ├── Portfolios (can nest) ─────────────→ pm_portfolio / pm_program
 │     └── items: projects or portfolios
 ├── Goals ─────────────────────────────→ strategic goals (usually out of scope)
 └── Projects ──────────────────────────→ pm_project  or  dmn_demand
       ├── Sections ────────────────────→ phase-level pm_project_task (optional)
       ├── Status updates ──────────────→ project_status
       ├── Custom fields ───────────────→ mapped fields or description
       └── Tasks ───────────────────────→ pm_project_task  or  dmn_demand (intake projects)
             ├── Subtasks (any depth) ──→ child pm_project_task
             ├── Dependencies ──────────→ planned_task_rel_planned_task
             ├── Stories (comments) ────→ work notes or a history attachment
             └── Attachments ───────────→ sys_attachment
```

**Watch for multi-homing.** One Asana task can belong to several projects (see
`memberships`). ServiceNow tasks have exactly one parent. The normalizer assigns a
task to its **first** membership project, and lists the others in
`data/staging/multi_homed_tasks.csv` so you can choose a different home.

## 2. Where demand lives in Asana

Look for these patterns. Configure each one in `config/classification.yaml` and
`settings.yaml`:

| Pattern | How to recognize it | Classification |
|---|---|---|
| **Intake/request project** (usually fed by an Asana Form) | A project named something like "Project Requests" or "Intake". Each **task** is one request | Each task becomes a `dmn_demand`. List these project gids in `asana.intake_project_gids` |
| **Pipeline portfolio** | A portfolio such as "Proposed" or "FY27 Pipeline" | Each project in it becomes a `dmn_demand` |
| **Stage or status custom field** | A project custom field such as `Stage` = Idea, Proposed or Under Review | A `dmn_demand` when the value is pre-approval |
| **Empty shell projects** | No tasks, no start date, not completed | Sent for **review**. Often an idea that never started |

## 3. Extraction (API)

- Base URL: `https://app.asana.com/api/1.0`
- Auth: `Authorization: Bearer <PAT>`. Use a service account that is a member of
  every team, or you will miss private projects.
- Pagination: `limit=100`, then follow `next_page.offset`.
- Rate limits: about 150 requests per minute on free plans and 1,500 on paid plans.
  On a 429, wait for `Retry-After`. The extractor handles this.
- Always pass `opt_fields`, otherwise you get compact records with only `gid` and
  `name`.

| Data | Endpoint |
|---|---|
| Projects | `GET /workspaces/{workspace_gid}/projects?opt_fields=...` (returns archived projects too) |
| Portfolio items | `GET /portfolios/{portfolio_gid}/items` |
| Tasks in a project | `GET /projects/{project_gid}/tasks?opt_fields=...` |
| Subtasks | `GET /tasks/{task_gid}/subtasks?opt_fields=...`, called recursively when `num_subtasks > 0` |
| Status updates | `GET /status_updates?parent={project_gid}` |
| Stories (comments) | `GET /tasks/{task_gid}/stories` (*expensive: one call per task*) |
| Attachments | `GET /attachments?parent={task_gid}` → `download_url` |
| Custom field definitions | `GET /workspaces/{workspace_gid}/custom_fields` |

`src/spm_migration/asana_extract.py` pulls projects, portfolio items, tasks,
subtasks (recursively) and status updates into `data/raw/asana/*.jsonl`. Stories and
attachments are left out on purpose. Add them only after you have decided the history
strategy (README, Step 5).

**Volume estimate.** With about 2,000 projects and 150 tasks each, that is roughly
300k tasks. With paging and subtask calls, expect 5–15k requests, or 10–30 minutes
at paid-plan rate limits. Stories add one call per task, which is why they're
optional.

## 4. Asana fields that need thought

| Asana field | Challenge | Recommendation |
|---|---|---|
| `start_on` / `due_on` | Many tasks have only a due date | If only `due_on` is set, `start = due` (a zero-length task). Or use `start = due - 1 working day` |
| `due_at` | A timestamp with a time zone | Convert to the instance time zone, then keep the date only |
| `completed` | A boolean with no "in progress" state | `completed=true` → Closed Complete, 100%. Otherwise Open, or Work in Progress if the start date has passed |
| `resource_subtype = milestone` | | `milestone = true` |
| `resource_subtype = approval` | | A normal task. Put the approval status in the description |
| `current_status_update.status_type` | on_track, at_risk, off_track, on_hold, complete | Becomes `project_status.overall_health` (green, yellow or red) through `value_maps.csv` |
| Sections | Often used as phases or kanban columns | Choose one per project style. The normalizer can emit sections as phase tasks (`asana.sections_as_phases: true`) |
| Custom fields | Free-form, and different in every project | The normalizer stores all of them in `custom_fields` as JSON. Promote the important ones in `target_mapping.yaml` (see the `custom.<Field Name>` syntax) |
| `followers`, `collaborators` | ServiceNow tasks have one `assigned_to` | Put them in the description, or leave them out |
| Project `owner` | Can be empty | Fall back to `team` lead, then to the placeholder user |
