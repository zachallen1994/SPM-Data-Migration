// Adaptive Issues -> issue and Adaptive Risks -> risk. Value tables from the Adaptive profile of 500 records each.
// State tables are PROPOSED (BA to confirm). Any value not listed is logged and the field is left as is.
// Each PART is pasted into a field map with "Use source script" = true, or into an onBefore script.

// ---------- ISSUE: field map -> state ----------
// Adaptive's State is mostly left at "Submitted"; "Issue Current Status" is what users maintain.
answer = (function transformEntry(source) {
    var lifecycle = (source.u_state + '').trim();                       // Submitted | Resolved | Closed
    if (lifecycle == 'Resolved' || lifecycle == 'Closed') return 'Closed Complete';
    var map = { 'Not Started': 'Open', 'In Progress': 'Work in Progress', 'Overdue': 'Work in Progress',
                'Complete': 'Closed Complete' };
    var v = (source.u_current_status + '').trim();
    if (!map[v]) { log.warn('Unmapped Issue Current Status "' + v + '" on ' + source.u_correlation_id); return ''; }
    return map[v];          // label; set Choice action = reject on this field map and confirm labels exist on issue.state
})(source);

// ---------- ISSUE: field map -> priority ----------
answer = (function transformEntry(source) {
    var map = { 'High Priority': '2', 'Medium Priority': '3', 'Low Priority': '4' };   // 2 High, 3 Moderate, 4 Low
    return map[(source.u_priority + '').trim()] || '';
})(source);

// ---------- ISSUE: onBefore (project link + description) ----------
(function runTransformScript(source, map, log, target) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_project_correlation_id + '')) { ignore = true; return; }   // project not migrated
    target.parent = p.getUniqueValue();          // dev confirms the issue field that holds the project
    var parts = [];
    function add(label, v) { v = (v + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim(); if (v) parts.push(label + ':\n' + v); }
    add('Description', source.u_description);
    add('Reason for Change', source.u_reason_for_change);
    add('Status Update', source.u_status_update);
    target.description = parts.join('\n\n');
    if (!(source.u_open_date + '')) target.opened_at = source.u_opening_date + '';   // fallback when C_OpenDate is blank
})(source, map, log, target);

// ---------- RISK: field map -> state ----------
// Adaptive's State is mostly "Submitted"; the custom "Risk Impact" field holds the real lifecycle.
answer = (function transformEntry(source) {
    var lifecycle = (source.u_state + '').trim();                       // Submitted | In Work | Opened | Resolved | Closed | Deferred
    if (lifecycle == 'Resolved' || lifecycle == 'Closed') return 'Closed Complete';
    var map = { 'Identified': 'Open', 'Mitigation Strategy Invoked': 'Work in Progress',
                'Mitigation Strategy Acceptable': 'Work in Progress', 'Risk Resolved': 'Closed Complete' };
    var v = (source.u_risk_impact + '').trim();
    if (!map[v]) { log.warn('Unmapped Risk Impact "' + v + '" on ' + source.u_correlation_id); return ''; }
    return map[v];
})(source);

// ---------- RISK: onBefore (project link + history to work notes) ----------
(function runTransformScript(source, map, log, target) {
    var p = new GlideRecord('pm_project');
    if (!p.get('correlation_id', source.u_project_correlation_id + '')) { ignore = true; return; }
    target.parent = p.getUniqueValue();          // dev confirms the risk field that holds the project
    var notes = [];
    if ((source.u_status + '').trim()) notes.push('Status (Adaptive): ' + source.u_status);
    if ((source.u_update_notes + '').trim()) notes.push('Update Notes (Adaptive): ' + (source.u_update_notes + '').replace(/<[^>]+>/g, ' '));
    if (notes.length) target.work_notes = notes.join('\n\n');
})(source, map, log, target);
