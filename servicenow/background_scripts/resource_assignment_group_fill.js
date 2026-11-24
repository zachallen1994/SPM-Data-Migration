// Background Script (CHANGES DATA - DRY_RUN first): fill the GROUP on migrated resource assignments from the
// person's EMPLOYEE PROFILE (the resource group set there). Business rules ON. Only empty groups are filled.
// Works in DEV / TEST / PROD as a background script (no fix script needed).
//
// Step 1 (DRY_RUN = true): prints every group field it finds on both tables - check the two field names below match
//         (ASSIGNMENT_GROUP_FIELD on the assignment, PROFILE_GROUP_FIELD on the employee profile), then the counts.
// Step 2 (DRY_RUN = false): fills them, MAX per run - run again until "left: 0".
var DRY_RUN = true;                         // ✏️ false = update
var ASSIGNMENT_TABLE = 'sn_plng_att_core_resource_assignment';
var PROFILE_TABLE = 'sn_employee_profile';
var ASSIGNMENT_GROUP_FIELD = '';            // ✏️ '' = found automatically (printed below); set it if more than one
var PROFILE_GROUP_FIELD = '';               // ✏️ '' = found automatically (printed below); set it if more than one
var PROFILE_USER_FIELD = 'user';            // the employee profile's user field
var PROJECTS = [];                          // ✏️ test: project numbers, e.g. ['PRJ0012237']; [] = every migrated project
var MAX = 1000;

function groupFields(table) {               // reference fields to sys_user_group on the table (and its parents)
    var out = [], names = [table], t = new GlideRecord('sys_db_object');
    if (t.get('name', table) && t.super_class) names.push(t.super_class.name + '');
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'IN', names.join(','));
    d.addQuery('internal_type', 'reference');
    d.addQuery('reference', 'sys_user_group');
    d.query();
    while (d.next()) out.push(d.getValue('element') + ' ("' + d.getValue('column_label') + '")');
    return out;
}
var af = groupFields(ASSIGNMENT_TABLE), pf = groupFields(PROFILE_TABLE);
gs.print('group fields on ' + ASSIGNMENT_TABLE + ': ' + (af.join(', ') || 'NONE'));
gs.print('group fields on ' + PROFILE_TABLE + ': ' + (pf.join(', ') || 'NONE'));
if (!ASSIGNMENT_GROUP_FIELD && af.length == 1) ASSIGNMENT_GROUP_FIELD = af[0].split(' ')[0];
if (!PROFILE_GROUP_FIELD && pf.length == 1) PROFILE_GROUP_FIELD = pf[0].split(' ')[0];
if (!ASSIGNMENT_GROUP_FIELD || !PROFILE_GROUP_FIELD) {
    gs.print('STOP: set ASSIGNMENT_GROUP_FIELD and PROFILE_GROUP_FIELD at the top (pick from the lists above). Nothing changed.');
} else {
    gs.print((DRY_RUN ? 'DRY RUN' : 'UPDATING') + ' | assignment.' + ASSIGNMENT_GROUP_FIELD + ' <- employee profile.' + PROFILE_GROUP_FIELD);
    var cache = {}, counts = { filled: 0, noProfile: 0, profileNoGroup: 0, left: 0 }, n = 0;
    var a = new GlideRecord(ASSIGNMENT_TABLE);
    a.addNullQuery(ASSIGNMENT_GROUP_FIELD);
    a.addNotNullQuery('user_resource');
    if (PROJECTS.length) a.addEncodedQuery('task.numberIN' + PROJECTS.join(',') + '^ORtask.ref_pm_project_task.top_task.numberIN' + PROJECTS.join(','));
    else a.addEncodedQuery('task.correlation_idSTARTSWITHADAPTIVE:^ORtask.correlation_idSTARTSWITHASANA:');
    a.query();
    while (a.next()) {
        if (n >= MAX) { counts.left++; continue; }
        var uid = a.getValue('user_resource');
        if (!cache.hasOwnProperty(uid)) {
            var p = new GlideRecord(PROFILE_TABLE);
            p.addQuery(PROFILE_USER_FIELD, uid); p.setLimit(1); p.query();
            cache[uid] = !p.next() ? null : (p.getValue(PROFILE_GROUP_FIELD) || '');
        }
        var g = cache[uid];
        if (g === null) { counts.noProfile++; continue; }
        if (!g) { counts.profileNoGroup++; continue; }
        n++;
        if (n <= 20) { var gr0 = new GlideRecord('sys_user_group'); gr0.get(g);
            gs.print((DRY_RUN ? 'would set ' : 'set ') + a.getDisplayValue('user_resource') + ' on ' + a.getDisplayValue('task') + ' -> ' + gr0.getValue('name')); }
        if (!DRY_RUN) { a.setValue(ASSIGNMENT_GROUP_FIELD, g); if (!a.update()) counts.refused = (counts.refused || 0) + 1; }
        counts.filled++;
    }
    gs.print((DRY_RUN ? 'DRY RUN ' : '') + JSON.stringify(counts) + (counts.left ? ' -> run again' : ''));
}
