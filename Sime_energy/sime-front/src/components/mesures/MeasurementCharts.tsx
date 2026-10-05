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

import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { isHoverArtifact } from '@/lib/chart-export';
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { integrateEnergy, type QuantityKind } from '@/services/measurementStats';
import { useToast } from '@/hooks/use-toast';
import { PeriodFilter, dayRangeOf, filterByRange, singleDayOf, toDatetimeLocalValue, useTimestampBounds, type DateRange } from './MeasurementPeriodFilter';
import { ChartOptions } from '@/components/shared/ChartOptions';
import { formatQuantity, useUnitSettings } from '@/lib/unit-format';
import { useChartPreferences, usePalette, seriesColor, chartTitle, heatColor, type Palette } from '@/lib/chart-preferences';
import {
  Activity,
  BarChart3,
  PieChart as PieIcon,
  CalendarRange,
  Grid3x3,
  Image as ImageIcon,
  LineChart as LineIcon,
  Loader2,
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
  /** Nom du relevé (titre de l'image exportée). */
  title?: string;
  /**
   * Tous les relevés de la session, pour la vue Répartition : dans ce module
   * un relevé = un appareil, donc la part qui intéresse l'auditeur est celle
   * de chaque appareil dans l'ensemble, pas celle des colonnes d'un relevé.
   */
  siblings?: { label: string; measurements: Measurement[]; unit?: string; quantityKind?: QuantityKind }[];
  /** Plage de période contrôlée par le parent (partagée avec l'onglet Analyse). Sinon, état local. */
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
}

type ViewMode = 'curve' | 'distribution' | 'profile' | 'period' | 'repartition';

const MODE_LABELS: Record<ViewMode, string> = {
  curve: 'Courbe',
  distribution: 'Distribution',
  profile: 'Profil journalier',
  period: 'Par période',
  repartition: 'Répartition',
};
type Granularity = 'day' | 'week' | 'month';

/** Champs techniques jamais proposés comme série. */
const HIDDEN_KEYS = new Set(['timestamp']);



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

/**
 * Écriture des valeurs : déléguée à lib/unit-format, seule source de vérité
 * partagée avec les cartes d'indicateurs et les exports. Avant, ce fichier
 * mettait à l'échelle et les cartes non — même relevé, deux écritures.
 */
