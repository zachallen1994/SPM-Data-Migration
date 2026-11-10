// DEV ONLY - Background Script that creates (or removes) ONE fake project with the same Correlation ID as an
// existing migrated demand, to test that the Demand/Project split never makes a duplicate (demand_project_split.js).
//   1) MODE = 'create' -> run. 2) Re-run the Projects + Demands transforms on the latest projects import set.
//   3) Expect in the transform log: "Already a project (PRJ...), demand not created: <name>".  4) MODE = 'remove' -> run.
var MODE = 'create';                 // ✏️ 'create' | 'remove'
var DEMAND = 'DMND0002630';          // ✏️ a migrated demand (MULTI-Pharos Pilot)
var TAG = '[DUPLICATE TEST] ';

var d = new GlideRecord('dmn_demand');
if (!d.get('number', DEMAND)) gs.print('No demand ' + DEMAND);
else if (MODE == 'create') {
    var p = new GlideRecord('pm_project');
    p.initialize();
    p.setValue('short_description', TAG + d.getValue('short_description'));
    p.setValue('correlation_id', d.getValue('correlation_id'));
    p.insert();
    gs.print('Created test project ' + p.getValue('number') + ' with correlation_id ' + d.getValue('correlation_id'));
} else {
    var r = new GlideRecord('pm_project');
    r.addQuery('short_description', 'STARTSWITH', TAG);
    r.query();
    while (r.next()) { gs.print('Removing test project ' + r.getValue('number')); r.deleteRecord(); }
}
