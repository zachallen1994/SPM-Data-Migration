// Data Source for Asana HR projects. Type: Custom (Load by Script).
// Two Data Sources use this same script; only MODE changes:
//   MODE = 'projects' -> u_import_asana_hr_project_portfolio  (one row per project)
//   MODE = 'tasks'    -> u_import_asana_project_tasks         (work plan of every project already migrated)
// A project can be either:
//   - an item (task) in the HR Project Portfolio 2026 tracker (x_mig.asana.project_gid), e.g. Flu Program; its
//     work plan = its subtasks, or
//   - a real Asana project with its own task list, e.g. October Month RPA Maintenance 2026; its work plan =
//     its tasks (and their subtasks). Found by exact name, so it must be in PILOT.
// Columns are matched by LABEL, so the CSV-built staging tables work as they are.
// Extra columns to add (String, 100): Correlation ID; tasks also Parent Correlation ID,
// Project Correlation ID. Optional: Assignee Email, Completed.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var MODE = 'projects';                       // 'projects' or 'tasks'
    var PILOT = ['Flu Program', 'October Month RPA Maintenance 2026'];   // projects mode only; [] = every in-flight tracker item
    var SKIP_STATUS = ['Completed', 'Cancelled'];                        // in-flight only (agreed)
    var WORKSPACE = '5286451799521';
    // =========================================================

    var BASE = 'https://app.asana.com/api/1.0';
    var FIELDS = 'gid,name,notes,num_subtasks,start_on,due_on,completed,assignee.name,assignee.email,parent.name,' +
                 'tags.name,followers.name,memberships.section.name,custom_fields.name,custom_fields.display_value';
    var PROJECT_FIELDS = 'gid,name,notes,start_on,due_on,completed,owner.name,owner.email,' +
                         'custom_fields.name,custom_fields.display_value';

    var table = data_source.getValue('import_set_table_name');
    var colByLabel = {};
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'STARTSWITH', 'u_');
    d.query();
    while (d.next()) colByLabel[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');

    function get(path) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(path.indexOf('http') == 0 ? path : BASE + path);
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ': ' + res.getBody();
        return JSON.parse(res.getBody());
    }
    function all(path) {                         // follows next_page
        var out = [], url = path;
        while (url) {
            var page = get(url);
            out = out.concat(page.data);
            url = page.next_page ? page.next_page.uri : null;
        }
        return out;
    }
    function custom(t, name) {
        var v = '';
        (t.custom_fields || []).forEach(function (f) { if (f.name.trim().toLowerCase() == name.toLowerCase()) v = f.display_value || ''; });
        return v;
    }
    function names(list) { return (list || []).map(function (x) { return x.name; }).join(', '); }
    function section(t) {
        var s = '';
        (t.memberships || []).forEach(function (m) { if (m.section) s = m.section.name; });
        return s;
    }
    function projectByName(name) {               // a real Asana project, exact name
        var found = get('/workspaces/' + WORKSPACE + '/typeahead?resource_type=project&count=20&query=' + encodeURIComponent(name)).data;
        for (var i = 0; i < found.length; i++) {
            if (found[i].name.trim().toLowerCase() == name.toLowerCase())
                return get('/projects/' + found[i].gid + '?opt_fields=' + PROJECT_FIELDS).data;
        }
        return null;
    }

    // label -> value. Built-in labels first; any other column label is looked up as an Asana custom field.
    function insert(builtIn, t) {
        var row = {};
        for (var label in colByLabel) {
            var col = colByLabel[label];
            var v = builtIn.hasOwnProperty(label) ? builtIn[label] : custom(t, label);
            if (v !== '' && v !== null && v !== undefined) row[col] = String(v);
        }
        import_set_table.insert(row);
    }

    var count = 0;
    function insertTask(s, parentGid, parentName, projectGid) {
        var status = custom(s, 'Task Status') || custom(s, 'Project Status');
        insert({
            'correlation id': 'ASANA:' + s.gid,
            'parent correlation id': 'ASANA:' + parentGid,
            'project correlation id': 'ASANA:' + projectGid,
            'task name': s.name.trim(),
            'name': s.name.trim(),
            'section/column': section(s),
            'assigned to': s.assignee ? s.assignee.name : '',
            'assignee': s.assignee ? s.assignee.name : '',
            'assignee email': s.assignee ? s.assignee.email : '',
            'start date': s.start_on,
            'due date': s.due_on,
            'task status': status || (s.completed ? 'Completed' : ''),
            'completed': s.completed ? 'true' : 'false',
            'notes': s.notes,
            'parent task': parentName,
            'tags': names(s.tags),
            'collaborators': names(s.followers)
        }, s);
        count++;
    }
    function walk(parent, projectGid) {          // every level of subtasks
        all('/tasks/' + parent.gid + '/subtasks?limit=100&opt_fields=' + FIELDS).forEach(function (s) {
            insertTask(s, parent.gid, parent.name, projectGid);
            if (s.num_subtasks) walk(s, projectGid);
        });
    }

    try {
        var tracker = all('/projects/' + gs.getProperty('x_mig.asana.project_gid') + '/tasks?limit=100&opt_fields=' + FIELDS);

        if (MODE == 'projects') {
            var items = tracker.filter(function (t) {
                if (PILOT.length && PILOT.indexOf(t.name.trim()) < 0) return false;
                return SKIP_STATUS.indexOf(custom(t, 'Project Status')) < 0;
            });
            items.forEach(function (t) {
                insert({
                    'correlation id': 'ASANA:' + t.gid,
                    'name': t.name.trim(),
                    'section/column': section(t),
                    'assignee': t.assignee ? t.assignee.name : '',
                    'assignee email': t.assignee ? t.assignee.email : '',
                    'start date': t.start_on,
                    'due date': t.due_on,
                    'tags': names(t.tags),
                    'notes': t.notes,
                    'parent task': ''
                }, t);
                count++;
            });
            // PILOT names that are not tracker items: look for a real Asana project with that name
            var inTracker = items.map(function (t) { return t.name.trim(); });
            PILOT.forEach(function (n) {
                if (inTracker.indexOf(n) >= 0) return;
                var p = projectByName(n);
                if (!p) { import_log.warn('Not found in Asana (tracker item or project): ' + n); return; }
                if (p.completed || SKIP_STATUS.indexOf(custom(p, 'Project Status')) >= 0) { import_log.info('Skipped (not in flight): ' + n); return; }
                insert({
                    'correlation id': 'ASANA:' + p.gid,
                    'name': p.name.trim(),
                    'assignee': p.owner ? p.owner.name : '',
                    'assignee email': p.owner ? p.owner.email : '',
                    'start date': p.start_on,
                    'due date': p.due_on,
                    'notes': p.notes,
                    'parent task': ''
                }, p);
                count++;
            });
        } else {
            // only work plans of projects already migrated (pm_project.correlation_id = ASANA:<gid>)
            var migrated = [];
            var pr = new GlideRecord('pm_project');
            pr.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
            pr.query();
            while (pr.next()) migrated.push({ gid: pr.getValue('correlation_id').substring(6), name: pr.getValue('short_description') });
            if (!migrated.length) { import_log.warn('No Asana projects in pm_project yet - load projects first'); return; }

            var trackerGids = tracker.map(function (t) { return t.gid; });
            migrated.forEach(function (m) {
                if (trackerGids.indexOf(m.gid) >= 0) {
                    walk(m, m.gid);                                  // tracker item: its subtasks
                } else {
                    all('/projects/' + m.gid + '/tasks?limit=100&opt_fields=' + FIELDS).forEach(function (t) {
                        insertTask(t, m.gid, m.name, m.gid);         // real project: its tasks...
                        if (t.num_subtasks) walk(t, m.gid);          // ...and their subtasks
                    });
                }
            });
        }
    } catch (err) {
        import_log.error(String(err));
        return;
    }
    import_log.info('Asana ' + MODE + ' rows loaded: ' + count);
})(import_set_table, data_source, import_log, last_success_import_time);
