answer = (function transformEntry(source) {
    var d = (source.getValue('u_start_date') || '').substring(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + ' 08:00:00' : '';
})(source);
