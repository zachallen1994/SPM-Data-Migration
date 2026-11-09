// Background Script (read-only): migrated time cards booked on the PROJECT (not a task). Fine when the project has
// no migrated work plan (or Adaptive time was on the project itself); suspicious when the project HAS migrated tasks -
// then the cards were probably loaded before the tasks, and the hours should be on those tasks.
var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'u_import_adaptive_time_cards').addOrCondition('table_name', 'u_import_adaptive_time_entries');
set.query();
var sets = [];
while (set.next()) sets.push(set.getUniqueValue());
var byProject = {};
var row = new GlideRecord('sys_import_set_row');
row.addQuery('sys_import_set', 'IN', sets.join(','));
row.addQuery('sys_target_table', 'time_card');
row.addNotNullQuery('sys_target_sys_id');
row.query();
var seen = {};
while (row.next()) {
    var id = row.getValue('sys_target_sys_id');
    if (seen[id]) continue;
    seen[id] = true;
    var tc = new GlideRecord('time_card');
    if (!tc.get(id) || tc.task.sys_class_name + '' != 'pm_project') continue;
    var k = tc.getValue('task');
    if (!byProject[k]) byProject[k] = { name: tc.task.number + ' ' + tc.task.short_description, cards: 0, hours: 0 };
    byProject[k].cards++;
    byProject[k].hours += parseFloat(tc.getValue('total')) || 0;
}
var ok = 0, suspect = 0;
for (var pid in byProject) {
    var t = new GlideAggregate('pm_project_task');
    t.addQuery('top_task', pid);
    t.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    t.addAggregate('COUNT'); t.query(); t.next();
    var tasks = parseInt(t.getAggregate('COUNT'), 10);
    if (tasks) { suspect++; gs.print('CHECK ' + byProject[pid].name + ' | ' + byProject[pid].cards + ' cards, ' + byProject[pid].hours + ' h on the project | migrated tasks now: ' + tasks); }
    else ok++;
}
gs.print('projects with migrated cards on the project itself: ' + (ok + suspect) + ' | no migrated tasks (expected): ' + ok + ' | have tasks (CHECK): ' + suspect);
