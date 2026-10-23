// Adaptive Schedule Start / Finish -> pm_project planned start / end.
// Transform Map "Import Adaptive Projects Transform Map": Transform Scripts: onAfter -> this script.
// Why: on INSERT the planning engine replaces the end date with start + the default 1-day duration, but a normal
// save afterwards keeps it (tested in Dev on PRJ0011395: end 2027-02-02, duration 152 days). So the dates are
// written again right after the row is transformed. Keep the start_date / end_date field maps as they are.
// Once the work plan loads, the project dates roll up from its tasks (tasks use "Start on specific date").
(function runTransformScript(source, map, log, target) {
    var start = source.getValue('u_schedule_start'), end = source.getValue('u_schedule_finish');   // yyyy-MM-dd
    if (!start || !end) return;
    var p = new GlideRecord('pm_project');
    if (!p.get(target.getUniqueValue())) return;
    var s = new GlideDateTime(); s.setDisplayValue(start + ' 00:00:00', 'yyyy-MM-dd HH:mm:ss');
    var e = new GlideDateTime(); e.setDisplayValue(end + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');   // end of the working day
    if (p.getValue('start_date') == s.getValue() && p.getValue('end_date') == e.getValue()) return;  // already right
    p.start_date = s;
    p.end_date = e;
    p.update();
    p.get(p.getUniqueValue());
    if (p.getValue('end_date').substring(0, 10) != e.getValue().substring(0, 10))
        log.warn('Planned end not kept on ' + source.u_name + ': Adaptive ' + end + ', ServiceNow ' + p.getValue('end_date'));
})(source, map, log, target);
