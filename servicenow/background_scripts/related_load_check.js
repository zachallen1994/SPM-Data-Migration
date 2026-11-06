// Background Script (read-only): a related-records data source (Issues, Risks, Tasks...) loads 0 rows for a project.
// Checks every gate the data source applies, in order, for one project: settings, the project in ServiceNow,
// its Correlation ID, the scope property, the Adaptive State, the Adaptive API, and what Adaptive returns.
var NAME = 'Willow';            // ✏️ part of the project name
var ENTITY = 'Risk';            // ✏️ Risk | Issue | Task | C_PMOLessonsLearned | RegularResourceLink
var PROJECT_FIELD = 'PlannedFor';   // ✏️ Risk / Issue: PlannedFor; Task: Project; Lessons: C_RelatedWorkItem; Resources: WorkItem
var PARENT_STATES = ['Active', 'On Hold'];

gs.print('1) properties: url ' + (gs.getProperty('x_mig.adaptive.url') ? 'set' : 'MISSING') + ' | key ' +
    (gs.getProperty('x_mig.adaptive.key') ? 'set' : 'MISSING') + ' | scope "' + gs.getProperty('x_mig.adaptive.scope', '') + '"');

var p = new GlideRecord('pm_project');
p.addQuery('short_description', 'CONTAINS', NAME);
p.query();
if (!p.next()) {
    p = new GlideRecord('dmn_demand');
    p.addQuery('short_description', 'CONTAINS', NAME);
    p.query();
    if (!p.next()) { gs.print('2) NOT in ServiceNow as a project or demand - load the project first'); p = null; }
}
if (p) {
    var corr = p.getValue('correlation_id') || '';
    gs.print('2) ' + p.getTableName() + ' ' + p.getValue('number') + ' | ' + p.getValue('short_description') + ' | correlation_id "' + corr + '" (' + corr.length + ' chars)');
    if (corr.indexOf('ADAPTIVE:/') != 0) gs.print('   PROBLEM: correlation_id does not start with ADAPTIVE:/ - the data source ignores it');
    else if (corr.length == 40) gs.print('   PROBLEM: exactly 40 characters - probably cut off (staging Correlation ID column not 100 long in this instance)');

    var scope = (gs.getProperty('x_mig.adaptive.scope', '') + '').trim();
    if (/^latest$/i.test(scope)) {
        var ls = new GlideRecord('sys_import_set');
        ls.addQuery('table_name', 'u_import_adaptive_projects'); ls.orderByDesc('sys_created_on'); ls.setLimit(1); ls.query();
        var inLatest = false;
        if (ls.next()) {
            var lr = new GlideRecord('u_import_adaptive_projects');
            lr.addQuery('sys_import_set', ls.getUniqueValue()); lr.addQuery('u_correlation_id', corr); lr.query();
            inLatest = lr.hasNext();
        }
        gs.print('3) scope = latest: project ' + (inLatest ? 'IS' : 'is NOT') + ' in the latest projects load ' + (ls.isValidRecord() ? ls.getValue('number') : ''));
    } else gs.print('3) scope: ' + (scope || '(blank - the script ONLY list decides; check it is [])'));

    function post(q) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
        r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ q: q, paging: { from: 0, limit: 5 } }));
        var res = r.execute();
        return { code: res.getStatusCode(), body: res.getBody() };
    }
    var id = corr.replace('ADAPTIVE:', '');
    var st = post("SELECT State FROM Project WHERE Name = '" + p.getValue('short_description').replace(/'/g, "''") + "'");
    gs.print('4) Adaptive API: HTTP ' + st.code + (st.code == 200 ? '' : ' ' + st.body));
    if (st.code == 200) {
        (JSON.parse(st.body).entities || []).forEach(function (e) {
            var s = e.State && e.State.id ? decodeURIComponent(String(e.State.id).split('/').slice(2).join('/')) : '';
            gs.print('   Adaptive project ' + e.id + ' | State ' + s + (PARENT_STATES.indexOf(s) < 0 ? '  <- NOT in PARENT_STATES, so skipped' : '') +
                (e.id != id ? '  <- id differs from ServiceNow correlation_id' : ''));
        });
        var rs = post('SELECT ' + PROJECT_FIELD + ' FROM ' + ENTITY + " WHERE " + PROJECT_FIELD + " = '" + id + "'");
        gs.print('5) Adaptive ' + ENTITY + ' for this project: HTTP ' + rs.code + ' | ' + (rs.code == 200 ? (JSON.parse(rs.body).entities || []).length + ' (first 5 max)' : rs.body));
    }
}
