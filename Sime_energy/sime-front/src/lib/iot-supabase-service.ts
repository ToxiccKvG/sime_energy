// ============================================================
// IOT MODULE — Service Supabase (table : shelly_cl)
// Source : SHELLY_GCP_00/supabase/schema.sql (rev. 2026-04-16)
//
// Architecture :
//   pg_cron → Edge Function poll-shelly → table shelly_cl
//   1 ligne = 1 appareil à 1 instant T (polling toutes les minutes)
//
// Vues disponibles (côté Supabase) :
//   readings_latest  : dernière valeur par device_id
//   readings_energy  : delta LAG par device (cons_kwh, cons_kwh_a/b/c, inject_kwh)
//   readings_hourly  : agrégation horaire
//
// Ce service interroge la table brute shelly_cl et calcule les
// deltas client-side pour rester indépendant des vues.
// ============================================================

import { supabase } from '@/lib/supabase';
import { COLONNES_PROFIL_SHELLY } from '@/components/iot/shared';

// ── Nom de la table ───────────────────────────────────────────
const SHELLY_TABLE = 'shelly_cl' as const;

// ── Interface ligne brute shelly_cl ──────────────────────────
interface ShellyRow {
  id?: number;
  ts: string;                        // horodatage du poll

  // Localisation
  site: string;
  room?: string | null;
  name: string;
  device_id: string;
  device_type?: string | null;       // SHEM-3, SNPL-00112EU…
  device_family?: string | null;     // ENERGIE_3PH | ENERGIE_2PH | ENERGIE_1PH | LUMIERE | …

  // État
  state?: string | null;

  // Énergie monophasée / channel principal
  power_w?: number | null;           // W instantané
  voltage_v?: number | null;         // V
  current_a?: number | null;         // A

  // Puissance instantanée par phase (W)
  p_a?: number | null;
  p_b?: number | null;
  p_c?: number | null;

  // Tension par phase (V)
  v_a?: number | null;
  v_b?: number | null;
  v_c?: number | null;

  // Courant par phase (A)
  i_a?: number | null;
  i_b?: number | null;
  i_c?: number | null;

  // Compteurs Wh cumulatifs soutirage (jamais remis à 0)
  wh_a?: number | null;
  wh_b?: number | null;
  wh_c?: number | null;
  wh_tot?: number | null;            // = wh_a + wh_b + wh_c

  // Compteurs Wh cumulatifs retour/injection (PV → réseau)
  wh_ra?: number | null;
  wh_rb?: number | null;
  wh_rc?: number | null;
  wh_rtot?: number | null;           // = wh_ra + wh_rb + wh_rc

  // Capteurs environnementaux
  temperature?: number | null;
  humidity?: number | null;
  battery_level?: number | null;
  feels_like_c?: number | null;
  dewpoint_c?: number | null;
  uv_index?: number | null;
  illuminance_lux?: number | null;
  pressure_hpa?: number | null;
  pressure_slope?: string | null;
  precipitation_mm?: number | null;
  moisture_alarm?: boolean | null;
  wind_speed_ms?: number | null;
  wind_gust_ms?: number | null;
  wind_direction_deg?: number | null;
  tilt_angle?: number | null;
  concentration_ppm?: number | null;
  device_temp_c?: number | null;
  battery_voltage_v?: number | null;
  signal_rssi?: number | null;
}

// ── Options d'export ──────────────────────────────────────────
export interface SupabaseExportOptions {
  /** Colonnes PROFIL Mi à exporter */
  colonnes: string[];
  /**
   * Granularité des données :
   *  - 'horaire'  → table shelly_cl_horaire (wh_conso déjà calculé, recommandé pour l'analyse)
   *  - 'minute'   → table shelly_cl (compteurs cumulatifs, diff LAG côté client)
   */
  granularite?: 'horaire' | 'minute';
  /** Filtrer par site */
  site?: string;
  /** Filtrer par device_family (ENERGIE_3PH, ENERGIE_1PH, LUMIERE…) */
  deviceFamily?: string;
  /** Filtrer par device_type exact (code Shelly : SHEM-3, SHPLG-S…) */
  deviceType?: string;
  /** Filtrer par nom d'appareil */
  deviceName?: string;
  /** Filtrer par device_id(s) Shelly */
  deviceIds?: string[];
  /** Date de début ISO */
  dateDebut?: string;
  /** Date de fin ISO */
  dateFin?: string;
  /** Limite max de lignes retournées — undefined = illimité */
  limit?: number;
}

// ── Interface ligne shelly_cl_horaire ────────────────────────
interface ShellyHoraireRow {
  ts_heure: string;
  site?: string | null;
  room?: string | null;
  device_id: string;
  name?: string | null;
  device_type?: string | null;
  device_family?: string | null;
  wh_conso?: number | null;      // Wh consommés dans l'heure (incrémental)
  wh_inj?: number | null;        // Wh injectés dans l'heure (incrémental)
  power_w_moy?: number | null;
  power_w_max?: number | null;
  p_a_moy?: number | null;
  p_b_moy?: number | null;
  p_c_moy?: number | null;
  v_a_moy?: number | null;
  v_b_moy?: number | null;
  v_c_moy?: number | null;
  voltage_v_moy?: number | null;
  nb_mesures?: number | null;

