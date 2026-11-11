// Background Script (read-only): the State field on a project shows a raw value ("2") - which state choices exist?
['pm_project', 'dmn_demand', 'planned_task', 'task'].forEach(function (t) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', t); c.addQuery('element', 'state'); c.orderBy('sequence'); c.query();
    while (c.next()) gs.print(t + '.state: ' + c.getValue('value') + ' = ' + c.getValue('label') + (c.getValue('inactive') == '1' ? '  (INACTIVE)' : '') +
        (c.getValue('language') && c.getValue('language') != 'en' ? '  [' + c.getValue('language') + ']' : ''));
});
var g = new GlideAggregate('pm_project');
g.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
g.addAggregate('COUNT'); g.groupBy('state'); g.query();
while (g.next()) gs.print('migrated projects with state value "' + g.getValue('state') + '" (shows "' + g.getDisplayValue('state') + '"): ' + g.getAggregate('COUNT'));
