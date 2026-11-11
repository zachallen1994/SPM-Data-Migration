// Field map script: Adaptive project / demand State -> ServiceNow State, found by the choice LABEL on the target
// table (so it works whatever the stored values are, and never writes a value that is not an ACTIVE choice).
// In the field map: Use source script = true, Choice action = ignore, Target field = state.
// Unknown or inactive -> blank (the field is left as it is) + a log line. Never "undefined".
answer = (function transformEntry(source) {
    var TABLE = 'pm_project';                    // ✏️ 'dmn_demand' on the demands map
    var LABEL = {                                // Adaptive State -> ServiceNow state LABEL (BA)
        'completed': 'Closed Complete',
        'active':    'Work in Progress',
        'on hold':   'Work in Progress',         // as in the current map (no On Hold state in use)
        'requested': 'Pending',
        'draft':     'Open',
        'cancelled': 'Closed Incomplete'
    };
    var s = (source.getValue('u_state') || '').toLowerCase().trim();
    if (!s || s == 'undefined') return '';
    var label = LABEL[s];
    if (!label) { log.warn('Unmapped Adaptive state "' + s + '" on ' + source.getValue('u_name')); return ''; }
    var tables = [TABLE, 'planned_task', 'task'];  // the first table that has choices for state wins
    for (var i = 0; i < tables.length; i++) {
        var any = new GlideRecord('sys_choice');
        any.addQuery('name', tables[i]); any.addQuery('element', 'state'); any.setLimit(1); any.query();
        if (!any.hasNext()) continue;
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', tables[i]); c.addQuery('element', 'state'); c.addQuery('label', label);
        c.addQuery('inactive', false);
        c.query();
        if (c.next()) return c.getValue('value');
        log.warn('No active ' + tables[i] + ' state "' + label + '" (Adaptive "' + s + '") on ' + source.getValue('u_name'));
        return '';
    }
    return '';
})(source);
