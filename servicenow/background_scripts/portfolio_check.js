// Background Script (read-only): before loading the Construction projects under the "Construction" portfolio.
// Prints: which field on a project (and program) points to a portfolio, whether the "Construction" portfolio exists,
// and the construction projects / program already in ServiceNow with their current portfolio.
var NAME = 'Construction';    // ✏️ the ServiceNow portfolio name
['pm_project', 'pm_program'].forEach(function (table) {
    var tables = [table, 'planned_task', 'task'];          // the table and the tables it extends
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'IN', tables.join(','));
    d.addQuery('internal_type', 'reference');
    d.addQuery('reference', 'pm_portfolio');
    d.query();
    var found = [];
    while (d.next()) found.push(d.getValue('element') + ' ("' + d.getValue('column_label') + '", on ' + d.getValue('name') + ')');
    gs.print(table + ' portfolio field(s): ' + (found.join(', ') || 'NONE'));
});
var pf = new GlideRecord('pm_portfolio');
pf.addQuery('name', 'CONTAINS', NAME);
pf.query();
gs.print('Portfolios containing "' + NAME + '": ' + pf.getRowCount());
while (pf.next()) gs.print('   ' + pf.getValue('name') + ' | sys_id ' + pf.getUniqueValue() + ' | active ' + pf.getValue('active'));
var g = new GlideRecord('pm_program');
g.addQuery('short_description', 'CONTAINS', NAME);
g.query();
while (g.next()) {
    gs.print('program ' + g.getValue('number') + ' ' + g.getValue('short_description') + ' | portfolio ' + (g.isValidField('portfolio') ? g.getDisplayValue('portfolio') || '(empty)' : '(no field "portfolio")'));
    var p = new GlideRecord('pm_project');
    p.addQuery('primary_program', g.getUniqueValue());
    p.query();
    while (p.next()) gs.print('   project ' + p.getValue('number') + ' ' + p.getValue('short_description') + ' | ' + p.getValue('correlation_id') +
        (p.isValidField('primary_portfolio') ? ' | primary_portfolio ' + (p.getDisplayValue('primary_portfolio') || '(empty)') : ''));
}
var dm = new GlideRecord('dmn_demand');
dm.addQuery('short_description', 'CONTAINS', NAME);
dm.query();
while (dm.next()) gs.print('DEMAND (should be a project?) ' + dm.getValue('number') + ' ' + dm.getValue('short_description') + ' | ' + dm.getValue('correlation_id'));
