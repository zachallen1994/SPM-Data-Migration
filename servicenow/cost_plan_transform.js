// Adaptive monthly budget lines -> cost_plan (one cost plan per line per month, so the monthly phasing matches Adaptive)
// Transform Map "Import Adaptive Budget Lines": u_import_adaptive_budget_lines -> cost_plan
//   Field map: Use source script, Target field = task,          Coalesce = true -> PART A
//   Field map: Use source script, Target field = name,          Coalesce = true -> PART B
//   Field map: Use source script, Target field = resource_type  (Cost type)     -> PART C
//   Field map: Use source script, Target field = currency                       -> PART D
//   Field map: Use source script, Target field = start_fiscal_period            -> PART E
//   Field map: Use source script, Target field = end_fiscal_period              -> PART E (same script)
//   Field map: u_budget -> unit_cost (direct)          Total planned cost = unit cost x quantity
//   Field map: quantity = 1, recurring = false (Use source script: answer = 1; / answer = false;)
//   Transform Scripts: onBefore                                                 -> PART F
// Target field names from the cost_plan dictionary: task, name, resource_type, currency, start_fiscal_period,
// end_fiscal_period, quantity, recurring, unit_cost (confirmed in the dictionary).
// Supersedes the four project-total maps in financials_transform.js for budgets.

// ---------- PART A: field map -> task ----------
answer = (function transformEntry(source) {
    var p = new GlideRecord('pm_project');
    return p.get('correlation_id', source.u_project_correlation_id + '') ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> name, e.g. "Vendor Services Opex 2026-09" (fixed, so re-runs update) ----------
answer = (function transformEntry(source) {
    return (source.u_cost_type + '').trim() + ' ' + (source.u_month + '').substring(0, 7);
})(source);

// ---------- PART C: field map -> resource_type (cost type, same names in Adaptive and ServiceNow) ----------
answer = (function transformEntry(source) {
    var t = new GlideRecord('resource_type_definition');
    return t.get('name', (source.u_cost_type + '').trim()) ? t.getUniqueValue() : '';
})(source);

// ---------- PART D: field map -> currency ----------
answer = (function transformEntry(source) {
    var c = new GlideRecord('fx_currency');
    return c.get('code', (source.u_currency + '').trim() || 'USD') ? c.getUniqueValue() : '';
})(source);

// ---------- PART E: field maps -> start_fiscal_period AND end_fiscal_period (the fiscal month of u_month) ----------
// fiscal_period field names (fiscal_type, fiscal_start_date_time, fiscal_end_date_time): confirm in the dictionary.
answer = (function transformEntry(source) {
    var day = (source.u_month + '').substring(0, 10);
    var f = new GlideRecord('fiscal_period');
    f.addQuery('fiscal_type', 'month');
    f.addQuery('fiscal_start_date_time', '<=', day + ' 23:59:59');
    f.addQuery('fiscal_end_date_time', '>=', day + ' 00:00:00');
    f.setLimit(1);
    f.query();
    return f.next() ? f.getUniqueValue() : '';
})(source);

// ---------- PART F: onBefore - skip what cannot be a cost plan ----------
(function runTransformScript(source, map, log, target) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_project_correlation_id + '')) { ignore = true; return; }   // demand / not migrated
    // Adaptive re-plans show as negative months (e.g. -24,509.50): keep them, or the line totals come out too high.
    if (!parseFloat(source.u_budget)) { ignore = true; return; }                                      // 0 budget (actual only)
    var t = new GlideRecord('resource_type_definition');
    if (!t.get('name', (source.u_cost_type + '').trim())) {
        log.warn('No ServiceNow cost type "' + source.u_cost_type + '" - budget line skipped (' + source.u_budget + ', ' + source.u_month + ')');
        ignore = true;
    }
})(source, map, log, target);
