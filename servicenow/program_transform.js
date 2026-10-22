// Adaptive programs -> pm_program, and projects -> their program.
//
// Map 1 "Import Adaptive Programs": u_import_adaptive_programs -> pm_program
//   Field map: u_correlation_id -> correlation_id, Coalesce = true
//   Field map: u_name -> short_description
//   Field map: u_description -> description
//   Field map: u_start_date -> start_date, u_due_date -> end_date (Date format yyyy-MM-dd)
//   Field map: Use source script, Target field = program_manager -> PART A
//   Field map: Use source script, Target field = state           -> PART B
//   Confirmed in Dev (program_fields_check.js): program_manager -> sys_user, correlation_id (100), state = task
//   choices (1 Open, 2 Work in Progress, 3 Closed Complete, 4 Closed Incomplete), start/end_date are date/time.
//
// Map 2 = the EXISTING Adaptive projects map (u_import_adaptive_projects -> pm_project): add one field map
//   Field map: Use source script, Target field = primary_program -> PART C   (confirmed: pm_project.primary_program)
//   (staging column "Program Correlation ID", filled by adaptive_projects_data_source.js)
//
// Map 3 = the EXISTING Adaptive demands map (same staging table -> dmn_demand): add the same PART C field map,
//   Target field = the demand's program field (name shown by program_fields_check.js as "dmn_demand -> program field")

// ---------- PART A: field map -> program_manager (by email) ----------
answer = (function transformEntry(source) {
    var email = (source.u_manager_email + '').toLowerCase().trim();
    var u = new GlideRecord('sys_user');
    if (email && u.get('email', email)) return u.getUniqueValue();
    if (email) log.warn('No ServiceNow user for program manager ' + email + ' on ' + source.u_name);
    return '';
})(source);

// ---------- PART B: field map -> state (active programs only are loaded) ----------
answer = (function transformEntry(source) {
    var map = { 'active': '2', 'draft': '1', 'on hold': '1', 'completed': '3', 'cancelled': '4' };
    return map[(source.u_state + '').toLowerCase().trim()] || '1';
})(source);

// ---------- PART C: projects map -> primary_program; demands map -> the demand's program field ----------
answer = (function transformEntry(source) {
    var id = (source.u_program_correlation_id + '').trim();
    if (!id || id == 'undefined') return '';
    var p = new GlideRecord('pm_program');
    return p.get('correlation_id', id) ? p.getUniqueValue() : '';   // program not migrated -> no link
})(source);
