/**
 * Indicateurs adaptés à la NATURE de chaque grandeur d'un relevé (module Mesures).
 *
 * Avant (19/10) : les mêmes cartes pour tout — « Moyenne (hors zéros) »,
 * « Cumul total » sur une température — et rien pour les grandeurs
 * secondaires (humidité, point de rosée…). Ici, chaque grandeur reçoit les
 * indicateurs qu'un ingénieur attend pour sa nature :
 *   énergie     total, moyenne/jour, jour le plus fort, pointe d'intervalle
 *   puissance   pointe, moyenne, talon (nuit), facteur de charge, énergie
 *   son         Leq (moyenne ÉNERGÉTIQUE), L10 / L50 / L90, Lmax, temps > seuil
 *   température / humidité / CO₂ : moyenne, min, max (avec le moment),
 *               amplitude journalière, temps au-dessus du seuil
 *   autres      moyenne, min, max, médiane
 * Les durées sont pondérées par le pas réel entre deux relevés (un trou de
 * collecte ne compte pas comme du temps au-dessus du seuil).
 */

import { unitFromHeader, unitFromName, type QuantityKind } from '@/lib/custom-sensor-service';
import { integrateEnergy, toDate } from './measurementStats';

export type NatureGrandeur =
  | 'energie' | 'puissance' | 'son' | 'temperature' | 'humidite' | 'co2'
  | 'tension' | 'courant' | 'frequence' | 'cosphi' | 'autre';

export interface Indicateur {
  label: string;
  valeur: string;
  /** Moment ou précision (« 05 sept., 17:20 », « 12 % du temps »). */
  detail?: string;
  /** Mise en avant : dépassement d'un seuil. */
  alerte?: boolean;
  aide?: string;
}

export interface FicheGrandeur {
  cle: string;
  libelle: string;
  unite: string;
  nature: NatureGrandeur;
  /** Seuil utilisé (réglable) pour « temps au-dessus », s'il y en a un. */
  seuil: number | null;
  indicateurs: Indicateur[];
}

export interface SyntheseReleve {
  debut: Date | null;
  fin: Date | null;
  dureeHeures: number;
  pasSecondes: number | null;
  /** Mesures présentes / attendues au pas médian. */
  couverture: number | null;
  nbMesures: number;
}

// ── Nature ───────────────────────────────────────────────────

export function natureDe(libelle: string, unite: string, kind?: QuantityKind): NatureGrandeur {
  const u = unite.trim().toLowerCase();
  const l = libelle.toLowerCase();
  if (/^(m|k)?wh$|^(k)?varh$|^(k)?vah$/.test(u) || kind === 'energy') return 'energie';
  if (/^(m|k)?w$|^(k)?va$|^(k)?var$/.test(u) || kind === 'power') return 'puissance';
  if (/^db/.test(u) || /sonor|sound|bruit|noise|leq/.test(l)) return 'son';
  if (/°c|℃|°f|celsius/.test(u) || /temp|ros[ée]e|dew|ressenti/.test(l)) return 'temperature';
  if (/%rh|^rh$/.test(u) || /humid/.test(l)) return 'humidite';
  if (/ppm/.test(u) && /co2|co₂/.test(l)) return 'co2';
  if (/hz/.test(u) || /fr[ée]quence|freq/.test(l)) return 'frequence';
  if (/cos ?φ|cos ?phi|\bpf\b|facteur de puissance/.test(l)) return 'cosphi';
  if (u === 'v' || /tension|voltage|\bu\d|\bv\d/.test(l)) return 'tension';
  if (u === 'a' || /courant|current|intensit/.test(l)) return 'courant';
  return 'autre';
}

/** Seuil par défaut de « temps au-dessus » ; modifiable à l'écran. */
export function seuilParDefaut(nature: NatureGrandeur): number | null {
  switch (nature) {
    case 'temperature': return 26;   // confort d'été (bureaux climatisés)
    case 'humidite': return 70;      // au-delà : condensation, moisissures
    case 'son': return 80;           // dB(A) : seuil d'action d'exposition au bruit (8 h)
    case 'co2': return 1000;         // ppm : air intérieur à renouveler
    default: return null;
  }
}

