// Background Script (read-only): a project's Actual effort is about double. Duplicate time cards, or one card counted
// twice? Shows: Processed hours on the project + its tasks vs the project's Actual effort; time cards that exist more
// than once for the same person + task + week; and how many time-card expense lines exist per card.
var PROJECT = 'PRJ0012237';   // ✏️ Powdersville in DEV
var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    var pid = p.getUniqueValue(), ids = [pid];
    var t = new GlideRecord('pm_project_task');
    t.addQuery('top_task', pid); t.query();
    while (t.next()) ids.push(t.getUniqueValue());
    var hours = { all: 0 }, cards = 0, seen = {}, dupes = 0;
    var c = new GlideRecord('time_card');
    c.addQuery('task', 'IN', ids.join(','));
    c.query();
    while (c.next()) {
        cards++;
        var h = parseFloat(c.getValue('total')) || 0, st = c.getDisplayValue('state');
        hours[st] = (hours[st] || 0) + h; hours.all += h;
        var k = c.getValue('user') + '|' + c.getValue('task') + '|' + c.getValue('week_starts_on');
        if (seen[k]) { dupes++; if (dupes <= 10) gs.print('DUPLICATE card: ' + c.getDisplayValue('user') + ' | ' + c.task.number + ' | week ' + c.getValue('week_starts_on') + ' | ' + h + ' h | ' + st + ' | created ' + c.getValue('sys_created_on')); }
        seen[k] = true;
    }
    gs.print(PROJECT + ' Actual effort (work_effort) = ' + p.getDisplayValue('work_effort'));
    gs.print('time cards on project + tasks: ' + cards + ' | hours by state ' + JSON.stringify(hours) + ' | duplicate person+task+week: ' + dupes);
    var e = new GlideAggregate('fm_expense_line');
    e.addQuery('task', 'IN', ids.join(','));
    e.addQuery('short_description', 'CONTAINS', 'Time Card');
    e.addAggregate('COUNT'); e.query(); e.next();
    gs.print('time-card expense lines: ' + e.getAggregate('COUNT') + ' (about 1 per card is normal; 2 per card = each card processed twice)');
}
