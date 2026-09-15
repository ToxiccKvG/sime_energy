/**
 * Comparaison côte à côte de deux relevés du module Campagne de mesure
 * (ex. un analyseur C.A 8335 et un compteur Shelly posés sur le même départ,
 * ou deux campagnes du même appareil).
 *
 * Principe : les deux séries sont ramenées sur une échelle de temps commune
 * (le pas le plus grossier des deux, arrondi à un pas standard), restreintes à
 * la période où elles se recouvrent, puis comparées point par point (écart
 * B − A) et indicateur par indicateur (moyenne, max, cumul… face à face).
 *
 * Règles d'alignement des grandeurs :
 *  - deux puissances de la même famille électrique (W / kW / VA…) → moyenne par
 *    pas, comparée en unité de base (W, VA ou var) ;
 *  - deux énergies de la même famille (Wh / kWh…) → somme par pas, en Wh/VAh/varh ;
 *  - une puissance contre une énergie → la puissance est intégrée dans le temps,
 *    les deux sont comparées en énergie par pas ;
 *  - toute autre grandeur (ppm, °C, %, Hz, V, A…) → moyenne par pas, les unités
 *    doivent être identiques (sinon la comparaison est signalée comme douteuse).
 */

import { toDate, type QuantityKind } from '@/services/measurementStats';
import { energyUnitFor, powerUnitFor, unitInfo } from '@/lib/sensor-comparison';

export interface SeriesSpec {
  /** Libellé affiché (nom du fichier / capteur). */
  label: string;
  /** Clé de la colonne comparée ('consumption' = grandeur principale). */
  metricKey: string;
  /** Libellé de la colonne comparée. */
  metricLabel: string;
  /** Unité déclarée de la colonne. */
  unit: string;
  /** Nature de la grandeur (détermine moyenne / somme / intégration). */
  quantityKind: QuantityKind;
  measurements: Record<string, unknown>[];
}

export type StepKey = '5m' | '10m' | '15m' | '30m' | '1h' | '1d';

export const STEPS: { key: StepKey; ms: number; label: string }[] = [
  { key: '5m', ms: 5 * 60_000, label: '5 min' },
  { key: '10m', ms: 10 * 60_000, label: '10 min' },
  { key: '15m', ms: 15 * 60_000, label: '15 min' },
  { key: '30m', ms: 30 * 60_000, label: '30 min' },
  { key: '1h', ms: 3_600_000, label: '1 h' },
  { key: '1d', ms: 86_400_000, label: '1 jour' },
];

export interface SideStats {
  count: number;
  mean: number;
  min: number;
  max: number;
  std: number;
  /** Cumul sur la période commune (null si la grandeur n'est pas cumulable). */
  total: number | null;
}

export interface ComparisonRow {
  /** Début du pas (epoch ms, heure locale pour le pas journalier). */
  t: number;
  a: number;
  b: number;
  delta: number;
  deltaPct: number | null;
}

export interface ModelComparison {
  step: StepKey;
  stepMs: number;
  /** Unité commune après alignement (W, Wh, ppm…). */
  unit: string;
  /** Unité du cumul (Wh, VAh…) ou null si non cumulable. */
  totalUnit: string | null;
  /** Comment chaque série a été ramenée sur le pas commun. */
  aggregation: 'mean' | 'sum' | 'energy';
  /** Période de recouvrement. */
  from: number;
  to: number;
  rows: ComparisonRow[];
  a: SideStats;
  b: SideStats;
  /** Nombre de pas où une seule des deux séries a une valeur (trous). */
  onlyA: number;
  onlyB: number;
  /** Biais moyen B − A. */
  meanDelta: number;
  /** Écart absolu moyen. */
  mae: number;
  rmse: number;
  maxAbsDelta: number;
  maxAbsDeltaAt: number;
  /** Écart des cumuls (ou des moyennes si non cumulable) en % de A. */
  biasPct: number | null;
  correlation: number | null;
  /** Avertissements sur la validité physique de la comparaison. */
  warnings: string[];
}

/* ------------------------------------------------------------------ utils */

/** Unité entre parenthèses en fin de libellé (ex. "P apparente (VA)" → "VA"). */
export function extractUnit(label: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(label);
  return m ? m[1] : '';
}

/** Nature d'une colonne : déduite de son unité si elle est électrique connue, sinon `fallback`. */
export function kindForUnit(unit: string, fallback: QuantityKind = 'other'): QuantityKind {
  const info = unitInfo(unit);
  return info ? info.kind : fallback;
}

/** Colonnes numériques d'un relevé (grandeur principale en tête). */
export function numericKeys(measurements: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const m of measurements) {
    for (const [k, v] of Object.entries(m)) {
      if (k !== 'timestamp' && typeof v === 'number' && Number.isFinite(v)) keys.add(k);
    }
  }
  const list = Array.from(keys);
  list.sort((a, b) => (a === 'consumption' ? -1 : b === 'consumption' ? 1 : a.localeCompare(b)));
  return list;
}

