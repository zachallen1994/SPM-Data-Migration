// Field map script for a REFERENCE field filled from a name in Adaptive (e.g. Rate Card -> the project / task rate
// model). Finds the referenced record by its display name (any case). No match -> blank + a log line; never "undefined".
// In the field map: Use source script = true, Choice action = ignore. Target field = the reference field.
// ✏️ Set the staging column, the referenced table and its name field (rate_card_check.js prints them):
answer = (function transformEntry(source) {
    var SOURCE_COLUMN = 'u_rate_card';
    var TABLE = 'rate_model';  // pm_project.rate_model -> rate_model (rate_card_check.js in DEV)
    var NAME_FIELD = 'name';   // ✏️ the field holding names like "BSMH"
    // Adaptive rate card -> ServiceNow rate model (confirmed by the BA, DFCT0010737).
    // Hampton Roads (1 project) is NOT mapped: HCPH is Hamilton County - left blank and logged until decided.
    var ALIASES = {
        'covenant (ghc)': 'COV', 'uva(ghc)': 'UVA', 'wyandot(ghc)': 'WMH', 'nationwide': 'NCH',
        'rsfh': 'RFSH', 'bsmh': 'BSMH', 'chesapeake(ghc)': 'CRH'
    };
    var DEFAULT = 'BSMH';      // no rate card in Adaptive -> BSMH (BA); '' = leave blank

    var v = (source.getValue(SOURCE_COLUMN) || '').trim();
    if (v == 'undefined' || v == 'null') v = '';
    if (!v) v = DEFAULT;
    if (!v || !TABLE) return '';
    var name = ALIASES[v.toLowerCase()] || v;
    var g = new GlideRecord(TABLE);
    g.addQuery(NAME_FIELD, name);
    g.setLimit(1);
    g.query();
    if (g.next()) return g.getUniqueValue();
    log.warn(TABLE + ': no record named "' + name + '" (Adaptive "' + v + '") on ' + source.getValue('u_name'));
    return '';
})(source);
