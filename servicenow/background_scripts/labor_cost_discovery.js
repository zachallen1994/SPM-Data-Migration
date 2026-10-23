// Background Script (read-only): where does ServiceNow turn a Processed time card into a labor expense line
// and a "Resource_Internal_..." cost plan? Lists what to change (or condition) so migrated time creates no cost.
// 1) properties about labor cost / expense lines / time cards
var pr = new GlideRecord('sys_properties');
pr.addQuery('name', 'CONTAINS', 'labor').addOrCondition('name', 'CONTAINS', 'expense')
  .addOrCondition('name', 'CONTAINS', 'time_card').addOrCondition('name', 'CONTAINS', 'timecard');
pr.query();
while (pr.next()) gs.print('property: ' + pr.getValue('name') + ' = ' + pr.getValue('value') + ' | ' + (pr.getValue('description') || '').substring(0, 120));

// 2) business rules on time_card / time_sheet that create expense lines or cost plans
var br = new GlideRecord('sys_script');
br.addQuery('collection', 'IN', 'time_card,time_sheet');
br.addQuery('active', true);
br.query();
while (br.next()) {
    var sc = br.getValue('script') || '';
    if (/expense|cost|labor|rate/i.test(sc + ' ' + br.getValue('name')))
        gs.print('business rule: ' + br.getValue('collection') + ' | ' + br.getValue('name') + ' | ' + br.getValue('when') +
            ' | insert ' + br.getValue('action_insert') + ' update ' + br.getValue('action_update') +
            (br.getValue('condition') ? ' | condition: ' + br.getValue('condition') : '') + ' | sys_id ' + br.getUniqueValue());
}

// 3) script includes that build expense lines from time cards
var si = new GlideRecord('sys_script_include');
si.addQuery('active', true);
si.addQuery('script', 'CONTAINS', 'time_card');
si.addQuery('script', 'CONTAINS', 'fm_expense_line');
si.query();
while (si.next()) gs.print('script include: ' + si.getValue('name') + ' | ' + si.getValue('api_name'));

// 4) what migration created so far: labor lines from time cards, and the auto cost plans
var el = new GlideAggregate('fm_expense_line');
el.addQuery('short_description', 'CONTAINS', 'Time Card');
el.addAggregate('COUNT'); el.addAggregate('SUM', 'amount'); el.query();
if (el.next()) gs.print('expense lines from time cards: ' + el.getAggregate('COUNT') + ' | total ' + el.getAggregate('SUM', 'amount'));
var cp = new GlideAggregate('cost_plan');
cp.addQuery('name', 'STARTSWITH', 'Resource_');
cp.addAggregate('COUNT'); cp.query();
if (cp.next()) gs.print('auto cost plans named Resource_*: ' + cp.getAggregate('COUNT'));
