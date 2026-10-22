// Weekly Adaptive time -> time_card
// Transform Map "Import Adaptive Time Cards": u_import_adaptive_time_cards -> time_card
//   Field map: Use source script, Target field = user,  Coalesce = true -> PART A
//   Field map: Use source script, Target field = task,  Coalesce = true -> PART B
//   Field map: u_week_starts_on -> week_starts_on, Coalesce = true, Date format yyyy-MM-dd
//   Field maps: u_sunday -> sunday, u_monday -> monday ... u_saturday -> saturday (direct)
//   Field map: Use source script, Target field = state                  -> PART C
//   Transform Scripts: onBefore                                         -> PART D
// User + task + week is one card, so re-runs replace that week's hours (the data source sends weekly totals).
// Processed cards roll up to actual effort. Test ONE card in Dev first: check the task/project actual effort.

// ---------- PART A: field map -> user ----------
answer = (function transformEntry(source) {
    var u = new GlideRecord('sys_user');
    return u.get('email', (source.u_resource_email + '').toLowerCase().trim()) ? u.getUniqueValue() : '';
})(source);

// ---------- PART B: field map -> task (the project task, the project, or the demand) ----------
answer = (function transformEntry(source) {
    var t = ['pm_project_task', 'pm_project', 'dmn_demand'];
    for (var i = 0; i < t.length; i++) {
        var gr = new GlideRecord(t[i]);
        if (gr.get('correlation_id', source.u_task_correlation_id + '')) return gr.getUniqueValue();
    }
    return '';
})(source);

// ---------- PART C: field map -> state = Processed (looked up by label, whatever the stored value is) ----------
answer = (function transformEntry(source) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'time_card');
    c.addQuery('element', 'state');
    c.addQuery('label', 'Processed');
    c.query();
    return c.next() ? c.getValue('value') : 'Processed';
})(source);

// ---------- PART D: onBefore - skip what cannot become a card ----------
(function runTransformScript(source, map, log, target) {
    var u = new GlideRecord('sys_user');
    if (!u.get('email', (source.u_resource_email + '').toLowerCase().trim())) {
        log.warn('No ServiceNow user for ' + source.u_resource_email + ' - time skipped (' + source.u_total + ' h, week ' + source.u_week_starts_on + ')');
        ignore = true;
        return;
    }
    var found = false, t = ['pm_project_task', 'pm_project', 'dmn_demand'];
    for (var i = 0; i < t.length && !found; i++) {
        var gr = new GlideRecord(t[i]);
        found = gr.get('correlation_id', source.u_task_correlation_id + '');
    }
    if (!found) {                                       // project / demand / task not migrated
        log.warn('Work item not in ServiceNow: ' + source.u_task_correlation_id + ' - time skipped (' + source.u_total + ' h)');
        ignore = true;
    }
})(source, map, log, target);
