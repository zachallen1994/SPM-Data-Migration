// Background Script (CHANGES DATA - DRY_RUN first, business rules ON): lower environments have duplicate users with
// the same email (one active, others inactive). Migrated resource assignments that point at an INACTIVE duplicate are
// moved to the ACTIVE user with the same email, so they show on the workspace Resources board. (PROD: one user each.)
var DRY_RUN = true;               // ✏️
var PROJECTS = ['PRJ0012237'];    // ✏️ project numbers; [] = every migrated Adaptive project
var TABLE = 'sn_plng_att_core_resource_assignment';
gs.print('resource_assignments_active_user VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'UPDATING'));
var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
if (PROJECTS.length) p.addQuery('number', 'IN', PROJECTS.join(','));
p.query();
var moved = 0, noActive = 0;
while (p.next()) {
    var r = new GlideRecord(TABLE);
    r.addQuery('task', p.getUniqueValue());
    r.addQuery('user_resource.active', false);
    r.query();
    while (r.next()) {
        var email = r.user_resource.email + '';
        var u = new GlideRecord('sys_user');
        u.addQuery('email', email);
        u.addQuery('active', true);
        u.setLimit(1);
        u.query();
        if (!u.next()) { noActive++; gs.print('  no active user for ' + r.getDisplayValue('user_resource') + ' <' + email + '> - left as is'); continue; }
        gs.print('  ' + p.getValue('number') + ' | ' + r.getDisplayValue('user_resource') + ' <' + email + '> -> active user ' + u.getValue('user_name'));
        if (!DRY_RUN) { r.setValue('user_resource', u.getUniqueValue()); r.update(); }
        moved++;
    }
}
gs.print((DRY_RUN ? 'DRY RUN - would move ' : 'Moved ') + moved + ' assignments to the active user | no active user (really inactive): ' + noActive);
