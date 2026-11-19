// Background Script (read-only, reads ADAPTIVE only - nothing in ServiceNow is needed or changed):
// how many rows each migration step will load for the projects in scope, in total, per batch and per project.
// Use with migration_timing_report.js: time ONE batch in DEV, divide its time by its rows (rate per row), then
// multiply by the totals printed here. Rows, not projects, drive the time (one big project can outweigh 20 small ones).
// Scope = the same system properties the data sources use (x_mig.adaptive.states / project_types / batch size).
// Runs for several minutes (time entries are read page by page). Safe to run while other jobs run.
var BATCHES = 7;              // ✏️ the number of batches you would split the projects into (x_mig.adaptive.batch = n/7)
var TIME = true;              // ✏️ false = skip time entries (the slowest part of this script)
var STATUS_SINCE = '2025-01-01';
// The result is ALSO written to the System Log (System Logs > All, Source = adaptive_volume_estimate), so it is not lost
// when the browser shows "Failed to fetch" on a long run - the script keeps running on the server.
var OUT = [];
function out(x) { gs.print(x); OUT.push(x); }
var TIME_STATES = ['Approved'];
function prop(n, d) { var v = (gs.getProperty(n, '') + '').trim(); return !v ? d : /^all$/i.test(v) ? [] : v.split(/\s*;\s*/); }
var STATES = prop('x_mig.adaptive.states', ['Active']), TYPES = prop('x_mig.adaptive.project_types', ['Project']);
function post(q, paging) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: q, paging: paging }));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300);
    return JSON.parse(res.getBody());
}
function each(q, fn) {         // every entity of a query, page by page
    var paging = { from: 0, limit: 100 };
    while (true) {
        var b = post(q, paging);
        (b.entities || []).forEach(fn);
        if (!b.paging || !b.paging.hasMore) break;
        paging = b.paging;
    }
}
function name(ref) { return ref && ref.id ? decodeURIComponent(String(ref.id).split('/').slice(2).join('/')) : ''; }
try {
    // 1) projects in scope (same filter and same batch order as the projects data source: sorted by Adaptive id)
    var proj = [];
    each('SELECT Name, State, ProjectType FROM Project', function (e) {
        if (STATES.length && STATES.indexOf(name(e.State)) < 0) return;
        if (TYPES.length && TYPES.indexOf(name(e.ProjectType)) < 0) return;
        proj.push({ id: e.id, name: e.Name, tasks: 0, res: 0, status: 0, budget: 0, cards: 0, entries: 0 });
    });
    proj.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var byId = {};
    proj.forEach(function (p) { byId[p.id] = p; });
    out('Projects in scope: ' + proj.length + ' (states ' + STATES.join(',') + ' | types ' + TYPES.join(',') + ')');
    // 2) per project counts, 20 projects per query
    var statusDays = {}, cardKeys = {};
    for (var i = 0; i < proj.length; i += 20) {
        var ids = proj.slice(i, i + 20).map(function (p) { return p.id; });
        function w(f) { return ids.map(function (id) { return f + " = '" + id + "'"; }).join(' OR '); }
        each('SELECT Project FROM Task WHERE ' + w('Project'), function (e) { var p = e.Project && byId[e.Project.id]; if (p) p.tasks++; });
        each('SELECT WorkItem FROM RegularResourceLink WHERE ' + w('WorkItem'), function (e) { var p = e.WorkItem && byId[e.WorkItem.id]; if (p) p.res++; });
        each('SELECT WorkItem FROM NonLaborResourceLinkDirect WHERE ' + w('WorkItem'), function (e) { var p = e.WorkItem && byId[e.WorkItem.id]; if (p) p.budget++; });
        each("SELECT C_RelatedProject, C_UpdatedOn FROM C_StatusHistory WHERE (" + w('C_RelatedProject') + ")", function (e) {
            var p = e.C_RelatedProject && byId[e.C_RelatedProject.id], d = String(e.C_UpdatedOn || '').substring(0, 10);
            if (!p || d < STATUS_SINCE || statusDays[p.id + d]) return;
            statusDays[p.id + d] = true; p.status++;
        });
        if (TIME) each('SELECT ReportedBy.Email, ReportedDate, WorkItem, Project, State FROM Timesheet WHERE ' + w('Project'), function (e) {
            var p = e.Project && byId[e.Project.id];
            if (!p || (TIME_STATES.length && TIME_STATES.indexOf(name(e.State)) < 0)) return;
            p.entries++;
            var day = new Date(String(e.ReportedDate).substring(0, 10) + 'T00:00:00Z');
            var week = new Date(day.getTime() - day.getUTCDay() * 86400000).toISOString().substring(0, 10);
            var k = (e.ReportedBy && e.ReportedBy.Email) + '|' + (e.WorkItem && e.WorkItem.id) + '|' + week;
            if (!cardKeys[k]) { cardKeys[k] = true; p.cards++; }
        });
    }
    // 3) totals, per batch, biggest projects
    var F = ['tasks', 'res', 'status', 'budget', 'cards', 'entries'];
    var LBL = { tasks: 'Tasks', res: 'Resources (project level)', status: 'Status history (1/day, 2025+)', budget: 'Budget lines', cards: 'Time cards (rows)', entries: 'Time entries (Approved)' };
    function sum(list) { var t = {}; F.forEach(function (f) { t[f] = 0; list.forEach(function (p) { t[f] += p[f]; }); }); return t; }
    var all = sum(proj);
    out('TOTAL rows to load:');
    F.forEach(function (f) { out('   ' + LBL[f] + ': ' + all[f] + ' | average per project ' + (proj.length ? (all[f] / proj.length).toFixed(1) : 0)); });
    var size = Math.ceil(proj.length / BATCHES);
    out('PER BATCH (x_mig.adaptive.batch = n/' + BATCHES + ', ' + size + ' projects each):');
    for (var b = 0; b < BATCHES; b++) {
        var t = sum(proj.slice(b * size, (b + 1) * size));
        out('   batch ' + (b + 1) + '/' + BATCHES + ': ' + F.map(function (f) { return f + ' ' + t[f]; }).join(' | '));
    }
    out('BIGGEST 15 PROJECTS (by time cards, then tasks):');
    proj.slice().sort(function (a, b) { return (b.cards - a.cards) || (b.tasks - a.tasks); }).slice(0, 15).forEach(function (p) {
        out('   ' + p.name + ' | ' + F.map(function (f) { return f + ' ' + p[f]; }).join(' | '));
    });
} catch (err) { out('ERROR: ' + err); }
gs.info(OUT.join('\n'), 'adaptive_volume_estimate');
