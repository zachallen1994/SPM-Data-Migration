// Background Script (read-only): facts for the new requirements. Changes nothing.
//   1. Which Adaptive Project field holds the "project type" (Projects, Construction Project, ...) and its values
//   2. How Programs look in Adaptive (count, sample fields)
//   3. Total logged hours per migrated Adaptive DEMAND (Timesheet.Project = the demand's Adaptive id)
//   4. ServiceNow demand fields that could hold hours / effort
var BASE = gs.getProperty('x_mig.adaptive.url');
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(BASE + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  ' + path + ' -> ' + res.getStatusCode() + ': ' + res.getBody().substring(0, 300)); return null; }
    return JSON.parse(res.getBody());
}
function query(q, max) {                                   // all pages, up to max rows
    var out = [], paging = { from: 0, limit: 100 };
    while (out.length < (max || 5000)) {
        var b = call('POST', '/data/query', { q: q, paging: paging });
        if (!b) break;
        out = out.concat(b.entities);
        if (!b.paging || !b.paging.hasMore) break;
        paging = b.paging;
    }
    return out;
}
function last(v) { return v && v.id ? decodeURIComponent(String(v.id).split('/').pop()) : (v === null || v === undefined ? '(blank)' : String(v)); }

// 1. Project type field
gs.print('==== 1. Project fields that look like a type');
var typeFields = [];
var d = call('GET', '/metadata/describeEntities?typeNames=Project');
if (d) d.entityDescriptions[0].fields.forEach(function (f) {
    if (/type|category|kind|template/i.test(f.name + ' ' + f.label) && !/Expense|Charged|Scheduling|Entity|Currency|Creator/i.test(f.name)) {
        typeFields.push(f.name);
        gs.print('  ' + f.name + ' | ' + f.label + ' | ' + f.type + (f.referencedEntities ? ' -> ' + f.referencedEntities.join(',') : ''));
    }
});
typeFields.forEach(function (fld) {
    var counts = {};
    query('SELECT ' + fld + ', State FROM Project', 5000).forEach(function (e) {
        if (last(e.State) != 'Active') return;              // in-flight only
        var v = last(e[fld]);
        counts[v] = (counts[v] || 0) + 1;
    });
    gs.print('  ' + fld + ' values on ACTIVE projects: ' + JSON.stringify(counts));
});

// 2. Programs
gs.print('\n==== 2. Programs');
var progs = query('SELECT Name, State FROM Program', 500);
var active = progs.filter(function (p) { return last(p.State) == 'Active'; });
gs.print('  programs: ' + progs.length + ' | active: ' + active.length + ' | e.g. ' +
    active.slice(0, 8).map(function (p) { return p.Name; }).join(' | '));

// 3. Logged hours per migrated demand
gs.print('\n==== 3. Logged hours per migrated Adaptive demand');
var dm = new GlideRecord('dmn_demand');
dm.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/');
dm.query();
while (dm.next()) {
    var id = dm.getValue('correlation_id').replace('ADAPTIVE:', ''), hours = 0, n = 0;
    query("SELECT Duration FROM Timesheet WHERE Project = '" + id + "'", 5000).forEach(function (t) {
        var v = t.Duration || {}, h = parseFloat(v.value) || 0, u = String(v.unit || '').toLowerCase();
        hours += u.indexOf('day') == 0 ? h * 8 : u.indexOf('min') == 0 ? h / 60 : h;
        n++;
    });
    gs.print('  ' + dm.getValue('number') + ' ' + dm.getValue('short_description') + ': ' + hours + ' h from ' + n + ' entries');
}

// 4. Demand fields for hours / effort
gs.print('\n==== 4. dmn_demand fields about effort / hours / actual');
var dd = new GlideRecord('sys_dictionary');
dd.addQuery('name', 'IN', 'dmn_demand,task');
dd.addQuery('column_label', 'CONTAINS', 'effort').addOrCondition('column_label', 'CONTAINS', 'hour')
  .addOrCondition('column_label', 'CONTAINS', 'actual');
dd.query();
while (dd.next()) gs.print('  ' + dd.getValue('name') + '.' + dd.getValue('element') + ' | ' + dd.getValue('column_label') + ' | ' + dd.getValue('internal_type'));
