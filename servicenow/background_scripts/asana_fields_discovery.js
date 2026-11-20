// Background Script (read-only, reads ASANA only): what fields does the HR Project Portfolio tracker really have?
// Like the Adaptive discovery: every field defined on the tracker, its type, how many active items fill it, the most
// common values (or the choice list), and whether the staging table has a column with that EXACT label (the data
// source only fills a column whose label equals the Asana field name). One output to download - no screenshots.
// The full result is also written to System Logs > All, Source = asana_fields_discovery.
var TRACKER = gs.getProperty('x_mig.asana.project_gid', '');   // ✏️ or paste the tracker project gid here
var STAGING = 'u_import_asana_hr_project_portfolio';            // ✏️ Asana projects staging table
var TOP = 6;                                                    // most common values shown per field
var OUT = [];
function out(x) { gs.print(x); OUT.push(x); }
function get(path) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(path.indexOf('http') == 0 ? path : 'https://app.asana.com/api/1.0' + path);
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300);
    return JSON.parse(res.getBody());
}
function all(path) {
    var list = [], url = path;
    while (url) { var p = get(url); list = list.concat(p.data || []); url = p.next_page ? p.next_page.uri : null; }
    return list;
}
try {
    if (!TRACKER) throw 'Set TRACKER (property x_mig.asana.project_gid is empty)';
    // staging column labels
    var labels = {}, d = new GlideRecord('sys_dictionary');
    d.addQuery('name', STAGING); d.addQuery('element', 'STARTSWITH', 'u_'); d.query();
    while (d.next()) labels[(d.getValue('column_label') || '').toLowerCase().trim()] = d.getValue('element');
    // field definitions on the tracker
    var defs = all('/projects/' + TRACKER + '/custom_field_settings?limit=100&opt_fields=custom_field.name,custom_field.resource_subtype,custom_field.enum_options.name');
    out('Tracker ' + TRACKER + ': ' + defs.length + ' custom fields defined');
    // items (top-level tasks) and their values
    var items = all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name,completed,assignee.email,start_on,due_on,memberships.section.name,custom_fields.name,custom_fields.display_value');
    var active = items.filter(function (t) { return !t.completed; });
    out('Items: ' + items.length + ' (' + active.length + ' not completed - counts below are for these)');
    function count(fn) { var n = 0, v = {}; active.forEach(function (t) { var x = fn(t); if (x) { n++; v[x] = (v[x] || 0) + 1; } }); return { n: n, v: v }; }
    function top(v) { return Object.keys(v).sort(function (a, b) { return v[b] - v[a]; }).slice(0, TOP).map(function (k) { return k.substring(0, 40) + ' (' + v[k] + ')'; }).join(' | '); }
    out('--- built-in fields ---');
    [['Assignee (email)', function (t) { return t.assignee ? t.assignee.email : ''; }],
     ['Start date', function (t) { return t.start_on; }], ['Due date', function (t) { return t.due_on; }],
     ['Section/Column', function (t) { return (t.memberships || []).map(function (m) { return m.section ? m.section.name : ''; }).join(''); }]]
        .forEach(function (b) { var c = count(b[1]); out(b[0] + ': filled ' + c.n + '/' + active.length + ' | ' + top(c.v)); });
    out('--- custom fields (name | type | filled | staging column with the same label | values) ---');
    defs.forEach(function (s) {
        var f = s.custom_field || {}, name = (f.name || '').trim();
        var c = count(function (t) { var x = ''; (t.custom_fields || []).forEach(function (cf) { if ((cf.name || '').trim() == name) x = cf.display_value || ''; }); return x; });
        var col = labels[name.toLowerCase()];
        out('"' + name + '" | ' + f.resource_subtype + ' | filled ' + c.n + '/' + active.length + ' | staging: ' + (col ? col : 'NO COLUMN') +
            ' | ' + (top(c.v) || '(no values)') +
            (f.enum_options && f.enum_options.length ? ' | choices: ' + f.enum_options.map(function (o) { return o.name; }).join(', ') : ''));
    });
    out('--- staging columns with NO Asana field of that name (filled only if the data source sets them itself) ---');
    var names = {};
    defs.forEach(function (s) { names[((s.custom_field || {}).name || '').trim().toLowerCase()] = true; });
    Object.keys(labels).forEach(function (l) { if (!names[l]) out('   ' + l + ' (' + labels[l] + ')'); });
} catch (e) { out('ERROR: ' + e); }
gs.info(OUT.join('\n'), 'asana_fields_discovery');
