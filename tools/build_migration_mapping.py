"""Build mapping/ServiceNow_SPM_Migration_Mapping.xlsx: the developer's field reference.

Rules for this file:
  * ServiceNow side = ONLY the approved data model in ServiceNow_Project_Form_Fields.xlsx
    (implementation team). No new fields are proposed or added.
  * Source side = ONLY fields present in the Asana / Adaptive field files:
      Asana_Project_Fields.xlsx (HR portfolio), Asana_Project_Task_Fields.xlsx (task level + its
      approved Sheet1 mapping), Proj_Data_Mapping_08172026_1.xlsx (Adaptive / Nordic, 28 fields).

Usage: python tools/build_migration_mapping.py <ServiceNow_Project_Form_Fields.xlsx> [<Demand_Form_Fields.xlsx>]
"""
from __future__ import annotations

import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parents[1] / "mapping" / "ServiceNow_SPM_Migration_Mapping.xlsx"
FONT, BOLD = Font(name="Arial", size=10), Font(name="Arial", size=10, bold=True)
HEAD = Font(name="Arial", size=10, bold=True, color="FFFFFF")
TITLE = Font(name="Arial", size=13, bold=True)
FILL = PatternFill("solid", fgColor="1F4E78")
MAPPED = PatternFill("solid", fgColor="E2EFDA")
WRAP = Alignment(wrap_text=True, vertical="top")
FORM_TABS = ["Header", "Dates", "Details", "Business Case", "Financials", "Score"]

# Out-of-box field names for data-model rows whose 'Field Name' column is blank (verify in instance)
OOB_NAMES = {
    "Project Name": "short_description", "Project Manager": "project_manager", "Status": "status",
    "State": "state", "Percent Complete": "percent_complete", "Number": "number",
    "Assigned To": "assigned_to", "Assignment Group": "assignment_group",
    "Additional assignee list": "additional_assignee_list", "Detailed Description": "description",
    "Schedule": "schedule", "Approved start date": "approved_start_date", "Planned start date": "start_date",
    "Actual start date": "work_start", "Duration": "duration", "Planned effort": "effort",
    "Approved end date": "approved_end_date", "Planned end date": "end_date", "Actual end date": "work_end",
    "Actual duration": "work_duration", "Actual effort": "work_effort", "Portfolio": "primary_portfolio",
    "Program": "primary_program", "Investment Class": "investment_class", "Investment Type": "investment_type",
    "Execution Type": "execution_type", "Expense type": "expense_type", "Priority": "priority",
    "Phase": "phase", "Department": "department", "Business Unit": "business_unit",
    "Impacted Business Units": "impacted_business_units",
}

