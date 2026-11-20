// Background Script (read-only): CHECK A BATCH before starting the next one.
// Compares, for every project / demand of the LATEST Adaptive projects load (the current batch), what was staged
// from Adaptive with what ServiceNow now has, step by step. Prints only the problems, then a summary per check.
// Run it after every batch (and after any re-run). Nothing is changed.
// Checks:
//   PROJECT   loaded as project or demand (not missing, not both); no "undefined" text; planned start = Adaptive start
//   TASKS     tasks in ServiceNow = task rows staged
//   STATUS    status reports = status rows staged (projects only)
//   BUDGET    Total Budget = staged budget; Total planned cost = staged budget; no cost plan with more than one breakdown
//   RESOURCES assignments = staged rows (blocked people, e.g. on-call schedules, show here)
//   TIME      time card hours = staged hours
var MAX_LINES = 300;    // ✏️ stop printing problem lines after this many (the summary is always printed)
var out = [], lines = 0;
function say(x) { if (lines++ < MAX_LINES) gs.print(x); }
function latestSet(table) {
    var s = new GlideRecord('sys_import_set');
    s.addQuery('table_name', table);
    s.orderByDesc('sys_created_on');
    s.setLimit(1);
    s.query();
    return s.next() ? s.getUniqueValue() : '';
}
function fieldByLabel(label) {
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'IN', 'pm_project,planned_task,task');
    d.addQuery('column_label', label);
    d.query();
    return d.next() ? d.getValue('element') : '';
}
function num(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }
var PLANNED_COST = fieldByLabel('Total planned cost');
var summary = {};
function tally(check, ok) { summary[check] = summary[check] || { ok: 0, problem: 0 }; summary[check][ok ? 'ok' : 'problem']++; }

// staged rows of each step (latest import set of each staging table), grouped by project correlation id
function staged(table, fn) {
    var set = latestSet(table), by = {};
    if (!set) return null;
    var r = new GlideRecord(table);
    if (!r.isValid()) return null;
    r.addQuery('sys_import_set', set);
    r.query();
    while (r.next()) { var k = r.getValue('u_project_correlation_id'); if (k) { by[k] = by[k] || []; by[k].push(fn(r)); } }
    return by;
}
var TASKS = staged('u_import_adaptive_project_tasks', function (r) { return 1; });
var STATUS = staged('u_import_adaptive_status_history', function (r) { return 1; });
var BUDGET = staged('u_import_adaptive_budget_lines', function (r) { return { key: r.getValue('u_correlation_id') + '|' + String(r.getValue('u_month')).substring(0, 7), amount: parseFloat(r.getValue('u_budget')) || 0 }; });
var RES = staged('u_import_adaptive_resources', function (r) { return 1; });
var TIME = staged('u_import_adaptive_time_cards', function (r) { return parseFloat(r.getValue('u_total')) || 0; });
// resource / time rows point at a project OR one of its tasks: map task correlation -> project correlation
var taskToProject = {};
var pt = new GlideRecord('pm_project_task');
pt.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
pt.query();
while (pt.next()) taskToProject[pt.getValue('correlation_id')] = pt.top_task.correlation_id + '';
function regroup(by) {
    if (!by) return null;
    var g = {};
    for (var k in by) { var p = taskToProject[k] || k; g[p] = (g[p] || []).concat(by[k]); }
    return g;
}
RES = regroup(RES);
var TIMEP = null;
if (TIME) {   // time card staging uses Task / Project Correlation ID: group by the project column
    TIMEP = {};
    var tset = latestSet('u_import_adaptive_time_cards'), tr = new GlideRecord('u_import_adaptive_time_cards');
    tr.addQuery('sys_import_set', tset);
    tr.query();
    while (tr.next()) { var pk = tr.getValue('u_project_correlation_id'); TIMEP[pk] = (TIMEP[pk] || 0) + (parseFloat(tr.getValue('u_total')) || 0); }
}

