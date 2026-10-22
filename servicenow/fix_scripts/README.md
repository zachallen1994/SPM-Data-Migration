# Fix scripts (change data)

Run as **System Definition > Fix Scripts**. Each starts with `DRY_RUN = true`: run it once like that, read the
log, then set `DRY_RUN = false` and run again.

| Script | What it does |
|---|---|
| attachments_fix_script.js | Copies Asana / Adaptive files onto the migrated records (run last). `ONLY` = test on a few records. |
| fix_truncated_adaptive_ids.js | Repairs Adaptive correlation ids cut off at 40 characters (lists duplicates, never deletes). |
| timecards_set_processed.js | Sets migrated time cards to Processed so hours roll up (after the manual test works). |
