// Field map script for an Adaptive value going into a ServiceNow CHOICE field
// (u_project_pool, u_estimate_type, u_groups on pm_project).
// Matches the Adaptive text against the field's choices by label or value (any case), so it works whether
// the choice values are "Yes" or "yes". Unmatched values are logged and left blank - no new choices are made.
// In the field map: Use source script = true, Choice action = ignore.
// ✏️ Per field map, set SOURCE_COLUMN and TARGET_FIELD:
//   u_project_pool  -> u_project_pool
//   u_estimate_type -> u_estimate_type
//   u_groups        -> u_groups   (Adaptive allows several groups; the ServiceNow field holds one - the first is used)
answer = (function transformEntry(source) {
    var SOURCE_COLUMN = 'u_project_pool';
    var TARGET_FIELD = 'u_project_pool';

    var raw = (source.getValue(SOURCE_COLUMN) || '').trim();
    if (!raw) return '';
    var parts = raw.split(/\s*,\s*/);
    if (parts.length > 1) log.warn(TARGET_FIELD + ': several Adaptive values "' + raw + '" - using "' + parts[0] + '"');
    var v = parts[0].toLowerCase();

    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'pm_project');
    c.addQuery('element', TARGET_FIELD);
    c.addQuery('inactive', '!=', true);
    c.query();
    while (c.next()) {
        if ((c.getValue('value') || '').toLowerCase() == v || (c.getValue('label') || '').toLowerCase() == v)
            return c.getValue('value');
    }
    log.warn(TARGET_FIELD + ': no choice matches Adaptive value "' + parts[0] + '"');
    return '';
})(source);
