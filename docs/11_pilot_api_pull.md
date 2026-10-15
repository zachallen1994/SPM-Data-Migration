# 11: Pilot pull straight from the APIs (no exports)

ServiceNow calls Asana and Adaptive itself, using a Data Source of type **Custom (Load by Script)**.
The script writes rows into the staging table, then the same transform maps as the CSV pilot run.

For the pilot, each script is limited to a few named projects (`PILOT`). For the full load, empty
that list. Nothing else changes.

## What you need first

| System | Access | Where it comes from |
|---|---|---|
| Adaptive | API key (you have it; service account key requested) | Client Adaptive admin |
| Asana | Personal Access Token (or service account token) that can read HR_Project_Portfolio_2026 | Client Asana admin, or the project owner (My Settings → Apps → Developer apps → Personal access token) |
| Asana | The project's GID: the long number in its URL, `app.asana.com/0/<project_gid>/...` | Anyone who can open the project |

Store each token in an encrypted system property (type `password2`), never in the script:
`x_spm_mig.asana.token`, `x_spm_mig.asana.project_gid`, `x_spm_mig.adaptive.key`, `x_spm_mig.adaptive.url`.
`adaptive.url` is the URL returned by `https://api.clarizen.com/v2.0/services/authentication/getServerDefinition`.

A bonus of the API: Asana returns each task's **gid** (the missing Task ID) and people's **email**,
so the coalesce key and user matching both work properly.

## Setup in ServiceNow Dev

1. Create the staging tables once by loading the pilot CSVs (`pilot_projects.csv`, `pilot_tasks.csv`)
   through *Load Data*. That gives the columns the scripts write to (including `source_status`,
   the raw status the `state` script converts).
2. *System Import Sets → Data Sources → New*, type **Custom (Load by Script)**, import set table =
   the staging table. Paste a script below. One Data Source per staging table.
3. Transform maps: as in the CSV pilot, plus the `state` field map script at the end of this page.
4. Run: Data Source → *Load All Records*, then *Run Transform*. Projects first, then tasks.

## Asana: projects

```javascript
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {
    var PILOT = ['Flu Program', 'Licensure Project', 'Annual Enrollment',
                 'Integration of Ireland Annual Programs'];          // [] = every project
    var token = gs.getProperty('x_spm_mig.asana.token');
    var gid = gs.getProperty('x_spm_mig.asana.project_gid');
    var url = 'https://app.asana.com/api/1.0/projects/' + gid + '/tasks?limit=100' +
        '&opt_fields=gid,name,notes,start_on,due_on,custom_fields.name,' +
        'custom_fields.display_value,custom_fields.people_value.email';

    while (url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        var res = r.execute();
        if (res.getStatusCode() != 200) { import_log.error('Asana ' + res.getStatusCode() + ': ' + res.getBody()); return; }
        var body = JSON.parse(res.getBody());

        body.data.forEach(function (t) {
            if (PILOT.length && PILOT.indexOf(t.name.trim()) < 0) return;
            var cf = {};
            (t.custom_fields || []).forEach(function (f) { cf[f.name] = f; });
            var status = cf['Project Status'] ? cf['Project Status'].display_value : '';
            if (status == 'Completed' || status == 'Cancelled') return;     // in-flight only
            var pm = cf['PM Assigned'] || {};
            import_set_table.insert({
                u_correlation_id: 'ASANA:' + t.gid,
                u_correlation_display: 'Asana',
                u_short_description: t.name.trim(),
                u_description: t.notes,
                u_start_date: t.start_on,
                u_end_date: t.due_on,
                // email if PM Assigned is a people field, otherwise the name
                u_project_manager: (pm.people_value && pm.people_value.length) ? pm.people_value[0].email : (pm.display_value || ''),
                u_source_status: status,
                u_funding_type: cf['Funding'] ? cf['Funding'].display_value : ''   // OpEx/CapEx -> converted in the transform map
            });
        });
        url = body.next_page ? body.next_page.uri : null;
    }
})(import_set_table, data_source, import_log, last_success_import_time);
```
## Asana: tasks (workstreams)

Workstreams are subtasks of the project rows, so the script reads the projects first, then each one's subtasks.

