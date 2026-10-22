// Background Script (read-only): lessons learned per project, and the related-list relationship that queries the
// non-existent field u_demand (which makes the demand form show every lesson).
var g = new GlideAggregate('u_lessons_learned');
g.addAggregate('COUNT'); g.groupBy('u_project'); g.query();
while (g.next()) gs.print('[' + g.u_project.getDisplayValue() + '] ' + g.getAggregate('COUNT'));
var r = new GlideRecord('sys_relationship');
r.addQuery('query_with', 'CONTAINS', 'u_demand').addOrCondition('basic_query_from', 'u_lessons_learned');
r.query();
while (r.next()) gs.print('relationship: ' + r.getValue('name') + ' | applies to ' + r.getValue('basic_apply_to') + ' | queries ' + r.getValue('basic_query_from'));
