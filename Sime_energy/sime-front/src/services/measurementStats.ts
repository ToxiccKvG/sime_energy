/**
 * Calcule les KPIs et l'interprétation d'un fichier de mesures côté client.
 *
 * Le backend (`sensors.py`) ne renvoie plus que les mesures brutes + les
 * métadonnées du capteur (unité, grandeur, quantity_kind) — il ne fait plus
 * aucun calcul statistique. Ça évite de dupliquer cette logique en Python et
 * en TS, et permet de la recalculer à la volée sur un sous-ensemble filtré
 * (période, grandeurs sélectionnées...) sans repasser par le serveur.
 */

import type { QuantityKind } from '@/lib/custom-sensor-service';

export type { QuantityKind };

export interface ColumnStat {
  mean: number;
  std: number;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  count: number;
}

export interface Interpretation {
  summary: string;
  insights: string[];
  perColumn: Record<string, string>;
}

export interface MeasurementKpis {
  duration: string;
  avgConsumption: number;
  peakConsumption: number;
  minConsumption: number;
  totalConsumption: number | null;
  totalUnit: string | null;
  stdConsumption: number;
  medianConsumption: number;
  p10Consumption: number;
  p90Consumption: number;
  unit: string;
  measurementCount: number;
  columnStats: Record<string, ColumnStat>;
  interpretation: Interpretation;
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Horodatage "YYYY-MM-DD HH:MM:SS" (format renvoyé par le backend) → Date locale. */
export function toDate(ts: string): Date {
  return new Date(ts.replace(' ', 'T'));
}

/** Percentile par interpolation linéaire (même méthode que pandas `.quantile()`). */
function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 1) return sortedAsc[0];
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function computeColumnStats(values: number[]): ColumnStat {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  // Écart-type d'échantillon (ddof=1), comme pandas `.std()` — 0 si un seul point.
  const std = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    mean: round(mean, 3),
    std: round(std, 3),
    min: round(sorted[0], 3),
    p10: round(quantile(sorted, 0.1), 3),
    median: round(quantile(sorted, 0.5), 3),
    p90: round(quantile(sorted, 0.9), 3),
    max: round(sorted[n - 1], 3),
    count: n,
  };
}

function computeDuration(timestamps: Date[]): string {
  if (timestamps.length < 2) return 'N/A';
  const times = timestamps.map((d) => d.getTime());
  const diffMs = Math.max(...times) - Math.min(...times);
  const days = Math.floor(diffMs / 86_400_000);
  const remainder = diffMs - days * 86_400_000;
  const hours = Math.floor(remainder / 3_600_000);
  const minutes = Math.floor((remainder % 3_600_000) / 60_000);
  return `${days}j ${hours}h ${minutes}min`;
}

/** Intégration temporelle (méthode des trapèzes) — puissance (kW) → énergie (kWh). */
export function integrateEnergy(points: { t: number; v: number }[]): number {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let energy = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dtHours = (sorted[i].t - sorted[i - 1].t) / 3_600_000;
    if (dtHours <= 0) continue;
    energy += ((sorted[i].v + sorted[i - 1].v) / 2) * dtHours;
  }
  return energy;
}

export interface DayGroup {
  /** "YYYY-MM-DD" en heure locale. */
  day: string;
  count: number;
  mean: number;
  min: number;
  max: number;
  /** Cumul du jour (trapèzes si puissance, somme si énergie), null si quantityKind='other'. */
  total: number | null;
}

/**
 * Regroupe une grandeur par jour calendaire — sert de vue de drill-down.
 * `metricKey` : clé de la ligne à agréger ('consumption' = grandeur principale,
 * ou le libellé d'une colonne additionnelle). Le cumul (trapèzes/somme selon
 * `quantityKind`) n'a de sens physique que pour la grandeur principale — pour
 * toute autre colonne, `total` reste toujours `null`.
 */
