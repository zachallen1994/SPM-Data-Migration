// Background Script (read-only): Asana vs ServiceNow, side by side, for every ACTIVE row of the HR tracker.
// Reads Asana live (same token as the load) and the migrated pm_project (correlation_id ASANA:<gid>).
// Prints only what differs or is missing, then a summary. Your spreadsheet export = the same data as Asana here.
// Result also in System Logs > All, Source = asana_compare.
var TRACKER = gs.getProperty('x_mig.asana.project_gid', '');
var SKIP_STATUS = ['Completed', 'Cancelled'];
var OUT = [], sum = { rows: 0, notInSN: 0, ok: 0, withIssues: 0 }, byField = {};
function out(x) { gs.print(x); OUT.push(x); }
function all(path) {
    var list = [], url = 'https://app.asana.com/api/1.0' + path;
    while (url) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET'); r.setEndpoint(url);
        r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Asana ' + res.getStatusCode();
        var b = JSON.parse(res.getBody()); list = list.concat(b.data || []); url = b.next_page ? b.next_page.uri : null;
    }
    return list;
}
function cf(t, n) { var v = ''; (t.custom_fields || []).forEach(function (f) { if ((f.name || '').trim() == n) v = f.display_value || ''; }); return v.trim(); }
function first(name) { return (name || '').split(/\s*[\/,;&]\s*/)[0].trim(); }
try {
    var rows = all('/projects/' + TRACKER + '/tasks?limit=100&opt_fields=name,completed,start_on,due_on,memberships.section.name,custom_fields.name,custom_fields.display_value');
    rows.forEach(function (t) {
        if (t.completed || SKIP_STATUS.indexOf(cf(t, 'Project Status')) >= 0) return;
        sum.rows++;
        var p = new GlideRecord('pm_project');
        if (!p.get('correlation_id', 'ASANA:' + t.gid)) { sum.notInSN++; out('NOT IN SERVICENOW: ' + t.name); return; }
        var issues = [];
        function chk(field, asana, sn, ok) { if (!ok) { issues.push(field + ': Asana "' + asana + '" | SN "' + sn + '"'); byField[field] = (byField[field] || 0) + 1; } }
        var pm = first(cf(t, 'PM Assigned')), snPm = p.getDisplayValue('project_manager');
        var pmBlank = !pm || /^(n\/?a|tbd)$/i.test(pm);
        chk('Project manager', pm, snPm, pmBlank || (!!snPm && snPm.split(' ').pop() == pm.split(' ').pop()));
        chk('Start', t.start_on || '', (p.getValue('start_date') || '').substring(0, 10), !t.start_on ||
            (!p.start_date.nil() && p.start_date.getGlideObject().getLocalDate().getValue() == t.start_on));
        chk('Due', t.due_on || '', (p.getValue('end_date') || '').substring(0, 10), !t.due_on ||
            (!p.end_date.nil() && p.end_date.getGlideObject().getLocalDate().getValue() == t.due_on));
        var sec = (t.memberships || []).map(function (m) { return m.section ? m.section.name : ''; }).join('');
        // the section now drives Functional Area (not Program); blank = no matching choice (see the import log)
        chk('Functional Area (Section)', sec, p.getDisplayValue('u_functional_area'), !sec || !p.isValidField('u_functional_area') || !!p.getValue('u_functional_area'));
        chk('Portfolio', 'HR', p.getDisplayValue('primary_portfolio'), p.getDisplayValue('primary_portfolio') == 'HR');
        chk('Description', cf(t, 'Strategy Focus') || '(notes/fields)', (p.getValue('description') || '').substring(0, 30), !!p.getValue('description'));
        var f = p.getFields(), und = [];
        for (var i = 0; i < f.size(); i++) if (f.get(i).getDisplayValue() == 'undefined') und.push(f.get(i).getLabel());
        if (und.length) { issues.push('"undefined" in: ' + und.join(', ')); byField['"undefined"'] = (byField['"undefined"'] || 0) + 1; }
        if (issues.length) { sum.withIssues++; out(p.getValue('number') + ' ' + t.name + ' | Asana status ' + cf(t, 'Project Status') + ' -> SN state ' + p.getDisplayValue('state') + '\n      ' + issues.join('\n      ')); }
        else sum.ok++;
    });
} catch (e) { out('ERROR: ' + e); }
out('SUMMARY ' + JSON.stringify(sum) + ' | projects affected per field: ' + JSON.stringify(byField));
gs.info(OUT.join('\n'), 'asana_compare');
