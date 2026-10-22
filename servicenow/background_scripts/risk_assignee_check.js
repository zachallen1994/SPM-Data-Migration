// Background Script (read-only): Adaptive Risk fields that could be the assignee, and their values on one risk.
var TITLE = 'Increased tariffs';   // ✏️ a risk title
var ENTITY = 'Risk';               // ✏️ or 'Issue'
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    return JSON.parse(r.execute().getBody());
}
var names = [];
call('GET', '/metadata/describeEntities?typeNames=' + ENTITY).entityDescriptions[0].fields.forEach(function (f) {
    if (/assign|owner|responsib|manager|resource/i.test(f.name + ' ' + f.label)) {
        names.push(f.name);
        gs.print(f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
    }
});
var s = call('POST', '/data/query', { q: 'SELECT Title, ' + names.join(', ') + ' FROM ' + ENTITY + " WHERE Title = '" + TITLE.replace(/'/g, "''") + "'", paging: { from: 0, limit: 3 } });
(s.entities || []).forEach(function (e) { gs.print(JSON.stringify(e)); });
