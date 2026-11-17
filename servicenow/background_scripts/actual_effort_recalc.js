// Background Script (CHANGES DATA - DRY_RUN first): set Actual effort from the time cards, once.
// For one project: every project task's Actual effort = sum of its Approved / Processed cards; then the project's
// Actual effort = sum of its cards on the project + its top-level tasks' effort... is left to ServiceNow's roll-up
// (each task save runs the business rules, so parents and the project recalculate from the tasks).
// Use when Actual effort is a multiple of the card hours (cards counted at insert AND at approval, or re-runs).
var DRY_RUN = true;
var PROJECT = 'PRJ0012237';    // ✏️ project number in this instance
gs.print('actual_effort_recalc VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'UPDATING'));
function states() {
    var v = [], c = new GlideRecord('sys_choice');
    c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', 'IN', 'Approved,Processed'); c.query();
    while (c.next()) v.push(c.getValue('value'));
    return v;
}
function hours(taskId, st) {
    var g = new GlideAggregate('time_card');
    g.addQuery('task', taskId); g.addQuery('state', 'IN', st.join(','));
    g.addAggregate('SUM', 'total'); g.query();
    return g.next() ? parseFloat(g.getAggregate('SUM', 'total')) || 0 : 0;
}
var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    var st = states(), total = 0;
    gs.print('before: project Actual effort ' + p.getDisplayValue('work_effort'));
    var t = new GlideRecord('pm_project_task');
    t.addQuery('top_task', p.getUniqueValue());
    t.query();
    while (t.next()) {
        var h = hours(t.getUniqueValue(), st);
        total += h;
        if (!h && !t.getValue('work_effort')) continue;
        gs.print('  ' + t.getValue('number') + ' ' + t.getValue('short_description') + ' | now ' + t.getDisplayValue('work_effort') + ' -> ' + h + ' h');
        if (!DRY_RUN) { t.work_effort.setDateNumericValue(Math.round(h * 3600000)); t.update(); }
    }
    var onProject = hours(p.getUniqueValue(), st);
    gs.print('cards on tasks: ' + total + ' h | cards on the project itself: ' + onProject + ' h | expected project Actual effort: ' + (total + onProject) + ' h');
    if (!DRY_RUN) { p.get(p.getUniqueValue()); gs.print('after: project Actual effort ' + p.getDisplayValue('work_effort')); }
}
