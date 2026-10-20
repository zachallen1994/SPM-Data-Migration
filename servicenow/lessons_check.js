// Background Script (read-only): why does the Adaptive Lessons Learned data source load 0 rows?
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

// 1. Any lessons at all, and what C_RelatedWorkItem points at (a project id? something else?)
q('1. Sample lessons', 'SELECT Name, SYSID, C_RelatedWorkItem, C_RelatedWorkItem.Name FROM C_PMOLessonsLearned');

// 2. Lessons of each migrated Adaptive project
var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
p.query();
while (p.next()) {
    var id = p.getValue('correlation_id').replace('ADAPTIVE:', '');
    q('2. ' + p.getValue('short_description') + '  (' + id + ')',
      "SELECT Name, SYSID FROM C_PMOLessonsLearned WHERE C_RelatedWorkItem = '" + id + "'");
}

// 3. The staging table's id columns must be Max length 100 (the data source stops otherwise)
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'u_import_adaptive_lessons_learned');
d.addQuery('column_label', 'IN', 'Correlation ID,Project Correlation ID');
d.query();
gs.print('==== 3. Staging id columns');
while (d.next()) gs.print('  ' + d.getValue('column_label') + ' (' + d.getValue('element') + '): ' + d.getValue('max_length'));
