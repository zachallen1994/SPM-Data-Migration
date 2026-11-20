// Background Script (read-only): which Asana fields reach ServiceNow, and where are the gaps?
// For ONE Asana project (tracker item), side by side:
//   1. every field Asana holds for it (built-in + custom fields, with values)        <- what exists in Asana
//   2. every column of the staging table and the value the latest load put in it      <- what the data source loads
//   3. every field map of the Asana projects transform map (source column -> target)  <- what reaches the project
// A custom field is loaded only when a staging column has the SAME LABEL as the Asana field name.
var NAME = 'FY26 AI Enablement [Managing projects in Asana]';   // ✏️ exact project name (as in ServiceNow)
var STAGING = 'u_import_asana_hr_project_portfolio';             // ✏️ Asana projects staging table
var MAP_NAME = '';                                               // ✏️ transform map name; '' = every map on STAGING
var p = new GlideRecord('pm_project');
if (!p.get('short_description', NAME)) gs.print('No project named ' + NAME);
else {
    var gid = (p.getValue('correlation_id') || '').replace('ASANA:', '');
    gs.print('ServiceNow ' + p.getValue('number') + ' | Asana gid ' + gid);
    // 1. Asana
    try {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint('https://app.asana.com/api/1.0/tasks/' + gid + '?opt_fields=name,assignee.name,assignee.email,start_on,due_on,completed,notes,tags.name,memberships.section.name,custom_fields.name,custom_fields.display_value');
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() != 200) {      // not a tracker item: try it as an Asana project
            r.setEndpoint('https://app.asana.com/api/1.0/projects/' + gid + '?opt_fields=name,owner.name,owner.email,team.name,start_on,due_on,notes,custom_fields.name,custom_fields.display_value');
            res = r.execute();
        }
        var a = JSON.parse(res.getBody()).data || {};
        gs.print('1. ASANA built-in: assignee/owner ' + JSON.stringify(a.assignee || a.owner || '') + ' | start ' + a.start_on + ' | due ' + a.due_on +
            ' | section ' + ((a.memberships || []).map(function (m) { return m.section ? m.section.name : ''; }).join(',')) + ' | team ' + (a.team ? a.team.name : ''));
        (a.custom_fields || []).forEach(function (f) { gs.print('1. ASANA custom field "' + f.name + '" = ' + (f.display_value || '(empty)')); });
    } catch (e) { gs.print('Asana call failed: ' + e); }
    // 2. staging
    var s = new GlideRecord(STAGING);
    s.addQuery('u_correlation_id', p.getValue('correlation_id'));
    s.orderByDesc('sys_created_on');
    s.setLimit(1);
    s.query();
    if (s.next()) {
        var f = s.getFields();
        for (var i = 0; i < f.size(); i++) {
            var e = f.get(i);
            if (e.getName().indexOf('u_') == 0) gs.print('2. STAGING "' + e.getLabel() + '" (' + e.getName() + ') = ' + (e.toString() || '(empty)'));
        }
    } else gs.print('2. no staging row in ' + STAGING);
}
// 3. field maps
var m = new GlideRecord('sys_transform_map');
m.addQuery('source_table', STAGING);
if (MAP_NAME) m.addQuery('name', MAP_NAME);
m.query();
while (m.next()) {
    var t = new GlideRecord('sys_transform_entry');
    t.addQuery('map', m.getUniqueValue());
    t.orderBy('target_field');
    t.query();
    while (t.next()) gs.print('3. MAP ' + m.getValue('name') + ' | ' + (t.getValue('source_field') || '(script)') + ' -> ' + t.getValue('target_field') +
        (t.getValue('use_source_script') == '1' ? ' (script)' : ''));
}
