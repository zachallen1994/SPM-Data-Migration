# Background scripts (read-only checks)

Paste one into **System Definition > Scripts - Background** (or SN Utils) and click **Run script**.
None of these change data. Lines marked ✏️ at the top are the only things to edit (a name, an id, a table).

| Script | What it answers |
|---|---|
| test_connection.js | Do the Adaptive and Asana API calls work (Status 200)? |
| discovery_background_script.js | First discovery: Adaptive entities and fields, Asana check |
| task_lookup_check.js | Why an Adaptive related data source loads 0 rows (ids, project links) |
| issues_check.js | Why the Adaptive Issues data source loads 0 rows |
| lessons_check.js | Why the Adaptive Lessons Learned data source loads 0 rows |
| lessons_relationship_check.js | Lessons per project; the related list that queries `u_demand` |
| risk_values_check.js | Adaptive risk values next to the ServiceNow risk choices |
| risk_fields_check.js | Adaptive risk field names (probability, strategy, assignee, ...) |
| risk_assignee_check.js | Which Adaptive field holds a risk's / issue's assignee |
| state_bucket_check.js | The "Validate state mapped to bucket" rule and state choices |
| project_fields_check.js | Adaptive Project Pool / Estimate Type / Groups fields |
| project_priority_check.js | Adaptive project priority field and values |
| project_type_discovery.js | Adaptive project types, programs, demand hours, demand fields |
| resource_dates_check.js | Where a person's resource assignment dates come from |
| dependency_discovery.js | Where Adaptive keeps task predecessors |
| financial_planning_discovery.js | Which Adaptive entity holds the budget lines |
| budget_lines_check.js | One project's budget lines and monthly phasing; cost plan fields |
| budget_lines_compare.js | Direct vs Aggregated budget lines; what is in staging |
| time_resources_discovery.js | Adaptive time entry and resource link fields; time_card fields |
| demand_hours_check.js | Where one demand's logged time is kept in Adaptive |
| demand_timecard_check.js | Why a demand has no / few time cards |
| timecard_staging_check.js | Latest time card staging rows: user found? target found? result |
| timecard_user_check.js | One person's time cards: week, hours, record, state |
| timecard_totals_check.js | Time card hours vs Adaptive for one project; duplicates; hours by state |
| timecard_state_check.js | Why time cards are Pending instead of Processed |
| program_fields_check.js | pm_program fields and states, the project -> program field, active Adaptive programs |
| migrated_state_counts.js | Adaptive projects / demands in ServiceNow, by State |
| project_load_check.js | After the projects transform: records touched, left over from earlier loads, linked to a program |
| program_link_check.js | Why projects are not linked to their program (column, staging values, field map) |
| project_dates_check.js | Adaptive Schedule Start / Finish / Project Assigned field names and values; ServiceNow date fields |
| transform_progress_check.js | A long transform: rows by state, rows done in the last 10 min, time left, duplicate rows |
| task_dates_check.js | One project's task dates: Adaptive Schedule Start / Finish vs ServiceNow planned dates and time constraint |
| task_dates_debug.js | Why task dates stay at the project start: map, field maps, rules; optional one-task test update |
| planned_dates_debug.js | Which part of ServiceNow changes a project's / task's planned end; optional one-record test with and without the planning rules |
| timecard_br_check.js | Insert rules on time_card / time_sheet that touch State; one card's time sheet |
| attachment_check.js | What Adaptive returns for one record's files; does download work |
| asana_scope_check.js | Active Asana projects per team |
| asana_scope_overview.js | The Asana tracker (owner, rows) and portfolios with their projects |
| asana_project_check.js | One Asana project / tracker row: Asana -> staging -> field maps |
| asana_tasks_check.js | Why the Asana Tasks data source loads 0 rows |

Fix scripts that **change data** are in `../fix_scripts/` (run as Fix Scripts, DRY_RUN first).
