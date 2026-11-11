// "Import Adaptive Project Tasks Transform Map": u_import_adaptive_project_tasks -> pm_project_task
// PART A also works unchanged for the Asana tasks map (u_import_asana_project_tasks -> pm_project_task).
//   Field map: correlation_id <- u_correlation_id, Coalesce = true
//   Transform Scripts: onBefore, Order 100 -> PART A (project + parent)   - TWO separate onBefore scripts:
//   Field map: Status, Use source script, Choice action = ignore -> PART B
//   Field map: state, Use source script                           -> PART C
//   Field map: assigned_to, Use source script                     -> PART D
//   Transform Scripts: onBefore, Order 300 -> PART G (Planned effort from "Planned Effort" column, hours)
//   Transform Scripts: onComplete          -> PART F (only with FAST_LOAD; no fix script needed)
//   Transform Scripts: onBefore, Order 200 -> PART E (time constraint + constraint date from Adaptive; ASAP kept as
//                                             "Start on specific date" so the dates stay - see ASAP_AS_ASAP)
//   Direct field maps (add the staging columns if missing):
//     u_description -> description,   percent_complete: script field map -> PART H,
//     u_start_date (Start Date) -> start_date, u_due_date (Due Date) -> end_date (Date format yyyy-MM-dd),
//     u_actual_start_date -> work_start, u_actual_end_date -> work_end (Date format yyyy-MM-dd)
// The data source writes parents before children, so ONE transform run links every task to its parent.
// (A second run is harmless - updates only, thanks to the coalesce - and fixes any task whose parent came later.)

// ---------- PART A: onBefore - project and parent ----------
(function runTransformScript(source, map, log, target) {
    var project = new GlideRecord('pm_project');
    if (!project.get('correlation_id', source.u_project_correlation_id + '')) {
        log.warn('Project not migrated: ' + source.u_project_correlation_id + ' - task skipped: ' + source.u_name);
        ignore = true;
        return;
    }
    target.top_task = project.getUniqueValue();
    var parent = new GlideRecord('pm_project_task');
    if (parent.get('correlation_id', source.u_parent_correlation_id + '') && parent.getUniqueValue() != target.getUniqueValue())
        target.parent = parent.getUniqueValue();                 // under another task
    else
        target.parent = project.getUniqueValue();                // top level (or parent not loaded yet - 2nd run fixes it)
})(source, map, log, target);

// ---------- PART B: field map -> Status ----------
answer = (function transformEntry(source) {
    // letters only, so "On Track", "OnTrack" and "on-track" all match
    var s = (source.u_status + '').toLowerCase().replace(/[^a-z]/g, '');
    // Seen in Dev: On Track, Off Track, blank. Choices on the field: green, yellow, red, no_status.
    var colorMap = { 'ontrack': 'green', 'atrisk': 'yellow', 'offtrack': 'red' };
    if (!s) return 'no_status';                                   // blank in Adaptive (otherwise the field default shows Red)
    if (!colorMap[s]) { log.warn('Unmapped Adaptive task status: ' + source.u_status); return 'no_status'; }
    return colorMap[s];
})(source);

// ---------- PART C: field map -> state ----------
// Adaptive task State: Draft | Active | On Hold | Completed | Cancelled. -5 Pending is inactive here, so Draft -> Open.
answer = (function transformEntry(source) {
    var map = { 'draft': '1', 'active': '2', 'on hold': '1', 'completed': '3', 'cancelled': '4' };
    var s = (source.u_task_state + '').toLowerCase().trim();
    if (s == 'undefined' || s == 'null') s = '';                  // no State column in staging: add it (label "State")
    if (s && !map[s]) log.warn('Unmapped Adaptive task state: ' + source.u_task_state);
    return map[s] || '1';
})(source);

// ---------- PART D: field map -> assigned_to (Adaptive "Owner", matched by email) ----------
answer = (function transformEntry(source) {
    var email = (source.u_owner_email + '').toLowerCase().trim();
    if (!email || email == 'undefined' || email == 'null') return '';
    var u = new GlideRecord('sys_user');
    if (u.get('email', email)) return u.getUniqueValue();
    log.warn('No ServiceNow user for task owner ' + email + ' on ' + source.u_correlation_id);
    return '';
})(source);

