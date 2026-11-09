// Background Script (read-only): time cards exist (Processed, task = the project) but the project's Time Cards and
// Expense Lines related lists are empty. Shows what those lists really query, and what the cards produced.
var PROJECT = 'PRJ0010190';   // ✏️ project number

var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    var pid = p.getUniqueValue();
    gs.print('1) ' + PROJECT + ' | Actual effort (work_effort) ' + p.getDisplayValue('work_effort') + ' | Planned effort ' + p.getDisplayValue('effort'));

    var tc = new GlideAggregate('time_card');
    tc.addQuery('task', pid);
    tc.addAggregate('COUNT'); tc.addAggregate('SUM', 'total'); tc.groupBy('state'); tc.query();
    while (tc.next()) gs.print('2) time cards on the project: ' + tc.getDisplayValue('state') + ' ' + tc.getAggregate('COUNT') + ' cards, ' + tc.getAggregate('SUM', 'total') + ' h');
    var tt = new GlideAggregate('time_card');
    tt.addQuery('task.ref_pm_project_task.top_task', pid);
    tt.addAggregate('COUNT'); tt.query(); tt.next();
    gs.print('   time cards on its project tasks: ' + tt.getAggregate('COUNT'));

    // what the form's related lists are (a list named "REL:..." is a custom relationship)
    var rl = new GlideRecord('sys_ui_related_list_entry');
    rl.addQuery('list_id.name', 'pm_project');
    rl.addQuery('related_list', 'CONTAINS', 'time_card').addOrCondition('related_list', 'CONTAINS', 'expense').addOrCondition('related_list', 'STARTSWITH', 'REL:');
    rl.query();
    while (rl.next()) gs.print('3) related list on pm_project form (view ' + rl.list_id.view.getDisplayValue() + '): ' + rl.getValue('related_list'));
    var rel = new GlideRecord('sys_relationship');
    rel.addQuery('basic_apply_to', 'IN', 'pm_project,planned_task,task');
    rel.addQuery('basic_query_from', 'IN', 'time_card,fm_expense_line');
    rel.query();
    while (rel.next()) gs.print('   relationship "' + rel.getValue('name') + '" (REL:' + rel.getUniqueValue() + ') from ' + rel.getValue('basic_query_from') + ':\n' + rel.getValue('query_with'));

    // expense lines from the cards
    var el = new GlideAggregate('fm_expense_line');
    el.addQuery('task', pid).addOrCondition('source_id', pid);
    el.addAggregate('COUNT'); el.query(); el.next();
    gs.print('4) expense lines with task / source = the project: ' + el.getAggregate('COUNT'));
    var card = new GlideRecord('time_card');
    card.addQuery('task', pid);
    card.setLimit(1);
    card.query();
    if (card.next()) {
        gs.print('5) one card: ' + card.getDisplayValue('user') + ' week ' + card.getValue('week_starts_on') + ' | state ' + card.getDisplayValue('state') +
            ' | total ' + card.getValue('total') + ' | time sheet ' + (card.getDisplayValue('time_sheet') || '(none)') + ' | category ' + card.getDisplayValue('category') +
            ' | updated by ' + card.getValue('sys_updated_by'));
        var e2 = new GlideAggregate('fm_expense_line');
        e2.addQuery('source_id', card.getUniqueValue());
        e2.addAggregate('COUNT'); e2.query(); e2.next();
        gs.print('   expense lines whose source is this card: ' + e2.getAggregate('COUNT'));
    }
}