  // Agrégats capteurs (migration 20260828_add_shelly_horaire_env_columns)
  temperature_moy?: number | null;
  temperature_min?: number | null;
  temperature_max?: number | null;
  humidity_moy?: number | null;
  feels_like_c_moy?: number | null;
  dewpoint_c_moy?: number | null;
  uv_index_moy?: number | null;
  uv_index_max?: number | null;
  illuminance_lux_moy?: number | null;
  illuminance_lux_max?: number | null;
  pressure_hpa_moy?: number | null;
  pressure_slope_dernier?: string | null;
  precipitation_mm?: number | null;
  moisture_alarm?: boolean | null;
  wind_speed_ms_moy?: number | null;
  wind_gust_ms_max?: number | null;
  wind_direction_deg_moy?: number | null;
  device_temp_c_moy?: number | null;
  tilt_angle_moy?: number | null;
  concentration_ppm_moy?: number | null;
  battery_level_min?: number | null;
  battery_voltage_v_moy?: number | null;
  signal_rssi_moy?: number | null;
  state_dernier?: string | null;
  nb_mesures_env?: number | null;
}

// Toutes les clés PROFIL Mi valides
export const ALL_AVAILABLE_KEYS = new Set(COLONNES_PROFIL_SHELLY.map(c => c.key));

// ── Utilitaires ───────────────────────────────────────────────
function n(v: number | null | undefined): number {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((d.getTime() - start.getTime()) / (7 * 86400000) + 1);
}

