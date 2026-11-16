// Project Total Budget = sum of its Project Funding records (rule "Update total budget" on project_funding;
// planned_task.budget_cost is read only). Adaptive has no funding records, so they are built from the budget lines.
// Transform Map "Import Adaptive Budget Lines" (u_import_adaptive_budget_lines): Transform Scripts: onComplete.
// Runs ONCE when the transform ends: for every project / demand in this import set and every FISCAL YEAR, one
// project_funding record with Capex = sum of the Capex lines and Opex = sum of the Opex lines of that year.
// Re-runs update the same record (task + fiscal year). Powdersville: 833,973.98 Capex + 65,939.25 Opex = 899,913.23.
// To confirm with the implementation team: the funding State the records should get (choices draft / tracking /
// planning / budgeting / allocation - STATE below; blank = the table default) and whether "Selected for execution" /
// "Allocated" should be ticked. Check one project's Total Budget after the first run.
(function runTransformScript(source, map, log, target) {
    var STATE = '';                                    // ✏️ e.g. 'allocation' once confirmed; '' = default
    var sums = {};                                     // project sys_id -> fiscal year sys_id -> { capex, opex }
    var years = {};                                    // 'yyyy-MM-dd' -> fiscal year sys_id (cache)
    function fiscalYear(day) {
        if (years.hasOwnProperty(day)) return years[day];
        var f = new GlideRecord('fiscal_period');
        f.addQuery('fiscal_type', 'year');
        f.addQuery('fiscal_start_date_time', '<=', day + ' 23:59:59');
        f.addQuery('fiscal_end_date_time', '>=', day + ' 00:00:00');
        f.setLimit(1);
        f.query();
        years[day] = f.next() ? f.getUniqueValue() : '';
        return years[day];
    }
    var r = new GlideRecord(map.source_table + '');
    r.addQuery('sys_import_set', import_set.sys_id + '');
    r.query();
    var noYear = 0, noProject = 0;
    while (r.next()) {
        var amount = parseFloat(r.getValue('u_budget')) || 0;
        if (!amount) continue;
        var corr = r.getValue('u_project_correlation_id'), pid = '';
        ['pm_project', 'dmn_demand'].forEach(function (t) {
            if (pid) return;
            var p = new GlideRecord(t);
            if (p.get('correlation_id', corr)) pid = p.getUniqueValue();
        });
        if (!pid) { noProject++; continue; }
        var fy = fiscalYear(String(r.getValue('u_month') || '').substring(0, 10));
        if (!fy) { noYear++; continue; }
        sums[pid] = sums[pid] || {};
        sums[pid][fy] = sums[pid][fy] || { capex: 0, opex: 0 };
        if (/opex/i.test(r.getValue('u_expense_type'))) sums[pid][fy].opex += amount; else sums[pid][fy].capex += amount;
    }
    var made = 0;
    for (var pid in sums) {
        for (var fy in sums[pid]) {
            var fr = new GlideRecord('project_funding');
            fr.addQuery('task', pid);
            fr.addQuery('fiscal_period', fy);
            fr.query();
            var isNew = !fr.next();
            var capex = Math.round(sums[pid][fy].capex * 100) / 100, opex = Math.round(sums[pid][fy].opex * 100) / 100;
            if (fr.hasNext()) log.warn('More than one funding record for one project + fiscal year - remove the extra (project_funding_check.js)');
            // unchanged -> do not save: a save makes the funding rules add the amounts to the project again
            if (!isNew && Math.abs((parseFloat(fr.getValue('capex_budget')) || 0) - capex) < 0.01 &&
                Math.abs((parseFloat(fr.getValue('opex_budget')) || 0) - opex) < 0.01) continue;
            if (isNew) { fr.initialize(); fr.setValue('task', pid); fr.setValue('fiscal_period', fy); }
            fr.setValue('capex_budget', capex);
            fr.setValue('opex_budget', opex);
            if (STATE) fr.setValue('state', STATE);
            if (isNew) fr.insert(); else fr.update();
            made++;
        }
    }
    log.info('Project funding: ' + made + ' records (project x fiscal year) written' +
        (noYear ? '; ' + noYear + ' budget rows with no fiscal year in ServiceNow' : '') +
        (noProject ? '; ' + noProject + ' budget rows for projects not migrated' : ''));
})(source, map, log, target);
