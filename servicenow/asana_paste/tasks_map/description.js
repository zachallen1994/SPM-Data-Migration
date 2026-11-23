answer = (function transformEntry(source) {
    function v(c) { var x = source.isValidField(c) ? (source.getValue(c) || '').trim() : ''; return x == 'undefined' ? '' : x; }
    var col = '';
    var d = new GlideRecord('sys_dictionary');               // the free-text "Assigned To" column, found by its label
    d.addQuery('name', source.getTableName()); d.addQuery('column_label', 'Assigned To'); d.query();
    if (d.next()) col = d.getValue('element');
    var lines = [];
    if (v('u_notes')) lines.push(v('u_notes'));
    if (col && v(col)) lines.push('Assigned To (Asana): ' + v(col));
    if (v('u_task_status')) lines.push('Asana status: ' + v('u_task_status'));
    return lines.join('\n');
})(source);
