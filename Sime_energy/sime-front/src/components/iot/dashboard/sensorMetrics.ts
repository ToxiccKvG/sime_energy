// ============================================================
// Dashboard IOT — Registre des grandeurs capteur
//
// Une seule définition par grandeur, partagée par la carte (tuiles)
// et la popup de détail. Remplace le bloc JSX dupliqué qui décidait
// des tuiles via `isWeatherStation` : un capteur affiche désormais
// exactement les grandeurs qu'il mesure, ni plus ni moins.
// ============================================================

import type { ShellyClRow } from '@/lib/iot-dashboard-service';
import type { SensorHourPoint } from '@/lib/iot-sensor-detail-service';

export type MetricKey =
  | 'temperature' | 'humidity' | 'feels_like' | 'uv'
  | 'lux' | 'wind' | 'pressure' | 'rain' | 'dew';

export interface SensorMetric {
  key: MetricKey;
  label: string;
  labelCourt: string;
  unite: string;
  /** Couleur d'accent (tuile, courbe). */
  couleur: string;
  /** Classes Tailwind du fond de tuile. */
  fond: string;
  texte: string;
  decimales: number;
  /** Valeur instantanée depuis le snapshot. */
  valeur: (r: ShellyClRow) => number | null;
  /** Moyenne horaire, pour la courbe 24 h. */
  moyenne: (p: SensorHourPoint) => number | null;
  /** Extremum horaire, quand la table l'agrège. */
  min?: (p: SensorHourPoint) => number | null;
  max?: (p: SensorHourPoint) => number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

export const SENSOR_METRICS: SensorMetric[] = [
  {
    key: 'temperature', label: 'Température', labelCourt: 'Temp.', unite: '°C',
    couleur: '#60a5fa', fond: 'bg-blue-500/10', texte: 'text-blue-300', decimales: 1,
    valeur: r => num(r.temperature),
    moyenne: p => num(p.temperature_moy),
    min: p => num(p.temperature_min),
    max: p => num(p.temperature_max),
  },
  {
    key: 'humidity', label: 'Humidité', labelCourt: 'Hum.', unite: '%',
    couleur: '#22d3ee', fond: 'bg-cyan-500/10', texte: 'text-cyan-300', decimales: 0,
    valeur: r => num(r.humidity),
    moyenne: p => num(p.humidity_moy),
  },
  {
    key: 'feels_like', label: 'Température ressentie', labelCourt: 'Ressenti', unite: '°C',
    couleur: '#fb923c', fond: 'bg-orange-500/10', texte: 'text-orange-300', decimales: 1,
    valeur: r => num(r.feels_like_c),
    moyenne: p => num(p.feels_like_c_moy),
  },
  {
    key: 'uv', label: 'Indice UV', labelCourt: 'UV', unite: '',
    couleur: '#facc15', fond: 'bg-yellow-500/10', texte: 'text-yellow-300', decimales: 0,
    valeur: r => num(r.uv_index),
    moyenne: p => num(p.uv_index_moy),
    max: p => num(p.uv_index_max),
  },
  {
    key: 'lux', label: 'Luminosité', labelCourt: 'Luminosité', unite: 'lx',
    couleur: '#fbbf24', fond: 'bg-amber-500/10', texte: 'text-amber-300', decimales: 0,
    valeur: r => num(r.illuminance_lux),
    moyenne: p => num(p.illuminance_lux_moy),
    max: p => num(p.illuminance_lux_max),
  },
  {
    // Shelly renvoie des m/s ; l'affichage est en km/h depuis toujours.
    key: 'wind', label: 'Vitesse du vent', labelCourt: 'Vent', unite: 'km/h',
    couleur: '#38bdf8', fond: 'bg-sky-500/10', texte: 'text-sky-300', decimales: 1,
    valeur: r => { const v = num(r.wind_speed_ms); return v == null ? null : v * 3.6; },
    moyenne: p => { const v = num(p.wind_speed_ms_moy); return v == null ? null : v * 3.6; },
    max: p => { const v = num(p.wind_gust_ms_max); return v == null ? null : v * 3.6; },
  },
  {
    key: 'pressure', label: 'Pression atmosphérique', labelCourt: 'Pression', unite: 'hPa',
    couleur: '#a78bfa', fond: 'bg-violet-500/10', texte: 'text-violet-300', decimales: 0,
    valeur: r => num(r.pressure_hpa),
    moyenne: p => num(p.pressure_hpa_moy),
  },
  {
    key: 'rain', label: 'Précipitations', labelCourt: 'Pluie', unite: 'mm',
    couleur: '#60a5fa', fond: 'bg-blue-500/10', texte: 'text-blue-300', decimales: 1,
    valeur: r => num(r.precipitation_mm),
    moyenne: p => num(p.precipitation_mm),
  },
  {
    key: 'dew', label: 'Point de rosée', labelCourt: 'Rosée', unite: '°C',
    couleur: '#2dd4bf', fond: 'bg-teal-500/10', texte: 'text-teal-300', decimales: 1,
    valeur: r => num(r.dewpoint_c),
    moyenne: p => num(p.dewpoint_c_moy),
  },
];

/** Grandeurs réellement mesurées par ce capteur — les autres ne sont pas affichées. */
export function metriquesDisponibles(r: ShellyClRow): SensorMetric[] {
  return SENSOR_METRICS.filter(m => m.valeur(r) != null);
}

export function formatValeur(m: SensorMetric, v: number | null): string {
  if (v == null) return '—';
  // La luminosité monte à 100 000 lx en plein soleil : on abrège au-delà du millier.
  if (m.key === 'lux' && v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
  return v.toFixed(m.decimales).replace('.', ',');
}
