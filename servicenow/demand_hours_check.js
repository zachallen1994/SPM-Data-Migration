// Background Script (read-only): where Adaptive keeps the logged time of one demand. Changes nothing.
var NAME = '26235-00000-GBS Global Billing Information Widget';   // ✏️ exact Adaptive name (check the space after 26235)
function q(czql) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: czql, paging: { from: 0, limit: 100 } }));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ERROR ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300)); return []; }
    return JSON.parse(res.getBody()).entities || [];
}
function hours(rows) {
    var h = 0;
    rows.forEach(function (t) { var v = t.Duration || {}, n = parseFloat(v.value) || 0, u = String(v.unit || '').toLowerCase();
        h += u.indexOf('day') == 0 ? n * 8 : u.indexOf('min') == 0 ? n / 60 : n; });
    return h;
}
var p = q("SELECT Name FROM Project WHERE Name = '" + NAME.replace(/'/g, "''") + "'");
if (!p.length) gs.print('Not found - check NAME (spaces, dashes)');
else {
    var id = p[0].id;
    gs.print('Demand: ' + id);
    var a = q("SELECT Duration, ReportedDate, WorkItem, State FROM Timesheet WHERE Project = '" + id + "'");
    gs.print('1. Timesheet.Project = demand: ' + a.length + ' entries, ' + hours(a) + ' h');
    var b = q("SELECT Duration, ReportedDate, State FROM Timesheet WHERE WorkItem = '" + id + "'");
    gs.print('2. Timesheet.WorkItem = demand: ' + b.length + ' entries, ' + hours(b) + ' h');
    a.slice(0, 5).concat(b.slice(0, 5)).forEach(function (t) { gs.print('   ' + JSON.stringify(t)); });
    var c = q("SELECT ActualEffort FROM Project WHERE Name = '" + NAME.replace(/'/g, "''") + "'");
    gs.print('3. Project.ActualEffort (Adaptive roll-up): ' + JSON.stringify(c.length ? c[0].ActualEffort : null));
}
