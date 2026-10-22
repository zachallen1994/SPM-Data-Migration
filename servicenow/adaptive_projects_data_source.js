// Data Source: "Adaptive Projects - API"   Type: Custom (Load by Script)
// Import set table: u_import_adaptive_projects (built from the Adaptive CSV export)
// Fills the same columns the CSV did, so the existing transform map works unchanged.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ✏️ Pilot projects: exact Adaptive names. [] = every project (not yet!).
    var PILOT = ['LAB-LIMA-SIemens Chemstat Implementation',
                 '26137-00000-PAD X-ray Epic Department Build'];

    // Column LABEL in the import table  :  Adaptive API field
    var MAP = {
        'Correlation ID':       'id',
        'Name':                 'Name',
        'Project Description':  'C_ProjectDescription',
        'Manager':              'ProjectManager.DisplayName',
        'Business Sponsor':     'C_BusinessSponser',        // spelled "Sponser" in Adaptive
        'CN#':                  'C_CN',
        'Dept # for Expense':   'C_DeptforExpense',
        'Region':               'C_Region',
        'Next Go-Live Date':    'C_NextGoLiveDate',
        'Planned Finish':       'C_PlannedFinish',
        'Project Funding Type': 'C_ProjectFundingType',
        'Funding Type':         'ExpenseType',
        'State':                'State',
        'Phase':                'Phase',
        'Budget Health':        'C_BudgetHealth',
        'Health':               'C_Health',
        'Resource Health':      'C_ResourceHealth',
        'Risk Health':          'C_RiskHealth',
        'Schedule Health':      'C_ScheduleHealth',
        'Scope Health':         'C_ScopeHealth',
        'Update Notes':         'C_UpdateNotes',
        'Estimate Type':        'C_EstimateType',
        'Request Received':     'C_RequestReceived',
        'Request Assigned':     'C_RequestAssigned',
        'Estimate Complete':    'C_EstimateComplete',
        'Ready For Delivery':   'C_ReadyForDelivery',
        'Project Assigned':     'C_ProjectAssigned',
        'Business Category':    'C_BusinessCategory',
        'Total Budget':         'C_TotalBudget',
        'Opex Budget':          'C_OpexBudgetNonLabor',
        'Capex Budget':         'C_CapexBudgetNonLabor',
        'Total Actual':         'C_TotalActual',
        'Operating Actuals':    'C_OperatingActuals',
        'Capital Actuals':      'C_CapitalActuals',
        'Portfolio Phase':      'C_PortfolioPhase',         // decides Demand vs Project (demand_project_split.js)
        'Project Pool':         'C_ProjectPool',            // Yes / No
        'Groups':               'C_Groups'                  // multi-pick list (C_WorkItemGroups), comma separated
    };
    // The transform map reads start_date from the "Project Assigned" column. Agreed rule:
    // use Adaptive's Start Date (StartDate); fall back to Project Assigned when it is blank.
    var START_DATE_COLUMN = 'Project Assigned';

    // Only these Adaptive Project Types (field ProjectType) are migrated. Values seen on active projects:
    // Project 307, Merger & Acquisition Work-stream 65, Security Investment 37, Internal IT Projects 30,
    // Security Investment Programs 24, Customer Projects 19, Non Project Work 11, Construction 7,
    // Operational Projects 7, Merger & Acquisitions Program 4, Nordic Clarity SOW's 1, blank 2.
    var PROJECT_TYPES = ['Project'];   // ✏️ add 'Construction' if that group says yes

    // ---------------- nothing to edit below ----------------

    // Column label -> column name, read from the import table itself
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
            if (v.DisplayName) return String(v.DisplayName);
            if (v.Name) return String(v.Name);
            return v.id ? decodeURIComponent(String(v.id).split('/').pop()) : '';   // "/State/Active" -> "Active"
        }
        var s = String(v);
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 10);              // keep the date only
        // Multi-pick lists come back as "/C_WorkItemRegion/PAD (Paducah)" -> "PAD (Paducah)"
        return s.replace(/(^|[;,]\s*)\/C?_?[A-Za-z_]+\//g, '$1');
    }
    function val(rec, path) {
        var v = rec;
        path.split('.').forEach(function (p) { v = (v === null || v === undefined) ? null : v[p]; });
        return clean(v);
    }

    var select = ['StartDate', 'ProjectType'];
    for (var l in MAP) if (MAP[l] != 'id' && select.indexOf(MAP[l]) < 0) select.push(MAP[l]);
    var where = PILOT.map(function (n) { return "Name = '" + n.replace(/'/g, "''") + "'"; }).join(' OR ');
    var q = 'SELECT ' + select.join(', ') + ' FROM Project' + (where ? ' WHERE ' + where : '');

    var paging = { from: 0, limit: 100 };
    var count = 0, skippedType = 0;
    while (true) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
        r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ q: q, paging: paging }));
        var res = r.execute();
        if (res.getStatusCode() != 200) {
            import_log.error('Adaptive error ' + res.getStatusCode() + ': ' + res.getBody());
            return;
        }
        var body = JSON.parse(res.getBody());
        body.entities.forEach(function (e) {
            var type = e.ProjectType && e.ProjectType.id ? decodeURIComponent(String(e.ProjectType.id).split('/').pop()) : '';
            if (PROJECT_TYPES.length && PROJECT_TYPES.indexOf(type) < 0) { skippedType++; return; }
            var row = {};
            for (var label in MAP) {
                var colName = colByLabel[label.toLowerCase()];
                if (!colName) continue;
                row[colName] = (MAP[label] == 'id') ? 'ADAPTIVE:' + e.id : val(e, MAP[label]);
            }
            var startCol = colByLabel[START_DATE_COLUMN.toLowerCase()];
            if (startCol && val(e, 'StartDate')) row[startCol] = val(e, 'StartDate');
            import_set_table.insert(row);
            count++;
        });
        if (!body.paging || !body.paging.hasMore) break;
        paging = body.paging;
    }
    import_log.info('Adaptive projects loaded: ' + count + ' (skipped, other project type: ' + skippedType + ')');
})(import_set_table, data_source, import_log, last_success_import_time);
