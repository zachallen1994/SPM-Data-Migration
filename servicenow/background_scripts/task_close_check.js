// Background Script (read-only): why does "Set Close Data On Inactive" refuse some migrated tasks?
// That rule (pm_project_task, before insert/update) runs when a task is saved as inactive (Adaptive Completed /
// Cancelled -> Closed). It asks PlannedTaskCommonHelper.getCloseDataOnInactive() for the actual start / end and
// cancels the save when the answer is not 'success'. Its message only goes to the screen, not to the import log.
// This script prints the Adaptive values of the error rows and asks the same helper for its message, using an
// UNSAVED task built from the row (nothing is inserted).
var ISET = 'ISET23876503';      // ✏️ the Adaptive Tasks import set
var r = new GlideRecord('u_import_adaptive_project_tasks');
r.addQuery('sys_import_set.number', ISET);
r.addQuery('sys_import_state', 'error');
r.query();
gs.print(r.getRowCount() + ' error rows');
while (r.next()) {
    var line = 'row ' + r.getValue('sys_import_row') + ' | ' + r.getValue('u_name') + ' | state ' + r.getValue('u_task_state') +
        ' | start ' + r.getValue('u_start_date') + ' | due ' + r.getValue('u_due_date') +
        ' | actual start ' + (r.getValue('u_actual_start_date') || '(empty)') + ' | actual end ' + (r.getValue('u_actual_end_date') || '(empty)') +
        ' | % ' + r.getValue('u_schedule___complete');
    var p = new GlideRecord('pm_project');
    if (p.get('correlation_id', r.getValue('u_project_correlation_id'))) {
        line += ' | project ' + p.getValue('number') + ' start ' + (p.getValue('start_date') || '').substring(0, 10);
        try {
            var t = new GlideRecord('pm_project_task');
            t.initialize();
            t.setValue('top_task', p.getUniqueValue());
            t.setValue('parent', p.getUniqueValue());
            t.setValue('short_description', r.getValue('u_name'));
            if (r.getValue('u_start_date')) t.setValue('start_date', r.getValue('u_start_date') + ' 08:00:00');
            if (r.getValue('u_due_date')) t.setValue('end_date', r.getValue('u_due_date') + ' 17:00:00');
            if (r.getValue('u_actual_start_date')) t.setValue('work_start', r.getValue('u_actual_start_date') + ' 08:00:00');
            if (r.getValue('u_actual_end_date')) t.setValue('work_end', r.getValue('u_actual_end_date') + ' 17:00:00');
            t.setValue('state', /cancel/i.test(r.getValue('u_task_state')) ? '4' : '3');
            t.setValue('active', false);
            var res = new PlannedTaskCommonHelper().getCloseDataOnInactive(t);
            line += ' | helper: ' + JSON.stringify(res);
        } catch (e) { line += ' | helper error: ' + e; }
    } else line += ' | project not found';
    gs.print(line);
}
