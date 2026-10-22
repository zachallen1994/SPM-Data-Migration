// Fix Script (Dev clean-up): remove migrated Adaptive projects / demands that are OUT of scope today
// (Adaptive State not in STATES, or Project Type not in PROJECT_TYPES, or no longer in Adaptive),
// together with the records migrated under them. Scope is read from Adaptive, not from ServiceNow.
// DRY_RUN = true only lists. Use the same STATES / PROJECT_TYPES as adaptive_projects_data_source.js.
var DRY_RUN = true;                        // ✏️ true = list only; false = delete
var STATES = ['Active', 'On Hold'];        // ✏️ same as the projects data source
var PROJECT_TYPES = ['Project'];           // ✏️ same as the projects data source
var MAX = 25;                              // ✏️ projects / demands per run (run again until it finds 0); 0 = all
gs.info('out_of_scope_cleanup VERSION 2');
var started = new Date().getTime();
function progress(msg) { gs.info('out_of_scope_cleanup ' + Math.round((new Date().getTime() - started) / 1000) + 's: ' + msg); }

// Records that hang off a project / demand / project task: [table, field that points at it]
var CHILDREN = [['time_card', 'task'], ['cost_plan', 'task'], ['fm_expense_line', 'task'], ['risk', 'task'],
                ['issue', 'parent'], ['project_status', 'project'], ['u_lessons_learned', 'u_project'],
                ['sn_plng_att_core_resource_assignment', 'task'], ['pm_project_task', 'top_task']];

function post(body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody();
    return JSON.parse(res.getBody());
}
function name(ref) { return ref && ref.id ? decodeURIComponent(String(ref.id).split('/').pop()) : ''; }

// Adaptive scope: id -> reason it is out of scope ('' = in scope)
var reason = {}, paging = { from: 0, limit: 100 };
while (true) {
    var body = post({ q: 'SELECT State, ProjectType FROM Project', paging: paging });
    body.entities.forEach(function (e) {
        var st = name(e.State), type = name(e.ProjectType);
        reason[e.id] = STATES.indexOf(st) < 0 ? 'State ' + st : PROJECT_TYPES.indexOf(type) < 0 ? 'Type ' + (type || '(blank)') : '';
    });
    if (!body.paging || !body.paging.hasMore) break;
    paging = body.paging;
}

progress('Adaptive scope read: ' + Object.keys(reason).length + ' projects');
var byReason = {}, childCount = {}, removed = 0, more = 0, sample = [];
['pm_project', 'dmn_demand'].forEach(function (t) {
    var p = new GlideRecord(t);
    p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/Project/');
    p.query();
    while (p.next()) {
        var id = p.getValue('correlation_id').replace('ADAPTIVE:', '');
        var why = reason.hasOwnProperty(id) ? reason[id] : 'not in Adaptive';
        if (!why) continue;                                             // in scope: keep
        byReason[t + ' | ' + why] = (byReason[t + ' | ' + why] || 0) + 1;   // counts ALL out of scope
        if (MAX && removed >= MAX) { more++; continue; }               // next run
        if (sample.length < 20) sample.push(t + ' ' + p.getValue('number') + ' ' + p.getValue('short_description') + ' (' + why + ')');
        // the project / demand and its tasks; children of any of them go first
        var ids = [p.getUniqueValue()];
        var pt = new GlideRecord('pm_project_task');
        pt.addQuery('top_task', p.getUniqueValue());
        pt.query();
        while (pt.next()) ids.push(pt.getUniqueValue());
        CHILDREN.forEach(function (c) {
            var g = new GlideRecord(c[0]);
            if (!g.isValid() || !g.isValidField(c[1])) return;          // table / field not in this instance
            var n = new GlideAggregate(c[0]);
            n.addQuery(c[1], 'IN', ids.join(','));
            n.addAggregate('COUNT'); n.query();
            var cnt = n.next() ? parseInt(n.getAggregate('COUNT'), 10) : 0;
            childCount[c[0]] = (childCount[c[0]] || 0) + cnt;
            if (!DRY_RUN && cnt) { g.addQuery(c[1], 'IN', ids.join(',')); g.deleteMultiple(); }
        });
        if (!DRY_RUN) p.deleteRecord();
        removed++;
        if (removed % 5 == 0) progress(removed + ' done');
    }
});
gs.info('Out of scope: ' + JSON.stringify(byReason));
gs.info('Records under the ' + removed + ' handled this run: ' + JSON.stringify(childCount));
sample.forEach(function (s) { gs.info('  e.g. ' + s); });
gs.info((DRY_RUN ? 'DRY RUN - would delete ' : 'Deleted ') + removed + ' projects / demands and the records above' +
    (more ? '; ' + more + ' more out of scope - run again' : '; none left'));
progress('finished');
