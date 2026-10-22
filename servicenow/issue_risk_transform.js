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
    var p = null;                                          // the migrated project OR demand
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    if (!p) { ignore = true; return; }   // project not migrated
    target.parent = p.getUniqueValue();          // dev confirms the issue field that holds the project
    var parts = [];
    function add(label, v) { v = (v + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim(); if (v) parts.push(label + ':\n' + v); }
    add('Description', source.u_description);
    add('Reason for Change', source.u_reason_for_change);
    add('Status Update', source.u_status_update);
    target.description = parts.join('\n\n');
    if (!(source.u_open_date + '')) target.opened_at = source.u_opening_date + '';   // fallback when C_OpenDate is blank
})(source, map, log, target);

// ---------- RISK: field map -> risk_state (form label "State": -5 Pending, 1 Open, 2 Work in Progress, 3 Closed Complete) ----------
// Adaptive lifecycle is in "Risk Impact" (Identified 24, Mitigation Strategy Invoked 4, Risk Resolved 29); State is
// blank except 1 "Resolved".
answer = (function transformEntry(source) {
    if ((source.u_state + '').trim() == 'Resolved') return '3';
    var map = { 'identified': '1', 'mitigation strategy invoked': '2', 'mitigation strategy acceptable': '2', 'risk resolved': '3' };
    var v = (source.u_risk_impact + '').toLowerCase().trim();
    if (!map[v]) log.warn('Unmapped Risk Impact "' + source.u_risk_impact + '" on ' + source.u_title + ' - set to Open');
    return map[v] || '1';
})(source);

// ---------- RISK: field map -> impact (1 High, 2 Medium, 3 Low) from Adaptive "Impact Rating" (High / Med / Low) ----------
answer = (function transformEntry(source) {
    var map = { 'high': '1', 'med': '2', 'medium': '2', 'low': '3' };
    return map[(source.u_impact_rating + '').toLowerCase().trim()] || '';
})(source);

// ---------- RISK: field map -> probability (high / moderate / low) from Adaptive "Probability of Risk occurring" ----------
// ✏️ Needs the Adaptive field (staging column "Probability"). Blank in Adaptive -> blank here (do NOT use Impact Rating).
answer = (function transformEntry(source) {
    var map = { 'high': 'high', 'med': 'moderate', 'medium': 'moderate', 'moderate': 'moderate', 'low': 'low' };
    return map[(source.u_probability + '').toLowerCase().trim()] || '';
})(source);

// ---------- RISK: field map -> state (form label "Risk status": pending, accept, mitigate, avoid, transfer, achieved, not_achieved) ----------
// From Adaptive "Risk Strategy" (e.g. Accepted). ✏️ Needs the Adaptive field (staging column "Risk Strategy"); blank -> pending.
answer = (function transformEntry(source) {
    var map = { 'accepted': 'accept', 'accept': 'accept', 'mitigate': 'mitigate', 'mitigated': 'mitigate',
                'avoid': 'avoid', 'avoided': 'avoid', 'transfer': 'transfer', 'transferred': 'transfer' };
    var v = (source.u_risk_strategy + '').toLowerCase().trim();
    if (v && v != 'undefined' && !map[v]) log.warn('Unmapped Risk Strategy "' + source.u_risk_strategy + '" on ' + source.u_title);
    return map[v] || 'pending';
})(source);

// ---------- RISK: onBefore (project link + history to work notes) ----------
(function runTransformScript(source, map, log, target) {
    var p = null;                                          // the migrated project OR demand
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    if (!p) { ignore = true; return; }
    target.task = p.getUniqueValue();            // risk -> project link is the mandatory "task" field
    if (action != 'insert') return;              // history notes once only: re-runs would add them again
    var notes = [];
    function add(label, v) { v = (v + '').replace(/<[^>]+>/g, ' ').trim(); if (v && v != 'undefined') notes.push(label + ' (Adaptive): ' + v); }
    add('Status', source.u_status);
    add('Update Notes', source.u_update_notes);
    add('Resolution', source.u_resolution);
    add('Date Resolved', source.u_date_resolved);
    if (notes.length) target.work_notes = notes.join('\n\n');   // the ONLY work_notes writer: remove any work_notes field map
})(source, map, log, target);

// ---------- ISSUE and RISK: field map -> assigned_to (Adaptive AssignedTo, matched by email) ----------
// Staging column "Assigned To Email" (u_assigned_to_email), filled by MAP 'Assigned To Email': 'AssignedTo.Email'.
answer = (function transformEntry(source) {
    var email = (source.u_assigned_to_email + '').toLowerCase().trim();
    if (!email || email == 'undefined' || email == 'null') return '';
    var u = new GlideRecord('sys_user');
    if (u.get('email', email)) return u.getUniqueValue();
    log.warn('No ServiceNow user for Adaptive assignee ' + email + ' on ' + source.u_correlation_id + ' - left blank');
    return '';
})(source);

// ---------- RISK: field map -> task, Coalesce = true (with u_title -> short_description, Coalesce = true) ----------
// The risk table has no correlation_id on this instance, so risks are matched on project + title.
answer = (function transformEntry(source) {
    var p = null;
    ['pm_project', 'dmn_demand'].forEach(function (t) {
        var g = new GlideRecord(t);
        if (!p && g.get('correlation_id', source.u_project_correlation_id + '')) p = g;
    });
    return p ? p.getUniqueValue() : '';
})(source);
