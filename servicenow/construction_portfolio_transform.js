// Construction projects -> listed under the ServiceNow "Construction" portfolio.
// Transform Map "Import Adaptive Projects Transform Map" (-> pm_project): Transform Scripts: NEW onBefore, Order 200
// (after the demand/project split onBefore, demand_project_split.js PART A). Paste the whole script below.
// Uses the staging column "Project Type" (already loaded by the projects data source).
// The portfolio field is found from the dictionary (the reference field on the project that points to pm_portfolio);
// DEV check (portfolio_check.js): pm_project has primary_portfolio ("Portfolio") and top_portfolio ("Top portfolio").
(function runTransformScript(source, map, log, target) {
    var PORTFOLIOS = { 'construction': 'Construction', 'program': 'IT' };   // 'program' = Construction Program (BA: IT portfolio)   // ✏️ Adaptive Project Type (lower case) : ServiceNow portfolio name
    var FIELD = 'primary_portfolio';                        // project field "Portfolio" (DEV check; top_portfolio is the roll-up, not set here)
    var name = PORTFOLIOS[(source.getValue('u_project_type') || '').toLowerCase().trim()];
    if (!name) return;                                      // not a construction project: portfolio left as it is
    if (!FIELD) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', 'IN', 'pm_project,planned_task,task');     // the project table and the tables it extends
        d.addQuery('internal_type', 'reference');
        d.addQuery('reference', 'pm_portfolio');
        d.query();
        if (d.next()) FIELD = d.getValue('element');
    }
    if (!FIELD) { log.warn('No portfolio field on ' + target.getTableName() + ' - ' + source.u_name + ' not put in portfolio ' + name); return; }
    var pf = new GlideRecord('pm_portfolio');
    pf.addQuery('name', name);
    pf.addQuery('active', true);
    pf.query();
    if (!pf.next()) { log.warn('No active ServiceNow portfolio "' + name + '" - ' + source.u_name + ' not put in it'); return; }
    if (target.getValue(FIELD) != pf.getUniqueValue()) target.setValue(FIELD, pf.getUniqueValue());
})(source, map, log, target);
