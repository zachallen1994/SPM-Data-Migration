// Background Script (read-only): Construction Program / Construction projects - what is in ServiceNow and why.
var p = new GlideRecord('pm_project');
p.addQuery('short_description', 'CONTAINS', 'Construction');
p.query();
while (p.next()) gs.print('pm_project ' + p.getValue('number') + ' | ' + p.getValue('short_description') + ' | correlation_id ' + p.getValue('correlation_id') + ' | created ' + p.getValue('sys_created_on') + ' by ' + p.getValue('sys_created_by'));
var g = new GlideRecord('pm_program');
g.addQuery('short_description', 'CONTAINS', 'Construction');
g.query();
while (g.next()) gs.print('pm_program ' + g.getValue('number') + ' | ' + g.getValue('short_description') + ' | ' + g.getValue('correlation_id'));
gs.print('projects property x_mig.adaptive.project_types = "' + gs.getProperty('x_mig.adaptive.project_types', '(not set)') + '"');
// Adaptive: the construction projects, their type, state and parent
var r = new sn_ws.RESTMessageV2();
r.setHttpMethod('POST');
r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
r.setRequestHeader('Content-Type', 'application/json');
r.setRequestBody(JSON.stringify({ q: "SELECT Name, ProjectType, State, Parent FROM Project WHERE Name LIKE '%Construction%'", paging: { from: 0, limit: 50 } }));
var res = r.execute();
if (res.getStatusCode() != 200) gs.print('Adaptive ' + res.getStatusCode() + ': ' + res.getBody());
else (JSON.parse(res.getBody()).entities || []).forEach(function (e) {
    function v(x) { return x && x.id ? decodeURIComponent(String(x.id).split('/').slice(2).join('/')) : ''; }
    gs.print('Adaptive project ' + e.Name + ' | type ' + v(e.ProjectType) + ' | state ' + v(e.State) + ' | parent ' + (e.Parent ? e.Parent.id : ''));
});
