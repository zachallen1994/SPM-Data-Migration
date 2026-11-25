// Background Script (read-only): can migrated people be matched to the RIGHT ServiceNow user by email?
// For every person in the latest Adaptive resources / time entries / Asana tasks staging rows, the migration picks:
//   exact email -> the ACTIVE user first (orderByDesc active); else same mailbox on another domain (exactly one active).
// This prints the cases where that is not clean:
//   TWO+ ACTIVE  - more than one active user with that email (the pick is arbitrary)
//   ONLY INACTIVE - only inactive users match (the person gets the record, but no hours / capacity on the board)
//   NO USER      - nothing matches
// Safe in DEV / TEST / PROD.
var TABLES = { 'u_import_adaptive_resources': 'u_resource_email', 'u_import_adaptive_time_entries': 'u_resource_email',
               'u_import_asana_project_tasks': 'u_assignee_email' };
var emails = {};
for (var t in TABLES) {
    var g = new GlideAggregate(t);
    if (!g.isValid() || !new GlideRecord(t).isValidField(TABLES[t])) continue;
    g.groupBy(TABLES[t]); g.query();
    while (g.next()) { var e = (g.getValue(TABLES[t]) || '').toLowerCase().trim(); if (e && e.indexOf('@') > 0) emails[e] = true; }
}
var c = { checked: 0, clean: 0, twoActive: 0, onlyInactive: 0, otherDomain: 0, noUser: 0 };
Object.keys(emails).sort().forEach(function (e) {
    c.checked++;
    var a = new GlideAggregate('sys_user'); a.addQuery('email', e); a.addQuery('active', true); a.addAggregate('COUNT'); a.query();
    var act = a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
    var i = new GlideAggregate('sys_user'); i.addQuery('email', e); i.addQuery('active', false); i.addAggregate('COUNT'); i.query();
    var inact = i.next() ? parseInt(i.getAggregate('COUNT'), 10) : 0;
    if (act == 1) { c.clean++; return; }
    if (act > 1) { c.twoActive++; gs.print('TWO+ ACTIVE  | ' + e + ' | ' + act + ' active users'); return; }
    var o = new GlideAggregate('sys_user'); o.addQuery('email', 'STARTSWITH', e.split('@')[0] + '@'); o.addQuery('active', true); o.addAggregate('COUNT'); o.query();
    var other = o.next() ? parseInt(o.getAggregate('COUNT'), 10) : 0;
    if (other == 1) { c.otherDomain++; return; }                    // matched on another domain - fine
    if (inact) { c.onlyInactive++; gs.print('ONLY INACTIVE | ' + e + ' | ' + inact + ' inactive'); return; }
    c.noUser++; gs.print('NO USER      | ' + e);
});
gs.print('SUMMARY ' + JSON.stringify(c));