# ServiceNow field (data-model label) -> (Asana source, Asana rule, Adaptive source, Adaptive rule, note)
PROJECT_MAP = {
    "Project Name": ("Name", "Direct", "Name", "Direct", ""),
    "Project Manager": ("PM Assigned", "Match sys_user by email, then full name; N/A / TBD = no match",
                        "Manager", "Match sys_user by email, then full name", ""),
    "State": ("Project Status", "See Value Maps: State (Asana)", "State", "See Value Maps: State (Adaptive)",
              "Adaptive Requested/Draft rows load as Demands, not Projects"),
    "Detailed Description": ("Notes", "Direct, then the unmapped Asana fields as 'Label: value' lines",
                             "Project Description", "Direct, then the unmapped Adaptive fields as 'Label: value' lines",
                             "See 'Unmapped Source Fields' for the lines appended"),
    "Planned start date": ("Start Date", "Date", "", "", "No start date in the Adaptive field list"),
    "Planned end date": ("Due Date", "Date", "Planned Finish", "Date", ""),
    "Portfolio": ("Section/Column", "Match pm_portfolio by name (COE area); task-level COE fills it if blank "
                                    "(Asana_Project_Task_Fields: COE -> parent.portfolio)", "", "", ""),
    "Business Owner": ("HRSP / SME / Project Lead", "Match sys_user by email, then full name",
                       "Business Sponsor", "Free text, may list several names: first name that matches sys_user", ""),
    "Investment Class": ("Project Type", "See Value Maps: Investment Class", "", "", ""),
    "Expense type": ("Funding", "See Value Maps: Funding", "Funding Type", "See Value Maps: Funding", ""),
    "CN": ("", "", "CN#", "Direct, as text (keep leading zeros)", ""),
    "Funding Type": ("Funding", "See Value Maps: Funding", "Funding Type", "See Value Maps: Funding", ""),
    "Funding Source": ("", "", "Project Funding Type", "Direct (text)", ""),
    "Phase": ("", "", "Phase", "See Value Maps: Phase", ""),
    "Business Category": ("Entity/Organization", "See Value Maps: Business Category (Asana); "
                          "per Asana_Project_Task_Fields: Entity/Organization -> parent.u_business_category",
                          "Business Category", "See Value Maps: Business Category (Adaptive)", ""),
    "Department": ("", "", "Dept # for Expense", "Match cmn_department (cost center pick list in Adaptive)",
                   "Confirm departments carry the Adaptive cost center numbers"),
    "Business Unit": ("Entity/Organization", "First value, match business_unit by name",
                      "Customers", "Match business_unit by name", ""),
    "Sites": ("", "", "Region", "Multi-select: split; each value must equal a Sites value (see Value Maps: Sites)", ""),
    "Impacted Business Units": ("Entity/Organization", "All values, match business_unit by name", "", "", ""),
    "Status": ("", "", "Health", "See Value Maps: Health", "Confirm 'Status' on the form is the overall health indicator"),
}

# Asana task level -> pm_project_task, from Asana_Project_Task_Fields.xlsx Sheet1 (approved)
TASK_MAP = [
    ("Task Name", "Project Name", "short_description", "Direct", ""),
    ("Section", "(none)", "", "Not mapped in Sheet1", "rm_story STRY0065275 appends it to Detailed Description"),
    ("COE", "Portfolio (parent project)", "parent.primary_portfolio", "Sets the parent project's Portfolio if blank",
     "Tasks in one plan may carry different COEs; the project's own section wins"),
    ("Assigned To", "Assigned To", "assigned_to", "Match sys_user by email, then full name", ""),
    ("Start Date", "Planned start date", "start_date", "Date; if blank use Due Date", ""),
    ("Due Date", "Planned end date", "end_date", "Date; if blank use Start Date", ""),
    ("Task Status", "State", "state", "See Value Maps: Task State", ""),
    ("% Complete", "Percent Complete", "percent_complete", "0.5 -> 50 (fraction x 100)", ""),
    ("Parent task", "(hierarchy)", "parent", "Parent task in the same project; top-level tasks -> the project",
     "Structural relationship, not a form field"),
    ("Entity/Organization", "Business Category (parent project)", "parent.u_business_category",
     "See Value Maps: Business Category (Asana)", "rm_story STRY0065275 appends it to Detailed Description instead - align"),
    ("Collaborators", "Additional assignee list", "additional_assignee_list", "Split names; match each sys_user", ""),
]