export function groupMeasurementsByDay(
  measurements: Record<string, any>[],
  quantityKind: QuantityKind,
  metricKey: string = 'consumption',
): DayGroup[] {
  const byDay = new Map<string, { t: number; v: number }[]>();
  for (const m of measurements) {
    const v = m[metricKey];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const d = toDate(String(m.timestamp));
    if (Number.isNaN(d.getTime())) continue;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey)!.push({ t: d.getTime(), v });
  }

  const groups: DayGroup[] = [];
  for (const [day, points] of byDay) {
    const values = points.map((p) => p.v);
    let total: number | null = null;
    if (metricKey === 'consumption') {
      if (quantityKind === 'power') total = round(integrateEnergy(points), 2);
      else if (quantityKind === 'energy') total = round(values.reduce((s, v) => s + v, 0), 2);
    }
    groups.push({
      day,
      count: values.length,
      mean: round(values.reduce((s, v) => s + v, 0) / values.length, 2),
      min: round(Math.min(...values), 2),
      max: round(Math.max(...values), 2),
      total,
    });
  }
  return groups.sort((a, b) => a.day.localeCompare(b.day));
}

interface ThresholdRule {
  match: string;
  op: 'lt' | 'gt' | 'outside';
  value: number | [number, number];
  message: (mean: number) => string;
}

const THRESHOLD_RULES: ThresholdRule[] = [
  {
    match: 'cos φ', op: 'lt', value: 0.8,
    message: (m) => `Cos φ moyen de ${round(m, 2)} : en dessous de 0,8, risque de pénalité pour énergie réactive.`,
  },
  {
    match: 'déséq. u', op: 'gt', value: 2.0,
    message: (m) => `Déséquilibre de tension moyen de ${round(m, 2)} % : au-dessus de 2 %, à vérifier (répartition des charges entre phases).`,
  },
  {
    match: 'co₂', op: 'gt', value: 1000,
    message: (m) => `CO₂ moyen de ${round(m, 2)} ppm : au-dessus de 1000 ppm, qualité de l'air intérieur dégradée.`,
  },
  {
    match: 'fréquence', op: 'outside', value: [49.5, 50.5],
    message: (m) => `Fréquence moyenne de ${round(m, 2)} Hz : hors de la plage nominale 49,5-50,5 Hz.`,
  },
];

function checkThreshold(label: string, meanVal: number): string | null {
  const low = label.toLowerCase();
  for (const rule of THRESHOLD_RULES) {
    if (!low.includes(rule.match)) continue;
    if (rule.op === 'lt' && meanVal < (rule.value as number)) return rule.message(meanVal);
    if (rule.op === 'gt' && meanVal > (rule.value as number)) return rule.message(meanVal);
    if (rule.op === 'outside') {
      const [lo, hi] = rule.value as [number, number];
      if (meanVal < lo || meanVal > hi) return rule.message(meanVal);
    }
  }
  return null;
}

/**
 * En dessous de ce nombre de points, écart-type/percentiles sont trop bruités
 * pour justifier un jugement ("variabilité élevée", facteur de charge...) —
 * on affiche les chiffres bruts sans habillage interprétatif trompeur.
 */
const MIN_SAMPLE_FOR_TREND = 5;

/** Phrase descriptive pour une grandeur, basée sur ses stats + l'alerte de seuil si applicable. */
function describeColumn(label: string, stat: ColumnStat): string {
  const { mean, std, min, max, count } = stat;

  if (count < MIN_SAMPLE_FOR_TREND) {
    let text = `${label} : moyenne ${mean}, plage [${min} ; ${max}] (échantillon restreint : ${count} point(s), tendance non évaluée).`;
    const alert = checkThreshold(label, mean);
    if (alert) text += ` ⚠ ${alert} (à confirmer sur plus de points)`;
    return text;
  }

  const cv = mean ? std / Math.abs(mean) : null;

  let text = `${label} : moyenne ${mean}, plage [${min} ; ${max}]`;
  if (cv !== null) {
    if (cv > 0.5) text += ', variabilité élevée';
    else if (cv < 0.15) text += ', signal stable';
  }
  text += '.';

  const alert = checkThreshold(label, mean);
  if (alert) text += ` ⚠ ${alert}`;
  return text;
}

