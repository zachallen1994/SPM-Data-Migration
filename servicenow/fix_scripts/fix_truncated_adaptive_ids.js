// Fix Script: repair Adaptive correlation_ids that were cut off at 40 characters (before the column was 100).
// Looks each record up in Adaptive by its name and writes the full id back.
// DRY_RUN = true only prints what it would do. Never deletes anything: duplicates are listed for you to decide.
var DRY_RUN = true;
var TABLES = ['pm_project', 'dmn_demand'];

function fullId(name) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestBody(JSON.stringify({ q: "SELECT Name FROM Project WHERE Name = '" + name.replace(/'/g, "''") + "'", paging: { from: 0, limit: 2 } }));
    var res = r.execute();
    if (res.getStatusCode() != 200) { gs.print('  Adaptive ' + res.getStatusCode() + ': ' + res.getBody()); return null; }
    var rows = JSON.parse(res.getBody()).entities || [];
    if (rows.length != 1) { gs.print('  ' + rows.length + ' Adaptive projects named "' + name + '" - fix by hand'); return null; }
    return 'ADAPTIVE:' + rows[0].id;
}

TABLES.forEach(function (table) {
    var gr = new GlideRecord(table);
    gr.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:/Project/');
    gr.query();
    while (gr.next()) {
        var now = gr.getValue('correlation_id');
        var full = fullId(gr.getValue('short_description'));
        if (!full || full == now) continue;                                   // already correct (or not found)
        var dup = new GlideRecord(table);
        if (dup.get('correlation_id', full)) {
            gs.print('DUPLICATE ' + table + ': ' + gr.getDisplayValue() + ' [' + gr.getValue('number') + '] has the cut-off id; ' +
                dup.getValue('number') + ' already has the full one. Keep one, delete the other (your call).');
            continue;
        }
        gs.print((DRY_RUN ? '[DRY RUN] would fix ' : 'Fixed ') + table + ' ' + gr.getValue('number') + ': ' + now + '  ->  ' + full);
        if (!DRY_RUN) {
            gr.setValue('correlation_id', full);
            gr.setWorkflow(false);                                              // id fix only: no business rules
            gr.update();
        }
    }
});