// ── Transforme un tableau de lignes shelly_cl → PROFIL Mi ─────
//
// Correspondance colonnes shelly_cl → PROFIL Mi :
//
//  ENTRÉE (brut Wh → incrémental via diff LAG)
//   wh_a/b/c/tot      → Wh_PhA/B/C/Total    (diff avec ligne précédente du même device)
//   wh_ra/rb/rc/rtot  → Wh_RetourA/B/C/Total
//
//  CALCULÉ (kWh incrémentaux)
//   Wh_x / 1000       → kWh_PhA/B/C/Total + Retour
//
//  CALCULÉ (kWh cumulatifs)
//   wh_a/b/c/tot/1000 → kWhCum_PhA/B/C/Total
//   wh_ra…/1000       → kWhCum_RetourA…
//
//  CALCULÉ (puissance kW)
//   p_a/b/c / 1000    → kW_PhA/B/C
//   power_w / 1000    → kW_Total (ou Σ p_a+p_b+p_c si power_w null)
//   retour : p_x < 0  → kW_RetourA… (injection vers réseau)
// ─────────────────────────────────────────────────────────────
export function transformRowsToProfilMi(
  rows: ShellyRow[],
  colonnes: string[],
): Record<string, unknown>[] {
  // Trier par (device_id, ts) pour calculer correctement les diffs par appareil
  const sorted = [...rows].sort((a, b) => {
    if (a.device_id < b.device_id) return -1;
    if (a.device_id > b.device_id) return 1;
    return new Date(a.ts).getTime() - new Date(b.ts).getTime();
  });

  return sorted.map((m, i) => {
    // Ligne précédente du même appareil (pour le diff cumulatif)
    const prev: ShellyRow | null =
      i > 0 && sorted[i - 1].device_id === m.device_id ? sorted[i - 1] : null;

    const date = new Date(m.ts);
    const h = date.getHours();
    const dow = date.getDay();      // 0=Dim 6=Sam
    const month = date.getMonth(); // 0-11

    // ── Cumulatifs soutirage (Wh brut) ────────────────────────
    const whA_cum    = n(m.wh_a);
    const whB_cum    = n(m.wh_b);
    const whC_cum    = n(m.wh_c);
    const whTot_cum  = n(m.wh_tot) || (whA_cum + whB_cum + whC_cum);

    // ── Retour / injection (PV → réseau, cumulatif Wh brut) ────
    const whRA_cum   = n(m.wh_ra);
    const whRB_cum   = n(m.wh_rb);
    const whRC_cum   = n(m.wh_rc);
    const whRTot_cum = n(m.wh_rtot) || (whRA_cum + whRB_cum + whRC_cum);

    // ── Incrémentaux (diff avec row précédent du même device) ─
    const diff = (cur: number, prevVal: number | null | undefined): number =>
      prev ? Math.max(0, cur - n(prevVal)) : cur;

    const whA    = diff(whA_cum,   prev?.wh_a);
    const whB    = diff(whB_cum,   prev?.wh_b);
    const whC    = diff(whC_cum,   prev?.wh_c);
    const whTot  = diff(whTot_cum, prev?.wh_tot);

    const whRA   = diff(whRA_cum,   prev?.wh_ra);
    const whRB   = diff(whRB_cum,   prev?.wh_rb);
    const whRC   = diff(whRC_cum,   prev?.wh_rc);
    const whRTot = diff(whRTot_cum, prev?.wh_rtot);

    // ── Puissance instantanée (W → kW) ────────────────────────
    const pA_W   = n(m.p_a);
    const pB_W   = n(m.p_b);
    const pC_W   = n(m.p_c);
    const pTot_W = n(m.power_w) || (pA_W + pB_W + pC_W);

    // Soutirage : valeurs positives
    const kW_A    = Math.max(0, pA_W)   / 1000;
    const kW_B    = Math.max(0, pB_W)   / 1000;
    const kW_C    = Math.max(0, pC_W)   / 1000;
    const kW_Tot  = Math.max(0, pTot_W) / 1000;

    // Retour / injection : valeurs négatives (si p_x < 0 = injection)
    const kW_RA   = Math.abs(Math.min(0, pA_W))   / 1000;
    const kW_RB   = Math.abs(Math.min(0, pB_W))   / 1000;
    const kW_RC   = Math.abs(Math.min(0, pC_W))   / 1000;
    const kW_RTot = Math.abs(Math.min(0, pTot_W)) / 1000;

    // ── Montant énergie (tarif SENELEC 140,74 F CFA / kWh) ────
    const kwhTot  = whTot  / 1000;
    const kwhRTot = whRTot / 1000;

    const fullRow: Record<string, unknown> = {
      // ── Données d'entrée (Wh bruts incrémentaux) ──────────────
      Temps:              date.toISOString(),
      Wh_PhA:             whA,
      Wh_PhB:             whB,
      Wh_PhC:             whC,
      Wh_Total:           whTot,
      Wh_RetourA:         whRA,
      Wh_RetourB:         whRB,
      Wh_RetourC:         whRC,
      Wh_RetourTotal:     whRTot,

      // ── kWh incrémentaux ──────────────────────────────────────
      kWh_PhA:            whA    / 1000,
      kWh_PhB:            whB    / 1000,
      kWh_PhC:            whC    / 1000,
      kWh_Total:          kwhTot,
      kWh_RetourA:        whRA   / 1000,
      kWh_RetourB:        whRB   / 1000,
      kWh_RetourC:        whRC   / 1000,
      kWh_RetourTotal:    kwhRTot,

      // ── kWh cumulatifs (compteurs bruts ÷ 1000) ───────────────
      kWhCum_PhA:         whA_cum    / 1000,
      kWhCum_PhB:         whB_cum    / 1000,
      kWhCum_PhC:         whC_cum    / 1000,
      kWhCum_Total:       whTot_cum  / 1000,
      kWhCum_RetourA:     whRA_cum   / 1000,
      kWhCum_RetourB:     whRB_cum   / 1000,
      kWhCum_RetourC:     whRC_cum   / 1000,
      kWhCum_RetourTotal: whRTot_cum / 1000,

      // ── Puissance instantanée (kW) ────────────────────────────
      kW_PhA:             kW_A,
      kW_PhB:             kW_B,
      kW_PhC:             kW_C,
      kW_Total:           kW_Tot,
      kW_RetourA:         kW_RA,
      kW_RetourB:         kW_RB,
      kW_RetourC:         kW_RC,
      kW_RetourTotal:     kW_RTot,

      // ── Capteurs environnementaux (CAPTEUR_ENV / ETAT) ────────
      Temperature:        m.temperature ?? null,
      Humidite:           m.humidity ?? null,
      Ressenti:           m.feels_like_c ?? null,
      Point_Rosee:        m.dewpoint_c ?? null,
      UV_Index:           m.uv_index ?? null,
      Luminosite:         m.illuminance_lux ?? null,
      Pression:           m.pressure_hpa ?? null,
      Tendance_Pression:  m.pressure_slope ?? null,
      Precipitation:      m.precipitation_mm ?? null,
      Alarme_Humidite:    m.moisture_alarm ?? null,
      Vent_Vitesse:       m.wind_speed_ms ?? null,
      Vent_Rafale:        m.wind_gust_ms ?? null,
      Vent_Direction:     m.wind_direction_deg ?? null,
      Etat_Capteur:       m.state ?? null,
      Angle_Inclinaison:  m.tilt_angle ?? null,
      Concentration_Gaz:  m.concentration_ppm ?? null,
      Temp_Interne:       m.device_temp_c ?? null,
      Batterie:           m.battery_level ?? null,
      Batterie_V:         m.battery_voltage_v ?? null,
      Signal:             m.signal_rssi ?? null,

      // ── Classifieurs temporels ────────────────────────────────
      Date:           date.toLocaleDateString('fr-FR'),
      Date_longue:    date.toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      Jour:           date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      Mois:           date.toLocaleDateString('fr-FR', { month: 'long' }),
      Annee:          date.getFullYear(),
      Heure_complete: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      Heure:          h,

      // ── Classifieurs (jours d'activité, sans facturation) ─────
      Jour_activites:  [0, 6].includes(dow) ? 'Weekend' : 'Jour ouvré',
      Heures_ensol:    h >= 7 && h <= 19 ? 'En ensoleillement' : 'Hors ensoleillement',
      Heures_travail:  h >= 8 && h <= 18 ? "Heures d'activités" : "Heures hors activités",
      Periode_clim:    [11, 0, 1, 2].includes(month) ? 'Période de fraîcheur' : 'Période chaude',
      Saison:          [6, 7, 8, 9].includes(month) ? 'Hivernage' : 'Sèche',
      Periode:         h < 6 ? 'Nuit' : h < 12 ? 'Matin' : h < 18 ? 'Après-midi' : 'Soir',

      // ── Identité appareil ─────────────────────────────────────
      Nom:             m.name    ?? m.device_id ?? '',
      Appareil:        m.name    ?? m.device_id ?? '',
      Emplacement:     m.site    ?? '',
      Piece:           m.room    ?? '',
      Profil:          m.device_family ?? m.device_type ?? '',

      // ── Semaine ───────────────────────────────────────────────
      Jour_sem_mesure: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      Semaine_mesures: getWeekNumber(date),
    };

    return colonnes.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = fullRow[key] ?? null;
      return acc;
    }, {});
  });
}

