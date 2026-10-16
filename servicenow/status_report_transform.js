// Status reports from Adaptive project health.
// Setup:
//   1. System property x_mig.status_as_on (string) = migration date, e.g. 2026-10-30
//   2. New Transform Map "Import Adaptive Status Reports"
//        Source table: u_import_adaptive_projects   Target table: project_status   Order: 200
//   3. Field map: Use source script = true, Target field = project, Coalesce = true  -> paste PART A
//   4. Field map: Use source script = true, Target field = as_on,   Coalesce = true  -> paste PART B
//   5. Transform Scripts: When = onBefore                                        -> paste PART C
//   6. When transforming, select BOTH maps (projects map runs first).

// ---------- PART A: field map -> project ----------
answer = (function transformEntry(source) {
    var p = new GlideRecord('pm_project');
    return p.get('correlation_id', source.u_correlation_id + '') ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> as_on ----------
answer = (function transformEntry(source) {
    return gs.getProperty('x_mig.status_as_on');
})(source);

// ---------- PART C: onBefore ----------
(function runTransformScript(source, map, log, target) {
    if (!target.project) { ignore = true; return; }                     // project not loaded
    var rag = { 'on target': 'green', 'on plan': 'green', 'needs attention': 'yellow', 'in trouble': 'red' };
    function c(v) { return rag[(v + '').toLowerCase().trim()] || ''; }
    target.overall_health = c(source.u_health);
    target.schedule = c(source.u_schedule_health);
    target.cost = c(source.u_budget_health);
    target.resources = c(source.u_resource_health);
    target.scope = c(source.u_scope_health);
    if (!target.overall_health && !target.schedule && !target.cost && !target.resources && !target.scope) { ignore = true; return; }
    var risk = source.u_risk_health + '';
    var notes = (source.u_update_notes + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    target.comments = (risk ? 'Risk health (Adaptive): ' + risk + '\n' : '') + notes;
})(source, map, log, target);
