// Data Source: "Adaptive Budget Lines - API"   Type: Custom (Load by Script)
// Import set table: u_import_adaptive_budget_lines (staging_csv/u_import_adaptive_budget_lines.csv)
// One row per Adaptive budget line per MONTH, e.g. Wyandot | Vendor Services Opex | 2026-09 | 3,465.
//   Lines:  NonLaborResourceLinkDirect (WorkItem = project, NonLaborResource.Name = the cost type)
//           (the same lines also appear as NonLaborResourceLinkAggregated - not used, they would double the budget)
//   Months: NonLaborResourceTimePhase (RelatedLink = the line). On this tenant the monthly BUDGET is in
//           C_BudgetCostTest ("Budget"); the standard PlannedBudget field is labelled "Do Not Use" and holds 0.
// Only lines of Adaptive projects already migrated are loaded. Transform: cost_plan_transform.js.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var BUDGET_FIELD = 'C_BudgetCostTest';   // monthly budget field (confirm with the Adaptive admin)
    var ACTUAL_FIELD = 'ActualCost';         // monthly actual
    var ONLY = [];                 // ✏️ test / batch: project or demand numbers or names, e.g. ['PRJ0011395']; [] = all
    // =========================================================

    var LABELS = ['Correlation ID', 'Project Correlation ID', 'Cost Type', 'Expense Type', 'Month', 'Budget', 'Actual', 'Currency'];
    var table = data_source.getValue('import_set_table_name');
    var col = {};
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'STARTSWITH', 'u_');
    d.query();
    while (d.next()) col[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');
    var missing = LABELS.filter(function (l) { return !col[l.toLowerCase()]; });
    if (missing.length) { import_log.error('Missing columns in ' + table + ' (create it from the CSV): ' + missing.join(', ')); return; }

    var projects = [];
    ['pm_project', 'dmn_demand'].forEach(function (t) {           // projects AND demands
        var p = new GlideRecord(t);
        p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
        p.query();
        while (p.next()) {
            if (ONLY.length && ONLY.indexOf(p.getValue('number')) < 0 && ONLY.indexOf(p.getValue('short_description')) < 0) continue;
            projects.push(p.getValue('correlation_id').replace('ADAPTIVE:', ''));
        }
    });
    if (!projects.length) { import_log.warn('No Adaptive projects in pm_project yet - load those first'); return; }

    function query(q) {                                   // all pages
        var out = [], paging = { from: 0, limit: 100 };
        while (true) {
            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('POST');
            r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
            r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestBody(JSON.stringify({ q: q, paging: paging }));
            var res = r.execute();
            if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody() + ' -- query: ' + q;
            var body = JSON.parse(res.getBody());
            out = out.concat(body.entities);
            if (!body.paging || !body.paging.hasMore) return out;
            paging = body.paging;
        }
    }
    function money(m) { return m && m.value !== undefined ? parseFloat(m.value) || 0 : 0; }
    function last(ref) { return ref && ref.id ? decodeURIComponent(String(ref.id).split('/').slice(2).join('/')) : ''; }

    var lines = 0, count = 0, empty = 0;
    try {
        for (var i = 0; i < projects.length; i += 20) {
            var where = projects.slice(i, i + 20).map(function (id) { return "WorkItem = '" + id + "'"; }).join(' OR ');
            query('SELECT WorkItem, NonLaborResource.Name, ExpenseType, DefaultCurrency FROM NonLaborResourceLinkDirect WHERE ' + where)
            .forEach(function (line) {
                lines++;
                query('SELECT Date, FiscalMonth, ' + BUDGET_FIELD + ', ' + ACTUAL_FIELD +
                      " FROM NonLaborResourceTimePhase WHERE RelatedLink = '" + line.id + "'")
                .forEach(function (m) {
                    var budget = money(m[BUDGET_FIELD]), actual = money(m[ACTUAL_FIELD]);
                    if (!budget && !actual) { empty++; return; }
                    var row = {};
                    row[col['correlation id']] = 'ADAPTIVE:' + m.id;
                    row[col['project correlation id']] = 'ADAPTIVE:' + (line.WorkItem ? line.WorkItem.id : '');
                    row[col['cost type']] = line.NonLaborResource ? line.NonLaborResource.Name : '';
                    row[col['expense type']] = last(line.ExpenseType);
                    row[col['month']] = String(m.FiscalMonth || m.Date || '').substring(0, 10);
                    row[col['budget']] = String(budget);
                    row[col['actual']] = String(actual);
                    row[col['currency']] = last(line.DefaultCurrency) || 'USD';
                    import_set_table.insert(row);
                    count++;
                });
            });
        }
    } catch (err) { import_log.error(String(err)); return; }
    import_log.info('Adaptive budget lines: ' + lines + ' -> ' + count + ' monthly rows (' + empty +
        ' months with no budget and no actual skipped) for ' + projects.length + ' projects');
})(import_set_table, data_source, import_log, last_success_import_time);