function formatValue(v: number, unit = ''): string {
  return formatQuantity(v, unit);
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* ------------------------------------------------------------------- main */

export function MeasurementCharts({
  measurements: allMeasurements, unit = '', label = 'Valeur', quantityKind = 'other', title,
  siblings, dateRange: controlledRange, onDateRangeChange,
}: MeasurementChartsProps) {
  const [mode, setMode] = useState<ViewMode>('curve');
  const prefs = useChartPreferences();
  const palette = usePalette();
  // Abonnement au réglage d'unité : formatQuantity lit l'état courant, encore
  // faut-il que le composant se redessine quand il change.
  useUnitSettings();
  const [localRange, setLocalRange] = useState<DateRange>(null);
  const [exporting, setExporting] = useState(false);
  // Rapports et impression : image sur fond blanc, avec le thème clair (le thème sombre rend le texte invisible sur blanc).
  const [whiteBg, setWhiteBg] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isControlled = controlledRange !== undefined;
  const dateRange: DateRange = isControlled ? controlledRange : localRange;
  const setDateRange = (range: DateRange) => {
    if (isControlled) onDateRangeChange?.(range); else setLocalRange(range);
  };

  // Filtre de période appliqué à toutes les vues (même plage que l'onglet Analyse).
  const bounds = useTimestampBounds(allMeasurements ?? []);
  const measurements = useMemo(
    () => filterByRange(allMeasurements ?? [], dateRange, bounds),
    [allMeasurements, dateRange, bounds],
  );
  const activeDay = singleDayOf(dateRange);

  // Descente au détail : un jour cliqué dans la vue « Par période » devient la période, vue Courbe.
  const drillToDay = (day: string) => {
    setDateRange(dayRangeOf(day));
    setMode('curve');
  };

  const exportImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, logging: false, useCORS: true,
        ignoreElements: isHoverArtifact,
        backgroundColor: whiteBg ? '#ffffff' : null,
        onclone: (doc) => { if (whiteBg) doc.documentElement.classList.remove('dark'); },
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const slug = (title ?? label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      a.download = `${slug}_${mode}${activeDay ? `_${activeDay}` : ''}.png`;
      a.click();
    } catch (e) {
      toast({ title: 'Export impossible', description: String(e), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

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
      // La grandeur principale porte son unité dans son nom, comme les colonnes secondaires ("P apparente (VA)").
      name: key === 'consumption' ? (unit ? `${label} (${unit})` : label) : key,
      color: seriesColor(palette, i),
    }));
  }, [measurements, label, unit, palette]);

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

  // Titre : celui saisi par l'utilisateur, sinon « relevé · grandeur (unité) · vue ».
  // La Répartition fait exception : elle compare les relevés entre eux, elle ne
  // parle donc pas de la grandeur du relevé courant.
  const autoTitle = mode === 'repartition'
    ? 'Répartition de la consommation'
    : `${title ? `${title} · ` : ''}${label}${unit ? ` (${unit})` : ''} · ${MODE_LABELS[mode]}`;
  const displayTitle = chartTitle(prefs, `mesures:${mode}`, autoTitle);

  if (!allMeasurements || allMeasurements.length === 0) {
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
      {/* Période (partagée avec l'onglet Analyse) */}
      <PeriodFilter bounds={bounds} value={dateRange} onChange={setDateRange} />

      {/* Bandeau KPIs rapides */}
      {measurements.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune mesure sur la période choisie.</p>
      )}
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

      {/* Sélecteur de vue + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <ModeButton active={mode === 'curve'} onClick={() => setMode('curve')} icon={<LineIcon className="h-4 w-4" />}>
          Courbe
        </ModeButton>
        <ModeButton active={mode === 'distribution'} onClick={() => setMode('distribution')} icon={<BarChart3 className="h-4 w-4" />}>
          Distribution
        </ModeButton>
        {/* Répartition : le camembert existait dans IOT, pas ici (demande du 18/09). */}
        <ModeButton active={mode === 'repartition'} onClick={() => setMode('repartition')} icon={<PieIcon className="h-4 w-4" />}>
          Répartition
        </ModeButton>
        <ModeButton active={mode === 'profile'} onClick={() => setMode('profile')} icon={<Grid3x3 className="h-4 w-4" />}>
          Profil journalier
        </ModeButton>
        <ModeButton active={mode === 'period'} onClick={() => setMode('period')} icon={<CalendarRange className="h-4 w-4" />}>
          Par période
        </ModeButton>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ChartOptions chartId={`mesures:${mode}`} defaultTitle={autoTitle} unit={unit} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none" title="Image exportée sur fond blanc, pour les rapports et l'impression">
          <input type="checkbox" className="h-3.5 w-3.5" checked={whiteBg} onChange={(e) => setWhiteBg(e.target.checked)} />
          Fond blanc
        </label>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportImage} disabled={exporting || measurements.length === 0}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
          Exporter en image
        </Button>
      </div>
      </div>

      <Card className="p-4" ref={cardRef}>
        {/* En-tête repris dans l'image exportée */}
        <p className="text-sm font-medium text-foreground mb-0.5">{displayTitle}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {bounds && (
            <>{formatTick(dateRange?.start ?? toDatetimeLocalValue(bounds.min))} → {formatTick(dateRange?.end ?? toDatetimeLocalValue(bounds.max))}</>
          )}
        </p>
        {mode === 'curve' && <CurveView measurements={measurements} series={series} unit={unit} showLegend={prefs.showLegend} />}
        {mode === 'repartition' && (
          <RepartitionView
            measurements={measurements} series={series} unit={unit}
            showLegend={prefs.showLegend} palette={palette} quantityKind={quantityKind}
            siblings={siblings} dateRange={dateRange} bounds={bounds}
          />
        )}
        {mode === 'distribution' && <DistributionView measurements={measurements} primary={primary} label={label} unit={unit} showLegend={prefs.showLegend} color={seriesColor(palette, 0)} />}
        {mode === 'profile' && <DailyProfileView measurements={measurements} primary={primary} unit={unit} palette={palette} />}
        {mode === 'period' && (
          <PeriodView
            measurements={measurements}
            primary={primary}
            label={label}
            unit={unit}
            quantityKind={primary === 'consumption' ? quantityKind : 'other'}
            onDrillDay={drillToDay}
            showLegend={prefs.showLegend}
            color={seriesColor(palette, 0)}
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
  showLegend,
}: {
  showLegend: boolean;
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
            {/* Le remplissage suit la couleur de la 1re série, donc la palette choisie. */}
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={shown[0]?.color ?? 'hsl(var(--primary))'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={shown[0]?.color ?? 'hsl(var(--primary))'} stopOpacity={0} />
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
          {showLegend && shown.length > 1 && <Legend />}
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
  showLegend,
  color,
}: {
  showLegend: boolean;
  color: string;
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
          <XAxis dataKey="range" fontSize={10} tickLine={false} minTickGap={20} angle={-25} textAnchor="end" height={60}
            label={{ value: `${label}${unit ? ` (${unit})` : ''}`, position: 'insideBottom', offset: -2, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false}
            label={{ value: 'Nombre de mesures', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${v} mesures`, 'Effectif']}
            labelFormatter={(l) => `≈ ${l} ${unit}`}
          />
          {showLegend && <Legend />}
          <Bar dataKey="count" name="Nombre de mesures" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ----------------------------------------------------- vue Profil journalier */

function DailyProfileView({ measurements, primary, unit, palette }: { measurements: Measurement[]; primary: string; unit: string; palette: Palette }) {
  // Deux regroupements, parce que les campagnes n'ont pas la même durée :
  //  · « Jour de semaine » révèle les habitudes sur plusieurs semaines
  //    (un compteur qui tourne en continu) ;
  //  · « Par jour » suit une campagne courte — un sonomètre posé deux jours,
  //    un enregistreur H&T sur une semaine — où le lundi/mardi ne veut rien dire.
  const { weekday, calendar, subDaily } = useMemo(() => {
    const wdSum = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const wdCnt = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const byDay = new Map<string, { ts: number; sums: number[]; counts: number[] }>();
    const hoursSeen = new Set<number>();

    for (const m of measurements) {
      const v = m[primary];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const d = parseTs(m.timestamp);
      if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      hoursSeen.add(h);

      const wd = (d.getDay() + 6) % 7; // 0 = lundi
      wdSum[wd][h] += v;
      wdCnt[wd][h] += 1;

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const cur = byDay.get(key) ?? { ts: d.setHours(0, 0, 0, 0), sums: new Array(24).fill(0), counts: new Array(24).fill(0) };
      cur.sums[h] += v;
      cur.counts[h] += 1;
      byDay.set(key, cur);
    }

    const stats = (rows: (number | null)[][]) => {
      const flat = rows.flat().filter((x): x is number => x != null);
      return { min: flat.length ? Math.min(...flat) : 0, max: flat.length ? Math.max(...flat) : 0 };
    };

    const wdRows = wdSum.map((row, i) => row.map((sum, h) => (wdCnt[i][h] ? sum / wdCnt[i][h] : null)));
    const days = [...byDay.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const calRows = days.map(([, { sums, counts }]) => sums.map((sum, h) => (counts[h] ? sum / counts[h] : null)));

    return {
      weekday: { labels: WEEKDAYS, rows: wdRows, ...stats(wdRows) },
      calendar: {
        labels: days.map(([key]) => new Date(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })),
        rows: calRows,
        ...stats(calRows),
      },
      subDaily: hoursSeen.size > 1,
    };
  }, [measurements, primary]);

  // Campagne courte : le jour calendaire parle, le jour de semaine non.
  const [grouping, setGrouping] = useState<'auto' | 'weekday' | 'calendar'>('auto');
  const effective = grouping === 'auto'
    ? (calendar.labels.length > 0 && calendar.labels.length <= 14 ? 'calendar' : 'weekday')
    : grouping;
  const active = effective === 'calendar' ? calendar : weekday;

  if (!subDaily) {
    return (
      <EmptyHint text="Ce capteur fournit des données journalières (un point par jour). Le profil heure × jour nécessite des mesures infra-journalières. Utilisez plutôt la vue « Par période »." />
    );
  }

  // Dégradé repris de la palette choisie (demande du 18/09 : pouvoir passer
  // la carte de chaleur en rouge pour comparer deux relevés).
  const color = (v: number | null) => {
    if (v == null) return 'hsl(var(--muted))';
    const t = active.max === active.min ? 0.5 : (v - active.min) / (active.max - active.min);
    return heatColor(palette, t);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {effective === 'calendar'
            ? `Moyenne par heure, jour par jour — ${calendar.labels.length} jour(s) de mesure.`
            : 'Moyenne par heure et jour de semaine — révèle les habitudes.'}
          {' '}(plus la couleur est vive, plus la valeur est élevée)
        </p>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <ModeButton active={effective === 'calendar'} onClick={() => setGrouping('calendar')} icon={<CalendarRange className="h-3.5 w-3.5" />}>
            Par jour
          </ModeButton>
          <ModeButton active={effective === 'weekday'} onClick={() => setGrouping('weekday')} icon={<Grid3x3 className="h-3.5 w-3.5" />}>
            Jour de semaine
          </ModeButton>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex">
            <div className="w-16 shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground min-w-[18px]">
                {h % 3 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>
          {active.rows.map((row, r) => (
            <div key={active.labels[r] ?? r} className="flex items-center">
              <div className="w-16 shrink-0 text-xs text-muted-foreground pr-1 text-right truncate">{active.labels[r]}</div>
              {row.map((v, h) => (
                <div
                  key={h}
                  title={v == null ? '—' : `${active.labels[r]} ${h}h : ${formatValue(v, unit)}`}
                  className="flex-1 aspect-square min-w-[18px] m-[1px] rounded-sm"
                  style={{ backgroundColor: color(v) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatValue(active.min, unit)}</span>
        <div className="h-2 w-32 rounded" style={{ background: `linear-gradient(to right, ${palette.heat[0]}, ${palette.heat[1]}, ${palette.heat[2]})` }} />
        <span>{formatValue(active.max, unit)}</span>
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
  onDrillDay,
  showLegend,
  color,
}: {
  showLegend: boolean;
  color: string;
  measurements: Measurement[];
  primary: string;
  label: string;
  unit: string;
  /** 'other' si `primary` n'est pas la grandeur principale (pas de cumul/moyenne physique connu dans ce cas non plus, mais on affiche quand même la moyenne). */
  quantityKind: QuantityKind;
  /** Clic sur un jour (granularité « Jour ») → descente au détail de ce jour. */
  onDrillDay?: (day: string) => void;
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
          {gran === 'day' && onDrillDay && <span className="text-xs"> — cliquez un jour pour voir sa courbe</span>}
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
          <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatValue(Number(v), periodUnit)} width={80}
            label={{ value: `${isCumulative ? 'Total' : 'Moyenne'}${periodUnit ? ` (${periodUnit})` : ''}`, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatValue(Number(v), periodUnit), isCumulative ? 'Total' : 'Moyenne']} labelFormatter={(l) => `📅 ${l}`} />
          {showLegend && <Legend />}
          <Bar dataKey="value" name={isCumulative ? 'Total' : 'Moyenne'} radius={[3, 3, 0, 0]} isAnimationActive={false}
            cursor={gran === 'day' && onDrillDay ? 'pointer' : undefined}
            onClick={(d: { period?: string }) => { if (gran === 'day' && onDrillDay && d?.period) onDrillDay(d.period); }}>
            {data.map((d, i) => (
              // Une valeur négative (injection / retour réseau) garde l'ambre : c'est une
              // information, pas une couleur de série.
              <Cell key={i} fill={d.value < 0 ? 'hsl(38 92% 50%)' : color} />
            ))}
          </Bar>
          <Brush dataKey="period" height={22} stroke={color} travellerWidth={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------- vue Répartition */

const OTHERS_COLOR = '#94a3b8';
const MAX_PARTS_CHOICES = [4, 5, 6, 8, 0] as const; // 0 = tout afficher

/**
 * Au-delà de `max` parts le camembert devient illisible : les plus petites sont
 * regroupées dans « Autres » (comme un camembert Excel), le détail restant
 * consultable. On garde max − 1 parts + « Autres » pour ne jamais dépasser `max`.
 */
function groupSmallParts<T extends { name: string; value: number; color: string }>(rows: T[], max: number) {
  if (max <= 0 || rows.length <= max) return { shown: rows, others: [] as T[] };
  const keep = rows.slice(0, max - 1);
  const rest = rows.slice(max - 1);
  const grouped = { ...rest[0], name: `Autres (${rest.length})`, value: rest.reduce((a, r) => a + r.value, 0), color: OTHERS_COLOR };
  return { shown: [...keep, grouped], others: rest };
}

type SliceLabelMode = 'percent' | 'value' | 'both';

/**
 * Part de chaque grandeur sur la période — le camembert qui existait dans IOT
 * et manquait ici (demande du 18/09). Une part n'a de sens que pour des
 * grandeurs cumulables : une température ou un pourcentage ne s'additionnent
 * pas, on le dit plutôt que d'afficher un camembert faux.
 */
function RepartitionView({
  measurements, series, unit, showLegend, palette, quantityKind, siblings, dateRange, bounds,
}: {
  measurements: Measurement[];
  series: { key: string; name: string; color: string }[];
  unit: string;
  showLegend: boolean;
  palette: Palette;
  quantityKind: QuantityKind;
  siblings?: { label: string; measurements: Measurement[]; unit?: string; quantityKind?: QuantityKind }[];
  dateRange: DateRange;
  bounds: ReturnType<typeof useTimestampBounds>;
}) {
  // Deux lectures possibles, du plus parlant au moins parlant :
  //  · « Par appareil » quand plusieurs relevés cumulables sont chargés — c'est
  //    la question de l'auditeur : quel usage pèse le plus ?
  //  · « Par grandeur » quand un seul relevé porte plusieurs colonnes cumulables
  //    (analyseur de réseau : actif, apparent, réactif…).
  const byDevice = useMemo(() => {
    const cumulables = (siblings ?? []).filter(s => s.quantityKind === 'energy' || s.quantityKind === 'power');
    if (cumulables.length < 2) return null;
    const rows = cumulables.map((s, i) => {
      const pts = filterByRange(s.measurements ?? [], dateRange, bounds)
        .map(m => ({ t: parseTs(m.timestamp).getTime(), v: m.consumption }))
        .filter((p): p is { t: number; v: number } => typeof p.v === 'number' && isFinite(p.v) && p.v > 0 && !isNaN(p.t));
      if (pts.length === 0) return null;
      const value = s.quantityKind === 'power' ? integrateEnergy(pts) : pts.reduce((a, p) => a + p.v, 0);
      const u = s.unit ?? '';
      return { name: s.label, value, unit: s.quantityKind === 'power' ? (u ? `${u}h` : '') : u, color: seriesColor(palette, i) };
    }).filter((r): r is { name: string; value: number; unit: string; color: string } => r !== null && r.value > 0);
    if (rows.length < 2) return null;
    // Des unités différentes ne s'additionnent pas : on ne mélange pas des Wh et des kWh dans une part.
    const units = new Set(rows.map(r => r.unit));
    if (units.size > 1) return null;
    return { rows: rows.sort((a, b) => b.value - a.value), unit: rows[0].unit };
  }, [siblings, dateRange, bounds, palette]);

  const bySeries = useMemo(() => {
    if (quantityKind === 'other') return null;
    const rows = series.map((s, i) => {
      let sum = 0;
      for (const m of measurements) {
        const v = m[s.key];
        if (typeof v === 'number' && isFinite(v) && v > 0) sum += v;
      }
      return { name: s.name, value: sum, unit, color: seriesColor(palette, i) };
    }).filter(r => r.value > 0);
    return rows.length >= 2 ? { rows: rows.sort((a, b) => b.value - a.value), unit } : null;
  }, [measurements, series, unit, palette, quantityKind]);

  const [preferDevice, setPreferDevice] = useState(true);
  const [maxParts, setMaxParts] = useState<number>(5);
  const [labelMode, setLabelMode] = useState<SliceLabelMode>('both');
  const [showOthers, setShowOthers] = useState(false);
  const active = (preferDevice && byDevice) ? byDevice : (bySeries ?? byDevice);
  const isDevice = active === byDevice;

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center max-w-xl mx-auto">
        {quantityKind === 'other'
          ? "La répartition suppose des grandeurs qui s'additionnent (énergie, puissance). Pour une température, une humidité ou un niveau sonore, une part de camembert n'aurait pas de sens — utilisez « Profil journalier » ou « Par période »."
          : "Rien à répartir : ce relevé ne porte qu'une grandeur, et il n'y a pas d'autre relevé d'énergie chargé à comparer. Chargez les relevés des différents appareils pour voir lequel consomme le plus."}
      </p>
    );
  }

  const total = active.rows.reduce((a, d) => a + d.value, 0);
  const { shown, others } = groupSmallParts(active.rows, maxParts);
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)} %`;
  const sliceLabel = (d: { percent?: number; value?: number }) => {
    const p = `${((d.percent ?? 0) * 100).toFixed(0)} %`;
    if (labelMode === 'percent') return p;
    const v = formatValue(Number(d.value ?? 0), active.unit);
    return labelMode === 'value' ? v : `${v} · ${p}`;
  };

  return (
    <div className="space-y-3">
      {byDevice && bySeries && (
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit mx-auto" data-no-export>
          <ModeButton active={isDevice} onClick={() => setPreferDevice(true)} icon={<PieIcon className="h-3.5 w-3.5" />}>Par appareil</ModeButton>
          <ModeButton active={!isDevice} onClick={() => setPreferDevice(false)} icon={<BarChart3 className="h-3.5 w-3.5" />}>Par grandeur</ModeButton>
        </div>
      )}
      {/* Réglages d'affichage : hors de l'image exportée */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground" data-no-export>
        <label className="flex items-center gap-1.5">
          Parts affichées
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
            value={maxParts}
            onChange={(e) => { setMaxParts(Number(e.target.value)); setShowOthers(false); }}
          >
            {MAX_PARTS_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? 'Toutes' : `${n} max, le reste en « Autres »`}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <ModeButton active={labelMode === 'percent'} onClick={() => setLabelMode('percent')} icon={null}>%</ModeButton>
          <ModeButton active={labelMode === 'value'} onClick={() => setLabelMode('value')} icon={null}>Valeur</ModeButton>
          <ModeButton active={labelMode === 'both'} onClick={() => setLabelMode('both')} icon={null}>Les deux</ModeButton>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {isDevice
          ? `Part de chaque appareil dans le total mesuré sur la période — ${active.rows.length} relevés comparés.`
          : 'Part de chaque grandeur de ce relevé sur la période.'}
      </p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={380}>
          <PieChart>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, n) => [`${formatValue(Number(v), active.unit)} · ${pct(Number(v))}`, n]}
            />
            {showLegend && <Legend />}
            <Pie
              data={shown}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={130}
              paddingAngle={2}
              isAnimationActive={false}
              label={sliceLabel}
            >
              {shown.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Total au centre : couleurs du thème, lisibles en sombre comme en clair (et sur l'image à fond blanc). */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: showLegend ? 28 : 0 }}>
          <span className="text-[11px] text-muted-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">{formatValue(total, active.unit)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground justify-center">
        {shown.map(d => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} — {formatValue(d.value, active.unit)} ({pct(d.value)})
          </span>
        ))}
      </div>
      <p className="text-xs text-center text-foreground">
        Total : <span className="font-semibold">{formatValue(total, active.unit)}</span> (= 100 %)
      </p>
      {others.length > 0 && (
        <div className="text-xs text-muted-foreground max-w-xl mx-auto">
          <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setShowOthers((o) => !o)} data-no-export>
            {showOthers ? 'Masquer' : 'Voir'} le détail de « Autres » ({others.length} éléments)
          </button>
          {showOthers && (
            <ul className="mt-2 space-y-0.5">
              {others.map((r) => (
                <li key={r.name} className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />{r.name}</span>
                  <span>{formatValue(r.value, active.unit)} ({pct(r.value)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
