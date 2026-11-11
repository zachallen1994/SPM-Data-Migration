// Background Script (read-only): which of a project's Adaptive resources have a ServiceNow user, and how they match:
// by email, by the same mailbox on another domain, by unique active name - or not at all.
var PROJECT = '25255-19488-GVL Powdersville MOB';   // ✏️ exact Adaptive project name
function post(q) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: q, paging: { from: 0, limit: 100 } }));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody();
    return JSON.parse(res.getBody()).entities || [];
}
try {
    var p = post("SELECT Name FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'")[0];
    var counts = { email: 0, mailbox: 0, name: 0, none: 0 };
    post("SELECT Resource.Name, Resource.Email FROM RegularResourceLink WHERE WorkItem = '" + p.id + "'").forEach(function (l) {
        var name = l.Resource ? l.Resource.Name || '' : '', email = (l.Resource ? l.Resource.Email || '' : '').toLowerCase();
        var how = 'none', u = new GlideRecord('sys_user');
        if (email && u.get('email', email)) how = 'email';
        else {
            u = new GlideRecord('sys_user'); u.addQuery('email', 'STARTSWITH', email.split('@')[0] + '@'); u.addQuery('active', true); u.query();
            if (email && u.getRowCount() == 1 && u.next()) how = 'mailbox';
            else {
                u = new GlideRecord('sys_user'); u.addQuery('name', name); u.addQuery('active', true); u.query();
                if (name && u.getRowCount() == 1 && u.next()) how = 'name';
            }
        }
        counts[how]++;
        gs.print((how == 'none' ? 'MISSING ' : 'ok (' + how + ') ') + name + ' | ' + email + (how != 'none' ? ' -> ' + u.getValue('email') : ''));
    });
    gs.print('matched by email ' + counts.email + ' | by mailbox on another domain ' + counts.mailbox + ' | by name ' + counts.name + ' | no user ' + counts.none);
} catch (err) { gs.print('ERROR: ' + err); }
