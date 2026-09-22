# 06: Testing, reconciliation and cutover

## 1. Mock load plan

| Mock | Scope | Goal | Exit criteria |
|---|---|---|---|
| **M1: plumbing** | About 10 hand-picked records per class, per source | Transform maps and scripts work, and references resolve | 0 transform errors. The hand-picked edge cases look right on the form |
| **M2: full volume** | Everything in scope | Performance, data quality, classification | Counts reconcile 100%. Under 1% of rows in `unmapped_values` or the placeholder user |
| **M3: dress rehearsal** | Everything, following the cutover runbook exactly | Timing and runbook accuracy | Finished inside the cutover window. Business UAT sign-off |

**Edge-case pick list for M1:** a project with more than 3 levels of subtasks, a
milestone-only project, cross-project dependencies, a multi-homed Asana task, a closed
project with open tasks, a project whose owner has left (unmatched user), a demand
with a very long description or HTML, an Asana intake task, an Adaptive Draft project,
an Adaptive Request, and a project with no dates.

## 2. Reconciliation

Run after every load:

```bash
# Export each target table from ServiceNow with the correlation_id column to data/reference/sn_<table>.csv
python -m spm_migration.cli reconcile
```

This writes `data/load/reconciliation_summary.csv` (expected, in ServiceNow, missing,
unexpected) and `reconciliation_detail.csv` (the correlation IDs involved).

Also check these, which `reconcile` can't see:

| Check | How |
|---|---|
| Task count per project | Group `pm_project_task` by `top_task.correlation_id` and compare with `task_count` in `work_items_classified.csv` (for projects with `include_tasks = true`) |
| Dates preserved | Sample 20 projects. Compare `start_date` and `end_date` with the source |
| Hierarchy | Open the Gantt chart for 5 complex projects side by side with the source |
| Placeholder usage | Filter the list on `assigned_to.email = migration.unassigned@...` |
| Demands vs. projects | `classification_summary.csv` compared with ServiceNow counts, filtered by `correlation_display` |

## 3. Cutover runbook (template)

| # | Step | Owner | Duration (from M3) |
|---|---|---|---|
| 1 | Announce the freeze. Set Asana projects to comment-only, or remove edit rights. Make Adaptive read-only | Tool admins | — |
| 2 | Final `extract-asana` and `extract-adaptive` | Migration lead | |
| 3 | `run-all` → check `unmapped_values.csv` and `classification_review.csv` are empty or accepted | Migration lead | |
| 4 | Disable prod email or notifications for the load user, if agreed | SN admin | |
| 5 | Load files 01–05 in order (doc 05, section 5) | SN admin | |
| 6 | Pass 2 state update (two-pass close only) | SN admin | |
| 7 | `reconcile`, and the business spot check of 20 projects and 20 demands | Migration lead + PMO | |
| 8 | Go/no-go decision | Steering | |
| 9 | Re-enable notifications. Send go-live communications with `u_legacy_url` guidance | PMO | |
| 10 | Archive the raw extracts and load files to secure storage, for audit | Migration lead | |

**Rollback.** Everything you loaded carries `correlation_display` = Asana or Adaptive
Work. A fix script, or list delete, filtered on that field removes the load. Test the
rollback in M3.

## 4. Hypercare (2–4 weeks)
- Sources stay read-only. `u_legacy_url` links from ServiceNow forms back to them.
- There is a daily triage of mapping defects. Fix them in the config, re-run
  `transform`, and re-load only the affected rows. Coalesce updates them in place.
- Decommission the sources after 60–90 days, once the reporting owners sign off.
