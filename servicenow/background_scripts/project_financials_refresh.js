// Background Script (CHANGES DATA - DRY_RUN first): refresh one project's financial totals from its cost plans.
// The project header (Total planned cost, Planned capital / operating, Total Budget) is calculated by business rules
// when cost plans / funding records are saved. After re-runs (or loads with business rules off) it can be stale while
// the cost plans themselves are right. This:
//   1) re-saves every cost plan of the project (business rules ON) -> planned cost / capital / operating roll up again
//   2) deletes the project's funding records and creates them again from the cost plans (one per fiscal year,
//      Capex / Opex by the cost type name) -> "Update total budget" recalculates Total Budget from scratch
var DRY_RUN = true;               // ✏️ true = only show; false = refresh
var PROJECT = 'PRJ0011175';       // ✏️ project number in this instance
gs.print('project_financials_refresh VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'REFRESHING'));

var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) { gs.print('No project ' + PROJECT); }
else {
    var pid = p.getUniqueValue();
    gs.print('before: Total planned cost ' + p.getValue('cost') + ' | Total Budget ' + p.getValue('budget_cost'));
    var byYear = {}, total = 0, n = 0;
    var cp = new GlideRecord('cost_plan');
    cp.addQuery('task', pid);
    cp.query();
    while (cp.next()) {
        var amt = (parseFloat(cp.getValue('unit_cost')) || 0) * (parseFloat(cp.getValue('quantity')) || 1);
        var fy = cp.start_fiscal_period.fiscal_year + '' || '';
        if (!fy) {                                              // fiscal year of the start period, by its dates
            var y = new GlideRecord('fiscal_period');
            y.addQuery('fiscal_type', 'year');
            y.addQuery('fiscal_start_date_time', '<=', cp.start_fiscal_period.fiscal_start_date_time + '');
            y.addQuery('fiscal_end_date_time', '>=', cp.start_fiscal_period.fiscal_start_date_time + '');
            y.setLimit(1); y.query();
            fy = y.next() ? y.getUniqueValue() : '';
        }
        var opex = /opex/i.test(cp.getDisplayValue('resource_type') + ' ' + cp.getValue('name'));
        byYear[fy] = byYear[fy] || { capex: 0, opex: 0 };
        if (opex) byYear[fy].opex += amt; else byYear[fy].capex += amt;
        total += amt; n++;
        gs.print('  cost plan ' + cp.getValue('name') + ' | ' + amt + (opex ? ' (opex)' : ' (capex)'));
        if (!DRY_RUN) { cp.setForceUpdate(true); cp.update(); }
    }
    gs.print('cost plans: ' + n + ' | sum ' + Math.round(total * 100) / 100);
    var f = new GlideRecord('project_funding');
    f.addQuery('task', pid);
    f.query();
    gs.print('funding records now: ' + f.getRowCount() + (DRY_RUN ? ' (would be replaced)' : ' (replaced)'));
    if (!DRY_RUN) {
        while (f.next()) f.deleteRecord();
        for (var k in byYear) {
            if (!k) { gs.print('  no fiscal year for some cost plans - funding not created for them'); continue; }
            var nf = new GlideRecord('project_funding');
            nf.initialize();
            nf.setValue('task', pid);
            nf.setValue('fiscal_period', k);
            nf.setValue('capex_budget', Math.round(byYear[k].capex * 100) / 100);
            nf.setValue('opex_budget', Math.round(byYear[k].opex * 100) / 100);
            nf.insert();
        }
        p.get(pid);
        gs.print('after: Total planned cost ' + p.getValue('cost') + ' | Total Budget ' + p.getValue('budget_cost'));
    }
}