var projSet = latestSet('u_import_adaptive_projects');
var sp = new GlideRecord('u_import_adaptive_projects');
sp.addQuery('sys_import_set', projSet);
sp.query();
var seen = {};
gs.print('batch_validation | projects import set ' + projSet + ' | problems below (nothing printed = all good)');
while (sp.next()) {
    var corr = sp.getValue('u_correlation_id');
    if (!corr || seen[corr]) continue;
    seen[corr] = true;
    var name = sp.getValue('u_name');
    var p = new GlideRecord('pm_project'), d = new GlideRecord('dmn_demand');
    var isP = p.get('correlation_id', corr), isD = d.get('correlation_id', corr);
    // PROJECT
    if (!isP && !isD) { say('PROJECT   missing (neither project nor demand): ' + name); tally('PROJECT', false); continue; }
    if (isP && isD) { say('PROJECT   BOTH project ' + p.getValue('number') + ' and demand ' + d.getValue('number') + ': ' + name); tally('PROJECT', false); }
    var rec = isP ? p : d, id = rec.getValue('number') + ' ' + name, okP = true;
    var f = rec.getFields();
    for (var i = 0; i < f.size(); i++) if (f.get(i).getDisplayValue() == 'undefined') { say('PROJECT   "undefined" in ' + f.get(i).getName() + ': ' + id); okP = false; }
    var aStart = sp.getValue('u_schedule_start');
    if (isP && aStart && (rec.getValue('start_date') || '').substring(0, 10) != aStart.substring(0, 10))
        { say('PROJECT   planned start ' + (rec.getValue('start_date') || '(empty)').substring(0, 10) + ' vs Adaptive ' + aStart + ': ' + id); okP = false; }
    tally('PROJECT', okP);
    var pid = rec.getUniqueValue();
    // TASKS (projects only)
    if (isP && TASKS) {
        var want = (TASKS[corr] || []).length, ga = new GlideAggregate('pm_project_task');
        ga.addQuery('top_task', pid); ga.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:'); ga.addAggregate('COUNT'); ga.query();
        var have = ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) : 0;
        if (have != want) say('TASKS     ' + have + ' in ServiceNow vs ' + want + ' staged: ' + id);
        tally('TASKS', have == want);
    }
    // STATUS (projects only)
    if (isP && STATUS && STATUS[corr]) {
        var gs1 = new GlideAggregate('project_status');
        gs1.addQuery('project', pid); gs1.addAggregate('COUNT'); gs1.query();
        var hs = gs1.next() ? parseInt(gs1.getAggregate('COUNT'), 10) : 0, ws = STATUS[corr].length;
        if (hs < ws) say('STATUS    ' + hs + ' reports vs ' + ws + ' staged: ' + id);
        tally('STATUS', hs >= ws);
    }
    // BUDGET
    if (BUDGET && BUDGET[corr]) {
        var tot = 0, dup = {};
        BUDGET[corr].forEach(function (b) { if (!dup[b.key]) { dup[b.key] = true; tot += b.amount; } });
        tot = num(tot);
        var okB = true, tb = num(rec.getValue('budget_cost')), pc = PLANNED_COST ? num(rec.getValue(PLANNED_COST)) : null;
        if (Math.abs(tb - tot) > 0.01) { say('BUDGET    Total Budget ' + tb + ' vs Adaptive ' + tot + ': ' + id); okB = false; }
        if (pc !== null && Math.abs(pc - tot) > 0.01) { say('BUDGET    Total planned cost ' + pc + ' vs Adaptive ' + tot + ': ' + id); okB = false; }
        var bd = new GlideRecord('cost_plan_breakdown');
        if (bd.isValid() && bd.isValidField('cost_plan')) {
            var gb = new GlideAggregate('cost_plan_breakdown');
            gb.addQuery('cost_plan.task', pid); gb.addAggregate('COUNT'); gb.groupBy('cost_plan'); gb.query();
            while (gb.next()) if (parseInt(gb.getAggregate('COUNT'), 10) > 1) { say('BUDGET    cost plan with ' + gb.getAggregate('COUNT') + ' breakdowns (' + gb.getDisplayValue('cost_plan') + '): ' + id); okB = false; }
        }
        tally('BUDGET', okB);
    }
    // RESOURCES
    if (RES && RES[corr]) {
        var gr2 = new GlideAggregate('sn_plng_att_core_resource_assignment');
        gr2.addEncodedQuery('task=' + pid + '^ORtask.ref_pm_project_task.top_task=' + pid);
        gr2.addAggregate('COUNT'); gr2.query();
        var hr = gr2.next() ? parseInt(gr2.getAggregate('COUNT'), 10) : 0, wr = RES[corr].length;
        if (hr < wr) say('RESOURCES ' + hr + ' assignments vs ' + wr + ' staged: ' + id);
        tally('RESOURCES', hr >= wr);
    }
    // TIME
    if (TIMEP && TIMEP[corr]) {
        var gt = new GlideAggregate('time_card');
        gt.addEncodedQuery('task=' + pid + '^ORtask.ref_pm_project_task.top_task=' + pid);
        gt.addAggregate('SUM', 'total'); gt.query();
        var ht = gt.next() ? num(gt.getAggregate('SUM', 'total')) : 0, wt = num(TIMEP[corr]);
        if (Math.abs(ht - wt) > 0.01) say('TIME      ' + ht + ' h in time cards vs ' + wt + ' h staged: ' + id);
        tally('TIME', Math.abs(ht - wt) <= 0.01);
    }
}
if (lines > MAX_LINES) gs.print('... ' + (lines - MAX_LINES) + ' more problem lines not printed');
gs.print('SUMMARY (projects ok / with a problem): ' + JSON.stringify(summary));
['TASKS', 'STATUS', 'BUDGET', 'RESOURCES', 'TIME'].forEach(function (c) { if (!summary[c]) gs.print(c + ': not checked (step not loaded for this batch yet)'); });
