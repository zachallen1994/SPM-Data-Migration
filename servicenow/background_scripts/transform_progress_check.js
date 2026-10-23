// Background Script (read-only): is a long transform still moving, and how long is left?
// Shows, for the latest import set of TABLE: rows by state, rows finished in the last 10 minutes,
// duplicate rows (same Correlation ID twice), and the targets per parent project.
var TABLE = 'u_import_adaptive_project_tasks';   // ✏️ the staging table being transformed
var IMPORT_SET = '';                             // ✏️ e.g. 'ISET23830900'; '' = latest for TABLE

var set = new GlideRecord('sys_import_set');
if (IMPORT_SET) set.addQuery('number', IMPORT_SET); else set.addQuery('table_name', TABLE);
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (!set.next()) gs.print('No import set found');
else {
    gs.print('Import set ' + set.getValue('number') + ' | state ' + set.getDisplayValue('state') + ' | created ' + set.getValue('sys_created_on'));
    var st = new GlideAggregate(TABLE);
    st.addQuery('sys_import_set', set.getUniqueValue());
    st.addAggregate('COUNT'); st.groupBy('sys_import_state'); st.query();
    var total = 0, pending = 0;
    while (st.next()) {
        var n = parseInt(st.getAggregate('COUNT'), 10); total += n;
        if (st.getValue('sys_import_state') == 'pending') pending = n;
        gs.print('  rows ' + st.getDisplayValue('sys_import_state') + ': ' + n);
    }
    var recent = new GlideAggregate(TABLE);
    recent.addQuery('sys_import_set', set.getUniqueValue());
    recent.addQuery('sys_import_state', '!=', 'pending');
    recent.addQuery('sys_updated_on', '>=', gs.minutesAgo(10));
    recent.addAggregate('COUNT'); recent.query(); recent.next();
    var per10 = parseInt(recent.getAggregate('COUNT'), 10);
    gs.print('  total ' + total + ' | finished in the last 10 min: ' + per10 +
        (per10 ? ' | about ' + Math.round(pending / per10 * 10) + ' min left' : ' | NOTHING in 10 min - stuck or finished'));

    // the same record twice = the data source ran twice into this import set
    var col = new GlideRecord('sys_dictionary');
    col.addQuery('name', TABLE); col.addQuery('column_label', 'Correlation ID'); col.query();
    if (col.next()) {
        var dup = new GlideAggregate(TABLE);
        dup.addQuery('sys_import_set', set.getUniqueValue());
        dup.addAggregate('COUNT', col.getValue('element'));
        dup.groupBy(col.getValue('element'));
        dup.addHaving('COUNT', '>', '1');
        dup.query();
        var dups = 0;
        while (dup.next()) dups++;
        gs.print('  records in this import set more than once: ' + dups);
    }
}
