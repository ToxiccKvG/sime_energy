/**
 * Visualisation des mesures énergétiques.
 *
 * Quatre vues complémentaires, alimentées par les mesures normalisées du backend
 * (/process-file/measures) :
 *   1. Courbe multi-séries  — superposition des grandeurs (P/Q/S, PM/CO₂, phases…)
 *   2. Distribution         — histogramme de la grandeur principale
 *   3. Profil journalier     — heatmap heure × jour de semaine (données infra-jour)
 *   4. Cumul par période     — barres jour / semaine / mois
 *
 * Les séries disponibles sont déduites automatiquement des données : le composant
 * s'adapte donc à n'importe quel capteur sans configuration.
 */

import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { integrateEnergy, type QuantityKind } from '@/services/measurementStats';
import {
  Activity,
  BarChart3,
  CalendarRange,
  Grid3x3,
  LineChart as LineIcon,
  Sigma,
  Zap,
} from 'lucide-react';

interface Measurement {
  timestamp: string;
  consumption?: number;
  [key: string]: any;
}

interface MeasurementChartsProps {
  measurements: Measurement[];
  /** Unité de la grandeur principale (W, kWh, ppm, …) issue des KPIs. */
  unit?: string;
  /** Libellé de la grandeur tracée (ex. "Puissance active", "CO₂"). */
  label?: string;
  /**
   * Nature de la grandeur principale — détermine si un cumul a un sens physique :
   * "power" (W/kW) → intégration temporelle en énergie, "energy" (Wh/kWh) → somme
   * directe, "other" (ppm, °C, %, Hz, V, A…) → aucun cumul (seule la moyenne a un sens).
   */
  quantityKind?: QuantityKind;
}

type ViewMode = 'curve' | 'distribution' | 'profile' | 'period';
type Granularity = 'day' | 'week' | 'month';

/** Champs techniques jamais proposés comme série. */
const HIDDEN_KEYS = new Set(['timestamp']);

/** Palette de couleurs pour les séries superposées. */
const PALETTE = [
  'hsl(var(--primary))',
  'hsl(38 92% 50%)',
  'hsl(160 84% 39%)',
  'hsl(280 65% 60%)',
  'hsl(0 84% 60%)',
  'hsl(199 89% 48%)',
  'hsl(48 96% 53%)',
];

/* ------------------------------------------------------------------ helpers */

function parseTs(ts: string): Date {
  return new Date(String(ts).replace(' ', 'T'));
}

/** Unité entre parenthèses en fin de libellé (ex. "P apparente (VA)" → "VA"). Rien = grandeur sans unité (ex. "Cos φ"). */
function extractUnit(label: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(label);
  return m ? m[1] : '';
}

