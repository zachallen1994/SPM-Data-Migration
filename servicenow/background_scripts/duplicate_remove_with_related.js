// Background Script (CHANGES DATA - DRY_RUN first): remove the wrong half of a demand/project duplicate AND every
// record migrated under it (tasks, resources, risks, issues, lessons, status reports, cost plans, expense lines,
// time cards). Also cleans up after a project that was already deleted on its own (its related records are found
// through the migration staging tables, so cleared or broken references do not matter).
// The record of the other type (the one to KEEP) and everything attached to it are not touched.
var DRY_RUN = true;                                  // ✏️ true = list only; false = delete
var REMOVE_TABLE = 'pm_project';                     // ✏️ the wrong type: 'pm_project' or 'dmn_demand'
var CORRELATIONS = ['ADAPTIVE:/Project/xxxxxxxx'];   // ✏️ Correlation ID(s) of the duplicates (same on both records)
gs.print('duplicate_remove_with_related VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'DELETING'));

var KEEP_TABLE = REMOVE_TABLE == 'pm_project' ? 'dmn_demand' : 'pm_project';
var REF_FIELDS = ['task', 'parent', 'top_task', 'project', 'u_project', 'u_demand'];

// every migration staging table that knows the project / demand (u_import_adaptive_* with Project Correlation ID)
var staging = [];
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'STARTSWITH', 'u_import_adaptive_');
d.addQuery('element', 'u_project_correlation_id');
d.query();
while (d.next()) if (d.getValue('name') != 'u_import_adaptive_projects') staging.push(d.getValue('name'));
gs.print('staging tables searched: ' + staging.join(', '));

CORRELATIONS.forEach(function (corr) {
    var keep = new GlideRecord(KEEP_TABLE);
    var keepId = keep.get('correlation_id', corr) ? keep.getUniqueValue() : '';
    gs.print('=== ' + corr + ' | keep ' + KEEP_TABLE + ' ' + (keepId ? keep.getValue('number') : '(none)'));

    // the targets created from staging rows of this project / demand, de-duplicated
    var targets = {}, counts = {}, kept = 0;
    staging.forEach(function (st) {
        var r = new GlideRecord(st);
        r.addQuery('u_project_correlation_id', corr);
        r.addNotNullQuery('sys_target_sys_id');
        r.query();
        while (r.next()) targets[r.getValue('sys_target_table') + '|' + r.getValue('sys_target_sys_id')] = true;
    });
    // project tasks under the removed project also take their own children (time cards etc. on those tasks)
    var rm = new GlideRecord(REMOVE_TABLE);
    var rmId = rm.get('correlation_id', corr) ? rm.getUniqueValue() : '';
    for (var k in targets) {
        var tbl = k.split('|')[0], id = k.split('|')[1];
        var g = new GlideRecord(tbl);
        if (!tbl || !g.get(id)) continue;                                   // already gone
        var onKeep = false;
        REF_FIELDS.forEach(function (f) { if (keepId && g.isValidField(f) && g.getValue(f) == keepId) onKeep = true; });
        if (onKeep) { kept++; continue; }                                   // belongs to the record we keep
        counts[tbl] = (counts[tbl] || 0) + 1;
        if (!DRY_RUN) { g.setWorkflow(false); g.deleteRecord(); }
    }
    gs.print('  related records ' + (DRY_RUN ? 'to delete' : 'deleted') + ': ' + JSON.stringify(counts) + ' | kept (on the ' + KEEP_TABLE + '): ' + kept);
    if (rmId) {
        gs.print('  ' + REMOVE_TABLE + ' ' + rm.getValue('number') + (DRY_RUN ? ' would be deleted' : ' deleted'));
        if (!DRY_RUN) { rm.setWorkflow(false); rm.deleteRecord(); }
    } else gs.print('  ' + REMOVE_TABLE + ': already gone');
});
