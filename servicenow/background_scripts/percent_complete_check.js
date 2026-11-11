// Background Script (read-only): task % complete comes over as 0. Which staging column holds Adaptive's
// "Schedule % Complete", what does the field map to percent_complete read, and are the values there?
var STAGING = 'u_import_adaptive_project_tasks';
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', STAGING);
d.addQuery('column_label', 'CONTAINS', 'complete').addOrCondition('element', 'CONTAINS', 'complete');
d.query();
var cols = [];
while (d.next()) { cols.push(d.getValue('element')); gs.print('staging column: ' + d.getValue('element') + ' | label "' + d.getValue('column_label') + '" | ' + d.getValue('internal_type')); }
if (!cols.length) gs.print('NO staging column with "complete" in its name or label - add one labelled "% Complete"');

var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.source_table', STAGING);
fm.addQuery('target_field', 'percent_complete');
fm.query();
while (fm.next()) gs.print('field map: ' + fm.map.name + ' | source "' + (fm.getValue('source_field') || '[script]') + '" -> percent_complete | script ' + fm.getValue('use_source_script'));

cols.forEach(function (c) {
    var g = new GlideAggregate(STAGING);
    g.addNotNullQuery(c);
    g.addAggregate('COUNT'); g.query(); g.next();
    var s = new GlideRecord(STAGING);
    s.addNotNullQuery(c); s.setLimit(3); s.query();
    var ex = [];
    while (s.next()) ex.push(s.getValue('u_name') + ' = ' + s.getValue(c));
    gs.print('values in ' + c + ': ' + g.getAggregate('COUNT') + ' rows | e.g. ' + ex.join(' ; '));
});
