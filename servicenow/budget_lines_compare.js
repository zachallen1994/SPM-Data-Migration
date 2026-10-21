// Background Script (read-only): for one project, compare Adaptive's DIRECT and AGGREGATED budget lines and their
// monthly rows, and what landed in the staging table. Shows why some lines did not become cost plans.
var PROJECT_NAME = '23190-30060-ENT Epic Willow Ambulatory';   // ✏️ exact Adaptive name
function q(czql) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: czql, paging: { from: 0, limit: 100 } }));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ERROR ' + res.getStatusCode() + ': ' + res.getBody()); return []; }
    return JSON.parse(res.getBody()).entities || [];
}
function money(m) { return m && m.value !== undefined ? m.value : 0; }

var proj = q("SELECT Name FROM Project WHERE Name = '" + PROJECT_NAME.replace(/'/g, "''") + "'");
if (!proj.length) gs.print('Project not found - check PROJECT_NAME');
else {
    var pid = proj[0].id;
    gs.print('Project ' + pid);
    ['NonLaborResourceLinkDirect', 'NonLaborResourceLinkAggregated'].forEach(function (ent) {
        var lines = q("SELECT NonLaborResource.Name, ExpenseType FROM " + ent + " WHERE WorkItem = '" + pid + "'");
        gs.print('\n==== ' + ent + ': ' + lines.length + ' lines');
        lines.forEach(function (l) {
            var months = q("SELECT Date, C_BudgetCostTest, ActualCost FROM NonLaborResourceTimePhase WHERE RelatedLink = '" + l.id + "'");
            var total = 0;
            months.forEach(function (m) { total += parseFloat(money(m.C_BudgetCostTest)) || 0; });
            gs.print('  ' + (l.NonLaborResource ? l.NonLaborResource.Name : '?') + ' | months: ' + months.length + ' | budget total: ' + total);
        });
    });
    // What the staging table holds for this project
    var s = new GlideRecord('u_import_adaptive_budget_lines');
    s.addQuery('u_project_correlation_id', 'ADAPTIVE:' + pid);
    s.query();
    gs.print('\n==== Staging rows for the project: ' + s.getRowCount());
    while (s.next()) gs.print('  ' + s.getValue('u_cost_type') + ' | ' + s.getValue('u_month') + ' | ' + s.getValue('u_budget'));
}
