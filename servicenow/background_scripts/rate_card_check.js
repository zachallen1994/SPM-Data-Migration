// Background Script (read-only): where can Adaptive "Rate Card" go in ServiceNow?
// 1) reference fields on project / project task whose table or label mentions "rate" + the records in that table
// 2) the Rate Card names used by active Adaptive projects
var seen = {};
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'IN', 'pm_project,pm_project_task,planned_task,task');
d.addQuery('internal_type', 'reference');
d.query();
while (d.next()) {
    var ref = d.getValue('reference') || '', label = d.getValue('column_label') || '';
    if (!/rate/i.test(ref + ' ' + label + ' ' + d.getValue('element'))) continue;
    gs.print('field: ' + d.getValue('name') + '.' + d.getValue('element') + ' | "' + label + '" -> ' + ref);
    if (seen[ref]) continue;
    seen[ref] = true;
    var r = new GlideRecord(ref);
    if (!r.isValid()) continue;
    r.setLimit(20); r.query();
    while (r.next()) gs.print('   ' + ref + ' record: ' + r.getDisplayValue() + (r.isValidField('active') ? ' | active ' + r.getValue('active') : ''));
}
try {
    var rq = new sn_ws.RESTMessageV2();
    rq.setHttpMethod('POST');
    rq.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    rq.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    rq.setRequestHeader('Content-Type', 'application/json');
    var names = {}, paging = { from: 0, limit: 100 };
    while (true) {
        rq.setRequestBody(JSON.stringify({ q: 'SELECT RateCard.Name, State FROM Project', paging: paging }));
        var b = JSON.parse(rq.execute().getBody());
        (b.entities || []).forEach(function (e) {
            var st = e.State && e.State.id ? e.State.id.split('/').slice(2).join('/') : '';
            if (st != 'Active' && st != 'On Hold') return;
            var n = e.RateCard && e.RateCard.Name ? e.RateCard.Name : '(none)';
            names[n] = (names[n] || 0) + 1;
        });
        if (!b.paging || !b.paging.hasMore) break;
        paging = b.paging;
    }
    for (var n in names) gs.print('Adaptive rate card on active projects: ' + n + ' | ' + names[n]);
} catch (err) { gs.print('Adaptive ERROR: ' + err); }
