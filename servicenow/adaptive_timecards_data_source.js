// Data Source: "Adaptive Time Cards - API"   Type: Custom (Load by Script)
// Import set table: u_import_adaptive_time_cards (created by this script on its first run - see below)
// Adaptive Timesheet = one entry per person per day per work item. ServiceNow time_card = one card per person
// per task per WEEK, with Sunday..Saturday hours. This script adds the daily entries up into weekly rows, so the
// transform (timecard_transform.js) creates one card per row and re-runs replace the hours instead of adding.
// Only entries of Adaptive projects and demands already migrated are loaded. Demand time rolls up to the demand
// (demand tasks are not migrated); project time goes to the project task if migrated, else to the project.
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    // ======================= CONFIG ✏️ =======================
    var STATES = [];              // Adaptive timesheet states to load, e.g. ['Approved']; [] = every state
    var WEEK_START = 'sunday';    // the day a ServiceNow time card week starts on (look at an existing card)
    // =========================================================

    var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var LABELS = ['Task Correlation ID', 'Project Correlation ID', 'Resource Email', 'Week Starts On',
                  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Total'];

    // Staging columns by label (or by the name this script gave them)
    var table = data_source.getValue('import_set_table_name');
    var col = {}, names = {};
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', 'STARTSWITH', 'u_');
    d.query();
    while (d.next()) { col[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element'); names[d.getValue('element')] = true; }
    function key(label) { return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
    LABELS.forEach(function (l) { if (!col[l.toLowerCase()] && names['u_' + key(l)]) col[l.toLowerCase()] = 'u_' + key(l); });
    if (!Object.keys(names).length) {                         // new table: one SETUP row creates it, then stop
        var setup = {};
        LABELS.forEach(function (l) { setup[key(l)] = 'SETUP ROW - DELETE ME'; });
        import_set_table.insert(setup);
        import_log.error('Created staging table ' + table + '. Set Max length = 100 on Task Correlation ID and ' +
            'Project Correlation ID, delete the SETUP row, then run this data source again.');
        return;
    }
    var missing = LABELS.filter(function (l) { return !col[l.toLowerCase()]; });
    if (missing.length) { import_log.error('Missing columns in ' + table + ': ' + missing.join(', ')); return; }

    // Migrated Adaptive projects AND demands (time is booked on the project/demand or a migrated project task)
    var projects = [], isDemand = {}, migratedTask = {};
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var p = new GlideRecord(t);
        p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
        p.query();
        while (p.next()) {
            var id = p.getValue('correlation_id').replace('ADAPTIVE:', '');
            projects.push(id);
            if (t == 'dmn_demand') isDemand[id] = true;
        }
    });
    var pt = new GlideRecord('pm_project_task');
    pt.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
    pt.query();
    while (pt.next()) migratedTask[pt.getValue('correlation_id').replace('ADAPTIVE:', '')] = true;
    if (!projects.length) { import_log.warn('No Adaptive projects or demands in ServiceNow yet - load those first'); return; }

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
    function hours(dur) {                                    // Adaptive duration {value, unit} -> hours
        if (!dur || dur.value === undefined) return 0;
        var n = parseFloat(dur.value) || 0, u = String(dur.unit || '').toLowerCase();
        return u.indexOf('day') == 0 ? n * 8 : u.indexOf('min') == 0 ? n / 60 : n;
    }
    function ymd(dt) { return dt.getUTCFullYear() + '-' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dt.getUTCDate()).slice(-2); }

    var cards = {}, entries = 0, skipped = 0;
    try {
        for (var i = 0; i < projects.length; i += 20) {
            var where = projects.slice(i, i + 20).map(function (id) { return "Project = '" + id + "'"; }).join(' OR ');
            var q = 'SELECT ReportedBy.Email, ReportedDate, Duration, WorkItem, Project, State FROM Timesheet WHERE ' + where;
            var paging = { from: 0, limit: 100 };
            while (true) {
                var body = post({ q: q, paging: paging });
                body.entities.forEach(function (e) {
                    var h = hours(e.Duration);
                    var state = e.State && e.State.id ? decodeURIComponent(e.State.id.split('/').pop()) : '';
                    var email = e.ReportedBy && e.ReportedBy.Email ? String(e.ReportedBy.Email).toLowerCase() : '';
                    if (!h || !e.ReportedDate || !email || !e.WorkItem || (STATES.length && STATES.indexOf(state) < 0)) { skipped++; return; }
                    var day = new Date(String(e.ReportedDate).substring(0, 10) + 'T00:00:00Z');
                    var back = (day.getUTCDay() - DAYS.indexOf(WEEK_START) + 7) % 7;
                    var week = ymd(new Date(day.getTime() - back * 86400000));
                    // Book on the project task when it was migrated; otherwise (demands, or tasks not migrated)
                    // roll the time up to the project / demand itself.
                    var proj = e.Project ? e.Project.id : '';
                    var target = (!isDemand[proj] && migratedTask[e.WorkItem.id]) ? e.WorkItem.id : proj;
                    var k = email + '|' + target + '|' + week;
                    if (!cards[k]) cards[k] = { email: email, task: 'ADAPTIVE:' + target,
                        project: 'ADAPTIVE:' + (e.Project ? e.Project.id : ''), week: week, h: [0, 0, 0, 0, 0, 0, 0] };
                    cards[k].h[day.getUTCDay()] += h;
                    entries++;
                });
                if (!body.paging || !body.paging.hasMore) break;
                paging = body.paging;
            }
        }
    } catch (err) { import_log.error(String(err)); return; }

    var count = 0;
    for (var c in cards) {
        var card = cards[c], row = {};
        row[col['task correlation id']] = card.task;
        row[col['project correlation id']] = card.project;
        row[col['resource email']] = card.email;
        row[col['week starts on']] = card.week;
        var total = 0;
        for (var n = 0; n < 7; n++) { row[col[DAYS[n]]] = String(card.h[n]); total += card.h[n]; }
        row[col['total']] = String(total);
        import_set_table.insert(row);
        count++;
    }
    import_log.info('Adaptive time entries: ' + entries + ' -> ' + count + ' weekly time card rows (' + skipped +
        ' skipped: 0 hours, no person/date/work item, or state not in STATES) for ' + projects.length + ' projects');
})(import_set_table, data_source, import_log, last_success_import_time);
