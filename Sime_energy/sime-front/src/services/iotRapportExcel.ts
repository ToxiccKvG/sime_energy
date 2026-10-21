/**
 * Rapport de la Courbe de charge → classeur Excel.
 *
 * N'écrit que ce que contient le modèle (services/iotRapport.ts) : aucun
 * calcul ici. Les nombres restent des nombres (format d'affichage Excel),
 * pour que le classeur se vérifie et se retravaille sans ressaisie.
 */

import ExcelJS from 'exceljs';
import { triggerDownload } from '@/lib/excel-utils';
import type { RapportCourbe, Tableau } from './iotRapport';
import { ajouterGraphiquesNatifs, type GraphiqueExcel } from './iotRapportGraphiquesExcel';

const BLEU = 'FF1E3A8A';
const GRIS = 'FFF1F5F9';
const FORMATS: Record<string, string> = {
  kwh: '#,##0.000',
  nombre: '#,##0',
  pct: '0.0 %',
  date: 'dd/mm/yyyy',
};

function entete(ws: ExcelJS.Worksheet, ligne: number, titres: string[]) {
  const row = ws.getRow(ligne);
  titres.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 30;
}

function titre(ws: ExcelJS.Worksheet, ligne: number, texte: string, taille = 12) {
  const c = ws.getCell(ligne, 1);
  c.value = texte;
  c.font = { bold: true, size: taille, color: { argb: BLEU } };
}

function note(ws: ExcelJS.Worksheet, ligne: number, texte: string, largeur: number) {
  ws.mergeCells(ligne, 1, ligne, Math.max(1, largeur));
  const c = ws.getCell(ligne, 1);
  c.value = texte;
  c.font = { italic: true, color: { argb: 'FF92400E' } };
  c.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(ligne).height = 30;
}

/** Écrit un tableau à partir de `ligne` ; renvoie la ligne suivante libre. */
function ecrireTableau(ws: ExcelJS.Worksheet, ligne: number, t: Tableau, filtre = false): number {
  let l = ligne;
  if (t.note) { note(ws, l, t.note, t.colonnes.length); l++; }
  entete(ws, l, t.colonnes.map(c => c.titre));
  const premiere = l;
  l++;
  if (t.lignes.length === 0) {
    ws.getCell(l, 1).value = 'Aucune donnée';
    ws.getCell(l, 1).font = { italic: true, color: { argb: 'FF64748B' } };
    return l + 2;
  }
  for (const valeurs of t.lignes) {
    const row = ws.getRow(l);
    valeurs.forEach((v, i) => {
      const c = row.getCell(i + 1);
      // null = non mesuré : cellule vide, jamais 0
      c.value = v ?? null;
      const f = t.colonnes[i]?.format;
      if (f && FORMATS[f] && v != null) c.numFmt = FORMATS[f];
      if (f === 'texte') c.alignment = { wrapText: true, vertical: 'top' };
    });
    l++;
  }
  if (filtre) ws.autoFilter = { from: { row: premiere, column: 1 }, to: { row: l - 1, column: t.colonnes.length } };
  return l + 1;
}

