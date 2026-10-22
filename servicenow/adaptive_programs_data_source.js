// Data Source: "Adaptive Programs - API"   Type: Custom (Load by Script)
// Import set table: u_import_adaptive_programs (staging_csv/u_import_adaptive_programs.csv)
// Loads ACTIVE Adaptive programs -> pm_program (transform: program_transform.js).
// Run BEFORE the projects load, so each project can be linked to its program.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var STATES = ['Active'];           // Adaptive program states to load
    var EXCLUDE = ['Test Program'];    // exact names to leave out
    var MAP = {                        // column LABEL : Adaptive Program field
        'Correlation ID':  'id',
        'Name':            'Name',
        'Description':     'Description',
        'Manager Email':   'Manager.Email',
        'Start Date':      'StartDate',
        'Due Date':        'DueDate',
        'State':           'State'
    };
    // =========================================================

    var table = data_source.getValue('import_set_table_name');
    var col = {};
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'STARTSWITH', 'u_');
    d.query();
    while (d.next()) col[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');
    var missing = Object.keys(MAP).filter(function (l) { return !col[l.toLowerCase()]; });
    if (missing.length) { import_log.error('Missing columns in ' + table + ' (create it from the CSV): ' + missing.join(', ')); return; }

    function get(rec, path) {
        var v = rec;
        path.split('.').forEach(function (p) { v = (v === null || v === undefined) ? null : v[p]; });
        if (v === null || v === undefined) return '';
        if (typeof v == 'object') return v.id ? decodeURIComponent(String(v.id).split('/').pop()) : '';
        var s = String(v);
        return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.substring(0, 10) : s;
    }

    var select = [];
    for (var l in MAP) if (MAP[l] != 'id') select.push(MAP[l]);
    var q = 'SELECT ' + select.join(', ') + ' FROM Program';
    var paging = { from: 0, limit: 100 }, count = 0, skipped = 0;
    while (true) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
        r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ q: q, paging: paging }));
        var res = r.execute();
        if (res.getStatusCode() != 200) { import_log.error('Adaptive ' + res.getStatusCode() + ': ' + res.getBody() + ' -- query: ' + q); return; }
        var body = JSON.parse(res.getBody());
        body.entities.forEach(function (e) {
            if (STATES.indexOf(get(e, 'State')) < 0 || EXCLUDE.indexOf(String(e.Name).trim()) >= 0) { skipped++; return; }
            var row = {};
            for (var label in MAP) row[col[label.toLowerCase()]] = MAP[label] == 'id' ? 'ADAPTIVE:' + e.id : get(e, MAP[label]);
            import_set_table.insert(row);
            count++;
        });
        if (!body.paging || !body.paging.hasMore) break;
        paging = body.paging;
    }
    import_log.info('Adaptive programs loaded: ' + count + ' (skipped: ' + skipped + ' not active or excluded)');
})(import_set_table, data_source, import_log, last_success_import_time);
