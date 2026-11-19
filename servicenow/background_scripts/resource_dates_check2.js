// Background Script (read-only): which Adaptive resource-link dates match the Resource Planning View?
// Prints EVERY date field on RegularResourceLink for a few people of one project. Compare with Adaptive: e.g.
// Andrea Smith 9.9 h at 0.33 h/week = ~30 weeks ending at the project finish -> starts about Aug 2026.
var PROJECT = '25255-19488-GVL Powdersville MOB';    // ✏️ exact Adaptive project name
var PEOPLE = ['Andrea Smith', 'Amanda Keller', 'Joe Turlo', 'Brittney Lambert'];   // ✏️ [] = everyone
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw path + ' ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300);
    return JSON.parse(res.getBody());
}
try {
    var f = call('GET', '/metadata/describeEntities?typeNames=RegularResourceLink').entityDescriptions[0].fields
        .filter(function (x) { return /date|time/i.test(x.type) || /start|end|finish|date/i.test(x.name); });
    gs.print('date fields: ' + f.map(function (x) { return x.name + ' "' + (x.label || '') + '"'; }).join(', '));
    var p = call('POST', '/data/query', { q: "SELECT Name, StartDate, DueDate FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'", paging: { from: 0, limit: 1 } }).entities[0];
    gs.print('project ' + String(p.StartDate).substring(0, 10) + ' -> ' + String(p.DueDate).substring(0, 10));
    var links = call('POST', '/data/query', { q: 'SELECT Resource.Name, TotalAssignment, Work, ' + f.map(function (x) { return x.name; }).join(', ') +
        " FROM RegularResourceLink WHERE WorkItem = '" + p.id + "'", paging: { from: 0, limit: 100 } }).entities || [];
    links.forEach(function (l) {
        var nm = l.Resource ? l.Resource.Name : '';
        if (PEOPLE.length && PEOPLE.indexOf(nm) < 0) return;
        var line = nm + ' | total ' + JSON.stringify(l.TotalAssignment) + ' | work ' + JSON.stringify(l.Work);
        f.forEach(function (x) { if (l[x.name]) line += ' | ' + x.name + ' ' + String(l[x.name]).substring(0, 10); });
        gs.print(line);
    });
} catch (err) { gs.print('ERROR: ' + err); }
