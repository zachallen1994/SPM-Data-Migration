// Background Script (read-only): why does the Adaptive Tasks data source load 0 rows?
// Changes nothing. Paste into System Definition > Scripts - Background and click Run script.
var KNOWN_ID = '/Project/6uomnrt71emzaf0863fj7tnna958';                 // a project id the API returned with tasks
var MILESTONE = 'CLO: Program Complete';                                 // a milestone seen in the Berkeley work plan

function q(title, czql) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: czql, paging: { from: 0, limit: 25 } }));
    var res = r.execute();
    gs.print('==== ' + title + '  [' + res.getStatusCode() + ']');
    gs.print(czql);
    if (res.getStatusCode() != 200) { gs.print(res.getBody()); return []; }
    var rows = JSON.parse(res.getBody()).entities || [];
    gs.print('rows: ' + rows.length);
    rows.slice(0, 10).forEach(function (e) { gs.print('  ' + JSON.stringify(e)); });
    return rows;
}

// 1. Does "WHERE Project = '<id>'" work at all? (uses an id the API itself returned)
q('1. Tasks of a known project', "SELECT Name FROM Task WHERE Project = '" + KNOWN_ID + "'");

// 2. Which projects own the Berkeley-style milestones, and who is their parent?
q('2. Milestone -> its project', "SELECT Name, Project, Project.Name, Project.Parent, Project.ParentProject FROM Milestone WHERE Name = '" + MILESTONE + "'");

// 3. For every migrated project: the exact id ServiceNow stored, and tasks found by Project and by ParentProject
var p = new GlideRecord('pm_project');
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
p.query();
while (p.next()) {
    var id = p.getValue('correlation_id').replace('ADAPTIVE:', '');
    gs.print('\n#### ' + p.getValue('short_description') + '  stored id: ' + id);
    q('3a. Tasks by Project', "SELECT Name FROM Task WHERE Project = '" + id + "'");
    q('3b. Tasks by ParentProject', "SELECT Name FROM Task WHERE ParentProject = '" + id + "'");
    q('3c. Projects under it', "SELECT Name FROM Project WHERE ParentProject = '" + id + "'");
}
