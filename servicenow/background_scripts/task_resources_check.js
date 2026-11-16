// Background Script (read-only): a task's Adaptive "Resources" did not reach Additional assignee list. Checks each
// step: the staging column, its value on the latest row for the task, what Adaptive returns, and the user match.
var TASK = 'PRJTASK0012884';   // ✏️ task number (Last Report Building on Willow)
var t = new GlideRecord('pm_project_task');
if (!t.get('number', TASK)) { gs.print('No task ' + TASK); }
else {
    var corr = t.getValue('correlation_id');
    gs.print('task ' + TASK + ' ' + t.getValue('short_description') + ' | ' + corr + ' | additional assignees now: ' + t.getDisplayValue('additional_assignee_list'));
    var col = new GlideRecord('sys_dictionary');
    col.addQuery('name', 'u_import_adaptive_project_tasks');
    col.addQuery('column_label', 'Resource Emails');
    col.query();
    if (!col.next()) gs.print('1) NO staging column labelled "Resource Emails" - add it (String 4000), reload');
    else {
        gs.print('1) column ' + col.getValue('element') + ' (max ' + col.getValue('max_length') + ')');
        var r = new GlideRecord('u_import_adaptive_project_tasks');
        r.addQuery('u_correlation_id', corr);
        r.orderByDesc('sys_created_on'); r.setLimit(1); r.query();
        if (r.next()) gs.print('2) latest staging row (' + r.getValue('sys_created_on') + ', ' + r.sys_import_set.getDisplayValue() + '): Resource Emails = "' + (r.getValue(col.getValue('element')) || '') + '"');
        else gs.print('2) no staging row for this task');
    }
    var q = new sn_ws.RESTMessageV2();
    q.setHttpMethod('POST');
    q.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    q.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    q.setRequestHeader('Content-Type', 'application/json');
    q.setRequestBody(JSON.stringify({ q: "SELECT WorkItem, Resource.Name, Resource.Email FROM RegularResourceLink WHERE WorkItem = '" + corr.replace('ADAPTIVE:', '') + "'", paging: { from: 0, limit: 50 } }));
    var res = q.execute();
    gs.print('3) Adaptive resources on the task: HTTP ' + res.getStatusCode());
    if (res.getStatusCode() == 200) (JSON.parse(res.getBody()).entities || []).forEach(function (l) {
        var em = l.Resource && l.Resource.Email ? String(l.Resource.Email).toLowerCase() : '';
        var u = new GlideRecord('sys_user');
        var ok = em && u.get('email', em);
        gs.print('   ' + (l.Resource ? l.Resource.Name : '?') + ' | ' + (em || '(no email)') + ' | WorkItem ' + (l.WorkItem ? l.WorkItem.id : '') + ' | ServiceNow user: ' + (ok ? u.getValue('name') : 'NONE'));
    });
    else gs.print('   ' + res.getBody());
    var ts = new GlideRecord('sys_transform_script');
    ts.addQuery('map.target_table', 'pm_project_task');
    ts.addQuery('script', 'CONTAINS', 'additional_assignee_list');
    ts.query();
    while (ts.next()) gs.print('4) transform script with additional_assignee_list: ' + ts.map.name + ' | ' + ts.getValue('when') + ' | order ' + ts.getValue('order') + ' | active ' + ts.getValue('active'));
}
