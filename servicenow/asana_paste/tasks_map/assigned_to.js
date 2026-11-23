// The Asana ASSIGNEE (a person, e.g. Tricia Figg plfigg@mercy.com) matched by email, active user first.
// The free-text "Assigned To" field (e.g. "Billie", "IT") is not a user - it goes into the description (PART H).
answer = (function transformEntry(source) {
    var em = (source.getValue('u_assignee_email') || '').toLowerCase().trim();
    if (!em || em == 'undefined') return '';
    var u = new GlideRecord('sys_user');
    u.addQuery('email', em); u.orderByDesc('active'); u.setLimit(1); u.query();
    if (u.next()) return u.getUniqueValue();
    log.warn('Asana task assignee ' + em + ' has no ServiceNow user - left blank on ' + (source.getValue('u_task_name') || source.getValue('u_name')));
    return '';
})(source);
