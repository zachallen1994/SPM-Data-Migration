# SPM Data Migration: Asana + Adaptive Work (fka Clarizen) → ServiceNow SPM

A starter kit for moving project portfolio data into ServiceNow Strategic Portfolio
Management (SPM). It covers two sources:

| Source | Typical object that becomes a **Project** (`pm_project`) | Typical object that becomes a **Demand** (`dmn_demand`) |
|---|---|---|
| **Asana** | Project that has active or finished delivery work | A task in an intake/request project, a project in a "pipeline" portfolio, or a project whose Stage field says Proposed |
| **Adaptive Work** | Project in Active, On Hold or Completed state | A Request entity, or a Project in Draft state or an ideation/proposal phase |

## What's in this repo

```
README.md                      ← this playbook (start here)
docs/
  01_target_model_servicenow.md   ServiceNow tables, keys, load order, gotchas
  02_source_asana.md              Asana object model, API extraction, quirks
  03_source_adaptive.md           Adaptive Work object model, API extraction, quirks
  04_classification_rules.md      Project vs. Demand decision tree
  05_servicenow_build.md          Import sets, transform maps, scripts to paste in
  06_testing_and_cutover.md       Mock loads, reconciliation, cutover runbook
  07_mapping_review.md            ★ Review of the actual Asana/Adaptive/ServiceNow field files
  08_loading_into_servicenow.md   ★ How the import set / transform map load works; custom fields
  09_servicenow_user_stories.md   ★ Developer user stories (generated; import-ready xlsx in mapping/)
  10_getting_the_data_out.md      ★ No Asana/Adaptive access? Export files route + request template
mapping/                       ← field-level mapping specs (open these in Excel)
  mapping_workbook.xlsx          ★ all of the below in one workbook (generated)
  decisions.csv                  open decisions D1-D16 that block the build
  data_quality.csv               source/target issues DQ1-DQ18 to fix before cutover
  asana_to_servicenow.csv        HR portfolio tracker + task-level plan fields
  adaptive_to_servicenow.csv     Nordic IT PMO project fields (all 28 + required extras)
  servicenow_form_fields.csv     every Project/Demand form field, its field name and its source
  servicenow_transform_maps.csv  build sheet: one row per field map, per source (generated)
  servicenow_user_stories.xlsx   epics + stories to import into ServiceNow Agile (rm_epic / rm_story)
  value_maps.csv                 state, health, category, sites, funding ... translations
config/
  settings.example.yaml          API connection settings, source field lists
  classification.yaml            ordered rules: project, demand, skip or review
  target_mapping.yaml            canonical fields → ServiceNow columns
  user_stories.yaml              source text for the developer user stories
  overrides.example.csv          per-record manual decisions
  asana_plan_links.example.csv   tracker item -> Asana plan project (detailed WBS)
  user_crosswalk.example.csv     display names / nicknames -> sys_user email
src/spm_migration/             ← pipeline: extract → normalize → classify → transform
tests/                         ← sample data and an end-to-end test
```

## How the pipeline works

```
 Asana API ─┐                                  ┌─ 01_dmn_demand.csv
            ├─ extract ─ normalize ─ classify ─┼─ 02_pm_project.csv
Adaptive ───┘  (raw     (one shared  (rules +  ├─ 03_pm_project_task.csv
   API          JSONL)   "canonical"  manual    ├─ 04_planned_task_rel_planned_task.csv
                         model)       overrides)└─ 05_project_status.csv  → ServiceNow import sets
```

**Why this design makes the build faster:**

1. **One canonical model.** Both sources are converted to the same staging layout
   first. You then build one import set and one transform map per ServiceNow table,
   not one per source per table. That roughly halves the ServiceNow build.
2. **Classification is config, not code.** Business owners argue about Project vs.
   Demand. Keep the outcome in `classification.yaml` and `overrides.csv` so every
   decision is re-runnable and auditable.
3. **Value maps live in a CSV.** Each run writes `unmapped_values.csv`. You fill the
   gaps in `mapping/value_maps.csv` and run again. No code changes are needed.
4. **Correlation IDs make loads idempotent.** Every record carries
   `correlation_id = ASANA:<gid>` or `ADAPTIVE:<id>`, and transform maps coalesce on
   it. You can re-run mock loads as often as you like without creating duplicates.

