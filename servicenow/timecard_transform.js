// Weekly Adaptive time -> time_card
// Transform Map "Import Adaptive Time Cards": u_import_adaptive_time_cards -> time_card
//   Field map: Use source script, Target field = user,  Coalesce = true -> PART A
//   Field map: Use source script, Target field = task,  Coalesce = true -> PART B
//   Field map: u_week_starts_on -> week_starts_on, Coalesce = true, Date format yyyy-MM-dd
//   Field maps: u_sunday -> sunday, u_monday -> monday ... u_saturday -> saturday (direct)
//   Field map: Use source script, Target field = state                  -> PART C
//   Transform Scripts: onBefore                                         -> PART D
//   Transform Scripts: onAfter  (TEST / PROD without fix scripts)        -> PART E  (business rules ON)
//   Transform Scripts: onComplete (FAST LOAD, business rules OFF)        -> PART F  (use E or F, not both)
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

// ---------- PART E: onAfter - Submit, then Approve (replaces fix_scripts/timecards_set_processed.js) ----------
// For instances where fix scripts cannot be run (TEST / PROD). Runs for every card the transform writes, with
// business rules ON for these two saves (even when the map's "Run business rules" is off), so the hours roll up
// to actual effort exactly as when a person clicks Submit and Approve. Re-runs skip cards no longer Pending.
(function runTransformScript(source, map, log, target) {
    var PROCESS = true;                         // ✏️ false = leave cards Pending (then use the fix script)
    if (!PROCESS || action == 'ignore') return;
    function value(label) {
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', label); c.query();
        return c.next() ? c.getValue('value') : null;
    }
    var tc = new GlideRecord('time_card');
    if (!tc.get(target.getUniqueValue()) || tc.getValue('state') != value('Pending')) return;
    ['Submitted', 'Approved'].forEach(function (label) {
        var v = value(label);
        if (!v) return;
        tc.get(tc.getUniqueValue());
        tc.setValue('state', v);
        tc.update();
    });
    tc.get(tc.getUniqueValue());
    if (tc.getDisplayValue('state') != 'Processed' && tc.getDisplayValue('state') != 'Approved')
        log.warn('Time card for ' + source.u_resource_email + ' week ' + source.u_week_starts_on + ' stopped at ' + tc.getDisplayValue('state'));
})(source, map, log, target);

// ---------- PART F: onComplete - roll the hours up ONCE (fast load: map "Run business rules" OFF) ----------
// With business rules on, every card re-calculates its task and project (about 6 s per card - 68k cards = days).
// Fast load: "Run business rules" OFF on the map; PART C writes State = Processed directly (nothing resets it).
// Then this script runs ONCE at the end: for every task / project / demand that got cards in this import set it adds
// up ALL its Processed cards and writes the actual effort - with business rules ON for that save, so project tasks
// roll up to their project as usual. One save per record instead of several per card.
// (Labor expense lines and approvals are not created for migrated time - history only.)
(function runTransformScript(source, map, log, target) {
    var ROLL_UP = true;                           // ✏️ false = do nothing (business rules on at insert do the roll-up)
    if (!ROLL_UP) return;
    var targets = {};
    var r = new GlideRecord('sys_import_set_row');
    r.addQuery('sys_import_set', import_set.sys_id + '');
    r.addQuery('sys_target_table', 'time_card');
    r.addNotNullQuery('sys_target_sys_id');
    r.query();
    while (r.next()) {
        var tc = new GlideRecord('time_card');
        if (tc.get(r.getValue('sys_target_sys_id'))) targets[tc.getValue('task')] = true;
    }
    var processed = (function () {
        var c = new GlideRecord('sys_choice');
        c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', 'Processed'); c.query();
        return c.next() ? c.getValue('value') : 'Processed';
    })();
    var done = 0;
    for (var id in targets) {
        var sum = new GlideAggregate('time_card');
        sum.addQuery('task', id);
        sum.addQuery('state', processed);
        sum.addAggregate('SUM', 'total');
        sum.query();
        var hours = sum.next() ? parseFloat(sum.getAggregate('SUM', 'total')) || 0 : 0;
        var t = new GlideRecord('task');
        if (!t.get(id)) continue;
        var cls = t.getValue('sys_class_name');
        var rec = new GlideRecord(cls);
        if (!rec.get(id)) continue;
        var field = cls == 'dmn_demand' ? 'demand_actual_effort' : 'work_effort';
        if (!rec.isValidField(field)) continue;
        rec[field].setDateNumericValue(Math.round(hours * 3600000));   // hours -> duration
        rec.update();                                // business rules ON here: task -> project roll-up
        done++;
    }
    log.info('Time card roll-up: actual effort written for ' + done + ' tasks / projects / demands');
})(source, map, log, target);
