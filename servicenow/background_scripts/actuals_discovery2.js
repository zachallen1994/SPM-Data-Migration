// Background Script (read-only): Powdersville's Adaptive actual 3,417.75 is not on the monthly budget rows and is not
// hours x $49 (actual effort is 176 h). Checks the remaining places that can hold it, printing every non-zero value:
// 1) the aggregated budget lines (NonLaborResourceLinkAggregated) - money fields with "actual"
// 2) the project's labor resource links - actual cost fields
// 3) the project's own money fields with "actual" / "cost" / "labor"
var PROJECT = '25255-19488-GVL Powdersville MOB';   // ✏️ exact Adaptive project name
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw path + ' ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 200);
    return JSON.parse(res.getBody());
}
function moneyFields(entity, re) {
    return call('GET', '/metadata/describeEntities?typeNames=' + entity).entityDescriptions[0].fields
        .filter(function (f) { return f.type == 'Money' && re.test(f.name + ' ' + (f.label || '')); });
}
function val(v) { return v && v.value !== undefined ? parseFloat(v.value) || 0 : parseFloat(v) || 0; }
function show(entity, where, re, nameField) {
    var f = moneyFields(entity, re);
    var rows = call('POST', '/data/query', { q: 'SELECT ' + (nameField ? nameField + ', ' : '') + f.map(function (x) { return x.name; }).join(', ') + ' FROM ' + entity + ' WHERE ' + where, paging: { from: 0, limit: 100 } }).entities || [];
    var sums = {};
    rows.forEach(function (r) {
        f.forEach(function (x) {
            var v = val(r[x.name]);
            if (!v) return;
            sums[x.name] = (sums[x.name] || 0) + v;
            gs.print('  ' + entity + ' | ' + (nameField ? (r[nameField.split('.')[0]] && r[nameField.split('.')[0]].Name || '') : r.id) + ' | ' + x.name + ' "' + (x.label || '') + '" = ' + v);
        });
    });
    gs.print(entity + ': ' + rows.length + ' records | totals ' + JSON.stringify(sums));
}
try {
    var p = (call('POST', '/data/query', { q: "SELECT Name FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'", paging: { from: 0, limit: 1 } }).entities || [])[0];
    show('NonLaborResourceLinkAggregated', "WorkItem = '" + p.id + "'", /actual/i, 'NonLaborResource.Name');
    show('RegularResourceLink', "WorkItem = '" + p.id + "'", /actual|cost/i, 'Resource.Name');
    show('Project', "id = '" + p.id + "'", /actual|cost|labor/i, '');
} catch (err) { gs.print('ERROR: ' + err); }
