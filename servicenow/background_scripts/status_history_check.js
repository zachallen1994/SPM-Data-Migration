// Background Script (read-only): Adaptive has more status updates than ServiceNow status reports for a project.
// The map coalesces on project + "as on" date, so two Adaptive updates on the SAME day become one report.
// Lists the latest status history staging rows for the project: date, result, and days with more than one update.
var PROJECT_CORRELATION = 'ADAPTIVE:/Project/4auqruki1rx0w03hgmnr3g6qf1962';   // ✏️ the project's Correlation ID

var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'u_import_adaptive_status_history');
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (!set.next()) gs.print('No status history import set');
else {
    var r = new GlideRecord('u_import_adaptive_status_history');
    r.addQuery('sys_import_set', set.getUniqueValue());
    r.addQuery('u_project_correlation_id', PROJECT_CORRELATION);
    r.orderBy('u_updated_on');
    r.query();
    var perDay = {}, n = 0;
    while (r.next()) {
        n++;
        var day = r.getValue('u_updated_on');
        perDay[day] = (perDay[day] || 0) + 1;
        gs.print(day + ' | ' + r.getValue('sys_import_state') + ' | ' + r.getValue('u_correlation_id'));
    }
    gs.print('staging rows for this project in ' + set.getValue('number') + ': ' + n);
    for (var d in perDay) if (perDay[d] > 1) gs.print('SAME DAY: ' + d + ' has ' + perDay[d] + ' Adaptive updates -> 1 ServiceNow report');
}
var p = new GlideRecord('pm_project');
if (p.get('correlation_id', PROJECT_CORRELATION)) {
    var s = new GlideAggregate('project_status');
    s.addQuery('project', p.getUniqueValue());
    s.addAggregate('COUNT'); s.query(); s.next();
    gs.print('status reports on ' + p.getValue('number') + ': ' + s.getAggregate('COUNT'));
}
