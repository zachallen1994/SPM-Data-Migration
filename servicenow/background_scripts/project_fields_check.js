// Background Script (read-only): Adaptive API names for Project Pool, Estimate Type and Groups, sample values,
// and the type of the matching ServiceNow fields. Changes nothing.
var BASE = gs.getProperty('x_mig.adaptive.url');
var LOOK_FOR = /pool|estimate ?type|group/i;
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(BASE + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print(method + ' ' + path + ' -> ' + res.getStatusCode() + ': ' + res.getBody()); return null; }
    return JSON.parse(res.getBody());
}

// 1. Adaptive Project fields whose name or label matches
var names = [];
var desc = call('GET', '/metadata/describeEntities?typeNames=Project');
if (desc) desc.entityDescriptions[0].fields.forEach(function (f) {
    if (LOOK_FOR.test(f.name + ' ' + f.label)) {
        names.push(f.name);
        gs.print('==== 1. ' + f.name + '  |  ' + f.label + '  |  type ' + f.type +
            (f.referencedEntities ? '  |  points at ' + f.referencedEntities.join(',') : ''));
    }
});

// 2. What those fields hold on 5 projects (raw API values)
if (names.length) {
    var s = call('POST', '/data/query', { q: 'SELECT Name, ' + names.join(', ') + ' FROM Project', paging: { from: 0, limit: 5 } });
    if (s) s.entities.forEach(function (e) { gs.print('==== 2. ' + JSON.stringify(e)); });
}

// 3. The ServiceNow target fields
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'pm_project');
d.addQuery('element', 'IN', 'u_project_pool,u_estimate_type,u_groups');
d.query();
while (d.next()) gs.print('==== 3. pm_project.' + d.getValue('element') + '  |  type ' + d.getValue('internal_type') +
    (d.getValue('reference') ? '  |  reference to ' + d.getValue('reference') : ''));
