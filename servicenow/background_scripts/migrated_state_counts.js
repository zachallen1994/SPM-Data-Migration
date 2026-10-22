// Background Script (read-only): how many Adaptive projects / demands are in ServiceNow, by State.
// Many closed ones = left over from a load without the State filter (they widen every later load).
['pm_project', 'dmn_demand'].forEach(function (t) {
    var g = new GlideAggregate(t);
    g.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
    g.addAggregate('COUNT'); g.groupBy('state'); g.query();
    while (g.next()) gs.print(t + ' | ' + g.getDisplayValue('state') + ' | ' + g.getAggregate('COUNT'));
});
