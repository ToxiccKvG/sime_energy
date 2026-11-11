/**
 * Modèle « Anomalies » — que s'est-il passé d'anormal ?
 *
 * Trois familles d'événements, toutes datées et classées par gravité :
 *   - trous de collecte : intervalle entre deux mesures bien plus long que le
 *     pas natif (capteur muet, réseau coupé) ;
 *   - valeur figée : la même valeur répétée sur une longue durée (capteur
 *     bloqué, ou installation réellement à l'arrêt si la valeur est 0) ;
 *   - écarts au profil : tranche horaire (ou jour) très loin de ce que fait
 *     habituellement le site à cette heure pour cette classe de jour
 *     (médiane ± k × MAD, robuste aux extrêmes eux-mêmes).
 * Le modèle s'applique à toute grandeur ; les écarts au profil demandent au
 * moins 3 jours de la même classe pour être calculés.
 */

import { classifyDay, DAY_CLASSES, type DayClass } from './profilType';
import { groupDays, hourlyUnit, mad, quantile, toPoints, type SeriesContext } from './types';

export type AnomalyKind = 'gap' | 'flat' | 'high' | 'low';
export type Severity = 'info' | 'warn' | 'critical';

export const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  gap: 'Trou de collecte',
  flat: 'Valeur figée',
  high: 'Pic inhabituel',
  low: 'Creux inhabituel',
};

export interface AnomalyEvent {
  kind: AnomalyKind;
  severity: Severity;
  /** Début / fin (epoch ms). */
  start: number;
  end: number;
  /** Durée en heures. */
  hours: number;
  /** Valeur observée (moyenne sur l'épisode) et valeur attendue (médiane du profil), si applicable. */
  value?: number;
  expected?: number;
  /** Écart en nombre de MAD normalisées (score robuste), si applicable. */
  score?: number;
  description: string;
}

export interface AnomaliesResult {
  unit: string;
  hourlyUnit: string;
  stepMs: number;
  subDaily: boolean;
  /** Taux de complétude : points reçus / points attendus au pas natif (0–1). */
  completeness: number;
  expectedPoints: number;
  actualPoints: number;
  events: AnomalyEvent[];
  counts: Record<AnomalyKind, number>;
  /** Vrai si le profil de référence a pu être calculé (assez de jours). */
  profileAvailable: boolean;
}

/** Seuil de score au-delà duquel une tranche est jugée anormale. */
const SCORE_WARN = 3.5;
const SCORE_CRITICAL = 6;
const MAD_TO_SIGMA = 1.4826;
/** Dispersion minimale (fraction de la médiane) et écart minimal pour qu'une tranche soit signalée. */
const SIGMA_FLOOR = 0.1;
const MIN_PCT = 20;

/** Nombre au format FR, 2 décimales sous 10, 1 au-dessus. */
function fmtNum(v: number): string {
  return v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 });
}

/** Critique si l'écart est à la fois très improbable (score) et matériel (≥ 50 % de l'habituel). */
function severityOf(score: number, pct: number): Severity {
  return score >= SCORE_CRITICAL && (!Number.isFinite(pct) || Math.abs(pct) >= 50) ? 'critical' : 'warn';
}

