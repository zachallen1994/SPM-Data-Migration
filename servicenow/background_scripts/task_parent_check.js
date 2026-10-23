// Background Script (read-only): the tasks loaded fine but are not on the project - which project did they go to?
// Lists every project with the same Adaptive id (duplicates send tasks to the wrong one) and, for the latest tasks
// import set, which project each task ended up under.
var PROJECT_CORRELATION = 'ADAPTIVE:/Project/4auqruki1rx0w03hgmnr3g6qf1962';   // ✏️ the project's Correlation ID

var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', PROJECT_CORRELATION);
p.query();
gs.print('projects with this Correlation ID: ' + p.getRowCount());
while (p.next()) gs.print('  ' + p.getValue('number') + ' | ' + p.getValue('short_description') + ' | created ' + p.getValue('sys_created_on'));

var t = new GlideAggregate('pm_project_task');
t.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
t.addQuery('top_task.correlation_id', PROJECT_CORRELATION);
t.addAggregate('COUNT');
t.groupBy('top_task');
t.query();
while (t.next()) gs.print('tasks under ' + t.getDisplayValue('top_task') + ': ' + t.getAggregate('COUNT'));

var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'u_import_adaptive_project_tasks');
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (set.next()) {
    var rows = new GlideRecord('u_import_adaptive_project_tasks');
    rows.addQuery('sys_import_set', set.getUniqueValue());
    rows.setLimit(5);
    rows.query();
    gs.print('latest tasks import set ' + set.getValue('number') + ' (first 5 rows):');
    while (rows.next()) {
        var task = new GlideRecord('pm_project_task');
        var where = task.get(rows.getValue('sys_target_sys_id')) ?
            task.getValue('number') + ' | project ' + task.getDisplayValue('top_task') + ' | parent ' + task.getDisplayValue('parent') : '(no task)';
        gs.print('  ' + rows.getValue('u_name') + ' | ' + rows.getValue('sys_import_state') + ' | project in row ' +
            rows.getValue('u_project_correlation_id') + ' -> ' + where);
    }
}
