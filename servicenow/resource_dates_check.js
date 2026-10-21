// Background Script (read-only): where do a person's assignment dates come from?
// Prints the staging rows, the Adaptive resource link (every date-like field) and the work item's dates.
var PERSON = 'hauck';   // ✏️ part of the person's email
var rows = new GlideRecord('u_import_adaptive_resources');
rows.addQuery('u_resource_email', 'CONTAINS', PERSON);
rows.orderByDesc('sys_created_on');
rows.setLimit(10);
rows.query();
var seen = {};
while (rows.next()) {
    var id = (rows.getValue('u_correlation_id') || '').replace('ADAPTIVE:', '');
    gs.print('STAGING ' + rows.getValue('u_resource_email') + ' | start ' + rows.getValue('u_start_date') + ' | end ' +
        rows.getValue('u_end_date') + ' | on ' + rows.getValue('u_project_correlation_id') + ' | link ' + id);
    if (!id || seen[id]) continue;
    seen[id] = true;
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: 'SELECT StartDate, InactiveDate, Duration, Work, Units, Availability, State, CreatedOn, ' +
        "WorkItem.Name, WorkItem.StartDate, WorkItem.DueDate FROM RegularResourceLink WHERE id = '" + id + "'", paging: { from: 0, limit: 1 } }));
    var res = r.execute();
    gs.print('  ADAPTIVE [' + res.getStatusCode() + '] ' + res.getBody());
}
