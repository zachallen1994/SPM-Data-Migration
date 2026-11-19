// Background Script (read-only): what is in the people's personal work schedules?
// resource_availability_check.js showed: people WITHOUT a schedule on their user record pass "Validate Resource
// availability"; people WITH a personal schedule (named after them) get 0 working days in 2026-2027 and the log says
// "Schedule ... not valid for given dates" / "Unable to find Cached Schedule for Year". This prints each such schedule's
// entries, so we can see which dates they cover. Safe to run in DEV, TEST and PROD (it changes nothing).
var ISET = 'ISET23875960';     // ✏️ the Adaptive Resources import set (its people are checked)
var seen = {}, withSchedule = 0, without = 0;
var r = new GlideRecord('u_import_adaptive_resources');
r.addQuery('sys_import_set.number', ISET);
r.query();
while (r.next()) {
    var email = (r.getValue('u_resource_email') || '').toLowerCase().trim();
    if (!email || seen[email]) continue;
    seen[email] = true;
    var u = new GlideRecord('sys_user');
    u.addQuery('email', email); u.orderByDesc('active'); u.setLimit(1); u.query();
    if (!u.next()) continue;
    if (!u.getValue('schedule')) { without++; continue; }
    withSchedule++;
    var s = new GlideRecord('cmn_schedule');
    if (!s.get(u.getValue('schedule'))) { gs.print(u.getValue('name') + ': schedule record missing'); continue; }
    var line = u.getValue('name') + ' | schedule "' + s.getValue('name') + '" type ' + (s.getValue('type') || '(blank)') +
        ' | time zone ' + (s.getValue('time_zone') || '(blank)') + ' | created ' + s.getValue('sys_created_on') + ' by ' + s.getValue('sys_created_by');
    var e = new GlideRecord('cmn_schedule_span');
    e.addQuery('schedule', s.getUniqueValue());
    e.orderBy('start_date_time');
    e.query();
    line += ' | entries ' + e.getRowCount();
    var shown = 0;
    while (e.next() && shown < 3) {
        shown++;
        line += '\n      entry "' + e.getValue('name') + '" type ' + e.getValue('type') + ' | ' + e.getValue('start_date_time') +
            ' -> ' + e.getValue('end_date_time') + ' | repeats ' + (e.getValue('repeat_type') || 'no') + ' until ' + (e.getValue('repeat_until') || '(none)');
    }
    gs.print(line);
}
gs.print('People in this load: ' + (withSchedule + without) + ' | with a personal schedule: ' + withSchedule + ' | without: ' + without);
var all = new GlideAggregate('sys_user');
all.addQuery('active', true); all.addNotNullQuery('schedule'); all.addAggregate('COUNT'); all.query();
if (all.next()) gs.print('Active users in this instance with a personal schedule: ' + all.getAggregate('COUNT'));
