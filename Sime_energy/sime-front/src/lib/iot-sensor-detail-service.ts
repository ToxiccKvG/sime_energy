// ============================================================
// Service — Historique 24 h d'un capteur (table shelly_cl_horaire)
//
// La popup de détail lit les agrégats horaires plutôt que shelly_cl :
// 24 lignes au lieu de ~1 440 relevés à la minute, et les extrêmes du
// jour se déduisent des colonnes temperature_min/max déjà calculées
// par fn_aggregate_horaire_env (migration 20260828).
//
// La vue shelly_cl_journalier existe aussi, mais elle ré-agrège la
// table brute à chaque appel — inutilement coûteux pour un capteur.
// ============================================================

import { supabase } from '@/lib/supabase';

export interface SensorHourPoint {
  ts_heure: string;
  temperature_moy: number | null;
  temperature_min: number | null;
  temperature_max: number | null;
  humidity_moy: number | null;
  feels_like_c_moy: number | null;
  dewpoint_c_moy: number | null;
  uv_index_moy: number | null;
  uv_index_max: number | null;
  illuminance_lux_moy: number | null;
  illuminance_lux_max: number | null;
  pressure_hpa_moy: number | null;
  precipitation_mm: number | null;
  wind_speed_ms_moy: number | null;
  wind_gust_ms_max: number | null;
  battery_level_min: number | null;
  signal_rssi_moy: number | null;
  /** Relevés réellement distincts dans l'heure — révèle un capteur endormi. */
  nb_mesures_env: number | null;
}

const COLONNES =
  'ts_heure,temperature_moy,temperature_min,temperature_max,humidity_moy,' +
  'feels_like_c_moy,dewpoint_c_moy,uv_index_moy,uv_index_max,' +
  'illuminance_lux_moy,illuminance_lux_max,pressure_hpa_moy,precipitation_mm,' +
  'wind_speed_ms_moy,wind_gust_ms_max,battery_level_min,signal_rssi_moy,nb_mesures_env';

// ts_heure est un TIMESTAMP sans fuseau : on compare avec une chaîne sans Z.
function toHoraireTs(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
}

export async function fetchSensorHistory(
  deviceId: string,
  heures = 24,
): Promise<SensorHourPoint[]> {
  const since = toHoraireTs(new Date(Date.now() - heures * 3_600_000).toISOString());
  const { data, error } = await supabase
    .from('shelly_cl_horaire')
    .select(COLONNES)
    .eq('device_id', deviceId)
    .gte('ts_heure', since)
    .order('ts_heure', { ascending: true })
    .limit(heures + 2);
  if (error) throw error;
  return (data ?? []) as unknown as SensorHourPoint[];
}
