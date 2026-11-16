// Background Script (read-only): which Adaptive Task field is the work plan's "Funding Type" column?
// Lists Task fields whose name / label mentions fund / expense / capex / opex, with their values on a few tasks.
var TASK_IDS = ['/Task/3z2qeli241orf7344ypdliy4r947', '/Task/4ul21jogbr6654ibhq3orotdq2534'];   // ✏️ Adaptive task ids
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
    var names = [];
    call('GET', '/metadata/describeEntities?typeNames=Task').entityDescriptions[0].fields.forEach(function (f) {
        if (/fund|expense|capex|opex|capital|operat/i.test(f.name + ' ' + (f.label || ''))) {
            names.push(f.name);
            gs.print('Adaptive Task field: ' + f.name + ' | "' + (f.label || '') + '" | ' + f.type);
        }
    });
    var where = TASK_IDS.map(function (id) { return "id = '" + id + "'"; }).join(' OR ');
    (call('POST', '/data/query', { q: 'SELECT Name, ' + names.join(', ') + ' FROM Task WHERE ' + where, paging: { from: 0, limit: 10 } }).entities || []).forEach(function (t) {
        gs.print('=== ' + t.Name + ' (' + t.id + ')');
        names.forEach(function (n) {
            var v = t[n];
            v = v === null || v === undefined ? '' : (typeof v == 'object' ? (v.id || JSON.stringify(v)) : String(v));
            gs.print('    ' + n + ' = ' + v);
        });
    });
} catch (err) { gs.print('ERROR: ' + err); }
