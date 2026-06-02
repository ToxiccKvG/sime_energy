/**
 * meteo-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Open-Meteo integration — 100% gratuit, sans clé API, sans backend proxy.
 * Tous les appels sont des fetch() directs depuis le navigateur vers Open-Meteo.
 *
 * APIs utilisées :
 *   Geocoding : https://geocoding-api.open-meteo.com/v1/search
 *   Archive   : https://archive-api.open-meteo.com/v1/archive
 *     → Daily   : données journalières (n'importe quelle plage)
 *     → Hourly  : données horaires (recommandé pour ≤ 14 jours)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoLocation {
  id: number;
  name: string;
  country: string;
  admin1?: string;  // région / état
  admin2?: string;  // département
  latitude: number;
  longitude: number;
  timezone: string;
  population?: number;
  elevation?: number;
}

export interface MeteoSettings {
  location: GeoLocation;
  monthly_temps: number[];    // 12 valeurs [Jan..Déc] en °C
  comfort_threshold: number;  // température intérieure cible (°C)
  coef_c: number;             // coefficient isolation BTU
  coef_g: number;             // coefficient vitrage/murs BTU
  fetched_at?: string;        // ISO date du dernier fetch API
}

/** Un enregistrement météo pour un pas de temps (jour ou heure) */
export interface WeatherRecord {
  time: string;
  temperature_2m_mean?:        number | null;
  temperature_2m_max?:         number | null;
  temperature_2m_min?:         number | null;
  relative_humidity_2m_mean?:  number | null;
  precipitation_sum?:          number | null;
  shortwave_radiation_sum?:    number | null;
  windspeed_10m_mean?:         number | null;
  windgusts_10m_max?:          number | null;
  cloudcover_mean?:            number | null;
  et0_fao_evapotranspiration?: number | null;
  // horaires uniquement
  temperature_2m?:             number | null;
  relative_humidity_2m?:       number | null;
  windspeed_10m?:              number | null;
  shortwave_radiation?:        number | null;
  precipitation?:              number | null;
  cloudcover?:                 number | null;
}

export interface WeatherResult {
  granularity: 'daily' | 'hourly';
  location: { latitude: number; longitude: number; timezone: string; elevation: number };
  records: WeatherRecord[];
  variables: string[];
}

// ─── Variables disponibles ────────────────────────────────────────────────────

export interface VariableMeta {
  key: string;
  keyHourly?: string;   // nom de la variable dans l'API horaire (si différent)
  label: string;
  unit: string;
  color: string;
  yAxis: 'temp' | 'percent' | 'radiation' | 'wind' | 'precip';
  description: string;
}

export const DAILY_VARIABLES: VariableMeta[] = [
  {
    key: 'temperature_2m_mean',
    label: 'T° Moyenne',
    unit: '°C',
    color: '#f59e0b',
    yAxis: 'temp',
    description: 'Température moyenne journalière à 2m',
  },
  {
    key: 'temperature_2m_max',
    label: 'T° Maximale',
    unit: '°C',
    color: '#ef4444',
    yAxis: 'temp',
    description: 'Température maximale journalière à 2m',
  },
  {
    key: 'temperature_2m_min',
    label: 'T° Minimale',
    unit: '°C',
    color: '#3b82f6',
    yAxis: 'temp',
    description: 'Température minimale journalière à 2m',
  },
  {
    key: 'relative_humidity_2m_mean',
    keyHourly: 'relative_humidity_2m',
    label: 'Humidité relative',
    unit: '%',
    color: '#06b6d4',
    yAxis: 'percent',
    description: 'Humidité relative moyenne à 2m',
  },
  {
    key: 'precipitation_sum',
    keyHourly: 'precipitation',
    label: 'Précipitations',
    unit: 'mm',
    color: '#2563eb',
    yAxis: 'precip',
    description: 'Cumul journalier des précipitations',
  },
  {
    key: 'shortwave_radiation_sum',
    keyHourly: 'shortwave_radiation',
    label: 'Radiation solaire',
    unit: 'MJ/m²',
    color: '#eab308',
    yAxis: 'radiation',
    description: 'Rayonnement solaire global journalier (GHI)',
  },
  {
    key: 'windspeed_10m_mean',
    keyHourly: 'windspeed_10m',
    label: 'Vent moyen',
    unit: 'km/h',
    color: '#8b5cf6',
    yAxis: 'wind',
    description: 'Vitesse moyenne du vent à 10m',
  },
  {
    key: 'windgusts_10m_max',
    label: 'Rafales max',
    unit: 'km/h',
    color: '#a78bfa',
    yAxis: 'wind',
    description: 'Rafales maximales journalières à 10m',
  },
  {
    key: 'cloudcover_mean',
    keyHourly: 'cloudcover',
    label: 'Couverture nuageuse',
    unit: '%',
    color: '#64748b',
    yAxis: 'percent',
    description: 'Couverture nuageuse moyenne journalière',
  },
  {
    key: 'et0_fao_evapotranspiration',
    label: 'Évapotranspiration',
    unit: 'mm',
    color: '#10b981',
    yAxis: 'precip',
    description: 'Évapotranspiration de référence FAO-56',
  },
];

