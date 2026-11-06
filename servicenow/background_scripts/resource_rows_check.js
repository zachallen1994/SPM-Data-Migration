// Background Script (read-only): what is in a big Resources load? Project-level team vs task-level assignments,
// people without a ServiceNow user, and links that already ended. Helps decide what to load (and what to skip).
var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'u_import_adaptive_resources');
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (!set.next()) gs.print('No resources import set');
else {
    var id = set.getUniqueValue(), today = new GlideDate().getValue();
    function count(q) { var g = new GlideAggregate('u_import_adaptive_resources'); g.addQuery('sys_import_set', id);
        if (q) g.addEncodedQuery(q); g.addAggregate('COUNT'); g.query(); return g.next() ? g.getAggregate('COUNT') : 0; }
    gs.print('Import set ' + set.getValue('number') + ': ' + count('') + ' rows');
    gs.print('  on a PROJECT / demand (team): ' + count('u_project_correlation_idLIKE/Project/'));
    gs.print('  on a TASK (task assignment):  ' + count('u_project_correlation_idLIKE/Task/'));
    gs.print('  already ended (End Date before today): ' + count('u_end_dateISNOTEMPTY^u_end_date<' + today));
    var st = new GlideAggregate('u_import_adaptive_resources');
    st.addQuery('sys_import_set', id); st.addAggregate('COUNT'); st.groupBy('sys_import_state'); st.query();
    while (st.next()) gs.print('  rows ' + st.getDisplayValue('sys_import_state') + ': ' + st.getAggregate('COUNT'));
    var people = new GlideAggregate('u_import_adaptive_resources');
    people.addQuery('sys_import_set', id); people.addAggregate('COUNT'); people.groupBy('u_resource_email'); people.query();
    var n = 0, missing = 0;
    while (people.next()) { n++; var u = new GlideRecord('sys_user'); if (!u.get('email', people.getValue('u_resource_email'))) missing++; }
    gs.print('  different people: ' + n + ' | without a ServiceNow user (their rows do nothing): ' + missing);
}
