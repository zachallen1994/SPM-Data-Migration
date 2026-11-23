// Task states with a state bucket only: 1 Open, 2 Work in Progress, 3 Closed Complete, 4 Closed Incomplete.
// Completed box ticked, or PMO/Task Status exactly "Complete(d)" -> Closed Complete. "In Progress, Complete" with the
// box NOT ticked -> Work in Progress.
answer = (function transformEntry(source) {
    var s = (source.getValue('u_task_status') || '').toLowerCase().trim();
    var nm = (source.getValue('u_task_name') || source.getValue('u_name') || '');
    if ((source.getValue('u_completed') || '') == 'true' || /^(complete|completed|done)$/.test(s) || /^\s*\(closed\)/i.test(nm)) return '3';
    if (s.indexOf('cancel') > -1) return '4';
    if (s.indexOf('progress') > -1 || s.indexOf('started/') > -1 || s.indexOf('scoping') > -1 || s.indexOf('delayed') > -1) return '2';
    return '1';
})(source);
