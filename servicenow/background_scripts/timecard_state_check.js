// Background Script (read-only): why are migrated time cards "Pending" instead of "Processed"?
// Shows the State choices, the field maps on the time card transform map, and business rules that touch State.
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.query();
while (c.next()) gs.print('choice: ' + c.getValue('value') + ' = ' + c.getValue('label'));
var fm = new GlideRecord('sys_transform_entry');
fm.addQuery('map.target_table', 'time_card'); fm.query();
while (fm.next()) gs.print('field map: ' + (fm.getValue('source_field') || '[script]') + ' -> ' + fm.getValue('target_field') +
    (fm.getValue('coalesce') == '1' ? '  (coalesce)' : ''));
var br = new GlideRecord('sys_script');
br.addQuery('collection', 'time_card'); br.addQuery('active', true); br.addQuery('script', 'CONTAINS', 'state'); br.query();
while (br.next()) gs.print('business rule: ' + br.getValue('name') + ' (' + br.getValue('when') + ', insert ' + br.getValue('action_insert') + ')');
