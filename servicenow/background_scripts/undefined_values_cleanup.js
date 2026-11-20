// Background Script: clear the text "undefined" that old field map scripts wrote on migrated projects
// (e.g. Executive Sponsor, Business Category when Adaptive had no value). Business rules stay ON.
// A re-run of the transform cannot clear them (blank is not copied: "Copy empty fields" is off), so this does it once.
// DRY_RUN = true first: it only lists what it would clear.
var DRY_RUN = true;                                          // ✏️ false to clear
var TABLE = 'pm_project';                                    // ✏️ 'pm_project' or 'dmn_demand'
var FIELDS = ['u_executive_sponsor', 'u_business_category']; // ✏️ fields to clean (demands: ['demand_manager'])
var p = new GlideRecord(TABLE);
p.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
var qc = null;
FIELDS.forEach(function (f) { if (p.isValidField(f)) qc = qc ? qc.addOrCondition(f, 'undefined') : p.addQuery(f, 'undefined'); });
p.query();
var n = 0;
while (p.next()) {
    var cleared = [];
    FIELDS.forEach(function (f) { if (p.getValue(f) == 'undefined') { cleared.push(f); if (!DRY_RUN) p.setValue(f, ''); } });
    if (!cleared.length) continue;
    n++;
    if (!DRY_RUN) p.update();
    gs.print((DRY_RUN ? 'would clear ' : 'cleared ') + cleared.join(', ') + ' on ' + p.getValue('number') + ' ' + p.getValue('short_description'));
}
gs.print((DRY_RUN ? 'DRY RUN - ' : '') + n + ' projects');
