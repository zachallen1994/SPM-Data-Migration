// Adaptive monthly ACTUALS (budget line x month) -> fm_expense_line, one expense line per line per month with an actual.
// Second transform map on the SAME staging table as the cost plans (data source: adaptive_budget_data_source.js).
// Transform Map "Import Adaptive Actuals": u_import_adaptive_budget_lines -> fm_expense_line   (Order 200, after cost plans)
//   Field map: Use source script, Target field = task,              Coalesce = true -> PART A
//   Field map: Use source script, Target field = short_description, Coalesce = true -> PART B
//   Field map: Use source script, Target field = cost_plan                          -> PART C
//   Field map: Use source script, Target field = resource_type (Cost type)          -> PART D
//   Field map: Use source script, Target field = expense_type                       -> PART E (TARGET = 'expense_type')
//   Field map: Use source script, Target field = state                              -> PART E (TARGET = 'state', VALUE 'Processed')
//   Field map: u_actual -> amount (direct)
//   Field map: u_month  -> date   (direct, Date format yyyy-MM-dd)
//   Transform Scripts: onBefore                                                     -> PART F
// Fields confirmed in the fm_expense_line dictionary: task, short_description, cost_plan, resource_type,
// expense_type, state, amount, date (none mandatory). Replaces the two old "Adaptive ... Actuals" maps.

// ---------- PART A: field map -> task (the project) ----------
answer = (function transformEntry(source) {
    var p = null;                                          // the migrated project OR demand
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    return p ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> short_description, e.g. "Adaptive actual: Hardware Capex 2025-10" ----------
answer = (function transformEntry(source) {
    return 'Adaptive actual: ' + (source.u_cost_type + '').trim() + ' ' + (source.u_month + '').substring(0, 7);
})(source);

// ---------- PART C: field map -> cost_plan (same line and month; blank when that month had no budget) ----------
answer = (function transformEntry(source) {
    var p = null;                                          // the migrated project OR demand
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    if (!p) return '';
    var c = new GlideRecord('cost_plan');
    c.addQuery('task', p.getUniqueValue());
    c.addQuery('name', (source.u_cost_type + '').trim() + ' ' + (source.u_month + '').substring(0, 7));
    c.setLimit(1);
    c.query();
    return c.next() ? c.getUniqueValue() : '';
})(source);

// ---------- PART D: field map -> resource_type (cost type, by name) ----------
answer = (function transformEntry(source) {
    var t = new GlideRecord('resource_type_definition');
    return t.get('name', (source.u_cost_type + '').trim()) ? t.getUniqueValue() : '';
})(source);

// ---------- PART E: field maps -> expense_type and state (choice looked up by label) ----------
// ✏️ expense_type map: TARGET = 'expense_type', VALUE = source.u_expense_type (Opex / Capex)
//    state map:        TARGET = 'state',        VALUE = 'Processed' (processed lines roll up to actual cost)
answer = (function transformEntry(source) {
    var TARGET = 'expense_type';
    var VALUE = (source.u_expense_type + '').trim();
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'fm_expense_line');
    c.addQuery('element', TARGET);
    c.addQuery('inactive', '!=', true);
    c.query();
    while (c.next()) {
        if ((c.getValue('label') || '').toLowerCase() == VALUE.toLowerCase() ||
            (c.getValue('value') || '').toLowerCase() == VALUE.toLowerCase()) return c.getValue('value');
    }
    log.warn('fm_expense_line.' + TARGET + ': no choice for "' + VALUE + '"');
    return '';
})(source);

// ---------- PART F: onBefore - only real actuals of migrated projects ----------
(function runTransformScript(source, map, log, target) {
    var p = null;                                          // the migrated project OR demand
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    if (!p) { ignore = true; return; }   // not migrated
    if (!parseFloat(source.u_actual)) { ignore = true; return; }        // no actual that month (negatives = corrections, kept)
})(source, map, log, target);