function formatTick(ts: string): string {
  const d = parseTs(ts);
  if (isNaN(d.getTime())) return ts;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function formatValue(v: number, unit = ''): string {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M${unit}`;
  if (abs >= 1000) return `${(v / 1000).toFixed(2)} k${unit}`;
  if (abs > 0 && abs < 1) return `${v.toFixed(2)} ${unit}`;
  return `${v.toFixed(0)} ${unit}`;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* ------------------------------------------------------------------- main */

export function MeasurementCharts({ measurements, unit = '', label = 'Valeur', quantityKind = 'other' }: MeasurementChartsProps) {
  const [mode, setMode] = useState<ViewMode>('curve');

  // Séries numériques disponibles (consommation = grandeur principale en tête).
  const series = useMemo(() => {
    const keys = new Set<string>();
    for (const m of measurements ?? []) {
      for (const [k, v] of Object.entries(m)) {
        if (k === 'timestamp') continue;
        if (typeof v === 'number' && isFinite(v)) keys.add(k);
      }
    }
    const list = Array.from(keys).filter((k) => k === 'consumption' || !HIDDEN_KEYS.has(k));
    list.sort((a, b) => (a === 'consumption' ? -1 : b === 'consumption' ? 1 : 0));
    return list.map((key, i) => ({
      key,
      name: key === 'consumption' ? label : key,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [measurements, label]);

  const primary = series[0]?.key ?? 'consumption';

  const stats = useMemo(() => {
    const points = (measurements ?? [])
      .map((m) => ({ t: parseTs(m.timestamp).getTime(), v: m[primary] }))
      .filter((p): p is { t: number; v: number } => typeof p.v === 'number' && isFinite(p.v) && !isNaN(p.t));
    if (points.length === 0) return null;
    const vals = points.map((p) => p.v);
    const sum = vals.reduce((a, b) => a + b, 0);

    // Un cumul n'a un sens physique que pour la grandeur principale : intégration
    // temporelle pour une puissance (→ énergie), somme directe pour une énergie
    // déjà cumulable. Pour toute autre grandeur (température, %, ppm, Hz, V, A,
    // Cos φ…), il n'y a rien de physiquement valide à cumuler.
    let total: number | null = null;
    let totalUnit = unit;
    if (primary === 'consumption') {
      if (quantityKind === 'power') {
        total = integrateEnergy(points);
        totalUnit = unit ? `${unit}h` : '';
      } else if (quantityKind === 'energy') {
        total = sum;
      }
    }

    return {
      count: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
      total,
      totalUnit,
      hasInjection: vals.some((v) => v < 0),
    };
  }, [measurements, primary, quantityKind, unit]);

  if (!measurements || measurements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">Aucune mesure à visualiser</p>
        <p className="text-xs mt-1">Uploadez un fichier dans l'onglet « Upload » pour générer les graphiques.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bandeau KPIs rapides */}
      {stats && (
        <div className={`grid grid-cols-2 ${stats.total !== null ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
          <StatCard icon={<Activity className="h-4 w-4" />} label="Mesures" value={String(stats.count)} />
          <StatCard icon={<Zap className="h-4 w-4" />} label="Moyenne" value={formatValue(stats.avg, unit)} />
          <StatCard icon={<LineIcon className="h-4 w-4" />} label="Maximum" value={formatValue(stats.max, unit)} />
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Minimum" value={formatValue(stats.min, unit)} />
          {stats.total !== null && (
            <StatCard
              icon={<Sigma className="h-4 w-4" />}
              label={quantityKind === 'power' ? 'Cumul estimé' : 'Total'}
              value={formatValue(stats.total, stats.totalUnit)}
            />
          )}
        </div>
      )}

      {stats?.hasInjection && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚡ Valeurs négatives détectées : injection / retour réseau (production supérieure à la consommation) sur certaines périodes.
        </p>
      )}

      {/* Sélecteur de vue */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <ModeButton active={mode === 'curve'} onClick={() => setMode('curve')} icon={<LineIcon className="h-4 w-4" />}>
          Courbe
        </ModeButton>
        <ModeButton active={mode === 'distribution'} onClick={() => setMode('distribution')} icon={<BarChart3 className="h-4 w-4" />}>
          Distribution
        </ModeButton>
        <ModeButton active={mode === 'profile'} onClick={() => setMode('profile')} icon={<Grid3x3 className="h-4 w-4" />}>
          Profil journalier
        </ModeButton>
        <ModeButton active={mode === 'period'} onClick={() => setMode('period')} icon={<CalendarRange className="h-4 w-4" />}>
          Par période
        </ModeButton>
      </div>

      <Card className="p-4">
        {mode === 'curve' && <CurveView measurements={measurements} series={series} unit={unit} />}
        {mode === 'distribution' && <DistributionView measurements={measurements} primary={primary} label={label} unit={unit} />}
        {mode === 'profile' && <DailyProfileView measurements={measurements} primary={primary} unit={unit} />}
        {mode === 'period' && (
          <PeriodView
            measurements={measurements}
            primary={primary}
            label={label}
            unit={unit}
            quantityKind={primary === 'consumption' ? quantityKind : 'other'}
          />
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- vue Courbe */

function CurveView({
  measurements,
  series,
  unit,
}: {
  measurements: Measurement[];
  series: { key: string; name: string; color: string }[];
  unit: string;
}) {
  // Par défaut : grandeur principale + éventuellement la 2e série.
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(series.slice(0, 2).map((s) => s.key)),
  );

  const data = useMemo(
    () =>
      measurements.map((m) => {
        const row: Record<string, any> = { label: formatTick(m.timestamp) };
        for (const s of series) row[s.key] = typeof m[s.key] === 'number' ? m[s.key] : null;
        return row;
      }),
    [measurements, series],
  );

  const toggle = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      if (next.size === 0) next.add(key); // garder au moins une série
      return next;
    });

  const shown = series.filter((s) => visible.has(s.key));

  // Chaque grandeur a sa propre unité (ou aucune, ex. Cos φ) — jamais celle de la
  // grandeur principale par défaut.
  const unitByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of series) map.set(s.name, s.key === 'consumption' ? unit : extractUnit(s.name));
    return map;
  }, [series, unit]);

  // Une grandeur en % ou en Hz superposée à une grandeur en kW serait écrasée en
  // ligne plate sur un axe partagé (échelles trop différentes). Chaque unité
  // distincte parmi les séries affichées reçoit donc son propre axe, à l'échelle
  // de ses propres valeurs — seules les 2 premières sont visibles (gauche/droite),
  // les suivantes restent actives mais masquées pour ne pas surcharger le graphique.
  const axisIdFor = (name: string) => unitByName.get(name) || '∅';
  const axisUnits = useMemo(() => {
    const seen: string[] = [];
    for (const s of shown) {
      const id = axisIdFor(s.name);
      if (!seen.includes(id)) seen.push(id);
    }
    return seen;
  }, [shown, unitByName]);

  return (
    <div className="space-y-3">
      {/* Toggles de séries */}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {series.map((s) => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${
                visible.has(s.key) ? 'bg-muted border-transparent' : 'opacity-50 border-border hover:opacity-80'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" fontSize={11} tickLine={false} minTickGap={40} />
          {axisUnits.map((id, i) => (
            <YAxis
              key={id}
              yAxisId={id}
              orientation={i % 2 === 0 ? 'left' : 'right'}
              hide={i > 1}
              domain={['auto', 'auto']}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatValue(Number(v), id === '∅' ? '' : id)}
            />
          ))}
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => `📅 ${l}`}
            formatter={(v: number, n) => [formatValue(Number(v), unitByName.get(String(n)) ?? ''), n]}
          />
          {shown.length > 1 && <Legend />}
          {shown.map((s, i) =>
            i === 0 ? (
              <Area
                key={s.key}
                yAxisId={axisIdFor(s.name)}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                fill="url(#curveFill)"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ) : (
              <Line
                key={s.key}
                yAxisId={axisIdFor(s.name)}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ),
          )}
          <Brush dataKey="label" height={24} stroke="hsl(var(--primary))" travellerWidth={8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------- vue Distribution */

function DistributionView({
  measurements,
  primary,
  label,
  unit,
}: {
  measurements: Measurement[];
  primary: string;
  label: string;
  unit: string;
}) {
  const bins = useMemo(() => {
    const vals = measurements.map((m) => m[primary]).filter((v) => typeof v === 'number' && isFinite(v)) as number[];
    if (vals.length === 0) return [];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return [{ range: formatValue(min, unit), count: vals.length, mid: min }];
    const n = Math.min(20, Math.max(6, Math.ceil(Math.sqrt(vals.length))));
    const width = (max - min) / n;
    const buckets = Array.from({ length: n }, (_, i) => ({
      mid: min + width * (i + 0.5),
      range: `${formatValue(min + width * i, unit)}`,
      count: 0,
    }));
    for (const v of vals) {
      let idx = Math.floor((v - min) / width);
      if (idx >= n) idx = n - 1;
      if (idx < 0) idx = 0;
      buckets[idx].count++;
    }
    return buckets;
  }, [measurements, primary, unit]);

  if (bins.length === 0) return <EmptyHint text="Pas assez de données pour une distribution." />;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Répartition des valeurs de <span className="font-medium text-foreground">{label}</span> — chaque barre = nombre de mesures dans une plage.
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={bins} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" fontSize={10} tickLine={false} minTickGap={20} angle={-25} textAnchor="end" height={50} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${v} mesures`, 'Effectif']}
            labelFormatter={(l) => `≈ ${l} ${unit}`}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ----------------------------------------------------- vue Profil journalier */

function DailyProfileView({ measurements, primary, unit }: { measurements: Measurement[]; primary: string; unit: string }) {
  const { matrix, min, max, subDaily } = useMemo(() => {
    const sum = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const cnt = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const hoursSeen = new Set<number>();
    for (const m of measurements) {
      const v = m[primary];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const d = parseTs(m.timestamp);
      if (isNaN(d.getTime())) continue;
      const wd = (d.getDay() + 6) % 7; // 0 = lundi
      const h = d.getHours();
      hoursSeen.add(h);
      sum[wd][h] += v;
      cnt[wd][h] += 1;
    }
    const matrix = sum.map((row, i) => row.map((s, h) => (cnt[i][h] ? s / cnt[i][h] : null)));
    const flat = matrix.flat().filter((x): x is number => x != null);
    return {
      matrix,
      min: flat.length ? Math.min(...flat) : 0,
      max: flat.length ? Math.max(...flat) : 0,
      subDaily: hoursSeen.size > 1,
    };
  }, [measurements, primary]);

  if (!subDaily) {
    return (
      <EmptyHint text="Ce capteur fournit des données journalières (un point par jour). Le profil heure × jour nécessite des mesures infra-journalières. Utilisez plutôt la vue « Par période »." />
    );
  }

  const color = (v: number | null) => {
    if (v == null) return 'hsl(var(--muted))';
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return `hsl(var(--primary) / ${(0.12 + t * 0.85).toFixed(2)})`;
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Moyenne par heure et jour de semaine — révèle les habitudes (plus c'est foncé, plus la valeur est élevée).
      </p>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex">
            <div className="w-10 shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground min-w-[18px]">
                {h % 3 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>
          {matrix.map((row, wd) => (
            <div key={wd} className="flex items-center">
              <div className="w-10 shrink-0 text-xs text-muted-foreground pr-1 text-right">{WEEKDAYS[wd]}</div>
              {row.map((v, h) => (
                <div
                  key={h}
                  title={v == null ? '—' : `${WEEKDAYS[wd]} ${h}h : ${formatValue(v, unit)}`}
                  className="flex-1 aspect-square min-w-[18px] m-[1px] rounded-sm"
                  style={{ backgroundColor: color(v) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatValue(min, unit)}</span>
        <div className="h-2 w-32 rounded" style={{ background: 'linear-gradient(to right, hsl(var(--primary) / 0.12), hsl(var(--primary)))' }} />
        <span>{formatValue(max, unit)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- vue Par période */

function PeriodView({
  measurements,
  primary,
  label,
  unit,
  quantityKind,
}: {
  measurements: Measurement[];
  primary: string;
  label: string;
  unit: string;
  /** 'other' si `primary` n'est pas la grandeur principale (pas de cumul/moyenne physique connu dans ce cas non plus, mais on affiche quand même la moyenne). */
  quantityKind: QuantityKind;
}) {
  const [gran, setGran] = useState<Granularity>('day');

  // Seule une grandeur cumulable (puissance → intégrée, énergie → sommée) justifie un "Total" ;
  // sinon la seule statistique par période qui ait un sens physique est la moyenne.
  const isCumulative = quantityKind === 'power' || quantityKind === 'energy';
  const periodUnit = quantityKind === 'power' ? (unit ? `${unit}h` : '') : unit;

  const keyOf = (d: Date, g: Granularity): string => {
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    if (g === 'month') return `${y}-${mm}`;
    if (g === 'week') {
      const onejan = new Date(y, 0, 1);
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return `${y}-S${String(week).padStart(2, '0')}`;
    }
    return `${y}-${mm}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const data = useMemo(() => {
    const acc = new Map<string, { t: number; v: number }[]>();
    for (const m of measurements) {
      const v = m[primary];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const d = parseTs(m.timestamp);
      if (isNaN(d.getTime())) continue;
      const k = keyOf(d, gran);
      const pts = acc.get(k) ?? [];
      pts.push({ t: d.getTime(), v });
      acc.set(k, pts);
    }
    return Array.from(acc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, pts]) => {
        let value: number;
        if (quantityKind === 'power') value = integrateEnergy(pts);
        else if (quantityKind === 'energy') value = pts.reduce((s, p) => s + p.v, 0);
        else value = pts.reduce((s, p) => s + p.v, 0) / pts.length;
        return { period: k, value };
      });
  }, [measurements, primary, gran, quantityKind]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {isCumulative ? 'Total' : 'Moyenne'} de <span className="font-medium text-foreground">{label}</span> par période
        </p>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <Button key={g} variant={gran === g ? 'default' : 'ghost'} size="sm" className="h-7 px-2 text-xs" onClick={() => setGran(g)}>
              {g === 'day' ? 'Jour' : g === 'week' ? 'Semaine' : 'Mois'}
            </Button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="period" fontSize={10} tickLine={false} minTickGap={15} angle={-25} textAnchor="end" height={50} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatValue(Number(v), periodUnit)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatValue(Number(v), periodUnit), isCumulative ? 'Total' : 'Moyenne']} labelFormatter={(l) => `📅 ${l}`} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value < 0 ? 'hsl(38 92% 50%)' : 'hsl(var(--primary))'} />
            ))}
          </Bar>
          <Brush dataKey="period" height={22} stroke="hsl(var(--primary))" travellerWidth={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ----------------------------------------------------------------- atomes */

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs" onClick={onClick}>
      <span className="mr-1">{icon}</span>
      {children}
    </Button>
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground">
      <Grid3x3 className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm max-w-md">{text}</p>
    </div>
  );
}
