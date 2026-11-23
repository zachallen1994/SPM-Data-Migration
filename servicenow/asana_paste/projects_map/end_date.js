answer = (function transformEntry(source) {
    var d = (source.getValue('u_due_date') || '').substring(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + ' 17:00:00' : '';
})(source);
