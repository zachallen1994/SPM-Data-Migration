// Background Script (CHANGES DATA - DRY_RUN first): remove the wrong half of a demand/project duplicate AND
// everything under it. Also cleans up after a project that was already deleted on its own.
// VERSION 2 (after review):
//  - deletes run WITH business rules (normal cascades, scoped tables allow it); only when a normal delete is refused
//    is it retried without business rules, and that is logged
//  - finds ALL records pointing at the removed record (any reference field to task / planned_task / pm_project /
//    dmn_demand), so records ServiceNow made itself (baselines, auto cost plans, ...) are included, not only migrated ones
//  - plus the migrated records found through the staging tables (covers references already cleared)
//  - the record of the other type (KEEP) and everything pointing at it are never touched
var DRY_RUN = true;                                  // ✏️ true = list only; false = delete
var REMOVE_TABLE = 'pm_project';                     // ✏️ the wrong type: 'pm_project' or 'dmn_demand'
var CORRELATIONS = ['ADAPTIVE:/Project/xxxxxxxx'];   // ✏️ Correlation ID(s) of the duplicates (same on both records)
gs.print('duplicate_remove_with_related VERSION 2 | ' + (DRY_RUN ? 'DRY RUN' : 'DELETING'));

var KEEP_TABLE = REMOVE_TABLE == 'pm_project' ? 'dmn_demand' : 'pm_project';
var REF_TO = 'task,planned_task,pm_project,pm_project_task,dmn_demand';

// every reference field (on any table) that can point at a project / task / demand
var refFields = [];
var dict = new GlideRecord('sys_dictionary');
dict.addQuery('internal_type', 'reference');
dict.addQuery('reference', 'IN', REF_TO);
dict.query();
while (dict.next()) refFields.push([dict.getValue('name'), dict.getValue('element')]);

var staging = [];
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'STARTSWITH', 'u_import_adaptive_');
d.addQuery('element', 'u_project_correlation_id');
d.query();
while (d.next()) if (d.getValue('name') != 'u_import_adaptive_projects') staging.push(d.getValue('name'));

function del(g, label, counts, failed) {
    counts[label] = (counts[label] || 0) + 1;
    if (DRY_RUN) return;
    if (g.deleteRecord()) return;                    // normal delete, business rules on
    g.setWorkflow(false);                            // refused (e.g. work in progress): retry without rules
    if (g.deleteRecord()) { failed.push(label + ' ' + g.getUniqueValue() + ' (deleted without business rules)'); return; }
    failed.push(label + ' ' + g.getUniqueValue() + ' NOT deleted');
}
function pointsAt(g, id) {                           // does this record reference id in any reference field?
    var f = g.getFields();
    for (var i = 0; i < f.size(); i++) {
        var e = f.get(i);
        if (e.getED().getInternalType() == 'reference' && e.toString() == id) return true;
    }
    return false;
}

CORRELATIONS.forEach(function (corr) {
    var keep = new GlideRecord(KEEP_TABLE);
    var keepId = keep.get('correlation_id', corr) ? keep.getUniqueValue() : '';
    var rm = new GlideRecord(REMOVE_TABLE);
    var rmId = rm.get('correlation_id', corr) ? rm.getUniqueValue() : '';
    gs.print('=== ' + corr + ' | keep ' + KEEP_TABLE + ' ' + (keepId ? keep.getValue('number') : '(none)') +
        ' | remove ' + REMOVE_TABLE + ' ' + (rmId ? rm.getValue('number') : '(already gone)'));
    var counts = {}, failed = [], seen = {}, kept = 0;

    // 1) records found through the staging tables (migrated records, even with cleared references)
    var ids = [];
    staging.forEach(function (st) {
        var r = new GlideRecord(st);
        r.addQuery('u_project_correlation_id', corr);
        r.addNotNullQuery('sys_target_sys_id');
        r.query();
        while (r.next()) ids.push([r.getValue('sys_target_table'), r.getValue('sys_target_sys_id')]);
    });
    // 2) every record referencing the removed record or one of its tasks (incl. ones ServiceNow made itself)
    var parents = rmId ? [rmId] : [];
    if (rmId) {
        var pt = new GlideRecord('pm_project_task');
        pt.addQuery('top_task', rmId);
        pt.query();
        while (pt.next()) { parents.push(pt.getUniqueValue()); ids.push(['pm_project_task', pt.getUniqueValue()]); }
    }
    parents.forEach(function (pid) {
        refFields.forEach(function (rf) {
            var g = new GlideRecord(rf[0]);
            if (!g.isValid() || !g.isValidField(rf[1])) return;
            g.addQuery(rf[1], pid);
            g.query();
            while (g.next()) ids.push([g.getRecordClassName(), g.getUniqueValue()]);
        });
    });

    ids.forEach(function (t) {
        var k = t[0] + '|' + t[1];
        if (seen[k] || t[1] == rmId) return;
        seen[k] = true;
        var g = new GlideRecord(t[0]);
        if (!t[0] || !g.get(t[1])) return;
        if (keepId && pointsAt(g, keepId)) { kept++; return; }             // belongs to the record we keep
        del(g, t[0], counts, failed);
    });
    gs.print('  related ' + (DRY_RUN ? 'to delete' : 'deleted') + ': ' + JSON.stringify(counts) + ' | kept (on the ' + KEEP_TABLE + '): ' + kept);
    if (rmId) del(rm, REMOVE_TABLE, {}, failed);
    if (rmId) gs.print('  ' + REMOVE_TABLE + ' ' + (DRY_RUN ? 'would be deleted' : 'delete attempted'));
    failed.forEach(function (f) { gs.print('  NOTE: ' + f); });
});
