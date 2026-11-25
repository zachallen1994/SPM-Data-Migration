// Background Script (read-only): where do users' personal schedules come from, and does anything still use them?
// Answers, with evidence, before anyone clears sys_user.schedule:
//   1. How many active users have a schedule; how many DISTINCT schedules (shared, e.g. "8-5 weekdays", or personal)
//   2. For personal ones: who / what created them, when, entry types (on_call, time_off ...), newest entry date
//   3. What else points at these schedules (any reference field to cmn_schedule besides the user record)
//   4. Whether those users are on On-Call rotas (cmn_rota_member), and which scripts mention the user schedule field
var SAMPLE = 15;                                   // ✏️ personal schedules to print in detail
var u = new GlideAggregate('sys_user');
u.addQuery('active', true); u.addNotNullQuery('schedule'); u.groupBy('schedule'); u.addAggregate('COUNT'); u.query();
var shared = [], personal = [];
while (u.next()) { var n = parseInt(u.getAggregate('COUNT'), 10); (n > 1 ? shared : personal).push({ id: u.getValue('schedule'), n: n, name: u.getDisplayValue('schedule') }); }
gs.print('1. Active users with a schedule, by schedule: shared schedules ' + shared.length + ', personal (1 user) ' + personal.length);
shared.sort(function (a, b) { return b.n - a.n; }).slice(0, 10).forEach(function (s) { gs.print('   shared: "' + s.name + '" used by ' + s.n + ' users'); });

var creators = {}, types = {}, newest = {}, years = {};
personal.forEach(function (p, i) {
    var s = new GlideRecord('cmn_schedule');
    if (!s.get(p.id)) return;
    var cb = s.getValue('sys_created_by'); creators[cb] = (creators[cb] || 0) + 1;
    years[s.getValue('sys_created_on').substring(0, 4)] = (years[s.getValue('sys_created_on').substring(0, 4)] || 0) + 1;
    var e = new GlideRecord('cmn_schedule_span');
    e.addQuery('schedule', p.id); e.orderByDesc('start_date_time'); e.query();
    var line = [], last = '';
    while (e.next()) { types[e.getValue('type') || '(blank)'] = (types[e.getValue('type') || '(blank)'] || 0) + 1; if (!last) last = (e.getValue('start_date_time') || '').substring(0, 10); if (line.length < 3) line.push(e.getValue('name') + '/' + e.getValue('type') + '/' + (e.getValue('start_date_time') || '').substring(0, 10)); }
    var y = last.substring(0, 4) || 'none'; newest[y] = (newest[y] || 0) + 1;
    if (i < SAMPLE) gs.print('2. "' + p.name + '" created ' + s.getValue('sys_created_on') + ' by ' + cb + ' | type ' + (s.getValue('type') || '-') + ' | newest entry ' + (last || 'none') + ' | ' + line.join(', '));
});
gs.print('2. personal schedules created BY: ' + JSON.stringify(creators));
gs.print('2. personal schedules created IN year: ' + JSON.stringify(years));
gs.print('2. entry TYPES in personal schedules: ' + JSON.stringify(types));
gs.print('2. NEWEST entry year per schedule: ' + JSON.stringify(newest) + '  (old only = not maintained)');

var d = new GlideRecord('sys_dictionary');
d.addQuery('internal_type', 'reference'); d.addQuery('reference', 'cmn_schedule'); d.addQuery('name', '!=', 'sys_user'); d.query();
var ids = personal.slice(0, 500).map(function (p) { return p.id; }).join(',');
while (d.next()) {
    var g = new GlideAggregate(d.getValue('name'));
    if (!g.isValid()) continue;
    try { g.addQuery(d.getValue('element'), 'IN', ids); g.addAggregate('COUNT'); g.query();
        if (g.next() && parseInt(g.getAggregate('COUNT'), 10) > 0) gs.print('3. ALSO REFERENCED by ' + d.getValue('name') + '.' + d.getValue('element') + ': ' + g.getAggregate('COUNT') + ' records'); } catch (x) { }
}
gs.print('3. (no line above = nothing else points at the personal schedules)');

var rm = new GlideRecord('cmn_rota_member');
if (rm.isValid()) {
    var users = new GlideRecord('sys_user'); users.addQuery('active', true); users.addQuery('schedule', 'IN', ids); users.query();
    var uids = []; while (users.next()) uids.push(users.getUniqueValue());
    var r = new GlideAggregate('cmn_rota_member'); r.addQuery('member', 'IN', uids.join(',')); r.addAggregate('COUNT'); r.query();
    gs.print('4. users with a personal schedule who are On-Call rota members: ' + (r.next() ? r.getAggregate('COUNT') : 0) + ' (of ' + uids.length + ')');
}
['sys_script', 'sys_script_include', 'sysauto_script'].forEach(function (t) {
    var sc = new GlideRecord(t); if (!sc.isValid()) return;
    sc.addQuery('script', 'CONTAINS', '.schedule'); sc.addQuery('script', 'CONTAINS', 'sys_user'); sc.addQuery('active', true); sc.setLimit(20); sc.query();
    while (sc.next()) gs.print('4. script mentioning user schedule: ' + t + ' "' + sc.getValue('name') + '"');
});
