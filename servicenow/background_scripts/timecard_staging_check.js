// Background Script (read-only): the latest time card import set rows - person, week, hours, target, and whether
// the user and target record exist in ServiceNow. Explains rows "ignored by onBefore".
var STAGING = 'u_import_adaptive_time_entries';   // ✏️ the time card import set table
var row = new GlideRecord(STAGING);
row.orderByDesc('sys_created_on'); row.setLimit(40); row.query();
while (row.next()) {
    var email = (row.getValue('u_resource_email') || '').toLowerCase(), id = row.getValue('u_task_correlation_id');
    var u = new GlideRecord('sys_user'), userOk = u.get('email', email), where = 'NOT FOUND';
    ['pm_project_task', 'pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t); if (where == 'NOT FOUND' && g.get('correlation_id', id)) where = t + ' ' + g.getValue('number');
    });
    gs.print(email + ' | user ' + (userOk ? 'OK' : 'MISSING') + ' | ' + id + ' -> ' + where + ' | ' + row.getValue('u_total') +
        ' h | ' + row.getValue('sys_import_state') + ' ' + (row.getValue('sys_import_state_comment') || ''));
}
