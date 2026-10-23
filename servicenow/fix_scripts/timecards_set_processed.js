// Fix Script: move migrated time cards through the same steps a person does (Submit, then Approve) so their
// hours roll up to actual effort. Manual test in Dev: Submit > Approve on one card raised the demand's Actual Effort.
// Only cards created by the time card transform are touched. Business rules run, as when a person clicks.
var DRY_RUN = true;                          // ✏️ true = only count; false = update
var TRANSFORM = 'Import Adaptive Time Cards'; // ✏️ the time card transform map name
var ONLY_TASK = 'DMND0002548';               // ✏️ a project / demand / task number: its cards AND its tasks' cards; '' = all
var LIMIT = 1;                               // ✏️ test on 1 card first; 0 = no limit
var STEPS = ['Submitted', 'Approved'];       // State labels, in order (what Submit and Approve set)
gs.info('timecards_set_processed VERSION 4');

// time_card.task points at the task table, which has no top_task: read it from the project task itself
function projectOf(taskId) {
    var pt = new GlideRecord('pm_project_task');
    return taskId && pt.get(taskId) ? pt.top_task.number + '' : '';
}

function value(label) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', label); c.query();
    return c.next() ? c.getValue('value') : null;
}
var steps = STEPS.map(function (l) { var v = value(l); if (!v) gs.info('No State choice labelled ' + l); return v; });
if (steps.indexOf(null) >= 0) throw 'Fix the STEPS labels first';
var PENDING = value('Pending');

var row = new GlideAggregate('sys_import_set_row');
row.addQuery('sys_target_table', 'time_card');
row.addQuery('sys_transform_map.name', TRANSFORM);
row.addNotNullQuery('sys_target_sys_id');
row.groupBy('sys_target_sys_id');
row.query();
var found = 0, done = 0, end = {};
while (row.next()) {
    if (LIMIT && done >= LIMIT) break;
    var tc = new GlideRecord('time_card');
    if (!tc.get(row.getValue('sys_target_sys_id'))) continue;
    if (ONLY_TASK && tc.task.number + '' != ONLY_TASK && projectOf(tc.getValue('task')) != ONLY_TASK) continue;   // project task cards count for their project
    found++;
    if (tc.getValue('state') != PENDING) continue;      // already submitted / approved / processed
    done++;
    if (DRY_RUN) continue;
    steps.forEach(function (v) {
        tc.get(tc.getUniqueValue());
        tc.setValue('state', v);
        tc.update();
    });
    tc.get(tc.getUniqueValue());
    var s = tc.getDisplayValue('state');
    end[s] = (end[s] || 0) + 1;
    gs.info(tc.getDisplayValue('user') + ' | ' + tc.task.number + ' | week ' + tc.getValue('week_starts_on') + ' | now ' + s);
}
gs.info((DRY_RUN ? 'DRY RUN - would move ' : 'Moved ') + done + ' Pending cards (of ' + found + ' migrated cards found)' +
    (DRY_RUN ? '' : '. Final states: ' + JSON.stringify(end)));
