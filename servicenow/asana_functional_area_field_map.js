// "Import Asana HR Project Portfolio Transform Map": field map -> u_functional_area (Functional Area)
// Use source script = true, Choice action = ignore. Replaces the current u_functional_area script.
// Source: the tracker SECTION (column Section/Column), e.g. "Retirement" -> Retirement, "Labor" -> Labor.
// Matched against the ACTIVE Functional Area choices by label or value (any case, "&"/"and" and spaces ignored).
// "Benefits & Well-Being" is two choices in ServiceNow, so the row decides:
//   1. HR COEs Engaged names "HWB - Well-Being" and not "HWB - Benefits"  -> Well-Being
//   2. HR COEs Engaged names "HWB - Benefits"                              -> Benefits
//   3. else the project name: well-being / wellness / be well / fit / flu  -> Well-Being
//   4. else                                                                -> Benefits
// No matching choice -> blank + a log line (no new choices are made). Regular Asana projects have no section -> blank.
answer = (function transformEntry(source) {
    var ALIASES = {                          // ✏️ section (normalised) -> Functional Area choice LABEL, only where they differ
        // 'hrsps hr ops': 'HR Operations',
    };
    function n(x) { return String(x || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
    var section = (source.getValue('u_section_column') || '').trim();
    if (!section || section == 'undefined') return '';
    var want = section;
    if (n(section) == n('Benefits & Well-Being')) {
        var coes = n(source.getValue('u_hr_coes_engaged')), name = n(source.getValue('u_name'));
        var wb = coes.indexOf('hwb well being') > -1, ben = coes.indexOf('hwb benefits') > -1;
        if (wb && !ben) want = 'Well-Being';
        else if (ben) want = 'Benefits';
        else if (/well being|wellness|be well|fit testing|flu/.test(name)) want = 'Well-Being';
        else want = 'Benefits';
    }
    if (ALIASES[n(want)]) want = ALIASES[n(want)];
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', 'IN', 'pm_project,planned_task,task');
    c.addQuery('element', 'u_functional_area');
    c.addQuery('inactive', false);
    c.query();
    while (c.next()) if (n(c.getValue('label')) == n(want) || n(c.getValue('value')) == n(want)) return c.getValue('value');
    log.warn('Functional Area: no choice for "' + want + '" (section "' + section + '") on ' + source.getValue('u_name'));
    return '';
})(source);
