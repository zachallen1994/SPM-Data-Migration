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
        if (!/^\d{4}-\d{2}/.test(day)) return '';
        day = day.substring(0, 7) + '-15';             // mid-month: periods are stored in UTC, the 1st can fall in the previous year
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
    var seen = {}, dupes = 0;
    while (r.next()) {
        // the same budget line + month can be in the import set more than once (e.g. the load ran twice) - count it once
        var key = r.getValue('u_correlation_id') + '|' + String(r.getValue('u_month') || '').substring(0, 10);
        if (seen[key]) { dupes++; continue; }
        seen[key] = true;
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
    // a fiscal year a project no longer has budget in (e.g. January lines moved by the mid-month fix, or an Adaptive
    // re-plan): set its funding record to 0, so the project's Total Budget does not count it any more
    var zeroed = 0;
    for (var pz in sums) {
        var old = new GlideRecord('project_funding');
        old.addQuery('task', pz);
        old.query();
        while (old.next()) {
            if (sums[pz][old.getValue('fiscal_period')]) continue;
            if (!(parseFloat(old.getValue('capex_budget')) || 0) && !(parseFloat(old.getValue('opex_budget')) || 0)) continue;
            old.setValue('capex_budget', 0);
            old.setValue('opex_budget', 0);
            old.update();
            zeroed++;
        }
    }
    if (zeroed) log.warn('Project funding: ' + zeroed + ' records of fiscal years with no budget lines any more set to 0');
    log.info('Project funding: ' + made + ' records (project x fiscal year) written' +
        (noYear ? '; ' + noYear + ' budget rows with no fiscal year in ServiceNow' : '') +
        (noProject ? '; ' + noProject + ' budget rows for projects not migrated' : '') +
        (dupes ? '; ' + dupes + ' duplicate rows (same line and month) counted once' : ''));
})(source, map, log, target);
