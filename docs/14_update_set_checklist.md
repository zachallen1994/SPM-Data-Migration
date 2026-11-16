# Update set checklist (DEV -> TEST -> PROD)

Tick each line in DEV with the update set selected (Global scope). Anything changed before the update set was
selected: open the record and use **Add to Update Set**. Scripts are in the repo folder `servicenow/`.

## 1. Staging tables (columns) - labels exactly as below

| Table | Column (label) | Type / length | ☐ |
|---|---|---|---|
| u_import_adaptive_programs | Correlation ID | String 100 | ☐ |
| u_import_adaptive_projects | Correlation ID, Program Correlation ID | String 100 | ☐ |
| | Schedule Start, Schedule Finish | Date | ☐ |
| | Manager Email | String 100 | ☐ |
| | Rate Card | String 100 | ☐ |
| | Schedule % Complete | String 40 | ☐ |
| u_import_adaptive_project_tasks | Correlation ID, Parent Correlation ID, Project Correlation ID | String 100 | ☐ |
| | Task State (NOT "State" - that is the import set's own column) | String 40 | ☐ |
| | Schedule % Complete | String 40 | ☐ |
| | Planned Effort | String 40 | ☐ |
| | Resource Emails | String **4000** | ☐ |
| | Constraint Type, Custom Constraint Type, Constraint Date | String 100 | ☐ |
| u_import_adaptive_resources | Resource Name | String 100 | ☐ |

## 2. Data sources (the script is part of the data source record)

| Data source | Script | Settings to check | ☐ |
|---|---|---|---|
| Adaptive Programs - API | adaptive_programs_data_source.js | | ☐ |
| Adaptive Projects - API | adaptive_projects_data_source.js | PILOT / STATES / PROJECT_TYPES (or the properties) | ☐ |
| Adaptive Tasks | adaptive_related_data_source.js | ENTITY Task, PROJECT_FIELD Project, PARENT_TABLES ['pm_project'], TASK_RESOURCES true, ONLY [] | ☐ |
| Adaptive Resources | adaptive_related_data_source.js | RegularResourceLink, WorkItem, ['pm_project'], MAP incl. Resource Name | ☐ |
| Adaptive Issues / Risks | adaptive_related_data_source.js | PROJECT_FIELD **PlannedFor** | ☐ |
| Adaptive Lessons Learned | adaptive_related_data_source.js | C_PMOLessonsLearned, C_RelatedWorkItem | ☐ |
| Adaptive Status History | adaptive_status_history_data_source.js | SINCE 2025-01-01, ONE_PER day | ☐ |
| Adaptive Budget Lines | adaptive_budget_data_source.js | ONLY [] | ☐ |
| Adaptive Time Entries | adaptive_timecards_data_source.js | STATES ['Approved'], ONLY [] | ☐ |

## 3. Transform maps

### Import Adaptive Projects Transform Map (-> pm_project)
| Item | Script / setting | ☐ |
|---|---|---|
| onBefore | demand_project_split.js PART A | ☐ |
| onAfter | project_dates_transform.js (top part, insert only) | ☐ |
| start_date / end_date field maps | project_dates_transform.js (bottom), Use source script, yyyy-MM-dd | ☐ |
| Map setting "Copy empty fields" | OFF | ☐ |
| Project Assigned -> u_project_assigned | yyyy-MM-dd | ☐ |
| project_manager | user_field_map.js, Choice action ignore | ☐ |
| Rate Model | reference_by_name_field_map.js, Choice action ignore | ☐ |
| percent_complete | project_percent_complete_field_map.js | ☐ |
| primary_program | program_transform.js PART C | ☐ |
| Business Category, Sites, Estimate Type, Groups, Project Pool | choice_field_map.js (one per field), Choice action ignore | ☐ |
| Funding Type <- Project Funding Type; Funding Source <- Dept # for Expense; Expense type <- Funding Type | | ☐ |
| Next go live (yyyy-MM-dd); Last go live <- Planned Finish (yyyy-MM-dd) | | ☐ |

### Import Adaptive Demands Transform Map (-> dmn_demand)
| onBefore | demand_project_split.js PART B | ☐ |
|---|---|---|
| program field | program_transform.js PART C, Choice action ignore | ☐ |

### Import Adaptive Programs (-> pm_program)
| Date field maps | yyyy-MM-dd | ☐ |
|---|---|---|

### Import Adaptive Project Tasks Transform Map (-> pm_project_task)
| Item | Script / setting | ☐ |
|---|---|---|
| onBefore Order 100 | PART A (project + parent) | ☐ |
| onBefore Order 200 | PART E (constraint, override status) | ☐ |
| onBefore Order 300 | PART G (planned effort) - delete the old Planned effort field map | ☐ |
| onBefore Order 400 | PART I (resources -> additional assignees, clears Assigned to) | ☐ |
| State field map | PART C reading `u_task_state` | ☐ |
| Status field map | PART B, Choice action ignore | ☐ |
| percent_complete field map | PART H (SEND_TO_PARENTS true) | ☐ |
| Start Date -> start_date, Due Date -> end_date, Actual Start/End -> work_start/work_end | yyyy-MM-dd | ☐ |
| **Assigned to field map (PART D)** | **delete / deactivate** | ☐ |

### Import Adaptive Resources (-> sn_plng_att_core_resource_assignment)
| PART A task, PART B user_resource, PART C/D dates, PART E onBefore, PART F operational work type (value set) | resource_assignment_transform.js | ☐ |
|---|---|---|

### Time cards, status history, budget
| Time card map | timecard_transform.js PART A-D; PART E (onAfter) **or** PART F (onComplete) as decided; Run business rules as decided | ☐ |
|---|---|---|
| Status history map | status_history_transform.js; project + as_on coalesce | ☐ |
| Budget Lines (Order 100) + Actuals (Order 200) | cost_plan_transform.js, expense_line_transform.js | ☐ |
| Old Opex / Capex Budget and Actuals maps | **inactive** | ☐ |

## 4. System properties (records move; VALUES are set per instance)

| Property | DEV value | TEST / PROD value | ☐ |
|---|---|---|---|
| x_mig.adaptive.url / x_mig.adaptive.key | | set per instance (never move the key) | ☐ |
| x_mig.adaptive.pilot / states / project_types | | all / Active;On Hold / Project | ☐ |
| x_mig.adaptive.batch / scope | | blank / all (or batch + latest) | ☐ |
| x_mig.migration_running | | false (true only during the load) | ☐ |

## 5. NOT in the update set (data - set up in each instance)

Rate model records (BSMH missing in DEV), cost types (e.g. Other Opex), choice values the team adds by hand,
property values, users. The background scripts / fix scripts are run from the repo, not moved.

## 6. After the update set is committed in TEST

1. Data source import log: no `No column labelled "..."` lines.
2. One project end to end (`x_mig.adaptive.scope` = its number): projects, tasks, resources, time; compare with Adaptive.
