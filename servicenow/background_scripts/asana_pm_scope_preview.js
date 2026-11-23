// Background Script (read-only, reads ASANA only): which Asana projects match the HR PMO scope?
// Same rules as asana_data_source.js: project managers on the HR PM list, dated 2025-2026, active (or completed too).
// Lists every MATCH (tracker row or regular Asana project) with PM, dates, status and link, then counts per PM.
// Result also in System Logs > All, Source = asana_pm_scope_preview.
var PM_EMAILS = ['jennifer.angle@bsmhealth.org', 'jennifer.angle@mercy.com', 'carrie_lynn@bsmhealth.org', 'carrie_lynn@mercy.com',
                 'kamcclure@bsmhealth.org', 'kamcclure@mercy.com', 'kmcdearmon@mercy.com', 'lhayes@mercy.com', 'mcaldwell4@mercy.com',
                 'iwhitis@bsmhealth.org', 'iwhitis@mercy.com', 'awarfield@bsmhealth.org', 'awarfield@mercy.com',
                 'menims@bsmhealth.org', 'menims@mercy.com'];
var PM_NAMES = ['angle', 'lynn', 'mcclure', 'mcdearmon', 'hayes', 'caldwell', 'whitis', 'warfield', 'trucksis'];
var FROM = '2025-01-01', TO = '2026-12-31';
var INCLUDE_COMPLETED = false;      // ✏️ true = show completed projects in the window too
var WORKSPACE = '5286451799521', TRACKER = gs.getProperty('x_mig.asana.project_gid', '');
var SKIP_STATUS = ['Completed', 'Cancelled'];
var OUT = [], TR = [], PR = [], perPm = {}, n = { tracker: 0, projects: 0, completedLeftOut: 0 };
function out(x) { gs.print(x); OUT.push(x); }
function all(path) {
    var list = [], url = 'https://app.asana.com/api/1.0' + path;
    while (url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET'); r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode();
        var b = JSON.parse(res.getBody()); list = list.concat(b.data || []); url = b.next_page ? b.next_page.uri : null;
    }
    return list;
}
function cf(t, name) { var v = ''; (t.custom_fields || []).forEach(function (f) { if ((f.name || '').trim() == name) v = f.display_value || ''; }); return v; }
function pmOf(email, text) {
    var e = String(email || '').toLowerCase();
    if (e && PM_EMAILS.indexOf(e) > -1) return e;
    var words = String(text || '').toLowerCase().split(/[^a-z]+/), hit = '';
    PM_NAMES.forEach(function (x) { if (!hit && words.indexOf(x) > -1) hit = x; });
    return hit;
}
function inWindow(s, d) { if (!s && !d) return true; var a = s || d, b = d || s; return !(b < FROM || a > TO); }
function done(t) { var st = t.current_status_update ? t.current_status_update.status_type : ''; return t.completed || st == 'complete' || /^\s*\(closed\)/i.test(t.name) || SKIP_STATUS.indexOf(cf(t, 'Project Status')) >= 0; }
function inSN(gid) { var p = new GlideRecord('pm_project'); return p.get('correlation_id', 'ASANA:' + gid) ? p.getValue('number') : '-'; }
try {
    out('Scope: PMs on the HR PM list | ' + FROM + '..' + TO + ' | ' + (INCLUDE_COMPLETED ? 'active + completed' : 'active only'));
    all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name,completed,start_on,due_on,assignee.email,custom_fields.name,custom_fields.display_value').forEach(function (t) {
        var pm = pmOf(t.assignee ? t.assignee.email : '', cf(t, 'PM Assigned'));
        if (!pm || !inWindow(t.start_on, t.due_on)) return;
        if (done(t) && !INCLUDE_COMPLETED) { n.completedLeftOut++; return; }
        n.tracker++; perPm[pm] = (perPm[pm] || 0) + 1; TR.push(t);
        out('TRACKER | ' + t.name + ' | PM ' + cf(t, 'PM Assigned') + ' | ' + (t.start_on || '-') + ' -> ' + (t.due_on || '-') + ' | ' + (cf(t, 'Project Status') || '-') +
            ' | SN ' + inSN(t.gid) + ' | https://app.asana.com/0/' + TRACKER + '/' + t.gid);
    });
    all('/workspaces/' + WORKSPACE + '/projects?archived=false&limit=100&opt_fields=name,completed,start_on,due_on,owner.name,owner.email,team.name,current_status_update.status_type,custom_fields.name,custom_fields.display_value').forEach(function (p) {
        if (p.gid == TRACKER) return;
        var pm = pmOf(p.owner ? p.owner.email : '', cf(p, 'PM Assigned'));
        if (!pm || !inWindow(p.start_on, p.due_on)) return;
        if (done(p) && !INCLUDE_COMPLETED) { n.completedLeftOut++; return; }
        n.projects++; perPm[pm] = (perPm[pm] || 0) + 1; PR.push(p);
        out('PROJECT | ' + p.name + ' | owner ' + (p.owner ? p.owner.name : '-') + ' | team ' + (p.team ? p.team.name : '-') + ' | ' + (p.start_on || '-') + ' -> ' + (p.due_on || '-') +
            ' | SN ' + inSN(p.gid) + ' | https://app.asana.com/0/' + p.gid + '/list');
    });
} catch (e) { out('ERROR: ' + e); }
// doubles: an in-scope tracker row and an in-scope regular project for the same initiative (name contains the other,
// ignoring "(Jen)", years and punctuation) -> pairs for property x_mig.asana.plan_links
function key(x) { return String(x || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b20\d\d\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
var pairs = [];
TR.forEach(function (t) {
    var a = key(t.name); if (a.length < 3) return;
    PR.forEach(function (p) {
        var b = key(p.name); if (b.length < 3) return;
        if (a == b || (a.length >= 6 && b.indexOf(a) > -1) || (b.length >= 6 && a.indexOf(b) > -1)) {
            pairs.push(t.gid + ':' + p.gid); out('DOUBLE? tracker "' + t.name + '" ~ project "' + p.name + '"');
        }
    });
});
out('DOUBLES ' + pairs.length + ' | x_mig.asana.plan_links value (remove pairs that are not the same initiative): ' + pairs.join(';'));
out('SUMMARY tracker rows ' + n.tracker + ' | regular projects ' + n.projects + ' | completed left out ' + n.completedLeftOut + ' | per PM ' + JSON.stringify(perPm));
gs.info(OUT.join('\n'), 'asana_pm_scope_preview');
