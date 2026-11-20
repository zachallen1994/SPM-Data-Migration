// Background Script (read-only): which resource rows does "Validate start end dates of assignments" still refuse, and why?
// For every ERROR row of one Resources import set: the dates the transform sends (same logic as PART C/D) and the
// task / project dates the rule compares with, INCLUDING the time of day (the rule compares exact date-times).
var ISET = 'ISET23877306';     // ✏️ the Resources import set
var MAX = 40;                  // ✏️ rows to print
function d(v) { v = (v + '').trim().substring(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
var r = new GlideRecord('u_import_adaptive_resources');
r.addQuery('sys_import_set.number', ISET);
r.addQuery('sys_import_state', 'error');
r.query();
var n = 0, counts = { startBeforeParent: 0, endAfterParent: 0, endBeforeStart: 0, sameDayAsParentStart: 0, other: 0 };
while (r.next()) {
    var p = null, t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length && !p; i++) { var g = new GlideRecord(t[i]); if (g.get('correlation_id', r.getValue('u_project_correlation_id'))) p = g; }
    if (!p) continue;
    var ps = p.start_date.nil() ? '' : d(p.start_date.getGlideObject().getLocalDate().getValue());
    var pe = p.end_date.nil() ? '' : d(p.end_date.getGlideObject().getLocalDate().getValue());
    var start = d(r.u_start_date) || d(r.u_added_on) || ps, end = d(r.u_end_date) || pe;
    if (ps && start < ps) start = ps;
    if (pe && end > pe) end = pe;
    if (pe && start > pe) start = ps;
    if (end && start > end) start = ps && ps <= end ? ps : end;
    var why = start < ps ? 'startBeforeParent' : end > pe ? 'endAfterParent' : end < start ? 'endBeforeStart' : start == ps ? 'sameDayAsParentStart' : 'other';
    counts[why]++;
    if (n++ < MAX) gs.print(why + ' | ' + r.getValue('u_resource_name') + ' | sends ' + start + ' -> ' + end +
        ' | ' + p.getRecordClassName() + ' ' + p.getDisplayValue() + ' planned ' + p.start_date.getDisplayValue() + ' -> ' + p.end_date.getDisplayValue() +
        ' | Adaptive start ' + (r.getValue('u_start_date') || '-') + ' end ' + (r.getValue('u_end_date') || '-') + ' added ' + (r.getValue('u_added_on') || '-'));
}
gs.print('error rows checked: ' + n + ' | ' + JSON.stringify(counts));
gs.print('(rows refused by "Validate Resource availability" are in this list too - they are the on-call schedule people)');
