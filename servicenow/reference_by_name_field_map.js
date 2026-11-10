// Field map script for a REFERENCE field filled from a name in Adaptive (e.g. Rate Card -> the project / task rate
// model). Finds the referenced record by its display name (any case). No match -> blank + a log line; never "undefined".
// In the field map: Use source script = true, Choice action = ignore. Target field = the reference field.
// ✏️ Set the staging column, the referenced table and its name field (rate_card_check.js prints them):
answer = (function transformEntry(source) {
    var SOURCE_COLUMN = 'u_rate_card';
    var TABLE = '';            // ✏️ e.g. the table the rate model field references
    var NAME_FIELD = 'name';   // ✏️ the field holding names like "BSMH"
    var ALIASES = {};          // lower-case Adaptive name -> exact ServiceNow name, e.g. { 'default rate card': 'Default' }

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
