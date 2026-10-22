// Background Script (read-only): which Adaptive PROJECT fields hold a priority, and what values do they use?
// Changes nothing. Paste into System Definition > Scripts - Background and click Run script.
var BASE = gs.getProperty('x_mig.adaptive.url');
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

// 1. Project fields with "priority" in the name or label
var desc = call('GET', '/metadata/describeEntities?typeNames=Project');
var fields = [];
if (desc) desc.entityDescriptions[0].fields.forEach(function (f) {
    if (/priorit/i.test(f.name + ' ' + f.label)) {
        fields.push(f);
        gs.print('==== 1. ' + f.name + '  |  ' + f.label + '  |  type ' + f.type +
            (f.referencedEntities ? '  |  pick-list ' + f.referencedEntities.join(',') : ''));
    }
});
if (!fields.length) gs.print('==== 1. No Project field with "priority" in its name or label');

fields.forEach(function (f) {
    // 2. Every value in the pick-list (when the field is one)
    (f.referencedEntities || []).forEach(function (ent) {
        var list = call('POST', '/data/query', { q: 'SELECT Name FROM ' + ent, paging: { from: 0, limit: 100 } });
        if (list) gs.print('==== 2. ' + f.name + ' choices (' + ent + '): ' +
            list.entities.map(function (e) { return e.Name || e.id; }).join(' | '));
    });
    // 3. Values actually used on projects (first 1,000 projects)
    var used = {}, from = 0;
    while (from < 1000) {
        var page = call('POST', '/data/query', { q: 'SELECT ' + f.name + ' FROM Project', paging: { from: from, limit: 100 } });
        if (!page) break;
        page.entities.forEach(function (e) {
            var v = e[f.name];
            v = (v && typeof v == 'object') ? (v.Name || v.id || JSON.stringify(v)) : (v === null || v === undefined ? '(blank)' : String(v));
            used[v] = (used[v] || 0) + 1;
        });
        if (!page.paging || !page.paging.hasMore) break;
        from += 100;
    }
    gs.print('==== 3. ' + f.name + ' values used on projects:');
    for (var v in used) gs.print('  [' + v + '] ' + used[v]);
});
