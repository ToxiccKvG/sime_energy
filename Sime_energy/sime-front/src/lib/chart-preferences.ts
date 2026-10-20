// ============================================================
// Préférences de graphiques — communes aux modules IOT et Mesures
//
// Demande du manager (réunions du 18/09) : « pas seulement la carte de
// chaleur, mais pour tous types de graphiques choisir les couleurs,
// pouvoir éditer le titre, et ne pas oublier les légendes — que ce soit
// dans IOT ou dans Mesures ». D'où un réglage unique partagé par les
// deux modules plutôt qu'un bricolage par écran.
//
// Stocké en localStorage : ce sont des préférences d'affichage propres à
// la personne et au poste (quelques octets), pas des données. Chaque
// lecture et écriture est protégée — navigation privée, stockage bloqué.
// ============================================================

import { useSyncExternalStore } from 'react';

export type PaletteId = 'defaut' | 'chaud' | 'froid' | 'contraste' | 'accessible' | 'sobre';

export interface Palette {
  id: PaletteId;
  label: string;
  /** Description courte : aide au choix, affichée sous le sélecteur. */
  hint: string;
  /** Couleurs de séries, dans l'ordre d'attribution. */
  colors: string[];
  /**
   * Dégradé des cartes de chaleur, du plus faible au plus fort. Convention
   * tenue par toutes les palettes : la valeur faible est sombre et peu
   * saturée, la valeur forte est vive — l'interface étant sombre, c'est la
   * valeur forte qui doit ressortir.
   */
  heat: [string, string, string];
}

export const PALETTES: Palette[] = [
  {
    id: 'defaut',
    label: 'Par défaut',
    hint: 'Bleu, vert, orange — lisible sur fond sombre comme sur fond clair.',
    colors: ['#3b82f6', '#22c55e', '#f59e0b', '#a78bfa', '#ec4899', '#06b6d4', '#eab308', '#f97316'],
    heat: ['#172554', '#2563eb', '#93c5fd'],
  },
  {
    id: 'chaud',
    label: 'Chaud (rouge)',
    hint: 'Pour les températures et tout ce qui se lit « plus c\'est fort, plus c\'est rouge ».',
    colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#dc2626', '#fb923c', '#fbbf24', '#b91c1c'],
    heat: ['#450a0a', '#dc2626', '#fca5a5'],
  },
  {
    id: 'froid',
    label: 'Froid (bleu)',
    hint: 'Pour comparer un second relevé sans le confondre avec le premier.',
    colors: ['#0ea5e9', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#14b8a6', '#0284c7', '#4f46e5'],
    heat: ['#082f49', '#0ea5e9', '#a5f3fc'],
  },
  {
    id: 'contraste',
    label: 'Contrasté',
    hint: 'Séries très différenciées — pour un graphique qui en superpose beaucoup.',
    colors: ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#db2777', '#65a30d'],
    heat: ['#1e1b4b', '#7c3aed', '#fde047'],
  },
  {
    id: 'accessible',
    label: 'Daltonisme',
    hint: 'Palette Okabe-Ito : distinguable par les personnes daltoniennes.',
    colors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000'],
    heat: ['#002b40', '#0072B2', '#F0E442'],
  },
  {
    id: 'sobre',
    label: 'Sobre (impression)',
    hint: 'Gris et bleus peu saturés — pour un rapport imprimé en noir et blanc.',
    colors: ['#334155', '#64748b', '#94a3b8', '#1e40af', '#3b82f6', '#0f172a', '#475569', '#cbd5e1'],
    heat: ['#0f172a', '#64748b', '#e2e8f0'],
  },
];

export interface ChartPreferences {
  palette: PaletteId;
  /** Légendes visibles sous les graphiques. */
  showLegend: boolean;
  /** Titres personnalisés, par identifiant de graphique (`module:vue`). */
  titles: Record<string, string>;
  /**
   * Couleur choisie pour une donnée précise (clé de la grandeur ou nom de la
   * série), prioritaire sur la palette. Demande du 20/10 : « laisser la
   * personne choisir la couleur qu'elle veut sur la donnée choisie ».
   */
  seriesColors: Record<string, string>;
  /** Dégradé des cartes de chaleur (voir ECHELLES_CHALEUR). */
  echelleChaleur: EchelleChaleurId;
}

/**
 * Dégradés des cartes de chaleur, du plus faible au plus fort.
 *  · « donnee »  : part de la couleur de la donnée affichée (sombre → couleur → clair) ;
 *  · « palette » : dégradé de la palette générale (comportement d'avant le 20/10) ;
 *  · viridis / inferno : fort contraste, lisibles en noir et blanc et par les daltoniens ;
 *  · divergent : bleu → clair → rouge, pour lire l'écart autour du milieu.
 */
export type EchelleChaleurId = 'donnee' | 'palette' | 'viridis' | 'inferno' | 'divergent';

export const ECHELLES_CHALEUR: { id: EchelleChaleurId; label: string; hint: string; stops?: string[] }[] = [
  { id: 'donnee', label: 'Couleur de la donnée', hint: 'Dégradé de la couleur choisie pour la grandeur affichée.' },
  { id: 'palette', label: 'Palette générale', hint: 'Dégradé de la palette choisie ci-dessus.' },
  { id: 'viridis', label: 'Viridis (contraste)', hint: 'Violet → vert → jaune : lisible imprimé en gris et par les daltoniens.',
    stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'inferno', label: 'Inferno (contraste)', hint: 'Noir → rouge → jaune : très fort contraste.',
    stops: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4'] },
  { id: 'divergent', label: 'Divergent bleu-rouge', hint: 'Bleu sous la moyenne, rouge au-dessus.',
    stops: ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'] },
];

const DEFAULTS: ChartPreferences = { palette: 'defaut', showLegend: true, titles: {}, seriesColors: {}, echelleChaleur: 'donnee' };
const STORAGE_KEY = 'sime-chart-prefs-v1';

function load(): ChartPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ChartPreferences>;
    return {
      palette: PALETTES.some(p => p.id === parsed.palette) ? parsed.palette! : DEFAULTS.palette,
      showLegend: typeof parsed.showLegend === 'boolean' ? parsed.showLegend : DEFAULTS.showLegend,
      titles: parsed.titles && typeof parsed.titles === 'object' ? parsed.titles : {},
      seriesColors: parsed.seriesColors && typeof parsed.seriesColors === 'object' ? parsed.seriesColors : {},
      echelleChaleur: ECHELLES_CHALEUR.some(e => e.id === parsed.echelleChaleur) ? parsed.echelleChaleur! : DEFAULTS.echelleChaleur,
    };
  } catch {
    return DEFAULTS;
  }
}

let state: ChartPreferences = load();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l());
}

