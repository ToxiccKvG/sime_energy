/**
 * Modèle « Profil type » — à quoi ressemble une journée typique ?
 *
 * Pour chaque classe de jour (ouvré, week-end, férié), la médiane et
 * l'enveloppe P10–P90 de la grandeur par tranche horaire, plus la liste des
 * jours qui s'écartent le plus de leur profil médian (jours atypiques).
 * Applicable à toute grandeur échantillonnée dans la journée ; pour des
 * données journalières (un point par jour) il n'y a pas de profil horaire,
 * seule la comparaison ouvré / week-end / férié par jour est produite.
 */

import { JOURS_FERIES_FIXES } from '@/components/iot/shared';
import { dailyUnit, groupDays, hourlyUnit, mean, quantile, type DayInfo, type SeriesContext } from './types';

export type DayClass = 'ouvre' | 'weekend' | 'ferie';

export const DAY_CLASSES: DayClass[] = ['ouvre', 'weekend', 'ferie'];

export const DAY_CLASS_LABEL: Record<DayClass, string> = {
  ouvre: 'Jour ouvré',
  weekend: 'Week-end',
  ferie: 'Jour férié',
};

/** Classe d'un jour : férié (dates fixes du Sénégal), week-end (sam./dim.) ou ouvré. */
export function classifyDay(t: number): DayClass {
  const d = new Date(t);
  const isFerie = JOURS_FERIES_FIXES.some((f) => f.mois === d.getMonth() + 1 && f.jour === d.getDate());
  if (isFerie) return 'ferie';
  const wd = d.getDay();
  return wd === 0 || wd === 6 ? 'weekend' : 'ouvre';
}

export interface ProfileSlot {
  /** Tranche horaire (heure de début 0-23). */
  hour: number;
  median: number;
  p10: number;
  p90: number;
  mean: number;
  /** Nombre de jours ayant contribué. */
  days: number;
}

export interface ClassProfile {
  dayClass: DayClass;
  days: number;
  slots: ProfileSlot[];
  /** Valeur journalière moyenne (cumul ou moyenne selon la grandeur). */
  dailyMean: number;
  dailyMedian: number;
}

export interface AtypicalDay {
  day: string;
  dayClass: DayClass;
  daily: number;
  /** Écart relatif à la médiane journalière de sa classe (%). */
  deviationPct: number;
  /** Distance moyenne au profil médian (RMS, en unité de la grandeur). */
  distance: number;
}

export interface ProfilTypeResult {
  stepMs: number;
  /** Profil horaire disponible (données infra-journalières). */
  subDaily: boolean;
  unit: string;
  hourlyUnit: string;
  dailyUnit: string;
  profiles: ClassProfile[];
  atypical: AtypicalDay[];
  /** Jour le plus « typique » (le plus proche du profil médian) par classe. */
  typicalDays: { dayClass: DayClass; day: string }[];
  totalDays: number;
}

/** Profil horaire médian + enveloppe d'un ensemble de jours. */
export function buildSlots(days: DayInfo[]): ProfileSlot[] {
  const slots: ProfileSlot[] = [];
  for (let h = 0; h < 24; h++) {
    const vals = days.map((d) => d.hourly[h]).filter((v): v is number => v != null);
    if (vals.length === 0) continue;
    slots.push({ hour: h, median: quantile(vals, 0.5), p10: quantile(vals, 0.1), p90: quantile(vals, 0.9), mean: mean(vals), days: vals.length });
  }
  return slots;
}

export function computeProfilType(ctx: SeriesContext): ProfilTypeResult {
  const { stepMs, subDaily, days: allDays } = groupDays(ctx);
  const classed = allDays.map((d) => ({ ...d, dayClass: classifyDay(d.t0) }));

  const profiles: ClassProfile[] = [];
  const typicalDays: ProfilTypeResult['typicalDays'] = [];
  const atypical: AtypicalDay[] = [];

  for (const dayClass of DAY_CLASSES) {
    const days = classed.filter((d) => d.dayClass === dayClass);
    if (days.length === 0) continue;
    const slots = subDaily ? buildSlots(days) : [];
    const dailyVals = days.map((d) => d.daily).filter((v) => Number.isFinite(v));
    const dailyMedian = quantile(dailyVals, 0.5);
    profiles.push({ dayClass, days: days.length, slots, dailyMean: mean(dailyVals), dailyMedian });

    // Distance de chaque jour au profil médian de sa classe.
    const scored = days.map((d) => {
      let acc = 0, n = 0;
      for (const s of slots) {
        const v = d.hourly[s.hour];
        if (v == null) continue;
        acc += (v - s.median) ** 2; n++;
      }
      const distance = n ? Math.sqrt(acc / n) : Math.abs(d.daily - dailyMedian);
      const deviationPct = dailyMedian !== 0 ? ((d.daily - dailyMedian) / Math.abs(dailyMedian)) * 100 : 0;
      return { day: d.day, dayClass, daily: d.daily, deviationPct, distance };
    });
    scored.sort((a, b) => a.distance - b.distance);
    if (scored.length) typicalDays.push({ dayClass, day: scored[0].day });
    atypical.push(...scored.slice(-3).reverse().filter((s) => Math.abs(s.deviationPct) > 20));
  }

  atypical.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));

  return {
    stepMs, subDaily, unit: ctx.unit,
    hourlyUnit: hourlyUnit(ctx.unit, ctx.quantityKind),
    dailyUnit: dailyUnit(ctx.unit, ctx.quantityKind),
    profiles, atypical: atypical.slice(0, 8), typicalDays, totalDays: allDays.length,
  };
}