// ---------- PART E: onBefore - keep the Adaptive Schedule Start / Finish ----------
// With "Start ASAP" (the default) ServiceNow moves every task to the project start, because the Adaptive
// predecessors are not migrated. "Start on specific date" keeps the task's own Schedule Start (start_date field map).
(function runTransformScript(source, map, log, target) {
    var OVERRIDE_STATUS = true;   // ✏️ implementation team decides: true = keep Adaptive's Status; false = ServiceNow calculates it
    // Constraint from Adaptive: C_ConstraintType (custom) when filled, else SchedulingType ("Constraint Type").
    // Choices on time_constraint: asap | start_on | snet (start no earlier than) | snlt (start no later than).
    // As Soon As Possible -> start_on by default: Adaptive predecessors are not migrated, so "Start ASAP" would move
    // the task to the project start (wrong dates). Set ASAP_AS_ASAP = true only if the team accepts that.
    var ASAP_AS_ASAP = false;
    var raw = ((source.getValue('u_custom_constraint_type') || '') || (source.getValue('u_constraint_type') || '')).toLowerCase();
    var cdate = (source.getValue('u_constraint_date') || '').substring(0, 10);
    var tc = 'start_on';
    if (/no earlier/.test(raw) && /start/.test(raw)) tc = 'snet';
    else if (/no later/.test(raw) && /start/.test(raw)) tc = 'snlt';
    else if (/must start|start on/.test(raw)) tc = 'start_on';
    else if (/as soon/.test(raw) || raw == 'asap') tc = ASAP_AS_ASAP ? 'asap' : 'start_on';
    else if (raw && raw != 'undefined') log.warn('Adaptive constraint "' + raw + '" has no ServiceNow match - Start on specific date used: ' + source.u_name);
    target.time_constraint = tc;
    // Constraint date: Adaptive's own, else the task's Schedule Start (keeps the date for start_on / snet / snlt)
    var cd = cdate || (source.getValue('u_start_date') || '').substring(0, 10);
    if (tc != 'asap' && /^\d{4}-\d{2}-\d{2}$/.test(cd) && target.isValidField('constraint_date')) {
        var g = new GlideDateTime(); g.setDisplayValue(cd + ' 00:00:00', 'yyyy-MM-dd HH:mm:ss');
        target.constraint_date = g;
    }
    // Keep Adaptive's Status (PART B): without "Override status" ServiceNow recalculates it (e.g. Red on a past date)
    if (OVERRIDE_STATUS && (source.u_status + '').trim() && target.isValidField('override_status')) target.override_status = true;
    // FAST LOAD (implementation team decides): skip the planning rules while loading - about 6 s per task with them.
    // The rules check run_calc_brs; it is stored on the task, so fix_scripts/tasks_fast_load_finish.js MUST run after
    // the load (sets it back to true and recalculates each project once).
    var FAST_LOAD = false;        // ✏️ true = fast load
    if (FAST_LOAD && target.isValidField('run_calc_brs')) target.run_calc_brs = false;
})(source, map, log, target);

// ---------- PART F: onComplete - finish a FAST_LOAD (replaces fix_scripts/tasks_fast_load_finish.js) ----------
// Only needed when PART E has FAST_LOAD = true. Runs ONCE when the transform ends: for every project in this
// import set, turns the planning rules back on for its migrated tasks and recalculates the project once.
// Works for the Adaptive and the Asana tasks maps (both staging tables have "Project Correlation ID").
(function runTransformScript(source, map, log, target) {
    var FAST_LOAD = false;                      // ✏️ same value as in PART E
    if (!FAST_LOAD) return;
    var projects = {};
    var r = new GlideRecord(map.source_table + '');
    r.addQuery('sys_import_set', import_set.sys_id + '');
    r.query();
    while (r.next()) {
        var p = new GlideRecord('pm_project');
        var id = r.getValue('u_project_correlation_id');
        if (id && !projects[id] && p.get('correlation_id', id)) projects[id] = p.getUniqueValue();
    }
    var done = 0;
    for (var k in projects) {
        var pid = projects[k];
        var t = new GlideRecord('pm_project_task');
        t.addQuery('top_task', pid);
        t.addQuery('run_calc_brs', false);
        t.query();
        while (t.next()) { t.setWorkflow(false); t.setValue('run_calc_brs', true); t.update(); }
        try { new SNC.PlannedTaskAPI().recalculateTask(pid); }
        catch (e) { var pr = new GlideRecord('pm_project'); if (pr.get(pid)) { pr.setForceUpdate(true); pr.update(); } }
        done++;
    }
    log.info('FAST_LOAD finished: planning rules back on and recalculated for ' + done + ' projects');
})(source, map, log, target);

// ---------- PART G: onBefore (Order 300) -> effort (Planned effort) from Adaptive "Assigned Resource Effort" ----------
// Adaptive Work comes in as hours (staging column "Planned Effort"). Set directly as a duration (milliseconds) - a
// field map with a duration string can silently give 0. Parent tasks: ServiceNow rolls effort up from the children.
// (Replaces the earlier PART G field map - delete that field map if it exists.)
(function runTransformScript(source, map, log, target) {
    var raw = source.getValue('u_planned_effort');
    var h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    if (!target.isValidField('effort')) { log.warn('No effort field on project task'); return; }
    target.effort.setDateNumericValue(Math.round(h * 3600000));
})(source, map, log, target);

// ---------- PART H: field map -> percent_complete (Adaptive "Schedule % Complete") ----------
// Bottom-level tasks only: parent tasks are calculated from their children in ServiceNow (and in Adaptive, the "?"),
// and sending a value to a parent can trip "Validate Percent Complete". Whole number, 0-100. Blank = leave as is.
answer = (function transformEntry(source) {
    var v = parseFloat(source.getValue('u_schedule___complete'));
    if (isNaN(v)) return '';
    var kids = new GlideRecord(source.getTableName());                   // children of this task in the same load
    kids.addQuery('sys_import_set', source.getValue('sys_import_set'));
    kids.addQuery('u_parent_correlation_id', source.getValue('u_correlation_id'));
    kids.setLimit(1);
    kids.query();
    if (kids.hasNext()) return '';                                        // parent task: ServiceNow calculates it
    return String(Math.max(0, Math.min(100, Math.round(v))));
})(source);
