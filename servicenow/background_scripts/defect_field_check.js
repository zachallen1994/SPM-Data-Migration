// Background Script (read-only): which Adaptive field holds what the testers expect (DFCT0010737)?
// For one project: Adaptive Project fields whose NAME or LABEL matches the pattern, with their values;
// Task fields for % complete / effort / duration with values on a few tasks; and the project's resource links
// (users vs groups, with / without email). Compare the values with the Adaptive screen to pick the right field.
var PROJECT = '25255-19488-GVL Powdersville MOB';   // ✏️ exact Adaptive project name
var PROJECT_PATTERN = /go.?live|finish|funding|expense|dept|region|site|budget|cost|rate/i;
var TASK_PATTERN = /percent|complete|effort|work|duration/i;

function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody();
    return JSON.parse(res.getBody());
}
function fields(entity, pattern) {
    var out = [];
    call('GET', '/metadata/describeEntities?typeNames=' + entity).entityDescriptions[0].fields.forEach(function (f) {
        if (pattern.test(f.name + ' ' + (f.label || ''))) out.push({ name: f.name, label: f.label || '', type: f.type });
    });
    return out;
}
function show(v) {
    if (v === null || v === undefined) return '';
    if (typeof v == 'object') return v.id ? v.id : (v.value !== undefined ? v.value + (v.unit ? ' ' + v.unit : v.currency ? ' ' + v.currency : '') : JSON.stringify(v));
    return String(v);
}
try {
    var pf = fields('Project', PROJECT_PATTERN);
    var q = "SELECT " + pf.map(function (f) { return f.name; }).join(', ') + " FROM Project WHERE Name = '" + PROJECT.replace(/'/g, "''") + "'";
    var p = (call('POST', '/data/query', { q: q, paging: { from: 0, limit: 1 } }).entities || [])[0];
    if (!p) gs.print('No Adaptive project named ' + PROJECT);
    else {
        gs.print('=== Project ' + PROJECT + ' (' + p.id + ')');
        pf.forEach(function (f) { var v = show(p[f.name]); if (v) gs.print('  ' + f.name + ' | "' + f.label + '" | ' + v); });

        var tf = fields('Task', TASK_PATTERN);
        var tq = "SELECT Name, " + tf.map(function (f) { return f.name; }).join(', ') + " FROM Task WHERE Project = '" + p.id + "'";
        gs.print('=== Tasks (first 3)');
        (call('POST', '/data/query', { q: tq, paging: { from: 0, limit: 3 } }).entities || []).forEach(function (t) {
            gs.print('  ' + t.Name);
            tf.forEach(function (f) { var v = show(t[f.name]); if (v) gs.print('    ' + f.name + ' | "' + f.label + '" | ' + v); });
        });

        gs.print('=== Resource links on the project');
        var links = call('POST', '/data/query', { q: "SELECT Resource, Resource.Name, Resource.Email FROM RegularResourceLink WHERE WorkItem = '" + p.id + "'", paging: { from: 0, limit: 100 } }).entities || [];
        var users = 0, groups = 0, noEmail = 0;
        links.forEach(function (l) {
            var id = l.Resource && l.Resource.id ? l.Resource.id : '';
            var kind = id.split('/')[1] || '?';
            if (kind == 'User') users++; else groups++;
            var email = l.Resource && l.Resource.Email ? l.Resource.Email : '';
            if (!email) noEmail++;
            gs.print('  ' + kind + ' | ' + (l.Resource && l.Resource.Name ? l.Resource.Name : id) + ' | ' + (email || '(no email)'));
        });
        gs.print('  links: ' + links.length + ' | users ' + users + ' | not users (groups / roles) ' + groups + ' | without email ' + noEmail);
    }
} catch (err) { gs.print('ERROR: ' + err); }
