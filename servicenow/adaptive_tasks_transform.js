// "Import Adaptive Project Tasks Transform Map": u_import_adaptive_project_tasks -> pm_project_task
//   Field map: correlation_id <- u_correlation_id, Coalesce = true
//   Transform Scripts: onBefore -> PART A (project + parent)
//   Field map: Status, Use source script, Choice action = ignore -> PART B
// Run the transform TWICE: rows arrive in any order, so a child can come before its parent task exists.
// The second run (updates only, thanks to the coalesce) puts every task under the right parent.

// ---------- PART A: onBefore - project and parent ----------
(function runTransformScript(source, map, log, target) {
    var project = new GlideRecord('pm_project');
    if (!project.get('correlation_id', source.u_project_correlation_id + '')) {
        log.warn('Project not migrated: ' + source.u_project_correlation_id + ' - task skipped: ' + source.u_name);
        ignore = true;
        return;
    }
    target.top_task = project.getUniqueValue();
    var parent = new GlideRecord('pm_project_task');
    if (parent.get('correlation_id', source.u_parent_correlation_id + '') && parent.getUniqueValue() != target.getUniqueValue())
        target.parent = parent.getUniqueValue();                 // under another task
    else
        target.parent = project.getUniqueValue();                // top level (or parent not loaded yet - 2nd run fixes it)
})(source, map, log, target);

// ---------- PART B: field map -> Status ----------
answer = (function transformEntry(source) {
    // letters only, so "On Track", "OnTrack" and "on-track" all match
    var s = (source.u_status + '').toLowerCase().replace(/[^a-z]/g, '');
    var colorMap = { 'ontrack': 'green', 'atrisk': 'yellow', 'offtrack': 'red' };   // ✏️ confirm values with the check below
    if (s && !colorMap[s]) log.warn('Unmapped Adaptive task status: ' + source.u_status);
    return colorMap[s] || '';
})(source);