// ── Transforme shelly_cl_horaire → PROFIL Mi ──────────────────
// wh_conso / wh_inj sont déjà incrémentaux (pas de diff nécessaire)
// Wh par phase estimés depuis puissance moyenne × 1 h
export function transformHoraireToProfilMi(
  rows: ShellyHoraireRow[],
  colonnes: string[],
): Record<string, unknown>[] {
  return rows.map(m => {
    const date  = new Date(m.ts_heure);
    const h     = date.getHours();
    const dow   = date.getDay();
    const month = date.getMonth();

    // Wh totaux déjà calculés dans la table
    const whConso = n(m.wh_conso);
    const whInj   = n(m.wh_inj);

    // Wh par phase ≈ puissance moyenne (W) × 1 h (soutirage positif, injection négative)
    const whA  = Math.max(0, n(m.p_a_moy));
    const whB  = Math.max(0, n(m.p_b_moy));
    const whC  = Math.max(0, n(m.p_c_moy));
    const whRA = Math.abs(Math.min(0, n(m.p_a_moy)));
    const whRB = Math.abs(Math.min(0, n(m.p_b_moy)));
    const whRC = Math.abs(Math.min(0, n(m.p_c_moy)));

    const kW_Tot = n(m.power_w_moy) / 1000;
    const kW_A   = Math.max(0, n(m.p_a_moy)) / 1000;
    const kW_B   = Math.max(0, n(m.p_b_moy)) / 1000;
    const kW_C   = Math.max(0, n(m.p_c_moy)) / 1000;
    const kW_RA  = Math.abs(Math.min(0, n(m.p_a_moy))) / 1000;
    const kW_RB  = Math.abs(Math.min(0, n(m.p_b_moy))) / 1000;
    const kW_RC  = Math.abs(Math.min(0, n(m.p_c_moy))) / 1000;

    const fullRow: Record<string, unknown> = {
      Temps:              date.toISOString(),
      Wh_PhA:             whA,
      Wh_PhB:             whB,
      Wh_PhC:             whC,
      Wh_Total:           whConso,
      Wh_RetourA:         whRA,
      Wh_RetourB:         whRB,
      Wh_RetourC:         whRC,
      Wh_RetourTotal:     whInj,

      kWh_PhA:            whA  / 1000,
      kWh_PhB:            whB  / 1000,
      kWh_PhC:            whC  / 1000,
      kWh_Total:          whConso / 1000,
      kWh_RetourA:        whRA / 1000,
      kWh_RetourB:        whRB / 1000,
      kWh_RetourC:        whRC / 1000,
      kWh_RetourTotal:    whInj / 1000,

      kWhCum_PhA:         null,
      kWhCum_PhB:         null,
      kWhCum_PhC:         null,
      kWhCum_Total:       null,
      kWhCum_RetourA:     null,
      kWhCum_RetourB:     null,
      kWhCum_RetourC:     null,
      kWhCum_RetourTotal: null,

      kW_PhA:             kW_A,
      kW_PhB:             kW_B,
      kW_PhC:             kW_C,
      kW_Total:           kW_Tot,
      kW_RetourA:         kW_RA,
      kW_RetourB:         kW_RB,
      kW_RetourC:         kW_RC,
      kW_RetourTotal:     kW_RA + kW_RB + kW_RC,

      // ── Capteurs environnementaux (moyennes de l'heure) ───────
      // Sans ces lignes, toute analyse en granularité horaire — la valeur par
      // défaut — rendait les capteurs comme des lignes vides : la station météo
      // et les H&T n'apparaissaient qu'avec des zéros d'énergie.
      Temperature:        m.temperature_moy ?? null,
      Humidite:           m.humidity_moy ?? null,
      Ressenti:           m.feels_like_c_moy ?? null,
      Point_Rosee:        m.dewpoint_c_moy ?? null,
      UV_Index:           m.uv_index_moy ?? null,
      Luminosite:         m.illuminance_lux_moy ?? null,
      Pression:           m.pressure_hpa_moy ?? null,
      Tendance_Pression:  m.pressure_slope_dernier ?? null,
      Precipitation:      m.precipitation_mm ?? null,
      Alarme_Humidite:    m.moisture_alarm ?? null,
      Vent_Vitesse:       m.wind_speed_ms_moy ?? null,
      Vent_Rafale:        m.wind_gust_ms_max ?? null,
      Vent_Direction:     m.wind_direction_deg_moy ?? null,
      Etat_Capteur:       m.state_dernier ?? null,
      Angle_Inclinaison:  m.tilt_angle_moy ?? null,
      Concentration_Gaz:  m.concentration_ppm_moy ?? null,
      Temp_Interne:       m.device_temp_c_moy ?? null,
      Batterie:           m.battery_level_min ?? null,
      Batterie_V:         m.battery_voltage_v_moy ?? null,
      Signal:             m.signal_rssi_moy ?? null,

      Date:           date.toLocaleDateString('fr-FR'),
      Date_longue:    date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      Jour:           date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      Mois:           date.toLocaleDateString('fr-FR', { month: 'long' }),
      Annee:          date.getFullYear(),
      Heure_complete: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      Heure:          h,

      Jour_activites:  [0, 6].includes(dow) ? 'Weekend' : 'Jour ouvré',
      Heures_ensol:    h >= 7 && h <= 19 ? 'En ensoleillement' : 'Hors ensoleillement',
      Heures_travail:  h >= 8 && h <= 18 ? "Heures d'activités" : "Heures hors activités",
      Periode_clim:    [11, 0, 1, 2].includes(month) ? 'Période de fraîcheur' : 'Période chaude',
      Saison:          [6, 7, 8, 9].includes(month) ? 'Hivernage' : 'Sèche',
      Periode:         h < 6 ? 'Nuit' : h < 12 ? 'Matin' : h < 18 ? 'Après-midi' : 'Soir',

      Nom:             m.name     ?? m.device_id ?? '',
      Appareil:        m.name     ?? m.device_id ?? '',
      Emplacement:     m.site     ?? '',
      Piece:           m.room     ?? '',
      Profil:          m.device_family ?? m.device_type ?? '',
      Jour_sem_mesure: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      Semaine_mesures: getWeekNumber(date),
    };

    return colonnes.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = fullRow[key] ?? null;
      return acc;
    }, {});
  });
}

