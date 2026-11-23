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
