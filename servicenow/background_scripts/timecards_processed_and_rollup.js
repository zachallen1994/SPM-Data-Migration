// Background Script (CHANGES DATA - DRY_RUN first). After the time entries transform ran WITHOUT its onAfter
// (cards loaded as Pending): for each migrated project
//   1) Pending / Submitted / Approved cards -> Processed WITHOUT business rules (fast, hours never added twice,
//      no labor expense lines)
//   2) every bottom-level task that has cards is saved once -> ServiceNow recalculates its Actual effort from its
//      Processed cards ("Update actual effort from time card"), and parents + project roll up.
// Parent tasks are not touched (ServiceNow rolls them up). Run in batches: MAX projects per run, run again until
// "projects left: 0".
var DRY_RUN = true;            // ✏️
var PROJECTS = [];             // ✏️ project numbers, e.g. ['PRJ0012237']; [] = every migrated Adaptive project
var MAX = 25;                  // ✏️ projects per run
gs.print('timecards_processed_and_rollup VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'UPDATING'));

function choice(label) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', label); c.query();
    return c.next() ? c.getValue('value') : null;
}
var PROCESSED = choice('Processed');
var OPEN = ['Pending', 'Submitted', 'Approved'].map(choice).filter(function (v) { return v; });

var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
if (PROJECTS.length) p.addQuery('number', 'IN', PROJECTS.join(','));
p.query();
var done = 0, left = 0, cardsMoved = 0;
while (p.next()) {
    var pid = p.getUniqueValue(), ids = [pid], leaves = {};
    var t = new GlideRecord('pm_project_task');
    t.addQuery('top_task', pid); t.query();
    while (t.next()) ids.push(t.getUniqueValue());
    var c = new GlideRecord('time_card');
    c.addQuery('task', 'IN', ids.join(','));
    c.addQuery('state', 'IN', OPEN.join(','));
    c.query();
    if (!c.hasNext()) continue;                          // nothing to process for this project
    if (MAX && done >= MAX) { left++; continue; }
    var n = 0;
    while (c.next()) {
        n++;
        leaves[c.getValue('task')] = true;
        if (!DRY_RUN) { c.setWorkflow(false); c.setValue('state', PROCESSED); c.update(); }
    }
    cardsMoved += n;
    var saved = 0;
    for (var id in leaves) {
        var lt = new GlideRecord('pm_project_task');
        if (!lt.get(id)) continue;                       // card on the project itself: the project save below covers it
        var kids = new GlideRecord('pm_project_task'); kids.addQuery('parent', id); kids.setLimit(1); kids.query();
        if (kids.hasNext()) continue;                    // parent task: rolled up by ServiceNow
        if (!DRY_RUN) { lt.setForceUpdate(true); lt.update(); }
        saved++;
    }
    if (!DRY_RUN && leaves[pid]) { p.setForceUpdate(true); p.update(); }
    if (!DRY_RUN) p.get(pid);
    gs.print(p.getValue('number') + ' ' + p.getValue('short_description') + ' | cards ' + n + ' | tasks saved ' + saved +
        (DRY_RUN ? '' : ' | Actual effort now ' + p.getDisplayValue('work_effort')));
    done++;
}
gs.print((DRY_RUN ? 'DRY RUN - would process ' : 'Processed ') + cardsMoved + ' cards in ' + done + ' projects | projects left: ' + left);
