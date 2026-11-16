// Background Script (read-only): Adaptive "Resource Planning View" -> ServiceNow resource assignments.
// 1) Adaptive RegularResourceLink fields about work / hours / units / allocation, with values for 3 people of one project
// 2) which time-phased (per week / month) Adaptive entities exist for resource links
// 3) ServiceNow resource assignment fields, and the related tables (allocations per period)
var PROJECT = '25255-19488-GVL Powdersville MOB';   // ✏️ exact Adaptive project name
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    return { code: res.getStatusCode(), body: res.getBody() };
}
function show(v) {
    if (v === null || v === undefined) return '';
    if (typeof v == 'object') return v.id ? v.id : (v.value !== undefined ? v.value + (v.unit ? ' ' + v.unit : '') : JSON.stringify(v));
    return String(v);
}
try {
    var want = /work|hour|unit|alloc|assign|effort|capac|percent|start|end|date|load|rate|role/i, names = [];
    var de = call('GET', '/metadata/describeEntities?typeNames=RegularResourceLink');
    JSON.parse(de.body).entityDescriptions[0].fields.forEach(function (f) {
        if (want.test(f.name + ' ' + (f.label || ''))) { names.push(f.name); gs.print('Adaptive RegularResourceLink field: ' + f.name + ' | "' + (f.label || '') + '" | ' + f.type); }
    });
    var p = JSON.parse(call('POST', '/data/query', { q: "SELECT Name FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'", paging: { from: 0, limit: 1 } }).body).entities[0];
    var links = JSON.parse(call('POST', '/data/query', { q: 'SELECT Resource.Name, ' + names.join(', ') + " FROM RegularResourceLink WHERE WorkItem = '" + p.id + "'", paging: { from: 0, limit: 3 } }).body).entities || [];
    links.forEach(function (l) {
        gs.print('=== ' + (l.Resource ? l.Resource.Name : '') + ' (' + l.id + ')');
        names.forEach(function (n) { var v = show(l[n]); if (v) gs.print('    ' + n + ' = ' + v); });
    });
    ['ResourceTimePhase', 'RegularResourceLinkTimePhase', 'ResourceLinkTimePhase', 'TimePhase', 'ResourceAllocation', 'Allocation'].forEach(function (e) {
        var r = call('GET', '/metadata/describeEntities?typeNames=' + e);
        if (r.code != 200) { gs.print('Adaptive entity ' + e + ': not found (' + r.code + ')'); return; }
        var fl = JSON.parse(r.body).entityDescriptions[0].fields.map(function (f) { return f.name; });
        gs.print('Adaptive entity ' + e + ' EXISTS: ' + fl.join(', ').substring(0, 600));
    });
} catch (err) { gs.print('Adaptive ERROR: ' + err); }

var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'sn_plng_att_core_resource_assignment');
d.addQuery('element', '!=', '');
d.addQuery('element', 'NOT LIKE', 'sys_%');
d.query();
while (d.next()) gs.print('ServiceNow resource assignment field: ' + d.getValue('element') + ' | "' + d.getValue('column_label') + '" | ' +
    d.getValue('internal_type') + (d.getValue('mandatory') == 'true' || d.getValue('mandatory') == '1' ? ' | MANDATORY' : ''));
var rt = new GlideRecord('sys_dictionary');
rt.addQuery('internal_type', 'reference');
rt.addQuery('reference', 'sn_plng_att_core_resource_assignment');
rt.query();
while (rt.next()) gs.print('ServiceNow table pointing at resource assignments: ' + rt.getValue('name') + '.' + rt.getValue('element'));
