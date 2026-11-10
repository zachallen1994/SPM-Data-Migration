// Background Script (read-only): DFCT0010737 - one project, Adaptive vs ServiceNow:
// 1) budget per Adaptive budget line (cost type / expense type) vs the project's cost plans, and whether the
//    cost type exists in ServiceNow (a missing cost type = the line is skipped -> lower total planned cost)
// 2) % complete per task: Adaptive "Schedule % Complete" vs ServiceNow percent_complete (+ whether it is a parent)
var NAME = '25255-19488-GVL Powdersville MOB';   // ✏️ exact project name (same in Adaptive and ServiceNow)
var BUDGET_FIELD = 'C_BudgetCostTest';            // as in adaptive_budget_data_source.js

function q(query) {
    var out = [], paging = { from: 0, limit: 100 };
    while (true) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(gs.getProperty('x_mig.adaptive.url') + '/data/query');
        r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ q: query, paging: paging }));
        var res = r.execute();
        if (res.getStatusCode() != 200) throw 'Adaptive ' + res.getStatusCode() + ': ' + res.getBody();
        var b = JSON.parse(res.getBody());
        out = out.concat(b.entities || []);
        if (!b.paging || !b.paging.hasMore) break;
        paging = b.paging;
    }
    return out;
}
function money(v) { return v && v.value !== undefined ? parseFloat(v.value) || 0 : parseFloat(v) || 0; }
function last(ref) { return ref && ref.id ? decodeURIComponent(String(ref.id).split('/').slice(2).join('/')) : ''; }

var p = new GlideRecord('pm_project');
if (!p.get('short_description', NAME)) { gs.print('No ServiceNow project named ' + NAME); }
else {
    var pid = p.getValue('correlation_id').replace('ADAPTIVE:', '');
    gs.print('=== ' + p.getValue('number') + ' ' + NAME + ' | ServiceNow planned cost ' + p.getValue('cost') + ' | % complete ' + p.getValue('percent_complete'));
    try {
        // 1) budget
        var total = 0;
        q("SELECT NonLaborResource.Name, ExpenseType FROM NonLaborResourceLinkDirect WHERE WorkItem = '" + pid + "'").forEach(function (l) {
            var sum = 0;
            q('SELECT ' + BUDGET_FIELD + " FROM NonLaborResourceTimePhase WHERE RelatedLink = '" + l.id + "'").forEach(function (m) { sum += money(m[BUDGET_FIELD]); });
            total += sum;
            var ct = l.NonLaborResource ? l.NonLaborResource.Name : '';
            var t = new GlideRecord('resource_type_definition');
            var exists = t.isValid() ? t.get('name', ct) : '(table?)';
            gs.print('  Adaptive line: ' + ct + ' | ' + last(l.ExpenseType) + ' | ' + Math.round(sum * 100) / 100 + ' | cost type in ServiceNow: ' + exists);
        });
        gs.print('  Adaptive budget lines total: ' + Math.round(total * 100) / 100);
        var cp = new GlideAggregate('cost_plan');
        cp.addQuery('task', p.getUniqueValue());
        cp.addAggregate('SUM', 'unit_cost'); cp.addAggregate('COUNT');
        cp.groupBy('resource_type'); cp.query();
        while (cp.next()) gs.print('  ServiceNow cost plans: ' + cp.getDisplayValue('resource_type') + ' | ' + cp.getAggregate('COUNT') + ' plans | ' + cp.getAggregate('SUM', 'unit_cost'));

        // 2) % complete
        gs.print('=== % complete (Adaptive vs ServiceNow)');
        var ad = {};
        q("SELECT Name, PercentCompleted FROM Task WHERE Project = '" + pid + "'").forEach(function (t) { ad['ADAPTIVE:' + t.id] = t.PercentCompleted; });
        var st = new GlideRecord('pm_project_task');
        st.addQuery('top_task', p.getUniqueValue());
        st.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
        st.orderBy('start_date');
        st.setLimit(30);
        st.query();
        var diff = 0;
        while (st.next()) {
            var a = ad[st.getValue('correlation_id')], s = parseFloat(st.getValue('percent_complete')) || 0;
            var kids = new GlideAggregate('pm_project_task'); kids.addQuery('parent', st.getUniqueValue()); kids.addAggregate('COUNT'); kids.query(); kids.next();
            var parent = parseInt(kids.getAggregate('COUNT'), 10) > 0;
            var same = Math.round(parseFloat(a) || 0) == Math.round(s);
            if (!same) diff++;
            gs.print('  ' + (same ? 'ok   ' : 'DIFF ') + st.getValue('number') + ' | Adaptive ' + a + ' | ServiceNow ' + s + (parent ? ' | parent (calculated)' : '') + ' | ' + st.getValue('short_description'));
        }
        gs.print('  tasks with a different % complete: ' + diff + ' (first 30)');
        var stg = new GlideRecord('u_import_adaptive_project_tasks');
        stg.addNotNullQuery('u_complete'); stg.addQuery('u_complete', '!=', '0'); stg.setLimit(1); stg.query();
        gs.print('  staging column u_complete has non-zero values: ' + stg.hasNext());
        var fm = new GlideRecord('sys_transform_entry');
        fm.addQuery('map.source_table', 'u_import_adaptive_project_tasks'); fm.addQuery('target_field', 'percent_complete'); fm.query();
        gs.print('  field map to percent_complete on the tasks map: ' + fm.hasNext());
    } catch (err) { gs.print('ERROR: ' + err); }
}
