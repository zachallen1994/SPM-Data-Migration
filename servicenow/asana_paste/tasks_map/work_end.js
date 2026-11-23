answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var closed = (source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || s.indexOf('cancel') > -1 ||
        /^\s*\(closed\)/i.test(source.getValue('u_task_name') || source.getValue('u_name') || '');
    if (!closed) return '';
    return (source.getValue('u_due_date') || source.getValue('u_start_date') || '').substring(0, 10);
})(source);
