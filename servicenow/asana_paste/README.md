# Paste-ready scripts - one file per record

Open the file, select all, copy, paste into the record of the same name. Nothing to edit inside.
Generated from the source files - if a source file changes, these are regenerated in the same commit.

## projects_map/ -> Import Asana HR Project Portfolio Transform Map > Field Maps (Use source script, Choice action ignore)
| File | Target field | Date format |
|---|---|---|
| project_manager.js | project_manager | |
| assigned_to.js | assigned_to | |
| u_business_owner.js | u_business_owner | |
| primary_portfolio.js | primary_portfolio | |
| u_functional_area.js | u_functional_area | |
| description.js | description | |
| start_date.js | start_date | yyyy-MM-dd HH:mm:ss |
| end_date.js | end_date | yyyy-MM-dd HH:mm:ss |
| state.js | state | |
| on_hold.js | on_hold | |
| u_sites.js | u_sites | |
| u_it_required.js | u_it_required | |
Also: correlation_id <- u_correlation_id (direct, Coalesce); delete the primary_program field map;
u_funding_type / u_project_category / priority / primary_goal: keep yours, with `return '';` above the last line.

## tasks_map/ -> Import Asana Project Tasks Transform Map
| File | Where | Setting |
|---|---|---|
| onBefore_order_100.js | Transform Scripts > onBefore, Order 100, Active | |
| onBefore_order_200.js | Transform Scripts > onBefore, Order 200, Active | |
| state.js | Field Maps > state | Choice action ignore |
| percent_complete.js | Field Maps > percent_complete | |
| work_start.js | Field Maps > work_start | Date format yyyy-MM-dd |
| work_end.js | Field Maps > work_end | Date format yyyy-MM-dd |
| assigned_to.js | Field Maps > assigned_to | Choice action ignore |
| description.js | Field Maps > description | |
Also: correlation_id <- u_correlation_id (direct, Coalesce); short_description <- u_task_name (direct).
Delete everything else on this map (start_date, end_date, additional_assignee_list, work_notes field maps; other scripts).
