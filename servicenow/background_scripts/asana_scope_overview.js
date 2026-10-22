// Background Script (read-only): the facts needed to decide what "active HR projects" means in Asana.
//   1. The tracker (x_mig.asana.project_gid): owner, team, members, last modified, how many rows
//   2. Every portfolio the token can see, and the projects inside each (active / completed)
// Uses the migration token, which can see the tracker even when your own account cannot. Changes nothing.
var WORKSPACE = '5286451799521';
function get(path) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(path.indexOf('http') == 0 ? path : 'https://app.asana.com/api/1.0' + path);
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ' + path + ' -> ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300)); return null; }
    return JSON.parse(res.getBody());
}
function all(path) {
    var out = [], url = path;
    while (url) { var p = get(url); if (!p) break; out = out.concat(p.data); url = p.next_page ? p.next_page.uri : null; }
    return out;
}

// 1. The tracker
var gid = gs.getProperty('x_mig.asana.project_gid');
var t = get('/projects/' + gid + '?opt_fields=name,owner.name,owner.email,team.name,modified_at,created_at,archived,members.name');
if (t) {
    t = t.data;
    var rows = all('/projects/' + gid + '/tasks?limit=100&completed_since=now&opt_fields=name');
    gs.print('==== 1. TRACKER: ' + t.name + ' (' + gid + ')');
    gs.print('  owner: ' + (t.owner ? t.owner.name + ' <' + t.owner.email + '>' : '(none)') + ' | team: ' + (t.team ? t.team.name : '') +
        ' | created ' + t.created_at + ' | last modified ' + t.modified_at + ' | archived: ' + t.archived);
    gs.print('  members: ' + (t.members || []).map(function (m) { return m.name; }).join(', '));
    gs.print('  open rows: ' + rows.length + '  e.g. ' + rows.slice(0, 8).map(function (x) { return x.name; }).join(' | '));
}

// 2. Portfolios and their projects
gs.print('\n==== 2. PORTFOLIOS');
var me = get('/users/me');
var ports = me ? all('/portfolios?workspace=' + WORKSPACE + '&owner=' + me.data.gid + '&limit=100&opt_fields=name,owner.name') : [];
gs.print('  (portfolios owned by the token account: ' + ports.length + ' - portfolios owned by others are listed via section 3)');
ports.forEach(function (p) {
    var items = all('/portfolios/' + p.gid + '/items?limit=100&opt_fields=name,completed,archived,resource_type');
    gs.print('  ' + p.name + ' (' + p.gid + ', owner ' + (p.owner ? p.owner.name : '') + '): ' + items.length + ' items');
    items.forEach(function (i) { gs.print('     - ' + i.name + (i.completed || i.archived ? '  [completed/archived]' : '')); });
});

// 3. Portfolios by name (owned by anyone) - fill in the names you see in Asana
var NAMES = ['HR PMO Project Portfolio 2025', 'HR Tech Road', 'Workday - Ben'];   // ✏️ start of each portfolio name
NAMES.forEach(function (n) {
    var found = get('/workspaces/' + WORKSPACE + '/typeahead?resource_type=portfolio&count=10&query=' + encodeURIComponent(n));
    (found ? found.data : []).forEach(function (p) {
        var items = all('/portfolios/' + p.gid + '/items?limit=100&opt_fields=name,completed,archived');
        gs.print('\n==== 3. ' + p.name + ' (' + p.gid + '): ' + items.length + ' items');
        items.forEach(function (i) { gs.print('     - ' + i.name + (i.completed || i.archived ? '  [completed/archived]' : '')); });
    });
});
