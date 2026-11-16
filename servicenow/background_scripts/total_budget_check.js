// Background Script (read-only): where does a project's "Total Budget" come from in THIS instance?
// 1) the field(s) labelled Total Budget / Budget on project, and whether they are read-only / calculated
// 2) business rules and script includes that write that field (shows which records feed it)
// 3) tables that point at a project and have budget / fund / allocation in their name, with counts for one project
var PROJECT = 'PRJ0010361';   // ✏️ Powdersville MOB in this instance
var fields = [];
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'IN', 'pm_project,planned_task,task');
d.addQuery('column_label', 'CONTAINS', 'budget');
d.query();
while (d.next()) {
    fields.push(d.getValue('element'));
    gs.print('field: ' + d.getValue('name') + '.' + d.getValue('element') + ' | "' + d.getValue('column_label') + '" | ' +
        d.getValue('internal_type') + ' | read only ' + d.getValue('read_only') + ' | calculated ' + d.getValue('virtual'));
}
fields.forEach(function (f) {
    var br = new GlideRecord('sys_script');
    br.addQuery('active', true);
    br.addQuery('script', 'CONTAINS', f);
    br.setLimit(15);
    br.query();
    while (br.next()) gs.print('  rule writing/reading ' + f + ': ' + br.getValue('collection') + ' | ' + br.getValue('name'));
    var si = new GlideRecord('sys_script_include');
    si.addQuery('active', true);
    si.addQuery('script', 'CONTAINS', "'" + f + "'");
    si.setLimit(10);
    si.query();
    while (si.next()) gs.print('  script include using ' + f + ': ' + si.getValue('name'));
});
var p = new GlideRecord('pm_project');
if (p.get('number', PROJECT)) {
    fields.forEach(function (f) { if (p.isValidField(f)) gs.print(PROJECT + ' ' + f + ' = ' + p.getValue(f)); });
    var refs = new GlideRecord('sys_dictionary');
    refs.addQuery('internal_type', 'reference');
    refs.addQuery('reference', 'IN', 'pm_project,planned_task,task');
    refs.query();
    while (refs.next()) {
        var t = refs.getValue('name');
        if (!/budget|fund|alloc|invest/i.test(t)) continue;
        var g = new GlideAggregate(t);
        if (!g.isValid()) continue;
        g.addQuery(refs.getValue('element'), p.getUniqueValue());
        g.addAggregate('COUNT'); g.query(); g.next();
        gs.print('table ' + t + '.' + refs.getValue('element') + ' -> ' + PROJECT + ': ' + g.getAggregate('COUNT') + ' records');
    }
} else gs.print('No project ' + PROJECT);
