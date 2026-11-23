(function runTransformScript(source, map, log, target) {
    var project = new GlideRecord('pm_project');
    if (!project.get('correlation_id', source.getValue('u_project_correlation_id'))) {
        log.warn('Asana project not migrated: ' + source.getValue('u_project_correlation_id') + ' - task skipped: ' + (source.getValue('u_task_name') || source.getValue('u_name')));
        ignore = true;
        return;
    }
    target.top_task = project.getUniqueValue();
    var parent = new GlideRecord('pm_project_task');
    if (parent.get('correlation_id', source.getValue('u_parent_correlation_id')) && parent.getUniqueValue() != target.getUniqueValue())
        target.parent = parent.getUniqueValue();                 // under a section or a parent task
    else
        target.parent = project.getUniqueValue();                // top level
})(source, map, log, target);
