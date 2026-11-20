// Background Script (read-only): WHY did rows of an import set error or get ignored? Grouped, with counts.
// For each import set: rows per state, then every distinct error message (and ignore reason) with how many rows and
// one example row (its key columns). Record numbers / sys_ids in messages are blanked so identical causes group together.
var SETS = ['ISET23876770', 'ISET23876771'];   // ✏️ import set numbers (e.g. Resources, Time Entries)
var EXAMPLE_COLS = ['u_resource_email', 'u_resource_name', 'u_project_correlation_id', 'u_task_correlation_id', 'u_week_starts_on', 'u_total', 'u_name'];
function norm(m) {
    return String(m || '(no message)').replace(/\^[0-9a-f]{32}/g, '').replace(/[0-9a-f]{32}/g, '<id>')
        .replace(/\b(PRJ|PRJTASK|DMND|TC)\d+/g, '<num>').substring(0, 300);
}
SETS.forEach(function (num) {
    var set = new GlideRecord('sys_import_set');
    if (!set.get('number', num)) { gs.print(num + ': not found'); return; }
    gs.print('===== ' + num + ' | ' + set.getDisplayValue('data_source') + ' | table ' + set.getValue('table_name'));
    var st = new GlideAggregate(set.getValue('table_name'));
    st.addQuery('sys_import_set', set.getUniqueValue());
    st.addAggregate('COUNT');
    st.groupBy('sys_import_state');
    st.query();
    var states = [];
    while (st.next()) states.push(st.getValue('sys_import_state') + ' ' + st.getAggregate('COUNT'));
    gs.print('rows by state: ' + states.join(' | '));
    ['error', 'ignored'].forEach(function (state) {
        var groups = {};
        var r = new GlideRecord(set.getValue('table_name'));
        r.addQuery('sys_import_set', set.getUniqueValue());
        r.addQuery('sys_import_state', state);
        r.query();
        while (r.next()) {
            var msg = state == 'error'
                ? (r.sys_row_error.nil() ? r.getValue('sys_import_state_comment') : r.sys_row_error.message + '')
                : r.getValue('sys_import_state_comment');
            var k = norm(msg);
            if (!groups[k]) {
                var ex = [];
                EXAMPLE_COLS.forEach(function (c) { if (r.isValidField(c) && r.getValue(c)) ex.push(c.replace('u_', '') + '=' + r.getValue(c)); });
                groups[k] = { n: 0, example: 'row ' + r.getValue('sys_import_row') + ' ' + ex.join(' ') };
            }
            groups[k].n++;
        }
        Object.keys(groups).sort(function (a, b) { return groups[b].n - groups[a].n; }).forEach(function (k) {
            gs.print(state.toUpperCase() + ' x' + groups[k].n + ': ' + k + '\n      e.g. ' + groups[k].example);
        });
    });
    // warnings / errors written by our scripts (log.warn), grouped the same way
    var lg = new GlideAggregate('import_log');
    lg.addQuery('import_set', set.getUniqueValue());
    lg.addQuery('level', 'IN', '1,2');   // 1 warning, 2 error
    lg.addAggregate('COUNT');
    lg.groupBy('message');
    lg.query();
    var logs = {};
    while (lg.next()) { var k2 = norm(lg.getValue('message')).replace(/ on .*$/, ' on ...').replace(/<[^>]+@[^>]+>/, '<email>'); logs[k2] = (logs[k2] || 0) + parseInt(lg.getAggregate('COUNT'), 10); }
    Object.keys(logs).sort(function (a, b) { return logs[b] - logs[a]; }).slice(0, 25).forEach(function (k) { gs.print('LOG x' + logs[k] + ': ' + k); });
});
