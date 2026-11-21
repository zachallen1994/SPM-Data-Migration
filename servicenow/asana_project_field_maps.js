// "Import Asana HR Project Portfolio Transform Map" (u_import_asana_hr_project_portfolio -> pm_project)
// Field maps for the agreed September mapping (docs/07_mapping_review.md, "Asana HR tracker") that were missing.
// Each: Field Maps > New, Use source script = true, Choice action = ignore. Never returns "undefined".

// ---------- PART A: field map -> description ("Detailed Description") ----------
// Notes + the HR-only attributes as a readable block (agreed: description block, D6).
answer = (function transformEntry(source) {
    function v(c) { var x = (source.getValue(c) || '').trim(); return (x == 'undefined' || x == 'null') ? '' : x; }
    var lines = [];
    if (v('u_notes')) lines.push(v('u_notes'), '');
    [['Size/Complexity', 'u_size_complexity'], ['I&T Integrations Needed', 'u_i_t_integrations_needed'],
     ['Strategy Focus', 'u_strategy_focus'], ['Strategy Timeline', 'u_strategy_timeline'],
     ['Entity/Organization', 'u_entity_organization'], ['HR COEs Engaged', 'u_hr_coes_engaged'],
     ['HR Cross-Impacts', 'u_hr_cross_impacts'], ['Asana Project Status', 'u_project_status']].forEach(function (f) {
        if (v(f[1])) lines.push(f[0] + ': ' + v(f[1]));
    });
    if (!lines.length) return '';
    return 'Migrated from Asana (HR Project Portfolio 2026)\n' + lines.join('\n');
})(source);

// ---------- PART B: field map -> primary_program ("Program") from Section/Column ----------
// Agreed: Section/Column (e.g. "Benefits & Well-Being") = an HR program. Uses an ACTIVE program with that exact name;
// none -> blank + log (the programs are reference data the implementation team creates).
answer = (function transformEntry(source) {
    var name = (source.getValue('u_section_column') || '').trim();
    if (!name || name == 'undefined') return '';
    var g = new GlideRecord('pm_program');
    g.addQuery('short_description', name);
    g.query();
    if (g.next()) return g.getUniqueValue();
    log.warn('No ServiceNow program named "' + name + '" - program left blank on ' + source.getValue('u_name'));
    return '';
})(source);
