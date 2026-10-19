// Data Source for Asana HR_Project_Portfolio_2026. Type: Custom (Load by Script).
// Two Data Sources use this same script; only MODE changes:
//   MODE = 'projects' -> u_import_asana_hr_project_portfolio  (top-level items = projects)
//   MODE = 'tasks'    -> u_import_asana_project_tasks         (subtasks at every level = work plan)
// Columns are matched by LABEL, so the CSV-built staging tables work as they are.
// Extra columns to add (String, 100): Correlation ID; tasks also Parent Correlation ID,
// Project Correlation ID. Optional: Assignee Email, Completed.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var MODE = 'projects';                       // 'projects' or 'tasks'
    var PILOT = ['Flu Program', 'Licensure Project', 'Annual Enrollment'];   // projects mode only; [] = every in-flight item
    var SKIP_STATUS = ['Completed', 'Cancelled'];                            // in-flight only (agreed)
    // =========================================================

    var BASE = 'https://app.asana.com/api/1.0';
    var FIELDS = 'gid,name,notes,num_subtasks,start_on,due_on,completed,assignee.name,assignee.email,parent.name,' +
                 'tags.name,followers.name,memberships.section.name,custom_fields.name,custom_fields.display_value';

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

    // tasks mode: only work plans of projects already migrated (pm_project.correlation_id = ASANA:<gid>),
    // so the tasks always follow whatever Asana projects are in ServiceNow - PILOT is not used.
    var migrated = {};
    if (MODE == 'tasks') {
        var p = new GlideRecord('pm_project');
        p.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
        p.query();
        while (p.next()) migrated[p.getValue('correlation_id')] = true;
        if (!Object.keys(migrated).length) { import_log.warn('No Asana projects in pm_project yet - load projects first'); return; }
    }

    var gid = gs.getProperty('x_mig.asana.project_gid');
    var items = all('/projects/' + gid + '/tasks?limit=100&opt_fields=' + FIELDS).filter(function (t) {
        if (MODE == 'tasks') return migrated['ASANA:' + t.gid] === true;
        if (PILOT.length && PILOT.indexOf(t.name.trim()) < 0) return false;
        return SKIP_STATUS.indexOf(custom(t, 'Project Status')) < 0;
    });

    var count = 0;
    try {
        items.forEach(function (t) {
            if (MODE == 'projects') {
                var section = '';
                (t.memberships || []).forEach(function (m) { if (m.section) section = m.section.name; });
                insert({
                    'correlation id': 'ASANA:' + t.gid,
                    'name': t.name.trim(),
                    'section/column': section,
                    'assignee': t.assignee ? t.assignee.name : '',
                    'assignee email': t.assignee ? t.assignee.email : '',
                    'start date': t.start_on,
                    'due date': t.due_on,
                    'tags': names(t.tags),
                    'notes': t.notes,
                    'parent task': ''
                }, t);
                count++;
            } else {
                (function walk(parent) {                       // every level of subtasks
                    all('/tasks/' + parent.gid + '/subtasks?limit=100&opt_fields=' + FIELDS).forEach(function (s) {
                        var status = custom(s, 'Task Status') || custom(s, 'Project Status');
                        insert({
                            'correlation id': 'ASANA:' + s.gid,
                            'parent correlation id': 'ASANA:' + parent.gid,
                            'project correlation id': 'ASANA:' + t.gid,
                            'task name': s.name.trim(),
                            'name': s.name.trim(),
                            'assigned to': s.assignee ? s.assignee.name : '',
                            'assignee': s.assignee ? s.assignee.name : '',
                            'assignee email': s.assignee ? s.assignee.email : '',
                            'start date': s.start_on,
                            'due date': s.due_on,
                            'task status': status || (s.completed ? 'Completed' : ''),
                            'completed': s.completed ? 'true' : 'false',
                            'notes': s.notes,
                            'parent task': parent.name,
                            'tags': names(s.tags),
                            'collaborators': names(s.followers)
                        }, s);
                        count++;
                        if (s.num_subtasks) walk(s);
                    });
                })(t);
            }
        });
    } catch (err) {
        import_log.error(String(err));
        return;
    }
    import_log.info('Asana ' + MODE + ' rows loaded: ' + count + ' (from ' + items.length + ' portfolio items)');
})(import_set_table, data_source, import_log, last_success_import_time);
