// ============================================================
// Écriture des valeurs et de leurs unités — source unique
//
// Demande du manager (18/09) : choisir l'unité d'affichage, et passer
// automatiquement aux multiples au-delà du millier.
//
// Deux choses à ne pas confondre, et c'est tout le sujet :
//   · le PRÉFIXE (Wh → kWh → MWh) est de la présentation : même grandeur,
//     conversion exacte, jamais fausse ;
//   · la FAMILLE (W → VA → A) désigne des grandeurs physiques différentes.
//     Passer de W à VA demande le cos φ, de W à A demande en plus la
//     tension. On mesure, on ne dimensionne pas : ces conversions ne sont
//     pas proposées. Si l'utilisateur veut des VA, la mesure doit exister
//     dans le fichier (voir lib/sensor-comparison.ts).
//
// Avant ce module, les graphiques mettaient à l'échelle au-delà de 1 000
// et les cartes d'indicateurs non : le même relevé s'écrivait
// « 3 899,1 Wh » dans une carte et « 3,90 kWh » dans un graphique.
// ============================================================

import { useSyncExternalStore } from 'react';

export type UnitDisplayMode = 'auto' | 'raw' | 'forced';
export type UnitPrefix = '' | 'k' | 'M';

export interface UnitSettings {
  mode: UnitDisplayMode;
  /** Préfixe imposé en mode « forced ». */
  prefix: UnitPrefix;
}

const DEFAULTS: UnitSettings = { mode: 'auto', prefix: '' };
const STORAGE_KEY = 'sime-unit-display-v1';

/**
 * Unités qui acceptent un préfixe SI. Tout le reste est laissé tel quel :
 * « 1,2 kppm » pour du CO₂ ou « k°C » pour une température n'ont aucun sens,
 * et le CO₂ dépasse régulièrement 1 000 ppm.
 */
const PREFIXABLE = new Set([
  'W', 'Wh', 'VA', 'VAh', 'var', 'varh',
  'A', 'V', 'Hz', 'J', 'Wc', 'lm', 'Pa', 'g', 'm³', 'L',
]);

/** Préfixes déjà portés par l'unité (kWh, MVA…), à retirer avant de recalculer. */
const PREFIX_FACTOR: Record<string, number> = { k: 1e3, M: 1e6, G: 1e9 };

export interface BaseUnit {
  /** Unité sans préfixe (kWh → Wh). */
  base: string;
  /** Facteur de l'unité fournie vers l'unité de base (kWh → 1000). */
  factor: number;
  /** Faux pour °C, %, ppm, dB… : aucun préfixe ne sera appliqué. */
  prefixable: boolean;
}

/** Décompose une unité en base + facteur (« kWh » → Wh ×1000). */
export function splitUnit(unit: string): BaseUnit {
  const u = (unit ?? '').trim();
  if (!u) return { base: '', factor: 1, prefixable: false };
  if (PREFIXABLE.has(u)) return { base: u, factor: 1, prefixable: true };

  const head = u[0];
  const rest = u.slice(1);
  // « var » et « varh » commencent par un v minuscule : ne pas y voir un préfixe.
  if (PREFIX_FACTOR[head] && PREFIXABLE.has(rest)) {
    return { base: rest, factor: PREFIX_FACTOR[head], prefixable: true };
  }
  return { base: u, factor: 1, prefixable: false };
}

/** Préfixes proposés à l'utilisateur pour une unité donnée. */
export function availablePrefixes(unit: string): { value: UnitPrefix; label: string }[] {
  const { base, prefixable } = splitUnit(unit);
  if (!prefixable) return [];
  return [
    { value: '', label: base },
    { value: 'k', label: `k${base}` },
    { value: 'M', label: `M${base}` },
  ];
}

// ---- Réglage persistant ----

function load(): UnitSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<UnitSettings>;
    return {
      mode: p.mode === 'raw' || p.mode === 'forced' ? p.mode : 'auto',
      prefix: p.prefix === 'k' || p.prefix === 'M' ? p.prefix : '',
    };
  } catch {
    return DEFAULTS;
  }
}

let state: UnitSettings = load();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l());
}

export function getUnitSettings(): UnitSettings { return state; }
export function setUnitMode(mode: UnitDisplayMode) { state = { ...state, mode }; persist(); }
export function setUnitPrefix(prefix: UnitPrefix) { state = { ...state, mode: 'forced', prefix }; persist(); }

export function useUnitSettings(): UnitSettings {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getUnitSettings,
    getUnitSettings,
  );
}

// ---- Formatage ----

/**
 * Arrondi à un nombre de chiffres SIGNIFICATIFS, pas de décimales : 207,97
 * doit rester 208,0 et non 208, et 0,0043 ne doit pas devenir 0,00.
 * Un talon de quelques watts et une pointe de plusieurs kilowatts se lisent
 * avec la même règle.
 */
function significant(v: number, digits = 5): string {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(v)));
  // Plafond à 4 décimales : au-delà on afficherait du bruit de mesure, en deçà
  // on perdrait un talon exprimé en kWh (0,0043 kWh ≠ 0).
  const decimals = Math.min(4, Math.max(0, digits - 1 - mag));
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export interface FormatOptions {
  /** Écrire la valeur sans son unité (colonne de tableau qui porte déjà l'unité en en-tête). */
  omitUnit?: boolean;
  /** Chiffres significatifs (5 par défaut). */
  digits?: number;
}

/**
 * Écrit une valeur avec son unité, selon le réglage d'affichage.
 * La valeur reçue est toujours exprimée dans `unit` telle que fournie par
 * le capteur ; c'est ici, et seulement ici, qu'on décide de l'écriture.
 */
export function formatQuantity(
  value: number | null | undefined,
  unit: string,
  settings: UnitSettings = state,
  opts: FormatOptions = {},
): string {
  if (value == null || typeof value !== 'number' || !isFinite(value)) return '—';
  const { base, factor, prefixable } = splitUnit(unit);
  const suffix = (u: string) => (opts.omitUnit || !u ? '' : ` ${u}`);

  if (!prefixable || settings.mode === 'raw') {
    return significant(value, opts.digits) + suffix(unit);
  }

  // Valeur ramenée à l'unité de base, puis réécrite dans le préfixe voulu.
  const inBase = value * factor;

  if (settings.mode === 'forced') {
    const div = settings.prefix === 'M' ? 1e6 : settings.prefix === 'k' ? 1e3 : 1;
    return significant(inBase / div, opts.digits) + suffix(`${settings.prefix}${base}`);
  }

  // Auto : on ne change d'échelle qu'au-delà du millier, jamais en dessous —
  // écrire « 0,5 kWh » pour 500 Wh dessert la lecture.
  const abs = Math.abs(inBase);
  if (abs >= 1e6) return significant(inBase / 1e6, opts.digits) + suffix(`M${base}`);
  if (abs >= 1e3) return significant(inBase / 1e3, opts.digits) + suffix(`k${base}`);
  return significant(inBase, opts.digits) + suffix(base);
}

/** Unité telle qu'elle sera écrite, sans valeur (en-tête de colonne, axe). */
export function displayUnit(unit: string, sample: number | null | undefined, settings: UnitSettings = state): string {
  if (unit == null) return '';
  const { base, factor, prefixable } = splitUnit(unit);
  if (!prefixable || settings.mode === 'raw') return unit;
  if (settings.mode === 'forced') return `${settings.prefix}${base}`;
  const abs = Math.abs((sample ?? 0) * factor);
  if (abs >= 1e6) return `M${base}`;
  if (abs >= 1e3) return `k${base}`;
  return base;
}
