/**
 * Visualisation des mesures énergétiques (courbe de charge).
 * Trace la puissance / consommation dans le temps à partir des mesures
 * normalisées renvoyées par le backend (/process-file/measures).
 */

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, LineChart as LineIcon, Activity, Zap } from 'lucide-react';

interface Measurement {
  timestamp: string;
  consumption?: number;
  power?: number;
  apparent_power?: number;
  current?: number;
  [key: string]: any;
}

interface MeasurementChartsProps {
  measurements: Measurement[];
  /** Unité de la grandeur principale (W, °C, …) issue des KPIs. */
  unit?: string;
  /** Libellé de la grandeur tracée (ex. "Puissance active", "CO₂"). */
  label?: string;
}

type ChartMode = 'area' | 'bar';

/** Formate un horodatage en libellé court "JJ/MM HH:mm". */
function formatTick(ts: string): string {
  const d = new Date(ts.replace(' ', 'T'));
  if (isNaN(d.getTime())) return ts;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

/** Formate une valeur numérique avec séparateur de milliers. */
function formatValue(v: number, unit = ''): string {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(2)} k${unit}`;
  return `${v.toFixed(0)} ${unit}`;
}

export function MeasurementCharts({ measurements, unit = 'W', label = 'Valeur' }: MeasurementChartsProps) {
  const [mode, setMode] = useState<ChartMode>('area');
  const apparentLabel = 'Valeur secondaire';

  const data = useMemo(
    () =>
      (measurements ?? []).map((m) => ({
        timestamp: m.timestamp,
        label: formatTick(m.timestamp),
        value: typeof m.consumption === 'number' ? m.consumption : (m.power ?? 0),
        apparent: typeof m.apparent_power === 'number' ? m.apparent_power : undefined,
      })),
    [measurements],
  );

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const values = data.map((d) => d.value).filter((v) => typeof v === 'number');
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      hasInjection: values.some((v) => v < 0),
    };
  }, [data]);

  if (!measurements || measurements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">Aucune mesure à visualiser</p>
        <p className="text-xs mt-1">Uploadez un fichier dans l'onglet « Upload » pour générer la courbe de charge.</p>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <div className="space-y-4">
      {/* KPIs rapides au-dessus du graphique */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Activity className="h-4 w-4" />} label="Mesures" value={String(stats.count)} />
          <StatCard icon={<Zap className="h-4 w-4" />} label="Moyenne" value={formatValue(stats.avg, unit)} />
          <StatCard icon={<LineIcon className="h-4 w-4" />} label="Maximum" value={formatValue(stats.max, unit)} />
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Minimum" value={formatValue(stats.min, unit)} />
        </div>
      )}

      {stats?.hasInjection && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚡ Valeurs négatives détectées : injection PV (production solaire supérieure à la consommation) sur certaines périodes.
        </p>
      )}

      {/* Sélecteur de type de graphique */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{label} ({unit})</h3>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={mode === 'area' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setMode('area')}
          >
            <LineIcon className="h-4 w-4 mr-1" /> Courbe
          </Button>
          <Button
            variant={mode === 'bar' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setMode('bar')}
          >
            <BarChart3 className="h-4 w-4 mr-1" /> Barres
          </Button>
        </div>
      </div>

      {/* Graphique principal */}
      <Card className="p-4">
        <ResponsiveContainer width="100%" height={380}>
          {mode === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} tickLine={false} minTickGap={40} />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatValue(Number(v), unit)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name) => [formatValue(Number(v), unit), name === 'value' ? label : apparentLabel]}
                labelFormatter={(l) => `📅 ${l}`}
              />
              {data.some((d) => d.apparent !== undefined) && <Legend />}
              <Area
                type="monotone"
                dataKey="value"
                name={label}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorValue)"
                dot={false}
                isAnimationActive={false}
              />
              {data.some((d) => d.apparent !== undefined) && (
                <Line
                  type="monotone"
                  dataKey="apparent"
                  name={apparentLabel}
                  stroke="hsl(var(--warning, 38 92% 50%))"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Brush dataKey="label" height={24} stroke="hsl(var(--primary))" travellerWidth={8} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} tickLine={false} minTickGap={40} />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatValue(Number(v), unit)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [formatValue(Number(v), unit), label]}
                labelFormatter={(l) => `📅 ${l}`}
              />
              <Bar dataKey="value" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.value < 0 ? 'hsl(38 92% 50%)' : 'hsl(var(--primary))'} />
                ))}
              </Bar>
              <Brush dataKey="label" height={24} stroke="hsl(var(--primary))" travellerWidth={8} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
