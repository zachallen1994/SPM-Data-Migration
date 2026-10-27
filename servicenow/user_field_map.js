// Field map script for a USER reference field (e.g. pm_project.project_manager) from Adaptive.
// Matches by EMAIL first (Adaptive "Joe Smith" vs ServiceNow "Joseph Smith" still match), then by exact name.
// No match -> blank and a log line. Never returns "undefined".
// In the field map: Use source script = true, Choice action = ignore. Target field = project_manager (or the user field).
// Needs the staging column "Manager Email" (String, 100) - the projects data source fills it from ProjectManager.Email.
// ✏️ Per field map, set the two staging columns:
answer = (function transformEntry(source) {
    var EMAIL_COLUMN = 'u_manager_email';   // staging column with the person's email
    var NAME_COLUMN = 'u_manager';          // staging column with the person's name (fallback)

    function val(col) {
        var v = (source.getValue(col) || '').trim();
        return (v == 'undefined' || v == 'null') ? '' : v;
    }
    var email = val(EMAIL_COLUMN).toLowerCase(), name = val(NAME_COLUMN);
    var u = new GlideRecord('sys_user');
    if (email && u.get('email', email)) return u.getUniqueValue();
    if (name) {
        u = new GlideRecord('sys_user');
        u.addQuery('name', name);
        u.addQuery('active', true);
        u.query();
        if (u.getRowCount() == 1 && u.next()) return u.getUniqueValue();
    }
    if (email || name) log.warn('No ServiceNow user for ' + (name || '') + ' <' + email + '> on ' + source.getValue('u_name'));
    return '';
})(source);
