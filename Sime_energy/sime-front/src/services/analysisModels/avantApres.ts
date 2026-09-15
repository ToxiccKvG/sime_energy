/**
 * Modèle « Avant / Après » — l'action a-t-elle rapporté ?
 *
 * On coupe le relevé à une date (remplacement d'un équipement, consigne de
 * climatisation, campagne de sensibilisation…) et on compare les deux côtés
 * à classe de jour égale : un jour ouvré d'après contre un jour ouvré d'avant,
 * jamais un dimanche contre un mardi. Le modèle donne l'écart journalier par
 * classe, le profil horaire médian de chaque côté, le gain réalisé sur la
 * période « après » et sa projection sur un an. Applicable à toute grandeur ;
 * le gain en énergie n'est chiffré que pour une puissance ou une énergie.
 */

import { buildSlots, classifyDay, DAY_CLASSES, type DayClass, type ProfileSlot } from './profilType';
import { dailyUnit, groupDays, hourlyUnit, mean, std, type DayInfo, type SeriesContext } from './types';

/** Jours par an de chaque classe (approximation : 6 fériés fixes, 104 jours de week-end). */
const YEAR_DAYS: Record<DayClass, number> = { ouvre: 255, weekend: 104, ferie: 6 };

export interface SideStats {
  days: number;
  /** Valeur journalière moyenne et écart-type (dailyUnit). */
  dailyMean: number;
  dailyStd: number;
  from: string;
  to: string;
}

export interface ClassDelta {
  dayClass: DayClass;
  before: SideStats | null;
  after: SideStats | null;
  /** après − avant (dailyUnit), négatif = baisse. */
  delta: number;
  deltaPct: number;
  /** Vrai si l'écart dépasse deux fois l'erreur-type de la différence. */
  robust: boolean;
}

export interface AvantApresResult {
  splitAt: number;
  unit: string;
  hourlyUnit: string;
  dailyUnit: string;
  subDaily: boolean;
  cumulable: boolean;
  before: SideStats | null;
  after: SideStats | null;
  /** Écart global (toutes classes confondues). */
  delta: number;
  deltaPct: number;
  robust: boolean;
  byClass: ClassDelta[];
  /** Profils horaires médians (jours ouvrés si présents des deux côtés, sinon tous les jours). */
  profileBefore: ProfileSlot[];
  profileAfter: ProfileSlot[];
  profileClass: DayClass | 'all';
  /** Gain réalisé sur la période « après » (dailyUnit, positif = économie), NaN si non cumulable. */
  savedAfter: number;
  /** Projection annuelle du gain, pondérée par classe de jour (dailyUnit). */
  savedYearly: number;
  /** Série journalière pour le graphique. */
  daily: { day: string; t0: number; dayClass: DayClass; value: number; side: 'before' | 'after' }[];
  warnings: string[];
}

function sideStats(days: DayInfo[]): SideStats | null {
  const vals = days.map((d) => d.daily).filter(Number.isFinite);
  if (vals.length === 0) return null;
  return { days: vals.length, dailyMean: mean(vals), dailyStd: std(vals), from: days[0].day, to: days[days.length - 1].day };
}

function compare(before: SideStats | null, after: SideStats | null): { delta: number; deltaPct: number; robust: boolean } {
  if (!before || !after) return { delta: NaN, deltaPct: NaN, robust: false };
  const delta = after.dailyMean - before.dailyMean;
  const deltaPct = before.dailyMean !== 0 ? (delta / Math.abs(before.dailyMean)) * 100 : NaN;
  const se = Math.sqrt(before.dailyStd ** 2 / before.days + after.dailyStd ** 2 / after.days);
  const robust = before.days >= 3 && after.days >= 3 && (se === 0 ? delta !== 0 : Math.abs(delta) > 2 * se);
  return { delta, deltaPct, robust };
}

