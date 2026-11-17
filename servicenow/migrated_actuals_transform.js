// OPTION A - "Migrated actuals to date": one Processed expense line per project for Adaptive Capital Actuals and one
// for Operating Actuals (when not 0). Adaptive has no line-level actuals (no POs / invoices / time-phased actuals),
// only these project totals - so ServiceNow Actual cost = Adaptive Total Actual on day one.
// Transform Map "Import Adaptive Projects Transform Map": Transform Scripts: onAfter -> this script (and the same on
// the Demands map if demands should carry actuals). Re-runs update the same two lines (matched by task + description).
// ✏️ To confirm with finance before use: COST TYPES (no "Other" type in TEST) and DATE.
(function runTransformScript(source, map, log, target) {
    var CAPEX_COST_TYPE = 'Contingency Capex';   // ✏️ finance decides (or a new "Migrated Actuals" type)
    var OPEX_COST_TYPE  = 'Contingency Opex';    // ✏️
    var DATE = new GlideDate().getValue();       // ✏️ cutover date (today); or a fixed 'yyyy-MM-dd'
    function num(col) { return Math.round((parseFloat(source.getValue(col)) || 0) * 100) / 100; }
    function choice(label) {
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', 'fm_expense_line'); c.addQuery('element', 'state'); c.addQuery('label', label); c.query();
        return c.next() ? c.getValue('value') : '';
    }
    function expType(label) {
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', 'fm_expense_line'); c.addQuery('element', 'expense_type'); c.addQuery('label', label); c.query();
        return c.next() ? c.getValue('value') : label.toLowerCase();
    }
    [['Capex', num('u_capital_actuals'), CAPEX_COST_TYPE], ['Opex', num('u_operating_actuals'), OPEX_COST_TYPE]].forEach(function (a) {
        var desc = 'Migrated actuals to date (Adaptive ' + a[0] + ')';
        var e = new GlideRecord('fm_expense_line');
        e.addQuery('task', target.getUniqueValue());
        e.addQuery('short_description', desc);
        e.query();
        var exists = e.next();
        if (!a[1]) { if (exists) e.deleteRecord(); return; }          // 0 in Adaptive: no line
        if (!exists) { e.initialize(); e.setValue('task', target.getUniqueValue()); e.setValue('short_description', desc); }
        e.setValue('amount', a[1]);
        e.setValue('date', DATE);
        e.setValue('expense_type', expType(a[0]));
        var ct = new GlideRecord('resource_type_definition');
        if (ct.get('name', a[2])) e.setValue('resource_type', ct.getUniqueValue());
        else log.warn('Migrated actuals: no cost type "' + a[2] + '" - line created without a cost type');
        e.setValue('state', choice('Processed'));
        if (exists) e.update(); else e.insert();
    });
})(source, map, log, target);
