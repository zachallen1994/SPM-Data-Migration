// Background Script (read-only): where Adaptive keeps task predecessors (dependencies), their fields, samples for
// one task, and the ServiceNow dependency table's fields. Changes nothing.
var TASK_NAME = 'INT: Project Kickoff Complete';                         // ✏️ a task that HAS a predecessor
var PROJECT_ID = '/Project/{05506AB6-EF2D-4C34-A15F-2058DB718D4C}';      // ✏️ its project (Willow)
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ' + path + ' -> ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300)); return null; }
    return JSON.parse(res.getBody());
}

// 1. Entities that look like dependencies
var list = call('GET', '/metadata/listEntities');
var cands = ((list && list.typeNames) || []).filter(function (n) { return /depend|predecess|successor|^link$|worklink/i.test(n); });
gs.print('==== 1. Candidate entities: ' + cands.join(', '));

// 2. The task's id
var t = call('POST', '/data/query', { q: "SELECT Name FROM Task WHERE Name = '" + TASK_NAME.replace(/'/g, "''") + "' AND Project = '" + PROJECT_ID + "'", paging: { from: 0, limit: 1 } });
var tid = t && t.entities.length ? t.entities[0].id : null;
gs.print('==== 2. Task: ' + (tid || 'not found - check TASK_NAME / PROJECT_ID'));

// 3. Fields of each candidate and rows that point at the task
cands.forEach(function (ent) {
    var d = call('GET', '/metadata/describeEntities?typeNames=' + ent);
    if (!d) return;
    var refs = [];
    gs.print('\n==== 3. ' + ent);
    d.entityDescriptions[0].fields.forEach(function (f) {
        gs.print('  ' + f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
        if (/Entity/.test(f.type) && !/CreatedBy|LastUpdatedBy|EntityType/.test(f.name)) refs.push(f.name);
    });
    if (!tid) return;
    refs.forEach(function (fld) {
        var s = call('POST', '/data/query', { q: 'SELECT ' + refs.join(', ') + ' FROM ' + ent + ' WHERE ' + fld + " = '" + tid + "'", paging: { from: 0, limit: 5 } });
        if (s && s.entities.length) { gs.print('  rows where ' + fld + ' = task:'); s.entities.forEach(function (e) { gs.print('    ' + JSON.stringify(e)); }); }
    });
});

// 4. ServiceNow dependency table
gs.print('\n==== 4. planned_task_rel_planned_task fields');
var dd = new GlideRecord('sys_dictionary');
dd.addQuery('name', 'planned_task_rel_planned_task');
dd.addNotNullQuery('element');
dd.query();
while (dd.next()) gs.print('  ' + dd.getValue('element') + ' | ' + dd.getValue('column_label') + ' | ' + dd.getValue('internal_type') + (dd.getValue('mandatory') == '1' ? ' | MANDATORY' : ''));
