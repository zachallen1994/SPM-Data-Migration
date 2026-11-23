// "Import Asana HR Project Portfolio Transform Map": field map -> state (Use source script, Choice action = ignore)
// The project's State comes from the Asana "Project Status" field of the tracker row - NOT from its tasks (most rows
// have no subtasks). Looked up by choice LABEL, so it only writes a state that exists and is active on pm_project.
// A label that does not exist (DEV has no "Work in Progress" on projects - same open item as Adaptive) -> blank + log.
answer = (function transformEntry(source) {
    var LABEL = {                                   // ✏️ Asana Project Status (lower case) -> ServiceNow state LABEL
        'not started': 'Pending',
        'started/scoping': 'Investigating',
        'in progress': 'Work in Progress',
        'delayed': 'Work in Progress',
        'on hold': 'Work in Progress',              // + the On Hold box: PART B
        'completed': 'Closed Complete',
        'cancelled': 'Closed Incomplete'
    };
    var s = (source.getValue('u_project_status') || '').toLowerCase().trim();
    if (!s || s == 'undefined') return '';
    var label = LABEL[s];
    if (!label) { log.warn('Asana Project Status "' + s + '" not mapped on ' + source.getValue('u_name')); return ''; }
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'IN', 'pm_project,planned_task,task');
    c.addQuery('element', 'state');
    c.addQuery('label', label);
    c.addQuery('inactive', false);
    c.orderBy('name');                              // pm_project's own choices first
    c.query();
    if (c.next()) return c.getValue('value');
    log.warn('No active project state "' + label + '" (Asana "' + s + '") on ' + source.getValue('u_name'));
    return '';
})(source);

