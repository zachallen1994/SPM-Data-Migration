// Fix Script: remove migrated status reports dated BEFORE the agreed cut-off (only January 2025 and newer are kept).
// For status reports loaded before the data source had the cut-off. Only reports on migrated Adaptive projects.
var DRY_RUN = true;              // ✏️ true = only count
var CUTOFF = '2025-01-01';       // ✏️ reports with "as on" before this date are removed
gs.info('status_history_before_cutoff VERSION 1');

var g = new GlideAggregate('project_status');
g.addQuery('project.correlation_id', 'STARTSWITH', 'ADAPTIVE:');
g.addQuery('as_on', '<', CUTOFF);
g.addAggregate('COUNT');
g.query();
var n = g.next() ? parseInt(g.getAggregate('COUNT'), 10) : 0;
gs.info((DRY_RUN ? 'DRY RUN - would remove ' : 'Removing ') + n + ' migrated status reports dated before ' + CUTOFF);
if (!DRY_RUN && n) {
    var d = new GlideRecord('project_status');
    d.addQuery('project.correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    d.addQuery('as_on', '<', CUTOFF);
    d.deleteMultiple();
}
