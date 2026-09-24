# 05: ServiceNow build (import sets, transform maps, scripts)

Everything here goes into **one update set** (for example, `SPM Migration - Build`)
so you can move it from dev to test to prod unchanged.

## 1. Custom fields (once)

| Table | Field | Type | Notes |
|---|---|---|---|
| `task` | `u_legacy_id` | String 100 | Add it to the Project, Demand and Project Task forms and list views |
| `task` | `u_legacy_url` | URL | |

If your governance won't allow new fields on `task`, add them to `pm_project`,
`dmn_demand` and `pm_project_task` separately.

## 2. Import set tables and transform maps

Create each staging table by loading the matching file from `data/load/` once
(*System Import Sets → Load Data → Create table*). The table names below are
suggestions.

| Load file | Import set table | Target table | Coalesce |
|---|---|---|---|
| `<source>/01_dmn_demand.csv` | `u_imp_<source>_demand` | `dmn_demand` | `correlation_id` |
| `<source>/02_pm_project.csv` | `u_imp_<source>_project` | `pm_project` | `correlation_id` |
| `<source>/03_pm_project_task.csv` | `u_imp_<source>_task` | `pm_project_task` | `correlation_id` |
| `<source>/04_planned_task_rel_planned_task.csv` | `u_imp_<source>_dependency` | `planned_task_rel_planned_task` | `parent` + `child` (scripted) |
| `<source>/05_project_status.csv` | `u_imp_<source>_status` | `project_status` | `project` + `as_on` (scripted) |

**Column names.** ServiceNow adds `u_` to every CSV header, so the load files carry
**no** `u_` prefix. `correlation_id` becomes staging column `u_correlation_id` → target
`correlation_id`, and `cn` becomes `u_cn` → custom target `u_cn`. There is never a `u_u_`
column. Because staging names line up with target names, *Auto Map Matching Fields* creates
most field maps for you.

### Field map settings that matter

| Setting | Value | Why |
|---|---|---|
| Coalesce | On `correlation_id` only | Re-runs update records instead of duplicating them |
| **Reference fields** (`assigned_to`, `project_manager`, `opened_by`) | *Referenced value field name* = `email`. **Choice action = ignore** | The default *create* makes a new `sys_user` for every unmatched email |
| Reference fields (`primary_portfolio`, `portfolio`, `primary_program`, `department`) | *Referenced value field name* = `name`. Choice action = **ignore** (or **reject** during mock loads to surface gaps) | |
| Choice fields (`state`, `type`, `category`, `priority`) | Choice action = **reject** during mock loads | Bad values fail loudly instead of becoming new choices |
| Date fields | Date format `yyyy-MM-dd` | The load files use ISO dates |
| *Run business rules* | **On** for projects and tasks | `top_task`, rollups and the WBS depend on them. See the gotchas in doc 01 |
| *Enforce mandatory fields* | *No* for mock loads, then *Yes* for the final load | |

## 3. Script Include: `SPMMigrationUtil`

*System Definition → Script Includes → New.* Name it `SPMMigrationUtil`, leave
*Client callable* unchecked, and make it accessible from all application scopes if
the transform maps sit in a scope.

```javascript
var SPMMigrationUtil = Class.create();
SPMMigrationUtil.prototype = {
    initialize: function () {
        this._cache = {};
    },

    /** Read import-set column u_<name> (load-file headers have no u_ prefix). */
    col: function (source, name) {
        var v = source.getValue('u_' + name);
        return JSUtil.nil(v) ? '' : String(v);
    },

    /** sys_id of the record on `table` (or its children) with this correlation_id. */
    byCorrelation: function (table, corr) {
        if (!corr) return '';
        var key = table + '|' + corr;
        if (this._cache[key]) return this._cache[key];
        var gr = new GlideRecord(table);
        gr.addQuery('correlation_id', corr);
        gr.setLimit(1);
        gr.query();
        var id = gr.next() ? gr.getUniqueValue() : '';
        if (id) this._cache[key] = id;
        return id;
    },

    userByEmail: function (email) {
        if (!email) return '';
        var gr = new GlideRecord('sys_user');
        gr.addQuery('email', email.toLowerCase());
        gr.addActiveQuery();
        gr.setLimit(1);
        gr.query();
        return gr.next() ? gr.getUniqueValue() : '';
    },

    type: 'SPMMigrationUtil'
};
```

## 4. Transform scripts

