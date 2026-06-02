import { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2, Cloud, Wind } from 'lucide-react';
import type { EquipmentSnapshot } from '@/lib/inventory-service';

// ── Senegal-calibrated constants ─────────────────────────────────────────────
// Climate: Sahel/tropical semi-arid — hot year-round, virtually no heating season
const COOLING_THRESHOLD_C = 24; // T_mean > 24°C → clim/confort refroidissement actif
const HEATING_THRESHOLD_C = 18; // T_mean < 18°C → chauffage (rare au Sénégal)
const DEFAULT_LAT = 14.6928;    // Dakar par défaut
const DEFAULT_LON = -17.4467;

const FR_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

// ── Comfort category detection ────────────────────────────────────────────────

const COOLING_KW = ['CLIM', 'CONFORT', 'REFROID', 'FROID', 'CLIMATISA'];
const HEATING_KW = ['CHAUFFAGE', 'CHAUFFE', 'THERM', 'HEAT', 'CHAUF'];
const VENTIL_KW  = ['VENTIL', 'VENTILAT', 'BRASSE', 'BRASSEUR'];

const matchesAny = (name: string, kws: string[]) => {
  const u = name.toUpperCase();
  return kws.some(k => u.includes(k));
};

// ── Weather fetching ──────────────────────────────────────────────────────────

interface MonthData {
  month: string;
  avgTemp: number;
  daysHot: number;
  daysCold: number;
  daysCount: number;
}

async function fetchMonthlyWeather(lat: number, lon: number): Promise<MonthData[]> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start.toISOString().slice(0, 10)}` +
    `&end_date=${end.toISOString().slice(0, 10)}` +
    `&daily=temperature_2m_mean&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Météo indisponible (${res.status})`);
  const data = await res.json();

  type MonthAcc = { sumTemp: number; hot: number; cold: number; count: number };
  const monthly: Record<string, MonthAcc> = {};

  (data.daily?.time as string[] ?? []).forEach((date: string, i: number) => {
    const key = date.slice(0, 7);
    const t: number | null = data.daily?.temperature_2m_mean?.[i] ?? null;
    if (t == null) return;
    if (!monthly[key]) monthly[key] = { sumTemp: 0, hot: 0, cold: 0, count: 0 };
    monthly[key].sumTemp += t;
    monthly[key].count++;
    if (t > COOLING_THRESHOLD_C) monthly[key].hot++;
    if (t < HEATING_THRESHOLD_C) monthly[key].cold++;
  });

  return Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const m = parseInt(key.split('-')[1]) - 1;
      const yr = key.split('-')[0].slice(2);
      return {
        month: `${FR_MONTHS[m]} ${yr}`,
        avgTemp: Math.round((v.sumTemp / v.count) * 10) / 10,
        daysHot: v.hot,
        daysCold: v.cold,
        daysCount: v.count,
      };
    });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WeatherConsumptionVizProps {
  equipment: EquipmentSnapshot[];
  sites: Array<{
    id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
  }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WeatherConsumptionViz({ equipment, sites }: WeatherConsumptionVizProps) {
  const [loading, setLoading] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [error, setError] = useState<string | null>(null);

  const siteWithCoords = sites.find(s => s.latitude != null && s.longitude != null);
  const lat = siteWithCoords?.latitude ?? DEFAULT_LAT;
  const lon = siteWithCoords?.longitude ?? DEFAULT_LON;
  const usedDefault = !siteWithCoords;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchMonthlyWeather(lat, lon)
      .then(setMonthlyData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  const coolingEq = equipment.filter(e => matchesAny(e.categoryName ?? '', COOLING_KW));
  const heatingEq = equipment.filter(e => matchesAny(e.categoryName ?? '', HEATING_KW));
  const ventilEq  = equipment.filter(e => matchesAny(e.categoryName ?? '', VENTIL_KW));
  const allComfortIds = new Set([
    ...coolingEq.map(e => e.id),
    ...heatingEq.map(e => e.id),
    ...ventilEq.map(e => e.id),
  ]);

  const totalCoolingW = coolingEq.reduce((s, e) => s + (e.totalPowerW ?? 0), 0);
  const totalHeatingW = heatingEq.reduce((s, e) => s + (e.totalPowerW ?? 0), 0);
  const totalVentilW  = ventilEq.reduce((s, e) => s + (e.totalPowerW ?? 0), 0);

  // Monthly theoretical kWh
  // Senegal: cooling dominant, ventilation year-round, heating almost never
  // Cooling hours/day: 12h when very hot (avgTemp > 28°C), 8h otherwise
  const chartData = monthlyData.map(m => {
    const coolingHpd = m.avgTemp > 28 ? 12 : 8;
    return {
      month: m.month,
      temp: m.avgTemp,
      'Climatisation (kWh)': Math.round((totalCoolingW / 1000) * m.daysHot * coolingHpd),
      'Ventilation (kWh)':   Math.round((totalVentilW  / 1000) * m.daysCount * 10),
      'Chauffage (kWh)':     Math.round((totalHeatingW / 1000) * m.daysCold * 6),
    };
  });

  return (
    <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200">Confort & Météo</h3>
          </div>
          <p className="text-xs text-slate-500 max-w-lg">
            Consommation théorique mensuelle des équipements de confort selon la température extérieure
            {usedDefault && (
              <span className="text-amber-500/80">
                {' '}— localisation Dakar par défaut (ajoutez GPS à vos sites pour affiner)
              </span>
            )}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap shrink-0">
          {totalCoolingW > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
              Clim {(totalCoolingW / 1000).toFixed(1)} kW
            </span>
          )}
          {totalVentilW > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
              Ventil {(totalVentilW / 1000).toFixed(1)} kW
            </span>
          )}
          {totalHeatingW > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/20">
              Chauf {(totalHeatingW / 1000).toFixed(1)} kW
            </span>
          )}
        </div>
      </div>

      {/* No comfort equipment */}
      {allComfortIds.size === 0 && !loading && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <Wind className="w-6 h-6 mx-auto mb-2 opacity-30" />
          Aucun équipement de confort trouvé (CLIM, VENTILATION, CHAUFFAGE)
          <p className="text-xs mt-1 text-slate-600">
            Vérifiez que vos catégories d'équipements contiennent ces mots-clés
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && allComfortIds.size > 0 && (
        <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement données météo Open-Meteo…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-6 text-red-400 text-xs bg-red-500/5 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {/* Chart */}
      {!loading && !error && allComfortIds.size > 0 && chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis
                yAxisId="kwh"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <YAxis
                yAxisId="temp"
                orientation="right"
                domain={[15, 42]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                label={{ value: '°C', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f111a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) =>
                  name === 'Température (°C)' ? [`${value}°C`, name] : [`${value} kWh`, name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar yAxisId="kwh" dataKey="Climatisation (kWh)" stackId="a" fill="#22d3ee" />
              <Bar yAxisId="kwh" dataKey="Ventilation (kWh)"   stackId="a" fill="#a78bfa" />
              <Bar yAxisId="kwh" dataKey="Chauffage (kWh)"     stackId="a" fill="#fb923c" radius={[2, 2, 0, 0]} />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temp"
                name="Température (°C)"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={{ fill: '#fbbf24', r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-600 text-center">
            Seuil refroidissement {COOLING_THRESHOLD_C}°C · Seuil chauffage {HEATING_THRESHOLD_C}°C ·
            Données Open-Meteo archive (12 derniers mois) · Calibré Sénégal (Dakar)
          </p>
        </>
      )}
    </div>
  );
}
