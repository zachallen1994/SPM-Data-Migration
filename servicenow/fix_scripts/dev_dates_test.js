// DEV ONLY - Background Script: test project dates on INSERT without deleting a real project.
// MODE 'create': copies one staging row of the latest projects import set with a FAKE Correlation ID and name, so
//   the next transform of that import set INSERTS a test project (real projects just update).
// Then: transform the import set (Projects + Demands maps) and check the test project's planned start / end.
// MODE 'remove': deletes the test project(s) and the test staging row(s). Nothing real is touched.
var MODE = 'create';                                  // ✏️ 'create' | 'remove'
var COPY_FROM = '25392-00000-ENT Waystar Auth Submit and Auth Status';   // ✏️ part of a staging row's name
var TAG = '[DATES TEST] ';
var FAKE_ID = 'ADAPTIVE:/Project/DATES-TEST';

if (MODE == 'create') {
    var set = new GlideRecord('sys_import_set');
    set.addQuery('table_name', 'u_import_adaptive_projects');
    set.orderByDesc('sys_created_on'); set.setLimit(1); set.query();
    if (!set.next()) gs.print('No projects import set');
    else {
        var r = new GlideRecord('u_import_adaptive_projects');
        r.addQuery('sys_import_set', set.getUniqueValue());
        r.addQuery('u_name', 'CONTAINS', COPY_FROM);
        r.setLimit(1); r.query();
        if (!r.next()) gs.print('No staging row containing ' + COPY_FROM + ' in ' + set.getValue('number'));
        else {
            r.setValue('u_correlation_id', FAKE_ID);
            r.setValue('u_name', TAG + r.getValue('u_name'));
            r.setValue('sys_import_state', 'pending');
            r.setValue('sys_target_sys_id', '');
            var id = r.insert();                              // a copy of the row, same import set
            gs.print('Test row added to ' + set.getValue('number') + ' (' + id + '): Schedule Start ' + r.getValue('u_schedule_start') +
                ' -> Finish ' + r.getValue('u_schedule_finish') + ' | phase ' + r.getValue('u_portfolio_phase') + '. Now transform that import set.');
        }
    }
} else {
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        g.addQuery('correlation_id', FAKE_ID);
        g.query();
        while (g.next()) { gs.print('Removing test ' + t + ' ' + g.getValue('number')); g.deleteRecord(); }
    });
    var s = new GlideRecord('u_import_adaptive_projects');
    s.addQuery('u_correlation_id', FAKE_ID);
    s.query();
    while (s.next()) { gs.print('Removing test staging row'); s.deleteRecord(); }
}
