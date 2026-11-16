// Background Script (read-only): "Total Budget" (planned_task.budget_cost) is read only and filled by the rule
// "Update total budget" on project_funding. Shows project_funding's fields (mandatory ones), its choices, and one
// existing funding record (any project) so we know what a migrated funding record needs.
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'project_funding');
d.addQuery('element', '!=', '');
d.addQuery('element', 'NOT LIKE', 'sys_%');
d.query();
while (d.next()) gs.print('project_funding field: ' + d.getValue('element') + ' | "' + d.getValue('column_label') + '" | ' + d.getValue('internal_type') +
    (d.getValue('reference') ? ' -> ' + d.getValue('reference') : '') + (d.getValue('mandatory') == 'true' || d.getValue('mandatory') == '1' ? ' | MANDATORY' : ''));
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'project_funding');
c.query();
while (c.next()) gs.print('choice ' + c.getValue('element') + ': ' + c.getValue('value') + ' = ' + c.getValue('label'));
var f = new GlideRecord('project_funding');
f.setLimit(1);
f.query();
if (f.next()) {
    var fl = f.getFields();
    for (var i = 0; i < fl.size(); i++) { var e = fl.get(i); if (e.toString()) gs.print('example ' + e.getName() + ' = ' + e.getDisplayValue()); }
} else gs.print('No project_funding records in this instance');
var br = new GlideRecord('sys_script');
br.addQuery('collection', 'project_funding');
br.addQuery('active', true);
br.query();
while (br.next()) gs.print('rule on project_funding: ' + br.getValue('name') + ' | ' + br.getValue('when') + (br.getValue('condition') ? ' | condition ' + br.getValue('condition') : ''));