UNMAPPED = [
    ("Asana", "Assignee", "Not migrated", "Blank in the export; PM Assigned is the owner"),
    ("Asana", "Tags", "Not migrated", "Blank in the export"),
    ("Asana", "Parent task", "Hierarchy (project task parent)", "Rows with a parent are workstreams under the project"),
    ("Asana", "Blocked By / Blocking (Dependencies)", "Task dependencies (planned_task_rel_planned_task)", "Blank in current data"),
    ("Asana", "Size/Complexity", "Detailed Description line", "No field in the approved data model"),
    ("Asana", "I&T Integrations Needed", "Detailed Description line", "No field in the approved data model"),
    ("Asana", "Strategy Focus", "Detailed Description line", "No field in the approved data model"),
    ("Asana", "Strategy Timeline", "Detailed Description line", "No field in the approved data model"),
    ("Asana", "Cost Center", "Not migrated", "Blank in the export"),
    ("Asana", "HR Cross-Impacts", "Detailed Description line", "No field in the approved data model"),
    ("Asana", "HR COEs Engaged", "Detailed Description line", "No field in the approved data model"),
    ("Asana (task)", "Tags", "Not migrated", ""),
    ("Asana (task)", "Notes", "Detailed Description (task)", "Direct"),
    ("Asana (task)", "Blocked By / Blocking (Dependencies)", "Task dependencies (planned_task_rel_planned_task)", ""),
    ("Adaptive", "Next Go-Live Date", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Estimate Type", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Request Received", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Request Assigned", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Estimate Complete", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Ready For Delivery", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Project Assigned", "Detailed Description line", "No field in the approved data model"),
    ("Adaptive", "Budget Health", "Not on the project form", "OOB project status report (story MIG-07) if in scope"),
    ("Adaptive", "Resource Health", "Not on the project form", "OOB project status report (story MIG-07) if in scope"),
    ("Adaptive", "Risk Health", "Not on the project form", "OOB project status report (story MIG-07) if in scope"),
    ("Adaptive", "Schedule Health", "Not on the project form", "OOB project status report (story MIG-07) if in scope"),
    ("Adaptive", "Scope Health", "Not on the project form", "OOB project status report (story MIG-07) if in scope"),
    ("Adaptive", "Update Notes", "Not on the project form", "OOB project status report comments (story MIG-07) if in scope"),
]

STATE_ROWS = [
    ("State (Asana)", "Asana", "Not Started", "Pending", "-5"),
    ("State (Asana)", "Asana", "Started/Scoping", "Open", "1"),
    ("State (Asana)", "Asana", "In Progress", "Work in Progress", "2"),
    ("State (Asana)", "Asana", "Delayed", "Work in Progress", "2"),
    ("State (Asana)", "Asana", "On Hold", "On Hold", "-3"),
    ("State (Asana)", "Asana", "Completed", "(not migrated - in-flight scope)", ""),
    ("State (Asana)", "Asana", "Cancelled", "(not migrated)", ""),
    ("State (Adaptive)", "Adaptive", "Active", "Work in Progress", "2"),
    ("State (Adaptive)", "Adaptive", "On Hold", "On Hold", "-3"),
    ("State (Adaptive)", "Adaptive", "Requested", "(loads as Demand)", ""),
    ("State (Adaptive)", "Adaptive", "Draft", "(loads as Demand)", ""),
    ("State (Adaptive)", "Adaptive", "Completed", "(not migrated - in-flight scope)", ""),
    ("State (Adaptive)", "Adaptive", "Cancelled", "(not migrated)", ""),
    ("Task State", "Asana (task)", "Not Started", "Pending", "-5"),
    ("Task State", "Asana (task)", "In Progress", "Work in Progress", "2"),
    ("Task State", "Asana (task)", "Completed", "Closed Complete", "3"),
    ("Funding", "Asana / Adaptive", "OpEx / Opex", "Funding Type: Opex required | Expense type: Opex", ""),
    ("Funding", "Asana / Adaptive", "CapEx / Capex", "Funding Type: Capex required | Expense type: Capex", ""),
    ("Investment Class", "Asana", "Project", "Change", ""),
    ("Investment Class", "Asana", "Annual Program", "Run", ""),
    ("Investment Class", "Asana", "Project/Annual Program", "Change", ""),
    ("Health", "Adaptive", "On Target / On Plan", "Green", ""),
    ("Health", "Adaptive", "Needs Attention", "Yellow", ""),
    ("Health", "Adaptive", "In Trouble", "Red", ""),
    ("Phase", "Adaptive", "Initiation", "(ServiceNow phase value - not in data model file)", ""),
    ("Phase", "Adaptive", "Discovery & Design", "(ServiceNow phase value - not in data model file)", ""),
    ("Phase", "Adaptive", "Execution", "(ServiceNow phase value - not in data model file)", ""),
    ("Phase", "Adaptive", "Close Out", "(ServiceNow phase value - not in data model file)", ""),
]
ADAPTIVE_CATEGORY = {  # Adaptive Business Category value -> data-model Text
    "Construction/Relocation": "Construction/relocation",
    "Onboarding (new Provider group - no construction)": "Onboarding (new Provider group - no construction)",
    "Application": "Application", "Epic": "Epic", "GHC - all non RSFH work": "GHC - all not FSFH work",
    "Infrastructure": "Infrastructure", "Medical Group": "Medical Group",
    "Revenue Cycle (includes Ensemble requests": "Revenue Cycle (includes Ensemble requests)",
    "RSFH": "RSFH", "Security": "Security", "Urgent Care": "Urgent Care",
}


