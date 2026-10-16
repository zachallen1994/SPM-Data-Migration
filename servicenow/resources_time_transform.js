// People and hours on project tasks (Adaptive). Both maps UPDATE existing tasks only.
//
// Map 1 "Import Adaptive Resources": u_import_adaptive_resources -> pm_project_task
//   Field map: Use source script = true, Target field = correlation_id, Coalesce = true -> PART A
//   Transform Scripts: onBefore -> PART B
// Map 2 "Import Adaptive Time": u_import_adaptive_time -> pm_project_task
//   Field map: Use source script = true, Target field = correlation_id, Coalesce = true -> PART A
//   Transform Scripts: onBefore -> PART C
//
// Staging columns used: u_project_correlation_id (the task), u_resource_email, u_total_hours.

// ---------- PART A: field map -> correlation_id (both maps) ----------
answer = (function transformEntry(source) {
    return source.u_project_correlation_id + '';
})(source);

// ---------- PART B: onBefore, resources ----------
(function runTransformScript(source, map, log, target) {
    if (action == 'insert') { ignore = true; return; }                  // never create tasks
    var u = new GlideRecord('sys_user');
    if (!u.get('email', (source.u_resource_email + '').toLowerCase())) {
        log.warn('No user for ' + source.u_resource_email + ' on ' + source.u_project_correlation_id);
        ignore = true;
        return;
    }
    var id = u.getUniqueValue();
    if (!target.assigned_to) { target.assigned_to = id; return; }        // first person
    if (target.assigned_to + '' == id) return;
    var list = (target.additional_assignee_list + '').split(',').filter(function (x) { return x; });
    if (list.indexOf(id) < 0) list.push(id);                             // everyone else
    target.additional_assignee_list = list.join(',');
})(source, map, log, target);

// ---------- PART C: onBefore, time ----------
(function runTransformScript(source, map, log, target) {
    if (action == 'insert') { ignore = true; return; }                  // never create tasks
    var ACTUAL_EFFORT_FIELD = 'work_effort';   // ✏️ confirm the "Actual effort" field name in the pm_project_task dictionary
    var hours = parseFloat(source.u_total_hours) || 0;
    target[ACTUAL_EFFORT_FIELD].setDateNumericValue(hours * 3600 * 1000);   // duration field, in milliseconds
})(source, map, log, target);
