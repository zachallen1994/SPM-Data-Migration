// Background Script: which part of ServiceNow changes a migrated project's (or task's) planned end date?
// Read-only with TRY = 'none'. The other TRY values change ONE record in Dev and read it back:
//   'rules'  = set start / end like a normal save (all business rules run)
//   'nocalc' = the same with run_calc_brs = false (the planning rules with that condition are skipped)
var TABLE = 'pm_project';                                  // ✏️ pm_project or pm_project_task
var NUMBER = 'PRJ0011395';                                 // ✏️ the record (use the NEW number after a reload)
var MAP_NAME = 'Import Adaptive Projects Transform Map';   // ✏️ its transform map
var START = '2026-07-22', END = '2027-02-02';              // ✏️ Adaptive Schedule Start / Finish
var TRY = 'none';                                          // ✏️ 'none' | 'rules' | 'nocalc'

function show(label, r) {
    gs.print(label + ': start ' + r.getValue('start_date') + ' | end ' + r.getValue('end_date') + ' | duration ' +
        r.getDisplayValue('duration') + ' | time constraint ' + r.getDisplayValue('time_constraint') +
        ' | schedule ' + r.getDisplayValue('schedule') + ' | run_calc_brs ' + r.getValue('run_calc_brs'));
}

var m = new GlideRecord('sys_transform_map');
if (m.get('name', MAP_NAME)) {
    var fm = new GlideRecord('sys_transform_entry');
    fm.addQuery('map', m.getUniqueValue());
    fm.addQuery('target_field', 'IN', 'start_date,end_date,duration,time_constraint');
    fm.query();
    if (!fm.hasNext()) gs.print('NO field map to start_date / end_date on ' + MAP_NAME);
    while (fm.next()) gs.print('field map: ' + (fm.getValue('source_field') || '[script]') + ' -> ' + fm.getValue('target_field') +
        ' | date format "' + (fm.getValue('date_format') || '') + '"');
} else gs.print('No transform map named ' + MAP_NAME);

// the staging columns' type (a Date column ignores the field map's date format)
var col = new GlideRecord('sys_dictionary');
col.addQuery('name', 'u_import_adaptive_projects');
col.addQuery('column_label', 'IN', 'Schedule Start,Schedule Finish');
col.query();
while (col.next()) gs.print('staging column: ' + col.getValue('column_label') + ' = ' + col.getValue('element') + ' | ' + col.getValue('internal_type'));

var r = new GlideRecord(TABLE);
if (!r.get('number', NUMBER)) gs.print('No ' + TABLE + ' ' + NUMBER);
else {
    show(NUMBER + ' now', r);
    if (TRY != 'none') {
        var s = new GlideDateTime(); s.setDisplayValue(START + ' 00:00:00', 'yyyy-MM-dd HH:mm:ss');
        var e = new GlideDateTime(); e.setDisplayValue(END + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');
        if (TRY == 'nocalc') r.run_calc_brs = false;
        r.start_date = s;
        r.end_date = e;
        r.update();
        r = new GlideRecord(TABLE);
        r.get('number', NUMBER);
        show(NUMBER + ' after TRY ' + TRY, r);
    }
}
