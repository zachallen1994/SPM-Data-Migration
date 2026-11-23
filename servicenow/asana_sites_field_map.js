// "Import Asana HR Project Portfolio Transform Map": field map -> u_sites (Sites, a LIST of Question Choices)
// Use source script = true, Choice action = ignore. Replaces the current u_sites script.
// Asana "Organization" (column Entity/Organization), e.g. "BSMH, RSFH" -> the matching Question Choice records.
// Sites choices seen in DEV: Advantus Health Partners, Affiliate, Chesapeake (GHC), Cincinnati, Conduit Health,
// Covenant (GHC), Ensemble, Enterprise, Global Business Services (GBS), Greenville, Hampton Roads, Harness Health
// Partners, Home Office, Ireland, Kentucky, Lima, Lorain, Nationwide (GHC), Richmond, Roper St. Francis Healthcare,
// Shelter Arms (GHC), Springfield, Toledo, Wyandot (GHC), Youngstown.
// Unmatched values -> left out + a log line. Nothing matched -> blank (never "undefined").
answer = (function transformEntry(source) {
    var ALIASES = {                                   // ✏️ Asana value (lower case) -> Sites choice text
        'rsfh': 'Roper St. Francis Healthcare',
        'gbs': 'Global Business Services (GBS)'
        // 'bsmh': '???',                             // ✏️ confirm with HR PMO / BA (Enterprise? Home Office?)
        // 'external partners': '???'
    };
    var QUESTION = '';                                // ✏️ optional: sys_id of the question these choices belong to
    var raw = (source.getValue('u_entity_organization') || '').trim();
    if (!raw || raw == 'undefined') return '';
    var ids = [];
    raw.split(/\s*[,;]\s*/).forEach(function (v) {
        if (!v) return;
        var text = ALIASES[v.toLowerCase()] || v;
        var q = new GlideRecord('question_choice');
        q.addQuery('text', text);
        if (QUESTION) q.addQuery('question', QUESTION);
        q.query();
        if (q.getRowCount() == 1 && q.next()) { if (ids.indexOf(q.getUniqueValue()) < 0) ids.push(q.getUniqueValue()); return; }
        log.warn('Sites: ' + (q.getRowCount() ? 'more than one choice "' + text + '" (set QUESTION)' : 'no choice for "' + v + '"') +
            ' on ' + source.getValue('u_name'));
    });
    return ids.join(',');
})(source);
