// Background Script (read-only): Adaptive risk values (from the staging table) next to the ServiceNow risk choices,
// so the State / Risk state / Probability / Impact mappings can be agreed. Changes nothing.

// 1. Values Adaptive sent, with counts
['u_state', 'u_status', 'u_risk_impact', 'u_impact_rating', 'u_priority', 'u_category'].forEach(function (col) {
    var ga = new GlideAggregate('u_import_adaptive_risks');
    ga.addAggregate('COUNT');
    ga.groupBy(col);
    ga.query();
    var out = [];
    while (ga.next()) out.push('[' + ga.getValue(col) + '] ' + ga.getAggregate('COUNT'));
    gs.print('ADAPTIVE ' + col + ': ' + out.join(' | '));
});

// 2. Choices on the ServiceNow risk fields (the table the transform targets)
var map = new GlideRecord('sys_transform_map');
map.addQuery('source_table', 'u_import_adaptive_risks');
map.query();
var target = map.next() ? map.getValue('target_table') : 'risk';
gs.print('\nTarget table: ' + target);
['state', 'risk_state', 'probability', 'impact'].forEach(function (f) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', target);
    c.addQuery('element', f);
    c.addQuery('inactive', '!=', true);
    c.orderBy('sequence');
    c.query();
    var out = [];
    while (c.next()) out.push(c.getValue('value') + '=' + c.getValue('label'));
    gs.print('SERVICENOW ' + f + ': ' + (out.join(' | ') || '(no choices on ' + target + ' - may be inherited or not a choice field)'));
});
