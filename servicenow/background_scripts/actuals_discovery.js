// Background Script (read-only): where are a project's ACTUALS (Adaptive "Total Actual", POs / invoices) kept?
// The budget lines (NonLaborResourceTimePhase.ActualCost) hold 0 for Powdersville, but Adaptive shows 3,062.50.
// 1) every money field with "actual" on NonLaborResourceTimePhase and its non-zero values for the project's lines
// 2) the project's actual fields
// 3) which expense / PO / invoice entities exist, and how many records they have for the project
var PROJECT = '25255-19488-GVL Powdersville MOB';   // ✏️ exact Adaptive project name
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    return { code: res.getStatusCode(), body: res.getBody() };
}
function fields(entity, re) {
    var r = call('GET', '/metadata/describeEntities?typeNames=' + entity);
    if (r.code != 200) return null;
    return JSON.parse(r.body).entityDescriptions[0].fields.filter(function (f) { return re.test(f.name + ' ' + (f.label || '')); });
}
function q(query) {
    var r = call('POST', '/data/query', { q: query, paging: { from: 0, limit: 100 } });
    if (r.code != 200) return { error: r.code + ' ' + r.body.substring(0, 200) };
    return JSON.parse(r.body);
}
function money(v) { return v && v.value !== undefined ? parseFloat(v.value) || 0 : parseFloat(v) || 0; }
try {
    var p = (q("SELECT Name, C_TotalActual, C_CapitalActuals, C_OperatingActuals FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'").entities || [])[0];
    if (!p) { gs.print('No Adaptive project ' + PROJECT); }
    else {
        gs.print('Project ' + p.id + ' | Total Actual ' + money(p.C_TotalActual) + ' | Capital ' + money(p.C_CapitalActuals) + ' | Operating ' + money(p.C_OperatingActuals));
        var af = fields('NonLaborResourceTimePhase', /actual/i) || [];
        gs.print('NonLaborResourceTimePhase actual fields: ' + af.map(function (f) { return f.name + ' "' + (f.label || '') + '"'; }).join(', '));
        var lines = q("SELECT NonLaborResource.Name FROM NonLaborResourceLinkDirect WHERE WorkItem = '" + p.id + "'").entities || [];
        lines.forEach(function (l) {
            var tp = q('SELECT Date, ' + af.map(function (f) { return f.name; }).join(', ') + " FROM NonLaborResourceTimePhase WHERE RelatedLink = '" + l.id + "'");
            (tp.entities || []).forEach(function (m) {
                af.forEach(function (f) { var v = money(m[f.name]); if (v) gs.print('  ' + (l.NonLaborResource ? l.NonLaborResource.Name : '') + ' | ' + String(m.Date).substring(0, 10) + ' | ' + f.name + ' = ' + v); });
            });
        });
        ['Expense', 'ExpenseSheet', 'ExpenseEntry', 'C_PurchaseOrder', 'PurchaseOrder', 'C_PO', 'Invoice', 'C_Invoice', 'C_Actuals', 'C_Actual', 'NonLaborResourceLinkAggregated'].forEach(function (e) {
            var fl = fields(e, /./);
            if (!fl) { gs.print('entity ' + e + ': not found'); return; }
            var ref = fl.filter(function (f) { return /^(Project|WorkItem|PlannedFor|C_Project|RelatedWorkItem|C_RelatedProject)$/.test(f.name); }).map(function (f) { return f.name; })[0];
            var n = ref ? q('SELECT ' + ref + ' FROM ' + e + ' WHERE ' + ref + " = '" + p.id + "'") : null;
            gs.print('entity ' + e + ' EXISTS | project field ' + (ref || '(none found)') + ' | records for this project: ' +
                (n ? (n.error || (n.entities || []).length) : '-') + ' | money fields: ' +
                fl.filter(function (f) { return f.type == 'Money'; }).map(function (f) { return f.name; }).slice(0, 12).join(', '));
        });
    }
} catch (err) { gs.print('ERROR: ' + err); }
