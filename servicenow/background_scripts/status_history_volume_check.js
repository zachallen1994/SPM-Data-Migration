// Background Script (read-only): what is in the latest status history load? Rows by year-month of "Updated On",
// the oldest date (must be 2025-01-01 or later with the cut-off), and the projects with the most updates.
var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'u_import_adaptive_status_history');
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (set.next()) {
    var months = {}, perProject = {}, n = 0, oldest = '9999', days = {}, dayCount = 0;
    var r = new GlideRecord('u_import_adaptive_status_history');
    r.addQuery('sys_import_set', set.getUniqueValue());
    r.query();
    while (r.next()) {
        n++;
        var d = (r.getValue('u_updated_on') || '(blank)').substring(0, 7);
        months[d] = (months[d] || 0) + 1;
        if (d < oldest) oldest = d;
        var p = r.getValue('u_project_correlation_id');
        perProject[p] = (perProject[p] || 0) + 1;
        var k = p + '|' + (r.getValue('u_updated_on') || '').substring(0, 10);
        if (!days[k]) { days[k] = true; dayCount++; }
    }
    gs.print('different project + day pairs: ' + dayCount + ' (the transform makes ONE report per project per day, so this is about how many reports you get)');
    gs.print(set.getValue('number') + ' created ' + set.getValue('sys_created_on') + ': ' + n + ' rows | oldest month ' + oldest);
    Object.keys(months).sort().forEach(function (m) { gs.print('  ' + m + ': ' + months[m]); });
    var ids = Object.keys(perProject);
    gs.print('projects / demands: ' + ids.length + ' | average per project: ' + Math.round(n / ids.length));
    ids.sort(function (a, b) { return perProject[b] - perProject[a]; }).slice(0, 10).forEach(function (id) {
        var p = new GlideRecord('pm_project');
        if (!p.get('correlation_id', id)) { p = new GlideRecord('dmn_demand'); p.get('correlation_id', id); }
        gs.print('  most: ' + perProject[id] + ' | ' + (p.isValidRecord() ? p.getValue('number') + ' ' + p.getValue('short_description') : id));
    });
}
