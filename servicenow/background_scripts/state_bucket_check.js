// Background Script (read-only): what does "Validate state mapped to bucket" need, and what state is the
// Asana transform sending? Changes nothing.
var TARGET = 'pm_project_task';                   // ✏️ 'pm_project_task' (Asana tasks) or 'pm_project' (Asana projects)
var STAGING = 'u_import_asana_project_tasks';     // ✏️ 'u_import_asana_project_tasks' or 'u_import_asana_hr_project_portfolio'
var ISET = '';                                    // ✏️ optional: the failed import set number - shows the state values it sent

// 1. The business rule itself (table, when, condition, script)
var br = new GlideRecord('sys_script');
br.addQuery('name', 'Validate state mapped to bucket');
br.query();
while (br.next()) {
    gs.print('==== 1. Business rule on ' + br.getValue('collection') + '  active=' + br.getValue('active') +
        '  when=' + br.getValue('when') + '  insert=' + br.getValue('action_insert') + '  update=' + br.getValue('action_update'));
    gs.print('condition: ' + br.getValue('condition') + ' | filter: ' + br.getValue('filter_condition'));
    gs.print(br.getValue('script'));
}

// 2. State choices on the target (value = label)
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', TARGET + ',planned_task,task');
c.addQuery('element', 'state');
c.addQuery('inactive', false);
c.orderBy('name');
c.query();
gs.print('==== 2. State choices');
while (c.next()) gs.print('  ' + c.getValue('name') + ': ' + c.getValue('value') + ' = ' + c.getValue('label'));

// 3. The state field map(s) on the Asana project transform
var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.source_table', STAGING);
fm.addQuery('target_field', 'IN', 'state,status');
fm.query();
gs.print('==== 3. State field maps on the transform from ' + STAGING);
while (fm.next()) gs.print('  ' + fm.getValue('source_field') + ' -> ' + fm.getValue('target_field') +
    (fm.getValue('use_source_script') == '1' ? '\n' + fm.getValue('source_script') : ''));
var ts = new GlideRecord('sys_transform_script');
ts.addQuery('map.source_table', STAGING);
ts.query();
while (ts.next()) gs.print('  transform script (' + ts.getValue('when') + '):\n' + ts.getValue('script'));

// 4. What the failed rows carried (status columns) and what state the error rows ended up trying
if (ISET) {
    var g = new GlideAggregate(STAGING);
    g.addQuery('sys_import_set.number', ISET);
    var col = ['u_task_status', 'u_completed', 'u_project_status'].filter(function (f) { return new GlideRecord(STAGING).isValidField(f); });
    col.forEach(function (f) { g.groupBy(f); });
    g.addAggregate('COUNT');
    g.query();
    gs.print('==== 4. Status values in ' + ISET + ' (' + col.join(', ') + ')');
    while (g.next()) gs.print('  ' + col.map(function (f) { return f + '=' + (g.getValue(f) || '(empty)'); }).join(' | ') + ' : ' + g.getAggregate('COUNT'));
}
