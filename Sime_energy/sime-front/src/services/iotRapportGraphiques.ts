/**
 * Graphiques du rapport de la Courbe de charge, dessinés en PNG (fond blanc)
 * pour le PDF et l'Excel.
 *
 * Ne trace que les séries du modèle (services/iotRapport.ts) : la série
 * principale en barres, les flux mesurés à part en courbes séparées —
 * jamais empilés, jamais additionnés.
 */

import type { GraphiquesRapport } from './iotRapport';

const BLEU = '#1e3a8a';
const COULEURS_COURBES = ['#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
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
      ctx.fillStyle = BLEU;
      ctx.globalAlpha = g.exclus[i] ? 0.35 : 1;
      ctx.fillRect(xCentre(i) - lb / 2, yDe(Math.max(0, v)), lb, yDe(0) - yDe(Math.max(0, v)));
      ctx.globalAlpha = 1;
    });
  }

  // Courbes : une par flux, interrompue les jours sans valeur
  g.courbes.forEach((s, k) => {
    ctx.strokeStyle = COULEURS_COURBES[k % COULEURS_COURBES.length];
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
    ...(g.barres ? [{ libelle: g.barres.libelle, couleur: BLEU, forme: 'barre' as const }] : []),
    ...(g.barres && g.exclus.some(Boolean) ? [{ libelle: 'jour exclu des statistiques', couleur: BLEU, forme: 'hachure' as const }] : []),
    ...g.courbes.map((s, k) => ({ libelle: s.libelle, couleur: COULEURS_COURBES[k % COULEURS_COURBES.length], forme: 'ligne' as const })),
  ], m.g, 68);

  return c.toDataURL('image/png');
}

/** Moyenne par type de jour : barres avec valeur et nombre de jours. */
export function graphiqueTypesJour(t: GraphiquesRapport['typesJour']): string | null {
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
    ctx.fillStyle = BLEU;
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
