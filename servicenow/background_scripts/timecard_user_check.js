// Background Script (read-only): one person's migrated time cards - week, hours, the record they landed on, state.
var EMAIL = 'LBartnik@mercy.com';     // ✏️ the person
var SINCE = '2026-08-01';             // ✏️ first week to show
var u = new GlideRecord('sys_user');
if (!u.get('email', EMAIL)) gs.print('No ServiceNow user with email ' + EMAIL);
var tc = new GlideRecord('time_card');
tc.addQuery('user', u.getUniqueValue());
tc.addQuery('week_starts_on', '>=', SINCE);
tc.orderBy('week_starts_on');
tc.query();
while (tc.next()) gs.print(tc.getValue('week_starts_on') + ' | ' + tc.getValue('total') + ' h | task: [' + tc.getDisplayValue('task') + '] ' +
    tc.task.sys_class_name + ' | state ' + tc.getValue('state'));
