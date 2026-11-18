// Background Script (read-only): the project form lists N resource assignments but the workspace Resources board
// shows fewer people. Lists each assignment: person, state, effort, dates, and how many allocation rows it has.
// The board is built from the planning data (allocations) - assignments with 0 allocation rows usually do not show.
var PROJECT = 'PRJ0012237';    // ✏️ project number
var TABLE = 'sn_plng_att_core_resource_assignment';
var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT)) gs.print('No project ' + PROJECT);
else {
    // which allocation tables point at an assignment
    var refs = [], d = new GlideRecord('sys_dictionary');
    d.addQuery('internal_type', 'reference'); d.addQuery('reference', TABLE); d.query();
    while (d.next()) refs.push([d.getValue('name'), d.getValue('element')]);
    gs.print('tables pointing at assignments: ' + refs.map(function (r) { return r[0] + '.' + r[1]; }).join(', '));
    var r = new GlideRecord(TABLE), withAlloc = 0, without = 0, people = {};
    r.addQuery('task', p.getUniqueValue());
    r.orderBy('user_resource');
    r.query();
    while (r.next()) {
        people[r.getValue('user_resource')] = true;
        var counts = refs.map(function (x) {
            var a = new GlideAggregate(x[0]);
            if (!a.isValid()) return 0;
            a.addQuery(x[1], r.getUniqueValue()); a.addAggregate('COUNT'); a.query(); a.next();
            return parseInt(a.getAggregate('COUNT'), 10) || 0;
        });
        var total = counts.reduce(function (s, n) { return s + n; }, 0);
        if (total) withAlloc++; else without++;
        gs.print((total ? 'ok   ' : 'NONE ') + r.getDisplayValue('user_resource') + ' | state ' + r.getDisplayValue('state') +
            ' | effort ' + r.getValue('effort') + ' | ' + r.getValue('start_date') + ' -> ' + r.getValue('end_date') +
            ' | allocation rows ' + counts.join('/') + ' | user active ' + r.user_resource.active);
    }
    gs.print('assignments: ' + (withAlloc + without) + ' | people: ' + Object.keys(people).length + ' | with allocation rows: ' + withAlloc + ' | without: ' + without);
}