function toPoints(series: SeriesSpec): { t: number; v: number }[] {
  const pts: { t: number; v: number }[] = [];
  for (const m of series.measurements) {
    const v = m[series.metricKey];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const t = toDate(String(m.timestamp)).getTime();
    if (!Number.isFinite(t)) continue;
    pts.push({ t, v });
  }
  return pts.sort((x, y) => x.t - y.t);
}

/** Pas d'échantillonnage natif (médiane des intervalles), en ms. */
export function detectStepMs(points: { t: number }[]): number {
  if (points.length < 2) return 86_400_000;
  const diffs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].t - points[i - 1].t;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 86_400_000;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** Plus petit pas standard ≥ au pas natif le plus grossier des deux séries. */
export function autoStep(stepAMs: number, stepBMs: number): StepKey {
  const coarse = Math.max(stepAMs, stepBMs);
  return (STEPS.find((s) => s.ms >= coarse) ?? STEPS[STEPS.length - 1]).key;
}

/** Début du pas contenant `t` (le pas journalier est aligné sur minuit local). */
function bucketStart(t: number, stepMs: number): number {
  if (stepMs >= 86_400_000) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  return Math.floor(t / stepMs) * stepMs;
}

function resample(
  points: { t: number; v: number }[],
  stepMs: number,
  mode: 'mean' | 'sum' | 'integrate',
  scale: number,
  nativeStepMs: number,
): Map<number, number> {
  const groups = new Map<number, { t: number; v: number }[]>();
  for (const p of points) {
    const k = bucketStart(p.t, stepMs);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push({ t: p.t, v: p.v * scale });
  }
  const out = new Map<number, number>();
  groups.forEach((pts, k) => {
    if (mode === 'mean') out.set(k, pts.reduce((s, p) => s + p.v, 0) / pts.length);
    else if (mode === 'sum') out.set(k, pts.reduce((s, p) => s + p.v, 0));
    else {
      // Chaque échantillon de puissance vaut pour son intervalle natif
      // (ex. 10 min) : un pas complet est couvert en entier, un pas partiel
      // (début/fin de campagne, trou) ne compte que le temps réellement mesuré.
      const dtH = Math.min(nativeStepMs, stepMs) / 3_600_000;
      out.set(k, pts.reduce((s, p) => s + p.v * dtH, 0));
    }
  });
  return out;
}

function stats(values: number[]): Omit<SideStats, 'total'> {
  const n = values.length;
  if (n === 0) return { count: 0, mean: NaN, min: NaN, max: NaN, std: NaN };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const std = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { count: n, mean, min: Math.min(...values), max: Math.max(...values), std };
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? null : num / den;
}

/* ------------------------------------------------------------------- main */

/**
 * Compare deux séries sur une échelle de temps commune.
 * Renvoie `{ error }` si les séries ne se recouvrent pas ou sont vides.
 */
