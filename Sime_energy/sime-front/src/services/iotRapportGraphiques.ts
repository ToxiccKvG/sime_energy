/**
 * Graphiques du rapport de la Courbe de charge, dessinés en PNG (fond blanc)
 * pour le PDF et l'Excel.
 *
 * Ne trace que les séries du modèle (services/iotRapport.ts) : la série
 * principale en barres, les flux mesurés à part en courbes séparées —
 * jamais empilés, jamais additionnés.
 */

import type { GraphiquesRapport } from './iotRapport';

const GRILLE = '#e2e8f0';
const TEXTE = '#334155';
const POLICE = 'Helvetica, Arial, sans-serif';

const nf = (v: number, d = 0) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Graduation « ronde » de l'axe vertical : 0 → max en 4 à 6 pas. */
function graduation(max: number): { pas: number; haut: number } {
  if (max <= 0) return { pas: 1, haut: 1 };
  const brut = max / 5;
  const p10 = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map(m => m * p10).find(x => x >= brut) ?? 10 * p10;
  return { pas, haut: Math.ceil(max / pas) * pas };
}

function toile(l: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, l, h);
  return [c, ctx];
}

function legende(ctx: CanvasRenderingContext2D, items: { libelle: string; couleur: string; forme: 'barre' | 'ligne' | 'hachure' }[], x: number, y: number) {
  ctx.font = `22px ${POLICE}`;
  ctx.textBaseline = 'middle';
  let cx = x;
  for (const it of items) {
    if (it.forme === 'ligne') {
      ctx.strokeStyle = it.couleur;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + 30, y); ctx.stroke();
    } else {
      ctx.fillStyle = it.couleur;
      ctx.globalAlpha = it.forme === 'hachure' ? 0.35 : 1;
      ctx.fillRect(cx, y - 9, 30, 18);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = TEXTE;
    ctx.fillText(it.libelle, cx + 38, y);
    cx += 38 + ctx.measureText(it.libelle).width + 34;
  }
}

