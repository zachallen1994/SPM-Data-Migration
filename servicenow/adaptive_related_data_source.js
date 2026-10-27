// Data Source template for Adaptive records that belong to a project
// (tasks, milestones, issues, risks, lessons learned, resource links, timesheets).
// Type: Custom (Load by Script). One Data Source per entity; copy this script and change only the CONFIG.
//
// It loads ONLY records of projects already migrated (pm_project.correlation_id starts with
// ADAPTIVE:/Project/), so the pilot and the full load follow whatever projects are in ServiceNow.
//
// Every staging table needs these columns (add them like "Correlation ID" on the project table):
//   Correlation ID, Parent Correlation ID, Project Correlation ID   (String, Max length 100 - NOT the default 40)
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var ENTITY = 'Task';            // Adaptive entity, e.g. Task | Milestone | Issue | Risk | C_PMOLessonsLearned
    var PROJECT_FIELD = 'Project';  // field on ENTITY that points at its project (Lessons: C_RelatedWorkItem;
                                    // Resources: WorkItem)
    var PARENT_TABLES = ['pm_project', 'dmn_demand'];   // records already in ServiceNow that PROJECT_FIELD may point at
                                          // (Resources: ['pm_project', 'dmn_demand', 'pm_project_task'])
                                          // (Tasks / Milestones: ['pm_project'] - demands have no work plan)
    var ONLY = [];                  // test / batch: project or demand numbers or names, e.g. ['PRJ0010675']; [] = all
    var PARENT_STATES = ['Active', 'On Hold'];   // only records of projects / demands in these Adaptive States
                                                 // (same as STATES in the projects data source); [] = no check

    // Run settings without editing this script (DEV / TEST / PROD): system property x_mig.adaptive.scope
    //   blank    = use ONLY above
    //   'all'    = every migrated project / demand
    //   'latest' = only the projects / demands of the LATEST Adaptive projects load (the current batch)
    //   'PRJ0011403; PRJ0011404' = these numbers or names (separated by ;)
    var SCOPE = (gs.getProperty('x_mig.adaptive.scope', '') + '').trim(), LATEST = null;
    if (/^all$/i.test(SCOPE)) ONLY = [];
    else if (/^latest$/i.test(SCOPE)) {
        LATEST = {};
        var ls = new GlideRecord('sys_import_set');
        ls.addQuery('table_name', 'u_import_adaptive_projects');
        ls.orderByDesc('sys_created_on');
        ls.setLimit(1);
        ls.query();
        if (ls.next()) {
            var lr = new GlideRecord('u_import_adaptive_projects');
            lr.addQuery('sys_import_set', ls.getUniqueValue());
            lr.query();
            while (lr.next()) if (lr.getValue('u_correlation_id')) LATEST[lr.getValue('u_correlation_id')] = true;
        }
        import_log.info('Scope = latest projects load: ' + Object.keys(LATEST).length + ' projects / demands');
    } else if (SCOPE) ONLY = SCOPE.split(/\s*;\s*/).filter(function (x) { return x; });

    // Column LABEL in the staging table : Adaptive field.
    //   '@Field'  -> "ADAPTIVE:" + that reference's id   (links to parents)
    //   '=value'  -> a fixed value
    var MAP = {
        'Correlation ID':         '@id',
        'Parent Correlation ID':  '@Parent',
        'Project Correlation ID': '@Project',
        'Name':                   'Name',
        'Description':            'Description',
        'Start Date':             'StartDate',
        'Due Date':               'DueDate',
        'Actual Start Date':      'ActualStartDate',
        'Actual Effort':          'ActualEffort',     // hours
        'Actual End Date':        'ActualEndDate',
        '% Complete':             'PercentCompleted',
        'State':                  'State',
        'Status':                 'TrackStatus',      // Adaptive Task "Status" (e.g. On Track); comes back as a name
        'Owner Email':            'Manager.Email',    // Adaptive "Owner" -> assigned_to
        'Milestone':              '=false'      // Milestone Data Source: '=true'
    };
    // Presets (replace MAP for that entity; confirm names with the Discovery output):
    //  Milestone:  same as Task, with ENTITY = 'Milestone' and 'Milestone': '=true'
    //  Lessons:    ENTITY = 'C_PMOLessonsLearned', PROJECT_FIELD = 'C_RelatedWorkItem', MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@C_RelatedWorkItem', 'Name':'Name',
    //                'Lesson Type':'C_LessonType', 'Topic':'C_Topic', 'Lesson':'C_Lesson', 'ID':'SYSID' }
    //  Resources:  ENTITY = 'RegularResourceLink', PROJECT_FIELD = 'WorkItem',
    //              PARENT_TABLES = ['pm_project', 'dmn_demand', 'pm_project_task'], MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@WorkItem', 'Resource Email':'Resource.Email',
    //                'Start Date':'StartDate', 'End Date':'InactiveDate' }   -> resource_assignment_transform.js
    //  Issues:     ENTITY = 'Issue', PROJECT_FIELD = 'PlannedFor', MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@PlannedFor', 'Title':'Title', 'State':'State',
    //                'Current Status':'C_IssueCurrentStatus', 'Priority':'C_IssuePriority', 'Category':'C_IssueCategory',
    //                'Open Date':'C_OpenDate', 'Opening Date':'OpeningDate', 'Deadline':'DueDate',
    //                'Date Resolved':'ResolvedDate', 'Resolution':'ResolutionDetails', 'Assigned To Email':'AssignedTo.Email',
    //                'Description':'C_Description', 'Reason for Change':'Description', 'Status Update':'C_StatusUpdate' }
    //  Risks:      ENTITY = 'Risk', PROJECT_FIELD = 'PlannedFor', MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@PlannedFor', 'Title':'Title', 'State':'State',
    //                'Risk Impact':'C_RiskImpact', 'Priority':'C_Priority', 'Impact Rating':'C_ImpactRating',
    //                'Category':'C_Category', 'Mitigation Plan':'Justification', 'Status':'C_Status',
    //                'Update Notes':'C_UpdateNotes', 'Deadline':'DueDate', 'Assigned To Email':'AssignedTo.Email',
    //                'Reason for Change':'Description', 'Resolution':'ResolutionDetails', 'Date Resolved':'ResolvedDate' }
    //  Status history: ENTITY = 'C_StatusHistory', PROJECT_FIELD = 'C_RelatedProject', MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@C_RelatedProject', 'Updated On':'C_UpdatedOn',
    //                'Health':'C_Health', 'Schedule Health':'C_ScheduleHealth', 'Budget Health':'C_BudgetHealth',
    //                'Scope Health':'C_ScopeHealth', 'Resource Health':'C_ResourceHealth', 'Risk Health':'C_RiskHealth',
    //                'Status Update':'C_StatusUpdate', 'Status Update 1':'C_StatusUpdate1', 'Updated By':'C_UpdatedBy' }
    // =========================================================

    var table = data_source.getValue('import_set_table_name');
    var colByLabel = {};
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'STARTSWITH', 'u_');
    d.query();
    var colNames = {};
    while (d.next()) {
        colByLabel[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');
        colNames[d.getValue('element')] = true;
    }
    function key(label) { return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
    for (var lb in MAP) {                         // columns this script created itself: match on the name too
        if (!colByLabel[lb.toLowerCase()] && colNames['u_' + key(lb)]) colByLabel[lb.toLowerCase()] = 'u_' + key(lb);
    }
    for (var label in MAP) {
        if (Object.keys(colNames).length && !colByLabel[label.toLowerCase()]) import_log.warn('No column labelled "' + label + '" in ' + table + ' - skipped');
    }
    if (!Object.keys(colNames).length) {
        // New staging table: one SETUP row makes ServiceNow create the table with a column per MAP label.
        // Stop there - the id columns are created 40 long and must be 100 before the real load.
        var setup = {};
        for (var sl in MAP) setup[key(sl)] = 'SETUP ROW - DELETE ME';
        import_set_table.insert(setup);
        import_log.error('Created staging table ' + table + '. Before the real load: set Max length = 100 on the ' +
            'Correlation ID columns, delete the SETUP row, then run this data source again.');
        return;
    }
    // Adaptive ids are up to 47 characters ("/Project/{AA5A7EA6-...}"), 56 with "ADAPTIVE:". A shorter column
    // cuts them off and nothing can be matched afterwards, so stop here instead.
    d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'IN', [colByLabel['correlation id'], colByLabel['parent correlation id'], colByLabel['project correlation id']].join(','));
    d.query();
    var tooShort = [];
    while (d.next()) if (parseInt(d.getValue('max_length'), 10) < 100) tooShort.push(d.getValue('column_label') + ' (' + d.getValue('max_length') + ')');
    if (tooShort.length) { import_log.error('Set Max length to 100 on ' + table + ': ' + tooShort.join(', ')); return; }

    function clean(v) {
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) return v.map(clean).filter(function (x) { return x; }).join(', ');
        if (typeof v == 'object') {
            if (v.value !== undefined && v.currency !== undefined) return String(v.value);   // Adaptive money -> number
            if (v.value !== undefined && v.unit) {                          // Adaptive duration -> hours
                var n = parseFloat(v.value) || 0, u = String(v.unit).toLowerCase();
                return String(u.indexOf('day') == 0 ? n * 8 : u.indexOf('min') == 0 ? n / 60 : n);
            }
            if (v.DisplayName) return String(v.DisplayName);
            if (v.Name) return String(v.Name);
            return v.id ? decodeURIComponent(String(v.id).split('/').slice(2).join('/')) : '';
        }
        var s = String(v);
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 10);
        return s.replace(/(^|[;,]\s*)\/C?_?[A-Za-z_]+\//g, '$1');
    }
    function get(rec, path) {
        var v = rec;
        path.split('.').forEach(function (p) { v = (v === null || v === undefined) ? null : v[p]; });
        return v;
    }
    function value(e, spec) {
        if (spec.charAt(0) == '=') return spec.substring(1);
        if (spec.charAt(0) == '@') {
            var ref = spec == '@id' ? e.id : get(e, spec.substring(1));
            var id = (ref && typeof ref == 'object') ? ref.id : ref;
            return id ? 'ADAPTIVE:' + id : '';
        }
        return clean(get(e, spec));
    }

    // Fields to SELECT
    var select = [];
    for (var l in MAP) {
        var s = MAP[l];
        if (s == '@id' || s.charAt(0) == '=') continue;
        s = s.replace('@', '');
        if (select.indexOf(s) < 0) select.push(s);
    }

    // Parent records already in ServiceNow (projects; for resources also tasks)
    var projects = [];
    PARENT_TABLES.forEach(function (t) {
        var p = new GlideRecord(t);
        p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
        p.query();
        while (p.next()) {
            if (LATEST && !LATEST[t == 'pm_project_task' ? p.top_task.correlation_id + '' : p.getValue('correlation_id')]) continue;
            if (ONLY.length) {                       // a task counts when its project is in ONLY
                var own = t == 'pm_project_task' ? [p.top_task.number + '', p.top_task.short_description + '']
                                                 : [p.getValue('number'), p.getValue('short_description')];
                if (ONLY.indexOf(own[0]) < 0 && ONLY.indexOf(own[1]) < 0) continue;
            }
            projects.push(p.getValue('correlation_id').replace('ADAPTIVE:', ''));
        }
    });
    if (!projects.length) { import_log.warn('No Adaptive records in ' + PARENT_TABLES.join(', ') + (ONLY.length ? ' for ONLY ' + ONLY.join(', ') : ' yet - load those first')); return; }
    import_log.info('Parents to load for: ' + projects.length + (ONLY.length ? ' (ONLY ' + ONLY.join(', ') + ')' : ' (all)'));

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

    // Keep only projects / demands whose State in Adaptive is in PARENT_STATES (closed or cancelled ones are
    // skipped even if they are in ServiceNow). Task parents (Resources) are kept: their project was checked.
    if (PARENT_STATES.length) {
        var stateOf = {}, sp = { from: 0, limit: 100 };
        try {
            while (true) {
                var sb = post({ q: 'SELECT State FROM Project', paging: sp });
                sb.entities.forEach(function (e) { stateOf[e.id] = clean(e.State); });
                if (!sb.paging || !sb.paging.hasMore) break;
                sp = sb.paging;
            }
        } catch (err) { import_log.error(String(err) + ' -- reading Adaptive project states'); return; }
        var skippedParents = {};
        projects = projects.filter(function (id) {
            if (id.indexOf('/Project/') != 0) return true;
            var st = stateOf[id] || '(not found)';
            if (PARENT_STATES.indexOf(st) >= 0) return true;
            skippedParents[st] = (skippedParents[st] || 0) + 1;
            return false;
        });
        import_log.info('Parents skipped by Adaptive State: ' + JSON.stringify(skippedParents));
        if (!projects.length) { import_log.warn('No parents left in PARENT_STATES ' + PARENT_STATES.join(', ')); return; }
    }

    var count = 0, notOurs = 0, notOursExample = '', pending = [];
    if (select.indexOf(PROJECT_FIELD) < 0) select.push(PROJECT_FIELD);
    for (var i = 0; i < projects.length; i += 20) {              // 20 projects per query
        var batch = projects.slice(i, i + 20);
        var where = batch.map(function (id) { return PROJECT_FIELD + " = '" + id + "'"; }).join(' OR ');
        var q = 'SELECT ' + select.join(', ') + ' FROM ' + ENTITY + ' WHERE ' + where;
        var paging = { from: 0, limit: 100 };
        while (true) {
            var body;
            try { body = post({ q: q, paging: paging }); } catch (err) { import_log.error(String(err) + ' -- query: ' + q); return; }
            body.entities.forEach(function (e) {
                // keep only records that really point at one of these parents (guards against a WHERE that
                // Adaptive does not apply, e.g. on a custom reference field)
                var ref = get(e, PROJECT_FIELD), refId = ref && typeof ref == 'object' ? ref.id : ref;
                if (batch.indexOf(refId) < 0) { notOurs++; if (!notOursExample) notOursExample = String(refId); return; }
                var row = {};
                for (var label in MAP) {
                    var col = colByLabel[label.toLowerCase()];
                    if (col) row[col] = value(e, MAP[label]);
                }
                pending.push({ id: e.id, parent: (get(e, 'Parent') || {}).id || '', row: row });
            });
            if (!body.paging || !body.paging.hasMore) break;
            paging = body.paging;
        }
        // Parents before children (tasks): the transform then finds every parent task on the FIRST run
        var byId = {};
        pending.forEach(function (r) { byId[r.id] = r; });
        function depth(r) {
            var d = 0;
            while (r && byId[r.parent] && d < 50) { r = byId[r.parent]; d++; }
            return d;
        }
        pending.forEach(function (r, k) { r.d = depth(r); r.k = k; });
        pending.sort(function (a, b) { return a.d - b.d || a.k - b.k; });
        pending.forEach(function (r) { import_set_table.insert(r.row); count++; });
        pending = [];
    }
    import_log.info('Adaptive ' + ENTITY + ' rows loaded: ' + count + ' (for ' + projects.length + ' projects)' +
        (notOurs ? '; ' + notOurs + ' returned by Adaptive but for another record (skipped), e.g. ' + PROJECT_FIELD + ' = ' + notOursExample : ''));
})(import_set_table, data_source, import_log, last_success_import_time);
