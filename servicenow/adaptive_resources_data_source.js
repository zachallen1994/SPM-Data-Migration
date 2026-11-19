// Data Source: "Adaptive Resource - API"   Type: Custom (Load by Script)
// Import set table: u_import_adaptive_resources   Transform: resource_assignment_transform.js
// Every Adaptive resource link of the migrated projects AND their project tasks -> one resource assignment each
// (project assignments + task assignments, as in Adaptive's Resource Planning View).
// Built from adaptive_related_data_source.js with the CONFIG filled in. Paste the whole file.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG (filled in - nothing to edit) =======================
    var ENTITY = 'RegularResourceLink';            // Adaptive resource link = a person on a project or a task
    var PROJECT_FIELD = 'WorkItem';                // the project or task the person is on
    var PARENT_TABLES = ['pm_project', 'pm_project_task'];   // project AND task assignments (as in Adaptive)
    var TASK_RESOURCES = false;
    var ONLY = [];                                 // test: project numbers, e.g. ['PRJ0012237']; [] = all (or use the property)
    var SINCE_FIELD = '', SINCE = '';
    var PARENT_STATES = ['Active', 'On Hold'];

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

    // Column LABEL in the staging table u_import_adaptive_resources : Adaptive field
    var MAP = {
        'Correlation ID':         '@id',
        'Project Correlation ID': '@WorkItem',     // the project OR the task
        'Resource Email':         'Resource.Email',
        'Resource Name':          'Resource.Name',
        'Start Date':             'StartDate',
        'End Date':               'InactiveDate',
        'Total Assignment':       'TotalAssignment',
        'Work':                   'Work',
        'Units':                  'Units',
        'Added On':               'CreatedOn'
    };
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

    var count = 0, notOurs = 0, notOursExample = '', pending = [], beforeSince = 0, sinceOdd = '';
    if (select.indexOf(PROJECT_FIELD) < 0) select.push(PROJECT_FIELD);
    if (SINCE_FIELD && SINCE && select.indexOf(SINCE_FIELD) < 0) select.push(SINCE_FIELD);
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
                if (SINCE_FIELD && SINCE) {
                    var dt = clean(get(e, SINCE_FIELD));                    // "2024-10-03T00:00:00" -> "2024-10-03"
                    if (dt && !/^\d{4}-\d{2}-\d{2}$/.test(dt)) { if (!sinceOdd) sinceOdd = dt; }   // unknown format: kept, logged
                    else if (!dt || dt < SINCE) { beforeSince++; return; }   // blank = old
                }
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
        // The task's people (Adaptive "Resources" column): one query per 20 tasks (one per task if a batch fails),
        // emails joined with ","
        var resCol = colByLabel['resource emails'];
        if (TASK_RESOURCES && ENTITY == 'Task' && resCol && pending.length) {
            var byTask = {}, resErr = '';
            var fetchRes = function (ids) {
                var w = ids.map(function (id) { return "WorkItem = '" + id + "'"; }).join(' OR ');
                var rp = { from: 0, limit: 100 };
                while (true) {
                    var rb = post({ q: 'SELECT WorkItem, Resource.Email FROM RegularResourceLink WHERE ' + w, paging: rp });
                    (rb.entities || []).forEach(function (l) {
                        var tid = l.WorkItem && l.WorkItem.id ? l.WorkItem.id : l.WorkItem;
                        var em = l.Resource && l.Resource.Email;
                        if (!tid || !em || ids.indexOf(tid) < 0) return;
                        byTask[tid] = byTask[tid] || [];
                        if (byTask[tid].indexOf(String(em).toLowerCase()) < 0) byTask[tid].push(String(em).toLowerCase());
                    });
                    if (!rb.paging || !rb.paging.hasMore) break;
                    rp = rb.paging;
                }
            };
            for (var x = 0; x < pending.length; x += 20) {
                var ids = pending.slice(x, x + 20).map(function (r) { return r.id; });
                try { fetchRes(ids); }
                catch (err) {
                    ids.forEach(function (one) { try { fetchRes([one]); } catch (e2) { resErr = String(e2); } });
                }
            }
            var withRes = 0;
            pending.forEach(function (r) { if (byTask[r.id]) { r.row[resCol] = byTask[r.id].join(','); withRes++; } });
            import_log.info('Task resources: ' + withRes + ' of ' + pending.length + ' tasks have resources' + (resErr ? ' - last error: ' + resErr : ''));
        } else if (TASK_RESOURCES && ENTITY == 'Task' && !resCol && pending.length) {
            import_log.warn('No column labelled "Resource Emails" - task resources not loaded (add it: String, 4000)');
        }
        pending.forEach(function (r) { import_set_table.insert(r.row); count++; });
        pending = [];
    }
    import_log.info('Adaptive ' + ENTITY + ' rows loaded: ' + count + ' (for ' + projects.length + ' projects)' +
        (notOurs ? '; ' + notOurs + ' returned by Adaptive but for another record (skipped), e.g. ' + PROJECT_FIELD + ' = ' + notOursExample : '') +
        (SINCE_FIELD && SINCE ? '; ' + beforeSince + ' dated before ' + SINCE + ' (' + SINCE_FIELD + ') skipped' +
            (sinceOdd ? ' - WARNING: some ' + SINCE_FIELD + ' values are not dates (e.g. "' + sinceOdd + '") and were kept' : '') : ''));
})(import_set_table, data_source, import_log, last_success_import_time);
