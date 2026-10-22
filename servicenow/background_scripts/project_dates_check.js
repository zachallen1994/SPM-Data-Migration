// Background Script (read-only): which Adaptive fields are "Schedule Start", "Schedule Finish" and "Project Assigned",
// what one project holds in them, and where they should land in ServiceNow.
var PROJECT = '25392-00000-ENT Waystar Auth Submit and Auth Status';   // ✏️ an in-scope project name

function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody();
    return JSON.parse(res.getBody());
}
try {
    // 1) Adaptive Project fields whose name or label mentions start / finish / due / assigned
    var names = [];
    call('GET', '/metadata/describeEntities?typeNames=Project').entityDescriptions[0].fields.forEach(function (f) {
        var text = f.name + ' ' + (f.label || '') + ' ' + (f.displayName || '');
        if (/start|finish|due|assign|end ?date/i.test(text) && f.type == 'DateTime' || /date|start|finish/i.test(f.label || '') && f.type == 'DateTime') {
            gs.print('Adaptive field: ' + f.name + ' | label "' + (f.label || f.displayName || '') + '" | ' + f.type);
            names.push(f.name);
        }
    });
    // 2) their values on one project (compare with what the Adaptive screen shows)
    if (names.length) {
        var q = "SELECT " + names.join(', ') + " FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'";
        var rows = call('POST', '/data/query', { q: q, paging: { from: 0, limit: 1 } }).entities || [];
        if (!rows.length) gs.print('No Adaptive project named ' + PROJECT);
        rows.forEach(function (e) { names.forEach(function (n) { if (e[n]) gs.print('  ' + PROJECT + ' | ' + n + ' = ' + e[n]); }); });
    }
} catch (err) { gs.print('ERROR: ' + err); }

// 3) ServiceNow: planned start / end and the custom Project Assigned field on pm_project
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'IN', 'pm_project,planned_task,task');
d.addQuery('element', 'IN', 'start_date,end_date').addOrCondition('column_label', 'CONTAINS', 'assigned');
d.query();
while (d.next()) if (d.getValue('element'))
    gs.print('ServiceNow field: ' + d.getValue('name') + '.' + d.getValue('element') + ' | "' + d.getValue('column_label') + '" | ' + d.getValue('internal_type'));
