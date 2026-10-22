// Background Script (read-only): Adaptive entity and field names for TIME ENTRIES and RESOURCE links,
// with 3 sample rows each. Changes nothing.
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

// 1. Entities that look like time entries
var list = call('GET', '/metadata/listEntities');
var names = ((list && list.typeNames) || []).filter(function (n) { return /time ?sheet|time ?entr|timeentr/i.test(n); });
gs.print('==== 1. Time entities: ' + names.join(', '));

// 2. Fields + samples. Interesting fields only, so the sample query stays valid.
var WANT = /reported|duration|work ?item|project|created ?by|approv|state|date|charg|comment|resource|overtime|^id$/i;
names.concat(['RegularResourceLink']).forEach(function (ent) {
    var desc = call('GET', '/metadata/describeEntities?typeNames=' + ent);
    if (!desc) return;
    var pick = [];
    gs.print('\n==== 2. ' + ent + ' fields');
    desc.entityDescriptions[0].fields.forEach(function (f) {
        gs.print('  ' + f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
        if (WANT.test(f.name + ' ' + f.label) && pick.length < 25) pick.push(f.name);
    });
    if (!pick.length) return;
    var s = call('POST', '/data/query', { q: 'SELECT ' + pick.join(', ') + ' FROM ' + ent, paging: { from: 0, limit: 3 } });
    if (s) s.entities.forEach(function (e) { gs.print('  SAMPLE ' + JSON.stringify(e)); });
});

// 3. ServiceNow time_card fields (what a time card needs here)
gs.print('\n==== 3. time_card fields');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'time_card');
d.addNotNullQuery('element');
d.query();
while (d.next()) gs.print('  ' + d.getValue('element') + ' | ' + d.getValue('column_label') + ' | ' + d.getValue('internal_type') +
    (d.getValue('mandatory') == '1' ? ' | MANDATORY' : ''));
