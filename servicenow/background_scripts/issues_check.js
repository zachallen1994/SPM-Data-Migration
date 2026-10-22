// Background Script (read-only): why does the Adaptive Issues data source load 0 rows?
// Changes nothing. Paste into System Definition > Scripts - Background and click Run script.
function q(title, czql) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: czql, paging: { from: 0, limit: 10 } }));
    var res = r.execute();
    gs.print('==== ' + title + '  [' + res.getStatusCode() + ']');
    if (res.getStatusCode() != 200) { gs.print(res.getBody()); return []; }
    var rows = JSON.parse(res.getBody()).entities || [];
    gs.print('rows: ' + rows.length);
    rows.forEach(function (e) { gs.print('  ' + JSON.stringify(e)); });
    return rows;
}

// 1. The data source itself: its newest Import Log messages
var ds = new GlideRecord('sys_data_source');
ds.addQuery('name', 'CONTAINS', 'Issue');
ds.query();
while (ds.next()) {
    gs.print('==== 1. Data source "' + ds.getValue('name') + '" -> table ' + ds.getValue('import_set_table_name') + ' | type ' + ds.getValue('type'));
    var lg = new GlideRecord('import_log');
    lg.addQuery('source', 'CONTAINS', ds.getValue('name'));
    lg.orderByDesc('sys_created_on');
    lg.setLimit(5);
    lg.query();
    while (lg.next()) gs.print('  LOG ' + lg.getValue('sys_created_on') + ' ' + lg.getValue('level') + ': ' + lg.getValue('message'));
}

// 2. Any issues at all, and what PlannedFor points at
q('2. Sample issues', 'SELECT Title, PlannedFor, PlannedFor.Name FROM Issue');

// 3. Issues of each migrated Adaptive project
var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
p.query();
while (p.next()) {
    var id = p.getValue('correlation_id').replace('ADAPTIVE:', '');
    q('3. ' + p.getValue('short_description'), "SELECT Title FROM Issue WHERE PlannedFor = '" + id + "'");
}