export function getChartPreferences(): ChartPreferences { return state; }

export function setPalette(palette: PaletteId) { state = { ...state, palette }; persist(); }
export function setShowLegend(showLegend: boolean) { state = { ...state, showLegend }; persist(); }

/** Titre personnalisé d'un graphique ; chaîne vide = revenir au titre automatique. */
export function setChartTitle(chartId: string, title: string) {
  const titles = { ...state.titles };
  if (title.trim()) titles[chartId] = title.trim(); else delete titles[chartId];
  state = { ...state, titles };
  persist();
}

/** Couleur d'une donnée ; chaîne vide = revenir à la couleur de la palette. */
export function setSeriesColor(key: string, color: string) {
  const seriesColors = { ...state.seriesColors };
  if (/^#[0-9a-f]{6}$/i.test(color)) seriesColors[key] = color; else delete seriesColors[key];
  state = { ...state, seriesColors };
  persist();
}

export function setEchelleChaleur(echelleChaleur: EchelleChaleurId) { state = { ...state, echelleChaleur }; persist(); }

export function resetChartPreferences() { state = DEFAULTS; persist(); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useChartPreferences(): ChartPreferences {
  return useSyncExternalStore(subscribe, getChartPreferences, getChartPreferences);
}

/** Palette active, jamais undefined. */
export function usePalette(): Palette {
  const { palette } = useChartPreferences();
  return PALETTES.find(p => p.id === palette) ?? PALETTES[0];
}

/**
 * Couleur d'une série d'après son rang. Les couleurs tournent au-delà de
 * la longueur de la palette : deux séries éloignées peuvent partager une
 * teinte, ce qui reste préférable à une couleur illisible inventée.
 */
export function seriesColor(palette: Palette, index: number): string {
  return palette.colors[index % palette.colors.length];
}

/**
 * Couleur d'une donnée : celle choisie par la personne, sinon `defaut`
 * (couleur de la palette). Toujours au format #rrggbb, ce qui permet aux
 * graphiques d'y accoler une opacité (`${couleur}25`).
 */
export function couleurDonnee(prefs: ChartPreferences, key: string, defaut: string): string {
  return prefs.seriesColors[key] ?? defaut;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/**
 * Couleur d'une carte de chaleur pour une intensité `t` entre 0 et 1,
 * interpolée sur les trois teintes de la palette (faible → moyen → fort).
 */
export function heatColor(palette: Palette, t: number): string {
  const x = Math.min(1, Math.max(0, isFinite(t) ? t : 0));
  const [lo, mid, hi] = palette.heat;
  const [from, to, local] = x < 0.5 ? [lo, mid, x * 2] : [mid, hi, (x - 0.5) * 2];
  const a = hexToRgb(from), b = hexToRgb(to);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * local));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Teintes du dégradé d'une carte de chaleur, du plus faible au plus fort. */
export function stopsChaleur(prefs: ChartPreferences, palette: Palette, couleur: string): string[] {
  const e = ECHELLES_CHALEUR.find(x => x.id === prefs.echelleChaleur);
  if (e?.stops) return e.stops;
  if (prefs.echelleChaleur === 'palette') return [...palette.heat];
  // Couleur de la donnée : faible = presque noir teinté, fort = couleur éclaircie.
  return [mixHex(couleur, '#0b1020', 0.85), couleur, mixHex(couleur, '#ffffff', 0.6)];
}

/** Couleur pour une intensité `t` entre 0 et 1, interpolée sur `stops`. */
export function couleurSurEchelle(stops: string[], t: number): string {
  const x = Math.min(1, Math.max(0, isFinite(t) ? t : 0));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(x * n));
  return mixHex(stops[i], stops[i + 1], x * n - i);
}

/** Titre affiché : celui saisi par l'utilisateur, sinon celui calculé. */
export function chartTitle(prefs: ChartPreferences, chartId: string, fallback: string): string {
  return prefs.titles[chartId]?.trim() || fallback;
}
