// Adaptive resources (RegularResourceLink: a person on a project or task) -> sn_plng_att_core_resource_assignment
// Transform Map "Import Adaptive Resources - Assignments": u_import_adaptive_resources -> sn_plng_att_core_resource_assignment
//   Field map: Use source script, Target field = task,     Coalesce = true -> PART A
//   Field map: Use source script, Target field = user_resource, Coalesce = true -> PART B
//   Field map: Use source script, Target field = start_date, Date format yyyy-MM-dd HH:mm:ss -> PART C/D (FIELD = 'start')
//   Field map: Use source script, Target field = end_date,   Date format yyyy-MM-dd HH:mm:ss -> PART C/D (FIELD = 'end')
//   Field map: Use source script, Target field = operational_work_type (MANDATORY) -> PART F
//   Field map: Use source script, Target field = effort (hours)                    -> PART G
//   Transform Scripts: onBefore                                           -> PART E
// Coalescing on task + resource means one assignment per person per project/task; re-runs update it.
// Target fields (confirmed in the dictionary): task, user_resource, start_date, end_date, operational_work_type
// (start_date, end_date and operational_work_type are mandatory).
// Staging columns used: u_project_correlation_id (the project or task), u_resource_email, u_resource_name, u_start_date, u_end_date, u_added_on.
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
    if (email && email != 'undefined' && (u.addQuery('email', email), u.orderByDesc('active'), u.setLimit(1), u.query(), u.next())) return u.getUniqueValue();
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

// ---------- PART C: field map -> start_date ----------
// ---------- PART D: field map -> end_date ----------
// ONE script for both field maps: set FIELD = 'start' in the start_date map and FIELD = 'end' in the end_date map.
// Rule "Validate start end dates of assignments" (sn_plng_att_core) refuses an assignment whose start is before the
// task's (or project's) start, whose end is after its end, or whose end is before its start. So both dates are kept
// INSIDE the parent's dates:
//   start = Adaptive Start Date, else Added On (Adaptive "Created On" of the link), else the parent start
//   end   = Adaptive end (InactiveDate), else the parent end
//   then: start >= parent start, end <= parent end, start <= end (else start = parent start)
answer = (function transformEntry(source) {
    var FIELD = 'start';                                   // ✏️ 'start' in the start_date map, 'end' in the end_date map
    function d(v) { v = (v + '').trim().substring(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
    var ps = '', pe = '';
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length && !ps; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_project_correlation_id + '')) {
            // local date (yyyy-MM-dd in the user's time zone, as the rule compares) - not getDisplayValue(), whose
            // format follows the user's preference (e.g. 11-19-2026)
            if (!gr.start_date.nil()) ps = d(gr.start_date.getGlideObject().getLocalDate().getValue());
            if (!gr.end_date.nil()) pe = d(gr.end_date.getGlideObject().getLocalDate().getValue());
        }
    }
    var start = d(source.u_start_date) || d(source.u_added_on) || ps;
    var end = d(source.u_end_date) || pe;
    if (ps && start < ps) start = ps;
    if (pe && end > pe) end = pe;
    if (pe && start > pe) start = ps;
    if (end && start > end) start = ps && ps <= end ? ps : end;
    // NOON, not midnight: a bare date is saved as 00:00 UTC = the evening BEFORE in US time, so an assignment starting on
    // the task's first day came out one day early and "Validate start end dates of assignments" refused it.
    // Field map Date format for both maps: yyyy-MM-dd HH:mm:ss
    var v = FIELD == 'end' ? end : start;
    return v ? v + ' 12:00:00' : '';
})(source);

// ---------- PART E: onBefore - skip what cannot be assigned ----------
(function runTransformScript(source, map, log, target) {
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'], found = false;
    for (var i = 0; i < t.length && !found; i++) {
        var gr = new GlideRecord(t[i]);
        found = gr.get('correlation_id', source.u_project_correlation_id + '');
    }
    if (!found) { ignore = true; return; }                                  // project/task not migrated
    if (gr.start_date.nil() || gr.end_date.nil()) {                          // the dates rule refuses these
        log.warn('No start / end date on ' + gr.getDisplayValue() + ' - assignment of ' + source.u_resource_name + ' skipped');
        ignore = true; return;
    }
    // same lookup as PART B (email, same mailbox on another domain, unique active name)
    var email = (source.getValue('u_resource_email') || '').toLowerCase().trim();
    var name = (source.getValue('u_resource_name') || '').trim();
    var ok = false, u = new GlideRecord('sys_user');
    if (email && email != 'undefined' && (u.addQuery('email', email), u.orderByDesc('active'), u.setLimit(1), u.query(), u.next())) ok = true;
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

// ---------- PART G: field map -> effort (hours) = Adaptive "Total Project Assignment" (Resource Planning View) ----------
// Staging columns "Total Assignment" (TotalAssignment, hours), fallback "Work". ServiceNow then creates the
// allocations (resource_allocation / _daily) by spreading the effort over start_date..end_date - the weekly hours.
answer = (function transformEntry(source) {
    var h = parseFloat(source.getValue('u_total_assignment'));
    if (isNaN(h) || h <= 0) h = parseFloat(source.getValue('u_work'));
    if (isNaN(h) || h <= 0) return '';
    return String(Math.round(h * 100) / 100);
})(source);
