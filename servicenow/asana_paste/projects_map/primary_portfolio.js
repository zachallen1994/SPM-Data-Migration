// "Import Asana HR Project Portfolio Transform Map": field map -> primary_portfolio ("Portfolio")
// Every migrated Asana project goes under the ServiceNow portfolio "HR".
// Field Maps > New: Target field = primary_portfolio, Use source script = true, Choice action = ignore.
// No active portfolio named NAME -> blank + a log line (create the portfolio first - reference data).
answer = (function transformEntry(source) {
    var NAME = 'HR';                                   // ✏️ exact ServiceNow portfolio name
    var pf = new GlideRecord('pm_portfolio');
    pf.addQuery('name', NAME);
    pf.addQuery('active', true);
    pf.query();
    if (pf.next()) return pf.getUniqueValue();
    log.warn('No active ServiceNow portfolio "' + NAME + '" - portfolio left blank on ' + source.getValue('u_name'));
    return '';
})(source);
