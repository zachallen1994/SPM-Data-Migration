// People and hours from Adaptive.
// Source of people: Adaptive RegularResourceLink (one row per person per task or project), loaded by the
// "Adaptive Resources - API" Data Source into u_import_adaptive_resources.
// Source of hours: Adaptive Task.ActualEffort (already aggregated by Adaptive), loaded with the tasks.
// These maps only UPDATE records that already exist; they never create tasks or projects.
//
// Map 1 "Import Adaptive Resources - Tasks":    u_import_adaptive_resources -> pm_project_task
//   Field map: Use source script, Target field = correlation_id, Coalesce = true -> PART A
//   Transform Scripts: onBefore -> PART B
// Map 2 "Import Adaptive Resources - Projects": u_import_adaptive_resources -> pm_project   (Order 200)
//   Field map: Use source script, Target field = correlation_id, Coalesce = true -> PART A
//   Transform Scripts: onBefore -> PART C
// Existing "Import Adaptive Project Tasks Transform Map":
//   Field map: Use source script, Target field = work_effort (Actual effort) -> PART D
//
// Staging columns used: u_project_correlation_id (the task or project the person is on), u_resource_email,
// u_actual_effort (hours, on the tasks staging table).

// ---------- PART A: field map -> correlation_id (Maps 1 and 2) ----------
answer = (function transformEntry(source) {
    return source.u_project_correlation_id + '';
})(source);

// ---------- PART B: onBefore, people on TASKS (Map 1) ----------
(function runTransformScript(source, map, log, target) {
    if (action == 'insert') { ignore = true; return; }                  // not a migrated task (or a project link)
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

// ---------- PART C: onBefore, project TEAM on PROJECTS (Map 2) ----------
(function runTransformScript(source, map, log, target) {
    if (action == 'insert') { ignore = true; return; }                  // not a migrated project (or a task link)
    var u = new GlideRecord('sys_user');
    if (!u.get('email', (source.u_resource_email + '').toLowerCase())) {
        log.warn('No user for ' + source.u_resource_email + ' on ' + source.u_project_correlation_id);
        ignore = true;
        return;
    }
    var id = u.getUniqueValue();
    if (target.project_manager + '' == id) return;                       // already the PM
    var list = (target.additional_assignee_list + '').split(',').filter(function (x) { return x; });
    if (list.indexOf(id) < 0) list.push(id);
    target.additional_assignee_list = list.join(',');
})(source, map, log, target);

// ---------- PART D: field map on the TASKS map -> Actual effort ----------
// Adaptive Actual Effort arrives in hours; duration fields store a duration value.
answer = (function transformEntry(source) {
    var hours = parseFloat(source.u_actual_effort) || 0;
    return hours ? new GlideDuration(hours * 3600 * 1000).getValue() : '';
})(source);
