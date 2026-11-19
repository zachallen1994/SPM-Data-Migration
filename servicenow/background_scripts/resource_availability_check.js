// Background Script (read-only): why does the business rule "Validate Resource availability" refuse a person?
// The rule (table sn_plng_att_core_resource_assignment, before insert/update, scope SPM Planning Attributes Core)
// cancels the assignment when:
//   1. the person has NO EMPLOYEE PROFILE  -> message "Cannot create resource assignment. Generate employee profile for ..."
//   2. the person has 0 WORKING DAYS between start_date and end_date -> message "... because ... is not available."
//      (no schedule, inactive user, or the end date is before the start date)
// This script repeats both checks for every row of one import set, with the same user and dates the transform uses.
// If it errors with "ResourceProfile is not defined": set the script's scope to "SPM Planning Attributes Core" and run again.
var ISET = 'ISET23875960';     // ✏️ the import set number of the Adaptive Resources load
var TABLE = 'u_import_adaptive_resources';
var USE_PROJECT_START = false;   // ✏️ true = test with the OLD start date (project start, as loaded yesterday) instead of Added On

function parent(corr) {
    var t = ['pm_project', 'dmn_demand', 'pm_project_task'];
    for (var i = 0; i < t.length; i++) { var g = new GlideRecord(t[i]); if (g.get('correlation_id', corr)) return g; }
    return null;
}
function user(row) {          // same lookup as the transform (email, same mailbox on another domain, unique active name)
    var email = (row.getValue('u_resource_email') || '').toLowerCase().trim(), name = (row.getValue('u_resource_name') || '').trim();
    var u = new GlideRecord('sys_user');
    if (email && (u.addQuery('email', email), u.orderByDesc('active'), u.setLimit(1), u.query(), u.next())) return u;
    if (email.indexOf('@') > 0) { u = new GlideRecord('sys_user'); u.addQuery('email', 'STARTSWITH', email.split('@')[0] + '@'); u.addQuery('active', true); u.query(); if (u.getRowCount() == 1 && u.next()) return u; }
    if (name) { u = new GlideRecord('sys_user'); u.addQuery('name', name); u.addQuery('active', true); u.query(); if (u.getRowCount() == 1 && u.next()) return u; }
    return null;
}
var RP, CAP;
try { RP = ResourceProfile; CAP = RMUsersCapacityAPI; } catch (e) {
    try { RP = sn_plng_att_core.ResourceProfile; CAP = sn_plng_att_core.RMUsersCapacityAPI; } catch (e2) { }
}
var counts = { ok: 0, noProfile: 0, notAvailable: 0, noUser: 0, noParent: 0 };
var r = new GlideRecord(TABLE);
r.addQuery('sys_import_set.number', ISET);
r.orderBy('u_resource_name');
r.query();
while (r.next()) {
    var who = r.getValue('u_resource_name') + ' <' + r.getValue('u_resource_email') + '>';
    var p = parent(r.getValue('u_project_correlation_id'));
    if (!p) { counts.noParent++; continue; }
    var u = user(r);
    if (!u) { counts.noUser++; gs.print('NO USER      | ' + who); continue; }
    var start = (r.getValue('u_start_date') || '').substring(0, 10), pStart = (p.getValue('start_date') || '').substring(0, 10);
    var added = (r.getValue('u_added_on') || '').substring(0, 10);
    if (!start && USE_PROJECT_START) start = pStart;
    if (!start) start = (/^\d{4}-\d{2}-\d{2}$/.test(added) && (!pStart || added > pStart)) ? added : pStart;
    var end = (r.getValue('u_end_date') || '').substring(0, 10) || (p.getValue('end_date') || '').substring(0, 10);
    // a blank assignment record, only to hand the rule's API the same kind of date fields (nothing is saved)
    var a = new GlideRecord('sn_plng_att_core_resource_assignment');
    a.initialize(); a.setValue('start_date', start); a.setValue('end_date', end); a.setValue('user_resource', u.getUniqueValue());
    var profile = '?', days = '?';
    if (RP && CAP) {
        try { profile = new RP().getUsersEmpProfiles([u.getUniqueValue()]).hasNext() ? 'yes' : 'NO'; } catch (e) { profile = 'error ' + e; }
        try { days = new CAP(a.start_date, a.end_date).getTotalCapacityAndWorkingDaysOfUsers([u.getUniqueValue()]).usersWorkingDays[u.getUniqueValue()]; } catch (e) { days = 'error ' + e; }
    } else {
        var ep = new GlideRecord('sn_employee_profile');
        if (ep.isValid()) { ep.addQuery('user', u.getUniqueValue()); ep.query(); profile = ep.hasNext() ? 'yes' : 'NO'; }
    }
    var verdict = profile == 'NO' ? 'NO PROFILE  ' : (days == 0 || days == '0') ? 'NOT AVAILABLE' : 'ok          ';
    if (profile == 'NO') counts.noProfile++; else if (days == 0 || days == '0') counts.notAvailable++; else counts.ok++;
    gs.print(verdict + ' | ' + who + ' | user active ' + u.getValue('active') + ' | schedule ' + (u.getDisplayValue('schedule') || '(none)') +
        ' | ' + start + ' -> ' + end + ' | employee profile ' + profile + ' | working days ' + days + ' | on ' + p.getDisplayValue());
}
gs.print('SUMMARY ' + JSON.stringify(counts) + (RP && CAP ? '' : ' (planning APIs not reachable from this scope - see the note at the top)'));
