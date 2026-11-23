// "Import Asana HR Project Portfolio Transform Map": field map -> u_it_required (IT Required)
// Use source script = true, Choice action = ignore. Replace the WHOLE script of that field map with this file.
// Asana "I&T Integrations Needed" (column u_i_t_integrations_needed) -> the IT Required choice with the same label.
// DEV choices: No Integrations | Yes - New Integrations | Yes - Modify Existing Integrations
// ("No Integrations, but IT is engaged to support" -> No Integrations; "TBD" -> blank).
// Choices are stored on dmn_demand.u_it_required: no_integrations, yes_new_integrations, yes_modify_integrations.
// v2: finds where the field's choices are really stored (the dictionary can point the choices to another table /
// field), instead of assuming pm_project.u_it_required - v1 found nothing in DEV.
answer = (function transformEntry(source) {
    var raw = (source.getValue('u_i_t_integrations_needed') || '').trim();
    if (!raw || raw == 'undefined' || /^tbd$/i.test(raw)) return '';
    var label = (/^no integrations/i.test(raw) ? 'No Integrations' : raw).toLowerCase();
    var tables = ['pm_project', 'dmn_demand', 'planned_task', 'task'], element = 'u_it_required';   // choices live on dmn_demand (seen in TEST)
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'IN', tables.join(','));
    d.addQuery('element', element);
    d.query();
    if (d.next()) {                                           // choices taken from another table / field?
        if (d.getValue('choice_table')) tables = [d.getValue('choice_table')].concat(tables);
        if (d.getValue('choice_field')) element = d.getValue('choice_field');
    }
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'IN', tables.join(','));
    c.addQuery('element', element);
    c.addQuery('inactive', '!=', true);
    c.query();
    var seen = [];
    while (c.next()) {
        seen.push(c.getValue('name') + '.' + c.getValue('label') + '=' + c.getValue('value'));
        if ((c.getValue('label') || '').toLowerCase() == label || (c.getValue('value') || '').toLowerCase() == label)
            return c.getValue('value');
    }
    log.warn('IT Required: no choice for Asana "' + raw + '" on ' + source.getValue('u_name') + ' | choices found (' +
        tables.join(',') + '.' + element + '): ' + (seen.join('; ') || 'NONE'));
    return '';
})(source);
