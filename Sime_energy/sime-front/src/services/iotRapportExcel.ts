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
import type { RapportAnalyses, RelevesRapport } from './iotRapportAnalyses';
import { ajouterGraphiquesNatifs, type GraphiqueExcel } from './iotRapportGraphiquesExcel';

const BLEU = 'FF1E3A8A';
const GRIS = 'FFF1F5F9';
const FORMATS: Record<string, string> = {
  kwh: '#,##0.000',
  nombre: '#,##0',
  pct: '0.0 %',
  date: 'dd/mm/yyyy',
  dateheure: 'dd/mm/yyyy hh:mm',
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

/** Une section titrée dans une feuille ; renvoie où est l'en-tête, pour y lier un graphique. */
function section(ws: ExcelJS.Worksheet, ligne: number, intitule: string, t: Tableau): { ligneEntete: number; fin: number } {
  titre(ws, ligne, intitule);
  const debut = ligne + 1;
  const fin = ecrireTableau(ws, debut, t);
  return { ligneEntete: t.note ? debut + 1 : debut, fin };
}

/** Page d'entrée : l'essentiel, où va l'énergie, à retenir, à vérifier, quel onglet pour quoi. */
function feuilleLisezMoi(wb: ExcelJS.Workbook, r: RapportCourbe, a: RapportAnalyses, onglets: [string, string][]) {
  const ws = wb.addWorksheet('Lisez-moi');
  largeurs(ws, [44, 16, 12, 72]);
  titre(ws, 1, r.titre, 15);
  ws.getCell(2, 1).value = r.sousTitre;
  let l = 4;
  const bloc = (texte: string, derniere = 4) => {
    ws.mergeCells(l, 1, l, derniere);
    const c = ws.getCell(l, 1);
    c.value = texte;
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(l).height = Math.max(18, Math.ceil(texte.length / 125) * 16);
    l++;
  };
  titre(ws, l++, '1. L’essentiel');
  for (const c of a.essentiel) {
    const row = ws.getRow(l++);
    row.getCell(1).value = c.libelle;
    row.getCell(1).font = { bold: true };
    if (c.valeur == null) {
      row.getCell(2).value = 'non mesuré';
      row.getCell(2).font = { italic: true, color: { argb: 'FF92400E' } };
    } else {
      row.getCell(2).value = c.valeur;
      row.getCell(2).numFmt = c.unite === 'W' || c.unite === 'h' ? '#,##0' : '#,##0.0';
    }
    row.getCell(3).value = c.unite;
    row.getCell(4).value = c.precision;
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
  }
  l++;
  titre(ws, l++, '2. Où va l’énergie ?');
  const rep = a.repartition.filter(x => x.kwh > 0).sort((x, y) => y.kwh - x.kwh);
  if (rep.length) {
    entete(ws, l++, ['Usage', 'kWh', 'Part']);
    for (const x of rep) {
      const row = ws.getRow(l++);
      row.getCell(1).value = x.libelle;
      row.getCell(2).value = x.kwh;
      row.getCell(2).numFmt = FORMATS.kwh;
      if (x.part != null) { row.getCell(3).value = x.part; row.getCell(3).numFmt = FORMATS.pct; }
    }
  } else {
    bloc('Répartition non disponible sur ce périmètre.');
  }
  l++;
  titre(ws, l++, '3. Ce qu’il faut retenir');
  if (a.aRetenir) {
    ws.getCell(l, 1).value = 'Analyse de l’analyste';
    ws.getCell(l, 1).font = { bold: true };
    l++;
    bloc(a.aRetenir);
  }
  ws.getCell(l, 1).value = 'Constats calculés à partir des mesures';
  ws.getCell(l, 1).font = { bold: true };
  l++;
  for (const p of a.constats) bloc(`• ${p}`);
  if (a.controle) bloc(a.controle.texte);
  l++;
  titre(ws, l++, '4. À vérifier sur site');
  if (a.aVerifier) {
    ws.getCell(l, 1).value = 'Questions de l’analyste';
    ws.getCell(l, 1).font = { bold: true };
    l++;
    bloc(a.aVerifier);
  }
  if (a.aVerifierAuto.length) {
    ws.getCell(l, 1).value = 'Détecté automatiquement : une piste, pas une conclusion';
    ws.getCell(l, 1).font = { bold: true };
    l++;
    for (const p of a.aVerifierAuto) bloc(`• ${p}`);
  } else if (!a.aVerifier) {
    bloc('Rien de signalé automatiquement.');
  }
  l++;
  titre(ws, l++, '5. Quel onglet pour quoi ?');
  for (const [nom, role] of onglets) {
    const c = ws.getCell(l, 1);
    c.value = { text: nom, hyperlink: `#'${nom.replace(/'/g, "''")}'!A1` };
    c.font = { color: { argb: 'FF1D4ED8' }, underline: true };
    ws.mergeCells(l, 2, l, 4);
    ws.getCell(l, 2).value = role;
    l++;
  }
}

/** Carte de chaleur : heures en ordonnée (0 h en bas), dates en bas, une seule couleur en dégradé. */
function feuilleCarte(wb: ExcelJS.Workbook, a: NonNullable<RapportAnalyses['carte']>, couleur: string) {
  const ws = wb.addWorksheet('Carte de chaleur');
  ws.getColumn(1).width = 8;
  titre(ws, 1, 'kWh de chaque heure, jour par jour (série principale) ; case vide = non mesuré');
  const n = a.jours.length;
  for (let i = 0; i < n; i++) ws.getColumn(i + 2).width = 6.5;
  a.matrice.forEach((_, inv) => {
    const h = 23 - inv;
    const row = ws.getRow(3 + inv);
    row.getCell(1).value = `${String(h).padStart(2, '0')} h`;
    row.getCell(1).font = { bold: true };
    a.matrice[h].forEach((v, i) => {
      if (v == null) return;
      const c = row.getCell(i + 2);
      c.value = v;
      c.numFmt = '0.00';
    });
  });
  const ligneDates = 3 + 24;
  const pas = Math.max(1, Math.ceil(n / 31));
  a.jours.forEach((j, i) => {
    if (i % pas !== 0) return;
    const c = ws.getRow(ligneDates).getCell(i + 2);
    c.value = `${j.slice(8, 10)}/${j.slice(5, 7)}`;
    c.font = { bold: true, size: 8 };
    c.alignment = { horizontal: 'center' };
  });
  const fin = ws.getRow(26).getCell(n + 1).address;
  ws.addConditionalFormatting({
    ref: `B3:${fin}`,
    rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: `FF${couleur.replace('#', '').toUpperCase()}` }] }],
  });
  ws.views = [{ state: 'frozen', xSplit: 1 }];
}

