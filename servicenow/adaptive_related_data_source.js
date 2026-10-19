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
    var PARENT_TABLES = ['pm_project'];   // records already in ServiceNow that PROJECT_FIELD may point at
                                          // (Resources: ['pm_project', 'pm_project_task'])

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
        'Milestone':              '=false'      // Milestone Data Source: '=true'
    };
    // Presets (replace MAP for that entity; confirm names with the Discovery output):
    //  Milestone:  same as Task, with ENTITY = 'Milestone' and 'Milestone': '=true'
    //  Lessons:    ENTITY = 'C_PMOLessonsLearned', PROJECT_FIELD = 'C_RelatedWorkItem', MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@C_RelatedWorkItem', 'Name':'Name',
    //                'Lesson Type':'C_LessonType', 'Topic':'C_Topic', 'Lesson':'C_Lesson', 'ID':'SYSID' }
    //  Resources:  ENTITY = 'RegularResourceLink', PROJECT_FIELD = 'WorkItem',
    //              PARENT_TABLES = ['pm_project', 'pm_project_task'], MAP =
    //              { 'Correlation ID':'@id', 'Project Correlation ID':'@WorkItem', 'Resource Email':'Resource.Email' }
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
    //                'Update Notes':'C_UpdateNotes', 'Deadline':'DueDate', 'Assigned To Email':'AssignedTo.Email' }
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
    while (d.next()) colByLabel[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');
    for (var label in MAP) {
        if (!colByLabel[label.toLowerCase()]) import_log.warn('No column labelled "' + label + '" in ' + table + ' - skipped');
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
            return v.id ? decodeURIComponent(String(v.id).split('/').pop()) : '';
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
        while (p.next()) projects.push(p.getValue('correlation_id').replace('ADAPTIVE:', ''));
    });
    if (!projects.length) { import_log.warn('No Adaptive records in ' + PARENT_TABLES.join(', ') + ' yet - load those first'); return; }

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

    var count = 0;
    for (var i = 0; i < projects.length; i += 20) {              // 20 projects per query
        var where = projects.slice(i, i + 20).map(function (id) { return PROJECT_FIELD + " = '" + id + "'"; }).join(' OR ');
        var q = 'SELECT ' + select.join(', ') + ' FROM ' + ENTITY + ' WHERE ' + where;
        var paging = { from: 0, limit: 100 };
        while (true) {
            var body;
            try { body = post({ q: q, paging: paging }); } catch (err) { import_log.error(String(err) + ' -- query: ' + q); return; }
            body.entities.forEach(function (e) {
                var row = {};
                for (var label in MAP) {
                    var col = colByLabel[label.toLowerCase()];
                    if (col) row[col] = value(e, MAP[label]);
                }
                import_set_table.insert(row);
                count++;
            });
            if (!body.paging || !body.paging.hasMore) break;
            paging = body.paging;
        }
    }
    import_log.info('Adaptive ' + ENTITY + ' rows loaded: ' + count + ' (for ' + projects.length + ' projects)');
})(import_set_table, data_source, import_log, last_success_import_time);
