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
import { graphiqueCarteChaleur, graphiqueCourbes, graphiqueJournalier, graphiqueRepartition, graphiqueTypesJour } from './iotRapportGraphiques';
import type { RapportAnalyses } from './iotRapportAnalyses';
import type { RapportCapteurs } from './iotRapportCapteurs';

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
  if (v instanceof Date && format === 'dateheure') return v.toISOString().slice(0, 16).replace(/(\d+)-(\d+)-(\d+)T/, '$3/$2 ');
  if (v instanceof Date) return v.toLocaleDateString('fr-FR');
  if (typeof v === 'number' && format === 'decimal') return nombre(v, 1);
  if (typeof v === 'number' && format === 'pct') return `${nombre(v * 100, 0)} %`;
  if (typeof v === 'number') return nombre(v, format === 'kwh' ? 1 : 0);
  return txt(v);
}

export function exporterRapportPdf(r: RapportCourbe, nomFichier: string, a?: RapportAnalyses | null, cap?: RapportCapteurs | null): void {
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

  // ── L'essentiel d'abord : le lecteur pressé s'arrête là ─────
  if (a) {
    titreSection('L’essentiel');
    autoTable(doc, {
      startY: y,
      body: a.essentiel.map(c => [
        txt(c.libelle),
        c.valeur == null ? 'non mesuré' : `${nombre(c.valeur, c.unite === 'W' || c.unite === 'h' ? 0 : 1)} ${c.unite}`,
        txt(c.precision),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.2 },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 30, halign: 'right' } },
      margin: { left: MARGE, right: MARGE },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
    titreSection('Ce qu’il faut retenir');
    if (a.aRetenir) paragraphe(a.aRetenir);
    for (const p of a.constats) paragraphe(`•  ${p}`, { retrait: 2 });
    if (a.aVerifier || a.aVerifierAuto.length) {
      titreSection('À vérifier sur site');
      if (a.aVerifier) paragraphe(a.aVerifier);
      if (a.aVerifierAuto.length) {
        paragraphe('Détecté automatiquement : une piste, pas une conclusion.', { taille: 8, italique: true, couleur: GRIS });
        for (const p of a.aVerifierAuto) paragraphe(`•  ${p}`, { retrait: 2 });
      }
    }
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
    doc.addImage(png, 'PNG', MARGE, y, largeur, h, undefined, 'FAST'); // compressé : sinon plusieurs Mo
    y += h + 3;
  };
  const imgJour = graphiqueJournalier(r.graphiques.journalier);
  const imgTypes = graphiqueTypesJour(r.graphiques.typesJour, r.graphiques.couleurTypes);
  if (imgJour || imgTypes) {
    // Le titre reste avec son premier graphique
    place(16 + largeur * (imgJour ? 760 / 1800 : (520 / 1200) * 0.75));
    titreSection('Graphiques');
    image(imgJour, 760 / 1800);
    image(imgTypes, 520 / 1200 * 0.75);
  }

  if (a) {
    const heures = Array.from({ length: 24 }, (_, h) => `${h} h`);
    const col = (i: number) => a.profil24.lignes.map(l => l[i] as number | null);
    const principal = r.graphiques.couleurTypes;
    const imgProfil = graphiqueCourbes('Journée type (kWh par heure)', heures, [
      { libelle: 'Tous les jours', valeurs: col(1), couleur: principal },
      { libelle: 'Jours ouvrés', valeurs: col(2), couleur: '#d97706' },
      { libelle: 'Samedis', valeurs: col(3), couleur: '#16a34a' },
      { libelle: 'Dimanches', valeurs: col(4), couleur: '#a855f7' },
    ], 'kWh');
    const imgCarte = a.carte ? graphiqueCarteChaleur('Chaque heure de chaque jour', a.carte, principal) : null;
    const imgRep = graphiqueRepartition('Où va l’énergie ?', a.repartition, principal);
    if (a.tranches.lignes.length) {
      titreSection('Jour, nuit, soirée');
      tableau(a.tranches);
      tableau(a.tranchesParType);
    }
    if (imgProfil || imgCarte) {
      place(16 + largeur * (imgProfil ? 700 / 1800 : 760 / 1800));
      titreSection('Analyse par heure');
    }
    image(imgProfil, 700 / 1800);
    image(imgCarte, 760 / 1800);
    if (imgRep) {
      place(16 + largeur * ((90 + Math.min(12, a.repartition.filter(x => x.kwh > 0).length) * 54 + 20) / 1800));
      titreSection('Où va l’énergie');
      image(imgRep, (90 + Math.min(12, a.repartition.filter(x => x.kwh > 0).length) * 54 + 20) / 1800);
    }
  }

  if (a?.comparaisonSites) {
    titreSection('Comparaison des sites');
    tableau(colonnes(a.comparaisonSites, ['Site', 'Série mesurée', 'kWh', 'Part du total', 'Jours', 'kWh par jour', 'Part du jour', 'P max']));
  }
  if (cap) {
    titreSection('Capteurs');
    paragraphe(`Sur ce périmètre : ${cap.resume}.`);
    for (const p of cap.constats) paragraphe(`•  ${p}`, { retrait: 2 });
    for (const p of cap.aVerifierAuto) paragraphe(`•  À vérifier : ${p}`, { retrait: 2 });
    if (cap.grandeurs) tableau(colonnes(cap.grandeurs, ['Grandeur', 'Capteur', 'Heures', 'Minimum', 'Maximum', 'Moyenne', 'Total']));
    if (cap.etats) tableau(colonnes(cap.etats, ['Site', 'Capteur', 'Ce qui est compté', 'Nombre', 'Durée (h)']));
    tableau(colonnes(cap.sante, ['Site', 'Capteur', 'Heures mesurées', 'Pile', 'Remarque']));
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
  paragraphe("Tableau croisé, circuits, pics et détail par appareil et par jour : voir le rapport Excel.", { taille: 8, italique: true, couleur: GRIS });

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

/** Garde les colonnes utiles d'un tableau trop large pour une page A4. */
function colonnes(t: Tableau, titres: string[]): Tableau {
  const garder = titres.map(x => t.colonnes.findIndex(c => c.titre.startsWith(x))).filter(i => i >= 0);
  return { colonnes: garder.map(i => t.colonnes[i]), lignes: t.lignes.map(l => garder.map(i => l[i])) };
}

interface EntetePdfCapteurs { titre: string; sousTitre: string; perimetre: [string, string][]; aRetenir: string; aVerifier: string }

/** Synthèse courte d'un rapport capteurs : l'Excel porte le détail. */
export function exporterRapportCapteursPdf(cap: RapportCapteurs, entete: EntetePdfCapteurs, nomFichier: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largeur = doc.internal.pageSize.getWidth() - 2 * MARGE;
  const hauteurPage = doc.internal.pageSize.getHeight();
  let y = 18;
  const place = (h: number) => { if (y + h > hauteurPage - 18) { doc.addPage(); y = 18; } };
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
  const paragraphe = (t: string, retrait = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    const lignes = doc.splitTextToSize(txt(t), largeur - retrait);
    const h = lignes.length * 9 * 0.42;
    place(h + 1);
    doc.text(lignes, MARGE + retrait, y);
    y += h + 1.5;
  };
  const tableau = (t: Tableau) => {
    if (t.lignes.length === 0) return;
    autoTable(doc, {
      startY: y,
      head: [t.colonnes.map(c => txt(c.titre))],
      body: t.lignes.map(l => l.map((v, i) => cellule(v, t.colonnes[i]?.format))),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' },
      headStyles: { fillColor: BLEU, fontSize: 7.5 },
      margin: { left: MARGE, right: MARGE },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };
  const image = (png: string | null, ratio: number) => {
    if (!png) return;
    const h = largeur * ratio;
    place(h + 2);
    doc.addImage(png, 'PNG', MARGE, y, largeur, h, undefined, 'FAST');
    y += h + 3;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 30, 60);
  doc.text(txt(entete.titre), MARGE, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text(txt(entete.sousTitre), MARGE, y);
  y += 4;

  titreSection('Périmètre');
  for (const [k, v] of entete.perimetre) paragraphe(`${k} : ${v}`);
  paragraphe(`Sur ce périmètre : ${cap.resume}.`);
  titreSection('Ce qu’il faut retenir');
  if (entete.aRetenir) paragraphe(entete.aRetenir);
  for (const p of cap.constats) paragraphe(`•  ${p}`, 2);
  if (entete.aVerifier || cap.aVerifierAuto.length) {
    titreSection('À vérifier sur site');
    if (entete.aVerifier) paragraphe(entete.aVerifier);
    for (const p of cap.aVerifierAuto) paragraphe(`•  ${p}`, 2);
  }
  if (cap.grandeurs) {
    titreSection('Les mesures, capteur par capteur');
    tableau(colonnes(cap.grandeurs, ['Grandeur', 'Capteur', 'Heures', 'Minimum', 'Date du minimum', 'Maximum', 'Date du maximum', 'Moyenne', 'Total']));
  }
  // Les quatre premières grandeurs : le détail complet est dans l'Excel
  const COULEURS = ['#f97316', '#2563eb', '#16a34a', '#a855f7', '#0891b2', '#dc2626'];
  for (const v of cap.vues.slice(0, 4)) {
    const source = v.profil24 ?? v.parJour;
    const categories = source.lignes.map(l => String(l[0]));
    const series = source.colonnes.slice(1, 7).map((c, i) => ({
      libelle: c.titre.length > 40 ? `${c.titre.slice(0, 39)}…` : c.titre,
      valeurs: source.lignes.map(l => l[i + 1] as number | null),
      couleur: COULEURS[i],
    }));
    const png = graphiqueCourbes(v.profil24 ? `${v.def.libelle} : journée type` : `${v.def.libelle} par jour`, categories, series, v.def.unite || 'valeur');
    place(16 + largeur * (700 / 1800));
    titreSection(v.def.libelle);
    image(png, 700 / 1800);
    if (v.carte) image(graphiqueCarteChaleur(v.carte.titre, v.carte, COULEURS[0], { unite: v.def.unite }), 760 / 1800);
  }
  if (cap.etats) {
    titreSection('États');
    tableau(colonnes(cap.etats, ['Site', 'Capteur', 'Ce qui est compté', 'Nombre', 'Durée (h)']));
  }
  titreSection('Santé des capteurs');
  tableau(colonnes(cap.sante, ['Site', 'Capteur', 'Heures mesurées', 'Pile', 'Remarque']));
  paragraphe('Détail par jour, journée type, cartes de chaleur et croisements : voir le rapport Excel.');

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(txt(`${entete.titre} — ${entete.sousTitre}`), MARGE, hauteurPage - 8);
    doc.text(`Page ${i} / ${n}`, MARGE + largeur, hauteurPage - 8, { align: 'right' });
  }
  doc.save(nomFichier);
}