export function uniteDe(cle: string, libelle: string): string {
  return unitFromHeader(cle) || unitFromHeader(libelle) || unitFromName(libelle) || unitFromName(cle);
}

// ── Outils ───────────────────────────────────────────────────

interface Pt { t: number; v: number }

// Horodatages lus une fois par relevé (et non une fois par grandeur)
const cacheTs = new WeakMap<object, number[]>();
function horodatages(mesures: Record<string, unknown>[]): number[] {
  let ts = cacheTs.get(mesures);
  if (!ts) { ts = mesures.map(m => toDate(String(m.timestamp)).getTime()); cacheTs.set(mesures, ts); }
  return ts;
}

function points(mesures: Record<string, unknown>[], cle: string): Pt[] {
  const ts = horodatages(mesures);
  const out: Pt[] = [];
  for (let i = 0; i < mesures.length; i++) {
    const v = mesures[i][cle];
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isFinite(ts[i])) continue;
    out.push({ t: ts[i], v });
  }
  return out.sort((a, b) => a.t - b.t);
}

function pasMedian(pts: Pt[]): number | null {
  const d: number[] = [];
  for (let i = 1; i < pts.length; i++) { const x = pts[i].t - pts[i - 1].t; if (x > 0) d.push(x); }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)] / 1000;
}

function quantile(trie: number[], q: number): number {
  if (trie.length === 1) return trie[0];
  const h = (trie.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return trie[lo] + (h - lo) * (trie[hi] - trie[lo]);
}

/** Durée (h) pendant laquelle la valeur dépasse le seuil ; chaque relevé vaut le pas qui le suit (plafonné à 2 pas). */
function heuresAuDessus(pts: Pt[], seuil: number, pasS: number | null): { heures: number; part: number } {
  if (!pts.length || !pasS) return { heures: 0, part: 0 };
  const plafond = pasS * 2 * 1000;
  let au = 0, total = 0;
  for (let i = 0; i < pts.length; i++) {
    const dt = i + 1 < pts.length ? Math.min(pts[i + 1].t - pts[i].t, plafond) : pasS * 1000;
    total += dt;
    if (pts[i].v > seuil) au += dt;
  }
  return { heures: au / 3_600_000, part: total ? au / total : 0 };
}

const jour = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const quand = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const leJour = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
const nb = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const avecU = (v: number, u: string, d = 1) => `${nb(v, d)}${u ? ` ${u}` : ''}`;
/** Wh → kWh → MWh (et W → kW → MW) dès que le nombre devient illisible. */
function avecUEchelle(v: number, u: string, d = 2): string {
  const m = u.match(/^(k|M)?(Wh|W|VAh|VA|varh|var)$/);
  if (!m) return avecU(v, u, d);
  const pref = ['', 'k', 'M'];
  let i = pref.indexOf(m[1] ?? '');
  let x = v;
  while (Math.abs(x) >= 10_000 && i < 2) { x /= 1000; i++; }
  return avecU(x, `${pref[i]}${m[2]}`, d);
}
const duree = (h: number) => h >= 48 ? `${nb(h / 24, 1)} j` : h >= 1 ? `${nb(h, 1)} h` : `${Math.round(h * 60)} min`;

function extremes(pts: Pt[]) {
  let hi = pts[0], lo = pts[0];
  for (const p of pts) { if (p.v > hi.v) hi = p; if (p.v < lo.v) lo = p; }
  return { hi, lo };
}

function moyenne(pts: Pt[]) { return pts.reduce((s, p) => s + p.v, 0) / pts.length; }

/** Amplitude journalière moyenne (max − min de chaque jour), jours d'au moins 6 relevés. */
function amplitudeJour(pts: Pt[]): number | null {
  const parJour = new Map<string, number[]>();
  for (const p of pts) { const k = jour(p.t); const a = parJour.get(k) ?? []; a.push(p.v); parJour.set(k, a); }
  const amps = [...parJour.values()].filter(v => v.length >= 6).map(v => Math.max(...v) - Math.min(...v));
  return amps.length ? amps.reduce((s, a) => s + a, 0) / amps.length : null;
}

// ── Synthèse du relevé ───────────────────────────────────────

export function syntheseReleve(mesures: Record<string, unknown>[]): SyntheseReleve {
  const ts = horodatages(mesures).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ts.length) return { debut: null, fin: null, dureeHeures: 0, pasSecondes: null, couverture: null, nbMesures: 0 };
  const pas = pasMedian(ts.map(t => ({ t, v: 0 })));
  const dureeMs = ts[ts.length - 1] - ts[0];
  const attendues = pas ? dureeMs / (pas * 1000) + 1 : null;
  return {
    debut: new Date(ts[0]), fin: new Date(ts[ts.length - 1]),
    dureeHeures: dureeMs / 3_600_000,
    pasSecondes: pas,
    couverture: attendues ? Math.min(1, new Set(ts).size / attendues) : null,
    nbMesures: ts.length,
  };
}

