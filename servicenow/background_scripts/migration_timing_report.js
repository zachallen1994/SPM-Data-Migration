// Background Script (read-only): how long each migration step took, from ServiceNow's own records.
// For every import set created since SINCE: data source, rows, LOAD time (first -> last staging row) and each
// TRANSFORM run (Transform History) with its start / end and counts. Run it at the end of the timing test.
var SINCE = '2026-11-19 00:00:00';     // ✏️ start of the test (instance time zone shown in the output is UTC)
function mins(a, b) {
    if (!a || !b) return '?';
    var m = (new GlideDateTime(b).getNumericValue() - new GlideDateTime(a).getNumericValue()) / 60000;
    return m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
}
var s = new GlideRecord('sys_import_set');
s.addQuery('sys_created_on', '>=', SINCE);
s.orderBy('sys_created_on');
s.query();
while (s.next()) {
    var rows = new GlideAggregate('sys_import_set_row');
    rows.addQuery('sys_import_set', s.getUniqueValue());
    rows.addAggregate('COUNT'); rows.addAggregate('MIN', 'sys_created_on'); rows.addAggregate('MAX', 'sys_created_on');
    rows.query();
    var n = 0, first = '', last = '';
    if (rows.next()) { n = rows.getAggregate('COUNT'); first = rows.getAggregate('MIN', 'sys_created_on'); last = rows.getAggregate('MAX', 'sys_created_on'); }
    gs.print(s.getValue('number') + ' | ' + (s.getDisplayValue('data_source') || s.getValue('table_name')) + ' | rows ' + n +
        ' | LOAD ' + (first || s.getValue('sys_created_on')) + ' -> ' + last + ' = ' + mins(s.getValue('sys_created_on'), last));
    var run = new GlideRecord('sys_import_set_run');
    run.addQuery('set', s.getUniqueValue());
    run.orderBy('sys_created_on');
    run.query();
    while (run.next()) {
        var line = '      TRANSFORM ' + run.getValue('sys_created_on') + ' -> ' + run.getValue('sys_updated_on') + ' = ' +
            mins(run.getValue('sys_created_on'), run.getValue('sys_updated_on'));
        ['state', 'total', 'inserts', 'updates', 'ignored', 'skipped', 'errors'].forEach(function (f) {
            if (run.isValidField(f) && run.getValue(f)) line += ' | ' + f + ' ' + run.getValue(f);
        });
        gs.print(line);
    }
}
