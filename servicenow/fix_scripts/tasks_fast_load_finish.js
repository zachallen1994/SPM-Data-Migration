// Fix Script: run AFTER a task load done with FAST_LOAD = true (adaptive_tasks_transform.js PART E).
// 1) sets run_calc_brs back to true on the migrated tasks (otherwise later edits by PMs skip the planning rules)
// 2) recalculates each project once (dates, durations, % complete roll up from its tasks)
// Test in DEV on one project first and compare its dates with Adaptive.
var DRY_RUN = true;                 // ✏️ true = only count
var ONLY = [];                      // ✏️ project numbers, e.g. ['PRJ0011403']; [] = every project with migrated tasks
var MAX = 25;                       // ✏️ projects per run (run again until "0 left"); 0 = all
gs.info('tasks_fast_load_finish VERSION 1');

var projects = {}, tasks = 0;
var t = new GlideRecord('pm_project_task');
t.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
t.addQuery('run_calc_brs', false);
if (ONLY.length) t.addQuery('top_task.number', 'IN', ONLY.join(','));
t.query();
while (t.next()) { projects[t.getValue('top_task')] = true; tasks++; }
var ids = Object.keys(projects);
gs.info('Migrated tasks still on fast load: ' + tasks + ' in ' + ids.length + ' projects');

var done = 0;
ids.forEach(function (pid) {
    if (DRY_RUN || (MAX && done >= MAX)) return;
    var u = new GlideRecord('pm_project_task');
    u.addQuery('top_task', pid);
    u.addQuery('run_calc_brs', false);
    u.query();
    while (u.next()) { u.setWorkflow(false); u.setValue('run_calc_brs', true); u.update(); }
    var p = new GlideRecord('pm_project');
    if (!p.get(pid)) return;
    var how = '';
    try { new SNC.PlannedTaskAPI().recalculateTask(pid); how = 'PlannedTaskAPI'; }   // seen in the system log on a project save
    catch (e) { p.setForceUpdate(true); p.update(); how = 'project save'; }
    p.get(pid);
    gs.info(p.getValue('number') + ' recalculated (' + how + '): ' + p.getValue('start_date') + ' -> ' + p.getValue('end_date'));
    done++;
});
gs.info((DRY_RUN ? 'DRY RUN - would finish ' + ids.length : 'Finished ' + done + ' projects; ' + (ids.length - done) + ' left'));
