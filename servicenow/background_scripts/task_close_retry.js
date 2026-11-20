// Background Script (DEV - creates and then deletes test records): get the REAL message of "Set Close Data On Inactive".
// task_close_check.js showed the helper says "success" for these tasks on their own, so the refusal depends on the
// real save (parent task, project, other rules). This saves each error row as a real task, the way the transform does
// (same project, same parent, business rules ON), prints the result and ServiceNow's error message, then deletes the
// test task again (KEEP = false). Nothing else is changed.
var ISET = 'ISET23876503';     // ✏️ the Adaptive Tasks import set
var KEEP = false;              // ✏️ true = keep the tasks that save fine (they are then real migrated tasks)
var r = new GlideRecord('u_import_adaptive_project_tasks');
r.addQuery('sys_import_set.number', ISET);
r.addQuery('sys_import_state', 'error');
r.query();
while (r.next()) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', r.getValue('u_project_correlation_id'))) { gs.print('row ' + r.getValue('sys_import_row') + ': project not found'); continue; }
    var parent = new GlideRecord('pm_project_task'), parentText = 'project';
    var t = new GlideRecord('pm_project_task');
    t.initialize();
    t.setValue('top_task', p.getUniqueValue());
    if (parent.get('correlation_id', r.getValue('u_parent_correlation_id'))) {
        t.setValue('parent', parent.getUniqueValue());
        parentText = parent.getValue('short_description') + ' (state ' + parent.getDisplayValue('state') + ', active ' + parent.getValue('active') + ')';
    } else t.setValue('parent', p.getUniqueValue());
    t.setValue('short_description', r.getValue('u_name'));
    if (!KEEP) t.setValue('correlation_id', 'TEST-' + r.getValue('u_correlation_id'));
    else t.setValue('correlation_id', r.getValue('u_correlation_id'));
    if (r.getValue('u_start_date')) t.start_date.setDisplayValue(r.getValue('u_start_date') + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');
    if (r.getValue('u_due_date')) t.end_date.setDisplayValue(r.getValue('u_due_date') + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    if (r.getValue('u_actual_end_date')) t.work_end.setDisplayValue(r.getValue('u_actual_end_date') + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
    t.setValue('state', '3');
    gs.flushMessages();
    var id = t.insert();
    var msgs = gs.getErrorMessages();
    gs.print('row ' + r.getValue('sys_import_row') + ' | ' + r.getValue('u_name') + ' | parent: ' + parentText +
        ' | ' + (id ? 'SAVED' : 'REFUSED') + ' | messages: ' + (msgs && msgs.size && msgs.size() ? msgs.toString() : '(none)'));
    if (id && !KEEP) { var del = new GlideRecord('pm_project_task'); if (del.get(id)) del.deleteRecord(); }
    gs.flushMessages();
}
