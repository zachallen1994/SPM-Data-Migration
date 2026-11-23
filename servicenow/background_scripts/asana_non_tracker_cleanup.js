// Background Script (CHANGES DATA - DRY_RUN first): remove Asana projects that are NOT rows of the HR Project
// !! SCOPE CHANGED (HR PM list): do NOT run until asana_pm_scope_preview.js confirms regular projects are out of scope.
// Portfolio 2026 tracker (they came in from earlier runs with SOURCE 'projects' / 'both').
// Confirmed scope: the tracker is the HR portfolio; each ROW is a project, its subtasks are the project tasks.
// Keeps every project whose correlation id is ASANA:<gid of a tracker row> (active or not). Deletes the others
// with their project tasks, business rules ON. Large volumes: MAX per run, run again until "left: 0".
var DRY_RUN = true;     // ✏️ false = delete
var MAX = 50;           // ✏️ projects per run
var TRACKER = gs.getProperty('x_mig.asana.project_gid', '');
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
try {
    var keep = {};
    all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name').forEach(function (t) { keep['ASANA:' + t.gid] = true; });
    if (Object.keys(keep).length < 10) throw 'Tracker returned too few rows - stopped (nothing deleted)';
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
    gs.print((DRY_RUN ? 'DRY RUN | ' : '') + 'kept (tracker rows): ' + kept + ' | ' + (DRY_RUN ? 'to delete this run: ' : 'deleted: ') + done + ' | left: ' + left);
} catch (e) { gs.print('ERROR: ' + e); }
