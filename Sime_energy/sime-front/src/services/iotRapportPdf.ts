/**
 * Rapport de la Courbe de charge → PDF simple (A4, sans logo).
 *
 * Même modèle que l'Excel (services/iotRapport.ts) : aucun calcul ici, le
 * PDF ne fait que mettre en page. Le détail par appareil et par jour reste
 * dans l'Excel (trop long pour un document à lire).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RapportCourbe, Tableau } from './iotRapport';
import { graphiqueJournalier, graphiqueTypesJour } from './iotRapportGraphiques';

const BLEU: [number, number, number] = [30, 58, 138];
const GRIS: [number, number, number] = [100, 100, 100];
const MARGE = 14;

/**
 * Les polices standard de jsPDF (WinAnsi) n'ont ni l'espace fine insécable
 * que toLocaleString('fr-FR') met entre les milliers, ni la flèche, ni le
 * signe moins typographique : sans ce nettoyage, les milliers sortent illisibles.
 */
function txt(s: string): string {
  return s
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2019/g, "'");
}

function nombre(v: number, decimales: number): string {
  return txt(v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
}

function cellule(v: string | number | Date | null, format?: string): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('fr-FR');
  if (typeof v === 'number') return nombre(v, format === 'kwh' ? 1 : 0);
  return txt(v);
}

export function exporterRapportPdf(r: RapportCourbe, nomFichier: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = doc.internal.pageSize.getWidth() - 2 * MARGE;
  const hauteurPage = doc.internal.pageSize.getHeight();
  let y = 18;

  const place = (h: number) => {
    if (y + h > hauteurPage - 18) { doc.addPage(); y = 18; }
  };
  const titreSection = (t: string) => {
    place(14);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BLEU);
    doc.text(txt(t), MARGE, y);
    doc.setDrawColor(...BLEU);
    doc.setLineWidth(0.3);
    doc.line(MARGE, y + 1.5, MARGE + largeur, y + 1.5);
    y += 6;
  };
  const paragraphe = (t: string, opts: { taille?: number; italique?: boolean; couleur?: [number, number, number]; retrait?: number } = {}) => {
    doc.setFont('helvetica', opts.italique ? 'italic' : 'normal');
    doc.setFontSize(opts.taille ?? 9);
    doc.setTextColor(...(opts.couleur ?? [30, 30, 30]));
    const lignes = doc.splitTextToSize(txt(t), largeur - (opts.retrait ?? 0));
    const h = lignes.length * (opts.taille ?? 9) * 0.42;
    place(h + 1);
    doc.text(lignes, MARGE + (opts.retrait ?? 0), y);
    y += h + 1.5;
  };
  const tableau = (t: Tableau) => {
    if (t.note) paragraphe(t.note, { taille: 8, italique: true, couleur: GRIS });
    if (t.lignes.length === 0) { paragraphe('Aucune donnée.', { taille: 8, italique: true, couleur: GRIS }); return; }
    autoTable(doc, {
      startY: y,
      head: [t.colonnes.map(c => txt(c.titre))],
      body: t.lignes.map(l => l.map((v, i) => cellule(v, t.colonnes[i]?.format))),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' },
      headStyles: { fillColor: BLEU, fontSize: 7.5 },
      columnStyles: Object.fromEntries(t.colonnes.map((c, i) => [i, c.format === 'kwh' || c.format === 'nombre' ? { halign: 'right' } : {}])),
      margin: { left: MARGE, right: MARGE },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  // ── En-tête ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 30, 60);
  doc.text(txt(r.titre), MARGE, y);
  y += 6;
  if (r.sousTitre) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(txt(r.sousTitre), MARGE, y);
    y += 4;
  }

  titreSection('Périmètre');
  autoTable(doc, {
    startY: y,
    body: r.perimetre.map(([k, v]) => [txt(k), txt(v)]),
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 0.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    margin: { left: MARGE, right: MARGE },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

  titreSection('Chiffres clés');
  autoTable(doc, {
    startY: y,
    head: [['Indicateur', 'Valeur', 'Précision']],
    body: r.chiffres.map(c => [
      txt(c.libelle),
      c.valeur == null ? 'non mesuré' : `${nombre(c.valeur, 1)} ${c.unite}`,
      txt(c.precision),
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: BLEU },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 32, halign: 'right' } },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'non mesuré') {
        d.cell.styles.fontStyle = 'italic';
        d.cell.styles.textColor = [146, 64, 14];
      }
    },
    margin: { left: MARGE, right: MARGE },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

  titreSection('Synthèse');
  for (const p of r.phrases) paragraphe(`•  ${p}`, { retrait: 2 });

  if (r.commentaire) {
    titreSection("Avis de l'analyste");
    paragraphe(r.commentaire.texte);
    paragraphe(`${r.commentaire.auteur} — ${r.commentaire.date.toLocaleString('fr-FR')}. Interprétation de l'analyste, distincte des chiffres mesurés.`,
      { taille: 8, italique: true, couleur: GRIS });
  }

  // Graphiques : PNG dessinés à partir des mêmes séries que les tableaux
  const image = (png: string | null, ratio: number) => {
    if (!png) return;
    const h = largeur * ratio;
    place(h + 2);
    doc.addImage(png, 'PNG', MARGE, y, largeur, h);
    y += h + 3;
  };
  const imgJour = graphiqueJournalier(r.graphiques.journalier);
  const imgTypes = graphiqueTypesJour(r.graphiques.typesJour, r.graphiques.couleurTypes);
  if (imgJour || imgTypes) {
    titreSection('Graphiques');
    image(imgJour, 760 / 1800);
    image(imgTypes, 520 / 1200 * 0.75);
  }

  titreSection('Données journalières');
  tableau(r.journalier);
  titreSection('Moyennes par type de jour');
  tableau(r.typesJour);
  titreSection('Total par mois');
  tableau(r.mensuel);

  titreSection('Qualité des données');
  tableau(r.qualite.signalements);
  if (r.qualite.joursExclus.lignes.length) {
    paragraphe('Jours exclus des statistiques', { taille: 9 });
    tableau(r.qualite.joursExclus);
  }
  for (const [k, v] of r.qualite.listes) paragraphe(`${k} : ${v}`, { taille: 8 });
  if (r.qualite.sites) {
    paragraphe('Bilan par site', { taille: 9 });
    tableau(r.qualite.sites);
  }
  paragraphe("Le détail par appareil et par jour figure dans le rapport Excel (feuille « Détail »).", { taille: 8, italique: true, couleur: GRIS });

  // ── Pied de page : date d'export et numéro de page ──────────
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(txt(`${r.titre} — ${r.sousTitre}`), MARGE, hauteurPage - 8);
    doc.text(`Page ${i} / ${n}`, MARGE + largeur, hauteurPage - 8, { align: 'right' });
  }

  doc.save(nomFichier);
}
