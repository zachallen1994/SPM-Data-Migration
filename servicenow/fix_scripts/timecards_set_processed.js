// Fix Script: set migrated time cards to Processed so their hours roll up to actual effort.
// Use ONLY after the manual test worked (one card set to Processed by hand stayed Processed and the
// demand / project Actual Effort went up). Only cards created by the time card transform are touched.
var DRY_RUN = true;                          // ✏️ true = only count; false = update
var TRANSFORM = 'Import Adaptive Time Cards'; // ✏️ the transform map name
var ONLY_TASK = '';                          // ✏️ test on one record first, e.g. 'DMND0002548'; '' = all
gs.info('timecards_set_processed VERSION 1');

var c = new GlideRecord('sys_choice');
c.addQuery('name', 'time_card'); c.addQuery('element', 'state'); c.addQuery('label', 'Processed'); c.query();
var PROCESSED = c.next() ? c.getValue('value') : 'Processed';

var row = new GlideAggregate('sys_import_set_row');
row.addQuery('sys_target_table', 'time_card');
row.addQuery('sys_transform_map.name', TRANSFORM);
row.addNotNullQuery('sys_target_sys_id');
row.groupBy('sys_target_sys_id');
row.query();
var found = 0, changed = 0, stuck = 0;
while (row.next()) {
    var tc = new GlideRecord('time_card');
    if (!tc.get(row.getValue('sys_target_sys_id'))) continue;
    if (ONLY_TASK && tc.task.number + '' != ONLY_TASK) continue;
    found++;
    if (tc.getValue('state') == PROCESSED) continue;
    if (DRY_RUN) { changed++; continue; }
    tc.setValue('state', PROCESSED);
    tc.update();                                         // business rules run, so actual effort rolls up
    tc.get(tc.getUniqueValue());
    if (tc.getValue('state') == PROCESSED) changed++; else stuck++;
}
gs.info((DRY_RUN ? 'DRY RUN - would set ' : 'Set ') + changed + ' of ' + found + ' migrated time cards to Processed' +
    (stuck ? '; ' + stuck + ' did not stay Processed (a business rule changed them)' : ''));