/** Variables disponibles en mode horaire */
export const HOURLY_VARIABLES: VariableMeta[] = [
  {
    key: 'temperature_2m',
    label: 'Température',
    unit: '°C',
    color: '#f59e0b',
    yAxis: 'temp',
    description: 'Température à 2m (horaire)',
  },
  {
    key: 'relative_humidity_2m',
    label: 'Humidité relative',
    unit: '%',
    color: '#06b6d4',
    yAxis: 'percent',
    description: 'Humidité relative à 2m (horaire)',
  },
  {
    key: 'shortwave_radiation',
    label: 'Radiation solaire',
    unit: 'W/m²',
    color: '#eab308',
    yAxis: 'radiation',
    description: 'Rayonnement solaire global instantané (W/m²)',
  },
  {
    key: 'windspeed_10m',
    label: 'Vent',
    unit: 'km/h',
    color: '#8b5cf6',
    yAxis: 'wind',
    description: 'Vitesse du vent à 10m (horaire)',
  },
  {
    key: 'precipitation',
    label: 'Précipitations',
    unit: 'mm',
    color: '#2563eb',
    yAxis: 'precip',
    description: 'Précipitations horaires',
  },
  {
    key: 'cloudcover',
    label: 'Couverture nuageuse',
    unit: '%',
    color: '#64748b',
    yAxis: 'percent',
    description: 'Couverture nuageuse (horaire)',
  },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_METEO_SETTINGS: MeteoSettings = {
  location: {
    id: 2253354,
    name: 'Dakar',
    country: 'Sénégal',
    admin1: 'Dakar',
    latitude: 14.6928,
    longitude: -17.4467,
    timezone: 'Africa/Dakar',
    elevation: 22,
  },
  monthly_temps: [24.2, 24.1, 25.1, 26.0, 27.7, 29.5, 30.2, 30.1, 30.5, 30.0, 27.8, 25.0],
  comfort_threshold: 24,
  coef_c: 0.8,
  coef_g: 1.2,
};

// ─── Geocoding ────────────────────────────────────────────────────────────────

/**
 * Recherche de villes par nom.
 * Source : Open-Meteo Geocoding API (gratuit, sans clé).
 * Retourne jusqu'à 10 résultats triés par population.
 */
export async function searchLocations(query: string): Promise<GeoLocation[]> {
  if (!query || query.trim().length < 2) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(query.trim())}` +
    `&count=10&language=fr&format=json`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Geocoding: HTTP ${res.status}`);

  const data = await res.json();
  return (data.results ?? []).map((r: any): GeoLocation => ({
    id:         r.id,
    name:       r.name,
    country:    r.country   ?? '',
    admin1:     r.admin1,
    admin2:     r.admin2,
    latitude:   r.latitude,
    longitude:  r.longitude,
    timezone:   r.timezone  ?? 'UTC',
    population: r.population,
    elevation:  r.elevation,
  }));
}

