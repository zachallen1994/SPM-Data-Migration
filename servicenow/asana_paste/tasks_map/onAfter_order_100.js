// Import Asana Project Tasks Transform Map > Transform Scripts > NEW: When = onAfter, Order 100, Active.
// On INSERT the planning engine sets planned end = planned start (duration 0) - seen: Nayya Jun 15 -> Jun 15 instead
// of Oct 1. A save right after insert keeps the dates (same fix as the projects). Also: ServiceNow stamps Actual start
// = "now" on tasks loaded as Work in Progress - set it to the planned start instead (Asana has no actual dates).
//   own Asana dates -> those | none -> the parent task's dates | parent has none -> the project's dates
(function runTransformScript(source, map, log, target) {
    if (action != 'insert') return;
    var t = new GlideRecord('pm_project_task');
    if (!t.get(target.getUniqueValue())) return;
    var ok = /^\d{4}-\d{2}-\d{2}$/;
    var s = (source.getValue('u_start_date') || '').substring(0, 10), e = (source.getValue('u_due_date') || '').substring(0, 10);
    if (!ok.test(s)) s = ok.test(e) ? e : '';
    if (!ok.test(e)) e = s;
    var gs0, ge;
    if (s) {
        if (e < s) e = s;
        gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
        ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    } else {
        var from = null, p = new GlideRecord('pm_project_task');
        if (!t.parent.nil() && p.get(t.getValue('parent')) && !p.start_date.nil() && !p.end_date.nil() && p.getValue('end_date') > p.getValue('start_date')) from = p;
        if (!from) { var pr = new GlideRecord('pm_project'); if (pr.get(t.getValue('top_task')) && !pr.start_date.nil() && !pr.end_date.nil()) from = pr; }
        if (!from) return;
        gs0 = new GlideDateTime(from.getValue('start_date'));
        ge = new GlideDateTime(from.getValue('end_date'));
    }
    var changed = false;
    if (t.getValue('start_date') != gs0.getValue() || t.getValue('end_date') != ge.getValue()) {
        t.time_constraint = 'start_on';
        if (t.isValidField('constraint_date')) t.constraint_date = gs0;
        t.start_date = gs0;
        t.end_date = ge;
        changed = true;
    }
    var st = t.getValue('state');                                   // 2 WIP, 3 / 4 closed
    if ((st == '2' || st == '3' || st == '4') && (t.work_start.nil() || t.getValue('work_start') > gs0.getValue())) {
        t.work_start = gs0;
        changed = true;
    }
    if (!changed) return;
    t.update();
    t.get(t.getUniqueValue());
    if ((t.getValue('end_date') || '').substring(0, 10) != ge.getValue().substring(0, 10))
        log.warn('Planned end not kept on task ' + t.getValue('short_description') + ': wanted ' + ge.getValue() + ', got ' + t.getValue('end_date'));
})(source, map, log, target);
