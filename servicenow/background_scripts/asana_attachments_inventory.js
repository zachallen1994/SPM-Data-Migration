// Background Script (read-only, reads ASANA only): which migrated Asana projects have attachments, and how many?
// Checks every Asana project AND project task already in ServiceNow (correlation_id ASANA:<gid>), asks Asana for its
// files, and prints one line per project: files stored in Asana (will be COPIED), linked files (Google Drive / Box /
// OneDrive - kept as a LINK in work notes), size, and which tasks hold them. Nothing is downloaded or changed.
// Result also in System Logs > All, Source = asana_attachments_inventory. Takes a few minutes (one call per record).
var SHOW_FILES = false;     // ✏️ true = also list every file name
var FROM_ASANA = true;      // ✏️ true = walk every task / subtask IN ASANA (does not depend on what is loaded in ServiceNow)
                            //    false = only the project tasks already loaded in ServiceNow
var OUT = [];
function out(x) { gs.print(x); OUT.push(x); }
function getAll(path) {
    var list = [], url = 'https://app.asana.com/api/1.0' + path;
    while (url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET'); r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() == 404 || res.getStatusCode() == 400) return null;
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ' for ' + path;
        var b = JSON.parse(res.getBody());
        list = list.concat(b.data || []);
        url = b.next_page && b.next_page.offset ? 'https://app.asana.com/api/1.0' + path + '&offset=' + b.next_page.offset : null;
    }
    return list;
}
function asanaTasks(gid) {                     // every task + subtask (any level) of an Asana project or tracker row
    var out = [], top = getAll('/projects/' + gid + '/tasks?limit=100&opt_fields=name,num_subtasks');
    if (top === null) top = getAll('/tasks/' + gid + '/subtasks?limit=100&opt_fields=name,num_subtasks') || [];   // tracker row
    (function walk(list) {
        list.forEach(function (t) {
            out.push(t);
            if (t.num_subtasks) walk(getAll('/tasks/' + t.gid + '/subtasks?limit=100&opt_fields=name,num_subtasks') || []);
        });
    })(top);
    return out;
}
function files(gid) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint('https://app.asana.com/api/1.0/attachments?parent=' + gid + '&opt_fields=name,host,size');
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    if (res.getStatusCode() == 400) return [];                    // sections cannot hold files
    if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ' for ' + gid;
    return JSON.parse(res.getBody()).data || [];
}
var per = {}, total = { projects: 0, withFiles: 0, stored: 0, linked: 0, mb: 0 };
try {
    var p = new GlideRecord('pm_project');
    p.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
    p.orderBy('short_description');
    p.query();
    while (p.next()) {
        total.projects++;
        var e = { name: p.getValue('number') + ' ' + p.getValue('short_description'), stored: 0, linked: 0, bytes: 0, tasks: [], names: [] };
        function add(list, where) {
            list.forEach(function (f) {
                if (f.host == 'asana') { e.stored++; e.bytes += f.size || 0; } else e.linked++;
                if (SHOW_FILES) e.names.push((f.host == 'asana' ? '' : '[link ' + f.host + '] ') + f.name + ' (' + where + ')');
            });
            if (list.length && where != 'project') e.tasks.push(where + ' ' + list.length);
        }
        add(files(p.getValue('correlation_id').substring(6)), 'project');
        var nTasks = 0;
        if (FROM_ASANA) {
            asanaTasks(p.getValue('correlation_id').substring(6)).forEach(function (x) { nTasks++; add(files(x.gid), x.name); });
        } else {
            var t = new GlideRecord('pm_project_task');
            t.addQuery('top_task', p.getUniqueValue());
            t.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
            t.query();
            while (t.next()) { nTasks++; add(files(t.getValue('correlation_id').substring(6)), t.getValue('short_description')); }
        }
        total.tasks = (total.tasks || 0) + nTasks;
        if (e.stored || e.linked) {
            total.withFiles++; total.stored += e.stored; total.linked += e.linked; total.mb += e.bytes / 1048576;
            out(e.name + ' | stored ' + e.stored + ' (' + (e.bytes / 1048576).toFixed(1) + ' MB) | linked ' + e.linked +
                (e.tasks.length ? ' | on tasks: ' + e.tasks.join('; ').substring(0, 400) : ''));
            if (SHOW_FILES) e.names.forEach(function (n) { out('      ' + n); });
        }
    }
} catch (err) { out('ERROR: ' + err); }
out('SUMMARY (' + (FROM_ASANA ? 'all tasks in Asana' : 'tasks loaded in ServiceNow') + ') projects checked ' + total.projects + ' | tasks checked ' + (total.tasks || 0) + ' | with attachments ' + total.withFiles + ' | files to copy ' + total.stored +
    ' (' + total.mb.toFixed(1) + ' MB) | linked files (work note only) ' + total.linked);
gs.info(OUT.join('\n'), 'asana_attachments_inventory');
