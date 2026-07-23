/**
 * Génère et exporte le "Rapport de mesures" (résumé + stats détaillées +
 * interprétation par grandeur) en PDF et Word.
 *
 * Un seul modèle de données (`MeasurementReport`) alimente les deux formats,
 * pour éviter que PDF et Word divergent sur ce qu'ils affichent.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell,
  TextRun, WidthType,
} from 'docx';

export interface MeasurementReport {
  title: string;
  subtitle: string;
  generatedAt: string;
  summary: string;
  insights: string[];
  perColumn: { label: string; text: string }[];
  kpiRows: [string, string][];
  statsTable: { headers: string[]; rows: string[][] };
  dailyTable?: { title: string; headers: string[]; rows: string[][] };
}

function slugFileName(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'rapport';
}

export function exportReportToPdf(report: MeasurementReport): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 16;

  doc.setFontSize(14);
  doc.setTextColor(20, 30, 60);
  doc.text(report.title, marginX, y);
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(report.subtitle, marginX, y);
  y += 4;
  doc.text(`Généré le ${report.generatedAt}`, marginX, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Indicateur', 'Valeur']],
    body: report.kpiRows,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (report.statsTable.rows.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(20, 30, 60);
    doc.text('Statistiques détaillées', marginX, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [report.statsTable.headers],
      body: report.statsTable.rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage();
      y = 16;
    }
  };

  ensureSpace(20);
  doc.setFontSize(11);
  doc.setTextColor(20, 30, 60);
  doc.text("Résumé de l'analyse", marginX, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const summaryLines = doc.splitTextToSize(report.summary, 180);
  ensureSpace(summaryLines.length * 4.5);
  doc.text(summaryLines, marginX, y);
  y += summaryLines.length * 4.5 + 4;

  if (report.insights.length > 0) {
    ensureSpace(6);
    doc.setFontSize(10);
    doc.setTextColor(150, 90, 0);
    doc.text("Points d'attention", marginX, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    for (const msg of report.insights) {
      const lines = doc.splitTextToSize(`• ${msg}`, 180);
      ensureSpace(lines.length * 4.5);
      doc.text(lines, marginX, y);
      y += lines.length * 4.5;
    }
    y += 4;
  }

  if (report.perColumn.length > 0) {
    ensureSpace(6);
    doc.setFontSize(10);
    doc.setTextColor(20, 30, 60);
    doc.text('Détail par grandeur', marginX, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    for (const { text } of report.perColumn) {
      const lines = doc.splitTextToSize(`• ${text}`, 180);
      ensureSpace(lines.length * 4.5);
      doc.text(lines, marginX, y);
      y += lines.length * 4.5;
    }
    y += 4;
  }

  if (report.dailyTable && report.dailyTable.rows.length > 0) {
    ensureSpace(10);
    doc.setFontSize(11);
    doc.setTextColor(20, 30, 60);
    doc.text(report.dailyTable.title, marginX, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [report.dailyTable.headers],
      body: report.dailyTable.rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: marginX, right: marginX },
    });
  }

  doc.save(`${slugFileName(report.title)}.pdf`);
}

function docxTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    children: headers.map((h) => new TableCell({
      shading: { fill: '1E3A8A' },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })] })],
    })),
  });
  const bodyRows = rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({ text: cell })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

export async function exportReportToDocx(report: MeasurementReport): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: report.subtitle, italics: true, color: '666666' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Généré le ${report.generatedAt}`, italics: true, color: '999999', size: 18 })],
    }),
    new Paragraph({ text: '' }),
    docxTable(['Indicateur', 'Valeur'], report.kpiRows),
    new Paragraph({ text: '' }),
  ];

  if (report.statsTable.rows.length > 0) {
    children.push(
      new Paragraph({ text: 'Statistiques détaillées', heading: HeadingLevel.HEADING_2 }),
      docxTable(report.statsTable.headers, report.statsTable.rows),
      new Paragraph({ text: '' }),
    );
  }

  children.push(
    new Paragraph({ text: "Résumé de l'analyse", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: report.summary }),
  );

  if (report.insights.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 100 } }));
    children.push(new Paragraph({ text: "Points d'attention", heading: HeadingLevel.HEADING_2 }));
    for (const msg of report.insights) {
      children.push(new Paragraph({ text: msg, bullet: { level: 0 } }));
    }
  }

  if (report.perColumn.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 100 } }));
    children.push(new Paragraph({ text: 'Détail par grandeur', heading: HeadingLevel.HEADING_2 }));
    for (const { text } of report.perColumn) {
      children.push(new Paragraph({ text, bullet: { level: 0 } }));
    }
  }

  if (report.dailyTable && report.dailyTable.rows.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 100 } }));
    children.push(new Paragraph({ text: report.dailyTable.title, heading: HeadingLevel.HEADING_2 }));
    children.push(docxTable(report.dailyTable.headers, report.dailyTable.rows));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugFileName(report.title)}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
