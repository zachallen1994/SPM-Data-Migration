// Adaptive lessons learned (C_PMOLessonsLearned) -> u_lessons_learned
// Transform Map "Import Adaptive Lessons Learned": u_import_adaptive_lessons_learned -> u_lessons_learned
//   Field map: Use source script = true, Target field = u_project -> PART A
//   Transform Scripts: When = onBefore                          -> PART B

// ---------- PART A: field map -> u_project ----------
answer = (function transformEntry(source) {
    var p = new GlideRecord('pm_project');
    return p.get('correlation_id', source.u_project_correlation_id + '') ? p.getUniqueValue() : '';
})(source);

// ---------- PART B: onBefore ----------
(function runTransformScript(source, map, log, target) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_project_correlation_id + '')) {   // project not migrated: skip
        ignore = true;
        return;
    }
    if (!(source.u_name + '').trim()) {                                     // no subject: log, still load
        log.warn('Lesson without subject: ' + source.u_correlation_id);
    }
})(source, map, log, target);
