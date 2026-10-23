// Background Script (read-only): are a project's task dates the Adaptive dates?
// For each migrated task of one project: Adaptive Schedule Start / Finish (latest staging row) vs ServiceNow
// planned start / end, and the time constraint ("Start ASAP" moves tasks to the project start).
var PROJECT = 'PRJ0011298';   // ✏️ project number
var LIMIT = 25;

var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', 'planned_task,pm_project_task'); c.addQuery('element', 'time_constraint'); c.query();
while (c.next()) gs.print('time_constraint choice: ' + c.getValue('value') + ' = ' + c.getValue('label'));

var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    gs.print(PROJECT + ' ' + p.getValue('short_description') + ' | planned ' + p.getValue('start_date') + ' -> ' + p.getValue('end_date'));
    var t = new GlideRecord('pm_project_task');
    t.addQuery('top_task', p.getUniqueValue());
    t.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    t.orderBy('start_date');
    t.setLimit(LIMIT);
    t.query();
    var wrong = 0;
    while (t.next()) {
        var s = new GlideRecord('u_import_adaptive_project_tasks');
        s.addQuery('u_correlation_id', t.getValue('correlation_id'));
        s.orderByDesc('sys_created_on');
        s.setLimit(1);
        s.query();
        var a = s.next() ? s.getValue('u_start_date') + ' -> ' + s.getValue('u_due_date') : '(no staging row)';
        var sn = (t.getValue('start_date') || '').substring(0, 10) + ' -> ' + (t.getValue('end_date') || '').substring(0, 10);
        var same = a.indexOf(sn.split(' -> ')[0]) == 0;
        if (!same) wrong++;
        gs.print((same ? 'ok    ' : 'DIFF  ') + t.getValue('number') + ' | Adaptive ' + a + ' | ServiceNow ' + sn + ' | ' +
            t.getDisplayValue('time_constraint') + ' | ' + t.getValue('short_description'));
    }
    gs.print('start dates different from Adaptive: ' + wrong + ' (of the first ' + LIMIT + ')');
}
