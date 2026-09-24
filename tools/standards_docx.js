// Build docs/Migration_Standards.docx (attach to the SPM Data Migration epic) from
// docs/migration_standards.json, which `python -m spm_migration.cli user-stories` writes.
// Usage: node tools/standards_docx.js
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType, BorderStyle } = require("docx");

const root = path.join(__dirname, "..");
const std = JSON.parse(fs.readFileSync(path.join(root, "docs/migration_standards.json"), "utf8"));
const FONT = "Arial";

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F4E78", space: 4 } },
    children: [new TextRun({ text: std.title, font: FONT, size: 30, bold: true, color: "1F4E78" })],
  }),
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: std.intro, font: FONT, size: 18, italics: true })] }),
];
for (const sec of std.sections) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 100, after: 30 },
    children: [new TextRun({ text: sec.heading, font: FONT, size: 20, bold: true, color: "1F4E78" })],
  }));
  for (const b of sec.bullets) {
    children.push(new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      spacing: { after: 20 },
      children: [new TextRun({ text: b, font: FONT, size: 17 })],
    }));
  }
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 17 } } } },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
                 style: { paragraph: { indent: { left: 280, hanging: 200 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
                          margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(root, "docs/Migration_Standards.docx");
  fs.writeFileSync(out, buf);
  console.log("Wrote " + out);
});
