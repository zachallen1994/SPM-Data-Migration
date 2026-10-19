// Background Script (read-only): how many ACTIVE Asana projects would the full load bring over, per team?
// Same "active" rule as asana_data_source.js. Changes nothing.
var WORKSPACE = '5286451799521';
var SKIP_STATUS = ['Completed', 'Cancelled'];
var url = 'https://app.asana.com/api/1.0/workspaces/' + WORKSPACE + '/projects?archived=false&limit=100' +
    '&opt_fields=name,completed,team.name,current_status_update.status_type,custom_fields.name,custom_fields.display_value';
var teams = {}, total = 0, notActive = 0;
while (url) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(url);
    r.setRequestHeader('Authorization', 'Bearer ' + gs.getProperty('x_mig.asana.token'));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('Asana ' + res.getStatusCode() + ': ' + res.getBody()); break; }
    var body = JSON.parse(res.getBody());
    body.data.forEach(function (p) {
        if (p.gid == gs.getProperty('x_mig.asana.project_gid')) return;
        var ps = '';
        (p.custom_fields || []).forEach(function (f) { if (f.name == 'Project Status') ps = f.display_value || ''; });
        var status = p.current_status_update ? p.current_status_update.status_type : '';
        if (p.completed || status == 'complete' || SKIP_STATUS.indexOf(ps) >= 0) { notActive++; return; }
        var team = p.team ? p.team.name : '(no team)';
        if (!teams[team]) teams[team] = [];
        teams[team].push(p.name);
        total++;
    });
    url = body.next_page ? body.next_page.uri : null;
}
gs.print('Active projects: ' + total + '   (not archived but completed/cancelled, left out: ' + notActive + ')');
Object.keys(teams).sort().forEach(function (t) {
    gs.print('\n' + t + ': ' + teams[t].length);
    teams[t].slice(0, 10).forEach(function (n) { gs.print('   ' + n); });
    if (teams[t].length > 10) gs.print('   ...');
});
