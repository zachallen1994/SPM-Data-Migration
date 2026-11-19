// Background Script (read-only): where do a person's hours on the workspace Resources board come from, per month?
// For one person on one project: resource assignment dates / effort, allocation rows per month, time cards per month,
// and the project tasks they are on (assigned to / additional assignee) with dates and planned effort.
var PROJECT = 'PRJ0012237';         // ✏️ project number
var PERSON = 'Darlene Wofford';     // ✏️ user name as shown on the board
var p = new GlideRecord('pm_project');
var u = new GlideRecord('sys_user');
u.addQuery('name', PERSON); u.addQuery('active', true); u.query();
if (!p.get('number', PROJECT) || !u.next()) gs.print('Project or active user not found');
else {
    var uid = u.getUniqueValue(), pid = p.getUniqueValue(), ids = [pid];
    var a = new GlideRecord('sn_plng_att_core_resource_assignment');
    a.addQuery('task', pid); a.addQuery('user_resource', uid); a.query();
    while (a.next()) gs.print('assignment ' + a.getValue('number') + ' | ' + a.getValue('start_date') + ' -> ' + a.getValue('end_date') + ' | effort ' + a.getValue('effort'));
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('internal_type', 'reference'); d.addQuery('reference', 'sn_plng_att_core_resource_assignment'); d.query();
    while (d.next()) {
        var t = d.getValue('name');
        var g = new GlideRecord(t);
        if (!g.isValid()) continue;
        g.addQuery(d.getValue('element') + '.task', pid);
        g.addQuery(d.getValue('element') + '.user_resource', uid);
        g.query();
        var months = {};
        var dateField = ['start_date', 'date', 'allocation_date', 'period_start'].filter(function (f) { return g.isValidField(f); })[0];
        var hourField = ['hours', 'allocated_hours', 'effort', 'requested_hours'].filter(function (f) { return g.isValidField(f); })[0];
        while (g.next()) {
            var m = dateField ? (g.getValue(dateField) || '').substring(0, 7) : '?';
            months[m] = (months[m] || 0) + (hourField ? parseFloat(g.getValue(hourField)) || 0 : 1);
        }
        if (Object.keys(months).length) gs.print(t + ' (' + (dateField || '?') + ', ' + (hourField || 'rows') + '): ' + JSON.stringify(months));
    }
    var tk = new GlideRecord('pm_project_task');
    tk.addQuery('top_task', pid);
    tk.addQuery('assigned_to', uid).addOrCondition('additional_assignee_list', 'CONTAINS', uid);
    tk.query();
    while (tk.next()) { ids.push(tk.getUniqueValue()); gs.print('task ' + tk.getValue('number') + ' ' + tk.getValue('short_description') + ' | ' + tk.getValue('start_date') + ' -> ' + tk.getValue('end_date') + ' | planned effort ' + tk.getDisplayValue('effort')); }
    var tc = new GlideRecord('time_card');
    tc.addQuery('user', uid);
    tc.addQuery('task.ref_pm_project_task.top_task', pid).addOrCondition('task', pid);
    tc.query();
    var tm = {};
    while (tc.next()) { var k = (tc.getValue('week_starts_on') || '').substring(0, 7); tm[k] = (tm[k] || 0) + (parseFloat(tc.getValue('total')) || 0); }
    gs.print('time cards per month: ' + JSON.stringify(tm));
}