// ── Pagination ────────────────────────────────────────────────
// PostgREST plafonne toute réponse à 1000 lignes. Sans pagination, choisir
// "Illimité" ne renvoyait que les 1000 lignes les plus anciennes — soit
// quelques heures au lieu de la période demandée, et (le tri se faisant
// ensuite par appareil) souvent les données d'un seul capteur.
const PAGE_ROWS = 1000;
const MAX_ROWS  = 200_000; // garde-fou mémoire navigateur

interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
}

/** Pagination par OFFSET — réservée aux volumes modérés (table horaire). */
async function fetchAllPaginated<T>(
  buildQuery: () => RangeableQuery<T>,
  limit?: number,
): Promise<T[]> {
  const out: T[] = [];
  const hardCap = Math.min(limit ?? MAX_ROWS, MAX_ROWS);
  let from = 0;
  while (from < hardCap) {
    const to = Math.min(from + PAGE_ROWS, hardCap) - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < to - from + 1) break; // dernière page atteinte
    from = to + 1;
  }
  return out;
}

/**
 * Pagination « keyset » (curseur sur `ts`) appareil par appareil.
 *
 * La table shelly_cl porte l'index `(device_id, ts)`. Toute lecture qui s'en
 * écarte devient très coûteuse sur des centaines de milliers de lignes — mesuré
 * sur une sélection réelle de 94 000 lignes :
 *   - pagination OFFSET (tous appareils, tri par ts) → 4,6 s à l'offset 90 000,
 *     soit ~4 min pour parcourir l'ensemble (le coût croît à chaque page) ;
 *   - curseur sur la clé primaire `id`              → 6,4 s/page (tri complet,
 *     l'index (device_id, ts) ne fournit pas l'ordre des id) ;
 *   - curseur sur `ts`, un seul appareil à la fois  → 76 ms/page.
 *
 * On interroge donc chaque appareil séparément, ce qui laisse Postgres suivre
 * l'index, et on parallélise modérément les appareils.
 */
const DEVICE_CONCURRENCY = 4;

interface TsKeysetQuery<T> {
  eq(column: string, value: string): {
    gt(column: string, value: string): {
      order(column: string, opts: { ascending: boolean }): {
        limit(n: number): PromiseLike<{ data: T[] | null; error: unknown }>;
      };
    };
  };
}