function generateInterpretation(
  metricLabel: string,
  unit: string,
  duration: string,
  avgNonzero: number,
  peak: number,
  totalValue: number | null,
  totalUnit: string | null,
  std: number,
  count: number,
  columnStats: Record<string, ColumnStat>,
): Interpretation {
  const parts: string[] = [
    `${metricLabel} mesurée sur ${duration}, moyenne de ${avgNonzero} ${unit} (hors périodes nulles), pic à ${peak} ${unit}.`,
  ];
  if (totalValue !== null) parts.push(`Cumul estimé : ${totalValue} ${totalUnit}.`);

  if (count < MIN_SAMPLE_FOR_TREND) {
    parts.push(`Échantillon restreint (${count} point(s)) : facteur de charge et variabilité non calculés, peu représentatifs sur si peu de mesures.`);
  } else {
    const loadFactor = peak ? avgNonzero / peak : null;
    if (loadFactor !== null) {
      if (loadFactor < 0.3) {
        parts.push(`Facteur de charge faible (${Math.round(loadFactor * 100)} %) : usage très intermittent par rapport au pic.`);
      } else if (loadFactor > 0.7) {
        parts.push(`Facteur de charge élevé (${Math.round(loadFactor * 100)} %) : usage proche du régime constant.`);
      }
    }

    const cv = avgNonzero ? std / avgNonzero : null;
    if (cv !== null && cv > 0.5) {
      parts.push('Forte variabilité du signal (écart-type important par rapport à la moyenne).');
    }
  }

  const insights: string[] = [];
  const mainMsg = checkThreshold(metricLabel, avgNonzero);
  if (mainMsg) insights.push(mainMsg);

  const perColumn: Record<string, string> = {};
  for (const [label, stat] of Object.entries(columnStats)) {
    perColumn[label] = describeColumn(label, stat);
    const msg = checkThreshold(label, stat.mean);
    if (msg) insights.push(msg);
  }

  if (Object.keys(columnStats).length > 0) {
    parts.push(`${Object.keys(columnStats).length} grandeur(s) additionnelle(s) analysée(s).`);
  }
  parts.push(insights.length > 0 ? `${insights.length} point(s) d'attention détecté(s) au total.` : "Aucun point d'attention détecté.");

  return { summary: parts.join(' '), insights, perColumn };
}

/**
 * Calcule les KPIs complets (équivalent de l'ancien `_compute_kpis` backend)
 * à partir des mesures brutes reçues du serveur.
 */
export function computeMeasurementKpis(
  measurements: Record<string, any>[],
  opts: { unit: string; metricLabel: string; quantityKind: QuantityKind },
): MeasurementKpis {
  const { unit, metricLabel, quantityKind } = opts;

  const consumptionRows = measurements
    .map((m) => ({ t: toDate(String(m.timestamp)).getTime(), v: m.consumption }))
    .filter((r): r is { t: number; v: number } => Number.isFinite(r.t) && typeof r.v === 'number' && Number.isFinite(r.v));

  if (consumptionRows.length === 0) {
    throw new Error('Aucune valeur numérique exploitable dans le fichier');
  }

  const values = consumptionRows.map((r) => r.v);
  const timestamps = measurements
    .map((m) => toDate(String(m.timestamp)))
    .filter((d) => !Number.isNaN(d.getTime()));

  const duration = computeDuration(timestamps);
  const mainStats = computeColumnStats(values);

  const nonzero = values.filter((v) => v !== 0);
  const avgNonzero = nonzero.length > 0 ? round(nonzero.reduce((s, v) => s + v, 0) / nonzero.length, 2) : 0;

  let totalValue: number | null = null;
  let totalUnit: string | null = null;
  if (quantityKind === 'power') {
    totalValue = round(integrateEnergy(consumptionRows), 2);
    totalUnit = unit ? `${unit}h` : null;
  } else if (quantityKind === 'energy') {
    totalValue = round(values.reduce((s, v) => s + v, 0), 2);
    totalUnit = unit;
  }

  const columnKeys = new Set<string>();
  measurements.forEach((m) => Object.keys(m).forEach((k) => {
    if (k !== 'timestamp' && k !== 'consumption') columnKeys.add(k);
  }));

  const columnStats: Record<string, ColumnStat> = {};
  for (const key of columnKeys) {
    const colValues = measurements
      .map((m) => m[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (colValues.length === 0) continue;
    columnStats[key] = computeColumnStats(colValues);
  }

  const peak = round(Math.max(...values), 2);
  const interpretation = generateInterpretation(
    metricLabel, unit, duration, avgNonzero, peak, totalValue, totalUnit, mainStats.std, values.length, columnStats,
  );

  return {
    duration,
    avgConsumption: avgNonzero,
    peakConsumption: peak,
    minConsumption: round(Math.min(...values), 2),
    totalConsumption: totalValue,
    totalUnit,
    stdConsumption: mainStats.std,
    medianConsumption: mainStats.median,
    p10Consumption: mainStats.p10,
    p90Consumption: mainStats.p90,
    unit,
    measurementCount: values.length,
    columnStats,
    interpretation,
  };
}
