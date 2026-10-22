// Background Script (read-only): why did the GBS demand get no time cards? Follows it through every step.
var ADAPTIVE_ID = '/Project/5tgehclxymxcqbq18bpti0ybs473';   // GBS Global Billing Information Widget (from demand_hours_check)

// 1. Is the demand in ServiceNow with the full Adaptive id?
var dm = new GlideRecord('dmn_demand');
gs.print('1. dmn_demand with correlation_id ADAPTIVE:' + ADAPTIVE_ID + ': ' +
    (dm.get('correlation_id', 'ADAPTIVE:' + ADAPTIVE_ID) ? dm.getValue('number') : 'NOT FOUND'));
var any = new GlideRecord('dmn_demand');
any.addQuery('short_description', 'CONTAINS', 'GBS Global Billing');
any.query();
while (any.next()) gs.print('   demand ' + any.getValue('number') + ' has correlation_id [' + any.getValue('correlation_id') + ']');

// 2. Did the time card data source write rows for it? (latest load)
//    The staging table name is read from the time card data source itself.
var ds = new GlideRecord('sys_data_source');
ds.addQuery('name', 'CONTAINS', 'Time Card');
ds.query();
var STAGING = ds.next() ? ds.getValue('import_set_table_name') : '';
gs.print('2. data source "' + ds.getValue('name') + '" writes to table: ' + (STAGING || 'NOT FOUND - check the data source name'));
var rows = new GlideRecord(STAGING || 'sys_import_set_row');
rows.addQuery('u_project_correlation_id', 'ADAPTIVE:' + ADAPTIVE_ID);
rows.orderByDesc('sys_created_on');
rows.query();
gs.print('2. staging rows for the demand: ' + rows.getRowCount());
var n = 0;
while (rows.next() && n++ < 10) {
    gs.print('   ' + rows.getValue('u_resource_email') + ' | week ' + rows.getValue('u_week_starts_on') + ' | ' + rows.getValue('u_total') +
        ' h | task id ' + rows.getValue('u_task_correlation_id') + ' | state ' + rows.getValue('sys_import_state') +
        ' | ' + (rows.getValue('sys_import_state_comment') || ''));
}

// 3. Time cards on the demand
var tc = new GlideAggregate('time_card');
if (dm.isValidRecord()) tc.addQuery('task', dm.getUniqueValue()); else tc.addQuery('task', 'NONE');
tc.addAggregate('COUNT');
tc.addAggregate('SUM', 'total');
tc.query();
if (tc.next()) gs.print('3. time cards on the demand: ' + tc.getAggregate('COUNT') + ' (' + (tc.getAggregate('SUM', 'total') || 0) + ' h)');
