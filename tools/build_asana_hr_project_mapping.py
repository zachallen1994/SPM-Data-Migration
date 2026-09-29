"""Build mapping/Asana_HR_Project_to_ServiceNow.xlsx.

Scope: the Asana HR_Project_Portfolio_2026 export -> ServiceNow Project (pm_project),
mapped to the implementation team's HR Project form (HR_Project_Form_Fields_1.xlsx).
Top-level Asana rows only (80 rows). Workstreams (rows with a Parent task) are
project tasks and are out of scope here.

Nothing is assumed: any row that is not a clear 1:1 match is marked "Open - Q#"
and the question is listed on the Questions tab.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parents[1] / "mapping" / "Asana_HR_Project_to_ServiceNow.xlsx"

CLEAR, OPEN, NONE = "Clear", "Open", "Not mapped"

# Asana column | ServiceNow field label | Field name | Type | Rule | Status
FIELDS = [
    ("Name", "Name", "short_description", "String", "Copy as-is.", CLEAR),
    ("Notes", "Detailed Description", "description", "String", "Copy as-is.", CLEAR),
    ("Start Date", "Planned start date", "start_date", "Date", "Copy as-is.", CLEAR),
    ("Due Date", "Planned end date", "end_date", "Date", "Copy as-is.", CLEAR),
    ("PM Assigned", "Project Manager", "project_manager", "Reference (sys_user)",
     "Match the name to an active user. N/A, TBD and blank -> leave empty.", CLEAR),
    ("Project Status", "State", "state", "Choice",
     "See Values tab (mapping agreed earlier).", CLEAR),
    ("Funding", "Funding Type", "u_funding_type", "Choice", "See Values tab.", CLEAR),
    ("Section/Column", "Functional Area", "u_functional_area", "List",
     "See Values tab. 11 of 18 sections match; 7 do not.", OPEN + " - Q1, Q2"),
    ("I&T Integrations Needed", "IT Required", "u_it_required", "True/False",
     "See Values tab. 3 values are unclear.", OPEN + " - Q3"),
    ("Entity/Organization", "Sites", "u_sites", "List",
     "See Values tab. Only RSFH and GBS match a site.", OPEN + " - Q4"),
    ("(no Asana column)", "Project Category", "u_project_category", "List",
     "Every row is HR. Set all to Human Resources?", OPEN + " - Q5"),
    ("HRSP / SME / Project Lead", "?", "?", "", "No obvious target field.", OPEN + " - Q6"),
    ("Assignee", "?", "?", "", "Filled on 1 of 80 rows.", OPEN + " - Q6"),
    ("Project Type", "?", "?", "", "Project / Annual Program. No obvious target field.", OPEN + " - Q7"),
    ("Size/Complexity", "?", "?", "", "Low / Medium / High. No obvious target field.", OPEN + " - Q8"),
    ("Strategy Focus", "?", "?", "", "No obvious target field.", OPEN + " - Q9"),
    ("Strategy Timeline", "?", "?", "", "No obvious target field.", OPEN + " - Q9"),
    ("HR COEs Engaged", "?", "?", "", "Could feed Functional Area, but values differ.", OPEN + " - Q2"),
    ("HR Cross-Impacts", "?", "?", "", "Free text. No obvious target field.", OPEN + " - Q10"),
    ("Cost Center", "-", "-", "", "Blank on every row.", NONE),
    ("Tags", "-", "-", "", "Blank on every row.", NONE),
    ("Blocked By / Blocking", "-", "-", "", "Blank on every project row.", NONE),
    ("Parent task", "-", "-", "", "Marks workstream rows (project tasks). Out of scope here.", NONE),
]

# New-model fields with no Asana source (left empty by the migration).
NO_SOURCE = [
    ("Portfolio", "primary_portfolio", "Q11"),
    ("Business Owner", "u_business_owner", ""),
    ("Executive Sponsor", "u_executive_sponsor", ""),
    ("CN", "u_cn", ""),
    ("Funding Source", "u_funding_source", ""),
    ("Priority", "priority", "Q8"),
    ("Status (overall health)", "status", "Q12"),
]

# Asana column | Asana value | rows | ServiceNow field | ServiceNow value | Status
VALUES = [
    ("Project Status", "In Progress", 44, "state", "Work in Progress", CLEAR),
    ("Project Status", "Not Started", 10, "state", "Pending", CLEAR),
    ("Project Status", "Started/Scoping", 4, "state", "Investigating", CLEAR),
    ("Project Status", "Delayed", 1, "state", "Work in Progress", CLEAR),
    ("Project Status", "On Hold", 2, "state", "Pending", CLEAR),
    ("Project Status", "(blank)", 4, "state", "Pending", CLEAR),
    ("Project Status", "Completed", 13, "-", "Not migrated (in-flight only)", CLEAR),
    ("Project Status", "Cancelled", 2, "-", "Not migrated (in-flight only)", CLEAR),

    ("Funding", "OpEx", 1, "u_funding_type", "Opex required", CLEAR),
    ("Funding", "CapEx", 1, "u_funding_type", "Capex required", CLEAR),
    ("Funding", "(blank)", 78, "u_funding_type", "(empty)", CLEAR),

    ("Section/Column", "Benefits & Well-Being", 10, "u_functional_area", "Benefits, Well-Being (both?)", OPEN + " - Q1"),
    ("Section/Column", "M&A", 9, "u_functional_area", "Mergers & Acquisitions", CLEAR),
    ("Section/Column", "Workforce & Internal Mobility", 8, "u_functional_area", "Workforce & Internal Mobiligy (typo in choice)", CLEAR),
    ("Section/Column", "HR Analytics & Insights", 8, "u_functional_area", "HR Analytics & Surveys?", OPEN + " - Q1"),
    ("Section/Column", "Culture & Learning", 8, "u_functional_area", "Culture & Learning", CLEAR),
    ("Section/Column", "Dignity & Unity", 6, "u_functional_area", "Dignity & Unity", CLEAR),
    ("Section/Column", "Compensation", 5, "u_functional_area", "Compensation", CLEAR),
    ("Section/Column", "HR Services", 5, "u_functional_area", "HR Services", CLEAR),
    ("Section/Column", "Labor", 3, "u_functional_area", "Labor", CLEAR),
    ("Section/Column", "Retirement", 3, "u_functional_area", "Retirement", CLEAR),
    ("Section/Column", "Talent Acquisition", 2, "u_functional_area", "Talent Acquisition", CLEAR),
    ("Section/Column", "Ireland Projects 2026 - 2027", 4, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "HRSPs & HR Ops", 2, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "HR Communications & Marketing Projects", 2, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "Nursing Projects", 2, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "Risk Mitigation", 1, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "BSMH PCC & RSFH HR Committee meetings", 1, "u_functional_area", "?", OPEN + " - Q1"),
    ("Section/Column", "GBS Initiatives", 1, "u_functional_area", "?", OPEN + " - Q1"),

    ("I&T Integrations Needed", "Yes - New Integrations", 12, "u_it_required", "true", CLEAR),
    ("I&T Integrations Needed", "Yes - Modify Existing Integrations", 5, "u_it_required", "true", CLEAR),
    ("I&T Integrations Needed", "No Integrations", 49, "u_it_required", "false", CLEAR),
    ("I&T Integrations Needed", "No Integrations, but IT is engaged to support", 2, "u_it_required", "?", OPEN + " - Q3"),
    ("I&T Integrations Needed", "TBD", 5, "u_it_required", "?", OPEN + " - Q3"),
    ("I&T Integrations Needed", "(blank)", 7, "u_it_required", "?", OPEN + " - Q3"),

    ("Entity/Organization", "RSFH", 7, "u_sites", "Roper St. Francis Healthcare", CLEAR),
    ("Entity/Organization", "GBS", 1, "u_sites", "Global Business Services (GBS)", CLEAR),
    ("Entity/Organization", "BSMH", 11, "u_sites", "?", OPEN + " - Q4"),
    ("Entity/Organization", "BSMH, RSFH", 27, "u_sites", "? + Roper St. Francis Healthcare", OPEN + " - Q4"),
    ("Entity/Organization", "BSMH, RSFH, External Partners", 1, "u_sites", "? + Roper St. Francis Healthcare + ?", OPEN + " - Q4"),
    ("Entity/Organization", "(blank)", 33, "u_sites", "(empty)", CLEAR),
]

QUESTIONS = [
    ("Q1", "Functional Area",
     "7 Asana sections have no matching Functional Area choice: Ireland Projects 2026 - 2027, HRSPs & HR Ops, "
     "HR Communications & Marketing Projects, Nursing Projects, Risk Mitigation, BSMH PCC & RSFH HR Committee "
     "meetings, GBS Initiatives (13 projects). Also confirm: Benefits & Well-Being -> Benefits AND Well-Being? "
     "HR Analytics & Insights -> HR Analytics & Surveys?",
     "Choice for each section, or leave empty."),
    ("Q2", "Functional Area",
     "Should Functional Area come from Section/Column (one value per project) or from HR COEs Engaged "
     "(multi-select: HRTS, Talent & Culture, HWB - Benefits, etc.)? The COE values do not match the choice list.",
     "Section/Column or HR COEs Engaged."),
    ("Q3", "IT Required",
     "What should these become: 'No Integrations, but IT is engaged to support' (2), 'TBD' (5), blank (7)?",
     "true / false / empty for each."),
    ("Q4", "Sites",
     "Which site(s) should 'BSMH' map to (Enterprise? Home Office? all markets?) and what about 'External Partners'? "
     "Or should Entity/Organization not map to Sites at all?",
     "Site value(s) for BSMH and External Partners."),
    ("Q5", "Project Category",
     "No Asana column exists. Set every HR project to 'Human Resources', or leave empty? "
     "(The model's choice list note says 'See Functional Area tab', but the Project category tab has Human Resources.)",
     "Human Resources for all, or empty."),
    ("Q6", "People",
     "Where do 'HRSP / SME / Project Lead' (10 of 80 filled) and 'Assignee' (1 of 80) go? "
     "Options on the form: Assigned To, Additional assignee list, Business Owner - or not migrated.",
     "Target field or not migrated."),
    ("Q7", "Project Type",
     "Project (49) / Annual Program (23) / Project/Annual Program (4). Map to a field (Execution Type? "
     "Investment Type?) or not migrated?",
     "Target field + values, or not migrated."),
    ("Q8", "Size/Complexity",
     "Low / Medium / High. Is this meant to set Priority, or is it not migrated?",
     "Priority values, or not migrated."),
    ("Q9", "Strategy",
     "Strategy Focus (16 values) and Strategy Timeline (Long-Term, Annual Changes, Short-Term, "
     "One-Time/Non-Interdependent). Map to Strategic Program / Strategic Priority, or not migrated?",
     "Target field + values, or not migrated."),
    ("Q10", "HR Cross-Impacts",
     "Free text on 19 of 80 rows. Append to Detailed Description, or not migrated?",
     "Append or not migrated."),
    ("Q11", "Portfolio",
     "No Asana column. Should every project go into one HR portfolio (name?), or leave empty?",
     "Portfolio name, or empty."),
    ("Q12", "Status",
     "The form has both State and Status. Asana 'Delayed' and 'On Hold' could also set Status "
     "(overall health). Set Status, or leave it at its default?",
     "Status values, or default."),
]

HEAD_FILL = PatternFill("solid", fgColor="1F4E78")
OPEN_FILL = PatternFill("solid", fgColor="FFF2CC")
CLEAR_FILL = PatternFill("solid", fgColor="E2EFDA")
GREY_FILL = PatternFill("solid", fgColor="EDEDED")


def write(ws, header, rows, widths, status_col=None):
    ws.append(header)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HEAD_FILL
    for r in rows:
        ws.append(list(r))
        if status_col is not None:
            s = str(r[status_col])
            fill = CLEAR_FILL if s == CLEAR else OPEN_FILL if s.startswith(OPEN) else GREY_FILL
            for c in ws[ws.max_row]:
                c.fill = fill
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows():
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "Fields"
    write(ws, ["Asana column", "ServiceNow field", "Field name", "Type", "Rule", "Status"],
          FIELDS, [26, 22, 20, 18, 55, 16], status_col=5)
    ws.append([])
    ws.append(["Form fields with no Asana source (left empty)", "", "", "", "", ""])
    ws.cell(ws.max_row, 1).font = Font(bold=True)
    for label, name, q in NO_SOURCE:
        ws.append(["-", label, name, "", "No Asana column." + (f" See {q}." if q else ""), NONE])

    write(wb.create_sheet("Values"),
          ["Asana column", "Asana value", "Rows (of 80)", "ServiceNow field", "ServiceNow value", "Status"],
          VALUES, [24, 42, 12, 18, 40, 14], status_col=5)
    write(wb.create_sheet("Questions"), ["#", "Topic", "Question", "Answer needed"],
          QUESTIONS, [6, 16, 90, 36])
    write(wb.create_sheet("Notes"), ["Note"], [
        ("Source: Asana HR_Project_Portfolio_2026 export. 80 top-level rows = projects. "
         "17 rows with a Parent task = workstreams (project tasks, separate mapping).",),
        ("Target: pm_project, per the implementation team's HR Project form (HR_Project_Form_Fields_1).",),
        ("Completed (13) and Cancelled (2) are not migrated, leaving 65 projects.",),
        ("Choice values are shown as display text. The developer confirms the stored value "
         "in the instance (e.g. Opex required, Work in Progress).",),
        ("Green = clear. Yellow = needs an answer (Questions tab). Grey = not mapped.",),
    ], [110])
    OUT.parent.mkdir(exist_ok=True)
    wb.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
