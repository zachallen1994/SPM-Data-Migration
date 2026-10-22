// Background Script (read-only): which rule puts migrated time cards back to "Pending"?
// Prints, for every active insert-time business rule on time_card (and time_sheet), its condition and the script
// lines that mention state / Pending / Processed. Also shows the time sheet of one migrated card.
var CARD_TASK = 'DMND0002548';     // ✏️ a demand / project / task number that has migrated cards

['time_card', 'time_sheet'].forEach(function (table) {
    var br = new GlideRecord('sys_script');
    br.addQuery('collection', table);
    br.addQuery('active', true);
    br.addQuery('action_insert', true);
    br.orderBy('when');
    br.orderBy('order');
    br.query();
    while (br.next()) {
        gs.print('=== ' + table + ' | ' + br.getValue('name') + ' (' + br.getValue('when') + ', order ' + br.getValue('order') + ')');
        if (br.getValue('condition')) gs.print('    condition: ' + br.getValue('condition'));
        if (br.getValue('filter_condition')) gs.print('    filter: ' + br.getValue('filter_condition'));
        if (br.getValue('template')) gs.print('    sets fields: ' + br.getValue('template'));
        var lines = (br.getValue('script') || '').split('\n');
        for (var i = 0; i < lines.length; i++)
            if (/state|pending|processed|submitted|approv/i.test(lines[i])) gs.print('    ' + (i + 1) + ': ' + lines[i].trim());
    }
});

// One migrated card: its state and its time sheet (a card's state can follow its time sheet)
var t = new GlideRecord('task');
if (t.get('number', CARD_TASK)) {
    var tc = new GlideRecord('time_card');
    tc.addQuery('task', t.getUniqueValue());
    tc.setLimit(3);
    tc.query();
    while (tc.next()) {
        gs.print('card ' + tc.getDisplayValue('user') + ' week ' + tc.getValue('week_starts_on') + ' | state ' + tc.getValue('state') +
            ' | time sheet ' + (tc.getValue('time_sheet') ? tc.getDisplayValue('time_sheet') + ' (state ' + tc.time_sheet.state + ')' : '(none)'));
    }
} else gs.print('No task with number ' + CARD_TASK);
