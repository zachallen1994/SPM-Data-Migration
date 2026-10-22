// Background Script (read-only): why are projects not linked to their program?
// 1) programs in ServiceNow  2) is there a "Program Correlation ID" column, and is it filled in the latest load
// 3) does the projects / demands transform map have a field map to the program field
var p = new GlideRecord('pm_program');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
p.query();
while (p.next()) gs.print('program: ' + p.getValue('short_description') + ' | ' + p.getValue('correlation_id'));

var col = new GlideRecord('sys_dictionary');
col.addQuery('name', 'u_import_adaptive_projects');
col.addQuery('column_label', 'Program Correlation ID');
col.query();
if (!col.next()) gs.print('NO column labelled "Program Correlation ID" on u_import_adaptive_projects - add it (String, 100), then reload');
else {
    var c = col.getValue('element');
    gs.print('column: ' + c + ' (max ' + col.getValue('max_length') + ')');
    var last = new GlideRecord('sys_import_set');
    last.addQuery('table_name', 'u_import_adaptive_projects');
    last.orderByDesc('sys_created_on');
    last.setLimit(1);
    last.query();
    if (last.next()) {
        var filled = new GlideAggregate('u_import_adaptive_projects');
        filled.addQuery('sys_import_set', last.getUniqueValue());
        filled.addNotNullQuery(c);
        filled.addAggregate('COUNT'); filled.query(); filled.next();
        gs.print('latest load ' + last.getValue('number') + ': rows with a program = ' + filled.getAggregate('COUNT'));
        var s = new GlideRecord('u_import_adaptive_projects');
        s.addQuery('sys_import_set', last.getUniqueValue());
        s.addNotNullQuery(c);
        s.setLimit(3);
        s.query();
        while (s.next()) gs.print('  e.g. ' + s.getValue('u_name') + ' -> ' + s.getValue(c));
    }
}
var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.source_table', 'u_import_adaptive_projects');
fm.addQuery('target_field', 'IN', 'primary_program,program,top_program');
fm.query();
var any = false;
while (fm.next()) { any = true; gs.print('field map: ' + fm.map.name + ' -> ' + fm.getValue('target_field') + ' (script ' + fm.getValue('use_source_script') + ')'); }
if (!any) gs.print('NO field map to primary_program on the projects / demands maps - add PART C of program_transform.js');

// Per program: rows in the latest load that name it vs projects linked to it. Rows to programs NOT migrated
// (inactive in Adaptive) cannot link; demand rows link only once the demands map has its program field map.
if (c && last && last.isValidRecord()) {
    var rows = {}, s2 = new GlideRecord('u_import_adaptive_projects');
    s2.addQuery('sys_import_set', last.getUniqueValue());
    s2.addNotNullQuery(c);
    s2.query();
    while (s2.next()) { var k = s2.getValue(c); rows[k] = (rows[k] || 0) + 1; }
    for (var id in rows) {
        var prog = new GlideRecord('pm_program');
        if (!prog.get('correlation_id', id)) { gs.print('rows ' + rows[id] + ' | program NOT in ServiceNow (not active?) | ' + id); continue; }
        var lk = new GlideAggregate('pm_project');
        lk.addQuery('primary_program', prog.getUniqueValue());
        lk.addAggregate('COUNT'); lk.query(); lk.next();
        gs.print('rows ' + rows[id] + ' | projects linked ' + lk.getAggregate('COUNT') + ' | ' + prog.getValue('short_description'));
    }
}
