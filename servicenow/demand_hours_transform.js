// Logged hours on DEMANDS: the demand map (u_import_adaptive_projects -> dmn_demand) gets one field map.
//   Field map: Use source script, Target field = demand_actual_effort
// Source: staging column "Actual Effort" (hours), filled by adaptive_projects_data_source.js from Adaptive's
// ActualEffort roll-up = the sum of the demand's time entries (proven: GBS Global Billing widget, 19 entries = 18 h).
// Projects do NOT use this: their hours come from time cards.
answer = (function transformEntry(source) {
    var hours = parseFloat(source.u_actual_effort) || 0;
    return hours > 0 ? new GlideDuration(hours * 3600 * 1000).getValue() : '';
})(source);