export function compareModels(
  a: SeriesSpec,
  b: SeriesSpec,
  opts: { step?: StepKey | 'auto'; from?: number; to?: number } = {},
): ModelComparison | { error: string } {
  const ptsA = toPoints(a);
  const ptsB = toPoints(b);
  if (ptsA.length === 0) return { error: `« ${a.label} » ne contient aucune valeur numérique pour ${a.metricLabel}.` };
  if (ptsB.length === 0) return { error: `« ${b.label} » ne contient aucune valeur numérique pour ${b.metricLabel}.` };

  const warnings: string[] = [];
  const infoA = unitInfo(a.unit);
  const infoB = unitInfo(b.unit);

  // Nature de chaque côté : l'unité électrique prime sur le quantity_kind déclaré
  // (une colonne secondaire "P apparente (VA)" est une puissance même si le
  // fichier a une énergie comme grandeur principale).
  const kindA = infoA ? infoA.kind : a.quantityKind;
  const kindB = infoB ? infoB.kind : b.quantityKind;

  let aggregation: ModelComparison['aggregation'];
  let unit: string;
  let totalUnit: string | null;
  let modeA: 'mean' | 'sum' | 'integrate';
  let modeB: 'mean' | 'sum' | 'integrate';
  let scaleA = 1;
  let scaleB = 1;

  if (infoA && infoB) {
    if (infoA.family !== infoB.family) {
      warnings.push(`Grandeurs électriques différentes (${a.unit} vs ${b.unit}) : P, S et Q ne sont pas comparables entre elles.`);
    }
    scaleA = infoA.toBase;
    scaleB = infoB.toBase;
    if (kindA === 'power' && kindB === 'power') {
      aggregation = 'mean'; modeA = modeB = 'mean';
      unit = powerUnitFor(a.unit) ?? a.unit;
      totalUnit = energyUnitFor(a.unit) ?? null;
    } else if (kindA === 'energy' && kindB === 'energy') {
      aggregation = 'sum'; modeA = modeB = 'sum';
      unit = energyUnitFor(a.unit) ?? a.unit;
      totalUnit = unit;
    } else {
      aggregation = 'energy';
      modeA = kindA === 'power' ? 'integrate' : 'sum';
      modeB = kindB === 'power' ? 'integrate' : 'sum';
      unit = energyUnitFor(a.unit) ?? a.unit;
      totalUnit = unit;
    }
  } else {
    if (a.unit !== b.unit) {
      warnings.push(`Unités différentes (${a.unit || '∅'} vs ${b.unit || '∅'}) : l'écart n'a de sens que si les deux mesurent la même chose.`);
    }
    if (kindA === 'energy' && kindB === 'energy') {
      aggregation = 'sum'; modeA = modeB = 'sum'; unit = a.unit; totalUnit = a.unit;
    } else if (kindA === 'power' && kindB === 'power') {
      aggregation = 'mean'; modeA = modeB = 'mean'; unit = a.unit; totalUnit = a.unit ? `${a.unit}h` : null;
    } else {
      aggregation = 'mean'; modeA = modeB = 'mean'; unit = a.unit; totalUnit = null;
    }
  }

  const stepKey = !opts.step || opts.step === 'auto'
    ? autoStep(detectStepMs(ptsA), detectStepMs(ptsB))
    : opts.step;
  const stepMs = STEPS.find((s) => s.key === stepKey)!.ms;

  const natA = detectStepMs(ptsA);
  const natB = detectStepMs(ptsB);
  if (stepMs < Math.max(natA, natB)) {
    warnings.push('Le pas choisi est plus fin que l\'échantillonnage natif d\'une des séries : certains pas seront vides.');
  }

  const from = Math.max(ptsA[0].t, ptsB[0].t, opts.from ?? -Infinity);
  const to = Math.min(ptsA[ptsA.length - 1].t, ptsB[ptsB.length - 1].t, opts.to ?? Infinity);
  if (!(from <= to)) {
    return { error: 'Les deux relevés ne se recouvrent pas dans le temps : aucune période commune à comparer.' };
  }

  const inRange = (p: { t: number }) => p.t >= from && p.t <= to;
  const rsA = resample(ptsA.filter(inRange), stepMs, modeA, scaleA, natA);
  const rsB = resample(ptsB.filter(inRange), stepMs, modeB, scaleB, natB);

  const keys = Array.from(new Set([...rsA.keys(), ...rsB.keys()])).sort((x, y) => x - y);
  const rows: ComparisonRow[] = [];
  let onlyA = 0, onlyB = 0;
  for (const k of keys) {
    const va = rsA.get(k);
    const vb = rsB.get(k);
    if (va == null && vb == null) continue;
    if (va == null) { onlyB++; continue; }
    if (vb == null) { onlyA++; continue; }
    const delta = vb - va;
    rows.push({ t: k, a: va, b: vb, delta, deltaPct: va !== 0 ? (delta / va) * 100 : null });
  }
  if (rows.length === 0) {
    return { error: 'Aucun pas de temps où les deux relevés ont une valeur : vérifiez la période et le pas.' };
  }

  const valsA = rows.map((r) => r.a);
  const valsB = rows.map((r) => r.b);
  const cumulable = totalUnit != null;
  const totalOf = (vals: number[]): number | null => {
    if (!cumulable) return null;
    const sum = vals.reduce((s, v) => s + v, 0);
    // Puissances moyennes par pas → énergie = Σ (P moyen × durée du pas).
    return aggregation === 'mean' ? (sum * stepMs) / 3_600_000 : sum;
  };
  const sideA: SideStats = { ...stats(valsA), total: totalOf(valsA) };
  const sideB: SideStats = { ...stats(valsB), total: totalOf(valsB) };

  const deltas = rows.map((r) => r.delta);
  const meanDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const mae = deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length;
  const rmse = Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length);
  let maxAbsDelta = 0, maxAbsDeltaAt = rows[0].t;
  for (const r of rows) {
    if (Math.abs(r.delta) > maxAbsDelta) { maxAbsDelta = Math.abs(r.delta); maxAbsDeltaAt = r.t; }
  }
  const refA = cumulable ? sideA.total! : sideA.mean;
  const refB = cumulable ? sideB.total! : sideB.mean;
  const biasPct = refA !== 0 ? ((refB - refA) / refA) * 100 : null;

  if (onlyA + onlyB > rows.length * 0.2) {
    warnings.push(`${onlyA + onlyB} pas de temps n'ont de valeur que d'un seul côté (trous de mesure) — ils sont exclus de l'écart.`);
  }

  return {
    step: stepKey, stepMs, unit, totalUnit, aggregation, from, to, rows,
    a: sideA, b: sideB, onlyA, onlyB,
    meanDelta, mae, rmse, maxAbsDelta, maxAbsDeltaAt, biasPct,
    correlation: pearson(valsA, valsB),
    warnings,
  };
}
