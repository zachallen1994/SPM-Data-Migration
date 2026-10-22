// Background Script (read-only): why does the Asana Tasks data source load 0 rows?
// Changes nothing. Paste into System Definition > Scripts - Background and click Run script.
function get(path) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint('https://app.asana.com/api/1.0' + path);
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('Asana ' + res.getStatusCode() + ': ' + res.getBody()); return []; }
    return JSON.parse(res.getBody()).data;
}

// 1. Asana projects already in ServiceNow (the tasks load only follows these)
var ids = {};
['pm_project', 'dmn_demand'].forEach(function (t) {
    var g = new GlideRecord(t);
    g.addQuery('correlation_id', 'STARTSWITH', 'ASANA');
    g.query();
    gs.print('==== 1. ' + t + ' records with an ASANA correlation_id: ' + g.getRowCount());
    while (g.next()) { gs.print('  [' + g.getValue('correlation_id') + '] ' + g.getValue('short_description')); ids[g.getValue('correlation_id')] = true; }
});

// 2. Portfolio items in Asana, whether ServiceNow has them, and how many subtasks each has
var items = get('/projects/' + gs.getProperty('x_mig.asana.project_gid') + '/tasks?limit=100&opt_fields=gid,name,num_subtasks');
gs.print('==== 2. Portfolio items in Asana: ' + items.length + ' (first 100)');
items.forEach(function (t) {
    if (ids['ASANA:' + t.gid]) gs.print('  IN SERVICENOW  ASANA:' + t.gid + '  ' + t.name + '  subtasks: ' + t.num_subtasks);
});

// 3. For the migrated items: are the work plans subtasks, or separate Asana projects?
items.forEach(function (t) {
    if (!ids['ASANA:' + t.gid]) return;
    var subs = get('/tasks/' + t.gid + '/subtasks?limit=5&opt_fields=name');
    gs.print('==== 3. ' + t.name + ': first subtasks: ' + subs.map(function (s) { return s.name; }).join(' | '));
    var found = get('/workspaces/5286451799521/typeahead?resource_type=project&count=5&query=' + encodeURIComponent(t.name));
    gs.print('     Asana projects with a similar name: ' + found.map(function (p) { return p.name + ' (' + p.gid + ')'; }).join(' | '));
});
