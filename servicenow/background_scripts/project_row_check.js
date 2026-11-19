// Background Script (read-only): one migrated project - what Adaptive sent, what ServiceNow has, and why.
// Prints: the latest staging row (every column), the import log lines for it, the project's key fields, the field
// maps of the Projects transform map, and the history (audit) of the date fields.
var NAME = 'Construction - Atlantic';                       // ✏️ exact project name
var MAP_NAME = 'Import Adaptive Projects Transform Map';    // ✏️ the projects transform map name
var r = new GlideRecord('u_import_adaptive_projects');
r.addQuery('u_name', NAME);
r.orderByDesc('sys_created_on');
r.setLimit(1);
r.query();
if (!r.next()) gs.print('No staging row named ' + NAME);
else {
    gs.print('STAGING ROW (' + r.getValue('sys_created_on') + ', import state ' + r.getValue('sys_import_state') + ', target ' + r.getDisplayValue('sys_target_sys_id') + '):');
    var f = r.getFields();
    for (var i = 0; i < f.size(); i++) {
        var e = f.get(i), n = e.getName();
        if (n.indexOf('u_') == 0 && e.toString()) gs.print('   ' + e.getLabel() + ' (' + n + ') = ' + e.toString());
    }
    var lg = new GlideRecord('import_log');
    lg.addQuery('import_set', r.getValue('sys_import_set'));
    lg.addQuery('message', 'CONTAINS', NAME).addOrCondition('message', 'CONTAINS', r.getValue('u_correlation_id'));
    lg.query();
    while (lg.next()) gs.print('LOG ' + lg.getValue('level') + ': ' + lg.getValue('message'));
}
var p = new GlideRecord('pm_project');
p.addQuery('short_description', NAME);
p.query();
while (p.next()) {
    gs.print('PROJECT ' + p.getValue('number') + ' created ' + p.getValue('sys_created_on') + ' by ' + p.getValue('sys_created_by') + ' | correlation ' + p.getValue('correlation_id'));
    ['start_date', 'end_date', 'approved_start_date', 'approved_end_date', 'duration', 'state', 'status', 'phase', 'percent_complete',
     'project_manager', 'primary_program', 'primary_portfolio', 'business_category', 'expense_type', 'schedule'].forEach(function (x) {
        if (p.isValidField(x)) gs.print('   ' + x + ' = ' + p.getValue(x) + (p.getDisplayValue(x) != p.getValue(x) ? ' (' + p.getDisplayValue(x) + ')' : ''));
    });
    var fl = p.getFields();
    for (var j = 0; j < fl.size(); j++) { var el = fl.get(j); if (el.getDisplayValue() == 'undefined') gs.print('   "undefined" in ' + el.getName() + ' (' + el.getLabel() + ')'); }
    var a = new GlideRecord('sys_audit');
    a.addQuery('tablename', 'pm_project');
    a.addQuery('documentkey', p.getUniqueValue());
    a.addQuery('fieldname', 'IN', 'start_date,end_date,approved_start_date');
    a.orderBy('sys_created_on');
    a.query();
    while (a.next()) gs.print('   history ' + a.getValue('sys_created_on') + ' ' + a.getValue('fieldname') + ': "' + a.getValue('oldvalue') + '" -> "' + a.getValue('newvalue') + '" by ' + a.getValue('user'));
}
var m = new GlideRecord('sys_transform_map');
if (m.get('name', MAP_NAME)) {
    var t = new GlideRecord('sys_transform_entry');
    t.addQuery('map', m.getUniqueValue());
    t.orderBy('target_field');
    t.query();
    while (t.next()) gs.print('FIELD MAP ' + t.getValue('source_field') + ' -> ' + t.getValue('target_field') + (t.getValue('use_source_script') == '1' ? ' (script)' : '') +
        (t.getValue('coalesce') == '1' ? ' COALESCE' : ''));
} else gs.print('No transform map named ' + MAP_NAME);
