// Background Script (read-only): after the projects + demands transform, what did this run touch?
// Run within MINUTES of the transform. "In ServiceNow" minus "touched" = records from earlier loads
// (e.g. closed projects from a load without the State filter).
var MINUTES = 90;   // ✏️ how far back the transform ran
['pm_project', 'dmn_demand'].forEach(function (t) {
    var all = new GlideAggregate(t);
    all.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
    all.addAggregate('COUNT'); all.query(); all.next();
    var now = new GlideAggregate(t);
    now.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
    now.addQuery('sys_updated_on', '>=', gs.minutesAgo(MINUTES));
    now.addAggregate('COUNT'); now.query(); now.next();
    var linked = new GlideAggregate(t);
    linked.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
    linked.addNotNullQuery(t == 'pm_project' ? 'primary_program' : 'sys_id');
    linked.addAggregate('COUNT'); linked.query(); linked.next();
    gs.print(t + ': in ServiceNow ' + all.getAggregate('COUNT') + ' | touched by this run ' + now.getAggregate('COUNT') +
        (t == 'pm_project' ? ' | linked to a program ' + linked.getAggregate('COUNT') : ''));
});