/** Énergie par jour : barres (série principale) + courbes (flux à part). PNG en data URL, ou null s'il n'y a rien à tracer. */
export function graphiqueJournalier(g: GraphiquesRapport['journalier']): string | null {
  const n = g.dates.length;
  if (n === 0 || (!g.barres && g.courbes.length === 0)) return null;
  const L = 1800, H = 760;
  const [c, ctx] = toile(L, H);
  const m = { g: 110, d: 30, h: 90, b: 90 };
  const lz = L - m.g - m.d, hz = H - m.h - m.b;

  const toutes = [...(g.barres?.valeurs ?? []), ...g.courbes.flatMap(s => s.valeurs)].filter((v): v is number => v != null);
  const { pas, haut } = graduation(Math.max(0, ...toutes));
  const yDe = (v: number) => m.h + hz - (v / haut) * hz;
  const xCentre = (i: number) => m.g + (i + 0.5) * (lz / n);

  // Grille et axe vertical
  ctx.font = `22px ${POLICE}`;
  ctx.fillStyle = TEXTE;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= haut + 1e-9; v += pas) {
    const y = yDe(v);
    ctx.strokeStyle = GRILLE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(L - m.d, y); ctx.stroke();
    ctx.fillText(nf(v, pas < 1 ? 1 : 0), m.g - 12, y);
  }
  ctx.save();
  ctx.translate(30, m.h + hz / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('kWh', 0, 0);
  ctx.restore();

  // Barres : jours exclus des statistiques en clair (ils restent comptés dans le total)
  if (g.barres) {
    const lb = Math.max(2, (lz / n) * 0.7);
    g.barres.valeurs.forEach((v, i) => {
      if (v == null) return;
      ctx.fillStyle = g.barres!.couleur;
      ctx.globalAlpha = g.exclus[i] ? 0.35 : 1;
      ctx.fillRect(xCentre(i) - lb / 2, yDe(Math.max(0, v)), lb, yDe(0) - yDe(Math.max(0, v)));
      ctx.globalAlpha = 1;
    });
  }

  // Courbes : une par flux, interrompue les jours sans valeur
  g.courbes.forEach(s => {
    ctx.strokeStyle = s.couleur;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 4;
    ctx.beginPath();
    let enCours = false;
    s.valeurs.forEach((v, i) => {
      if (v == null) { enCours = false; return; }
      if (enCours) ctx.lineTo(xCentre(i), yDe(v)); else ctx.moveTo(xCentre(i), yDe(v));
      enCours = true;
    });
    ctx.stroke();
    if (n <= 62) s.valeurs.forEach((v, i) => {
      if (v == null) return;
      ctx.beginPath(); ctx.arc(xCentre(i), yDe(v), 5, 0, 2 * Math.PI); ctx.fill();
    });
  });

  // Abscisse : dates espacées pour ne pas se chevaucher
  ctx.fillStyle = TEXTE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const pasX = [1, 2, 3, 7, 14, 30, 61].find(p => p * (lz / n) >= 90) ?? 61;
  g.dates.forEach((d, i) => {
    if (i % pasX !== 0) return;
    ctx.fillText(d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), xCentre(i), H - m.b + 14);
  });
  ctx.strokeStyle = TEXTE; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(m.g, yDe(0)); ctx.lineTo(L - m.d, yDe(0)); ctx.stroke();

  // Titre et légende
  ctx.font = `bold 28px ${POLICE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Énergie par jour', m.g, 38);
  legende(ctx, [
    ...(g.barres ? [{ libelle: g.barres.libelle, couleur: g.barres.couleur, forme: 'barre' as const }] : []),
    ...(g.barres && g.exclus.some(Boolean) ? [{ libelle: 'jour exclu des statistiques', couleur: g.barres.couleur, forme: 'hachure' as const }] : []),
    ...g.courbes.map(s => ({ libelle: s.libelle, couleur: s.couleur, forme: 'ligne' as const })),
  ], m.g, 68);

  return c.toDataURL('image/png');
}

/** Moyenne par type de jour : barres avec valeur et nombre de jours. */
export function graphiqueTypesJour(t: GraphiquesRapport['typesJour'], couleur: string): string | null {
  const presents = t.filter(x => x.valeur != null);
  if (presents.length === 0) return null;
  const L = 1200, H = 520;
  const [c, ctx] = toile(L, H);
  const m = { g: 110, d: 30, h: 70, b: 80 };
  const lz = L - m.g - m.d, hz = H - m.h - m.b;
  const { pas, haut } = graduation(Math.max(...presents.map(x => x.valeur!)));
  const yDe = (v: number) => m.h + hz - (v / haut) * hz;

  ctx.font = `22px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= haut + 1e-9; v += pas) {
    ctx.strokeStyle = GRILLE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.g, yDe(v)); ctx.lineTo(L - m.d, yDe(v)); ctx.stroke();
    ctx.fillStyle = TEXTE;
    ctx.fillText(nf(v, pas < 1 ? 1 : 0), m.g - 12, yDe(v));
  }
  const lc = lz / t.length;
  t.forEach((x, i) => {
    const cx = m.g + (i + 0.5) * lc;
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXTE;
    ctx.textBaseline = 'top';
    ctx.fillText(`${x.libelle} (${x.nbJours} j)`, cx, H - m.b + 16);
    if (x.valeur == null) {
      ctx.textBaseline = 'bottom';
      ctx.fillText('aucun jour', cx, yDe(0) - 8);
      return;
    }
    ctx.fillStyle = couleur;
    ctx.fillRect(cx - lc * 0.25, yDe(x.valeur), lc * 0.5, yDe(0) - yDe(x.valeur));
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'bottom';
    ctx.font = `bold 24px ${POLICE}`;
    ctx.fillText(`${nf(x.valeur, 1)} kWh/j`, cx, yDe(x.valeur) - 8);
    ctx.font = `22px ${POLICE}`;
  });
  ctx.font = `bold 28px ${POLICE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Moyenne par type de jour (jours retenus)', m.g, 40);
  return c.toDataURL('image/png');
}

/** Courbes sur des catégories (heures, jours) : une ligne par série, interrompue si pas de valeur. */
export function graphiqueCourbes(titre: string, categories: string[], series: { libelle: string; valeurs: (number | null)[]; couleur: string }[], unite: string): string | null {
  const toutes = series.flatMap(s => s.valeurs).filter((v): v is number => v != null);
  if (categories.length === 0 || toutes.length === 0) return null;
  const L = 1800, H = 700;
  const [c, ctx] = toile(L, H);
  const m = { g: 110, d: 30, h: 90, b: 70 };
  const lz = L - m.g - m.d, hz = H - m.h - m.b;
  const { pas, haut } = graduation(Math.max(0, ...toutes));
  const yDe = (v: number) => m.h + hz - (Math.max(0, v) / haut) * hz;
  const xDe = (i: number) => m.g + (i + 0.5) * (lz / categories.length);
  ctx.font = `22px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= haut + 1e-9; v += pas) {
    ctx.strokeStyle = GRILLE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.g, yDe(v)); ctx.lineTo(L - m.d, yDe(v)); ctx.stroke();
    ctx.fillStyle = TEXTE;
    ctx.fillText(nf(v, pas < 1 ? (pas < 0.1 ? 2 : 1) : 0), m.g - 12, yDe(v));
  }
  ctx.save();
  ctx.translate(30, m.h + hz / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(unite, 0, 0);
  ctx.restore();
  for (const s of series) {
    ctx.strokeStyle = s.couleur;
    ctx.lineWidth = 4;
    ctx.beginPath();
    let enCours = false;
    s.valeurs.forEach((v, i) => {
      if (v == null) { enCours = false; return; }
      if (enCours) ctx.lineTo(xDe(i), yDe(v)); else ctx.moveTo(xDe(i), yDe(v));
      enCours = true;
    });
    ctx.stroke();
  }
  ctx.fillStyle = TEXTE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const pasX = [1, 2, 3, 4, 6, 7, 14, 30].find(p => p * (lz / categories.length) >= 80) ?? 30;
  categories.forEach((k, i) => { if (i % pasX === 0) ctx.fillText(k, xDe(i), H - m.b + 12); });
  ctx.font = `bold 28px ${POLICE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(titre, m.g, 38);
  legende(ctx, series.map(s => ({ libelle: s.libelle, couleur: s.couleur, forme: 'ligne' as const })), m.g, 68);
  return c.toDataURL('image/png');
}

/** Barres horizontales classées, avec valeur et part. */
export function graphiqueRepartition(titre: string, items: { libelle: string; kwh: number; part: number | null }[], couleur: string): string | null {
  const liste = items.filter(x => x.kwh > 0).sort((a, b) => b.kwh - a.kwh).slice(0, 12);
  if (liste.length === 0) return null;
  const L = 1800, hl = 54, H = 90 + liste.length * hl + 20;
  const [c, ctx] = toile(L, H);
  const gauche = 660, droite = 300;
  const max = liste[0].kwh;
  ctx.font = `bold 28px ${POLICE}`;
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(titre, 20, 38);
  ctx.textBaseline = 'middle';
  liste.forEach((x, i) => {
    const y = 90 + i * hl;
    ctx.font = `22px ${POLICE}`;
    ctx.fillStyle = TEXTE;
    ctx.textAlign = 'right';
    const lib = x.libelle.length > 52 ? `${x.libelle.slice(0, 51)}…` : x.libelle;
    ctx.fillText(lib, gauche - 16, y + hl / 2 - 4);
    ctx.fillStyle = couleur;
    ctx.fillRect(gauche, y + 6, ((L - gauche - droite) * x.kwh) / max, hl - 20);
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText(`${nf(x.kwh, 1)} kWh${x.part != null ? ` · ${nf(x.part * 100, 0)} %` : ''}`, gauche + ((L - gauche - droite) * x.kwh) / max + 12, y + hl / 2 - 4);
  });
  return c.toDataURL('image/png');
}

/** Carte de chaleur : heures en abscisse (0 h à gauche) ; dates en ordonnée, la plus ancienne en haut, espacées ; case vide = non mesuré. */
export function graphiqueCarteChaleur(titre: string, carte: { jours: string[]; matrice: (number | null)[][] }, couleur: string, grandeur?: { unite: string }): string | null {
  const valeurs = carte.matrice.flat().filter((v): v is number => v != null);
  if (carte.jours.length === 0 || valeurs.length === 0) return null;
  const L = 1800, H = 760;
  const [c, ctx] = toile(L, H);
  const m = { g: 100, d: 30, h: 60, b: 50 };
  const lc = (L - m.g - m.d) / 24, hc = (H - m.h - m.b) / carte.jours.length;
  const max = Math.max(...valeurs);
  // L'énergie part de 0 ; une température se lit entre son minimum et son maximum
  const min = grandeur ? Math.min(...valeurs) : 0;
  const r = parseInt(couleur.slice(1, 3), 16), g = parseInt(couleur.slice(3, 5), 16), b = parseInt(couleur.slice(5, 7), 16);
  const pasY = [1, 2, 3, 7, 14, 30].find(p => p * hc >= 24) ?? 30;
  carte.jours.forEach((j, i) => {
    const y = m.h + i * hc;
    for (let h = 0; h < 24; h++) {
      const v = carte.matrice[h][i];
      if (v == null) continue;
      const part = max > min ? (v - min) / (max - min) : 0;
      ctx.fillStyle = `rgb(${Math.round(255 + (r - 255) * part)},${Math.round(255 + (g - 255) * part)},${Math.round(255 + (b - 255) * part)})`;
      ctx.fillRect(m.g + h * lc, y, Math.ceil(lc), Math.ceil(hc));
    }
    if (i % pasY === 0) {
      ctx.font = `20px ${POLICE}`;
      ctx.fillStyle = TEXTE;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${j.slice(8, 10)}/${j.slice(5, 7)}`, m.g - 10, y + hc / 2);
    }
  });
  ctx.strokeStyle = GRILLE;
  ctx.strokeRect(m.g, m.h, L - m.g - m.d, H - m.h - m.b);
  ctx.font = `20px ${POLICE}`;
  ctx.fillStyle = TEXTE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let h = 0; h < 24; h++) ctx.fillText(`${h} h`, m.g + (h + 0.5) * lc, H - m.b + 10);
  ctx.font = `bold 28px ${POLICE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(grandeur ? `${titre} : ${nf(min, 1)} à ${nf(max, 1)} ${grandeur.unite}` : `${titre} (0 à ${nf(max, 2)} kWh par heure)`, m.g, 38);
  return c.toDataURL('image/png');
}
