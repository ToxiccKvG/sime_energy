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
  const points = (data ?? []) as unknown as SensorHourPoint[];

  // precipitation_mm horaire = compteur CUMULATIF de la station : on le remplace
  // par la pluie tombée dans chaque heure, recalculée depuis les relevés bruts
  // (shelly_cl) : l'heure en cours est à jour, sans attendre l'agrégation.
  const { data: brut, error: errPluie } = await supabase
    .from('shelly_cl')
    .select('ts,precipitation_mm')
    .eq('device_id', deviceId)
    .not('precipitation_mm', 'is', null)
    .gte('ts', new Date(Date.now() - heures * 3_600_000).toISOString())
    .order('ts', { ascending: true })
    .limit(5000);
  if (errPluie) throw errPluie;
  if (brut && brut.length > 0) {
    const { data: avant } = await supabase
      .from('shelly_cl')
      .select('precipitation_mm')
      .eq('device_id', deviceId)
      .not('precipitation_mm', 'is', null)
      .lt('ts', new Date(Date.now() - heures * 3_600_000).toISOString())
      .order('ts', { ascending: false })
      .limit(1);
    const cle = (t: string) => t.replace(' ', 'T').slice(0, 13);
    const cumulParHeure = new Map<string, number>();
    for (const r of brut) {
      const k = cle(new Date(r.ts as string).toISOString());
      cumulParHeure.set(k, Math.max(cumulParHeure.get(k) ?? -Infinity, r.precipitation_mm as number));
    }
    const pluieParHeure = new Map<string, number | null>();
    let prec: number | null = (avant?.[0]?.precipitation_mm as number | undefined) ?? null;
    for (const [k, cumul] of cumulParHeure) {          // ordre chronologique conservé
      pluieParHeure.set(k, prec == null ? null : Math.round((cumul >= prec ? cumul - prec : cumul) * 10) / 10);
      prec = cumul;
    }
    for (const p of points) p.precipitation_mm = pluieParHeure.get(cle(p.ts_heure)) ?? null;
  }
  return points;
}

/**
 * Pluie tombée depuis minuit UTC (= heure locale à Dakar/Ouagadougou) pour des
 * stations dont `precipitation_mm` est un compteur cumulatif depuis l'installation.
 * Référence = dernier relevé avant minuit (la station est muette la nuit : la
 * pluie nocturne est ainsi comptée), à défaut le premier relevé du jour.
 * Compteur qui diminue = remise à zéro → la pluie est la valeur courante.
 */
export async function fetchPluieDuJour(
  stations: { device_id: string; cumul_mm: number }[],
): Promise<Map<string, number>> {
  const minuit = new Date();
  minuit.setUTCHours(0, 0, 0, 0);
  const iso = minuit.toISOString();
  const out = new Map<string, number>();
  await Promise.all(stations.map(async ({ device_id, cumul_mm }) => {
    const base = () => supabase.from('shelly_cl').select('precipitation_mm')
      .eq('device_id', device_id).not('precipitation_mm', 'is', null).limit(1);
    let { data } = await base().lt('ts', iso).order('ts', { ascending: false });
    if (!data?.length) ({ data } = await base().gte('ts', iso).order('ts', { ascending: true }));
    const ref = data?.[0]?.precipitation_mm as number | undefined;
    if (ref == null) return;
    out.set(device_id, Math.round((cumul_mm >= ref ? cumul_mm - ref : cumul_mm) * 10) / 10);
  }));
  return out;
}
