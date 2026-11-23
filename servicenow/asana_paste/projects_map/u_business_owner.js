// Field map script for a USER field on the Asana projects map (u_import_asana_hr_project_portfolio -> pm_project).
// Asana holds people as NAMES in custom fields, not emails:
//   "PM Assigned"            (u_pm_assigned, filled 51/55)          -> project_manager (and assigned_to)
//   "HRSP / SME / Project Lead" (u_hrsp___sme___project_lead, 6/55) -> u_business_owner
// Values seen: "Jen Angle", "Jen Angle/Carrie Lynn" (first person used), "N/A", "TBD", "DJE", "Protiviti".
// Regular Asana projects have no "PM Assigned": the owner's email (column Assignee Email) is used instead.
// Match: exact active name; else last name + first name starting with the Asana first name ("Jen" -> "Jennifer"),
// only when exactly ONE active user matches. No match -> blank + a log line (never "undefined").
// In the field map: Use source script = true, Choice action = ignore. ✏️ COLUMN per field map.
answer = (function transformEntry(source) {
    var COLUMN = 'u_hrsp___sme___project_lead';               // ✏️ 'u_pm_assigned' or 'u_hrsp___sme___project_lead'
    var FALLBACK_EMAIL = false;                // ✏️ PM field blank -> the Asana owner/assignee email (regular Asana projects:
                                               //    the project OWNER is the PM and has no "PM Assigned" field)
    var raw = (source.getValue(COLUMN) || '').trim();
    var name = raw.split(/\s*[\/,;&]\s*|\s+and\s+/i)[0].trim();
    if (!name || /^(n\/?a|tbd|none|undefined)$/i.test(name)) {
        var em = (source.getValue('u_assignee_email') || '').toLowerCase().trim();
        if (!FALLBACK_EMAIL || !em || em == 'undefined') return '';
        var ue = new GlideRecord('sys_user');
        ue.addQuery('email', em); ue.orderByDesc('active'); ue.setLimit(1); ue.query();
        if (ue.next()) return ue.getUniqueValue();
        log.warn('Asana: no ServiceNow user with email ' + em + ' on ' + source.getValue('u_name'));
        return '';
    }
    // HR PM list (Richard Becker): last name -> emails. Exact and safe even with duplicate user records in DEV.
    var PM = { angle: ['jennifer.angle@bsmhealth.org', 'jennifer.angle@mercy.com'], lynn: ['carrie_lynn@bsmhealth.org', 'carrie_lynn@mercy.com'],
        mcclure: ['kamcclure@bsmhealth.org', 'kamcclure@mercy.com'], mcdearmon: ['kmcdearmon@mercy.com'], hayes: ['lhayes@mercy.com'],
        caldwell: ['mcaldwell4@mercy.com'], whitis: ['iwhitis@bsmhealth.org', 'iwhitis@mercy.com'],
        warfield: ['awarfield@bsmhealth.org', 'awarfield@mercy.com'], trucksis: ['menims@bsmhealth.org', 'menims@mercy.com'],
        becker: ['rbecker0@mercy.com', 'rbecker0@bsmhealth.org'] };
    var last = name.toLowerCase().split(/\s+/).pop();
    if (PM[last]) {
        var up = new GlideRecord('sys_user');
        up.addQuery('email', 'IN', PM[last].join(',')); up.orderByDesc('active'); up.setLimit(1); up.query();
        if (up.next()) return up.getUniqueValue();
    }
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
