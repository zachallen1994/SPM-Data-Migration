// Run once in Scripts - Background. Prints what Adaptive and Asana actually have, so the
// related-record Data Sources use the right entity and field names.
// Output is long: use SN Utils "Download" (or copy) and attach it to the Discovery story.

var ADAPTIVE_CANDIDATES = ['Task', 'Milestone', 'Issue', 'Risk', 'C_PMOLessonsLearned',
    'RegularResourceLink', 'ResourceLink', 'Timesheet', 'Document', 'AttachmentLink'];
var KEYWORDS = /task|milestone|issue|risk|lesson|resource|timesheet|time|document|attach|status|budget|expense|cost/i;

function adaptive(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    return { status: res.getStatusCode(), body: res.getBody() };
}

function asana(path) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint('https://app.asana.com/api/1.0' + path);
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    return { status: res.getStatusCode(), body: res.getBody() };
}

// ---- 1. Adaptive: every entity type whose name looks relevant
var list = adaptive('GET', '/metadata/listEntities');
gs.info('=== ADAPTIVE listEntities -> ' + list.status);
if (list.status == 200) {
    var names = (JSON.parse(list.body).typeNames || []).filter(function (n) { return KEYWORDS.test(n); });
    gs.info('Relevant entity types: ' + names.join(', '));
}

// ---- 2. Adaptive: fields of each candidate entity (name | label | type | references)
ADAPTIVE_CANDIDATES.forEach(function (entity) {
    var d = adaptive('GET', '/metadata/describeEntities?typeNames=' + entity);
    if (d.status != 200) { gs.info('=== ' + entity + ': NOT FOUND (' + d.status + ')'); return; }
    var fields = JSON.parse(d.body).entityDescriptions[0].fields;
    gs.info('=== ' + entity + ' (' + fields.length + ' fields)');
    gs.info(fields.map(function (f) {
        return f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join('/') : '');
    }).join('\n'));
});

// ---- 3. Adaptive: how many related records one migrated project has
var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/Project/');
p.setLimit(1);
p.query();
if (p.next()) {
    var pid = p.getValue('correlation_id').replace('ADAPTIVE:', '');
    gs.info('=== Sample project ' + p.getValue('short_description') + ' (' + pid + ')');
    ['Task', 'Milestone', 'Issue', 'Risk', 'Timesheet'].forEach(function (entity) {
        var q = adaptive('POST', '/data/query', { q: 'SELECT Name FROM ' + entity + " WHERE Project = '" + pid + "'", paging: { from: 0, limit: 5 } });
        gs.info(entity + ' -> ' + q.status + ': ' + q.body.substring(0, 300));
    });
}

// ---- 4. Asana: what the portfolio items carry (subtasks, attachments, time tracking)
var tasks = asana('/projects/' + gs.getProperty('x_mig.asana.project_gid') +
    '/tasks?limit=5&opt_fields=name,num_subtasks,actual_time_minutes,custom_fields.name');
gs.info('=== ASANA sample items -> ' + tasks.status);
if (tasks.status == 200) {
    JSON.parse(tasks.body).data.forEach(function (t) {
        var att = asana('/attachments?parent=' + t.gid + '&opt_fields=name,host,size');
        gs.info(t.name + ' | subtasks: ' + t.num_subtasks + ' | actual_time_minutes: ' + t.actual_time_minutes +
            ' | attachments: ' + (att.status == 200 ? att.body.substring(0, 300) : att.status));
    });
    var cf = JSON.parse(tasks.body).data[0];
    if (cf) gs.info('Custom fields: ' + (cf.custom_fields || []).map(function (f) { return f.name; }).join(', '));
}
