// Adaptive status history (C_StatusHistory) -> project_status. One ServiceNow status report per Adaptive record.
// Transform Map "Import Adaptive Status History": u_import_adaptive_status_history -> project_status
//   Field map: Use source script = true, Target field = project, Coalesce = true -> PART A
//   Field map: Use source script = true, Target field = as_on,   Coalesce = true -> PART B
//   Transform Scripts: When = onBefore                                       -> PART C

// ---------- PART A: field map -> project ----------
answer = (function transformEntry(source) {
    var p = new GlideRecord('pm_project');
    return p.get('correlation_id', source.u_project_correlation_id + '') ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> as_on (Adaptive "Updated On", yyyy-MM-dd) ----------
answer = (function transformEntry(source) {
    return source.u_updated_on + '';
})(source);

// ---------- PART C: onBefore ----------
(function runTransformScript(source, map, log, target) {
    // onBefore runs BEFORE the field maps, so target.project is still empty here: look the project up from the source
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_project_correlation_id + '')) {   // project not migrated (or a demand)
        log.info('Status skipped - project not in ServiceNow: ' + source.u_project_correlation_id);
        ignore = true;
        return;
    }
    var rag = { 'on target': 'green', 'on plan': 'green', 'needs attention': 'yellow', 'in trouble': 'red' };
    function c(v, label) {
        var s = (v + '').toLowerCase().trim();
        if (s && !rag[s]) log.warn('Unmapped ' + label + ' "' + v + '" on ' + source.u_correlation_id);
        return rag[s] || '';
    }
    target.overall_health = c(source.u_health, 'Health');
    target.schedule = c(source.u_schedule_health, 'Schedule Health');
    target.cost = c(source.u_budget_health, 'Budget Health');
    target.resources = c(source.u_resource_health, 'Resource Health');
    target.scope = c(source.u_scope_health, 'Scope Health');
    var lines = [];
    if (source.u_risk_health + '') lines.push('Risk health (Adaptive): ' + source.u_risk_health);
    if (source.u_updated_by + '') lines.push('Updated by (Adaptive): ' + source.u_updated_by);
    [source.u_status_update, source.u_status_update_1].forEach(function (t) {
        t = (t + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
        if (t) lines.push(t);
    });
    target.comments = lines.join('\n');
})(source, map, log, target);
