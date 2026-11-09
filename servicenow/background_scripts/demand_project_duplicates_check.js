// Background Script (read-only): Adaptive records that exist as BOTH a project and a demand (same correlation_id).
// Only one should exist (Portfolio Phase decides). Shows both records, when / by which import each was made, the
// phase in the latest staging row, and whether the split onBefore scripts are active on both maps.
var maps = { 'pm_project': false, 'dmn_demand': false };
var ts = new GlideRecord('sys_transform_script');
ts.addQuery('map.source_table', 'u_import_adaptive_projects');
ts.addQuery('when', 'onBefore');
ts.addQuery('active', true);
ts.addQuery('script', 'CONTAINS', 'pending portfolio assignment');
ts.query();
while (ts.next()) { maps[ts.map.target_table + ''] = true; gs.print('split onBefore active on: ' + ts.map.name + ' (' + ts.map.target_table + ')'); }
for (var t in maps) if (!maps[t]) gs.print('PROBLEM: no active Demand/Project split onBefore on the map to ' + t + ' (demand_project_split.js)');

var d = new GlideRecord('dmn_demand');
d.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
d.query();
var n = 0;
while (d.next()) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', d.getValue('correlation_id'))) continue;
    n++;
    var s = new GlideRecord('u_import_adaptive_projects');
    s.addQuery('u_correlation_id', d.getValue('correlation_id'));
    s.orderByDesc('sys_created_on'); s.setLimit(1); s.query();
    var phase = s.next() ? s.getValue('u_portfolio_phase') : '(no staging row)';
    gs.print('BOTH: ' + d.getValue('short_description') + ' | Adaptive phase "' + phase + '" | demand ' + d.getValue('number') +
        ' created ' + d.getValue('sys_created_on') + ' | project ' + p.getValue('number') + ' created ' + p.getValue('sys_created_on') +
        ' by ' + p.getValue('sys_created_by'));
}
gs.print('records that are both a project and a demand: ' + n);
