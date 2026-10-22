// Background Script (read-only): Adaptive Risk field names for Probability, Risk Strategy, Importance, Trigger Event
// and Assignee, with their values on one risk. Changes nothing.
var TITLE = 'Joint Commission survey follow-up';   // ✏️ a risk title
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
call('GET', '/metadata/describeEntities?typeNames=Risk').entityDescriptions[0].fields.forEach(function (f) {
    if (/probab|strateg|importan|trigger|assign|owner|resolv|resolution/i.test(f.name + ' ' + f.label)) {
        names.push(f.name);
        gs.print(f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
    }
});
var s = call('POST', '/data/query', { q: 'SELECT Title, ' + names.join(', ') + " FROM Risk WHERE Title = '" + TITLE.replace(/'/g, "''") + "'", paging: { from: 0, limit: 2 } });
(s.entities || []).forEach(function (e) { gs.print(JSON.stringify(e)); });
