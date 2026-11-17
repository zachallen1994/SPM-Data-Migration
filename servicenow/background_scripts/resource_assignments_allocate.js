// Background Script (CHANGES DATA - DRY_RUN first): move migrated resource assignments to "Allocated".
// Business rules stay ON: in ServiceNow resource planning, reaching Allocated is what creates / updates the
// allocation records (weekly hours, capacity). Without the rules the state would change but no allocations exist.
// Steps through STEPS in order (as a person would: confirm, then allocate). Prints the state choices first, and per
// assignment the allocation rows before / after so you can see it worked. Test ONE project first.
var DRY_RUN = true;                       // ✏️
var PROJECTS = ['PRJ0012237'];            // ✏️ project numbers; [] = every migrated Adaptive project
var STEPS = ['Confirmed', 'Allocated'];   // ✏️ state LABELS in order (check the choices printed below)
var MAX = 200;                            // ✏️ assignments per run (run again until "left: 0")
var TABLE = 'sn_plng_att_core_resource_assignment';
gs.print('resource_assignments_allocate VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'UPDATING'));

var labels = {}, c = new GlideRecord('sys_choice');
c.addQuery('name', TABLE); c.addQuery('element', 'state'); c.orderBy('sequence'); c.query();
while (c.next()) { labels[c.getValue('label')] = c.getValue('value'); gs.print('state choice: ' + c.getValue('value') + ' = ' + c.getValue('label')); }
var steps = STEPS.map(function (l) { if (!labels[l]) gs.print('NO state labelled "' + l + '" - fix STEPS'); return labels[l]; });
if (steps.indexOf(undefined) >= 0) { gs.print('Stopped.'); }
else {
    var target = steps[steps.length - 1];
    var allocTable = new GlideRecord('resource_allocation').isValid() ? 'resource_allocation' : '';
    function allocs(id) {
        if (!allocTable) return '?';
        var a = new GlideAggregate(allocTable);
        a.addQuery('resource_plan', id).addOrCondition('assignment', id);
        a.addAggregate('COUNT'); a.query(); a.next();
        return a.getAggregate('COUNT');
    }
    var p = new GlideRecord('pm_project');
    p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    if (PROJECTS.length) p.addQuery('number', 'IN', PROJECTS.join(','));
    p.query();
    var done = 0, left = 0;
    while (p.next()) {
        var r = new GlideRecord(TABLE);
        r.addQuery('task', p.getUniqueValue());
        r.addQuery('state', '!=', target);
        r.query();
        while (r.next()) {
            if (MAX && done >= MAX) { left++; continue; }
            done++;
            var before = allocs(r.getUniqueValue());
            if (!DRY_RUN) {
                steps.forEach(function (v) {
                    r.get(r.getUniqueValue());
                    if (r.getValue('state') == v) return;
                    r.setValue('state', v);
                    r.update();
                });
                r.get(r.getUniqueValue());
            }
            gs.print(p.getValue('number') + ' | ' + r.getDisplayValue('user_resource') + ' | state ' + r.getDisplayValue('state') +
                ' | effort ' + r.getValue('effort') + ' | allocations before ' + before + (DRY_RUN ? '' : ' after ' + allocs(r.getUniqueValue())));
        }
    }
    gs.print((DRY_RUN ? 'DRY RUN - would move ' : 'Moved ') + done + ' assignments | left: ' + left);
}
