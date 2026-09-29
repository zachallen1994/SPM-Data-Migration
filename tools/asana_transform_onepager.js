// One-page developer reference: Asana -> ServiceNow transform maps.
// Output: docs/Asana_Transform_Maps_OnePager.docx   Usage: node tools/asana_transform_onepager.js
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
        BorderStyle, LevelFormat, AlignmentType } = require("docx");

const FONT = "Arial", SZ = 15, NAVY = "1F4E78";            // SZ is half-points: 7.5pt body
const W = 11160;                                            // 8.5in - 2 x 0.4in margins, in DXA
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || SZ, bold: o.bold, color: o.color, italics: o.italics });
const para = (children, o = {}) => new Paragraph({ children, spacing: { before: o.before || 0, after: o.after ?? 40 }, ...o.extra });
const heading = (t) => para([run(t, { size: 19, bold: true, color: NAVY })], { before: 100, after: 30 });
const sub = (t) => para([run(t, { italics: true })], { after: 40 });

function table(headers, rows, widths) {
  const cell = (t, w, head) => new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: head ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 25, bottom: 25, left: 70, right: 70 },
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(t, head ? { bold: true, color: "FFFFFF" } : { bold: false })] })],
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], true)) }),
           ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, widths[i], false)) }))],
  });
}
const bullet = (parts) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 20 },
  children: parts.map(p => typeof p === "string" ? run(p) : run(p.t, { bold: true })) });

const C3 = [2500, 2700, 5960];
const children = [
  new Paragraph({ spacing: { after: 20 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 3 } },
    children: [run("Asana → ServiceNow: Transform Map Reference", { size: 26, bold: true, color: NAVY })] }),
  para([run("Scope: in-flight HR projects and their tasks. Asana feeds projects and project tasks only (no demands). " +
            "Every map coalesces on correlation_id; re-loading a file must update records, never duplicate them.", { italics: true })]),

  heading("Transform Map 1 · Asana Projects → pm_project"),
  sub("Source: HR portfolio CSV · Staging table: u_imp_asana_projects · onBefore: skip rows with a Parent task, and rows whose Project Status is Completed or Cancelled"),
  table(["Asana column", "ServiceNow field", "How"], [
    ["Task ID", "correlation_id", "Script: \"ASANA:\" + Task ID · COALESCE"],
    ["Name", "short_description", "Direct"],
    ["Notes", "description", "Notes, then lines: Size/Complexity, I&T Integrations Needed, Strategy Focus, Strategy Timeline, HR COEs Engaged, HR Cross-Impacts"],
    ["PM Assigned", "project_manager", "Match sys_user by email, then name · N/A or TBD = blank"],
    ["HRSP / SME / Project Lead", "u_business_owner", "Match sys_user by email, then name"],
    ["Start Date / Due Date", "start_date / end_date", "Date"],
    ["Project Status", "state", "Value map below"],
    ["Section/Column", "primary_portfolio", "Match pm_portfolio by name"],
    ["Project Type", "investment_class", "Project → Change · Annual Program → Run"],
    ["Funding", "u_funding_type", "CapEx → Capex required · OpEx → Opex required"],
    ["Funding", "expense_type", "CapEx → Capex · OpEx → Opex"],
    ["Entity/Organization", "business_unit", "First value, match business_unit by name"],
    ["(constant)", "time_constraint", "start_on_specific_date (keeps the Asana dates)"],
  ], C3),
  para([run("No Asana source; leave unmapped (Adaptive fills them): ", { bold: true }),
        run("u_cn, u_sites, u_funding_source, u_executive_sponsor, u_business_category.")], { before: 40 }),
  para([run("Workstream rows ", { bold: true }),
        run("(portfolio rows that have a Parent task): a second transform map on u_imp_asana_projects → pm_project_task, " +
            "using the Map 2 fields. parent and top_task = the project whose short_description equals Parent task.")]),

  heading("Transform Map 2 · Asana Project Tasks → pm_project_task"),
  sub("Source: Asana plan CSV (one per project, with a Project ID column added) · Staging table: u_imp_asana_project_tasks"),
  table(["Asana column", "ServiceNow field", "How"], [
    ["Task ID", "correlation_id", "Script: \"ASANA:\" + Task ID · COALESCE"],
    ["Task Name", "short_description", "Direct"],
    ["Project ID", "top_task", "Script: pm_project where correlation_id = \"ASANA:\" + Project ID"],
    ["Parent task", "parent", "Script: parent task in the same project; if none, the project"],
    ["Assigned To", "assigned_to", "Match sys_user by email, then name"],
    ["Collaborators", "additional_assignee_list", "Split on commas; match each user; skip unmatched"],
    ["Start Date / Due Date", "start_date / end_date", "Date · if only one is present, use it for both"],
    ["Task Status", "state", "Value map below"],
    ["% Complete", "percent_complete", "0.5 → 50"],
    ["Notes", "description", "Notes, then lines: Section, COE, Entity/Organization"],
    ["Task Name contains \"Milestone\"", "milestone", "true"],
    ["(constant)", "time_constraint", "start_on_specific_date"],
  ], C3),

  heading("State value map"),
  table(["Asana status", "Project state", "Task state"], [
    ["Not Started / blank", "Pending", "Pending"],
    ["Started/Scoping", "Investigating", "Investigating"],
    ["In Progress", "Work in Progress", "Work in Progress"],
    ["Delayed", "Work in Progress + description line \"Status: Delayed\"", "Same"],
    ["On Hold", "Pending + description line \"Status: On Hold\"", "Same"],
    ["Completed", "Skipped (in-flight only)", "Closed Complete"],
    ["Cancelled", "Skipped", "Closed Incomplete"],
  ], [3000, 4580, 3580]),

  heading("Rules that apply to both maps"),
  bullet([{ t: "People: " }, "match sys_user by email, then full name. No match → blank and log it. Never create users (choice action = ignore)."]),
  bullet([{ t: "Choice fields: " }, "choice action = reject, so bad values fail loudly. Transform map: Run business rules = true, Copy empty fields = false."]),
  bullet([{ t: "Load order: " }, "Map 1, then the workstream map, then Map 2. Run Map 2 twice; the second run fixes parents that loaded later."]),
  bullet([{ t: "Out of scope: " }, "Tags, Assignee (blank in the export), Cost Center (blank), dependencies (separate story), and creating fields or choices (implementation team)."]),

  heading("Before starting"),
  bullet([{ t: "Export: " }, "Asana CSV with the Task ID column, and a Project ID column on each plan file. Don't open or re-save it in Excel (Excel corrupts the IDs)."]),
  bullet([{ t: "Implementation team: " }, "stored values for state (especially Investigating), u_funding_type and investment_class."]),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
    alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 240, hanging: 180 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 },
    margin: { top: 540, bottom: 540, left: 540, right: 540 } } }, children }],
});
Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, "..", "docs", "Asana_Transform_Maps_OnePager.docx");
  fs.writeFileSync(out, buf);
  console.log("Wrote " + out);
});
