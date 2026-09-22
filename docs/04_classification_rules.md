# 04: Project vs. Demand classification

## 1. The business test

ServiceNow separates **"should we do this?"** (Demand) from **"we are doing this"**
(Project). Classify each source record by where it is in that lifecycle **today**,
not by what the source tool called it.

| Question | Yes → | No → |
|---|---|---|
| Is it approved or funded, with delivery work started or planned by a team? | **Project** | next question |
| Is it an idea, request, proposal or business case waiting for a decision? | **Demand** | next question |
| Is it finished, cancelled, a template, or older than the cut-off? | **Skip** (archive only) | **Review** (a person decides) |

**Edge cases and recommended defaults:**

| Case | Default |
|---|---|
| An approved demand that already has an Asana project for delivery | A **Project** only. Create a Completed demand linked through `pm_project.demand` only if demand-to-project lineage reporting is needed |
| A "project" with no tasks, no dates and no owner activity for more than 6 months | **Review**. It's usually a stale idea. If still wanted, make it a demand in Draft |
| A demand-like record that has tasks | **Review**. Real tasks mean real work, so it's probably a project |
| An Adaptive project in Cancelled | **Skip**. Or a demand in the Deferred or Incomplete state if the PMO wants rejection history |
| An Asana intake task that was approved and spawned a project | Load the intake task as a Completed or Approved **demand**. Link it through `pm_project.demand` using `demand_link` in overrides |
| Templates (an Asana project named "Template", or `IsTemplate` in Adaptive) | **Skip**. Rebuild them as ServiceNow project templates |

## 2. How the rules engine works

`config/classification.yaml` is an **ordered** list of rules. The **first match
wins**. Every record gets:

- `target_class`: `project`, `demand`, `skip` or `review`
- `classification_rule`: the name of the rule that matched, for auditing
- `classification_confidence`: `rule`, `override` or `default`

Manual decisions in `config/overrides.csv` always beat rules:

```csv
source_system,source_id,target_class,include_tasks,demand_link,note
asana,1204567890123456,demand,,,"Owner confirmed still in intake - JS 9/22"
adaptive,/Project/abc123,project,true,ASANA:1209999999999999,"Delivery project for intake request"
```

`include_tasks` and `demand_link` are optional. Set `include_tasks = false` to load the
header only. `demand_link` is a demand's correlation ID (such as `ASANA:<gid>`), and it
fills `pm_project.demand`.

### Condition syntax

```yaml
- name: asana_intake_tasks_are_demands
  target: demand
  when:
    source_system: {equals: asana}
    source_type: {equals: asana_intake_task}
```

Conditions inside `when` are combined with AND. For OR, write two rules.
The supported operators are:

| Operator | Example |
|---|---|
| `equals`, `not_equals` | `status: {equals: completed}` (case-insensitive) |
| `in`, `not_in` | `phase: {in: [Initiation, Proposal]}` |
| `regex` | `name: {regex: "(?i)template"}` |
| `empty`, `not_empty` | `start_date: {empty: true}` |
| `gt`, `lt` (numeric) | `task_count: {lt: 1}` |
| `older_than_days`, `newer_than_days` (dates) | `updated_at: {older_than_days: 730}` |

The field can be any canonical column (see `src/spm_migration/canonical.py`) or
`custom.<Custom Field Name>` for Asana custom fields and Adaptive `C_` fields.

## 3. Workflow for fast sign-off

1. Run `classify` and send `classification_review.csv`, split by `portfolio` or
   `owner_email`, to the owners. (Tip: `owner_email` is already a column, so filter on
   it in Excel.)
2. Owners answer project, demand or skip for each row. Paste the answers into
   `config/overrides.csv`.
3. Re-run. `classification_summary.csv` is the one-page status for the steering
   group.
4. **Freeze** the classification before mock load 2. After that, change only
   through overrides.
