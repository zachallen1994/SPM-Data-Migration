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
