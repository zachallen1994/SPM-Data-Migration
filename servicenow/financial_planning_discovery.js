// Background Script (read-only): which Adaptive entity holds the Financial Planning budget lines
// (e.g. Opex | Vendor Services Opex | 3,465 per month), its fields, and samples for one project.
// Also lists the ServiceNow cost types. Changes nothing.
var PROJECT_NAME = '26264-00000-Wyandot Epic Occupational Health Mo';   // ✏️ start of the project's name is enough
var BASE = gs.getProperty('x_mig.adaptive.url');
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(BASE + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ' + method + ' ' + path + ' -> ' + res.getStatusCode() + ': ' + res.getBody()); return null; }
    return JSON.parse(res.getBody());
}

// 1. Candidate entities
var list = call('GET', '/metadata/listEntities');
var cands = ((list && list.typeNames) || []).filter(function (n) { return /budget|financ|nonlabor|expense|costline|planning|forecast/i.test(n); });
gs.print('==== 1. Candidate entities: ' + cands.join(', '));

// 2. The project id
var pid = null;
var found = call('POST', '/data/query', { q: "SELECT Name FROM Project WHERE Name LIKE '" + PROJECT_NAME.replace(/'/g, "''") + "%'", paging: { from: 0, limit: 1 } });
if (found && found.entities.length) pid = found.entities[0].id;
gs.print('==== 2. Project: ' + (pid || 'not found - set PROJECT_NAME to the exact full name'));

// 3. Fields of each candidate, and rows for that project when a field points at a project/work item
cands.forEach(function (ent) {
    var desc = call('GET', '/metadata/describeEntities?typeNames=' + ent);
    if (!desc) return;
    var fields = desc.entityDescriptions[0].fields, link = null, pick = [];
    gs.print('\n==== 3. ' + ent);
    fields.forEach(function (f) {
        gs.print('  ' + f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
        var refs = (f.referencedEntities || []).join(',');
        if (!link && /Project|WorkItem/.test(refs)) link = f.name;
        if (/amount|budget|cost|type|currency|date|period|month|name|billable|planned|actual|forecast/i.test(f.name + ' ' + f.label) && pick.length < 20) pick.push(f.name);
    });
    if (pid && link) {
        var s = call('POST', '/data/query', { q: 'SELECT ' + [link].concat(pick).join(', ') + ' FROM ' + ent + " WHERE " + link + " = '" + pid + "'", paging: { from: 0, limit: 5 } });
        if (s) { gs.print('  rows for the project: ' + s.entities.length); s.entities.forEach(function (e) { gs.print('  SAMPLE ' + JSON.stringify(e)); }); }
    }
});

// 4. ServiceNow cost types
gs.print('\n==== 4. ServiceNow cost types');
var ct = new GlideRecord('cost_type_definition');
if (ct.isValid()) { ct.query(); while (ct.next()) gs.print('  ' + ct.getDisplayValue()); }
else gs.print('  (table cost_type_definition not found - open a cost plan, right-click Cost type > Show table name)');
