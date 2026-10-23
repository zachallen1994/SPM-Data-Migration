// "Import Adaptive Project Tasks Transform Map": u_import_adaptive_project_tasks -> pm_project_task
// PART A also works unchanged for the Asana tasks map (u_import_asana_project_tasks -> pm_project_task).
//   Field map: correlation_id <- u_correlation_id, Coalesce = true
//   Transform Scripts: onBefore, Order 100 -> PART A (project + parent)   - TWO separate onBefore scripts:
//   Field map: Status, Use source script, Choice action = ignore -> PART B
//   Field map: state, Use source script                           -> PART C
//   Field map: assigned_to, Use source script                     -> PART D
//   Transform Scripts: onBefore, Order 200 -> PART E (keep Adaptive's dates: "Start on specific date", not "Start ASAP")
//   Direct field maps (add the staging columns if missing):
//     u_description -> description, u_complete (% Complete) -> percent_complete,
//     u_start_date (Start Date) -> start_date, u_due_date (Due Date) -> end_date (Date format yyyy-MM-dd),
//     u_actual_start_date -> work_start, u_actual_end_date -> work_end (Date format yyyy-MM-dd)
// Run the transform TWICE: rows arrive in any order, so a child can come before its parent task exists.
// The second run (updates only, thanks to the coalesce) puts every task under the right parent.

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
    var s = (source.u_state + '').toLowerCase().trim();
    if (s == 'undefined' || s == 'null') s = '';                  // no State column in staging: add it (label "State")
    if (s && !map[s]) log.warn('Unmapped Adaptive task state: ' + source.u_state);
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
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'IN', 'planned_task,pm_project_task');
    c.addQuery('element', 'time_constraint');
    c.addQuery('label', 'CONTAINS', 'specific');
    c.query();
    if (!c.next()) { log.error('No "Start on specific date" choice on time_constraint - dates follow the project start'); return; }
    target.time_constraint = c.getValue('value');   // the start_date / end_date field maps then set the dates
})(source, map, log, target);
