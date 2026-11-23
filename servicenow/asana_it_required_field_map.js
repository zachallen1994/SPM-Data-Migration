// "Import Asana HR Project Portfolio Transform Map": field map -> u_it_required (IT Required)
// Use source script = true, Choice action = ignore. Replace the WHOLE script of that field map with this file.
// Asana "I&T Integrations Needed" (column u_i_t_integrations_needed) -> the IT Required choice with the same label.
// DEV choices: No Integrations | Yes - New Integrations | Yes - Modify Existing Integrations
// ("No Integrations, but IT is engaged to support" -> No Integrations; "TBD" -> blank).
answer = (function transformEntry(source) {
    var raw = (source.getValue('u_i_t_integrations_needed') || '').trim();
    if (!raw || raw == 'undefined' || /^tbd$/i.test(raw)) return '';
    var label = /^no integrations/i.test(raw) ? 'No Integrations' : raw;
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'IN', 'pm_project,planned_task,task');
    c.addQuery('element', 'u_it_required');
    c.addQuery('inactive', false);
    c.query();
    while (c.next()) {
        if ((c.getValue('label') || '').toLowerCase() == label.toLowerCase() || (c.getValue('value') || '').toLowerCase() == label.toLowerCase())
            return c.getValue('value');
    }
    log.warn('IT Required: no choice for Asana "' + raw + '" on ' + source.getValue('u_name'));
    return '';
})(source);
