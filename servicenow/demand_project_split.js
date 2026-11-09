// Demand vs Project split, by Adaptive Portfolio Phase (rule from the BA).
// One load (Adaptive Projects - API -> u_import_adaptive_projects), two transform maps:
//   Import Adaptive Projects Transform Map  -> pm_project   : onBefore = PART A
//   Import Adaptive Demands Transform Map   -> dmn_demand   : onBefore = PART B
// A phase not in either list (or blank) is skipped by BOTH maps and logged, for the BA to decide.

// ---------- PART A: onBefore on the PROJECT map ----------
(function runTransformScript(source, map, log, target) {
    var DEMAND = ['pending portfolio assignment', 'in portfolio discovery', 'on hold pending requestor', 'on hold pending requester',
                  'on hold estimate complete - with ocio', 'on hold estimate complete - pending sow'];
    var PROJECT = ['ready for pm assignment', 'pm assigned', 'analyst run'];
    var phase = (source.u_portfolio_phase + '').toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();
    if (PROJECT.indexOf(phase) > -1) {                                        // load as project
        var dm = new GlideRecord('dmn_demand');                               // ...unless it is already a demand
        if (dm.get('correlation_id', source.u_correlation_id + '')) {
            log.warn('Already a demand (' + dm.getValue('number') + '), project not created: ' + source.u_name + ' - phase "' + source.u_portfolio_phase + '"');
            ignore = true;
        }
        return;
    }
    if (DEMAND.indexOf(phase) < 0) log.warn('Unmapped Portfolio Phase "' + source.u_portfolio_phase + '" on ' + source.u_correlation_id);
    ignore = true;                                                            // demand or unmapped: not a project
})(source, map, log, target);

// ---------- PART B: onBefore on the DEMAND map ----------
(function runTransformScript(source, map, log, target) {
    var DEMAND = ['pending portfolio assignment', 'in portfolio discovery', 'on hold pending requestor', 'on hold pending requester',
                  'on hold estimate complete - with ocio', 'on hold estimate complete - pending sow'];
    var phase = (source.u_portfolio_phase + '').toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();
    if (DEMAND.indexOf(phase) > -1) {                                         // load as demand
        var pr = new GlideRecord('pm_project');                               // ...unless it is already a project
        if (pr.get('correlation_id', source.u_correlation_id + '')) {
            log.warn('Already a project (' + pr.getValue('number') + '), demand not created: ' + source.u_name + ' - phase "' + source.u_portfolio_phase + '"');
            ignore = true;
        }
        return;
    }
    ignore = true;                                                            // project or unmapped (logged by PART A)
})(source, map, log, target);
