// Background Script (read-only): are the per-row lookups the transforms make fast in THIS instance?
// Every task / time card / status row looks records up by correlation_id, email, user+task+week or project+date.
// On a big instance (task table with millions of incidents etc.) a lookup on a field WITHOUT a database index
// scans the table - seconds per row. This times each lookup the transforms use (average of N tries).
var N = 10;
function time(label, fn) {
    var t0 = new Date().getTime();
    for (var i = 0; i < N; i++) fn(i);
    var ms = Math.round((new Date().getTime() - t0) / N);
    gs.print((ms > 50 ? 'SLOW  ' : 'ok    ') + ms + ' ms | ' + label);
}
function sample(table, field, q) {
    var g = new GlideRecord(table);
    if (q) g.addEncodedQuery(q);
    g.addNotNullQuery(field);
    g.setLimit(N);
    g.query();
    var v = [];
    while (g.next()) v.push(g.getValue(field));
    return v.length ? v : ['none'];
}
var tc = sample('pm_project_task', 'correlation_id', 'correlation_idSTARTSWITHADAPTIVE:');
time('pm_project_task by correlation_id (tasks PART A + coalesce, time cards)', function (i) {
    var g = new GlideRecord('pm_project_task'); g.get('correlation_id', tc[i % tc.length]); });
var pc = sample('pm_project', 'correlation_id', 'correlation_idSTARTSWITHADAPTIVE:');
time('pm_project by correlation_id', function (i) { var g = new GlideRecord('pm_project'); g.get('correlation_id', pc[i % pc.length]); });
time('dmn_demand by correlation_id', function (i) { var g = new GlideRecord('dmn_demand'); g.get('correlation_id', pc[i % pc.length]); });
var em = sample('sys_user', 'email', 'active=true');
time('sys_user by email (owners, time card users)', function (i) { var g = new GlideRecord('sys_user'); g.get('email', em[i % em.length]); });
var card = new GlideRecord('time_card'); card.setLimit(1); card.query(); card.next();
time('time_card by user + task + week (time card coalesce)', function () {
    var g = new GlideRecord('time_card'); g.addQuery('user', card.getValue('user')); g.addQuery('task', card.getValue('task'));
    g.addQuery('week_starts_on', card.getValue('week_starts_on')); g.query(); g.next(); });
var ps = new GlideRecord('project_status'); ps.setLimit(1); ps.query(); ps.next();
time('project_status by project + as_on (status history coalesce)', function () {
    var g = new GlideRecord('project_status'); g.addQuery('project', ps.getValue('project')); g.addQuery('as_on', ps.getValue('as_on')); g.query(); g.next(); });
gs.print('SLOW lines: ask the platform team for a database index on that field (e.g. task.correlation_id, sys_user.email).');