def read_model(path: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    wb = load_workbook(path, data_only=True)
    fields = []
    for tab in FORM_TABS:
        rows = list(wb[tab].iter_rows(values_only=True))
        for r in rows[1:]:
            label = (r[0] or "").strip() if isinstance(r[0], str) else r[0]
            if not label or (r[1] or "") == "Remove from form":
                continue
            fields.append({"tab": tab, "label": label, "custom": (r[1] or ""), "name": (r[2] or ""),
                           "type": (r[4] or ""), "choices": (r[5] or "")})
    cat = [(str(r[0]).strip(), str(r[1]).strip()) for r in list(wb["Business category"].iter_rows(values_only=True))[1:] if r[0]]
    sites = [str(r[0]).strip() for r in list(wb["Sites"].iter_rows(values_only=True))[1:] if r[0]]
    return fields, cat, sites


def demand_labels(path: Path | None) -> set[str]:
    if not path or not path.exists():
        return set()
    wb = load_workbook(path, data_only=True)
    out = set()
    for tab in ["Header", "Details", "Business Case", "Financials", "Assessment Data"]:
        for r in list(wb[tab].iter_rows(values_only=True))[1:]:
            if r[0] and (r[1] or "") != "Remove from form":
                out.add(str(r[0]).strip().lower())
    return out


def sheet(wb: Workbook, title: str, headers: list[str], rows: list[list], widths: list[int],
          highlight_col: int | None = None) -> None:
    ws = wb.create_sheet(title)
    ws.append(headers)
    for row in rows:
        ws.append(row)
    for c in ws[1]:
        c.font, c.fill, c.alignment = HEAD, FILL, WRAP
    for row in ws.iter_rows(min_row=2):
        mapped = highlight_col is not None and any(row[i].value for i in highlight_col)
        for c in row:
            c.font, c.alignment = FONT, WRAP
            if mapped:
                c.fill = MAPPED
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def main() -> None:
    model_path = Path(sys.argv[1])
    demand_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    fields, categories, sites = read_model(model_path)
    on_demand = demand_labels(demand_path)
    cat_value = {text: value for text, value in categories}

    wb = Workbook()
    wb.remove(wb.active)
    ws = wb.create_sheet("Read Me")
    lines = [
        ("ServiceNow SPM Migration Mapping - developer reference", TITLE), ("", FONT),
        ("ServiceNow side: ONLY the approved data model (ServiceNow_Project_Form_Fields.xlsx, implementation team).", FONT),
        ("Source side: ONLY fields in Asana_Project_Fields, Asana_Project_Task_Fields (incl. its Sheet1 mapping) and "
         "Proj_Data_Mapping_08172026_1 (Adaptive).", FONT),
        ("No new fields are proposed. Source fields with no approved target are listed on 'Unmapped Source Fields'.", FONT),
        ("", FONT),
        ("Sheets", BOLD),
        ("Project Fields - every approved project form field; green rows are fed by Asana and/or Adaptive.", FONT),
        ("Project Task Fields - Asana task-level fields -> pm_project_task, per Asana_Project_Task_Fields Sheet1.", FONT),
        ("Value Maps - source value -> ServiceNow choice. Custom choice values come from the data model file.", FONT),
        ("Unmapped Source Fields - source fields with no field in the approved data model, and how they are handled.", FONT),
        ("Business Category / Sites - the approved choice lists, copied from the data model file.", FONT),
        ("", FONT),
        ("Load keys (not form fields)", BOLD),
        ("correlation_id = 'ASANA:' + Asana Task ID, or 'ADAPTIVE:' + Adaptive SYSID - the transform map coalesce field.", FONT),
        ("correlation_display = 'Asana' or 'Adaptive Work'.", FONT),
        ("", FONT),
        ("Notes", BOLD),
        ("'ServiceNow Field Name' is from the data model file. Where that file leaves it blank, the out-of-box name "
         "is shown (marked OOB) - verify it in the instance.", FONT),
        ("Out-of-box choice values (State, Expense type, Investment Class, Phase) are not in the data model file; "
         "confirm the stored values with the implementation team.", FONT),
        ("'On Demand form' shows whether the same field is on the Demand form (Demand_Form_Fields.xlsx); "
         "Adaptive demands use those fields. The Demand form's Business Category uses a different choice list.", FONT),
    ]
    for i, (text, font) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=text)
        c.font = font
    ws.column_dimensions["A"].width = 140

    rows = []
    for f in fields:
        name = f["name"] or (f"{OOB_NAMES[f['label']]} (OOB)" if f["label"] in OOB_NAMES else "")
        a_src, a_rule, d_src, d_rule, note = PROJECT_MAP.get(f["label"], ("", "", "", "", ""))
        demand = "Yes" if f["label"].lower() in on_demand or (f["label"] == "Project Name" and "name" in on_demand) else ""
        if f["label"] == "Business Category" and demand:
            demand = "Yes (different choice list)"
        rows.append([f["tab"], f["label"], name, f["custom"], f["type"], f["choices"],
                     a_src, a_rule, d_src, d_rule, demand, note])
    sheet(wb, "Project Fields",
          ["Form Tab", "ServiceNow Field", "ServiceNow Field Name", "Custom", "Field Type", "Choice List (data model)",
           "Asana Source Field", "Asana Rule", "Adaptive Source Field", "Adaptive Rule", "On Demand form", "Notes"],
          rows, [13, 26, 26, 8, 18, 34, 24, 40, 24, 40, 14, 40], highlight_col=[6, 8])

    sheet(wb, "Project Task Fields",
          ["Asana Task Field", "ServiceNow Field", "ServiceNow Field Name", "Rule", "Notes"],
          [list(t) for t in TASK_MAP], [22, 32, 30, 50, 55], highlight_col=[2])

    vm = [list(r) for r in STATE_ROWS]
    for src, text in ADAPTIVE_CATEGORY.items():
        vm.append(["Business Category (Adaptive)", "Adaptive", src, text, cat_value.get(text, "")])
    vm.append(["Business Category (Asana)", "Asana", "RSFH", "RSFH", cat_value.get("RSFH", "")])
    for e in ("BSMH", "GBS", "External Partners"):
        vm.append(["Business Category (Asana)", "Asana", e, "(no matching choice in the data model)", ""])
    for s in sites:
        vm.append(["Sites", "Adaptive (Region)", s, s, ""])
    sheet(wb, "Value Maps", ["Map", "Source", "Source Value", "ServiceNow Value (label)", "Stored Value"],
          vm, [30, 18, 44, 52, 22])

    sheet(wb, "Unmapped Source Fields", ["Source", "Source Field", "Handling", "Reason"],
          [list(u) for u in UNMAPPED], [14, 36, 44, 60])
    sheet(wb, "Business Category", ["Text", "Value"], [list(c) for c in categories], [55, 30])
    sheet(wb, "Sites", ["Sites"], [[s] for s in sites], [40])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"Wrote {OUT}: {len(fields)} data-model fields, "
          f"{sum(1 for r in rows if r[6] or r[8])} fed by a source")


if __name__ == "__main__":
    main()
