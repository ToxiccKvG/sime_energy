/**
 * Modèles d'analyse du module Campagne de mesure.
 *
 * Un modèle répond à une question d'audit précise (« à quoi ressemble une
 * journée type ? », « que s'est-il passé d'anormal ? », « l'action a-t-elle
 * rapporté ? »…). Il est choisi d'après la NATURE des données (puissance,
 * énergie, grandeur environnementale, pas de temps, colonnes présentes) et
 * jamais d'après l'appareil : un même modèle sert au Shelly, au C.A 8335, à
 * l'onduleur PV, à la station d'air ou à un capteur personnalisé.
 *
 * Tout le calcul est côté client (même règle que measurementStats.ts).
 */

import type { QuantityKind } from '@/services/measurementStats';

export type Measurement = { timestamp: string } & Record<string, unknown>;

/** Un relevé tel que vu par les modèles : mesures + métadonnées de la grandeur. */
export interface SeriesContext {
  label: string;
  sensorType?: string;
  measurements: Measurement[];
  /** Colonne analysée ('consumption' = grandeur principale). */
  metricKey: string;
  metricLabel: string;
  unit: string;
  quantityKind: QuantityKind;
}

export interface Point {
  t: number;
  v: number;
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

/** Points numériques triés d'une colonne. */
export function toPoints(ctx: SeriesContext): Point[] {
  const pts: Point[] = [];
  for (const m of ctx.measurements) {
    const v = m[ctx.metricKey];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const t = new Date(String(m.timestamp).replace(' ', 'T')).getTime();
    if (!Number.isFinite(t)) continue;
    pts.push({ t, v });
  }
  return pts.sort((a, b) => a.t - b.t);
}

export function dayKey(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

export function std(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
}

/** Percentile par interpolation linéaire sur un tableau trié croissant. */
export function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return lo === hi ? sorted[lo] : sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function quantile(xs: number[], q: number): number {
  return quantileSorted([...xs].sort((a, b) => a - b), q);
}

/**
 * Valeur « par jour » d'une grandeur : cumul (énergie sommée, puissance
 * intégrée sur le pas natif) si elle est cumulable, moyenne sinon.
 */
export function dailyValue(points: Point[], kind: QuantityKind, stepMs: number): number {
  if (points.length === 0) return NaN;
  if (kind === 'energy') return points.reduce((s, p) => s + p.v, 0);
  if (kind === 'power') return points.reduce((s, p) => s + p.v, 0) * (stepMs / 3_600_000);
  return mean(points.map((p) => p.v));
}

/** Unité du cumul journalier (Wh pour W, inchangée pour une énergie, unité brute pour une moyenne). */
export function dailyUnit(unit: string, kind: QuantityKind): string {
  return kind === 'power' ? (unit ? `${unit}h` : '') : unit;
}

/**
 * Valeur « par heure » d'une tranche : somme pour une énergie (les points sont
 * des incréments), moyenne pour une puissance ou une grandeur d'ambiance.
 */
export function hourlyValue(points: Point[], kind: QuantityKind): number {
  if (points.length === 0) return NaN;
  if (kind === 'energy') return points.reduce((s, p) => s + p.v, 0);
  return mean(points.map((p) => p.v));
}

export interface DayInfo {
  day: string;
  /** Horodatage du premier point du jour. */
  t0: number;
  points: Point[];
  /** Cumul ou moyenne du jour selon la grandeur. */
  daily: number;
  /** Valeur de chaque tranche horaire (null si aucune mesure dans la tranche). */
  hourly: (number | null)[];
}

export interface DayGrouping {
  stepMs: number;
  /** Données infra-journalières (un profil horaire a un sens). */
  subDaily: boolean;
  days: DayInfo[];
}

/** Regroupe les points d'un relevé par jour calendaire, avec profil horaire. */
export function groupDays(ctx: SeriesContext): DayGrouping {
  const pts = toPoints(ctx);
  const stepMs = detectStepMs(pts);
  const subDaily = stepMs < 86_400_000;

  const byDay = new Map<string, Point[]>();
  for (const p of pts) {
    const k = dayKey(p.t);
    const arr = byDay.get(k);
    if (arr) arr.push(p); else byDay.set(k, [p]);
  }

  const days: DayInfo[] = Array.from(byDay.entries()).map(([day, dpts]) => {
    const perHour: Point[][] = Array.from({ length: 24 }, () => []);
    for (const p of dpts) perHour[new Date(p.t).getHours()].push(p);
    return {
      day,
      t0: dpts[0].t,
      points: dpts,
      daily: dailyValue(dpts, ctx.quantityKind, stepMs),
      hourly: perHour.map((hp) => (hp.length && subDaily ? hourlyValue(hp, ctx.quantityKind) : null)),
    };
  });
  days.sort((a, b) => a.t0 - b.t0);
  return { stepMs, subDaily, days };
}

/** Unité d'une valeur horaire (identique à l'unité brute : W moyen, kWh par heure, ppm moyen). */
export function hourlyUnit(unit: string, kind: QuantityKind): string {
  return kind === 'energy' && unit ? `${unit}/h` : unit;
}

/** Médiane des écarts absolus à la médiane (robuste aux valeurs extrêmes). */
export function mad(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = quantile(xs, 0.5);
  return quantile(xs.map((x) => Math.abs(x - m)), 0.5);
}

/** Cumul d'une liste de points (trapèzes si puissance, somme si énergie, NaN sinon). */
export function totalOf(points: Point[], kind: QuantityKind): number {
  if (points.length === 0) return NaN;
  if (kind === 'energy') return points.reduce((s, p) => s + p.v, 0);
  if (kind === 'power') {
    let e = 0;
    for (let i = 1; i < points.length; i++) {
      const dt = (points[i].t - points[i - 1].t) / 3_600_000;
      if (dt > 0) e += ((points[i].v + points[i - 1].v) / 2) * dt;
    }
    return e;
  }
  return NaN;
}

export function fmtDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
