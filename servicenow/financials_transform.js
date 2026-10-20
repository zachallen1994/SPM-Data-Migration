// Adaptive project budgets and actuals (fields on the Adaptive project, loaded into u_import_adaptive_projects)
// -> ServiceNow cost plans (budget) and expense lines (actuals). PROJECTS only; demands get totals on the demand.
//
// Four small transform maps on u_import_adaptive_projects (Order 300+), one per amount:
//   "Adaptive Opex Budget -> Cost Plan"      target cost_plan        AMOUNT_COLUMN u_opex_budget
//   "Adaptive Capex Budget -> Cost Plan"     target cost_plan        AMOUNT_COLUMN u_capex_budget
//   "Adaptive Opex Actuals -> Expense Line"  target fm_expense_line  AMOUNT_COLUMN u_operating_actuals
//   "Adaptive Capex Actuals -> Expense Line" target fm_expense_line  AMOUNT_COLUMN u_capital_actuals
// In each map:
//   Field map: Use source script, Target field = the record's project/task field, Coalesce = true -> PART A
//   Field map: Use source script, Target field = name (or short_description), Coalesce = true  -> PART B
//   Field map: Use source script, Target field = the amount field                             -> PART C
//     cost_plan: unit_cost (with quantity = 1 and recurring = false, Total planned cost = the amount)
//     fm_expense_line: amount
//   cost_plan only - other mandatory fields:
//     quantity = 1, recurring = false, entered currency = USD, cost type = per map (implementation team)
//     start_fiscal_period / end_fiscal_period -> PART E (from the project's start / end date)
//   Transform Scripts: onBefore                                                              -> PART D
//   Expense type (Opex/Capex), dates and other required fields: direct values per map, confirmed with
//   the implementation team (target field names to be confirmed in the cost_plan / fm_expense_line dictionary).
// ✏️ In each PART, set AMOUNT_COLUMN and LABEL for that map.

// ---------- PART A: field map -> project ----------
answer = (function transformEntry(source) {
    var p = new GlideRecord('pm_project');
    return p.get('correlation_id', source.u_correlation_id + '') ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> name (fixed, so re-runs update the same record) ----------
answer = (function transformEntry(source) {
    var LABEL = 'Adaptive Opex Budget';          // ✏️ Adaptive Capex Budget | Adaptive Opex Actuals | Adaptive Capex Actuals
    return LABEL;
})(source);

// ---------- PART C: field map -> amount ----------
answer = (function transformEntry(source) {
    var AMOUNT_COLUMN = 'u_opex_budget';         // ✏️ u_capex_budget | u_operating_actuals | u_capital_actuals
    return (parseFloat(source.getValue(AMOUNT_COLUMN)) || 0) + '';
})(source);

// ---------- PART D: onBefore ----------
(function runTransformScript(source, map, log, target) {
    var AMOUNT_COLUMN = 'u_opex_budget';         // ✏️ same as PART C
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_correlation_id + '')) { ignore = true; return; }   // demand or not migrated
    if (!(parseFloat(source.getValue(AMOUNT_COLUMN)) > 0)) { ignore = true; return; }        // nothing to carry over
})(source, map, log, target);

// ---------- PART E: cost_plan field maps -> start_fiscal_period / end_fiscal_period ----------
// The fiscal MONTH containing the project's start (or end) date. ✏️ DATE_FIELD = 'start_date' or 'end_date'.
// fiscal_period field names (fiscal_type, fiscal_start_date_time, fiscal_end_date_time): confirm in the dictionary.
answer = (function transformEntry(source) {
    var DATE_FIELD = 'start_date';
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_correlation_id + '') || !p.getValue(DATE_FIELD)) return '';
    var day = p.getValue(DATE_FIELD).substring(0, 10);
    var f = new GlideRecord('fiscal_period');
    f.addQuery('fiscal_type', 'month');
    f.addQuery('fiscal_start_date_time', '<=', day + ' 23:59:59');
    f.addQuery('fiscal_end_date_time', '>=', day + ' 00:00:00');
    f.setLimit(1);
    f.query();
    return f.next() ? f.getUniqueValue() : '';
})(source);
