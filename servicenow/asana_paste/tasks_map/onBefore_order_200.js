// "Start on specific date" + dates, else the planning engine moves the task (seen: all on 12-31-2026 / 05-11-2027).
//   own Asana dates      -> those (08:00 / 17:00 so the day does not shift; only a due date = one-day task)
//   no dates in Asana    -> the PARENT task's dates (e.g. "Receive roster..." gets Associate Job Mapping's Sep 9 - Sep 30)
//   parent has none      -> the PROJECT's dates
// PART A (Order 100) has already set target.parent / target.top_task; parents are loaded before their children.
(function runTransformScript(source, map, log, target) {
    if (!target.isNewRecord()) return;                           // existing tasks: "Disable the Change of Planned Dates"
    var s = (source.getValue('u_start_date') || '').substring(0, 10);
    var e = (source.getValue('u_due_date') || '').substring(0, 10);
    var ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(s)) s = ok.test(e) ? e : '';
    if (!ok.test(e)) e = s;
    var gs0, ge;
    if (s) {
        if (e < s) e = s;
        gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
        ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    } else {
        var from = null, pt = new GlideRecord('pm_project_task');
        if (target.parent && pt.get(target.getValue('parent')) && !pt.start_date.nil() && !pt.end_date.nil()) from = pt;
        if (!from) { var pr = new GlideRecord('pm_project'); if (target.top_task && pr.get(target.getValue('top_task')) && !pr.start_date.nil() && !pr.end_date.nil()) from = pr; }
        if (!from) return;                                       // nothing to inherit: ServiceNow places it
        gs0 = new GlideDateTime(from.getValue('start_date'));
        ge = new GlideDateTime(from.getValue('end_date'));
    }
    target.time_constraint = 'start_on';
    if (target.isValidField('constraint_date')) target.constraint_date = gs0;
    target.start_date = gs0;
    target.end_date = ge;
})(source, map, log, target);
