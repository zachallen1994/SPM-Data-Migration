// Background Script (read-only): what does "Validate state mapped to bucket" need, and what state is the
// Asana transform sending? Changes nothing.

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

// 2. State choices on pm_project (value = label)
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', 'pm_project,planned_task,task');
c.addQuery('element', 'state');
c.addQuery('inactive', false);
c.orderBy('name');
c.query();
gs.print('==== 2. State choices');
while (c.next()) gs.print('  ' + c.getValue('name') + ': ' + c.getValue('value') + ' = ' + c.getValue('label'));

// 3. The state field map(s) on the Asana project transform
var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.source_table', 'u_import_asana_hr_project_portfolio');
fm.addQuery('target_field', 'IN', 'state,status');
fm.query();
gs.print('==== 3. State field maps on the Asana project transform');
while (fm.next()) gs.print('  ' + fm.getValue('source_field') + ' -> ' + fm.getValue('target_field') +
    (fm.getValue('use_source_script') == '1' ? '\n' + fm.getValue('source_script') : ''));
var ts = new GlideRecord('sys_transform_script');
ts.addQuery('map.source_table', 'u_import_asana_hr_project_portfolio');
ts.query();
while (ts.next()) gs.print('  transform script (' + ts.getValue('when') + '):\n' + ts.getValue('script'));
