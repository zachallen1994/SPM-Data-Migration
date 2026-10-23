// Background Script: why do migrated task dates stay at the project start?
// Read-only unless TRY_UPDATE = true (then it changes ONE task's dates in Dev and reads them back).
// 1) the tasks transform map: field maps to start/end date, their date format, transform scripts, Run business rules
// 2) active business rules on the task tables that mention start_date / time_constraint
// 3) TRY_UPDATE: set one task to "Start on specific date" + its Adaptive dates and see what sticks
var MAP_NAME = 'Import Adaptive Project Tasks Transform Map';   // ✏️ the tasks transform map name
var TASK = 'PRJTASK0026135';                                   // ✏️ a migrated task (Closeout Phase)
var TRY_UPDATE = false;                                        // ✏️ true = update that one task as a test
var START = '2027-01-20', END = '2027-01-29';                   // ✏️ its Adaptive Schedule Start / Finish

var m = new GlideRecord('sys_transform_map');
if (!m.get('name', MAP_NAME)) gs.print('No transform map named ' + MAP_NAME);
else {
    gs.print('map: ' + MAP_NAME + ' | Run business rules = ' + m.getValue('run_business_rules') + ' | active ' + m.getValue('active'));
    var fm = new GlideRecord('sys_transform_entry');
    fm.addQuery('map', m.getUniqueValue());
    fm.addQuery('target_field', 'IN', 'start_date,end_date,time_constraint,duration');
    fm.query();
    if (!fm.hasNext()) gs.print('  NO field map to start_date / end_date - add u_start_date -> start_date, u_due_date -> end_date');
    while (fm.next()) gs.print('  field map: ' + (fm.getValue('source_field') || '[script]') + ' -> ' + fm.getValue('target_field') +
        ' | date format "' + (fm.getValue('date_format') || '') + '"');
    var sc = new GlideRecord('sys_transform_script');
    sc.addQuery('map', m.getUniqueValue());
    sc.query();
    while (sc.next()) gs.print('  transform script: ' + sc.getValue('when') + ' | active ' + sc.getValue('active') +
        ' | sets time_constraint: ' + ((sc.getValue('script') || '').indexOf('time_constraint') > -1));
}

var br = new GlideRecord('sys_script');
br.addQuery('collection', 'IN', 'pm_project_task,planned_task,pm_project,task');
br.addQuery('active', true);
br.addQuery('script', 'CONTAINS', 'start_date').addOrCondition('script', 'CONTAINS', 'time_constraint');
br.query();
while (br.next()) gs.print('business rule: ' + br.getValue('collection') + ' | ' + br.getValue('name') + ' | ' + br.getValue('when') +
    ' | insert ' + br.getValue('action_insert') + ' update ' + br.getValue('action_update') +
    (br.getValue('condition') ? ' | condition: ' + br.getValue('condition') : ''));

var t = new GlideRecord('pm_project_task');
if (!t.get('number', TASK)) gs.print('No task ' + TASK);
else {
    gs.print(TASK + ' now: ' + t.getDisplayValue('time_constraint') + ' | ' + t.getValue('start_date') + ' -> ' + t.getValue('end_date') +
        ' | duration ' + t.getDisplayValue('duration') + ' | created ' + t.getValue('sys_created_on') + ' | updated ' + t.getValue('sys_updated_on'));
    if (TRY_UPDATE) {
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', 'IN', 'planned_task,pm_project_task'); c.addQuery('element', 'time_constraint');
        c.addQuery('label', 'CONTAINS', 'specific'); c.query();
        if (c.next()) t.setValue('time_constraint', c.getValue('value'));
        var s = new GlideDateTime(); s.setDisplayValue(START + ' 00:00:00', 'yyyy-MM-dd HH:mm:ss');
        var e = new GlideDateTime(); e.setDisplayValue(END + ' 00:00:00', 'yyyy-MM-dd HH:mm:ss');
        t.start_date = s; t.end_date = e;
        t.update();
        t.get(t.getUniqueValue());
        gs.print(TASK + ' after test update: ' + t.getDisplayValue('time_constraint') + ' | ' + t.getValue('start_date') + ' -> ' +
            t.getValue('end_date') + ' | duration ' + t.getDisplayValue('duration'));
    }
}
