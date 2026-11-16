// Background Script (read-only): a project's Total Budget vs its Project Funding records (duplicates? amounts?).
var PROJECT = 'PRJ0011175';   // ✏️ Powdersville in this instance
var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    gs.print(PROJECT + ' Total Budget (budget_cost) = ' + p.getValue('budget_cost') + ' | total planned cost = ' + p.getValue('cost'));
    var f = new GlideRecord('project_funding');
    f.addQuery('task', p.getUniqueValue());
    f.orderBy('sys_created_on');
    f.query();
    var sum = 0;
    while (f.next()) {
        sum += parseFloat(f.getValue('budget')) || 0;
        gs.print('funding ' + f.getUniqueValue() + ' | fiscal year ' + f.getDisplayValue('fiscal_period') + ' | state ' + f.getValue('state') +
            ' | capex ' + f.getValue('capex_budget') + ' | opex ' + f.getValue('opex_budget') + ' | budget ' + f.getValue('budget') +
            ' | created ' + f.getValue('sys_created_on') + ' by ' + f.getValue('sys_created_by'));
    }
    gs.print('funding records: ' + f.getRowCount() + ' | sum of their budget: ' + sum);
}
