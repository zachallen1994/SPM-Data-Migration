// =====================================================================================================================
// "Import Asana Project Tasks Transform Map"  (u_import_asana_project_tasks -> pm_project_task)
// THE COMPLETE MAP - every field map and transform script, nothing else needed. Spec: docs/16_asana_scope_and_mapping.md
// Replaces asana_task_state_field_map.js. Data source: asana_data_source.js (MODE 'tasks', version 2026-11-24a).
//
// What the data source sends per row (Project Warren example):
//   sections (HRTS, Benefits, ...)  -> a task under the project
//   tasks                            -> under their section (or the project when the section is "Untitled")
//   subtasks (every level)           -> under their parent task
//   Start Date = Asana start date, else the custom "Start Date" field; Due Date; Task Status = "PMO Status" /
//   "Task Status"; Completed (true/false); "% Complete" (custom field, e.g. 50% / 0.5); Assignee Email; "Assigned To"
//   (free text, e.g. "Billie"); Notes.
//
// CHECKLIST - the map must have exactly these (delete any other field map / script on this map):
//   Field map  u_correlation_id -> correlation_id        direct, Coalesce = true
//   Field map  u_task_name      -> short_description     direct   (task name column)
//   Field map  [script] -> state                         PART C
//   Field map  [script] -> percent_complete              PART D
//   Field map  [script] -> work_start                    PART E   Date format yyyy-MM-dd
//   Field map  [script] -> work_end                      PART F   Date format yyyy-MM-dd
//   Field map  [script] -> assigned_to                   PART G   Choice action ignore
//   Field map  [script] -> description                   PART H
//   Transform script onBefore Order 100                  PART A   (project + parent)
//   Transform script onBefore Order 200                  PART B   (planned dates)
//   NO field maps for start_date / end_date / top_task / parent (PART A / B set them).
// =====================================================================================================================

// ---------- PART A: onBefore, Order 100 - project and parent ----------
(function runTransformScript(source, map, log, target) {
    var project = new GlideRecord('pm_project');
    if (!project.get('correlation_id', source.getValue('u_project_correlation_id'))) {
        log.warn('Asana project not migrated: ' + source.getValue('u_project_correlation_id') + ' - task skipped: ' + (source.getValue('u_task_name') || source.getValue('u_name')));
        ignore = true;
        return;
    }
    target.top_task = project.getUniqueValue();
    var parent = new GlideRecord('pm_project_task');
    if (parent.get('correlation_id', source.getValue('u_parent_correlation_id')) && parent.getUniqueValue() != target.getUniqueValue())
        target.parent = parent.getUniqueValue();                 // under a section or a parent task
    else
        target.parent = project.getUniqueValue();                // top level
})(source, map, log, target);

// ---------- PART B: onBefore, Order 200 - planned dates (new tasks only) ----------
// "Start on specific date" + the Asana dates, else the planning engine moves the task (seen: all on 12-31-2026).
// 08:00 / 17:00 so the day does not shift (midnight UTC = the evening before in US time). Only a due date -> one-day
// task. No dates at all (sections, many Warren tasks) -> left to ServiceNow (they follow their subtasks / project).
(function runTransformScript(source, map, log, target) {
    if (!target.isNewRecord()) return;                           // existing tasks: "Disable the Change of Planned Dates"
    var s = (source.getValue('u_start_date') || '').substring(0, 10);
    var e = (source.getValue('u_due_date') || '').substring(0, 10);
    var ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(s)) s = ok.test(e) ? e : '';
    if (!ok.test(e)) e = s;
    if (!s) return;
    if (e < s) e = s;
    var gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
    var ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    target.time_constraint = 'start_on';
    if (target.isValidField('constraint_date')) target.constraint_date = gs0;
    target.start_date = gs0;
    target.end_date = ge;
})(source, map, log, target);

