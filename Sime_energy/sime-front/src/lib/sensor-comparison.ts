/**
 * Calcul du bilan maître/esclave entre un capteur de référence (ex: arrivée
 * générale) et un ou plusieurs capteurs secondaires (ex: sous-compteurs).
 * Principe : Σ(esclaves) doit expliquer la valeur du maître à chaque instant.
 *
 * Peu importe que chaque capteur reporte une puissance instantanée (W, VA, var)
 * ou une énergie déjà cumulée (Wh, VAh, varh) : les deux sont ramenées à une
 * énergie par intervalle (somme directe si la source est déjà une énergie,
 * intégration temporelle — trapèzes — si c'est une puissance), tant qu'elles
 * appartiennent à la même famille électrique. On ne mélange jamais actif,
 * apparent et réactif entre eux : ce sont des grandeurs physiquement
 * différentes (P ≠ S ≠ Q), les comparer donnerait un écart qui ne reflète
 * rien de réel.
 */

import { integrateEnergy } from '@/services/measurementStats';

export type BucketGranularity = 'hour' | 'day';

type Family = 'active' | 'apparent' | 'reactive';
type Kind = 'power' | 'energy';

interface UnitMeta {
  family: Family;
  kind: Kind;
  /** Facteur vers l'unité de base de sa famille (W, VA ou var / Wh, VAh ou varh). */
  toBase: number;
}

const UNIT_INFO: Record<string, UnitMeta> = {
  W: { family: 'active', kind: 'power', toBase: 1 },
  kW: { family: 'active', kind: 'power', toBase: 1_000 },
  MW: { family: 'active', kind: 'power', toBase: 1_000_000 },
  Wh: { family: 'active', kind: 'energy', toBase: 1 },
  kWh: { family: 'active', kind: 'energy', toBase: 1_000 },
  MWh: { family: 'active', kind: 'energy', toBase: 1_000_000 },
  VA: { family: 'apparent', kind: 'power', toBase: 1 },
  kVA: { family: 'apparent', kind: 'power', toBase: 1_000 },
  VAh: { family: 'apparent', kind: 'energy', toBase: 1 },
  kVAh: { family: 'apparent', kind: 'energy', toBase: 1_000 },
  var: { family: 'reactive', kind: 'power', toBase: 1 },
  kvar: { family: 'reactive', kind: 'power', toBase: 1_000 },
  varh: { family: 'reactive', kind: 'energy', toBase: 1 },
  kvarh: { family: 'reactive', kind: 'energy', toBase: 1_000 },
};

const BASE_ENERGY_UNIT: Record<Family, string> = {
  active: 'Wh',
  apparent: 'VAh',
  reactive: 'varh',
};

/**
 * Deux unités sont comparables si elles décrivent la même grandeur électrique
 * (active / apparente / réactive), qu'elles soient exprimées en puissance ou
 * en énergie — peu importe le capteur ou le modèle qui les fournit.
 */
export function areUnitsCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const infoA = UNIT_INFO[a];
  const infoB = UNIT_INFO[b];
  return !!infoA && !!infoB && infoA.family === infoB.family;
}

/** Vrai si `unit` est une puissance instantanée (nécessite une intégration, pas une somme). */
export function isPowerUnit(unit?: string): boolean {
  return !!unit && UNIT_INFO[unit]?.kind === 'power';
}

/** Unité d'énergie affichée pour un résultat de comparaison basé sur `unit` (ex. "kW" → "Wh"). */
export function energyUnitFor(unit?: string): string | undefined {
  const info = unit ? UNIT_INFO[unit] : undefined;
  return info ? BASE_ENERGY_UNIT[info.family] : unit;
}

export interface SeriesInput {
  id: string;
  label: string;
  unit?: string;
  measurements: { timestamp: string; consumption?: number; [k: string]: any }[];
}

export interface ComparisonBucket {
  key: string;
  masterValue: number;
  slavesSum: number;
  slaveValues: Record<string, number>;
  residual: number;
  residualPct: number | null;
}

export interface ComparisonResult {
  buckets: ComparisonBucket[];
  masterTotal: number;
  slavesTotal: number;
  deltaAbs: number;
  deltaPct: number | null;
  correlation: number | null;
}

function parseTs(ts: string): Date {
  return new Date(String(ts).replace(' ', 'T'));
}

function bucketKeyFor(d: Date, granularity: BucketGranularity): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (granularity === 'day') return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

/**
 * Énergie de la série par intervalle (jour ou heure), dans l'unité de base de
 * sa famille électrique (Wh / VAh / varh) :
 *  - source déjà en énergie (Wh, VAh, varh…) → somme directe des échantillons
 *  - source en puissance (W, VA, var…) → intégration temporelle (trapèzes)
 * Les deux donnent un résultat sur la même base, comparable entre capteurs
 * différents sans jamais mélanger actif / apparent / réactif.
 */
function bucketEnergy(series: SeriesInput, granularity: BucketGranularity): Map<string, number> {
  const info = series.unit ? UNIT_INFO[series.unit] : undefined;
  const scale = info?.toBase ?? 1;

  const points: { t: number; v: number }[] = [];
  const byBucket = new Map<string, { t: number; v: number }[]>();
  for (const m of series.measurements) {
    const raw = typeof m.consumption === 'number' ? m.consumption : null;
    if (raw == null) continue;
    const d = parseTs(m.timestamp);
    if (isNaN(d.getTime())) continue;
    const v = raw * scale;
    const key = bucketKeyFor(d, granularity);
    const pt = { t: d.getTime(), v };
    points.push(pt);
    (byBucket.get(key) ?? byBucket.set(key, []).get(key)!).push(pt);
  }

  const out = new Map<string, number>();
  if (info?.kind === 'power') {
    byBucket.forEach((pts, key) => out.set(key, integrateEnergy(pts)));
  } else {
    byBucket.forEach((pts, key) => out.set(key, pts.reduce((s, p) => s + p.v, 0)));
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}

export function computeComparison(
  master: SeriesInput,
  slaves: SeriesInput[],
  granularity: BucketGranularity = 'day',
): ComparisonResult {
  const masterBuckets = bucketEnergy(master, granularity);
  const slaveBuckets = slaves.map((s) => ({ id: s.id, buckets: bucketEnergy(s, granularity) }));

  const allKeys = new Set<string>(masterBuckets.keys());
  slaveBuckets.forEach((s) => s.buckets.forEach((_, k) => allKeys.add(k)));
  const sortedKeys = Array.from(allKeys).sort();

  const buckets: ComparisonBucket[] = sortedKeys.map((key) => {
    const masterValue = masterBuckets.get(key) ?? 0;
    const slaveValues: Record<string, number> = {};
    let slavesSum = 0;
    slaveBuckets.forEach((s) => {
      const v = s.buckets.get(key) ?? 0;
      slaveValues[s.id] = v;
      slavesSum += v;
    });
    const residual = masterValue - slavesSum;
    const residualPct = masterValue !== 0 ? (residual / masterValue) * 100 : null;
    return { key, masterValue, slavesSum, slaveValues, residual, residualPct };
  });

  const masterTotal = buckets.reduce((a, b) => a + b.masterValue, 0);
  const slavesTotal = buckets.reduce((a, b) => a + b.slavesSum, 0);
  const deltaAbs = masterTotal - slavesTotal;
  const deltaPct = masterTotal !== 0 ? (deltaAbs / masterTotal) * 100 : null;
  const correlation = pearson(buckets.map((b) => b.masterValue), buckets.map((b) => b.slavesSum));

  return { buckets, masterTotal, slavesTotal, deltaAbs, deltaPct, correlation };
}
