# 08: How the load works: import sets, transform maps and custom fields

## 1. The short answer

**Yes, import sets and transform maps are the right tool, and you don't need an "integration"
in the usual sense.** This is a one-time migration, not a live sync. Nothing has to connect
Asana or Adaptive to ServiceNow. The data moves as files:

```
 ┌──────────┐   API    ┌────────────────────────┐   CSV    ┌─────────────────────────────── ServiceNow ─┐
 │  Asana   │ ───────▶ │  this repo's pipeline  │ ───────▶ │  Import set    Transform map    Target     │
 └──────────┘ extract  │  (a laptop or server)  │  files   │  (staging  ──▶ (field maps + ─▶ tables     │
 ┌──────────┐   API    │  extract → normalize → │          │   table)       scripts)        pm_project │
 │ Adaptive │ ───────▶ │  classify → transform  │          │                                dmn_demand │
 └──────────┘          └────────────────────────┘          │                                ...        │
                                                           └────────────────────────────────────────────┘
```

| Piece | What it is | Who or what does it |
|---|---|---|
| **Extract** | Reads Asana and Adaptive through their APIs, using an Asana token and an Adaptive API key | `extract-asana` / `extract-adaptive`, run on any machine that can reach both APIs |
| **Transform (outside ServiceNow)** | Applies the mapping, value maps, Project/Demand classification and user matching | `run-all` writes `data/load/01…05_*.csv`, already shaped as ServiceNow columns |
| **Import set** | A plain staging table in ServiceNow that holds the rows exactly as loaded | Created automatically the first time you load a CSV |
| **Transform map** | Rules that copy each staging row into the real table: field maps, coalesce, reference lookups, scripts | Built once per target table, following `mapping/servicenow_transform_maps.csv` |

**Why this is efficient.** Every business rule (value maps, the Project vs. Demand decision,
user matching, rolling task fields up to the project) is handled *before* ServiceNow. So the
transform maps stay almost 1:1, and fixing a mapping means re-running the pipeline, not
rebuilding a transform map.

## 2. Three ways to get the files into the import set

| Option | How | Use it for | Needs |
|---|---|---|---|
| **A. Load Data (manual)** | *System Import Sets → Load Data*, pick the CSV, choose the import set table, then *Run Transform* | **Mock load 1**. This also creates the staging tables the first time | Admin login |
| **B. Data Source (reusable)** | *System Import Sets → Administration → Data Sources*: type File, format CSV, attach the file. Attach a new file for each run, then *Load All Records*, then *Transform*. Can be scheduled | **Mock loads 2–3 and cutover**. The steps are identical every time | Admin login |
| **C. Import Set REST API** | `python -m spm_migration.cli push --execute` POSTs each row to `/api/now/import/<staging table>`. The same transform map runs, and each row's result is written to `push_results.csv` | Optional. Hands-off repeat loads, or when admins can't be in the loop | An integration user with the `import_set_loader` and `import_transformer` roles, basic auth, and network access from the pipeline host to the instance |

**What you do *not* need:** IntegrationHub spokes, a MID Server (unless ServiceNow has to pull
files from SFTP), middleware, or any connection from ServiceNow to Asana or Adaptive. Those
make sense for ongoing integrations, not a one-time move.

Try option C on a small scale first:

```bash
python -m spm_migration.cli push                                   # dry run: counts only
python -m spm_migration.cli push --execute --only pm_project --limit 5   # 5 rows into sub-prod
```

## 3. Build steps in ServiceNow (in a single update set)

1. **Create the missing fields** first. See section 4: *proposed* fields don't exist yet.
2. **Create reference data:**
   - portfolios: one per HR COE section (see D2), plus IT PMO;
   - programs;
   - business units (BSMH, RSFH, GBS);
   - Sites values;
   - the placeholder user `migration.unassigned`.
3. **Create the import set tables, one per source per target**:
   - `u_imp_asana_project` and `u_imp_asana_task` (plus `_dependency`, and `_demand` only if needed);
   - `u_imp_adaptive_demand`, `_project`, `_task`, `_dependency` and `_status`.

   Create each one by loading its file from `data/load/asana/` or `data/load/adaptive/` once
   (option A). The file headers have **no `u_` prefix**, because ServiceNow adds it. So staging
   column `u_cn` maps to custom field `u_cn`, and `u_short_description` maps to
   `short_description`. There is never a `u_u_` column, and *Auto Map Matching Fields* builds
   most of each map.
4. **Create one transform map per staging table.** Use `mapping/servicenow_transform_maps.csv`,
   also the *Transform Maps* sheet in the workbook, which has one row per field map:
   - **coalesce**: `Yes` on `correlation_id`, so re-loads update records instead of duplicating
     them.
   - **referenced value field**: `email` for people, `name` for portfolio, program and business
     unit.
   - **choice action**: `ignore` for people. **Never `create`**, which would create users.
     `reject` for choice fields during mock loads, so bad values fail loudly.
   - **script**: for list fields and parent/project lookups (the snippets are in doc 05).

   The developer stories in `docs/09_servicenow_user_stories.md` (and the import-ready
   `mapping/servicenow_user_stories.xlsx`) walk through all of this, one story per transform map.
5. **Add the script include `SPMMigrationUtil`** and the onBefore scripts from doc 05.
6. **Load in order:** demands → projects → tasks → dependencies → status reports.
   Then run `reconcile`.