function largeurs(ws: ExcelJS.Worksheet, l: number[]) {
  l.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function feuilleTableau(wb: ExcelJS.Workbook, nom: string, t: Tableau, l: number[]) {
  const ws = wb.addWorksheet(nom);
  largeurs(ws, l);
  const fin = ecrireTableau(ws, 1, t, true);
  // Figer l'en-tête (une ligne de plus quand une note la précède)
  ws.views = [{ state: 'frozen', ySplit: t.note ? 2 : 1 }];
  return fin;
}

export async function exporterRapportExcel(r: RapportCourbe, nomFichier: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIMEE — module IOT';
  wb.created = new Date();

  // ── Synthèse ────────────────────────────────────────────────
  const ws = wb.addWorksheet('Synthèse');
  largeurs(ws, [38, 18, 10, 70]);
  titre(ws, 1, r.titre, 14);
  ws.getCell(2, 1).value = r.sousTitre;
  let l = 4;
  titre(ws, l++, 'Périmètre');
  for (const [k, v] of r.perimetre) {
    ws.getCell(l, 1).value = k;
    ws.getCell(l, 1).font = { bold: true };
    ws.mergeCells(l, 2, l, 4);
    ws.getCell(l, 2).value = v;
    ws.getCell(l, 2).alignment = { wrapText: true, vertical: 'top' };
    l++;
  }
  l++;
  titre(ws, l++, 'Chiffres clés');
  entete(ws, l++, ['Indicateur', 'Valeur', 'Unité', 'Précision']);
  for (const c of r.chiffres) {
    const row = ws.getRow(l++);
    row.getCell(1).value = c.libelle;
    if (c.valeur == null) {
      row.getCell(2).value = 'non mesuré';
      row.getCell(2).font = { italic: true, color: { argb: 'FF92400E' } };
    } else {
      row.getCell(2).value = c.valeur;
      row.getCell(2).numFmt = '#,##0.0';
    }
    row.getCell(3).value = c.unite;
    row.getCell(4).value = c.precision;
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
  }
  l++;
  titre(ws, l++, 'Synthèse calculée (phrases tirées des chiffres ci-dessus)');
  for (const p of r.phrases) {
    ws.mergeCells(l, 1, l, 4);
    const c = ws.getCell(l, 1);
    c.value = `• ${p}`;
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(l).height = Math.max(18, Math.ceil(p.length / 110) * 16);
    l++;
  }
  if (r.commentaire) {
    l++;
    titre(ws, l++, "Avis de l'analyste");
    ws.mergeCells(l, 1, l, 4);
    const c = ws.getCell(l, 1);
    c.value = r.commentaire.texte;
    c.alignment = { wrapText: true, vertical: 'top' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    ws.getRow(l).height = Math.max(30, Math.ceil(r.commentaire.texte.length / 110) * 16 + 10);
    l++;
    ws.getCell(l, 1).value = `${r.commentaire.auteur} — ${r.commentaire.date.toLocaleString('fr-FR')}. Interprétation de l'analyste, distincte des chiffres mesurés.`;
    ws.getCell(l, 1).font = { italic: true, color: { argb: 'FF64748B' } };
  }

  // ── Graphiques : vrais graphiques Excel, liés aux feuilles (modifiables) ──
  const lettre = (i: number) => { let n = i + 1, l = ''; while (n > 0) { const m = (n - 1) % 26; l = String.fromCharCode(65 + m) + l; n = Math.floor((n - 1) / 26); } return l; };
  const colonneDe = (t: Tableau, titre: string) => { const i = t.colonnes.findIndex(c => c.titre === titre); return i < 0 ? null : lettre(i); };
  const g = r.graphiques;
  const graphiques: GraphiqueExcel[] = [];
  const barreCol = g.journalier.barres ? colonneDe(r.journalier, g.journalier.barres.libelle) : null;
  const courbesCol = g.journalier.courbes
    .map(c => ({ colonne: colonneDe(r.journalier, c.libelle), couleur: c.couleur }))
    .filter((c): c is { colonne: string; couleur: string } => c.colonne != null);
  if (r.journalier.lignes.length && (barreCol || courbesCol.length)) {
    graphiques.push({
      titre: 'Énergie par jour', feuille: 'Journalier', ligneEntete: r.journalier.note ? 2 : 1, nbLignes: r.journalier.lignes.length,
      colonneCategories: 'A', formatCategories: 'dd/mm',
      barres: barreCol ? { colonne: barreCol, couleur: g.journalier.barres!.couleur } : null,
      courbes: courbesCol,
      pointsClairs: g.journalier.exclus.flatMap((x, i) => (x ? [i] : [])),
      deLigne: 2, aLigne: 24,
    });
  }
  if (r.typesJour.lignes.length) {
    graphiques.push({
      titre: 'Moyenne par type de jour (kWh/j, jours retenus)', feuille: 'Types de jour', ligneEntete: r.typesJour.note ? 2 : 1,
      nbLignes: r.typesJour.lignes.length, colonneCategories: 'A',
      barres: { colonne: 'B', couleur: g.couleurTypes }, courbes: [], etiquettes: true,
      deLigne: 26, aLigne: 44,
    });
  }
  if (graphiques.length) {
    const wg = wb.addWorksheet('Graphiques');
    wg.getCell(1, 1).value = 'Graphiques liés aux feuilles « Journalier » et « Types de jour » : clic droit sur un graphique pour en modifier les couleurs, le type ou les séries.';
    wg.getCell(1, 1).font = { italic: true, color: { argb: 'FF64748B' } };
  }

  // ── Feuilles de données ─────────────────────────────────────
  feuilleTableau(wb, 'Journalier', r.journalier, [12, 11, 13, ...r.journalier.colonnes.slice(3).map(c => (c.format === 'texte' ? 45 : 16))]);
  feuilleTableau(wb, 'Types de jour', r.typesJour, [18, 20, 18]);
  feuilleTableau(wb, 'Mensuel', r.mensuel, [18, 22, 16, 16, 16]);

  const wq = wb.addWorksheet('Qualité');
  largeurs(wq, [22, 34, 14, 10, 10, 14, 40, 60]);
  let q = 1;
  titre(wq, q++, 'Signalements des règles qualité');
  q = ecrireTableau(wq, q, r.qualite.signalements);
  titre(wq, q++, 'Jours exclus des statistiques');
  q = ecrireTableau(wq, q, r.qualite.joursExclus);
  for (const [k, v] of r.qualite.listes) {
    wq.getCell(q, 1).value = k;
    wq.getCell(q, 1).font = { bold: true };
    wq.mergeCells(q, 2, q, 8);
    wq.getCell(q, 2).value = v;
    wq.getCell(q, 2).alignment = { wrapText: true, vertical: 'top' };
    q++;
  }
  if (r.qualite.sites) {
    q++;
    titre(wq, q++, 'Bilan par site');
    ecrireTableau(wq, q, r.qualite.sites);
  }

  feuilleTableau(wb, 'Détail', r.detail, [12, 16, 34, 34, 16, 14, 12, 12, 12, 12, 12, 16]);

  const buffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
  triggerDownload(await ajouterGraphiquesNatifs(buffer, 'Graphiques', graphiques) as unknown as ExcelJS.Buffer, nomFichier);
}
