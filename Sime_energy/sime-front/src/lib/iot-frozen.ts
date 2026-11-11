// ============================================================
// Données figées d'un capteur environnemental
//
// Quand une station ne transmet pas (nuit, panne de pile, hors portée), la collecte relit pourtant sa
// DERNIÈRE mesure à chaque passage : on obtient des centaines de lignes identiques (même température,
// même humidité, même pression…) qui ne sont pas des mesures. Mesuré sur la station Donsin en septembre :
// 61,5 % des lignes brutes étaient de telles relectures.
//
// Deux critères, du plus sûr au plus approximatif :
//  1. l'heure réelle de mesure (`mesureAt`, colonne measured_at de shelly_cl) est identique à celle de la
//     ligne précédente du même appareil → relecture EXACTE ;
//  2. sans cette heure (fichier importé) : toutes les grandeurs sont identiques pendant ≥ 30 min et sur
//     ≥ 5 lignes consécutives.
//
// Les grandeurs CUMULATIVES (précipitations) ne sont jamais filtrées ni modifiées ici : la première ligne
// d'une séquence figée conserve la vraie valeur, les suivantes n'ajoutent rien.
// ============================================================

import type { ShellyRow } from '@/components/iot/shared';

/** Grandeurs d'un capteur environnemental : sert à reconnaître l'appareil et à comparer deux lignes. */
export const ENV_VALUE_KEYS = [
  'temperature', 'humidite', 'ressenti', 'pointRosee', 'uvIndex', 'luminosite', 'pression', 'precipitation',
  'ventVitesse', 'ventRafale', 'ventDirection', 'tempInterne', 'batterie', 'batterieV', 'signal',
] as const;

/** Grandeurs vidées sur une ligne figée : tout sauf le cumul de pluie (jamais touché). */
export const BLANKABLE_ENV_KEYS = ENV_VALUE_KEYS.filter(k => k !== 'precipitation');

const MIN_RUN_ROWS = 5;
const MIN_RUN_MS = 30 * 60_000;

export interface FrozenSummary {
  /** Lignes figées (relectures), hors première ligne de chaque séquence. */
  rows: ShellyRow[];
  /** Nombre de séquences figées. */
  sequences: number;
  /** Plus longue séquence : durée en ms et début. */
  longestMs: number;
  longestStart: Date | null;
  /** Vrai si la détection s'appuie sur l'heure réelle de mesure (critère 1). */
  exact: boolean;
}

const t = (d: unknown): number => (d instanceof Date ? d.getTime() : new Date(d as string).getTime());

const deviceKeyOf = (r: ShellyRow) => `${r.nomAppareil ?? ''}|${r.deviceLocation ?? ''}|${r.deviceRoom ?? ''}`;

const hasEnv = (r: ShellyRow) => ENV_VALUE_KEYS.some(k => typeof r[k] === 'number');

const sameValues = (a: ShellyRow, b: ShellyRow) => ENV_VALUE_KEYS.every(k => a[k] === b[k]);

export function findFrozenRows(rows: ShellyRow[]): FrozenSummary {
  const byDevice = new Map<string, ShellyRow[]>();
  for (const r of rows) {
    if (!hasEnv(r)) continue;
    const k = deviceKeyOf(r);
    const arr = byDevice.get(k);
    if (arr) arr.push(r); else byDevice.set(k, [r]);
  }

  const frozen: ShellyRow[] = [];
  let sequences = 0, longestMs = 0, longestStart: Date | null = null, exact = false;
  const closeRun = (run: ShellyRow[], needsThreshold: boolean) => {
    if (run.length < 2) return;
    const span = t(run[run.length - 1].date) - t(run[0].date);
    if (needsThreshold && (run.length < MIN_RUN_ROWS || span < MIN_RUN_MS)) return;
    frozen.push(...run.slice(1));
    sequences++;
    if (span > longestMs) { longestMs = span; longestStart = run[0].date instanceof Date ? run[0].date : new Date(run[0].date); }
  };

  for (const arr of byDevice.values()) {
    arr.sort((a, b) => t(a.date) - t(b.date));
    // Critère 1 si TOUTES les lignes portent l'heure de mesure, sinon critère 2.
    const withMeasure = arr.every(r => r.mesureAt instanceof Date && !isNaN(r.mesureAt.getTime()));
    if (withMeasure) exact = true;
    let run: ShellyRow[] = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const same = withMeasure ? arr[i].mesureAt!.getTime() === arr[i - 1].mesureAt!.getTime() : sameValues(arr[i], arr[i - 1]);
      if (same) run.push(arr[i]);
      else { closeRun(run, !withMeasure); run = [arr[i]]; }
    }
    closeRun(run, !withMeasure);
  }
  return { rows: frozen, sequences, longestMs, longestStart, exact };
}

/** « 11 h 24 » ou « 38 min ». */
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
