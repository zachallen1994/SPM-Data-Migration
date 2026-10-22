// Background Script (read-only): time card hours in ServiceNow vs Adaptive for one project, plus duplicates.
var ADAPTIVE_ID = '/Project/{05506AB6-EF2D-4C34-A15F-2058DB718D4C}';   // ✏️ Willow
var proj = new GlideRecord('pm_project');
if (!proj.get('correlation_id', 'ADAPTIVE:' + ADAPTIVE_ID)) gs.print('Project not in ServiceNow');
var ids = [proj.getUniqueValue()];
var t = new GlideRecord('pm_project_task');
t.addQuery('top_task', proj.getUniqueValue());
t.query();
while (t.next()) ids.push(t.getUniqueValue());
var ga = new GlideAggregate('time_card');
ga.addQuery('task', 'IN', ids.join(','));
ga.addAggregate('COUNT'); ga.addAggregate('SUM', 'total'); ga.query();
if (ga.next()) gs.print('ServiceNow: ' + ga.getAggregate('COUNT') + ' cards, ' + ga.getAggregate('SUM', 'total') + ' h');
var d = new GlideAggregate('time_card');
d.addQuery('task', 'IN', ids.join(','));
d.addAggregate('COUNT'); d.groupBy('user'); d.groupBy('task'); d.groupBy('week_starts_on');
d.addHaving('COUNT', '>', 1); d.query();
var dups = 0; while (d.next()) dups++;
gs.print('Duplicate person/task/week groups: ' + dups);
// Adaptive hours by timesheet state
var r = new sn_ws.RESTMessageV2();
r.setHttpMethod('POST');
r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
r.setRequestHeader('Content-Type', 'application/json');
var byState = {}, paging = { from: 0, limit: 100 };
while (true) {
    r.setRequestBody(JSON.stringify({ q: "SELECT Duration, State FROM Timesheet WHERE Project = '" + ADAPTIVE_ID + "'", paging: paging }));
    var b = JSON.parse(r.execute().getBody());
    b.entities.forEach(function (e) {
        var s = e.State && e.State.id ? e.State.id.split('/').pop() : '(none)';
        var v = e.Duration || {}, h = parseFloat(v.value) || 0, un = String(v.unit || '').toLowerCase();
        byState[s] = (byState[s] || 0) + (un.indexOf('day') == 0 ? h * 8 : un.indexOf('min') == 0 ? h / 60 : h);
    });
    if (!b.paging || !b.paging.hasMore) break;
    paging = b.paging;
}
for (var s in byState) gs.print('Adaptive ' + s + ': ' + byState[s].toFixed(1) + ' h');
