// Background Script (read-only): Adaptive task constraint -> ServiceNow project task time constraint.
// 1) Adaptive Task fields whose name or label mentions "constraint", and the values used on one project's tasks
// 2) ServiceNow time_constraint choices (and any other constraint field on project task)
var PROJECT = '23190-30060-ENT Epic Willow Ambulatory';   // ✏️ exact Adaptive project name

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
    var f = [];
    call('GET', '/metadata/describeEntities?typeNames=Task').entityDescriptions[0].fields.forEach(function (x) {
        if (/constraint/i.test(x.name + ' ' + (x.label || ''))) { f.push(x.name); gs.print('Adaptive Task field: ' + x.name + ' | "' + (x.label || '') + '" | ' + x.type); }
    });
    var p = (call('POST', '/data/query', { q: "SELECT Name FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'", paging: { from: 0, limit: 1 } }).entities || [])[0];
    if (p && f.length) {
        var counts = {}, paging = { from: 0, limit: 100 };
        while (true) {
            var b = call('POST', '/data/query', { q: 'SELECT ' + f.join(', ') + " FROM Task WHERE Project = '" + p.id + "'", paging: paging });
            (b.entities || []).forEach(function (t) {
                f.forEach(function (n) {
                    var v = t[n];
                    v = v && v.id ? v.id : (v === null || v === undefined ? '(blank)' : String(v).substring(0, 10));
                    if (/date/i.test(n) && v != '(blank)') v = '(a date)';
                    counts[n + ' = ' + v] = (counts[n + ' = ' + v] || 0) + 1;
                });
            });
            if (!b.paging || !b.paging.hasMore) break;
            paging = b.paging;
        }
        for (var k in counts) gs.print('  ' + PROJECT + ' tasks: ' + k + ' | ' + counts[k]);
    }
} catch (err) { gs.print('Adaptive ERROR: ' + err); }

var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', 'pm_project_task,planned_task');
c.addQuery('element', 'CONTAINS', 'constraint');
c.query();
while (c.next()) gs.print('ServiceNow choice ' + c.getValue('name') + '.' + c.getValue('element') + ': ' + c.getValue('value') + ' = ' + c.getValue('label'));
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'IN', 'pm_project_task,planned_task');
d.addQuery('element', 'CONTAINS', 'constraint');
d.query();
while (d.next()) gs.print('ServiceNow field: ' + d.getValue('name') + '.' + d.getValue('element') + ' | "' + d.getValue('column_label') + '" | ' + d.getValue('internal_type'));
