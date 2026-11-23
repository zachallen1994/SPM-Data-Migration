// Data Source for Asana projects. Type: Custom (Load by Script).
// Two Data Sources use this same script; only MODE changes:
//   MODE = 'projects' -> u_import_asana_hr_project_portfolio  (one row per ACTIVE Asana project)
//   MODE = 'tasks'    -> u_import_asana_project_tasks         (work plan of every project already migrated)
// Active = not archived, not marked complete, latest status update not "Complete", Project Status (custom
// field, when there is one) not in SKIP_STATUS. Completed projects are out of scope (same rule as Adaptive).
// The token only sees projects its Asana user can see: use an account with access to every project in scope.
// The HR Project Portfolio 2026 tracker (x_mig.asana.project_gid) is a list, not a project: it is never loaded
// itself. Its items (e.g. Flu Program) load only when INCLUDE_TRACKER_ITEMS = true; their work plan = subtasks.
// Columns are matched by LABEL, so the CSV-built staging tables work as they are.
// Extra columns to add (String, 100): Correlation ID; tasks also Parent Correlation ID,
// Project Correlation ID. Optional: Assignee Email, Completed, Team.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var MODE = 'projects';                       // 'projects' or 'tasks'
    var PILOT = ['Flu Program', 'Annual Enrollment', 'Respiratory Fit Testing'];   // test: only these names (part of the name is enough, any case/dash); [] = all active
    var TEAMS = [];                              // Asana team names to include, e.g. ['HR Technology']; [] = all teams
    var SOURCE = 'tracker';                      // 'tracker'  = rows of HR Project Portfolio 2026 (HR PMO initiatives)
                                                 // 'projects' = real Asana projects in the workspace
                                                 // 'both'     = both, as separate records
    var INCLUDE_TRACKER_ITEMS = (SOURCE == 'tracker' || SOURCE == 'both');
    var SKIP_STATUS = ['Completed', 'Cancelled'];   // Project Status custom field values that mean "not active"
    var WORKSPACE = '5286451799521';
    var ONLY = [];                               // MODE 'tasks' test: ServiceNow project numbers or names, e.g. ['PRJ0011499']; [] = all
    // HR PMO scope (Richard Becker, HR PM list): only projects of THESE project managers, dated in the WINDOW.
    //   regular project: its Asana owner's email is in PM_EMAILS (either domain)
    //   tracker row:     ALWAYS in scope when active (the tracker is the HR portfolio) - no PM filter
    //   window:          start..due overlaps FROM..TO (no dates at all = included, logged)
    // [] = no PM filter. System property x_mig.asana.pm_emails (emails separated by ;) overrides PM_EMAILS.
    var PM_EMAILS = ['jennifer.angle@bsmhealth.org', 'jennifer.angle@mercy.com', 'carrie_lynn@bsmhealth.org', 'carrie_lynn@mercy.com',
                     'kamcclure@bsmhealth.org', 'kamcclure@mercy.com', 'kmcdearmon@mercy.com', 'lhayes@mercy.com', 'mcaldwell4@mercy.com',
                     'iwhitis@bsmhealth.org', 'iwhitis@mercy.com', 'awarfield@bsmhealth.org', 'awarfield@mercy.com',
                     'menims@bsmhealth.org', 'menims@mercy.com'];
    var PM_NAMES = ['angle', 'lynn', 'mcclure', 'mcdearmon', 'hayes', 'caldwell', 'whitis', 'warfield', 'trucksis'];   // last names
    var FROM = '2025-01-01', TO = '2099-12-31';
    // Asana projects ALWAYS in scope (when active), whoever owns them - confirmed by the HR PMO. Exact names.
    // System property x_mig.asana.include (names separated by ;) overrides this list.
    var INCLUDE = ['Project Warren'];
    var INCLUDE_COMPLETED = false;               // ✏️ true = also completed projects. A name starting "(Closed)" counts as completed.
    // =========================================================

    // Tracker rows whose detailed plan is a separate Asana project (system property x_mig.asana.plan_links,
    // "trackerRowGid:planProjectGid;..." - from asana_scope_links.js section C, checked by hand). With SOURCE 'both':
    //   projects: the plan project is NOT loaded as its own project (no double) - the tracker row is the project
    //   tasks:    the tracker row's work plan = its subtasks PLUS the plan project's tasks
    var PLAN = {}, IS_PLAN = {};
    (gs.getProperty('x_mig.asana.plan_links', '') + '').split(/\s*;\s*/).forEach(function (pair) {
        var x = pair.split(':');
        if (x.length == 2 && x[0] && x[1]) { (PLAN[x[0].trim()] = PLAN[x[0].trim()] || []).push(x[1].trim()); IS_PLAN[x[1].trim()] = true; }
    });

    // PILOT match: case, dashes (- vs en/em dash) and extra spaces do not matter; part of the name is enough
    function norm(x) { return String(x || '').toLowerCase().replace(/[\u2010-\u2015\-]/g, '-').replace(/\s+/g, ' ').trim(); }
    var PILOT_N = PILOT.map(norm);
    function inPilot(name) { var n = norm(name); return !PILOT_N.length || PILOT_N.some(function (x) { return n.indexOf(x) > -1; }); }

    var pmProp = (gs.getProperty('x_mig.asana.pm_emails', '') + '').trim();
    if (pmProp) PM_EMAILS = pmProp.toLowerCase().split(/\s*;\s*/).filter(function (x) { return x; });
    PM_EMAILS = PM_EMAILS.map(function (x) { return x.toLowerCase(); });
    function pmEmailOk(email) { return !PM_EMAILS.length || PM_EMAILS.indexOf(String(email || '').toLowerCase()) > -1; }
    function pmNameOk(text) {
        if (!PM_NAMES.length) return true;
        var words = String(text || '').toLowerCase().split(/[^a-z]+/);
        return PM_NAMES.some(function (n) { return words.indexOf(n) > -1; });
    }
    var noDates = 0, outOfWindow = 0, otherPm = 0;
    function inWindow(start, due) {
        if (!start && !due) { noDates++; return true; }
        var s0 = start || due, e0 = due || start;
        return !(e0 < FROM || s0 > TO);
    }

    var incProp = (gs.getProperty('x_mig.asana.include', '') + '').trim();
    if (incProp) INCLUDE = incProp.split(/\s*;\s*/).filter(function (x) { return x; });

    var BASE = 'https://app.asana.com/api/1.0';
    var FIELDS = 'gid,name,notes,num_subtasks,start_on,due_on,completed,assignee.name,assignee.email,parent.name,' +
                 'tags.name,followers.name,memberships.section.name,memberships.section.gid,memberships.project.gid,custom_fields.name,custom_fields.display_value';
    var PROJECT_FIELDS = 'gid,name,notes,start_on,due_on,completed,archived,owner.name,owner.email,team.name,' +
                         'current_status_update.status_type,custom_fields.name,custom_fields.display_value';

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
            // next page: same request (same opt_fields) + Asana's offset - never rely on next_page.uri keeping opt_fields
            url = page.next_page && page.next_page.offset ? path + (path.indexOf('?') > -1 ? '&' : '?') + 'offset=' + encodeURIComponent(page.next_page.offset) : null;
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
        // status: "PMO Status" (e.g. Project Warren: Not Started / In Progress / Complete) or "Task Status"
        var status = custom(s, 'PMO Status') || custom(s, 'Task Status') || custom(s, 'Project Status');
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
            'start date': s.start_on || custom(s, 'Start Date'),   // Asana start date, else the custom "Start Date" field
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
    // A whole Asana project plan under ServiceNow project projectGid: each SECTION (except "Untitled section") becomes a
    // task under the project, its tasks under it, then every level of subtasks. Parents are written before children.
    function loadPlan(planGid, projectGid, projectName) {
        var secs = {};
        all('/projects/' + planGid + '/sections?limit=100&opt_fields=gid,name').forEach(function (sec) {
            if (!sec.name || /^untitled section$/i.test(sec.name.trim())) return;
            secs[sec.gid] = sec.name.trim();
            insert({
                'correlation id': 'ASANA:' + sec.gid, 'parent correlation id': 'ASANA:' + projectGid,
                'project correlation id': 'ASANA:' + projectGid, 'task name': sec.name.trim(), 'name': sec.name.trim(),
                'section/column': sec.name.trim(), 'completed': 'false', 'parent task': projectName
            }, {});
            count++;
        });
        all('/projects/' + planGid + '/tasks?limit=100&opt_fields=' + FIELDS).forEach(function (t) {
            var secGid = '';
            (t.memberships || []).forEach(function (m) { if (m.project && m.project.gid == planGid && m.section && secs[m.section.gid]) secGid = m.section.gid; });
            insertTask(t, secGid || projectGid, secGid ? secs[secGid] : projectName, projectGid);
            if (t.num_subtasks) walk(t, projectGid);
        });
    }
    function walk(parent, projectGid) {          // every level of subtasks
        all('/tasks/' + parent.gid + '/subtasks?limit=100&opt_fields=' + FIELDS).forEach(function (s) {
            insertTask(s, parent.gid, parent.name, projectGid);
            if (s.num_subtasks) walk(s, projectGid);
        });
    }

    try {
        var tracker = all('/projects/' + gs.getProperty('x_mig.asana.project_gid') + '/tasks?limit=100&opt_fields=' + FIELDS);
        var withFields = tracker.filter(function (t) { return (t.custom_fields || []).length; }).length;
        import_log.info('Tracker rows read: ' + tracker.length + ' | with custom fields: ' + withFields + ' | script version 2026-11-24b');
        if (tracker.length && !withFields) import_log.error('Asana returned NO custom fields for the tracker rows - check the token (x_mig.asana.token) has access to the HR Project Portfolio 2026 project');

        if (MODE == 'projects') {
            var trackerGid = gs.getProperty('x_mig.asana.project_gid');
            var skipped = 0, linked = 0;
            (SOURCE == 'tracker' ? [] : all('/workspaces/' + WORKSPACE + '/projects?archived=false&limit=100&opt_fields=' + PROJECT_FIELDS)).forEach(function (p) {
                if (p.gid == trackerGid) return;                                           // the tracker list itself
                if (INCLUDE_TRACKER_ITEMS && IS_PLAN[p.gid]) { linked++; return; }         // plan of a tracker row: loaded under that row
                if (!inPilot(p.name)) return;
                if (TEAMS.length && (!p.team || TEAMS.indexOf(p.team.name) < 0)) return;
                var forced = INCLUDE.map(norm).indexOf(norm(p.name)) > -1;
                if (!forced && !pmEmailOk(p.owner ? p.owner.email : '') && !pmNameOk(custom(p, 'PM Assigned'))) {
                    otherPm++;
                    if (PILOT.length) import_log.warn('PILOT project skipped - owner ' + (p.owner ? p.owner.email : '(none)') + ' is not on the HR PM list (add it to INCLUDE if in scope): ' + p.name);
                    return;
                }
                if (!inWindow(p.start_on, p.due_on)) { outOfWindow++; return; }
                var status = p.current_status_update ? p.current_status_update.status_type : '';
                if (!INCLUDE_COMPLETED && (p.completed || status == 'complete' || /^\s*\(closed\)/i.test(p.name) ||
                    SKIP_STATUS.indexOf(custom(p, 'Project Status')) >= 0)) { skipped++; return; }  // not active
                insert({
                    'correlation id': 'ASANA:' + p.gid,
                    'name': p.name.trim(),
                    'team': p.team ? p.team.name : '',
                    'assignee': p.owner ? p.owner.name : '',
                    'assignee email': p.owner ? p.owner.email : '',
                    'start date': p.start_on,
                    'due date': p.due_on,
                    'notes': p.notes,
                    'parent task': ''
                }, p);
                count++;
            });
            if (INCLUDE_TRACKER_ITEMS) {
                tracker.forEach(function (t) {
                    if (!inPilot(t.name)) return;
                    // tracker rows = the HR portfolio itself: every active row is in scope, whoever the PM is (or none,
                    // e.g. the Ireland rows). The PM list applies to regular Asana projects only.
                    if (!inWindow(t.start_on, t.due_on)) { outOfWindow++; return; }
                    if (!INCLUDE_COMPLETED && (t.completed || /^\s*\(closed\)/i.test(t.name) || SKIP_STATUS.indexOf(custom(t, 'Project Status')) >= 0)) {
                        skipped++;
                        if (PILOT.length) import_log.warn('PILOT item found but not active (completed / status ' + custom(t, 'Project Status') + '): ' + t.name);
                        return;
                    }
                    insert({
                        'correlation id': 'ASANA:' + t.gid,
                        'name': t.name.trim(),
                        'section/column': section(t),
                        'entity/organization': custom(t, 'Organization') || custom(t, 'Entity/Organization'),   // Asana field is named "Organization"
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
            }
            if (PILOT.length && !count) import_log.warn('No PILOT name matched. Tracker rows: ' + tracker.map(function (t) { return t.name; }).join(' | ').substring(0, 3000));
            import_log.info('Asana scope: other PM ' + otherPm + ' | outside ' + FROM + '..' + TO + ' ' + outOfWindow + ' | loaded with no dates ' + noDates);
            import_log.info('Asana projects skipped as not active: ' + skipped + ' | plan projects loaded under their tracker row: ' + linked);
        } else {
            // only work plans of projects already migrated (pm_project.correlation_id = ASANA:<gid>)
            var migrated = [];
            var pr = new GlideRecord('pm_project');
            pr.addQuery('correlation_id', 'STARTSWITH', 'ASANA:');
            pr.query();
            while (pr.next()) {
                if (ONLY.length && ONLY.indexOf(pr.getValue('number')) < 0 && ONLY.indexOf(pr.getValue('short_description')) < 0) continue;
                migrated.push({ gid: pr.getValue('correlation_id').substring(6), name: pr.getValue('short_description') });
            }
            if (!migrated.length) { import_log.warn('No Asana projects in pm_project yet - load projects first'); return; }

            var trackerGids = tracker.map(function (t) { return t.gid; });
            migrated.forEach(function (m) {
                if (trackerGids.indexOf(m.gid) >= 0) {
                    walk(m, m.gid);                                  // tracker item: its subtasks
                    (PLAN[m.gid] || []).forEach(function (planGid) { loadPlan(planGid, m.gid, m.name); });  // + linked plan project
                } else if (SOURCE != 'tracker') {
                    loadPlan(m.gid, m.gid, m.name);                  // real Asana project: sections, tasks, subtasks
                }
            });
        }
    } catch (err) {
        import_log.error(String(err));
        return;
    }
    import_log.info('Asana ' + MODE + ' rows loaded: ' + count);
})(import_set_table, data_source, import_log, last_success_import_time);
