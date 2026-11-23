// Background Script (CHANGES DATA - DRY_RUN first): remove Asana projects that are OUT OF SCOPE.
// Scope (HR PMO, Richard Becker): ACTIVE projects of the PMs on the HR PM list, dated 2025-2026 - tracker rows
// ("PM Assigned") and regular Asana projects (owner email). Same rules as asana_data_source.js.
// Keeps every in-scope project; deletes other ASANA: projects with their project tasks, business rules ON.
// MAX per run - run again until "left: 0". Stops without deleting if Asana returns nothing.
var DRY_RUN = true;     // ✏️ false = delete
var MAX = 50;           // ✏️ projects per run
var TRACKER = gs.getProperty('x_mig.asana.project_gid', ''), WORKSPACE = '5286451799521';
var PM_EMAILS = ['jennifer.angle@bsmhealth.org', 'jennifer.angle@mercy.com', 'carrie_lynn@bsmhealth.org', 'carrie_lynn@mercy.com',
                 'kamcclure@bsmhealth.org', 'kamcclure@mercy.com', 'kmcdearmon@mercy.com', 'lhayes@mercy.com', 'mcaldwell4@mercy.com',
                 'iwhitis@bsmhealth.org', 'iwhitis@mercy.com', 'awarfield@bsmhealth.org', 'awarfield@mercy.com',
                 'menims@bsmhealth.org', 'menims@mercy.com'];
var PM_NAMES = ['angle', 'lynn', 'mcclure', 'mcdearmon', 'hayes', 'caldwell', 'whitis', 'warfield', 'trucksis'];
var FROM = '2025-01-01', TO = '2026-12-31', SKIP_STATUS = ['Completed', 'Cancelled'];
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
function cf(t, n) { var v = ''; (t.custom_fields || []).forEach(function (f) { if ((f.name || '').trim() == n) v = f.display_value || ''; }); return v; }
function pmOk(email, text) {
    if (PM_EMAILS.indexOf(String(email || '').toLowerCase()) > -1) return true;
    var w = String(text || '').toLowerCase().split(/[^a-z]+/);
    return PM_NAMES.some(function (x) { return w.indexOf(x) > -1; });
}
function inWindow(s, d) { if (!s && !d) return true; var a = s || d, b = d || s; return !(b < FROM || a > TO); }
function active(t) { var st = t.current_status_update ? t.current_status_update.status_type : ''; return !t.completed && st != 'complete' && !/^\s*\(closed\)/i.test(t.name) && SKIP_STATUS.indexOf(cf(t, 'Project Status')) < 0; }
try {
    var keep = {}, found = 0;
    all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name,completed,start_on,due_on,assignee.email,custom_fields.name,custom_fields.display_value').forEach(function (t) {
        found++;
        if (pmOk(t.assignee ? t.assignee.email : '', cf(t, 'PM Assigned')) && inWindow(t.start_on, t.due_on) && active(t)) keep['ASANA:' + t.gid] = true;
    });
    all('/workspaces/' + WORKSPACE + '/projects?archived=false&limit=100&opt_fields=name,completed,start_on,due_on,owner.email,current_status_update.status_type,custom_fields.name,custom_fields.display_value').forEach(function (p) {
        found++;
        if (pmOk(p.owner ? p.owner.email : '', cf(p, 'PM Assigned')) && inWindow(p.start_on, p.due_on) && active(p)) keep['ASANA:' + p.gid] = true;
    });
    if (found < 50) throw 'Asana returned too little (' + found + ') - stopped, nothing deleted';
    var p = new GlideRecord('pm_project');
    p.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
    p.query();
    var kept = 0, done = 0, left = 0;
    while (p.next()) {
        if (keep[p.getValue('correlation_id')]) { kept++; continue; }
        if (done >= MAX) { left++; continue; }
        var t = new GlideAggregate('pm_project_task');
        t.addQuery('top_task', p.getUniqueValue()); t.addAggregate('COUNT'); t.query();
        var nTasks = t.next() ? t.getAggregate('COUNT') : 0;
        gs.print((DRY_RUN ? 'would delete ' : 'deleting ') + p.getValue('number') + ' ' + p.getValue('short_description') + ' (' + nTasks + ' tasks)');
        if (!DRY_RUN) {
            var k = new GlideRecord('pm_project_task');
            k.addQuery('top_task', p.getUniqueValue()); k.orderByDesc('sys_created_on'); k.query();
            while (k.next()) k.deleteRecord();
            if (!p.deleteRecord()) gs.print('   NOT deleted (refused) - ' + p.getValue('number'));
        }
        done++;
    }
    gs.print((DRY_RUN ? 'DRY RUN | ' : '') + 'in scope (kept): ' + kept + ' | ' + (DRY_RUN ? 'to delete this run: ' : 'deleted: ') + done + ' | left: ' + left);
} catch (e) { gs.print('ERROR: ' + e); }
