# Fix scripts (change data)

Run as **System Definition > Fix Scripts**. Each starts with `DRY_RUN = true`: run it once like that, read the
log, then set `DRY_RUN = false` and run again.

| Script | What it does |
|---|---|
| attachments_fix_script.js | Copies Asana / Adaptive files onto the migrated records (run last). `ONLY` = test on a few records. |
| fix_truncated_adaptive_ids.js | Repairs Adaptive correlation ids cut off at 40 characters (lists duplicates, never deletes). |
| timecards_set_processed.js | Moves migrated time cards Pending -> Submitted -> Approved so hours roll up. Test with ONLY_TASK + LIMIT = 1 first. |
| out_of_scope_cleanup.js | Dev clean-up: deletes migrated projects / demands no longer in scope in Adaptive (State, Type) and the records under them, MAX per run. |
| tasks_fast_load_finish.js | After a FAST_LOAD task load: turns the planning rules back on for migrated tasks and recalculates each project. |
