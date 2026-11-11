// Adaptive resources (RegularResourceLink: a person on a project or task) -> sn_plng_att_core_resource_assignment
// Transform Map "Import Adaptive Resources - Assignments": u_import_adaptive_resources -> sn_plng_att_core_resource_assignment
//   Field map: Use source script, Target field = task,     Coalesce = true -> PART A
//   Field map: Use source script, Target field = user_resource, Coalesce = true -> PART B
//   Field map: Use source script, Target field = start_date, Date format yyyy-MM-dd -> PART C
//   Field map: Use source script, Target field = end_date,   Date format yyyy-MM-dd -> PART D
//   Field map: Use source script, Target field = operational_work_type (MANDATORY) -> PART F
//   Transform Scripts: onBefore                                           -> PART E
// Coalescing on task + resource means one assignment per person per project/task; re-runs update it.
// Target fields (confirmed in the dictionary): task, user_resource, start_date, end_date, operational_work_type
// (start_date, end_date and operational_work_type are mandatory).
// Staging columns used: u_project_correlation_id (the project or task), u_resource_email, u_resource_name, u_start_date, u_end_date.
// This replaces PARTS B and C of resources_time_transform.js (assigned_to / project team).

// ---------- PART A: field map -> task ----------
answer = (function transformEntry(source) {
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return gr.getUniqueValue();
    }
    return '';
})(source);

// ---------- PART B: field map -> user_resource ----------
// Email first; then the name (Adaptive "Joe Smith" = one active ServiceNow user of that name). Adaptive emails can be
// on another domain than the ServiceNow user (e.g. @bshsi.org vs @bsmhealth.org) - the name match covers that.
answer = (function transformEntry(source) {
    var email = (source.getValue('u_resource_email') || '').toLowerCase().trim();
    var name = (source.getValue('u_resource_name') || '').trim();
    var u = new GlideRecord('sys_user');
    if (email && email != 'undefined' && u.get('email', email)) return u.getUniqueValue();
    if (email && email.indexOf('@') > 0) {                     // same mailbox name, other domain
        u = new GlideRecord('sys_user');
        u.addQuery('email', 'STARTSWITH', email.split('@')[0] + '@');
        u.addQuery('active', true);
        u.query();
        if (u.getRowCount() == 1 && u.next()) return u.getUniqueValue();
    }
    if (name && name != 'undefined') {
        u = new GlideRecord('sys_user');
        u.addQuery('name', name);
        u.addQuery('active', true);
        u.query();
        if (u.getRowCount() == 1 && u.next()) return u.getUniqueValue();
    }
    return '';
})(source);

// ---------- PART C: field map -> start_date (Adaptive capacity start, else the project/task start) ----------
answer = (function transformEntry(source) {
    var v = (source.u_start_date + '').trim();
    if (v && v != 'undefined') return v;
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return (gr.getValue('start_date') || '').substring(0, 10);
    }
    return '';
})(source);

// ---------- PART D: field map -> end_date (Adaptive capacity end, else the project/task end) ----------
answer = (function transformEntry(source) {
    var v = (source.u_end_date + '').trim();
    if (v && v != 'undefined') return v;
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) return (gr.getValue('end_date') || '').substring(0, 10);
    }
    return '';
})(source);

// ---------- PART E: onBefore - skip what cannot be assigned ----------
(function runTransformScript(source, map, log, target) {
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'], found = false;
    for (var i = 0; i < t.length && !found; i++) {
        var gr = new GlideRecord(t[i]);
        found = gr.get('correlation_id', source.u_project_correlation_id + '');
    }
    if (!found) { ignore = true; return; }                                  // project/task not migrated
    // same lookup as PART B (email, same mailbox on another domain, unique active name)
    var email = (source.getValue('u_resource_email') || '').toLowerCase().trim();
    var name = (source.getValue('u_resource_name') || '').trim();
    var ok = false, u = new GlideRecord('sys_user');
    if (email && email != 'undefined' && u.get('email', email)) ok = true;
    if (!ok && email.indexOf('@') > 0) {
        u = new GlideRecord('sys_user'); u.addQuery('email', 'STARTSWITH', email.split('@')[0] + '@'); u.addQuery('active', true); u.query();
        ok = u.getRowCount() == 1;
    }
    if (!ok && name && name != 'undefined') {
        u = new GlideRecord('sys_user'); u.addQuery('name', name); u.addQuery('active', true); u.query();
        ok = u.getRowCount() == 1;
    }
    if (!ok) {                                                              // e.g. "Not Assigned" placeholder
        log.warn('No ServiceNow user for ' + name + ' <' + email + '> on ' + source.u_project_correlation_id + ' - skipped');
        ignore = true;
    }
})(source, map, log, target);

// ---------- PART F: field map -> operational_work_type (mandatory) ----------
// ✏️ VALUE = the choice value the implementation team picks for migrated assignments.
answer = (function transformEntry(source) {
    var VALUE = '';
    return VALUE;
})(source);
