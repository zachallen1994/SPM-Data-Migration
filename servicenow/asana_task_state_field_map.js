// SUPERSEDED by asana_tasks_transform.js (the complete Asana tasks map). Do not use.
// "Import Asana Project Tasks Transform Map" (u_import_asana_project_tasks -> pm_project_task)
// Fixes "Validate state mapped to bucket" (every Asana task refused in TEST): the old State script read
// u_project_status - a PROJECT column, empty on task rows - so it returned nothing ("undefined"), and it also used
// -5 Pending / 5 Investigating, which have no task state bucket. The Adaptive tasks load (which works) uses only
// 1 Open, 2 Work in Progress, 3 Closed Complete, 4 Closed Incomplete - same here.

// ---------- PART A: field map -> State (Use source script, Choice action = ignore) ----------
// Task columns: "Task Status" (u_task_status: Asana custom field, or "Completed") and "Completed" (u_completed true/false).
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var done = (source.getValue('u_completed') || '') == 'true';
    if (done || s == 'completed' || s == 'complete' || s == 'done') return '3';      // Closed Complete
    if (s.indexOf('cancel') == 0) return '4';                                         // Closed Incomplete
    if (s.indexOf('progress') > -1 || s == 'started' || s.indexOf('scoping') > -1 || s == 'delayed') return '2'; // Work in Progress
    return '1';                                                                       // Open (Not Started, On Hold, blank)
})(source);

// ---------- PART B: field map -> Actual start (work_start), Use source script, Date format yyyy-MM-dd ----------
// Asana has no actual dates. A task saved as Closed needs an actual start, or ServiceNow calculates one and can refuse
// the task ("Set Close Data On Inactive" - seen on Adaptive). Closed tasks: start date (else due date). Open: nothing.
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var closed = (source.getValue('u_completed') || '') == 'true' || s == 'completed' || s == 'complete' || s == 'done' || s.indexOf('cancel') == 0;
    if (!closed) return '';
    return (source.getValue('u_start_date') || source.getValue('u_due_date') || '').substring(0, 10);
})(source);

// ---------- PART C: field map -> Actual end (work_end), Use source script, Date format yyyy-MM-dd ----------
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var closed = (source.getValue('u_completed') || '') == 'true' || s == 'completed' || s == 'complete' || s == 'done' || s.indexOf('cancel') == 0;
    if (!closed) return '';
    return (source.getValue('u_due_date') || source.getValue('u_start_date') || '').substring(0, 10);
})(source);

// ---------- PART D: onBefore (Transform Scripts > New, When = onBefore, Order 200) - keep the Asana dates ----------
// Without a constraint the planning engine places a new task itself (seen: every Annual Enrollment subtask became
// 12-31-2026 05:00 PM, 0 seconds). Same approach as the Adaptive tasks: "Start on specific date" + the Asana dates.
// Dates at 08:00 / 17:00 so they do not shift a day (midnight UTC = the evening before in US time).
(function runTransformScript(source, map, log, target) {
    var s = (source.getValue('u_start_date') || '').substring(0, 10);
    var e = (source.getValue('u_due_date') || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) s = e;                   // Asana: often only a due date -> one-day task
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) e = s;
    if (!s) { log.warn('Asana task without dates (planning engine places it): ' + source.getValue('u_name')); return; }
    if (e < s) e = s;
    var gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
    var ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    target.time_constraint = 'start_on';
    if (target.isValidField('constraint_date')) target.constraint_date = gs0;
    target.start_date = gs0;
    target.end_date = ge;
})(source, map, log, target);
