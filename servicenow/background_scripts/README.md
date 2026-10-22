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
| timecard_br_check.js | Insert rules on time_card / time_sheet that touch State; one card's time sheet |
| attachment_check.js | What Adaptive returns for one record's files; does download work |
| asana_scope_check.js | Active Asana projects per team |
| asana_scope_overview.js | The Asana tracker (owner, rows) and portfolios with their projects |
| asana_project_check.js | One Asana project / tracker row: Asana -> staging -> field maps |
| asana_tasks_check.js | Why the Asana Tasks data source loads 0 rows |

Fix scripts that **change data** are in `../fix_scripts/` (run as Fix Scripts, DRY_RUN first).
