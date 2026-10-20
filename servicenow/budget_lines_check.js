// Background Script (read-only): one project's Adaptive budget lines (NonLaborResourceLink) and their monthly
// phasing (NonLaborResourceTimePhase), plus the ServiceNow cost plan fields and cost types. Changes nothing.
var PROJECT_ID = '/Project/3u5rj0e5dr5h22knjooae2hp4624';   // Wyandot (from the discovery output)
function q(title, czql) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: czql, paging: { from: 0, limit: 25 } }));
    var res = r.execute();
    gs.print('==== ' + title + '  [' + res.getStatusCode() + ']');
    if (res.getStatusCode() != 200) { gs.print(res.getBody()); return []; }
    var rows = JSON.parse(res.getBody()).entities || [];
    gs.print('rows: ' + rows.length);
    rows.forEach(function (e) { gs.print('  ' + JSON.stringify(e)); });
    return rows;
}

// 1. Budget lines of the project (expect Vendor Services Opex 3,465 / Labor Opex 36,920 / Contingency Opex 3,692)
var lines = q('1. Budget lines', 'SELECT NonLaborResource, NonLaborResource.Name, ExpenseType, Billable, PlannedBudget, ' +
    "ActualCost, ForecastCost, DefaultCurrency, C_Category, Description FROM NonLaborResourceLink WHERE WorkItem = '" + PROJECT_ID + "'");

// 2. Monthly phasing of the first line
if (lines.length) q('2. Months of the first line', 'SELECT Date, FiscalMonth, PlannedBudget, C_BudgetCostTest, ActualCost, ' +
    "ForecastCost, Aggregated FROM NonLaborResourceTimePhase WHERE RelatedLink = '" + lines[0].id + "'");

// 3. ServiceNow cost_plan fields and the cost types its Cost type field points at
gs.print('==== 3. cost_plan fields');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'cost_plan');
d.addNotNullQuery('element');
d.query();
var typeTable = '';
while (d.next()) {
    gs.print('  ' + d.getValue('element') + ' | ' + d.getValue('column_label') + ' | ' + d.getValue('internal_type') +
        (d.getValue('reference') ? ' -> ' + d.getValue('reference') : '') + (d.getValue('mandatory') == '1' ? ' | MANDATORY' : ''));
    if (d.getValue('column_label') == 'Cost type' && d.getValue('reference')) typeTable = d.getValue('reference');
}
if (typeTable) {
    gs.print('==== 4. Cost types (' + typeTable + ')');
    var t = new GlideRecord(typeTable);
    t.query();
    while (t.next()) gs.print('  ' + t.getDisplayValue());
}