// ---------- PART C: field map -> state (Use source script, Choice action ignore) ----------
// Task states with a state bucket only: 1 Open, 2 Work in Progress, 3 Closed Complete, 4 Closed Incomplete.
// Completed box ticked, or PMO/Task Status exactly "Complete(d)" -> Closed Complete. "In Progress, Complete" with the
// box NOT ticked -> Work in Progress.
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');
    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\s*\(closed\)/i.test(nm)) return '3';
    if (s.indexOf('cancel') > -1) return '4';
    if (s.indexOf('progress') > -1 || s.indexOf('started/') > -1 || s.indexOf('scoping') > -1 || s.indexOf('delayed') > -1) return '2';
    return '1';
})(source);

// ---------- PART D: field map -> percent_complete (Use source script) ----------
// Asana "% Complete" ("50%" or 0.5) -> 50. Closed Complete -> 100. Nothing -> blank (ServiceNow keeps 0).
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');
    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\s*\(closed\)/i.test(nm)) return '100';
    var col = '';
    var d = new GlideRecord('sys_dictionary');               // the "% Complete" column, found by its label
    d.addQuery('name', source.getTableName()); d.addQuery('column_label', '% Complete'); d.query();
    if (d.next()) col = d.getValue('element');
    var raw = col ? (source.getValue(col) || '').trim() : '';
    if (!raw || raw == 'undefined') return '';
    var n = parseFloat(raw.replace('%', ''));
    if (isNaN(n)) return '';
    if (raw.indexOf('%') < 0 && n <= 1) n = n * 100;         // 0.5 -> 50
    return String(Math.max(0, Math.min(100, Math.round(n))));
})(source);

// ---------- PART E: field map -> work_start (Actual start), Date format yyyy-MM-dd ----------
// Closed tasks need an actual start (else "Set Close Data On Inactive" refuses them): planned start, else due date.
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var closed = (source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || s.indexOf('cancel') > -1 ||
        /^\s*\(closed\)/i.test(source.getValue('u_task_name') || source.getValue('u_name') || '');
    if (!closed) return '';
    return (source.getValue('u_start_date') || source.getValue('u_due_date') || '').substring(0, 10);
})(source);

// ---------- PART F: field map -> work_end (Actual end), Date format yyyy-MM-dd ----------
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var closed = (source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || s.indexOf('cancel') > -1 ||
        /^\s*\(closed\)/i.test(source.getValue('u_task_name') || source.getValue('u_name') || '');
    if (!closed) return '';
    return (source.getValue('u_due_date') || source.getValue('u_start_date') || '').substring(0, 10);
})(source);

// ---------- PART G: field map -> assigned_to (Use source script, Choice action ignore) ----------
// The Asana ASSIGNEE (a person, e.g. Tricia Figg plfigg@mercy.com) matched by email, active user first.
// The free-text "Assigned To" field (e.g. "Billie", "IT") is not a user - it goes into the description (PART H).
answer = (function transformEntry(source) {
    var em = (source.getValue('u_assignee_email') || '').toLowerCase().trim();
    if (!em || em == 'undefined') return '';
    var u = new GlideRecord('sys_user');
    u.addQuery('email', em); u.orderByDesc('active'); u.setLimit(1); u.query();
    if (u.next()) return u.getUniqueValue();
    log.warn('Asana task assignee ' + em + ' has no ServiceNow user - left blank on ' + (source.getValue('u_task_name') || source.getValue('u_name')));
    return '';
})(source);

// ---------- PART H: field map -> description (Use source script) ----------
answer = (function transformEntry(source) {
    function v(c) { var x = source.isValidField(c) ? (source.getValue(c) || '').trim() : ''; return x == 'undefined' ? '' : x; }
    var col = '';
    var d = new GlideRecord('sys_dictionary');               // the free-text "Assigned To" column, found by its label
    d.addQuery('name', source.getTableName()); d.addQuery('column_label', 'Assigned To'); d.query();
    if (d.next()) col = d.getValue('element');
    var lines = [];
    if (v('u_notes')) lines.push(v('u_notes'));
    if (col && v(col)) lines.push('Assigned To (Asana): ' + v(col));
    if (v('u_task_status')) lines.push('Asana status: ' + v('u_task_status'));
    return lines.join('\n');
})(source);