### `u_imp_<source>_project` → `pm_project`: onBefore (both sources)
```javascript
(function runTransformScript(source, map, log, target) {
    var u = new SPMMigrationUtil();
    var demandCorr = u.col(source, 'demand_correlation_id');
    if (demandCorr) {
        var demandId = u.byCorrelation('dmn_demand', demandCorr);
        if (demandId) target.demand = demandId;
        else log.warn('Demand not found for ' + demandCorr + ' (project ' + u.col(source, 'correlation_id') + ')');
    }
    // Optional two-pass close: set sys_property spm.migration.pass = 1 for the first run.
    // Closed projects are inserted as Work in Progress, then closed on pass 2 once tasks exist.
    if (gs.getProperty('spm.migration.pass', '2') == '1' && ['3', '4', '7'].indexOf(String(target.state)) > -1) {
        target.state = 2;
    }
})(source, map, log, target);
```

### `u_imp_<source>_task` → `pm_project_task`: onBefore (both sources)
```javascript
(function runTransformScript(source, map, log, target) {
    var u = new SPMMigrationUtil();
    var corr = u.col(source, 'correlation_id');
    var projCorr = u.col(source, 'project_correlation_id');
    var parentCorr = u.col(source, 'parent_correlation_id');

    var projectId = u.byCorrelation('pm_project', projCorr);
    if (!projectId) {
        log.error('Task ' + corr + ': project ' + projCorr + ' not found - load projects first');
        error = true; return;
    }
    var parentId = (parentCorr == projCorr) ? projectId : u.byCorrelation('planned_task', parentCorr);
    if (!parentId) {
        log.error('Task ' + corr + ': parent ' + parentCorr + ' not found - check row order (u_level)');
        error = true; return;
    }
    target.parent = parentId;
    target.top_task = projectId;
})(source, map, log, target);
```

### List fields (`u_sites`, `impacted_business_units`, `additional_assignee_list`): field map script
The load files carry comma-separated **names** (or emails, for people). List fields store
comma-separated **sys_ids**, so resolve them in a scripted field map. For `u_sites`, adjust the
table and name field to wherever your Sites choices live:
```javascript
answer = (function transformEntry(source) {
    var u = new SPMMigrationUtil();
    var names = u.col(source, 'sites').split(',');
    var ids = [];
    for (var i = 0; i < names.length; i++) {
        var gr = new GlideRecord('cmn_location');          // <- your Sites table
        if (names[i] && gr.get('name', names[i].trim())) ids.push(gr.getUniqueValue());
        else if (names[i]) log.warn('Site not found: ' + names[i]);
    }
    return ids.join(',');
})(source);
```
Use the same pattern with `business_unit` (match on `name`) for `impacted_business_units`, and
with `u.userByEmail()` for `additional_assignee_list`.

### `u_imp_<source>_dependency` → `planned_task_rel_planned_task`: field maps (both sources)
Create two **scripted field maps** and set both to *Coalesce*.

`parent` (the predecessor):
```javascript
answer = (function transformEntry(source) {
    var u = new SPMMigrationUtil();
    return u.byCorrelation('planned_task', u.col(source, 'predecessor_correlation_id'));
})(source);
```
`child` (the successor):
```javascript
answer = (function transformEntry(source) {
    var u = new SPMMigrationUtil();
    return u.byCorrelation('planned_task', u.col(source, 'successor_correlation_id'));
})(source);
```
Also add an onBefore that sets `ignore = true` when either value is empty, so orphan
links are skipped rather than half-created.

### `u_imp_<source>_status` → `project_status`: field maps
Add a scripted `project` field map (*Coalesce*) that returns
`u.byCorrelation('pm_project', u.col(source, 'project_correlation_id'))`, and map
`as_on` directly (*Coalesce*).

## 5. Load order (every mock load and the final load)

1. Reference data check: portfolios, programs, departments and users exist.
   Compare `data/load/users_referenced.csv` with `sys_user`.
2. `01_dmn_demand.csv`
3. `02_pm_project.csv`, with `spm.migration.pass = 1` if you use the two-pass close
4. `03_pm_project_task.csv`. The file is sorted by `u_level`. For very deep or large
   WBS files, split them by level and load level 1, then 2, and so on
5. `04_planned_task_rel_planned_task.csv`
6. `05_project_status.csv`
7. Pass 2 (only for two-pass): set `spm.migration.pass = 2` and re-run the project
   transform. Coalesce updates the state
8. Run the project **Recalculate** action on a sample of projects and check the
   dates are unchanged

## 6. Automating loads (optional)

For repeatable mock loads, use a scheduled *Data Source* (File, CSV, attached or via
MID Server SFTP) with the transform maps attached. Or push rows through the Import Set
API:

```
POST https://<instance>.service-now.com/api/now/import/u_imp_adaptive_project/insertMultiple
Authorization: Basic ... (integration user with import_transformer role)
Content-Type: application/json
{"records": [ { "correlation_id": "ASANA:100", "short_description": "ERP Upgrade", ... } ]}
```
`insertMultiple` is available on recent releases. On older ones, post one row at a
time to `/api/now/import/{table}`.
