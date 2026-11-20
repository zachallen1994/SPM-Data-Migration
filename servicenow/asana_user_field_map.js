// Field map script for a USER field on the Asana projects map (u_import_asana_hr_project_portfolio -> pm_project).
// Asana holds people as NAMES in custom fields, not emails:
//   "PM Assigned"            (u_pm_assigned, filled 51/55)          -> project_manager (and assigned_to)
//   "HRSP / SME / Project Lead" (u_hrsp___sme___project_lead, 6/55) -> u_business_owner
// Values seen: "Jen Angle", "Jen Angle/Carrie Lynn" (first person used), "N/A", "TBD", "DJE", "Protiviti".
// Match: exact active name; else last name + first name starting with the Asana first name ("Jen" -> "Jennifer"),
// only when exactly ONE active user matches. No match -> blank + a log line (never "undefined").
// In the field map: Use source script = true, Choice action = ignore. ✏️ COLUMN per field map.
answer = (function transformEntry(source) {
    var COLUMN = 'u_pm_assigned';               // ✏️ 'u_pm_assigned' or 'u_hrsp___sme___project_lead'
    var raw = (source.getValue(COLUMN) || '').trim();
    var name = raw.split(/\s*[\/,;&]\s*|\s+and\s+/i)[0].trim();
    if (!name || /^(n\/?a|tbd|none|undefined)$/i.test(name)) return '';
    var u = new GlideRecord('sys_user');
    u.addQuery('name', name); u.addQuery('active', true); u.query();
    if (u.getRowCount() == 1 && u.next()) return u.getUniqueValue();
    var parts = name.split(/\s+/);
    if (parts.length >= 2) {
        u = new GlideRecord('sys_user');
        u.addQuery('last_name', parts[parts.length - 1]);
        u.addQuery('first_name', 'STARTSWITH', parts[0]);
        u.addQuery('active', true);
        u.query();
        if (u.getRowCount() == 1 && u.next()) return u.getUniqueValue();
    }
    log.warn('Asana ' + COLUMN + ': no single ServiceNow user for "' + raw + '" on ' + source.getValue('u_name'));
    return '';
})(source);
