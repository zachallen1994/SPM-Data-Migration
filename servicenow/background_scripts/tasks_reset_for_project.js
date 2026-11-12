// Background Script (CHANGES DATA - DRY_RUN first): delete a project's MIGRATED project tasks (and what hangs on
// them: time cards, resource assignments, expense lines ...) so the next tasks load INSERTS them fresh.
// Why: re-running the tasks transform over tasks from an earlier (wrong) load is aborted by "Disable the Change of
// Planned Dates" and "Change Parent" - the whole row, so state / status / % complete / parent never update.
// After this: load + transform the tasks for the project (x_mig.adaptive.scope = its number), then its time cards.
var DRY_RUN = true;                    // ✏️ true = list only; false = delete
var PROJECTS = ['PRJ0010296'];         // ✏️ project numbers (this instance), e.g. Willow in TEST
gs.print('tasks_reset_for_project VERSION 1 | ' + (DRY_RUN ? 'DRY RUN' : 'DELETING'));

var refFields = [];                    // reference fields that can point at a project task
var dict = new GlideRecord('sys_dictionary');
dict.addQuery('internal_type', 'reference');
dict.addQuery('reference', 'IN', 'task,planned_task,pm_project_task');
dict.query();
while (dict.next()) refFields.push([dict.getValue('name'), dict.getValue('element')]);

function del(g, failed) {
    if (DRY_RUN) return;
    if (g.deleteRecord()) return;                      // normal delete first
    g.setWorkflow(false);
    if (!g.deleteRecord()) failed.push(g.getRecordClassName() + ' ' + g.getUniqueValue());
}
PROJECTS.forEach(function (num) {
    var p = new GlideRecord('pm_project');
    if (!p.get('number', num)) { gs.print('No project ' + num); return; }
    var tasks = [], failed = [], counts = {};
    var t = new GlideRecord('pm_project_task');
    t.addQuery('top_task', p.getUniqueValue());
    t.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    t.query();
    while (t.next()) tasks.push(t.getUniqueValue());
    gs.print('=== ' + num + ' ' + p.getValue('short_description') + ' | migrated tasks: ' + tasks.length);
    // records on those tasks (skip the task table itself: parent / top_task links between tasks)
    for (var i = 0; i < tasks.length; i += 100) {
        var chunk = tasks.slice(i, i + 100).join(',');
        refFields.forEach(function (rf) {
            if (rf[0] == 'task' || rf[0] == 'planned_task' || rf[0] == 'pm_project_task') return;
            var g = new GlideRecord(rf[0]);
            if (!g.isValid() || !g.isValidField(rf[1])) return;
            g.addQuery(rf[1], 'IN', chunk);
            g.query();
            while (g.next()) { var c = g.getRecordClassName(); counts[c] = (counts[c] || 0) + 1; del(g, failed); }
        });
    }
    gs.print('  records on the tasks ' + (DRY_RUN ? 'to delete' : 'deleted') + ': ' + JSON.stringify(counts));
    // the tasks themselves, children first (deepest last loaded = delete in reverse)
    for (var j = tasks.length - 1; j >= 0; j--) {
        var tk = new GlideRecord('pm_project_task');
        if (tk.get(tasks[j])) del(tk, failed);
    }
    gs.print('  tasks ' + (DRY_RUN ? 'to delete: ' : 'deleted: ') + tasks.length);
    failed.forEach(function (f) { gs.print('  NOT deleted: ' + f); });
});
