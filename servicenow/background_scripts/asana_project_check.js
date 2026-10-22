// Background Script (read-only): one Asana project traced through all three stages:
//   1. what Asana itself has (built-in fields + every custom field)
//   2. what landed in the import set row
//   3. what the transform map does with each column
// Changes nothing.
var PROJECT_NAME = 'Flu Program';   // ✏️ exact Asana name
var STAGING = 'u_import_asana_hr_project_portfolio';      // ✏️ the Asana projects import set table

// ---- 1. Asana
var row = new GlideRecord(STAGING);
row.addQuery('u_name', PROJECT_NAME);
row.orderByDesc('sys_created_on');
row.setLimit(1);
row.query();
var gid = row.next() ? (row.getValue('u_correlation_id') || '').replace('ASANA:', '') : '';
gs.print('==== 1. ASANA (gid ' + (gid || 'not found in staging - check PROJECT_NAME / STAGING') + ')');
if (gid) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint('https://app.asana.com/api/1.0/projects/' + gid + '?opt_fields=name,owner.name,owner.email,team.name,' +
        'start_on,due_on,completed,archived,current_status_update.status_type,current_status_update.title,notes,' +
        'custom_fields.name,custom_fields.display_value');
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var p = JSON.parse(r.execute().getBody()).data;
    if (!p) {                                                  // not a project: a tracker row (an Asana task)
        r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint('https://app.asana.com/api/1.0/tasks/' + gid + '?opt_fields=name,assignee.name,assignee.email,' +
            'start_on,due_on,completed,notes,custom_fields.name,custom_fields.display_value');
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        p = JSON.parse(r.execute().getBody()).data || {};
        p.owner = p.assignee;
        gs.print('  (tracker row)');
    }
    gs.print('  owner: ' + (p.owner ? p.owner.name + ' <' + p.owner.email + '>' : '(none)') + ' | team: ' + (p.team ? p.team.name : '') +
        ' | start: ' + p.start_on + ' | due: ' + p.due_on + ' | status: ' +
        (p.current_status_update ? p.current_status_update.status_type : '(none)'));
    var cf = p.custom_fields || [];
    gs.print('  custom fields on the project: ' + cf.length);
    cf.forEach(function (f) { gs.print('    ' + f.name + ' = ' + (f.display_value || '(blank)')); });
}

// ---- 2. Import set row
gs.print('\n==== 2. IMPORT SET ROW (' + STAGING + ')');
if (row.isValidRecord()) {
    var fields = row.getFields();
    for (var i = 0; i < fields.size(); i++) {
        var f = fields.get(i), n = f.getName();
        if (n.indexOf('u_') == 0) gs.print('  ' + f.getLabel() + ' (' + n + ') = ' + (f.getDisplayValue() || '(blank)'));
    }
}

// ---- 3. Transform map(s) on this table
gs.print('\n==== 3. FIELD MAPS');
var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.source_table', STAGING);
fm.orderBy('target_field');
fm.query();
while (fm.next()) gs.print('  ' + (fm.getValue('use_source_script') == '1' ? '[script]' : fm.getValue('source_field')) +
    ' -> ' + fm.getValue('target_field') + (fm.getValue('coalesce') == '1' ? '  (coalesce)' : ''));
