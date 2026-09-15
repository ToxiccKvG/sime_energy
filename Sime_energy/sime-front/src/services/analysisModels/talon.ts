/**
 * Modèle « Talon » — qu'est-ce qui consomme quand rien ne devrait tourner ?
 *
 * Le talon (charge de base) est la puissance qui subsiste la nuit ou en
 * inoccupation : veilles, éclairage oublié, froid, serveurs… Pour chaque jour
 * on prend le minimum horaire de la nuit (00h–05h) — à défaut le P5 des
 * points du jour — puis le talon retenu est la médiane de ces minima. Le
 * modèle chiffre sa part dans le cumul de la période et ce qu'il représente
 * sur un an. Réservé aux puissances et énergies infra-journalières.
 */

import { classifyDay, type DayClass } from './profilType';
import { dailyUnit, groupDays, hourlyUnit, quantile, totalOf, toPoints, type SeriesContext } from './types';

export const NIGHT_HOURS = [0, 1, 2, 3, 4, 5];

export interface TalonDay {
  day: string;
  dayClass: DayClass;
  /** Talon du jour (minimum horaire de nuit, ou P5 des points). */
  talon: number;
  /** Maximum horaire du jour. */
  peak: number;
  /** Cumul du jour. */
  daily: number;
  /** Vrai si le talon vient du P5 (pas de mesure entre 00h et 05h). */
  fromP5: boolean;
}

export interface TalonResult {
  applicable: boolean;
  reason?: string;
  unit: string;
  hourlyUnit: string;
  dailyUnit: string;
  /** Talon retenu (médiane des talons journaliers). */
  talon: number;
  /** Talon ouvré / week-end (permet de voir si le site « s'éteint » le week-end). */
  talonByClass: { dayClass: DayClass; talon: number; days: number }[];
  /** Pointe horaire (P95 des valeurs horaires). */
  peak: number;
  /** Rapport talon / pointe (0–1). */
  talonToPeak: number;
  /** Énergie du talon sur la période et cumul total, même unité (dailyUnit). */
  talonEnergy: number;
  totalEnergy: number;
  /** Part du talon dans le cumul (0–1). */
  share: number;
  /** Projection annuelle du talon (talon × 8 760 h), en dailyUnit. */
  yearly: number;
  periodHours: number;
  days: TalonDay[];
}

export function computeTalon(ctx: SeriesContext): TalonResult {
  const base = {
    unit: ctx.unit, hourlyUnit: hourlyUnit(ctx.unit, ctx.quantityKind), dailyUnit: dailyUnit(ctx.unit, ctx.quantityKind),
    talon: NaN, talonByClass: [], peak: NaN, talonToPeak: NaN, talonEnergy: NaN, totalEnergy: NaN, share: NaN, yearly: NaN, periodHours: 0, days: [],
  };
  if (ctx.quantityKind === 'other') {
    return { ...base, applicable: false, reason: 'Le talon n\'a de sens que pour une puissance ou une énergie.' };
  }
  const { subDaily, days: grouped } = groupDays(ctx);
  if (!subDaily) {
    return { ...base, applicable: false, reason: 'Le talon demande des mesures infra-journalières (au moins une par heure).' };
  }

  const days: TalonDay[] = grouped.map((d) => {
    const night = NIGHT_HOURS.map((h) => d.hourly[h]).filter((v): v is number => v != null);
    const hourly = d.hourly.filter((v): v is number => v != null);
    const fromP5 = night.length === 0;
    const talon = fromP5 ? quantile(d.points.map((p) => p.v), 0.05) : Math.min(...night);
    return { day: d.day, dayClass: classifyDay(d.t0), talon, peak: hourly.length ? Math.max(...hourly) : NaN, daily: d.daily, fromP5 };
  });

  const talons = days.map((d) => d.talon).filter(Number.isFinite);
  const talon = quantile(talons, 0.5);
  const allHourly = grouped.flatMap((d) => d.hourly.filter((v): v is number => v != null));
  const peak = quantile(allHourly, 0.95);

  const talonByClass = (['ouvre', 'weekend', 'ferie'] as DayClass[])
    .map((dayClass) => {
      const xs = days.filter((d) => d.dayClass === dayClass).map((d) => d.talon).filter(Number.isFinite);
      return { dayClass, talon: xs.length ? quantile(xs, 0.5) : NaN, days: xs.length };
    })
    .filter((c) => c.days > 0);

  const pts = toPoints(ctx);
  const periodHours = pts.length > 1 ? (pts[pts.length - 1].t - pts[0].t) / 3_600_000 : 0;
  const totalEnergy = totalOf(pts, ctx.quantityKind);
  // Talon exprimé « par heure » (W → Wh/h, kWh/h → kWh/h) : l'énergie du talon est talon × heures.
  const talonEnergy = talon * periodHours;

  return {
    ...base,
    applicable: true,
    talon, talonByClass, peak,
    talonToPeak: peak > 0 ? talon / peak : NaN,
    talonEnergy, totalEnergy,
    share: totalEnergy > 0 ? talonEnergy / totalEnergy : NaN,
    yearly: talon * 8760,
    periodHours,
    days,
  };
}

