# Asana - verification before the update set goes to TEST

Do it in DEV, with the update set "Asana migration - final" selected. For each record: open it, check the marker text
(Ctrl+F in the script), and if it is not in the update set use Related Links > Add to Update Set.

## 1. Data sources (both)

| Data source | Marker in script | CONFIG |
|---|---|---|
| Asana Projects - API | `script version 2026-11-24c` | MODE 'projects', SOURCE 'both', PILOT [], INCLUDE ['Project Warren'] |
| Asana Project Tasks - API | `script version 2026-11-24c` | MODE 'tasks', SOURCE 'both', ONLY [] |

## 2. Import Asana HR Project Portfolio Transform Map (-> pm_project)

| Target field | Source | Marker / setting |
|---|---|---|
| correlation_id | u_correlation_id, direct | Coalesce = true |
| short_description | u_name, direct | |
| project_manager | asana_user_field_map.js | `PM = { angle` ; COLUMN 'u_pm_assigned' |
| assigned_to | asana_user_field_map.js | same, COLUMN 'u_pm_assigned' |
| u_business_owner | asana_user_field_map.js | COLUMN 'u_hrsp___sme___project_lead', FALLBACK_EMAIL false |
| primary_portfolio | asana_portfolio_field_map.js | `var NAME = 'HR'` |
| u_functional_area | asana_functional_area_field_map.js | `Benefits & Well-Being` |
| description | asana_project_field_maps.js PART A | `Migrated from Asana` |
| start_date | asana_project_field_maps.js PART C | `' 08:00:00'`, Date format yyyy-MM-dd HH:mm:ss |
| end_date | asana_project_field_maps.js PART D | `' 17:00:00'`, Date format yyyy-MM-dd HH:mm:ss |
| state | asana_project_state_field_map.js (top part) | `'in progress': 'Work in Progress'` |
| on_hold | asana_project_state_field_map.js PART B | `'on hold' ? 'true'` |
| u_sites | asana_sites_field_map.js | `question_choice` |
| u_it_required | asana_it_required_field_map.js | `dmn_demand` |
| u_funding_type, u_project_category, priority, primary_goal | existing scripts | last line before `})(source);` is `return '';` |
| primary_program | - | NO field map (section goes to Functional Area) |

All script field maps: Use source script ticked, Choice action = ignore. Transform Scripts: none needed.

## 3. Import Asana Project Tasks Transform Map (-> pm_project_task)

Exactly as the checklist at the top of servicenow/asana_tasks_transform.js - nothing more:
8 field maps (correlation_id coalesce, short_description, state C, percent_complete D, work_start E, work_end F
both yyyy-MM-dd, assigned_to G, description H) and 2 onBefore scripts (Order 100 PART A, Order 200 PART B).
NO field maps for start_date, end_date, parent, top_task.

## 4. NOT in the update set - set by hand in each instance

| Item | DEV | TEST | PROD |
|---|---|---|---|
| Property x_mig.asana.token (same Asana user as DEV) | ☐ | ☐ | ☐ |
| Property x_mig.asana.project_gid = 1208928603143252 | ☐ | ☐ | ☐ |
| Property x_mig.asana.plan_links (if used) | ☐ | ☐ | ☐ |
| Portfolio "HR", active | ☐ | ☐ | ☐ |
| Choice records labelled "undefined" deleted (IT Required, Sites, Funding Type, Project Category) | ☐ | ☐ | ☐ |
| Sites alias for BSMH decided (asana_sites_field_map.js ALIASES) | ☐ | | |

## 5. Proof run in DEV (before committing anywhere)

1. Delete all Asana projects (correlation_id starts with ASANA:) and their tasks.
2. Asana Projects - API -> Load All Records -> log shows "script version 2026-11-24c" and "Tracker rows read: N | with
   custom fields: N" -> transform the NEWEST import set.
3. Asana Project Tasks - API -> Load All Records -> transform the newest import set. Expect 0 errors.
4. background_scripts/asana_compare.js: notInSN 0, "undefined" 0.
5. By hand: AMR (PM Jennifer Angle, IT Required No Integrations, Functional Area Compensation, Portfolio HR);
   Project Warren in Project Workbench (Compensation > Associate Job Mapping > Receive Job Descriptions; Impact
   Analysis 09-09 -> 09-30 Closed Complete); Ireland HR ServiceNow Integration present.

## 6. Update set

Open it > Customer Updates: expect 2 data sources, 2 transform maps, every field map / transform script from sections
2 and 3. Then Complete it, move to TEST, preview (0 errors), commit, then section 4 for TEST, then a fresh load.
