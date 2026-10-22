// Adaptive programs -> pm_program, and projects -> their program.
//
// Map 1 "Import Adaptive Programs": u_import_adaptive_programs -> pm_program
//   Field map: u_correlation_id -> correlation_id, Coalesce = true
//   Field map: u_name -> short_description
//   Field map: u_description -> description
//   Field map: u_start_date -> start_date, u_due_date -> end_date (Date format yyyy-MM-dd)
//   Field map: Use source script, Target field = program_manager -> PART A
//   Field map: Use source script, Target field = state           -> PART B
//   (confirm program_manager / state / start_date / end_date in the pm_program dictionary)
//
// Map 2 = the EXISTING Adaptive projects map (u_import_adaptive_projects -> pm_project): add one field map
//   Field map: Use source script, Target field = primary_program -> PART C
//   (staging column "Program Correlation ID", filled by adaptive_projects_data_source.js)

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

// ---------- PART C: projects map, field map -> primary_program ----------
answer = (function transformEntry(source) {
    var id = (source.u_program_correlation_id + '').trim();
    if (!id || id == 'undefined') return '';
    var p = new GlideRecord('pm_program');
    return p.get('correlation_id', id) ? p.getUniqueValue() : '';   // program not migrated -> no link
})(source);
