// Background Script (read-only): what is in the latest time entries load? Rows by year (week starts on),
// rows on a project vs a task, total hours, and the projects with the most rows.
var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', 'IN', 'u_import_adaptive_time_entries,u_import_adaptive_time_cards');
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();
if (set.next()) {
    var t = set.getValue('table_name'), years = {}, perProject = {}, n = 0, onTask = 0, hours = 0;
    var r = new GlideRecord(t);
    r.addQuery('sys_import_set', set.getUniqueValue());
    r.query();
    while (r.next()) {
        n++;
        var y = (r.getValue('u_week_starts_on') || '(blank)').substring(0, 4);
        years[y] = years[y] || { rows: 0, h: 0 };
        var h = parseFloat(r.getValue('u_total')) || 0;
        years[y].rows++; years[y].h += h; hours += h;
        if ((r.getValue('u_task_correlation_id') || '') != (r.getValue('u_project_correlation_id') || '')) onTask++;
        var p = r.getValue('u_project_correlation_id');
        perProject[p] = (perProject[p] || 0) + 1;
    }
    gs.print(set.getValue('number') + ' (' + t + '): ' + n + ' rows, ' + Math.round(hours) + ' h | on a task: ' + onTask + ' | on the project / demand: ' + (n - onTask));
    Object.keys(years).sort().forEach(function (k) { gs.print('  ' + k + ': ' + years[k].rows + ' rows, ' + Math.round(years[k].h) + ' h'); });
    var ids = Object.keys(perProject);
    gs.print('projects / demands: ' + ids.length + ' | average rows per project: ' + Math.round(n / ids.length));
    ids.sort(function (a, b) { return perProject[b] - perProject[a]; }).slice(0, 10).forEach(function (id) {
        var p = new GlideRecord('pm_project');
        if (!p.get('correlation_id', id)) { p = new GlideRecord('dmn_demand'); p.get('correlation_id', id); }
        gs.print('  most: ' + perProject[id] + ' | ' + (p.isValidRecord() ? p.getValue('number') + ' ' + p.getValue('short_description') : id));
    });
}
