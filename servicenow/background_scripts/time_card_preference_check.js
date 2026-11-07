// Background Script (read-only): the OOB rule "Check if time cards allowed" blocks a time card when the project's
// "Time card preference" (pm_project.time_card_preference) does not allow it:
//   no_time_card -> no cards at all | project -> only on the project | project_task -> only on project tasks
// Migrated time goes on the project task when it was migrated, else on the project - so both must be allowed.
// Shows the choices, the dictionary default, and the values on migrated projects.
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'IN', 'pm_project,planned_task,task');
c.addQuery('element', 'time_card_preference');
c.query();
while (c.next()) gs.print('choice: ' + c.getValue('value') + ' = ' + c.getValue('label') + (c.getValue('inactive') == '1' ? ' (inactive)' : ''));
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'IN', 'pm_project,planned_task,task');
d.addQuery('element', 'time_card_preference');
d.query();
while (d.next()) gs.print('dictionary on ' + d.getValue('name') + ': default "' + (d.getValue('default_value') || '') + '"');
var g = new GlideAggregate('pm_project');
g.addQuery('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
g.addAggregate('COUNT');
g.groupBy('time_card_preference');
g.query();
while (g.next()) gs.print('migrated projects with preference "' + (g.getValue('time_card_preference') || '(blank)') + '": ' + g.getAggregate('COUNT'));