---

## Step-by-step playbook

Each step lists what to do, what you should have at the end, and the shortcut that
saves the most time.

### Step 0: Set up (day 1)
- [ ] Get API access. For **Asana**, a Personal Access Token (or service account) with
      access to every relevant team and portfolio. For **Adaptive Work**, an API key or
      an integration user with read access to all projects and requests.
- [ ] Get a ServiceNow **sub-production** instance (dev → test) with the SPM plugins
      active: Project Portfolio Management, Demand Management, Resource Management
      and Financials, as licensed.
- [ ] Get admin rights (or a partner who has them) to create import set tables,
      transform maps and one custom field on the target tables.
- [ ] `pip install -r requirements.txt` and copy `config/settings.example.yaml` to
      `config/settings.yaml`. Keep secrets in environment variables.

> **Shortcut:** export the ServiceNow data dictionary on day 1 (see Step 3). The
> pipeline checks every target field against it, so you stop guessing field names.

### Step 1: Scope and inventory (days 1–3)
Decide **what** moves before deciding **how**.
- [ ] Run the extractors (`python -m spm_migration.cli extract-asana` and
      `extract-adaptive`). They pull everything the credentials can see.
- [ ] Run `normalize`, then open `data/staging/work_items.csv` in Excel and pivot on
      `source_system`, `status`, `portfolio` and year of `updated_at`.
- [ ] Agree the **cut rules** with stakeholders. A common set is:
  - Active and on-hold work: **migrate in full**, with tasks.
  - Completed in the last 12–24 months: **migrate the header only**, no tasks.
    ServiceNow keeps it for reporting.
  - Older completed, cancelled, archived or template items: **skip**. Archive the raw
    export instead.
- [ ] Put those cut rules into `config/classification.yaml` as `skip` rules.

> **Shortcut:** most migrations shrink by 40–70% at this step. Every record you skip
> is one less record to map, cleanse and reconcile.

### Step 2: Understand the sources (days 2–4)
- [ ] Read `docs/02_source_asana.md` and `docs/03_source_adaptive.md`.
- [ ] List every **custom field** in each tool. The Asana normalizer puts them all in
      `custom_fields` as JSON. For Adaptive, add the `C_` fields to
      `extra_fields` under `settings.yaml → adaptive.entities`.
- [ ] Find out **where demand actually lives** in each tool. This is the most
      important discovery question. In Asana it is usually an intake form project
      whose tasks are requests. In Adaptive it is usually the Request entity or Draft
      projects.

### Step 3: Understand the target (days 2–4)
- [ ] Read `docs/01_target_model_servicenow.md`.
- [ ] In ServiceNow, export `sys_dictionary` for `pm_project`, `pm_project_task`,
      `dmn_demand`, `planned_task`, `task`, `project_status` and
      `planned_task_rel_planned_task` (List view → Export → CSV). Save it as
      `data/reference/sys_dictionary.csv`.
- [ ] Export `sys_choice` for the same tables, so you have the real stored values for
      `state`, `type`, `category`, `priority` and so on. Save it as
      `data/reference/sys_choice.csv`.
- [ ] Export `sys_user` (email, user_name, active), `pm_portfolio`, `pm_program`,
      `cmn_department` and `business_unit` to `data/reference/`.
- [ ] Run `python -m spm_migration.cli validate-fields`. It flags any column in
      `config/target_mapping.yaml` that doesn't exist on your instance.

### Step 4: Classify Project vs. Demand (days 3–6)
- [ ] Read `docs/04_classification_rules.md` and tune `config/classification.yaml`.
- [ ] Run `classify`. You get three files:
  - `data/staging/work_items_classified.csv`: every record with its `target_class`
    and the rule that decided it.
  - `data/staging/classification_review.csv`: only the records a person needs to
    look at.
  - `data/staging/classification_summary.csv`: counts by source and class, for
    status meetings.
- [ ] Send the review file to portfolio owners. Put their answers in
      `config/overrides.csv` and re-run.

> **Shortcut:** send the review list per portfolio owner rather than as one big
> file. Give a deadline, and default to the rule outcome if no answer comes back.

### Step 5: Field mapping workshops (week 2)
- [ ] Walk through `mapping/mapping_workbook.xlsx` with each business owner. Mark each
      row `status = Confirmed`, `Deferred` or `Not migrating`.
