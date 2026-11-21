// Background Script (read-only): what is in scope from Asana, with a LINK to open each item in Asana.
// A. The HR tracker ("HR Project Portfolio 2026") - one line per row: name, status, PM, subtasks, link
// B. Regular Asana projects (active, same rule as the data source) - one line per project: name, team, link
// Each line also says whether it is already a ServiceNow project (and its number).
// Paste a link into the browser while logged into Asana. If Asana says you have no access, your own account
// cannot see it (the migration token can) - ask the Asana owner to add you to the tracker.
// Result also in System Logs > All, Source = asana_scope_links.
var WORKSPACE = '5286451799521';
var TRACKER = gs.getProperty('x_mig.asana.project_gid', '');
var SHOW_PROJECTS = true;                        // ✏️ false = only the tracker (B can be ~400 lines)
var SKIP_STATUS = ['Completed', 'Cancelled'];
var OUT = [];
function out(x) { gs.print(x); OUT.push(x); }
function all(path) {
    var list = [], url = 'https://app.asana.com/api/1.0' + path;
    while (url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET'); r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 200);
        var b = JSON.parse(res.getBody());
        list = list.concat(b.data || []);
        url = b.next_page ? b.next_page.uri : null;
    }
    return list;
}
function cf(t, name) { var v = ''; (t.custom_fields || []).forEach(function (f) { if ((f.name || '').trim() == name) v = f.display_value || ''; }); return v; }
function inSN(gid) { var p = new GlideRecord('pm_project'); return p.get('correlation_id', 'ASANA:' + gid) ? p.getValue('number') : '-'; }
try {
    out('A. TRACKER  https://app.asana.com/0/' + TRACKER + '/list');
    var rows = all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name,completed,num_subtasks,custom_fields.name,custom_fields.display_value');
    var a = 0;
    rows.forEach(function (t) {
        var st = cf(t, 'Project Status'), active = !t.completed && SKIP_STATUS.indexOf(st) < 0;
        if (active) a++;
        out((active ? 'IN   ' : 'out  ') + t.name + ' | status ' + (st || '-') + ' | PM ' + (cf(t, 'PM Assigned') || '-') + ' | subtasks ' + (t.num_subtasks || 0) +
            ' | SN ' + inSN(t.gid) + ' | https://app.asana.com/0/' + TRACKER + '/' + t.gid);
    });
    out('A. tracker rows: ' + rows.length + ' | in scope (active): ' + a);
    if (SHOW_PROJECTS) {
        var ps = all('/workspaces/' + WORKSPACE + '/projects?archived=false&limit=100&opt_fields=name,completed,team.name,current_status_update.status_type,custom_fields.name,custom_fields.display_value');
        var b = 0;
        ps.forEach(function (p) {
            if (p.gid == TRACKER) return;
            var status = p.current_status_update ? p.current_status_update.status_type : '';
            if (p.completed || status == 'complete' || SKIP_STATUS.indexOf(cf(p, 'Project Status')) >= 0) return;
            b++;
            out('B. ' + p.name + ' | team ' + (p.team ? p.team.name : '-') + ' | SN ' + inSN(p.gid) + ' | https://app.asana.com/0/' + p.gid + '/list');
        });
        out('B. regular active projects: ' + b);
    }
} catch (e) { out('ERROR: ' + e); }
gs.info(OUT.join('\n'), 'asana_scope_links');
