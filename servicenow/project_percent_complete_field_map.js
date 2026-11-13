// Field map script on the Projects map: Target field = percent_complete (Use source script, Choice action ignore).
// Adaptive project "Schedule % Complete" (PercentCompleted), whole number 0-100. Staging column "Schedule % Complete"
// on u_import_adaptive_projects. ServiceNow may later re-calculate it from the tasks - both come from Adaptive.
answer = (function transformEntry(source) {
    var v = parseFloat(source.getValue('u_schedule___complete'));
    if (isNaN(v)) return '';
    return String(Math.max(0, Math.min(100, Math.round(v))));
})(source);