- [ ] Decide the **value maps** (state, health, priority, demand type and category) in
      `mapping/value_maps.csv`.
- [ ] Decide the **user strategy**. Match on email. Unmatched users go to a
      placeholder user such as `migration.unassigned` and are reported.
- [ ] Decide what happens to **history**. Comments, status updates and attachments are
      the most expensive part to migrate. The usual choices are:
      (a) the latest status update only, as a `project_status` record;
      (b) one "legacy history" PDF or text attachment per record;
      (c) full comment history as work notes, which loses original timestamps unless
      you script it.

### Step 6: Build in ServiceNow (weeks 2–3)
Follow `docs/05_servicenow_build.md`:
- [ ] Add `u_legacy_id` and `u_legacy_url` to `task`, or to `pm_project` and
      `dmn_demand`. These let users click back to the old tool during hypercare.
- [ ] Create the import set tables by loading the generated CSVs once. Then create one
      transform map per target, coalescing on `correlation_id`.
- [ ] Paste in the provided transform scripts. They resolve parent task, top task,
      project, demand and user references by correlation ID or email.
- [ ] Load in this order: **reference data → demands → projects → tasks (parents
      first) → dependencies → status reports → attachments**.

### Step 7: Mock load 1, the plumbing test (week 3)
- [ ] Run `python -m spm_migration.cli run-all`, which does normalize → classify →
      transform.
- [ ] Load about 10 hand-picked records per class, covering the ugly ones: deep
      subtasks, milestones, cross-project dependencies, closed projects and
      unmatched users.
- [ ] Fix the mapping, re-run and re-load. Coalesce updates the records in place.

### Step 8: Mock loads 2 and 3, full volume (weeks 3–5)
- [ ] Load everything into test. Reconcile counts and spot-check samples using
      `docs/06_testing_and_cutover.md`.
- [ ] Time each load step. Your cutover window depends on it.
- [ ] Get business sign-off on a sample of about 20 projects and 20 demands,
      compared side by side with the source.

### Step 9: Cutover (1–3 days)
- [ ] Freeze the source tools (read-only), then do a final extract → run-all → load
      into production → reconcile → sign off.
- [ ] Keep the sources read-only for 60–90 days. `u_legacy_url` points users back to
      them.

---

## Quick start

```bash
pip install -r requirements.txt
cp config/settings.example.yaml config/settings.yaml   # then edit it
cp config/overrides.example.csv config/overrides.csv

export ASANA_PAT=...            # Asana personal access token
export ADAPTIVE_API_KEY=...     # Adaptive Work API key

python -m spm_migration.cli extract-asana            # API route, or with export files instead:
python -m spm_migration.cli import-asana-exports     #   (docs/10_getting_the_data_out.md)
python -m spm_migration.cli import-adaptive-exports
python -m spm_migration.cli describe-adaptive  # field API names -> data/reference/
python -m spm_migration.cli extract-adaptive
python -m spm_migration.cli run-all            # normalize → classify → transform
python -m spm_migration.cli validate-fields    # once sys_dictionary.csv is exported
python -m spm_migration.cli build-workbook     # refresh mapping_workbook.xlsx
python -m spm_migration.cli transform-map-spec # refresh servicenow_transform_maps.csv
python -m spm_migration.cli user-stories       # regenerate the developer user stories
python -m spm_migration.cli push               # optional Import Set API load (dry run; add --execute)
python -m spm_migration.cli reconcile          # after a load, vs. ServiceNow exports

pytest                                          # end-to-end test on sample data
```

Run everything from the repo root with `PYTHONPATH=src`, or run `pip install -e .`.

## Important caveats
- **ServiceNow field and choice names vary by release and by customization.** The
  target field names here are the common out-of-the-box names. Treat them as
  *proposed* until `validate-fields` passes against your own instance's
  `sys_dictionary`, and your `sys_choice` export confirms the value maps.
- **Adaptive Work API names**, such as the entity for Requests or your `C_` custom
  fields, depend on your tenant's configuration. Confirm them with the metadata API
  (see `docs/03_source_adaptive.md`) before a full extract.
- `data/` is git-ignored. Raw exports contain business data and user emails, so
  don't commit them.