// ─── Archive météo ────────────────────────────────────────────────────────────

/**
 * Récupère les données météo pour une plage de dates depuis Open-Meteo Archive.
 *
 * @param lat         Latitude de la localité
 * @param lng         Longitude de la localité
 * @param startDate   Date de début (YYYY-MM-DD)
 * @param endDate     Date de fin   (YYYY-MM-DD)
 * @param variableKeys  Clés des variables à récupérer (voir DAILY_VARIABLES)
 * @param granularity 'daily' | 'hourly'
 *
 * Note: L'API Archive couvre jusqu'à ~5 jours avant aujourd'hui.
 * Pour des données récentes (<5j), utiliser l'API Forecast.
 */
export async function fetchWeatherRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  variableKeys: string[],
  granularity: 'daily' | 'hourly' = 'daily',
): Promise<WeatherResult> {
  if (variableKeys.length === 0) throw new Error('Aucune variable sélectionnée');

  const varStr = variableKeys.join(',');
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&${granularity}=${varStr}` +
    `&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Archive API: HTTP ${res.status}${text ? ` — ${text.slice(0, 120)}` : ''}`);
  }

  const data = await res.json();

  // Reconstruct records: one object per time step
  const raw = data[granularity] ?? {};
  const times: string[] = raw.time ?? [];

  const records: WeatherRecord[] = times.map((t, i) => {
    const rec: WeatherRecord = { time: t };
    for (const key of variableKeys) {
      (rec as any)[key] = raw[key]?.[i] ?? null;
    }
    return rec;
  });

  return {
    granularity,
    location: {
      latitude:  data.latitude,
      longitude: data.longitude,
      timezone:  data.timezone,
      elevation: data.elevation ?? 0,
    },
    records,
    variables: variableKeys,
  };
}

// ─── Monthly averages (for configuration) ────────────────────────────────────

/**
 * Calcule les 12 températures mensuelles moyennes (Jan–Déc)
 * à partir des 3 dernières années de données d'archive.
 * Source : Open-Meteo Archive — temperature_2m_mean.
 */
export async function fetchMonthlyTemps(lat: number, lng: number): Promise<number[]> {
  const endDate = new Date();
  endDate.setDate(1);
  endDate.setDate(endDate.getDate() - 1); // dernier jour du mois précédent

  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 3);

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const result = await fetchWeatherRange(
    lat, lng,
    fmt(startDate), fmt(endDate),
    ['temperature_2m_mean'],
    'daily',
  );

  const sums   = new Array(12).fill(0);
  const counts = new Array(12).fill(0);

  result.records.forEach(r => {
    const v = r.temperature_2m_mean;
    if (v == null || isNaN(v)) return;
    const month = parseInt(r.time.split('-')[1], 10) - 1; // 0-indexed
    sums[month]   += v;
    counts[month] += 1;
  });

  return sums.map((s, i) =>
    counts[i] > 0 ? Math.round((s / counts[i]) * 10) / 10 : 25,
  );
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

export function computeDJU(records: WeatherRecord[], baseTemp = 18) {
  let djc = 0, djf = 0;
  for (const r of records) {
    const t = r.temperature_2m_mean;
    if (t == null || isNaN(t)) continue;
    djc += Math.max(0, baseTemp - t);
    djf += Math.max(0, t - baseTemp);
  }
  return {
    djc: Math.round(djc * 10) / 10,
    djf: Math.round(djf * 10) / 10,
  };
}

export function computeStats(records: WeatherRecord[], key: string) {
  const values = records
    .map(r => (r as any)[key] as number | null)
    .filter((v): v is number => v != null && !isNaN(v));

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min:  Math.round(Math.min(...values) * 10) / 10,
    max:  Math.round(Math.max(...values) * 10) / 10,
    mean: Math.round((sum / values.length) * 10) / 10,
    sum:  Math.round(sum * 10) / 10,
    count: values.length,
  };
}
