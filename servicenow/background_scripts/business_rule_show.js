// Background Script (read-only): print a business rule in full - table, when, condition, filter and script.
// Use when a transform log says "Operation against file 'X' was aborted by Business Rule 'NAME^sys_id'".
var NAME = 'Check if time cards allowed';   // ✏️ the rule name from the log (text before the ^)
var br = new GlideRecord('sys_script');
br.addQuery('name', NAME);
br.query();
if (!br.hasNext()) gs.print('No business rule named ' + NAME);
while (br.next()) {
    gs.print('=== ' + br.getValue('name') + ' | sys_id ' + br.getUniqueValue() + ' | table ' + br.getValue('collection') +
        ' | ' + br.getValue('when') + ' | insert ' + br.getValue('action_insert') + ' update ' + br.getValue('action_update') +
        ' | active ' + br.getValue('active') + ' | order ' + br.getValue('order') + ' | scope ' + br.getDisplayValue('sys_scope'));
    gs.print('condition: ' + (br.getValue('condition') || '(none)'));
    gs.print('filter: ' + (br.getValue('filter_condition') || '(none)'));
    gs.print('updated by ' + br.getValue('sys_updated_by') + ' on ' + br.getValue('sys_updated_on'));
    gs.print('script:\n' + br.getValue('script'));
}