```javascript
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {
    var PILOT = ['Flu Program', 'Licensure Project', 'Annual Enrollment',
                 'Integration of Ireland Annual Programs'];
    var token = gs.getProperty('x_spm_mig.asana.token');
    var gid = gs.getProperty('x_spm_mig.asana.project_gid');

    function get(url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ': ' + res.getBody();
        return JSON.parse(res.getBody());
    }

    var url = 'https://app.asana.com/api/1.0/projects/' + gid + '/tasks?limit=100&opt_fields=gid,name';
    while (url) {
        var page = get(url);
        page.data.forEach(function (p) {
            if (PILOT.length && PILOT.indexOf(p.name.trim()) < 0) return;
            var subs = get('https://app.asana.com/api/1.0/tasks/' + p.gid + '/subtasks?limit=100' +
                '&opt_fields=gid,name,notes,start_on,due_on,assignee.email,' +
                'custom_fields.name,custom_fields.display_value').data;
            subs.forEach(function (t) {
                var status = '';
                (t.custom_fields || []).forEach(function (f) { if (f.name == 'Project Status') status = f.display_value; });
                import_set_table.insert({
                    u_correlation_id: 'ASANA:' + t.gid,
                    u_correlation_display: 'Asana',
                    u_short_description: t.name.trim(),
                    u_parent: 'ASANA:' + p.gid,
                    u_top_task: 'ASANA:' + p.gid,
                    u_description: t.notes,
                    u_start_date: t.start_on,
                    u_end_date: t.due_on,
                    u_assigned_to: t.assignee ? t.assignee.email : '',
                    u_source_status: status
                });
            });
        });
        url = page.next_page ? page.next_page.uri : null;
    }
})(import_set_table, data_source, import_log, last_success_import_time);
```

## Adaptive: projects

Field names below are the usual Adaptive ones. Confirm them once with
`/metadata/describeEntities` (`{"typeNames":["Project","Task"]}`); custom fields start with `C_`.

```javascript
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {
    var PILOT = ['<Adaptive project name 1>', '<Adaptive project name 2>'];   // [] = every in-flight project
    var where = "State IN ('Active','On Hold')";                             // in-flight states: BA to confirm
    if (PILOT.length) where += " AND Name IN ('" + PILOT.join("','") + "')";
    var q = 'SELECT Name, Description, StartDate, DueDate, State, ProjectManager.Email, C_BusinessSponsor, C_CN ' +
            'FROM Project WHERE ' + where;

    var paging = { from: 0, limit: 100 };
    while (true) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(gs.getProperty('x_spm_mig.adaptive.url') + '/data/query');
        r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_spm_mig.adaptive.key'));
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ q: q, paging: paging }));
        var res = r.execute();
        if (res.getStatusCode() != 200) { import_log.error('Adaptive ' + res.getStatusCode() + ': ' + res.getBody()); return; }
        var body = JSON.parse(res.getBody());

        body.entities.forEach(function (e) {
            var last = function (ref) { return ref && ref.id ? ref.id.split('/').pop() : (ref || ''); };
            import_set_table.insert({
                u_correlation_id: 'ADAPTIVE:' + e.id,
                u_correlation_display: 'Adaptive Work',
                u_short_description: e.Name,
                u_description: e.Description,
                u_start_date: e.StartDate,
                u_end_date: e.DueDate,
                u_project_manager: e.ProjectManager ? e.ProjectManager.Email : '',
                u_business_owner: e.C_BusinessSponsor,
                u_cn: e.C_CN,
                u_source_status: last(e.State)          // {"id":"/State/Active"} -> "Active"
            });
        });
        if (!body.paging || !body.paging.hasMore) break;
        paging = body.paging;
    }
})(import_set_table, data_source, import_log, last_success_import_time);
```

## Adaptive: tasks

Same script with this query and row. Run it after the project load.
```javascript
var q = "SELECT Name, StartDate, DueDate, State, PercentCompleted, Parent, Project FROM Task " +
        "WHERE Project IN ('/Project/<id1>','/Project/<id2>')";     // the pilot projects' ids
// row:
u_correlation_id: 'ADAPTIVE:' + e.id,
u_parent: 'ADAPTIVE:' + e.Parent.id,
u_top_task: 'ADAPTIVE:' + e.Project.id,
```

## Transform map: `state` field map script (both sources)

```javascript
answer = (function transformEntry(source) {
    var map = {
        // Asana
        'In Progress': 'Work in Progress', 'Not Started': 'Pending', 'Started/Scoping': 'Investigating',
        'Delayed': 'Work in Progress', 'On Hold': 'Pending', '': 'Pending',
        // Adaptive: BA to confirm
        'Active': 'Work in Progress'
    };
    var label = map[source.u_source_status + ''];
    // Convert the label to the instance's stored value
    var ch = new GlideRecord('sys_choice');
    ch.addQuery('name', 'pm_project');      // pm_project_task in the task map
    ch.addQuery('element', 'state');
    ch.addQuery('label', label);
    ch.query();
    return ch.next() ? ch.value + '' : '';
})(source);
```

## Transform map: `u_funding_type` field map script (Asana)

```javascript
answer = (function transformEntry(source) {
    var v = source.u_funding_type + '';
    var map = { 'OpEx': 'Opex required', 'CapEx': 'Capex required' };
    return map[v] || v;            // CSV pilot rows already hold the converted value
})(source);
```

## People fields

The API returns **emails** (the CSV pilot had names). On `project_manager` and `assigned_to`, set
*Referenced value field name* = `email` for API loads. Choice action stays **ignore**.