function fmtDate(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} j`;
}

export function computeAnomalies(ctx: SeriesContext): AnomaliesResult {
  const pts = toPoints(ctx);
  const { stepMs, subDaily, days } = groupDays(ctx);
  const events: AnomalyEvent[] = [];
  const unitH = hourlyUnit(ctx.unit, ctx.quantityKind);

  // --- Trous de collecte : intervalle > 3 pas (et au moins 2 pas pour des pas horaires ou plus).
  const gapMs = Math.max(3 * stepMs, stepMs + 2 * 60_000);
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].t - pts[i - 1].t;
    if (d <= gapMs) continue;
    const hours = d / 3_600_000;
    events.push({
      kind: 'gap',
      severity: hours >= 24 ? 'critical' : hours >= 3 ? 'warn' : 'info',
      start: pts[i - 1].t, end: pts[i].t, hours,
      description: `Aucune mesure pendant ${fmtHours(hours)} (du ${fmtDate(pts[i - 1].t)} au ${fmtDate(pts[i].t)}).`,
    });
  }

  // --- Valeur figée : ≥ 12 points identiques consécutifs couvrant ≥ 2 h.
  let runStart = 0;
  for (let i = 1; i <= pts.length; i++) {
    const same = i < pts.length && pts[i].v === pts[runStart].v && pts[i].t - pts[i - 1].t <= gapMs;
    if (same) continue;
    const n = i - runStart;
    const hours = n > 1 ? (pts[i - 1].t - pts[runStart].t) / 3_600_000 : 0;
    if (n >= 12 && hours >= 2) {
      const v = pts[runStart].v;
      events.push({
        kind: 'flat',
        severity: hours >= 24 ? 'warn' : 'info',
        start: pts[runStart].t, end: pts[i - 1].t, hours, value: v,
        description: v === 0
          ? `Valeur à zéro pendant ${fmtHours(hours)} (${n} mesures) — arrêt réel ou capteur hors service ?`
          : `Valeur figée à ${fmtNum(v)} ${ctx.unit} pendant ${fmtHours(hours)} (${n} mesures) — capteur bloqué ?`,
      });
    }
    runStart = i;
  }

  // --- Écarts au profil (médiane ± k × MAD par classe de jour et tranche horaire).
  const classed = days.map((d) => ({ ...d, dayClass: classifyDay(d.t0) }));
  let profileAvailable = false;
  for (const dayClass of DAY_CLASSES) {
    const cdays = classed.filter((d) => d.dayClass === dayClass);
    if (cdays.length < 3) continue;
    profileAvailable = true;

    if (subDaily) {
      // Référence par heure.
      const ref: ({ median: number; sigma: number } | null)[] = Array.from({ length: 24 }, (_, h) => {
        const vals = cdays.map((d) => d.hourly[h]).filter((v): v is number => v != null);
        if (vals.length < 3) return null;
        const median = quantile(vals, 0.5);
        // Plancher de dispersion à 10 % de la médiane : évite de signaler du bruit sur des profils très stables.
        const sigma = Math.max(mad(vals) * MAD_TO_SIGMA, Math.abs(median) * SIGMA_FLOOR, 1e-9);
        return { median, sigma };
      });
      for (const d of cdays) {
        // Regroupe les heures anormales contiguës d'un même jour et d'un même sens.
        let ep: { kind: 'high' | 'low'; h0: number; h1: number; vals: number[]; exps: number[]; scores: number[] } | null = null;
        const flush = () => {
          if (!ep) return;
          const start = new Date(`${d.day}T${String(ep.h0).padStart(2, '0')}:00:00`).getTime();
          const end = new Date(`${d.day}T${String(ep.h1).padStart(2, '0')}:59:59`).getTime();
          const score = Math.max(...ep.scores);
          const value = ep.vals.reduce((s, x) => s + x, 0) / ep.vals.length;
          const expected = ep.exps.reduce((s, x) => s + x, 0) / ep.exps.length;
          const pct = expected !== 0 ? ((value - expected) / Math.abs(expected)) * 100 : NaN;
          if (Number.isFinite(pct) && Math.abs(pct) < MIN_PCT) { ep = null; return; }
          events.push({
            kind: ep.kind, severity: severityOf(score, pct),
            start, end, hours: ep.h1 - ep.h0 + 1, value, expected, score,
            description: `${ep.kind === 'high' ? 'Pic' : 'Creux'} de ${ep.h0}h à ${ep.h1 + 1}h : ${fmtNum(value)} ${unitH} au lieu de ${fmtNum(expected)} ${unitH} habituels (${Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)} %` : '—'}, un ${dayClass === 'ouvre' ? 'jour ouvré' : dayClass === 'weekend' ? 'week-end' : 'jour férié'}).`,
          });
          ep = null;
        };
        for (let h = 0; h < 24; h++) {
          const v = d.hourly[h];
          const r = ref[h];
          if (v == null || !r) { flush(); continue; }
          const z = (v - r.median) / r.sigma;
          const kind: 'high' | 'low' | null = z >= SCORE_WARN ? 'high' : z <= -SCORE_WARN ? 'low' : null;
          if (!kind) { flush(); continue; }
          if (ep && ep.kind === kind && ep.h1 === h - 1) {
            ep.h1 = h; ep.vals.push(v); ep.exps.push(r.median); ep.scores.push(Math.abs(z));
          } else {
            flush();
            ep = { kind, h0: h, h1: h, vals: [v], exps: [r.median], scores: [Math.abs(z)] };
          }
        }
        flush();
      }
    } else {
      // Données journalières : écart du cumul/moyenne du jour à sa classe.
      const vals = cdays.map((d) => d.daily).filter(Number.isFinite);
      const median = quantile(vals, 0.5);
      const sigma = Math.max(mad(vals) * MAD_TO_SIGMA, Math.abs(median) * SIGMA_FLOOR, 1e-9);
      for (const d of cdays) {
        const z = (d.daily - median) / sigma;
        if (Math.abs(z) < SCORE_WARN) continue;
        const pct = median !== 0 ? ((d.daily - median) / Math.abs(median)) * 100 : NaN;
        if (Number.isFinite(pct) && Math.abs(pct) < MIN_PCT) continue;
        events.push({
          kind: z > 0 ? 'high' : 'low', severity: severityOf(Math.abs(z), pct),
          start: d.t0, end: d.t0 + 86_399_000, hours: 24, value: d.daily, expected: median, score: Math.abs(z),
          description: `Journée ${z > 0 ? 'très haute' : 'très basse'} : ${fmtNum(d.daily)} au lieu de ${fmtNum(median)} habituels (${Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)} %` : '—'}).`,
        });
      }
    }
  }

  events.sort((a, b) => a.start - b.start);

  const span = pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0;
  const expectedPoints = stepMs > 0 ? Math.round(span / stepMs) + 1 : pts.length;
  const counts: Record<AnomalyKind, number> = { gap: 0, flat: 0, high: 0, low: 0 };
  for (const e of events) counts[e.kind]++;

  return {
    unit: ctx.unit, hourlyUnit: unitH, stepMs, subDaily,
    completeness: expectedPoints > 0 ? Math.min(1, pts.length / expectedPoints) : 1,
    expectedPoints, actualPoints: pts.length,
    events, counts, profileAvailable,
  };
}