async function fetchDeviceKeyset<T extends { ts?: string }>(
  buildQuery: () => TsKeysetQuery<T>,
  deviceId: string,
  cap: number,
  dateDebut?: string,
): Promise<T[]> {
  const out: T[] = [];
  // Curseur initial : borne basse de la période (ou epoch si non bornée)
  let cursor = dateDebut ?? '1970-01-01T00:00:00Z';
  while (out.length < cap) {
    const pageSize = Math.min(PAGE_ROWS, cap - out.length);
    const { data, error } = await buildQuery()
      .eq('device_id', deviceId)
      .gt('ts', cursor)
      .order('ts', { ascending: true })
      .limit(pageSize);
    if (error) throw error;
    const batch = data ?? [];
    if (batch.length === 0) break;
    out.push(...batch);
    const last = batch[batch.length - 1].ts;
    // Curseur bloqué (horodatages identiques sur toute la page) : on arrête
    // plutôt que de boucler indéfiniment.
    if (typeof last !== 'string' || last === cursor) break;
    cursor = last;
    if (batch.length < pageSize) break; // dernière page pour cet appareil
  }
  return out;
}

async function fetchAllDevicesKeyset<T extends { ts?: string }>(
  buildQuery: () => TsKeysetQuery<T>,
  deviceIds: string[],
  limit?: number,
  dateDebut?: string,
): Promise<T[]> {
  const hardCap = Math.min(limit ?? MAX_ROWS, MAX_ROWS);
  const out: T[] = [];
  for (let i = 0; i < deviceIds.length; i += DEVICE_CONCURRENCY) {
    if (out.length >= hardCap) break;
    const lot = deviceIds.slice(i, i + DEVICE_CONCURRENCY);
    const perDeviceCap = Math.max(1, Math.floor((hardCap - out.length) / lot.length));
    const results = await Promise.all(
      lot.map(id => fetchDeviceKeyset(buildQuery, id, perDeviceCap, dateDebut)),
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

/** Liste des appareils concernés — nécessaire pour interroger appareil par appareil. */
async function resolveDeviceIds(opts: {
  deviceIds?: string[]; site?: string; deviceFamily?: string;
  deviceType?: string; deviceName?: string;
}): Promise<string[]> {
  if (opts.deviceIds && opts.deviceIds.length > 0) return opts.deviceIds;
  let q = supabase.from('shelly_devices_catalog').select('device_id');
  if (opts.site)         q = q.eq('site', opts.site);
  if (opts.deviceFamily) q = q.eq('device_family', opts.deviceFamily);
  if (opts.deviceType)   q = q.eq('device_type', opts.deviceType);
  if (opts.deviceName)   q = q.eq('name', opts.deviceName);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(d => (d as { device_id: string }).device_id);
}

// ── Fonction principale d'export ──────────────────────────────
export async function exporterDonneesSupabase(
  options: SupabaseExportOptions,
): Promise<{ rows: Record<string, unknown>[]; total: number; erreur?: string }> {
  const {
    colonnes,
    granularite = 'horaire',
    site,
    deviceFamily,
    deviceType,
    deviceName,
    deviceIds,
    dateDebut,
    dateFin,
    limit,
  } = options;

  const colonnesValides = colonnes.filter(c => ALL_AVAILABLE_KEYS.has(c));
  if (colonnesValides.length === 0) {
    return { rows: [], total: 0, erreur: 'Aucune colonne valide sélectionnée' };
  }

  try {
    if (granularite === 'horaire') {
      // ── Table shelly_cl_horaire : wh_conso déjà incrémental ──
      const buildHoraireQuery = () => {
        let query = supabase
          .from('shelly_cl_horaire')
          .select('*')
          .order('ts_heure', { ascending: true });

        if (site)         query = query.eq('site', site);
        if (deviceFamily) query = query.eq('device_family', deviceFamily);
        if (deviceType)   query = query.eq('device_type', deviceType);
        if (deviceName)   query = query.eq('name', deviceName);
        if (deviceIds && deviceIds.length > 0) query = query.in('device_id', deviceIds);
        if (dateDebut)    query = query.gte('ts_heure', dateDebut);
        if (dateFin)      query = query.lte('ts_heure', dateFin);
        return query;
      };

      // En parallèle : mapping device_id → room (absent de shelly_cl_horaire)
      let roomQuery = supabase
        .from(SHELLY_TABLE)
        .select('device_id,room')
        .not('room', 'is', null)
        .order('ts', { ascending: false })
        .limit(5000);
      if (site)                              roomQuery = roomQuery.eq('site', site);
      if (deviceIds && deviceIds.length > 0) roomQuery = roomQuery.in('device_id', deviceIds);

      const [data, { data: roomData }] = await Promise.all([
        fetchAllPaginated<ShellyHoraireRow>(buildHoraireQuery, limit),
        roomQuery,
      ]);

      const roomMap = new Map<string, string>();
      for (const r of roomData ?? []) {
        if (r.room && !roomMap.has(r.device_id)) roomMap.set(r.device_id, r.room);
      }
      const enriched = data.map(m => ({
        ...m,
        room: m.room ?? roomMap.get(m.device_id) ?? null,
      }));

      const rows = transformHoraireToProfilMi(enriched, colonnesValides);
      return { rows, total: rows.length };

    } else {
      // ── Table shelly_cl : compteurs cumulatifs, diff LAG côté client ──
      // Interrogation appareil par appareil (voir fetchAllDevicesKeyset) : le
      // filtre device_id et l'ordre sur ts sont posés par la pagination.
      const buildMinuteQuery = () => {
        let query = supabase
          .from(SHELLY_TABLE)
          .select('*');
        if (dateFin) query = query.lte('ts', dateFin);
        return query;
      };

      const ids = await resolveDeviceIds({ deviceIds, site, deviceFamily, deviceType, deviceName });
      if (ids.length === 0) {
        return { rows: [], total: 0, erreur: 'Aucun appareil ne correspond aux filtres sélectionnés' };
      }
      const data = await fetchAllDevicesKeyset<ShellyRow>(buildMinuteQuery, ids, limit, dateDebut);

      const rows = transformRowsToProfilMi(data, colonnesValides);
      return { rows, total: rows.length };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return { rows: [], total: 0, erreur: msg };
  }
}

// ── Catalogue des appareils Shelly intégrés ───────────────────
export interface DisponiblesResult {
  sites: string[];
  devices: { name: string; device_id: string; device_family: string; site: string; room?: string | null }[];
  deviceFamilies: string[];
  rooms: string[];
}

const KNOWN_SHELLY_DEVICES: DisponiblesResult['devices'] = [
  { device_id: 'XB137192911224369', name: 'BLU H&T_Chambre', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: 'XB137192911234820', name: 'BLU H&T_Salon', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: 'XB137192911238428', name: 'BLU H&T_Terrasse Ext. NordEst', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: 'XB159066633771102', name: 'Blu Button Red', device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'XB137192908721858', name: 'Blu H&T_Balcon SudEst', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: 'XB66172393105902', name: 'Blu Motion_Detecteur mouvement', device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: '54320453f8c4', name: 'Box Wifi', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: 'b0b21c1a6dcc', name: 'Clim Salon', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: 'd4d4daf38108', name: 'Clim_Bureau', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '543204ba0ad4', name: 'Congelateur Beko A+', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '3c6105f63e1f', name: 'Detecteur de Gaz', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: 'c45bbee265f5', name: 'EM-SENELEC', device_family: 'ENERGIE_2PH', site: 'Ma Maison' },
  { device_id: 'c45bbee265f5_1', name: 'ECL hall-sejour-cuisine', device_family: 'ENERGIE_2PH', site: 'Ma Maison' },
  { device_id: '543204adae34', name: 'Frigo Beko A+', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '34b7da8cdbf8', name: 'Gen3_H&T', device_family: 'CAPTEUR_ENV', site: 'Ma Maison' },
  { device_id: '08f9e0702184', name: 'Lampe Chevet_Chambre', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '08f9e06a8b59', name: 'Lampe Salon', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '08f9e070240a', name: 'Lampe Salle de bain', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '98cdac2d299d', name: 'Lampe_Bureau', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '485519ee0d24', name: 'Lampe_Cuisine', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '08f9e07023fe', name: 'Lampe_Hall', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: '34945479cd39', name: 'Lampe_Toilette Bureau', device_family: 'LUMIERE', site: 'Ma Maison' },
  { device_id: 'b0b21c1ad428', name: 'Machine a laver', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '64b7080d0a40', name: 'Micro-onde', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '2c1165cb07e7', name: 'Motion 2_Detecteur mouvement', device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'XM194070326663736V0001A9000003', name: 'Ogemray Chauffe eau', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '543204412b0c', name: 'PC_Informatique', device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'XB154411473774089', name: 'PORTE BUREAU', device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'XLQq6M4NeBGdBpyv8jAbVxk', name: "Porte d'entree", device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'XB14224779725912', name: "Porte d'entree principale", device_family: 'ETAT', site: 'Ma Maison' },
  { device_id: 'b0b21c195c18', name: 'Television', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: 'b0b21c194194', name: 'Ventilo Air Flux 40W_Chambre', device_family: 'ENERGIE_1PH', site: 'Ma Maison' },
  { device_id: '206ef102b9c4', name: '1) Box Wifi', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34987a68c520', name: '1) Prise 1', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34987a68c520_1', name: '2) Prise 2', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '206ef102b9c4_1', name: '2) Tele', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34987a68c520_2', name: '3) Prise 3', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '206ef102b9c4_2', name: '3) Woyofal', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '206ef102b9c4_3', name: '4) Camera', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34987a68c520_3', name: '4) Prise 4', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '08f9e0ea7d94', name: 'Cafeteria_TD RDC', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: '08f9e051dfa2', name: 'Charges_TD niveau 2', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: '441d6475d44c', name: 'Compteur 2', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: 'XB61819871591476', name: 'Detecteur ouverture porte', device_family: 'ETAT', site: 'Académie CER2E' },
  { device_id: 'XB106582486828237', name: 'Detecteur Ouverture porte', device_family: 'ETAT', site: 'Académie CER2E' },
  { device_id: '54320452d75c', name: 'Frigo Cuisine', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: 'XB137192906331245', name: 'HT Bureau CER2E', device_family: 'CAPTEUR_ENV', site: 'Académie CER2E' },
  { device_id: 'ecda3bc4efb4', name: 'Lampe Bureau', device_family: 'ETAT', site: 'Académie CER2E' },
  { device_id: '34945479ca1a', name: 'Lampe Shelly', device_family: 'LUMIERE', site: 'Académie CER2E' },
  { device_id: '08f9e0e8d774', name: 'M1_SENELEC', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: '483fdac3b59d', name: 'M2_SELECTEUR PV/SENELEC', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: '483fdac3d79c', name: 'M3_CHARGE_CONSOMMATION', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: '08f9e0e4d080', name: 'M4_Groupe electrogene', device_family: 'ENERGIE_2PH', site: 'Académie CER2E' },
  { device_id: '08f9e0e4d080_1', name: 'M4_Groupe electrogene (canal 2)', device_family: 'ENERGIE_2PH', site: 'Académie CER2E' },
  { device_id: '8cbfea9705f4', name: 'PC INFORMATIQUE', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '08f9e047b1b2', name: 'PV_BUILDING COMMUNAL', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: 'ecda3bc06554', name: 'Simple Allumage', device_family: 'ETAT', site: 'Académie CER2E' },
  { device_id: '08f9e0e82db0', name: 'TGBT_EPT Thies', device_family: 'ENERGIE_3PH', site: 'Académie CER2E' },
  { device_id: 'c8c9a325a225', name: 'Variateur', device_family: 'LUMIERE', site: 'Académie CER2E' },
  { device_id: '543204ba4b18', name: 'Ventilo a partir du 04/12/2025', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34b7da8a47a0', name: 'Eclairage Disjoncteur 1', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '34b7da8a4aa0', name: 'Eclairage Disjoncteur 2', device_family: 'ENERGIE_1PH', site: 'Académie CER2E' },
  { device_id: '1720017229409', name: 'Appareil inconnu (fantome)', device_family: 'ETAT', site: 'Académie CER2E' },
  { device_id: 'XB61819871591478', name: "Capteur d'ouverture de portes", device_family: 'ETAT', site: 'Donsin' },
  { device_id: 'XB211299189491624', name: 'Station meteo_Donsin', device_family: 'CAPTEUR_ENV', site: 'Donsin' },
  { device_id: '5432045b35d0', name: 'Shelly H&T_Donsin', device_family: 'CAPTEUR_ENV', site: 'Donsin' },
  { device_id: '0892724e2c28', name: 'Shelly Plug M_Donsin', device_family: 'ENERGIE_1PH', site: 'Donsin' },
];

export async function fetchDisponibles(): Promise<DisponiblesResult> {
  try {
    const sitesSet    = new Set<string>();
    const familiesSet = new Set<string>();
    const roomsSet    = new Set<string>();
    const deviceMap   = new Map<string, DisponiblesResult['devices'][number]>();

    // Catalogue live : une ligne par appareil avec ses métadonnées les plus
    // récentes (vue shelly_devices_catalog). KNOWN_SHELLY_DEVICES ne sert plus
    // que de filet si la vue est indisponible : cette liste codée en dur ne
    // suit ni les renommages ni les changements de site côté Shelly Cloud
    // (ex. 441d6475d44c = "Arrivée générale"/Donsin, listé "Compteur 2"/Académie).
    const { data: catalogData, error: catalogError } = await supabase
      .from('shelly_devices_catalog')
      .select('device_id,name,site,room,device_family');
    if (catalogError) throw catalogError;

    const catalogue = (catalogData ?? []) as DisponiblesResult['devices'];
    const source = catalogue.length > 0 ? catalogue : KNOWN_SHELLY_DEVICES;

    for (const r of source) {
      if (r.site)          sitesSet.add(r.site);
      if (r.device_family) familiesSet.add(r.device_family);
      const room = r.room ?? null;
      if (room) roomsSet.add(room);
      if (r.device_id && !deviceMap.has(r.device_id)) {
        deviceMap.set(r.device_id, {
          name:          r.name          ?? r.device_id,
          device_id:     r.device_id,
          device_family: r.device_family ?? '',
          site:          r.site          ?? '',
          room,
        });
      }
    }

    return {
      sites:          Array.from(sitesSet).sort(),
      devices:        Array.from(deviceMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      deviceFamilies: Array.from(familiesSet).sort(),
      rooms:          Array.from(roomsSet).sort(),
    };
  } catch {
    return { sites: [], devices: [], deviceFamilies: [], rooms: [] };
  }
}

// ── Colonnes regroupées pour l'UI ─────────────────────────────
export function getColonnesParGroupe() {
  return {
    entree:      COLONNES_PROFIL_SHELLY.filter(c => c.groupe === 'entree'),
    calcule:     COLONNES_PROFIL_SHELLY.filter(c => c.groupe === 'calcule'),
    classifieur: COLONNES_PROFIL_SHELLY.filter(c => c.groupe === 'classifieur'),
  };
}
