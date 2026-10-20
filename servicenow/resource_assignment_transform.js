// Adaptive resources (RegularResourceLink: a person on a project or task) -> sn_plng_att_core_resource_assignment
// Transform Map "Import Adaptive Resources - Assignments": u_import_adaptive_resources -> sn_plng_att_core_resource_assignment
//   Field map: Use source script, Target field = task,     Coalesce = true -> PART A
//   Field map: Use source script, Target field = resource, Coalesce = true -> PART B
//   Field map: Use source script, Target field = start_date               -> PART C
//   Field map: Use source script, Target field = end_date                 -> PART D
//   Transform Scripts: onBefore                                           -> PART E
// Coalescing on task + resource means one assignment per person per project/task; re-runs update it.
// Target field names (task, resource, start_date, end_date): confirm in the table's dictionary.
// Staging columns used: u_project_correlation_id (the project or task), u_resource_email, u_start_date, u_end_date.
// This replaces PARTS B and C of resources_time_transform.js (assigned_to / project team).

// ---------- PART A: field map -> task ----------
answer = (function transformEntry(source) {
    var t = ['pm_project', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return gr.getUniqueValue();
    }
    return '';
})(source);

// ---------- PART B: field map -> resource ----------
answer = (function transformEntry(source) {
    var u = new GlideRecord('sys_user');
    return u.get('email', (source.u_resource_email + '').toLowerCase().trim()) ? u.getUniqueValue() : '';
})(source);

// ---------- PART C: field map -> start_date (Adaptive capacity start, else the project/task start) ----------
answer = (function transformEntry(source) {
    var v = (source.u_start_date + '').trim();
    if (v && v != 'undefined') return v;
    var t = ['pm_project', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return gr.getValue('start_date') || '';
    }
    return '';
})(source);

// ---------- PART D: field map -> end_date (Adaptive capacity end, else the project/task end) ----------
answer = (function transformEntry(source) {
    var v = (source.u_end_date + '').trim();
    if (v && v != 'undefined') return v;
    var t = ['pm_project', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return gr.getValue('end_date') || '';
    }
    return '';
})(source);

// ---------- PART E: onBefore - skip what cannot be assigned ----------
(function runTransformScript(source, map, log, target) {
    var t = ['pm_project', 'pm_project_task'], found = false;
    for (var i = 0; i < t.length && !found; i++) {
        var gr = new GlideRecord(t[i]);
        found = gr.get('correlation_id', source.u_project_correlation_id + '');
    }
    if (!found) { ignore = true; return; }                                  // project/task not migrated
    var email = (source.u_resource_email + '').toLowerCase().trim();
    var u = new GlideRecord('sys_user');
    if (!email || email == 'undefined' || !u.get('email', email)) {         // e.g. "Not Assigned" placeholder
        log.warn('No ServiceNow user for "' + source.u_resource_email + '" on ' + source.u_project_correlation_id + ' - skipped');
        ignore = true;
    }
})(source, map, log, target);
