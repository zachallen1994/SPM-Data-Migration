// Field map script for a REFERENCE field filled from a name in Adaptive (e.g. Rate Card -> the project / task rate
// model). Finds the referenced record by its display name (any case). No match -> blank + a log line; never "undefined".
// In the field map: Use source script = true, Choice action = ignore. Target field = the reference field.
// ✏️ Set the staging column, the referenced table and its name field (rate_card_check.js prints them):
answer = (function transformEntry(source) {
    var SOURCE_COLUMN = 'u_rate_card';
    var TABLE = 'rate_model';  // pm_project.rate_model -> rate_model (rate_card_check.js in DEV)
    var NAME_FIELD = 'name';   // ✏️ the field holding names like "BSMH"
    // Adaptive rate card -> ServiceNow rate model name. ONLY pairs the BA has confirmed. RFSH matches as is.
    // To confirm (DEV has: CRH, RFSH, NCH, UVA, HCPH, WMH, COV, Test 1234 - no BSMH):
    //   'bsmh' (270 projects), 'chesapeake(ghc)' (16), 'covenant (ghc)' (20), 'uva(ghc)' (3), 'wyandot(ghc)' (11),
    //   'hampton roads' (1), 'nationwide' (1)
    var ALIASES = {};          // e.g. { 'covenant (ghc)': 'COV', 'uva(ghc)': 'UVA' } once confirmed

    var v = (source.getValue(SOURCE_COLUMN) || '').trim();
    if (!v || v == 'undefined' || !TABLE) return '';
    var name = ALIASES[v.toLowerCase()] || v;
    var g = new GlideRecord(TABLE);
    g.addQuery(NAME_FIELD, name);
    g.setLimit(1);
    g.query();
    if (g.next()) return g.getUniqueValue();
    log.warn(TABLE + ': no record named "' + name + '" (Adaptive "' + v + '") on ' + source.getValue('u_name'));
    return '';
})(source);