export function computeAvantApres(ctx: SeriesContext, splitAt: number): AvantApresResult {
  const { subDaily, days } = groupDays(ctx);
  const cumulable = ctx.quantityKind !== 'other';
  const classed = days.map((d) => ({ ...d, dayClass: classifyDay(d.t0) }));
  // Le jour de la coupure va du côté « après » (l'action est censée être en place ce jour-là).
  const splitDay = new Date(splitAt); splitDay.setHours(0, 0, 0, 0);
  const beforeDays = classed.filter((d) => d.t0 < splitDay.getTime());
  const afterDays = classed.filter((d) => d.t0 >= splitDay.getTime());

  const before = sideStats(beforeDays);
  const after = sideStats(afterDays);
  const raw = compare(before, after);

  const byClass: ClassDelta[] = DAY_CLASSES
    .map((dayClass) => {
      const b = sideStats(beforeDays.filter((d) => d.dayClass === dayClass));
      const a = sideStats(afterDays.filter((d) => d.dayClass === dayClass));
      return { dayClass, before: b, after: a, ...compare(b, a) };
    })
    .filter((c) => c.before || c.after);

  // Profil horaire : jours ouvrés si présents des deux côtés, sinon tous les jours.
  const ouvreBoth = beforeDays.some((d) => d.dayClass === 'ouvre') && afterDays.some((d) => d.dayClass === 'ouvre');
  const profileClass: DayClass | 'all' = ouvreBoth ? 'ouvre' : 'all';
  const pick = (ds: typeof classed) => (profileClass === 'all' ? ds : ds.filter((d) => d.dayClass === profileClass));
  const profileBefore = subDaily ? buildSlots(pick(beforeDays)) : [];
  const profileAfter = subDaily ? buildSlots(pick(afterDays)) : [];

  // Écart global à classe égale : moyenne des écarts par classe pondérée par le
  // mélange de jours « après » (un mélange ouvré/week-end différent des deux
  // côtés ne doit pas passer pour un gain). Classe absente d'un côté : écart brut.
  let overall = { ...raw };
  let savedAfter = NaN, savedYearly = NaN;
  if (before && after) {
    let weighted = 0, yearly = 0;
    for (const c of DAY_CLASSES) {
      const cd = byClass.find((x) => x.dayClass === c);
      const nAfter = afterDays.filter((d) => d.dayClass === c).length;
      const delta = cd && Number.isFinite(cd.delta) ? cd.delta : raw.delta;
      weighted += delta * nAfter;
      yearly += delta * YEAR_DAYS[c];
    }
    const delta = weighted / after.days;
    overall = {
      delta,
      deltaPct: before.dailyMean !== 0 ? (delta / Math.abs(before.dailyMean)) * 100 : NaN,
      // Net si au moins une classe présente des deux côtés l'est.
      robust: byClass.some((c) => c.before && c.after && c.robust),
    };
    if (cumulable) { savedAfter = -delta * after.days; savedYearly = -yearly; }
  }

  const warnings: string[] = [];
  if (!before) warnings.push('Aucune journée avant la date de coupure : décalez-la vers la droite.');
  if (!after) warnings.push('Aucune journée après la date de coupure : décalez-la vers la gauche.');
  if (before && before.days < 5) warnings.push(`Seulement ${before.days} jour(s) avant : l'écart est fragile.`);
  if (after && after.days < 5) warnings.push(`Seulement ${after.days} jour(s) après : l'écart est fragile.`);
  if (before && after && !overall.robust && before.days >= 3 && after.days >= 3) {
    warnings.push('L\'écart est du même ordre que la variabilité d\'un jour à l\'autre : il peut n\'être que du bruit.');
  }
  if (ctx.quantityKind === 'other') warnings.push('Grandeur non cumulable : l\'écart est une différence de moyennes, pas un gain d\'énergie.');

  return {
    splitAt, unit: ctx.unit, hourlyUnit: hourlyUnit(ctx.unit, ctx.quantityKind), dailyUnit: dailyUnit(ctx.unit, ctx.quantityKind),
    subDaily, cumulable, before, after, ...overall, byClass,
    profileBefore, profileAfter, profileClass,
    savedAfter, savedYearly,
    daily: classed.map((d) => ({ day: d.day, t0: d.t0, dayClass: d.dayClass, value: d.daily, side: d.t0 < splitDay.getTime() ? 'before' : 'after' })),
    warnings,
  };
}
