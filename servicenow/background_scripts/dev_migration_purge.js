// Background Script (DEV ONLY - DELETES DATA - DRY_RUN first): remove EVERYTHING the Adaptive migration created,
// so the full go-live run can be timed from a clean start.
// What is removed (correlation_id starts with ADAPTIVE:, or points at such a record):
//   1. records that REFERENCE a migrated project / demand / program / task: time cards, expense lines, resource
//      assignments, status reports, budget / funding / cost plans, risks, issues ... (found from the dictionary)
//   2. migrated tasks (project tasks, and any other task type with an ADAPTIVE: correlation id)
//   3. migrated demands and projects
//   4. migrated programs
// Deletes run WITH business rules (normal cascades). Only a delete that is refused is retried without rules, and
// that is printed as a NOTE. Large volumes: each run stops after MAX_DELETES - run it again until "remaining 0".
// Users, rate models, cost types, portfolios, choices, properties are NOT touched.
var DRY_RUN = true;            // ✏️ true = count only; false = delete
var MAX_DELETES = 5000;        // ✏️ per run (keeps one run under the background script time limit)
var PREFIX = 'ADAPTIVE:';
var inst = gs.getProperty('instance_name', '');
if (!/dev/i.test(inst)) { gs.print('STOP: instance "' + inst + '" is not a DEV instance.'); }
else {
    gs.print('dev_migration_purge on ' + inst + ' | ' + (DRY_RUN ? 'DRY RUN' : 'DELETING, max ' + MAX_DELETES));
    var deleted = 0, notes = [], remaining = 0;
    var ROOTS = 'pm_project,dmn_demand,pm_program';
    function del(g) {
        if (DRY_RUN) return;
        if (deleted >= MAX_DELETES) { remaining++; return; }
        if (g.deleteRecord()) { deleted++; return; }
        g.setWorkflow(false);
        if (g.deleteRecord()) { deleted++; notes.push(g.getRecordClassName() + ' ' + g.getDisplayValue() + ' deleted WITHOUT business rules (refused normally)'); return; }
        notes.push(g.getRecordClassName() + ' ' + g.getUniqueValue() + ' NOT deleted');
    }
    function run(label, g) {           // g = a GlideRecord with its query added (not yet queried)
        g.query();
        var n = g.getRowCount();
        if (!n) return;
        gs.print(label + ': ' + n);
        if (DRY_RUN) { remaining += n; return; }
        while (g.next()) { if (deleted >= MAX_DELETES) { remaining += n; break; } del(g); n--; }
    }
    // 1) records pointing at migrated records (one query per reference field, dot-walked to the correlation id)
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('internal_type', 'reference');
    d.addQuery('reference', 'IN', 'task,planned_task,pm_project,pm_project_task,dmn_demand,pm_program');
    d.addQuery('name', 'NOT LIKE', 'u_import%');
    d.addQuery('name', 'NOT LIKE', 'sys_%');
    d.addQuery('name', 'NOT LIKE', 'v_%');
    d.addQuery('name', 'NOT LIKE', 'ts_%');
    d.query();
    var done = {};
    while (d.next()) {
        var table = d.getValue('name'), field = d.getValue('element');
        if (done[table + '.' + field]) continue;
        done[table + '.' + field] = true;
        var g = new GlideRecord(table);
        if (!g.isValid() || !g.isValidField(field)) continue;
        if (g.isValidField('correlation_id')) g.addQuery('correlation_id', 'NOT LIKE', PREFIX + '%');   // migrated tasks themselves: step 2
        if (table == 'task' || table == 'planned_task') continue;                                       // covered by step 2 / 3
        g.addQuery(field + '.correlation_id', 'STARTSWITH', PREFIX);
        try { run('1) ' + table + '.' + field, g); } catch (e) { gs.print('   skipped ' + table + '.' + field + ': ' + e); }
    }
    // 2) migrated tasks (deepest first so parents are not blocked by children)
    var t = new GlideRecord('task');
    t.addQuery('correlation_id', 'STARTSWITH', PREFIX);
    t.addQuery('sys_class_name', 'NOT IN', ROOTS);
    t.orderByDesc('sys_created_on');
    run('2) migrated tasks', t);
    // 3) demands and projects, 4) programs
    ['dmn_demand', 'pm_project', 'pm_program'].forEach(function (tb, i) {
        var r = new GlideRecord(tb);
        r.addQuery('correlation_id', 'STARTSWITH', PREFIX);
        run((i < 2 ? '3) ' : '4) ') + tb, r);
    });
    notes.slice(0, 50).forEach(function (x) { gs.print('NOTE: ' + x); });
    if (notes.length > 50) gs.print('NOTE: ... ' + (notes.length - 50) + ' more');
    gs.print((DRY_RUN ? 'DRY RUN - would delete about ' + remaining : 'deleted ' + deleted + ' | remaining ' + remaining + (remaining ? ' -> run again' : ' -> clean')));
}
