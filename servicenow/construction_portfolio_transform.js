// Construction projects -> listed under the ServiceNow "Construction" portfolio.
// Transform Map "Import Adaptive Projects Transform Map" (-> pm_project): Transform Scripts: NEW onBefore, Order 200
// (after the demand/project split onBefore, demand_project_split.js PART A). Paste the whole script below.
// Uses the staging column "Project Type" (already loaded by the projects data source).
// The portfolio field is found from the dictionary (the reference field on the project that points to pm_portfolio);
// set FIELD only if background_scripts/portfolio_check.js printed more than one.
(function runTransformScript(source, map, log, target) {
    var PORTFOLIOS = { 'construction': 'Construction' };   // ✏️ Adaptive Project Type (lower case) : ServiceNow portfolio name
    var FIELD = '';                                         // ✏️ blank = found automatically
    var name = PORTFOLIOS[(source.getValue('u_project_type') || '').toLowerCase().trim()];
    if (!name) return;                                      // not a construction project: portfolio left as it is
    if (!FIELD) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', 'IN', new GlideTableHierarchy(target.getTableName()).getTables().join(','));
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
