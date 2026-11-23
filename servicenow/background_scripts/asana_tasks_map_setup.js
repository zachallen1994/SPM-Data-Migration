// Background Script (DEV, update set selected - CHANGES CONFIGURATION, DRY_RUN first):
// sets up "Import Asana Project Tasks Transform Map" EXACTLY as servicenow/asana_tasks_transform.js - no copy/paste.
// Removes every other field map / transform script on that map, creates or updates the ones below with the exact
// script text, and prints what it did. Run it with your Asana update set selected so every record is captured.
// GENERATED from asana_tasks_transform.js - do not edit by hand.
var DRY_RUN = true;                                         // ✏️ false = apply
var MAP_NAME = 'Import Asana Project Tasks Transform Map';  // ✏️ exact map name
var P = {
 "A": "(function runTransformScript(source, map, log, target) {\n    var project = new GlideRecord('pm_project');\n    if (!project.get('correlation_id', source.getValue('u_project_correlation_id'))) {\n        log.warn('Asana project not migrated: ' + source.getValue('u_project_correlation_id') + ' - task skipped: ' + (source.getValue('u_task_name') || source.getValue('u_name')));\n        ignore = true;\n        return;\n    }\n    target.top_task = project.getUniqueValue();\n    var parent = new GlideRecord('pm_project_task');\n    if (parent.get('correlation_id', source.getValue('u_parent_correlation_id')) && parent.getUniqueValue() != target.getUniqueValue())\n        target.parent = parent.getUniqueValue();                 // under a section or a parent task\n    else\n        target.parent = project.getUniqueValue();                // top level\n})(source, map, log, target);\n",
 "B": "// \"Start on specific date\" + the Asana dates, else the planning engine moves the task (seen: all on 12-31-2026).\n// 08:00 / 17:00 so the day does not shift (midnight UTC = the evening before in US time). Only a due date -> one-day\n// task. No dates at all (sections, many Warren tasks) -> left to ServiceNow (they follow their subtasks / project).\n(function runTransformScript(source, map, log, target) {\n    if (!target.isNewRecord()) return;                           // existing tasks: \"Disable the Change of Planned Dates\"\n    var s = (source.getValue('u_start_date') || '').substring(0, 10);\n    var e = (source.getValue('u_due_date') || '').substring(0, 10);\n    var ok = /^\\d{4}-\\d{2}-\\d{2}$/;\n    if (!ok.test(s)) s = ok.test(e) ? e : '';\n    if (!ok.test(e)) e = s;\n    if (!s) return;\n    if (e < s) e = s;\n    var gs0 = new GlideDateTime(); gs0.setDisplayValue(s + ' 08:00:00', 'yyyy-MM-dd HH:mm:ss');\n    var ge = new GlideDateTime(); ge.setDisplayValue(e + ' 17:00:00', 'yyyy-MM-dd HH:mm:ss');\n    target.time_constraint = 'start_on';\n    if (target.isValidField('constraint_date')) target.constraint_date = gs0;\n    target.start_date = gs0;\n    target.end_date = ge;\n})(source, map, log, target);\n",
 "C": "// Task states with a state bucket only: 1 Open, 2 Work in Progress, 3 Closed Complete, 4 Closed Incomplete.\n// Completed box ticked, or PMO/Task Status exactly \"Complete(d)\" -> Closed Complete. \"In Progress, Complete\" with the\n// box NOT ticked -> Work in Progress.\nanswer = (function transformEntry(source) {\n    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();\n    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');\n    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\\s*\\(closed\\)/i.test(nm)) return '3';\n    if (s.indexOf('cancel') > -1) return '4';\n    if (s.indexOf('progress') > -1 || s.indexOf('started/') > -1 || s.indexOf('scoping') > -1 || s.indexOf('delayed') > -1) return '2';\n    return '1';\n})(source);\n",
 "D": "// Asana \"% Complete\" (\"50%\" or 0.5) -> 50. Closed Complete -> 100. Nothing -> blank (ServiceNow keeps 0).\nanswer = (function transformEntry(source) {\n    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();\n    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');\n    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\\s*\\(closed\\)/i.test(nm)) return '100';\n    var col = '';\n    var d = new GlideRecord('sys_dictionary');               // the \"% Complete\" column, found by its label\n    d.addQuery('name', source.getTableName()); d.addQuery('column_label', '% Complete'); d.query();\n    if (d.next()) col = d.getValue('element');\n    var raw = col ? (source.getValue(col) || '').trim() : '';\n    if (!raw || raw == 'undefined') return '';\n    var n = parseFloat(raw.replace('%', ''));\n    if (isNaN(n)) return '';\n    if (raw.indexOf('%') < 0 && n <= 1) n = n * 100;         // 0.5 -> 50\n    return String(Math.max(0, Math.min(100, Math.round(n))));\n})(source);\n",
 "E": "// Closed tasks need an actual start (else \"Set Close Data On Inactive\" refuses them): planned start, else due date.\nanswer = (function transformEntry(source) {\n    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();\n    var closed = (source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || s.indexOf('cancel') > -1 ||\n        /^\\s*\\(closed\\)/i.test(source.getValue('u_task_name') || source.getValue('u_name') || '');\n    if (!closed) return '';\n    return (source.getValue('u_start_date') || source.getValue('u_due_date') || '').substring(0, 10);\n})(source);\n",
 "F": "answer = (function transformEntry(source) {\n    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();\n    var closed = (source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || s.indexOf('cancel') > -1 ||\n        /^\\s*\\(closed\\)/i.test(source.getValue('u_task_name') || source.getValue('u_name') || '');\n    if (!closed) return '';\n    return (source.getValue('u_due_date') || source.getValue('u_start_date') || '').substring(0, 10);\n})(source);\n",
 "G": "// The Asana ASSIGNEE (a person, e.g. Tricia Figg plfigg@mercy.com) matched by email, active user first.\n// The free-text \"Assigned To\" field (e.g. \"Billie\", \"IT\") is not a user - it goes into the description (PART H).\nanswer = (function transformEntry(source) {\n    var em = (source.getValue('u_assignee_email') || '').toLowerCase().trim();\n    if (!em || em == 'undefined') return '';\n    var u = new GlideRecord('sys_user');\n    u.addQuery('email', em); u.orderByDesc('active'); u.setLimit(1); u.query();\n    if (u.next()) return u.getUniqueValue();\n    log.warn('Asana task assignee ' + em + ' has no ServiceNow user - left blank on ' + (source.getValue('u_task_name') || source.getValue('u_name')));\n    return '';\n})(source);\n",
 "H": "answer = (function transformEntry(source) {\n    function v(c) { var x = source.isValidField(c) ? (source.getValue(c) || '').trim() : ''; return x == 'undefined' ? '' : x; }\n    var col = '';\n    var d = new GlideRecord('sys_dictionary');               // the free-text \"Assigned To\" column, found by its label\n    d.addQuery('name', source.getTableName()); d.addQuery('column_label', 'Assigned To'); d.query();\n    if (d.next()) col = d.getValue('element');\n    var lines = [];\n    if (v('u_notes')) lines.push(v('u_notes'));\n    if (col && v(col)) lines.push('Assigned To (Asana): ' + v(col));\n    if (v('u_task_status')) lines.push('Asana status: ' + v('u_task_status'));\n    return lines.join('\\n');\n})(source);\n"
};
var WANT_MAPS = [
    { source: 'u_correlation_id', target: 'correlation_id', coalesce: true },
    { source: 'u_task_name', target: 'short_description' },
    { target: 'state', script: P.C },
    { target: 'percent_complete', script: P.D },
    { target: 'work_start', script: P.E, fmt: 'yyyy-MM-dd' },
    { target: 'work_end', script: P.F, fmt: 'yyyy-MM-dd' },
    { target: 'assigned_to', script: P.G },
    { target: 'description', script: P.H }
];
var WANT_SCRIPTS = [ { order: 100, script: P.A }, { order: 200, script: P.B } ];
var m = new GlideRecord('sys_transform_map');
if (!m.get('name', MAP_NAME)) gs.print('STOP: no transform map named ' + MAP_NAME);
else {
    gs.print((DRY_RUN ? 'DRY RUN - ' : '') + 'setting up ' + MAP_NAME + ' (' + m.getValue('source_table') + ' -> ' + m.getValue('target_table') + ')');
    var e = new GlideRecord('sys_transform_entry');
    e.addQuery('map', m.getUniqueValue()); e.query();
    var have = {};
    while (e.next()) {
        var keep = WANT_MAPS.some(function (w) { return w.target == e.getValue('target_field'); });
        if (!keep || have[e.getValue('target_field')]) {
            gs.print('delete field map ' + (e.getValue('source_field') || '[script]') + ' -> ' + e.getValue('target_field'));
            if (!DRY_RUN) e.deleteRecord();
        } else have[e.getValue('target_field')] = e.getUniqueValue();
    }
    WANT_MAPS.forEach(function (w) {
        var r = new GlideRecord('sys_transform_entry');
        var exists = have[w.target] && r.get(have[w.target]);
        if (!exists) { r.initialize(); r.setValue('map', m.getUniqueValue()); r.setValue('source_table', m.getValue('source_table')); r.setValue('target_table', m.getValue('target_table')); }
        r.setValue('target_field', w.target);
        r.setValue('source_field', w.source || '');
        r.setValue('use_source_script', w.script ? true : false);
        r.setValue('source_script', w.script || '');
        r.setValue('coalesce', w.coalesce ? true : false);
        r.setValue('choice_action', 'ignore');
        if (w.fmt) r.setValue('date_format', w.fmt);
        gs.print((exists ? 'update' : 'create') + ' field map ' + (w.source || '[script]') + ' -> ' + w.target);
        if (!DRY_RUN) { if (exists) r.update(); else r.insert(); }
    });
    var t = new GlideRecord('sys_transform_script');
    t.addQuery('map', m.getUniqueValue()); t.query();
    while (t.next()) { gs.print('delete transform script ' + t.getValue('when') + ' order ' + t.getValue('order')); if (!DRY_RUN) t.deleteRecord(); }
    WANT_SCRIPTS.forEach(function (w) {
        gs.print('create transform script onBefore order ' + w.order);
        if (DRY_RUN) return;
        var n = new GlideRecord('sys_transform_script');
        n.initialize(); n.setValue('map', m.getUniqueValue()); n.setValue('when', 'onBefore'); n.setValue('order', w.order);
        n.setValue('active', true); n.setValue('script', w.script); n.insert();
    });
    gs.print(DRY_RUN ? 'DRY RUN done - set DRY_RUN = false to apply' : 'Done. Check the map: 8 field maps, 2 onBefore scripts.');
}
