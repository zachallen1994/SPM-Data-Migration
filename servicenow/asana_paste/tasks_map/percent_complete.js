// Asana "% Complete" ("50%" or 0.5) -> 50. Closed Complete -> 100. Nothing -> blank (ServiceNow keeps 0).
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');
    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\s*\(closed\)/i.test(nm)) return '100';
    var col = '';
    var d = new GlideRecord('sys_dictionary');               // the "% Complete" column, found by its label
    d.addQuery('name', source.getTableName()); d.addQuery('column_label', '% Complete'); d.query();
    if (d.next()) col = d.getValue('element');
    var raw = col ? (source.getValue(col) || '').trim() : '';
    if (!raw || raw == 'undefined') return '';
    var n = parseFloat(raw.replace('%', ''));
    if (isNaN(n)) return '';
    if (raw.indexOf('%') < 0 && n <= 1) n = n * 100;         // 0.5 -> 50
    return String(Math.max(0, Math.min(100, Math.round(n))));
})(source);