## 4. How each custom field is handled

### 4a. Custom fields that already exist (from the form workbooks)

| Field | Type | Loaded from | Transform map setting | Watch out for |
|---|---|---|---|---|
| `u_business_owner` | Reference → sys_user | Adaptive *Business Sponsor*; Asana *HRSP / SME / Project Lead* | Referenced value field = `email`; choice action = `ignore` | Sources hold **names**. The pipeline converts them to emails through `user_crosswalk.csv`, and multi-name sponsors use the first name that resolves (D10) |
| `u_executive_sponsor` | Reference → sys_user | *No source in either system* | Same as above | Loads blank. Sponsors fill it after go-live |
| `u_cn` | String | Adaptive *CN#* | Direct | Kept as text, so leading zeros survive |
| `u_funding_type` | Choice (Opex required / Capex required / Accrete… / other) | Adaptive *Funding Type*; Asana *Funding* | Direct; choice action = `reject` | The value map uses **guessed** stored values (`opex_required`, `capex_required`). Confirm them in `sys_choice` |
| `u_funding_source` | String | Adaptive *Project Funding Type* (19 capital pools) | Direct | Consider making it a choice list, so reports group cleanly |
| `u_business_category` | Choice (11 values; stored values known) | Adaptive *Business Category*; Asana *Entity/Organization* (your task mapping) | Direct; choice action = `reject` | The demand list differs (D1). Entity leaves 44 of 73 HR projects blank (D17) |
| `u_sites` | List | Adaptive *Region* (multi-select) | **Script**: split names and resolve them to sys_ids (doc 05) | Confirm what the list references (D18). Paducah and St Petersburg are missing (DQ14) |
| `u_demand_type` (demand) | Choice (New Application / New Project / HR) | Constant per source: Asana → HR, Adaptive → New Project | Direct; choice action = `reject` | Stored values are guessed (`hr`, `new_project`). Confirm them |

### 4b. Fields the migration needs that were *not* in the updated workbooks

The updated project form workbooks (23 Sep) have the same content as the 16 Sep version (DQ19).
None of the proposed fields appears yet. Until they exist, the transform map has nowhere to
put these columns. The data stays in the import set row and is not lost, but it doesn't reach
the record.

| Field | Table | Type | Source | If not created |
|---|---|---|---|---|
| `u_legacy_id` | task (or pm_project and dmn_demand) | String 100 | Adaptive SYSID / Asana ID | Users can't find the old record. `correlation_id` still works for loading |
| `u_legacy_url` | task | URL | Asana link | No click-through back to the source during hypercare |
| `u_next_go_live_date` | pm_project | Date | Adaptive *Next Go-Live Date* | Leadership go-live view lost (D12) |
| `u_estimate_type` | pm_project, dmn_demand | Choice | Adaptive *Estimate Type* | Kept only in the description block |
| `u_request_received`, `u_request_assigned`, `u_estimate_complete` | pm_project, dmn_demand | Date | Adaptive lifecycle | Nordic cycle-time reporting lost (D12) |
| `u_ready_for_delivery`, `u_project_assigned` | pm_project | Date | Adaptive lifecycle | Same |
| `u_cost_center` | pm_project, dmn_demand | Reference → cmn_cost_center | Adaptive *Dept # for Expense* | Map to `department` instead (D11) |
| `u_risk_health` | project_status | Choice (green/yellow/red) | Adaptive *Risk Health* | Risk RAG lost (D13) |

### 4c. Your Asana task-level mapping (Asana_Project_Task_Fields → Sheet1)

| Asana field | Your ServiceNow field | How it's implemented | Result on current data |
|---|---|---|---|
| Task Name, Assigned to, Start/Due Date, Task Status, % Complete, Parent Task, Collaborators | `short_description`, `assigned_to`, `start_date`, `end_date`, `state`, `percent_complete`, `parent`, `additional_assignee_list` | Direct, as mapped. % Complete 0.5 → 50. Collaborators → user list | ✔ |
| Section | *(blank)* | Still loaded as **phase tasks** (Initiation, Analysis/Design, Build …), so the plan structure survives | Change `sections_as_phases: false` to flatten |
| COE | `parent.portfolio` | A transform map can't write to a *parent* record from a child row. So the pipeline **rolls the value up**: the project's portfolio is its section (COE area); where there's no section, the most common task COE fills it | 18 portfolios. Task COEs inside one plan disagree (Benefits, Compensation, Learning) and are listed in `rollup_conflicts.csv` |
| Entity/Organization | `parent.u_business_category` | Rolled up the same way. The first value with a category mapping wins (RSFH → `rsfh`) | **44 of 73 HR projects get no category.** Recommendation D17: keep Entity in business unit / impacted business units, and give HR projects a *Human Resources* category |

## 5. Before mock load 1: checklist

- [ ] Proposed fields created, or a decision made to drop them (4b).
- [ ] `sys_dictionary` and `sys_choice` exported to `data/reference/`, and `validate-fields`
      passes.
- [ ] Portfolios, programs, business units, Sites values and the placeholder user exist.
- [ ] `user_crosswalk.csv` built from `users_referenced.csv`.
- [ ] `asana_plan_links.csv` filled (tracker row → plan project).
- [ ] Transform maps built from `servicenow_transform_maps.csv`, with coalesce on
      `correlation_id`.
- [ ] Email notifications off in sub-prod.