// ── Fiche d'une grandeur ─────────────────────────────────────

export function ficheGrandeur(
  mesures: Record<string, unknown>[],
  cle: string,
  libelle: string,
  unite: string,
  opts: { kind?: QuantityKind; seuil?: number | null } = {},
): FicheGrandeur | null {
  const pts = points(mesures, cle);
  if (!pts.length) return null;
  const nature = natureDe(libelle, unite, opts.kind);
  // Point de rosée : une température, mais un « temps au-dessus de 26 °C » n'a pas de sens
  const sansSeuil = /ros[ée]e|dew/i.test(libelle);
  const seuil = opts.seuil !== undefined ? opts.seuil : sansSeuil ? null : seuilParDefaut(nature);
  const pas = pasMedian(pts);
  const { hi, lo } = extremes(pts);
  const moy = moyenne(pts);
  const ind: Indicateur[] = [];
  const u = unite;

  const tempsAuDessus = () => {
    if (seuil === null || !pas) return;
    const { heures, part } = heuresAuDessus(pts, seuil, pas);
    ind.push({
      label: `Temps > ${nb(seuil, 0)} ${u}`.trim(), valeur: duree(heures), detail: `${nb(part * 100, 0)} % du temps`,
      alerte: part > 0.05, aide: 'Durée pendant laquelle la valeur dépasse le seuil (réglable), pondérée par le pas réel entre deux relevés.',
    });
  };

  switch (nature) {
    case 'energie': {
      // Énergie par intervalle : somme ; par jour pour repérer le jour le plus fort
      const total = pts.reduce((s, p) => s + p.v, 0);
      const parJour = new Map<string, { t: number; v: number }>();
      for (const p of pts) { const k = jour(p.t); const a = parJour.get(k) ?? { t: p.t, v: 0 }; a.v += p.v; parJour.set(k, a); }
      const jours = [...parJour.values()];
      const jMax = jours.reduce((a, b) => (b.v > a.v ? b : a), jours[0]);
      ind.push({ label: 'Total', valeur: avecUEchelle(total, u, 2) });
      if (jours.length > 1) {
        ind.push({ label: 'Moyenne par jour', valeur: avecUEchelle(total / jours.length, u, 2), detail: `${jours.length} jours` });
        ind.push({ label: 'Jour le plus fort', valeur: avecUEchelle(jMax.v, u, 2), detail: leJour(jMax.t) });
      }
      ind.push({ label: "Pointe d'intervalle", valeur: avecUEchelle(hi.v, u, 2), detail: quand(hi.t) });
      break;
    }
    case 'puissance': {
      const energie = integrateEnergy(pts);
      // Talon : médiane des minima de nuit (00 h–05 h), comme le modèle « Talon »
      const nuits = new Map<string, number>();
      for (const p of pts) { const h = new Date(p.t).getHours(); if (h >= 0 && h < 5) { const k = jour(p.t); nuits.set(k, Math.min(nuits.get(k) ?? Infinity, p.v)); } }
      const minima = [...nuits.values()].sort((a, b) => a - b);
      ind.push({ label: 'Pointe', valeur: avecUEchelle(hi.v, u, 2), detail: quand(hi.t) });
      ind.push({ label: 'Puissance moyenne', valeur: avecUEchelle(moy, u, 2) });
      if (minima.length && pas && pas <= 3600) ind.push({ label: 'Talon (nuit)', valeur: avecUEchelle(quantile(minima, 0.5), u, 2), aide: 'Charge permanente : médiane des minima de 00 h à 05 h.' });
      if (hi.v > 0) ind.push({ label: 'Facteur de charge', valeur: `${nb((moy / hi.v) * 100, 0)} %`, aide: 'Puissance moyenne / pointe : proche de 100 % = usage constant.' });
      ind.push({ label: 'Énergie', valeur: avecUEchelle(energie, u ? `${u}h` : '', 2), aide: 'Intégrale de la puissance dans le temps (trapèzes).' });
      break;
    }
    case 'son': {
      // Leq = moyenne énergétique : 10·log10(moyenne de 10^(L/10)) — jamais la moyenne arithmétique des dB
      const leq = 10 * Math.log10(pts.reduce((s, p) => s + 10 ** (p.v / 10), 0) / pts.length);
      const trie = pts.map(p => p.v).sort((a, b) => a - b);
      ind.push({ label: 'Leq', valeur: avecU(leq, u), aide: 'Niveau équivalent : moyenne énergétique des niveaux (et non moyenne des dB).' });
      ind.push({ label: 'L10', valeur: avecU(quantile(trie, 0.9), u), aide: 'Niveau dépassé 10 % du temps (bruits de pointe).' });
      ind.push({ label: 'L50', valeur: avecU(quantile(trie, 0.5), u) });
      ind.push({ label: 'L90', valeur: avecU(quantile(trie, 0.1), u), aide: 'Niveau dépassé 90 % du temps (bruit de fond).' });
      ind.push({ label: 'Lmax', valeur: avecU(hi.v, u), detail: quand(hi.t) });
      tempsAuDessus();
      break;
    }
    case 'temperature':
    case 'humidite':
    case 'co2': {
      ind.push({ label: 'Moyenne', valeur: avecU(moy, u) });
      ind.push({ label: 'Maximum', valeur: avecU(hi.v, u), detail: quand(hi.t) });
      ind.push({ label: 'Minimum', valeur: avecU(lo.v, u), detail: quand(lo.t) });
      const amp = amplitudeJour(pts);
      if (amp !== null) ind.push({ label: 'Amplitude journalière', valeur: avecU(amp, u), aide: 'Écart moyen entre le maximum et le minimum de chaque jour.' });
      tempsAuDessus();
      break;
    }
    default: {
      const trie = pts.map(p => p.v).sort((a, b) => a - b);
      ind.push({ label: 'Moyenne', valeur: avecU(moy, u, 2) });
      ind.push({ label: 'Maximum', valeur: avecU(hi.v, u, 2), detail: quand(hi.t) });
      ind.push({ label: 'Minimum', valeur: avecU(lo.v, u, 2), detail: quand(lo.t) });
      ind.push({ label: 'Médiane', valeur: avecU(quantile(trie, 0.5), u, 2) });
      if (nature === 'cosphi' && moy < 0.8) ind[0].alerte = true;
      if (nature === 'frequence' && (moy < 49.5 || moy > 50.5)) ind[0].alerte = true;
    }
  }
  return { cle, libelle, unite, nature, seuil, indicateurs: ind };
}