export async function exporterRapportExcel(r: RapportCourbe, nomFichier: string, a?: RapportAnalyses | null, releves?: RelevesRapport | null): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIMEE — module IOT';
  wb.created = new Date();

  // Onglets réellement présents : la page d'entrée ne renvoie jamais à une feuille absente
  if (a) {
    const onglets: [string, string][] = [
      ['Synthèse', 'Périmètre, chiffres clés et phrases calculées'],
      ['Graphiques', 'Tous les graphiques, liés aux feuilles et modifiables dans Excel'],
      ['Tranches horaires', 'Jour, nuit, soirée, par type de jour'],
      ['Profil horaire-type', 'La journée type, par type de jour et par circuit'],
      ...(a.carte ? [['Carte de chaleur', 'Chaque heure de chaque jour'] as [string, string]] : []),
      ['Synthèse voies', 'Énergie, puissances, talon et tensions de chaque circuit'],
      ['Bilan énergie', 'Où va l’énergie : circuits seuls, non mesuré, classement'],
      ['Tableau croisé', 'Par mois, semaine, jour de semaine, type de jour, appareil, pièce, phases'],
      ['Statistiques', 'Heures classées, distribution, lien avec la température'],
      ...(a.pics ? [['Pics', 'Les minutes les plus fortes et chaque circuit à cet instant'] as [string, string]] : []),
      ...(a.coherence ? [['Cohérence', 'Les compteurs concordent-ils entre eux ?'] as [string, string]] : []),
      ['Horaire', 'Détail heure par heure'],
      ['Journalier', 'Détail jour par jour, avec les heures couvertes'],
      ['Types de jour', 'Moyennes par type de jour'],
      ['Mensuel', 'Total par mois'],
      ['Qualité', 'Signalements et jours exclus'],
      ['Détail', 'Une ligne par appareil et par jour'],
      ...(releves ? [['Brut', 'Les relevés tels que collectés'] as [string, string], ['Nettoyé', 'Sans lignes vides ni relectures'] as [string, string], ['Journal nettoyage', 'Ce qui a été retiré'] as [string, string]] : []),
    ];
    feuilleLisezMoi(wb, r, a, onglets);
  }

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
  // Feuilles d'analyse : écrites ici pour y lier les graphiques
  const principal = g.couleurTypes;
  const couleurs = [principal, '#d97706', '#16a34a', '#a855f7', '#0891b2', '#dc2626'];
  let ancrage = 46;
  const placer = (spec: Omit<GraphiqueExcel, 'deLigne' | 'aLigne'>, hauteur = 20) => {
    graphiques.push({ ...spec, deLigne: ancrage, aLigne: ancrage + hauteur });
    ancrage += hauteur + 2;
  };
  const wg = (graphiques.length || a) ? wb.addWorksheet('Graphiques') : null;
  if (wg) {
    wg.getCell(1, 1).value = 'Graphiques liés aux feuilles du classeur : clic droit sur un graphique pour en modifier les couleurs, le type ou les séries.';
    wg.getCell(1, 1).font = { italic: true, color: { argb: 'FF64748B' } };
  }
  if (a) {
    // Sans graphique journalier, on démarre en haut de la feuille
    if (graphiques.length === 0) ancrage = 2;

    const wt = wb.addWorksheet('Tranches horaires');
    largeurs(wt, [28, 12, 14, 14, 14, 14, 14]);
    const st = section(wt, 1, 'Jour, nuit, soirée', a.tranches);
    section(wt, st.fin, 'Par type de jour', a.tranchesParType);
    if (a.tranches.lignes.length) {
      placer({ titre: 'Énergie de jour et de nuit', feuille: 'Tranches horaires', ligneEntete: st.ligneEntete, nbLignes: 2, colonneCategories: 'A', barres: null, courbes: [], camembert: 'B' }, 18);
    }

    const wp = wb.addWorksheet('Profil horaire-type');
    largeurs(wp, [10, 14, 14, 14, 14, 16]);
    const sp = section(wp, 1, 'Journée type (kWh par heure)', a.profil24);
    if (a.profil24.lignes.length) {
      placer({
        titre: 'Journée type (kWh par heure)', feuille: 'Profil horaire-type', ligneEntete: sp.ligneEntete, nbLignes: 24, colonneCategories: 'A', barres: null,
        courbes: ['B', 'C', 'D', 'E'].map((colonne, i) => ({ colonne, couleur: couleurs[i] })),
      });
    }
    if (a.profilCircuits) {
      const pc = a.profilCircuits;
      for (let i = 1; i < pc.colonnes.length; i++) wp.getColumn(i + 1).width = Math.max(wp.getColumn(i + 1).width ?? 12, 16);
      const sc = section(wp, sp.fin, 'Puissance moyenne par circuit (W)', pc);
      placer({
        titre: 'Journée type par circuit (W)', feuille: 'Profil horaire-type', ligneEntete: sc.ligneEntete, nbLignes: 24, colonneCategories: 'A', barres: null, uniteAxe: 'W',
        courbes: pc.colonnes.slice(1, 7).map((_, i) => ({ colonne: lettre(i + 1), couleur: couleurs[i % couleurs.length] })),
      });
    }
    if (a.carte) feuilleCarte(wb, a.carte, principal);

    feuilleTableau(wb, 'Synthèse voies', a.voies, [36, 26, 18, 16, 10, 12, 10, 10, 16, 10, 10, 9, 9]);

    const wb2 = wb.addWorksheet('Bilan énergie');
    largeurs(wb2, [30, 36, 22, 12, 14, 48]);
    const sb = section(wb2, 1, 'Bilan site par site', a.bilan);
    const scl = section(wb2, sb.fin, 'Classement des usages', a.classement);
    if (a.classement.lignes.length) {
      placer({ titre: 'Répartition de la consommation', feuille: 'Bilan énergie', ligneEntete: scl.ligneEntete, nbLignes: a.classement.lignes.length, colonneCategories: 'A', barres: null, courbes: [], camembert: 'B' });
      placer({ titre: 'Usages, du plus gros au plus petit', feuille: 'Bilan énergie', ligneEntete: scl.ligneEntete, nbLignes: a.classement.lignes.length, colonneCategories: 'A', barres: { colonne: 'B', couleur: principal }, courbes: [], etiquettes: true });
    }

    const wx = wb.addWorksheet('Tableau croisé');
    largeurs(wx, [32, 18, 16, 12, 12, 14, 14]);
    let lx = 1;
    const vue = (intitule: string, t: Tableau, colonne: string, titreG: string) => {
      const s = section(wx, lx, intitule, t);
      lx = s.fin;
      if (t.lignes.length) placer({ titre: titreG, feuille: 'Tableau croisé', ligneEntete: s.ligneEntete, nbLignes: t.lignes.length, colonneCategories: 'A', barres: { colonne, couleur: principal }, courbes: [], etiquettes: t.lignes.length <= 12 }, 18);
    };
    vue('Par mois', a.tcd.mois, 'B', 'kWh par mois');
    vue('Par semaine', a.tcd.semaine, 'B', 'kWh par semaine');
    vue('Par jour de la semaine', a.tcd.jourSemaine, 'E', 'kWh par jour, selon le jour de la semaine');
    vue('Par type de jour', a.tcd.typeJour, 'E', 'kWh par jour, selon le type de jour');
    {
      const s = section(wx, lx, 'Par appareil', a.tcd.appareil);
      lx = s.fin;
      if (a.tcd.appareil.lignes.length) placer({ titre: 'kWh par appareil (compteurs de niveaux différents)', feuille: 'Tableau croisé', ligneEntete: s.ligneEntete, nbLignes: a.tcd.appareil.lignes.length, colonneCategories: 'A', barres: { colonne: 'D', couleur: principal }, courbes: [] });
    }
    if (a.tcd.piece) vue('Par pièce', a.tcd.piece, 'B', 'kWh par pièce');
    if (a.tcd.phases) {
      const s = section(wx, lx, 'Par phase', a.tcd.phases);
      lx = s.fin;
      placer({ titre: 'Répartition des phases A, B, C', feuille: 'Tableau croisé', ligneEntete: s.ligneEntete, nbLignes: a.tcd.phases.lignes.length, colonneCategories: 'A', barres: null, courbes: ['B', 'C', 'D'].map((colonne, i) => ({ colonne, couleur: ['#a855f7', '#f59e0b', '#ec4899'][i] })) }, 18);
    }

    const ws2 = wb.addWorksheet('Statistiques');
    largeurs(ws2, [24, 14, 14, 16]);
    const sd = section(ws2, 1, 'Distribution des heures', a.distribution);
    if (a.distribution.lignes.length) placer({ titre: 'Distribution des kWh par heure', feuille: 'Statistiques', ligneEntete: sd.ligneEntete, nbLignes: a.distribution.lignes.length, colonneCategories: 'A', barres: { colonne: 'B', couleur: principal }, courbes: [], uniteAxe: 'heures' }, 18);
    let ls = sd.fin;
    if (a.temperature) ls = section(ws2, ls, 'Consommation et température', a.temperature).fin;
    const sm = section(ws2, ls, 'Heures classées (monotone de charge)', a.monotone);
    if (a.monotone.lignes.length) placer({ titre: 'Heures classées de la plus chargée à la moins chargée', feuille: 'Statistiques', ligneEntete: sm.ligneEntete, nbLignes: a.monotone.lignes.length, colonneCategories: 'A', barres: null, courbes: [{ colonne: 'C', couleur: principal }] }, 18);

    if (a.pics) feuilleTableau(wb, 'Pics', a.pics, [16, 14, ...a.pics.colonnes.slice(2).map(() => 14)]);
    if (a.coherence) feuilleTableau(wb, 'Cohérence', a.coherence, [30, 40, 12, 14, 12, 14, 54]);

    feuilleTableau(wb, 'Horaire', a.horaire, [16, 14, 12, 12, ...a.horaire.colonnes.slice(4).map(() => 14)]);
    if (a.horaire.lignes.length) {
      placer({
        titre: 'Courbe de charge heure par heure (W)', feuille: 'Horaire', ligneEntete: a.horaire.note ? 2 : 1, nbLignes: a.horaire.lignes.length,
        colonneCategories: 'A', formatCategories: 'dd/mm hh"h"', barres: null, uniteAxe: 'W',
        courbes: [{ colonne: 'C', couleur: principal }, { colonne: 'D', couleur: '#dc2626' }],
      });
    }
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

  if (releves) {
    const brut = (nom: string, lignes: RelevesRapport['brut']) => {
      const ws3 = wb.addWorksheet(nom);
      const colonnes = lignes[0] ? Object.keys(lignes[0]) : [];
      entete(ws3, 1, colonnes);
      colonnes.forEach((_, i) => { ws3.getColumn(i + 1).width = i < 2 ? 22 : 12; });
      for (const x of lignes) ws3.addRow(colonnes.map(c => x[c]));
      ws3.views = [{ state: 'frozen', ySplit: 1 }];
    };
    brut('Brut', releves.brut);
    brut('Nettoyé', releves.nettoye);
    feuilleTableau(wb, 'Journal nettoyage', releves.journal, [60, 14]);
  }

  const buffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
  triggerDownload(await ajouterGraphiquesNatifs(buffer, 'Graphiques', graphiques) as unknown as ExcelJS.Buffer, nomFichier);
}
