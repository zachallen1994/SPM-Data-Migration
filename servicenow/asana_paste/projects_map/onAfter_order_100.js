// Import Asana HR Project Portfolio Transform Map > Transform Scripts > NEW: When = onAfter, Order 100, Active.
// On INSERT the planning engine replaces the planned end with start + 1 day (seen: Project Warren Aug 24 2026 ->
// end Aug 24 2026 instead of May 11 2027; same as Adaptive). A save right after keeps the Asana dates, so they are
// written again here. Insert only ("Disable the Change of Planned Dates" blocks later changes).
(function runTransformScript(source, map, log, target) {
    if (action != 'insert') return;
    var s = (source.getValue('u_start_date') || '').substring(0, 10), e = (source.getValue('u_due_date') || '').substring(0, 10);
    var ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(s) || !ok.test(e) || e < s) return;
    var p = new GlideRecord('pm_project');
    if (!p.get(target.getUniqueValue())) return;
    var gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
    var ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    if (p.getValue('start_date') == gs0.getValue() && p.getValue('end_date') == ge.getValue()) return;
    p.start_date = gs0;
    p.end_date = ge;
    p.update();
    p.get(p.getUniqueValue());
    if ((p.getValue('end_date') || '').substring(0, 10) != ge.getValue().substring(0, 10))
        log.warn('Planned end not kept on ' + source.getValue('u_name') + ': Asana ' + e + ', ServiceNow ' + p.getValue('end_date'));
})(source, map, log, target);
