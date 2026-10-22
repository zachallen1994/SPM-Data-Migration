// Background Script (read-only): confirm the field names the program load needs, before building it.
// 1) pm_program fields + State choices  2) the pm_project field that points to a program
// 3) Adaptive Program fields + how many programs are active
var t = new GlideRecord('sys_dictionary');
t.addQuery('name', 'IN', 'pm_program,planned_task,task');
t.addQuery('element', 'IN', 'correlation_id,short_description,description,program_manager,state,start_date,end_date,portfolio');
t.query();
while (t.next()) gs.print('pm_program field: ' + t.getValue('element') + ' (' + t.getValue('column_label') + ', ' +
    t.getValue('internal_type') + (t.getValue('reference') ? ' -> ' + t.getValue('reference') : '') + ', max ' +
    t.getValue('max_length') + ', on ' + t.getValue('name') + ')');
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', 'pm_program,planned_task,task'); c.addQuery('element', 'state'); c.addQuery('inactive', false);
c.orderBy('name'); c.orderBy('sequence'); c.query();
while (c.next()) gs.print('state choice (' + c.getValue('name') + '): ' + c.getValue('value') + ' = ' + c.getValue('label'));

var r = new GlideRecord('sys_dictionary');
r.addQuery('name', 'IN', 'pm_project,planned_task,task');
r.addQuery('reference', 'pm_program');
r.query();
while (r.next()) gs.print('project -> program field: ' + r.getValue('element') + ' (' + r.getValue('column_label') + ', on ' + r.getValue('name') + ')');

var x = new sn_ws.RESTMessageV2();
x.setHttpMethod('GET');
x.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/metadata/describeEntities?typeNames=Program');
x.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
var res = x.execute();
if (res.getStatusCode() == 200) {
    var want = /^(Name|Description|Manager|StartDate|DueDate|State|Phase|Parent|C_.*Manager.*)$/;
    JSON.parse(res.getBody()).entityDescriptions[0].fields.forEach(function (f) {
        if (want.test(f.name)) gs.print('Adaptive Program field: ' + f.name + ' (' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : '') + ')');
    });
} else gs.print('Adaptive describe ' + res.getStatusCode() + ': ' + res.getBody());

var q = new sn_ws.RESTMessageV2();
q.setHttpMethod('POST');
q.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
q.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
q.setRequestHeader('Content-Type', 'application/json');
q.setRequestBody(JSON.stringify({ q: 'SELECT Name, State, Manager.Email FROM Program', paging: { from: 0, limit: 100 } }));
var b = JSON.parse(q.execute().getBody());
(b.entities || []).forEach(function (e) {
    var s = e.State && e.State.id ? e.State.id.split('/').pop() : '';
    if (s == 'Active') gs.print('active program: ' + e.Name + ' | manager ' + (e.Manager && e.Manager.Email ? e.Manager.Email : '(none)'));
});
