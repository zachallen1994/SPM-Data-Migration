# 10: Getting the data out when you don't have Asana or Adaptive access

**You don't need access to Asana or Adaptive.** The people who do send you **export
files**. You run this pipeline on those files. Your ServiceNow developer loads the results
into Dev, then Test, then Prod. There's no API setup and no connection between the systems.

```
 Asana owner ──── CSV exports ─────┐
                                   ├──▶  You (a laptop with Python + this repo)  ──▶  load files  ──▶  ServiceNow developer
 Adaptive owner ── Excel exports ──┘      import-*-exports → run-all → checks            (CSV)          Dev → Test → Prod
```

| Who | Does what | Access needed |
|---|---|---|
| **Asana owner** (HR PMO admin) | Exports the HR portfolio tracker and each project-plan project as CSV | Asana (they have it) |
| **Adaptive owner** (Nordic PMO / Adaptive admin) | Exports projects, tasks, milestones and dependencies from saved views | Adaptive (they have it) |
| **You** | Put the files in `data/exports/`, run 3 commands, clear the check reports, and hand the load files over | Python on any Windows or Mac machine. **No** source-system access |
| **You, in ServiceNow** | Export `sys_user` (users), `sys_dictionary` and `sys_choice` into `data/reference/` | ServiceNow (you have it) |
| **ServiceNow developer** | Loads the files through the import sets and transform maps (stories MIG-05 to MIG-13) | ServiceNow |

> **If the owners would rather hand over access than export:** ask them for a **read-only
> service-account token** (an Asana Personal Access Token, and an Adaptive API key). You then run
> `extract-asana` / `extract-adaptive` instead, and nobody has to export anything. It's
> repeatable and exact, and it's the better choice if you'll do several mock loads.
> Everything after that step is identical.

---

## 1. What to ask the system owners for (copy and send)

> **Subject: Data export for the ServiceNow SPM migration: [mock load 1 | FINAL]**
>
> Hi. For the ServiceNow migration we need the following exports. Please **don't open or
> re-save the files in Excel** before sending them. Excel damages long ID numbers and special
> characters.
>
> **Asana (HR):**
> 1. The *HR Project Portfolio 2026* project: **… menu → Export/Print → CSV**. Please keep
>    **every column**, especially **Task ID**, **Assignee Email**, **Parent task**, **Section/Column**,
>    **Blocked By (Dependencies)** and all custom fields. Subtasks must be included.
> 2. The same CSV export for **each project-plan project** that belongs to an in-flight
>    portfolio item.
> 3. A short list saying which plan project belongs to which portfolio row (plan file name →
>    portfolio item name).
>
> **Adaptive Work (Nordic):** please export these saved views to Excel, with **all rows and no
> filters except "not cancelled"**:
> 1. **Projects**: SYSID, Name, Project Description, Manager, Business Sponsor, CN#,
>    Dept # for Expense, Region, Next Go-Live Date, Start Date, Planned Finish, Actual Start Date,
>    Actual End Date, % Complete, Project Funding Type, Funding Type, State, Phase, Budget Health,
>    Health, Resource Health, Risk Health, Schedule Health, Scope Health, Update Notes,
>    Estimate Type, Request Received, Request Assigned, Estimate Complete, Ready For Delivery,
>    Project Assigned, Customers, Business Category, Created On, Last Updated On.
> 2. **Tasks** for those projects: SYSID, Name, Description, **Project ID (SYSID)**, **Parent ID (SYSID)**,
>    State, Manager, Start Date, Due Date, Actual Start Date, Actual End Date, % Complete.
> 3. **Milestones**: SYSID, Name, Project ID, Parent ID, State, Due Date.
> 4. **Dependencies**: Predecessor ID, Successor ID, Type, Lag.
>
> For the Project / Parent / Predecessor / Successor columns we need the **ID (SYSID)**, not the
> name. Please share the files through [secure SharePoint/Teams folder]. They contain names
> and emails.

**Why these details matter:**

| Ask | Why |
|---|---|
| **Task ID** (Asana) and **SYSID** (Adaptive) | These IDs are how ServiceNow recognizes a record again. Without them, a re-export gets new IDs, so the final load can't update the mock-load records and you get duplicates. Your current Asana files don't have Task ID. The pipeline warns about this, but the final exports must include it |
| **Don't open in Excel** | Asana Task IDs are 16 digits. Excel keeps only 15 significant digits and silently changes the last one. Opening the files on a Mac is also what garbled the Notes text earlier |
| **Assignee Email** | Emails match ServiceNow users directly. Names need the nickname crosswalk |
| **IDs, not names, in Parent / Project columns** | Names repeat ("Build Task 1" appears in every plan), so linking by name is guesswork |

---

## 2. Running it (about 15 minutes each time)

One-time setup on your machine: install Python 3.10+, download this repo, run
`pip install -r requirements.txt`, and copy `config/settings.example.yaml` to `config/settings.yaml`.

```
data/exports/asana/HR_Project_Portfolio_2026.csv        ← the files you received
data/exports/asana/<plan project>.csv
data/exports/adaptive/Adaptive_Projects.xlsx
data/exports/adaptive/Adaptive_Tasks.xlsx  (…Milestones, …Dependencies)
data/reference/sys_user.csv, sys_dictionary.csv, sys_choice.csv   ← your own ServiceNow exports
data/reference/user_crosswalk.csv                                   ← nickname → email (you maintain it)
```

1. **Tell the pipeline about the files** in `config/settings.yaml`:
   - `asana.exports`: one line per Asana file. The tracker is `role: tracker`. Each plan is
     `role: plan` with `tracker_item: "<portfolio row name>"`.
   - `adaptive.exports`: file names, plus column headers if the owner's headers differ from the
     defaults. The defaults are the labels from the Nordic mapping sheet.
2. **Run:**
   ```bash
   python -m spm_migration.cli import-asana-exports
   python -m spm_migration.cli import-adaptive-exports
   python -m spm_migration.cli run-all
   ```
3. **Check these reports** before handing anything over:

   | File | Must be |
   |---|---|
   | `data/raw/*/export_warnings.csv` | Empty. It flags missing Task ID or SYSID, parents that weren't found, and duplicate names |
   | `data/staging/classification_review.csv` | Every row decided in `config/overrides.csv` |
   | `data/load/users_referenced.csv` | Every person matched. Add misses to `user_crosswalk.csv` and re-run |
   | `data/load/unmapped_values.csv` | Empty, or each remaining gap accepted |

4. **Hand over** `data/load/asana/` and `data/load/adaptive/` to the ServiceNow developer.
   They load the files in the order in MIG-14: demands, projects, tasks, dependencies, status
   reports.

**No machine with Python?** Any colleague's laptop works, and so can the ServiceNow developer's.
The run is short, and the pipeline only reads the export files and writes CSVs. It could also
run in a Claude Code session with the exports uploaded, if your security team approves sharing
the data that way.

---

## 3. How this fits the mock loads and the blackout

| When | Exports | Load into |
|---|---|---|
| Mock 1 | First export (it can be partial). This is when you confirm the owners' export steps and columns work | **Dev** |
| Mock 2 | Full export | **Test** |
| Mock 3 (rehearsal) | Full export, done exactly as it will be on the day, and timed | **Test** |
| **Blackout day** | Owners freeze the tools, then export immediately. You run the pipeline and the checks, and the developer loads | **Prod** |
| After go-live | Keep the final export files as the audit record. ServiceNow is now the system of record | — |

Ask the owners to **do the export themselves during each mock**, so the blackout-day export
is routine and its timing is known.
