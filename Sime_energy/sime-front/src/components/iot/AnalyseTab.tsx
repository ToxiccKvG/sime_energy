import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { PieOfPie, groupSmallParts, MAX_PARTS_CHOICES, type SliceLabelMode } from '@/components/shared/PieOfPie';
import { exportJsonToXlsx } from '@/lib/excel-utils';
import { appliquerLecture, proposerLecture, lireFichierImporte } from '@/lib/iot-lecture-fichier';
import { ChartOptions } from '@/components/shared/ChartOptions';
import { useChartPreferences, usePalette, seriesColor, chartTitle } from '@/lib/chart-preferences';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ChartZoom } from '@/components/shared/ChartZoom';
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, AreaChart, Area, Legend,
} from 'recharts';
import { ResponsiveContainer } from '@/components/shared/ZoomableChart';
import {
  Filter, BarChart2, TrendingUp, Activity, Upload,
  FileSpreadsheet, X, ChevronDown, ChevronUp, Download,
  Database, Zap,
  Maximize2, Minimize2, ChevronRight, Layers, FileText, AlertTriangle,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useIOT } from './IOTContext';
import { ProfilChargeTab } from './ProfilChargeTab';
import { METRIQUES, METRIQUES_ENV, colorForMetric, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, fmtFr, grandeursDisponibles, type MetricKey, type MetricGroup } from './analyse/communs';
import { EnvCourbeView, EnvBandeView, EnvHeatmapView, EnvProfil24View, SignatureView } from './analyse/VuesEnvironnement';
import { PerimetreBar, type PerimetreAnalyse } from './PerimetreBar';
import { useQualiteMoteur, QualiteLigne } from './QualiteMoteurPanel';
import { parseShellyRow, profilMiToShellyRow, calculerStats, detecterFormatShelly, parseShellySectionCSV } from '@/lib/iot-profil-engine';
import { transformRowsToProfilMi, transformHoraireToProfilMi, type SupabaseExportOptions } from '@/lib/iot-supabase-service';
import { JOURS_SEMAINE, MOIS_FR, COLONNES_PROFIL_SHELLY } from './shared';
import type { ShellyRow } from './shared';

type AnalyseMode = 'courbe' | 'tcd' | 'profil_semaine' | 'distribution' | 'correlation' | 'serie'
  | 'env_courbe' | 'env_bande' | 'env_heatmap' | 'env_profil24' | 'signature';

const ENV_MODES: AnalyseMode[] = ['env_courbe', 'env_bande', 'env_heatmap', 'env_profil24'];
type ChartType = 'bar' | 'line' | 'area' | 'pie';

const COULEURS = ['#a78bfa', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#06b6d4'];

/** Libellé lisible de chaque vue — sert au titre du graphique et à l'export. */
const MODE_LABELS: Record<string, string> = {
  courbe: 'Courbe de charge',
  serie: 'Série temporelle',
  tcd: 'Tableau croisé',
  profil_semaine: 'Profil de semaine',
  distribution: 'Distribution',
  correlation: 'Corrélation',
  env_courbe: 'Courbe',
  env_bande: 'Min / Max par jour',
  env_heatmap: 'Carte de chaleur',
  env_profil24: 'Profil 24 h',
  signature: 'Signature énergétique',
};



const ACCENT_COLOR = '#3b82f6';

const RAW_PAGE_SIZE = 50;
const FS_PAGE_SIZE = 100;

// Colonnes par domaine — combinées dynamiquement selon les familles d'appareils
// sélectionnées (voir recommendedColumns), pour que le template s'adapte
// automatiquement (énergie triphasée ≠ capteur météo ≠ capteur d'état).
const CLASSIFIEUR_COLUMNS = [
  'Date', 'Jour', 'Mois', 'Annee', 'Heure',
  'Jour_activites', 'Saison', 'Profil', 'Nom',
  'Appareil', 'Emplacement', 'Piece',
];

const ENERGIE_COLUMNS = [
  'kWh_Total', 'kWh_PhA', 'kWh_PhB', 'kWh_PhC',
  'kWh_RetourTotal', 'kWh_RetourA', 'kWh_RetourB', 'kWh_RetourC',
  'kW_Total', 'kW_PhA', 'kW_PhB', 'kW_PhC',
  'kW_RetourTotal', 'kW_RetourA', 'kW_RetourB', 'kW_RetourC',
];

const ENV_COLUMNS = [
  'Temperature', 'Humidite', 'Ressenti', 'Point_Rosee',
  'UV_Index', 'Luminosite', 'Pression', 'Tendance_Pression',
  'Precipitation', 'Precipitation_Incr', 'Mesure_Le', 'Alarme_Humidite',
  'Vent_Vitesse', 'Vent_Rafale', 'Vent_Direction',
  'Batterie', 'Batterie_V', 'Signal',
];

const ETAT_COLUMNS = ['Etat_Capteur', 'Angle_Inclinaison', 'Batterie', 'Signal'];

const ENERGIE_FAMILIES = new Set(['ENERGIE_3PH', 'ENERGIE_2PH', 'ENERGIE_1PH']);

/** Recommande un jeu de colonnes adapté aux familles d'appareils effectivement chargées. */
function recommendedColumns(families: Set<string>): string[] {
  const cols = new Set<string>(['Temps', ...CLASSIFIEUR_COLUMNS]);
  let hasEnergie = false, hasEnv = false, hasEtat = false;
  families.forEach(f => {
    if (ENERGIE_FAMILIES.has(f)) hasEnergie = true;
    else if (f === 'CAPTEUR_ENV') hasEnv = true;
    else if (f === 'ETAT') hasEtat = true;
  });
  // Rien de sélectionné pour l'instant (ex. chargement des métadonnées) → preset énergie par défaut
  if (families.size === 0 || hasEnergie) ENERGIE_COLUMNS.forEach(c => cols.add(c));
  if (hasEnv) ENV_COLUMNS.forEach(c => cols.add(c));
  if (hasEtat) ETAT_COLUMNS.forEach(c => cols.add(c));
  return Array.from(cols);
}

const tcdFormatter = (value: number | string, name: string): [string, string] => {
  const meta = METRIQUES.find(m => m.label === name) ?? METRIQUES.find(m => m.key === name);
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  const fmtd = isFinite(n) ? fmtFr(n, 3) : String(value);
  return [meta?.unit ? `${fmtd} ${meta.unit}` : fmtd, meta?.label ?? name];
};

function SerieTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; dataKey?: string | number; color?: string; payload: Record<string, unknown> }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { appareil: string; emplacement: string; piece: string; isWeekend: boolean; isFerie: boolean };
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 space-y-1 text-xs min-w-[200px]">
      <p style={TOOLTIP_LABEL_STYLE} className="text-sm">{label}</p>
      {payload.map((p, i) => {
        const metaMatch = METRIQUES.find(m => m.key === p.dataKey) ?? METRIQUES.find(m => p.name?.includes(m.label)) ?? METRIQUES.find(m => m.key === p.name);
        return (
          <p key={i} className="text-slate-300 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1">{p.name}</span>
            <span className="text-white font-semibold ml-auto">
              {typeof p.value === 'number' ? fmtFr(p.value, 3) : p.value}
              {metaMatch?.unit && <span className="text-slate-400 font-normal ml-1">{metaMatch.unit}</span>}
            </span>
          </p>
        );
      })}
      {d.appareil && <p className="text-slate-400 pt-1 border-t border-white/10">Appareil : <span className="text-cyan-300">{d.appareil}</span></p>}
      {d.emplacement && <p className="text-slate-400">Site : <span className="text-yellow-300">{d.emplacement}</span></p>}
      {d.piece && <p className="text-slate-400">Pièce : <span className="text-purple-300">{d.piece}</span></p>}
      {(d.isWeekend || d.isFerie) && (
        <p className="text-orange-400 font-medium">{d.isFerie ? 'Jour férié' : 'Week-end'}</p>
      )}
    </div>
  );
}

// Libellé lisible des regroupements TCD (axe X)
const TCD_LIGNE_LABEL: Record<'mois' | 'jouSemaine' | 'typeJour' | 'appareil' | 'piece', string> = {
  mois: 'Mois',
  jouSemaine: 'Jour de semaine',
  typeJour: 'Type de jour',
  appareil: 'Appareil',
  piece: 'Pièce',
};

// Libellé d'axe lisible par unité (pour les axes double échelle kWh / kW)
const UNIT_AXIS_LABEL: Record<string, string> = {
  kWh: 'Énergie (kWh)',
  kW: 'Puissance (kW)',
};
function axisLabelForUnit(unit?: string): string {
  return unit ? (UNIT_AXIS_LABEL[unit] ?? unit) : '';
}

// Tooltip détaillé pour TCD / Camembert : métrique + valeur + unité + contexte (appareil, site, nb points)
function TcdTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; dataKey?: string | number; color?: string; payload: Record<string, unknown> }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = (payload[0].payload ?? {}) as Record<string, unknown>;
  const n = typeof row.n === 'number' ? row.n : undefined;
  const appareils = Array.isArray(row._appareils) ? (row._appareils as string[]) : [];
  const emplacements = Array.isArray(row._emplacements) ? (row._emplacements as string[]) : [];
  const pieces = Array.isArray(row._pieces) ? (row._pieces as string[]) : [];
  const fmtList = (arr: string[]) => `${arr.slice(0, 3).join(', ')}${arr.length > 3 ? ` +${arr.length - 3}` : ''}`;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 space-y-1.5 text-xs min-w-[230px]">
      <div className="flex items-center justify-between gap-3">
        <p style={TOOLTIP_LABEL_STYLE} className="text-sm">{label ?? (row.label as string) ?? ''}</p>
        {typeof n === 'number' && <span className="text-slate-500">{n} pt{n > 1 ? 's' : ''}</span>}
      </div>
      <div className="space-y-1 pt-1 border-t border-white/10">
        {payload.map((p, i) => {
          const meta = METRIQUES.find(m => m.key === p.dataKey) ?? METRIQUES.find(m => m.label === p.name);
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color ?? meta?.color }} />
              <span className="flex-1 text-slate-300">{meta?.label ?? p.name}</span>
              <span className="text-white font-semibold ml-auto">
                {typeof p.value === 'number' ? fmtFr(p.value, 3) : p.value}
                {meta?.unit && <span className="text-slate-400 font-normal ml-1">{meta.unit}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {(appareils.length > 0 || emplacements.length > 0 || pieces.length > 0) && (
        <div className="pt-1 border-t border-white/10 space-y-0.5">
          {appareils.length > 0 && (
            <p className="text-slate-400">Appareil{appareils.length > 1 ? 's' : ''} : <span className="text-cyan-300">{fmtList(appareils)}</span></p>
          )}
          {emplacements.length > 0 && (
            <p className="text-slate-400">Site{emplacements.length > 1 ? 's' : ''} : <span className="text-yellow-300">{fmtList(emplacements)}</span></p>
          )}
          {pieces.length > 0 && (
            <p className="text-slate-400">Pièce{pieces.length > 1 ? 's' : ''} : <span className="text-purple-300">{fmtList(pieces)}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

// Camembert du TCD : le même camembert « principal + secondaire » que le module Mesures.
// Les plus petites parts passent dans « Autres » (détaillé dans un second camembert) ; un clic sur
// une part filtre le TCD (filtre croisé) comme avant ; l'infobulle garde appareils / sites / pièces.
function TcdPie({ data, primaryMetric, crossFilter, onPieClick, height }: {
  data: Record<string, unknown>[];
  primaryMetric: MetricKey;
  crossFilter: string | null;
  onPieClick: (entry: { label?: string }) => void;
  height: number;
}) {
  const palette = usePalette();
  const meta = METRIQUES.find(m => m.key === primaryMetric);
  const unit = meta?.unit ?? '';
  const [maxParts, setMaxParts] = useState<number>(5);
  const [labelMode, setLabelMode] = useState<SliceLabelMode>('both');

  const { rows, skipped } = useMemo(() => {
    const all = data.map((d, i) => ({ name: String(d.label ?? ''), value: Number(d[primaryMetric]), color: seriesColor(palette, i) }));
    // Un camembert ne représente que des parts positives (une énergie nette négative, un retour nul n'ont pas de part).
    const pos = all.filter(r => Number.isFinite(r.value) && r.value > 0).sort((a, b) => b.value - a.value);
    return { rows: pos, skipped: all.length - pos.length };
  }, [data, primaryMetric, palette]);

  const total = rows.reduce((a, r) => a + r.value, 0);
  const { shown, others } = useMemo(() => groupSmallParts(rows, maxParts), [rows, maxParts]);
  const fmtV = (v: number) => `${fmtFr(v, v < 10 ? 2 : 1)}${unit ? ` ${unit}` : ''}`;
  const pct = (v: number) => `${fmtFr((v / total) * 100, 1)} %`;

  if (rows.length === 0) return <p className="text-sm text-slate-400 py-10 text-center">Aucune valeur positive à répartir pour cette grandeur.</p>;

  const extra = (name: string) => {
    const row = data.find(d => String(d.label) === name);
    if (!row) return null;
    const n = typeof row.n === 'number' ? row.n : undefined;
    const lists: [string, string[], string][] = [
      ['Appareil', Array.isArray(row._appareils) ? (row._appareils as string[]) : [], 'text-cyan-300'],
      ['Site', Array.isArray(row._emplacements) ? (row._emplacements as string[]) : [], 'text-yellow-300'],
      ['Pièce', Array.isArray(row._pieces) ? (row._pieces as string[]) : [], 'text-purple-300'],
    ];
    return (
      <div className="pt-1 border-t border-white/10 space-y-0.5">
        {typeof n === 'number' && <p className="text-slate-400">{n} point{n > 1 ? 's' : ''}</p>}
        {lists.filter(([, a]) => a.length > 0).map(([l, a, c]) => (
          <p key={l} className="text-slate-400">{l}{a.length > 1 ? 's' : ''} : <span className={c}>{a.slice(0, 3).join(', ')}{a.length > 3 ? ` +${a.length - 3}` : ''}</span></p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400" data-no-export>
        <label className="flex items-center gap-1.5">
          Parts affichées
          <select className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-xs text-slate-200" value={maxParts} onChange={(e) => setMaxParts(Number(e.target.value))}>
            {MAX_PARTS_CHOICES.map(n => <option key={n} value={n} className="text-black">{n === 0 ? 'Toutes' : `${n} max, le reste en « Autres »`}</option>)}
          </select>
        </label>
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
          {([['percent', '%'], ['value', 'Valeur'], ['both', 'Les deux']] as [SliceLabelMode, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setLabelMode(k)} className={`px-2 py-0.5 rounded text-xs ${labelMode === k ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}>{l}</button>
          ))}
        </div>
      </div>
      <PieOfPie shown={shown} others={others} total={total} format={fmtV} labelMode={labelMode} height={Math.max(300, height)}
        onSliceClick={(name) => onPieClick({ label: name })} activeName={crossFilter} tooltipExtra={extra} />
      <p className="text-xs text-center text-slate-300">
        {meta?.label ?? 'Total'} : <span className="font-semibold text-white">{fmtV(total)}</span> (= 100 %)
        {skipped > 0 && <span className="text-slate-500"> · {skipped} valeur(s) nulle(s) ou négative(s) non représentée(s)</span>}
      </p>
    </div>
  );
}

// Graphique TCD (bar/line/area/pie) — partagé entre la vue normale et la vue plein écran,
// qui ne diffèrent que par la taille/densité (police, marges, rayons).
function TcdChart({
  data, chartType, metrics, primaryMetric, units, crossFilter, onBarClick, onPieClick,
  metricAxis, unitAxis, primaryUnit, accentColor, angled, height, bottomMargin, xAxisHeight,
  xAxisLabel, compact,
}: {
  data: Record<string, unknown>[];
  chartType: ChartType;
  metrics: Set<MetricKey>;
  primaryMetric: MetricKey;
  units: string[];
  crossFilter: string | null;
  onBarClick: (e: { activeLabel?: unknown }) => void;
  onPieClick: (entry: { label?: string }) => void;
  metricAxis: (mk: MetricKey) => 'left' | 'right';
  unitAxis: (unit?: string) => 'left' | 'right';
  primaryUnit?: string;
  accentColor: string;
  angled: boolean;
  height: number;
  bottomMargin: number;
  xAxisHeight: number;
  xAxisLabel?: string;
  compact: boolean;
}) {
  // Couleurs et légendes : réglages partagés avec le module Mesures.
  const palette = usePalette();
  const { showLegend } = useChartPreferences();
  const metricColor = (mk: string) => colorForMetric(palette, mk);

  const tickFontSize = compact ? 10 : 11;
  const yTickFontSize = compact ? 9 : 10;
  const axisLabelFontSize = compact ? 10 : 11;
  const axisLabelFill = compact ? '#94a3b8' : '#cbd5e1';
  const margin = { top: 5, right: compact ? 10 : 20, bottom: bottomMargin, left: compact ? 0 : 10 };
  const barRadius: [number, number, number, number] = compact ? [3, 3, 0, 0] : [4, 4, 0, 0];
  const dimOpacity = compact ? 0.3 : 0.35;
  const dotRadius = compact ? 3 : 4;
  const avgLabel = compact ? 'Moy.' : 'Moyenne';
  if (chartType === 'pie') {
    return <TcdPie data={data} primaryMetric={primaryMetric} crossFilter={crossFilter} onPieClick={onPieClick} height={height} />;
  }

  return (
    <ResponsiveContainer key={chartType} width="100%" height={height}>
      {chartType === 'bar' ? (
        <BarChart data={data} margin={margin} onClick={onBarClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: tickFontSize }} interval={0} height={xAxisHeight} angle={angled ? -35 : 0} textAnchor={angled ? 'end' : 'middle'} label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: 0, fill: '#94a3b8', fontSize: 11 } : undefined} />
          <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[0]), angle: -90, position: 'insideLeft', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          {units.length > 1 && (
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[1]), angle: 90, position: 'insideRight', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          )}
          <Tooltip content={<TcdTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
          {Array.from(metrics).map(mk => {
            const meta = METRIQUES.find(m => m.key === mk);
            return (
              <Bar key={mk} yAxisId={metricAxis(mk)} dataKey={mk} name={meta?.label ?? mk} radius={barRadius} fill={metricColor(mk)} cursor="pointer" opacity={0.85}>
                {mk === primaryMetric && data.map((entry, i) => (
                  <Cell key={i} fill={crossFilter === entry.label ? '#f59e0b' : metricColor(mk)} opacity={crossFilter && crossFilter !== entry.label ? dimOpacity : 1} />
                ))}
              </Bar>
            );
          })}
        </BarChart>
      ) : chartType === 'line' ? (
        <LineChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: tickFontSize }} interval={0} height={xAxisHeight} angle={angled ? -35 : 0} textAnchor={angled ? 'end' : 'middle'} label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: 0, fill: '#94a3b8', fontSize: 11 } : undefined} />
          <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[0]), angle: -90, position: 'insideLeft', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          {units.length > 1 && (
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[1]), angle: 90, position: 'insideRight', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          )}
          <Tooltip content={<TcdTooltip />} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
          {Array.from(metrics).map(mk => {
            const meta = METRIQUES.find(m => m.key === mk);
            return <Line key={mk} yAxisId={metricAxis(mk)} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={metricColor(mk)} strokeWidth={2} dot={{ r: dotRadius }} />;
          })}
          <Line yAxisId={unitAxis(primaryUnit)} type="monotone" dataKey="moyenne" name={avgLabel} stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: tickFontSize }} interval={0} height={xAxisHeight} angle={angled ? -35 : 0} textAnchor={angled ? 'end' : 'middle'} label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: 0, fill: '#94a3b8', fontSize: 11 } : undefined} />
          <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[0]), angle: -90, position: 'insideLeft', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          {units.length > 1 && (
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: yTickFontSize }} label={{ value: axisLabelForUnit(units[1]), angle: 90, position: 'insideRight', fill: axisLabelFill, fontSize: axisLabelFontSize }} />
          )}
          <Tooltip content={<TcdTooltip />} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
          {Array.from(metrics).map(mk => {
            const meta = METRIQUES.find(m => m.key === mk);
            return <Area key={mk} yAxisId={metricAxis(mk)} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={metricColor(mk)} fill={metricColor(mk) + '20'} strokeWidth={2} />;
          })}
        </AreaChart>
      ) : (
        <></>
      )}
    </ResponsiveContainer>
  );
}

// ============================================================
// VUES ENVIRONNEMENTALES
// ============================================================

function reviveStoredShellyRows(rows: Record<string, unknown>[]): ShellyRow[] {
  return rows.map((row) => ({
    ...row,
    date: toDate(row.date),
  })) as ShellyRow[];
}

// ---- Utilitaires ----
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : fallback;
}

function fmt3(v: unknown): string {
  return fmtFr(safeNum(v, 0), 3);
}

function fmt2(v: unknown): string {
  return fmtFr(safeNum(v, 0), 2);
}

function fmt1(v: unknown): string {
  return fmtFr(safeNum(v, 0), 1);
}

function fmt0(v: unknown): string {
  return fmtFr(safeNum(v, 0), 0);
}

function MultiSelectFilter({ label, icon, options, selected, onChange }: {
  label: string;
  icon: React.ReactNode;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"
          className={`h-8 gap-1.5 text-xs ${selected.length ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-white/5 border-white/20 text-slate-300'}`}>
          {icon}
          {label}
          {selected.length > 0 && <span className="ml-0.5 rounded-full bg-blue-500/40 px-1.5 text-blue-100">{selected.length}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-[#1a1d2e] border-white/20 p-2" align="end">
        <div className="flex items-center justify-between px-1 py-1 mb-1">
          <span className="text-slate-300 text-xs font-medium">{label} ({options.length})</span>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-xs text-blue-400 hover:text-blue-300">Réinitialiser</button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
              <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="text-white text-xs flex-1 truncate" title={opt}>{opt}</span>
            </label>
          ))}
          {options.length === 0 && <p className="text-slate-500 text-xs px-2 py-1">Aucune donnée</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export function AnalyseTab() {
  const { state, setActiveTab, setShellyRows, setSelectedFile, ensureFileContent } = useIOT();
  const { shellyRows, joursFerier, selectedFileId, filesLoaded } = state;

  // ---- Profil Mi actif ----

  // ---- Ref graphiques + export PDF ----
  const chartRef = useRef<HTMLDivElement>(null);
  const [exportingPDF, setExportingPDF] = useState(false);

  const exportPDF = useCallback(async () => {
    if (!chartRef.current) return;
    setExportingPDF(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0f111a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 80);
      doc.text(`IOT — Analyse · ${new Date().toLocaleDateString('fr-FR')}`, 14, 10);
      const imgH = (canvas.height / canvas.width) * (pageW - 20);
      const maxH = pageH - 20;
      doc.addImage(imgData, 'PNG', 10, 16, pageW - 20, Math.min(imgH, maxH));
      doc.save(`iot_analyse_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportingPDF(false);
    }
  }, []);

  // ---- Import fichier ----
  const [localRows, setLocalRows] = useState<ShellyRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [showImport, setShowImport] = useState(false);
  // Fichier sans aucune date lisible : sa lecture se corrige dans Fichiers
  const [fichierIllisible, setFichierIllisible] = useState<string | null>(null);

  // ---- Données Supabase chargées ----
  const [supabaseRows, setSupabaseRows] = useState<ShellyRow[]>([]);
  const [supabaseFileName, setSupabaseFileName] = useState<string>('');
  const [supabaseChargement, setSupabaseChargement] = useState<SupabaseExportOptions | null>(null);
  // Périmètre choisi dans la barre (site, appareils, période, plage horaire) :
  // partagé par toutes les vues, Courbe de charge comprise
  const [perimetreAnalyse, setPerimetreAnalyse] = useState<PerimetreAnalyse | null>(null);
  // Plage horaire appliquée chaque jour aux relevés chargés
  const supabaseRowsPlage = useMemo(() => {
    const p = perimetreAnalyse;
    if (!p || (p.heureDebut === 0 && p.heureFin === 23)) return supabaseRows;
    return supabaseRows.filter(r => {
      const h = toDate(r.date).getHours();
      return p.heureDebut <= p.heureFin ? h >= p.heureDebut && h <= p.heureFin : h >= p.heureDebut || h <= p.heureFin;
    });
  }, [supabaseRows, perimetreAnalyse]);


  // Source active: supabase > local > contexte
  const activeRows = supabaseRows.length > 0 ? supabaseRowsPlage
    : localRows.length > 0 ? localRows : shellyRows;
  // Qualité des données Supabase : le même moteur que le Nettoyage
  const qualite = useQualiteMoteur(supabaseRowsPlage, supabaseRows.length > 0, null);
  // Source décrite par son périmètre (site · période), pas par « Supabase — Tous appareils »
  const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dataSource = supabaseRows.length > 0
    ? (perimetreAnalyse ? `${perimetreAnalyse.site || 'Tous les sites'} · ${jjmm(perimetreAnalyse.dateDebut)} → ${jjmm(perimetreAnalyse.dateFin)}` : 'Données Shelly')
    : localRows.length > 0 ? fileName
      : shellyRows.length > 0 ? 'Données transmises par un autre onglet' : null;

  // ---- Analyse ----
  const [mode, setMode] = useState<AnalyseMode>('courbe');
  const chartPrefs = useChartPreferences();
  // Titre du graphique : « source · vue », remplaçable par l'utilisateur.
  const autoChartTitle = `${dataSource ? `${dataSource} · ` : ''}${MODE_LABELS[mode] ?? mode}`;
  const displayChartTitle = chartTitle(chartPrefs, `iot:${mode}`, autoChartTitle);
  const [serieMetrics, setSerieMetrics] = useState<Set<MetricKey>>(new Set(['kwhTotal']));
  const toggleSerieMetric = (k: MetricKey) =>
    setSerieMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  // Métrique principale (pour stats + ligne moyenne) : la première sélectionnée
  const primarySerieMetric = useMemo<MetricKey>(() => {
    const arr = Array.from(serieMetrics);
    return (arr[0] ?? 'kwhTotal') as MetricKey;
  }, [serieMetrics]);
  const [tcdLigne, setTcdLigne] = useState<'mois' | 'jouSemaine' | 'typeJour' | 'appareil' | 'piece'>('mois');
  const [showFeries, setShowFeries] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);

  // ---- Power BI states ----
  const [fullscreenTCD, setFullscreenTCD] = useState(false);
  const [tcdMetrics, setTcdMetrics] = useState<Set<MetricKey>>(new Set(['kwhTotal', 'kwhNet']));
  const toggleTcdMetric = (k: MetricKey) =>
    setTcdMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
      return next;
    });
  const primaryTcdMetric = (Array.from(tcdMetrics)[0] ?? 'kwhTotal') as MetricKey;
  const [crossFilter, setCrossFilter] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [slicerSaison, setSlicerSaison] = useState<string[]>([]);
  const [slicerTypeJour, setSlicerTypeJour] = useState<string[]>([]);
  // Filtres globaux Appareil / Pièce (s'appliquent à TOUS les graphiques)
  const [slicerAppareil, setSlicerAppareil] = useState<string[]>([]);
  const [slicerPiece, setSlicerPiece] = useState<string[]>([]);
  const [showRawData, setShowRawData] = useState(false);
  const [rawPage, setRawPage] = useState(0);
  const [fsPage, setFsPage] = useState(0);

  // Séries masquées dans les graphiques (clic sur la légende)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const isHidden = (key: string) => hiddenSeries.has(key);


  const parseImportedFileToShellyRows = useCallback((file: import('./shared').ImportedFile): ShellyRow[] => {
    if (file.rawData.length === 0) return [];

    if (file.statut === 'nettoyé') {
      return reviveStoredShellyRows(file.rawData);
    }

    // Fichier quelconque : lecture choisie à l'import (dates, rôles, unités),
    // sections empilées réorganisées en colonnes
    const ident = { nom: file.name.replace(/\.(csv|xlsx|xls)$/i, ''), lieu: file.deviceLocation, piece: file.deviceRoom };
    const lu = lireFichierImporte(file, joursFerier);
    if (lu) return lu.rows;

    const detect = detecterFormatShelly(file.columns);
    if (detect.format === 'shelly_excel') {
      return file.rawData
        .map(r => parseShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'profil_mi') {
      return file.rawData
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'supabase_cl') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profilRows = transformRowsToProfilMi(file.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
      return profilRows
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'supabase_horaire') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profilRows = transformHoraireToProfilMi(file.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
      return profilRows
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'shelly_section') {
      return parseShellySectionCSV(file.rawData, joursFerier);
    }
    // Importé avant le 19/10 sans lecture : la proposer à la volée
    const lecture = proposerLecture(file.columns, file.rawData, {}, [], file.name);
    return lecture.colDate ? appliquerLecture(file.rawData, lecture, joursFerier, ident).rows : [];
  }, [joursFerier]);

  // ---- Callback Supabase ----
  const handleSupabaseData = useCallback((rows: Record<string, unknown>[], _colonnes: string[], options: SupabaseExportOptions) => {
    if (rows.length === 0) return;
    // Gardé pour le Nettoyage : même périmètre pour le moteur de qualité,
    // et recette rejouable
    setSupabaseChargement(options);
    const parsed = rows
      .map(r => profilMiToShellyRow(r, joursFerier))
      .filter((r): r is ShellyRow => r !== null);
    if (parsed.length > 0) {
      setSupabaseRows(parsed);
      setSupabaseFileName('Supabase — Tous appareils');
    }
  }, [joursFerier]);

  const clearLocal = () => {
    setLocalRows([]); setFileName(''); setFichierIllisible(null);
  };

  const clearSupabase = () => {
    setSupabaseRows([]); setSupabaseFileName('');
  };

  const loadFromImported = useCallback((f: import('./shared').ImportedFile) => {
    if (f.rawData.length === 0) return;
    setFileName(f.name);
    const parsed = parseImportedFileToShellyRows(f);
    setLocalRows(parsed);
    setFichierIllisible(parsed.length > 0 ? null : f.name);
    setShowImport(parsed.length === 0); // graphiques directement visibles, sinon le message
  }, [parseImportedFileToShellyRows]);

  // Fichier sélectionné (bibliothèque ou reprise de session) : le contenu
  // vient de la base à la demande, d'où l'attente de la liste puis du
  // téléchargement. Une sélection devenue obsolète (autre fichier choisi
  // entre-temps) est ignorée.
  useEffect(() => {
    if (!selectedFileId || !filesLoaded) return;
    let stale = false;
    void ensureFileContent(selectedFileId).then(file => {
      if (stale || !file) return;
      loadFromImported(file);
      setSupabaseRows([]);
      setSupabaseFileName('');
      setMode('tcd');
    });
    return () => { stale = true; };
  }, [selectedFileId, filesLoaded, ensureFileContent, loadFromImported]);

  // ---- Export Excel ----
  // Écrit ce qui est CHARGÉ, à sa granularité d'origine (minute, heure, jour) : une ligne par relevé avec
  // la date ET l'heure, l'appareil, la pièce, puis les colonnes qui portent réellement des données.
  // Avant, l'export était un tableau fixe de colonnes d'énergie avec la date seule : une station météo
  // à la minute donnait 1 440 lignes identiques par jour, sans heure ni température — d'où le détour par
  // la granularité horaire pour « avoir les bonnes colonnes ».
  const exportCSV = async () => {
    const envCols = METRIQUES_ENV.filter(m => activeRows.some(r => typeof r[m.key] === 'number'));
    const autresGrandeurs = [...new Set(activeRows.flatMap(r => r.grandeurs ? Object.keys(r.grandeurs) : []))];
    const hasEnergy = activeRows.some(r => r.kwhTotal !== 0 || r.kwhRetourTotal !== 0 || r.puissKwTotal !== 0);
    const hms = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    await exportJsonToXlsx(
      activeRows.map(r => {
        const d = toDate(r.date);
        const ligne: Record<string, unknown> = {
          Date: d.toLocaleDateString('fr-FR'),
          Heure: hms(d),
          Appareil: r.nomAppareil ?? '',
          Pièce: r.deviceRoom ?? '',
          Site: r.deviceLocation ?? '',
        };
        for (const m of envCols) ligne[`${m.label}${m.unit ? ` (${m.unit})` : ''}`] = typeof r[m.key] === 'number' ? r[m.key] : '';
        for (const k of autresGrandeurs) ligne[k] = r.grandeurs?.[k] ?? '';
        if (hasEnergy) {
          ligne['kWh Total'] = fmt3(r.kwhTotal);
          ligne['kWh Net'] = fmt3(r.kwhNet);
          ligne['kWh Retour'] = r.kwhRetourTotal.toFixed(3);
          ligne['Puissance (kW)'] = fmt3(r.puissKwTotal);
          ligne['Phase A'] = fmt3(r.kwhA);
          ligne['Phase B'] = fmt3(r.kwhB);
          ligne['Phase C'] = fmt3(r.kwhC);
        }
        ligne['Jour'] = r.jourSemaine;
        ligne['Férié'] = r.isJourFerie ? 'Oui' : '';
        ligne['Weekend'] = r.isWeekend ? 'Oui' : '';
        return ligne;
      }),
      'Données',
      `tcd_${fileName || 'export'}.xlsx`
    );
  };

  // ---- Calculs ----
  // Appareils & pièces présents dans les données (pour les filtres globaux)
  const availableAppareils = useMemo(
    () => Array.from(new Set(activeRows.map(r => r.nomAppareil).filter((x): x is string => Boolean(x)))).sort(),
    [activeRows]);
  const availablePieces = useMemo(
    () => Array.from(new Set(activeRows.map(r => r.deviceRoom).filter((x): x is string => Boolean(x)))).sort(),
    [activeRows]);

  const filteredRows = useMemo(() => {
    // Exclure SEULEMENT les lignes où TOUTES les mesures énergétiques ET de puissance sont nulles
    // (sinon on filtre par erreur les flux d'injection ou de monitoring)
    let rows = activeRows.filter(r =>
      (r.kwhTotal ?? 0) > 0 ||
      (r.kwhRetourTotal ?? 0) > 0 ||
      (r.kwhA ?? 0) > 0 || (r.kwhB ?? 0) > 0 || (r.kwhC ?? 0) > 0 ||
      (r.kwhRetourA ?? 0) > 0 || (r.kwhRetourB ?? 0) > 0 || (r.kwhRetourC ?? 0) > 0 ||
      (r.puissKwTotal ?? 0) > 0
    );
    // Si le filtrage strict élimine tout, on garde tout (cas monitoring/capteurs)
    if (rows.length === 0) rows = activeRows;
    if (!showFeries) rows = rows.filter(r => !r.isJourFerie);
    if (!showWeekends) rows = rows.filter(r => !r.isWeekend);
    // Filtres globaux Appareil / Pièce — appliqués à tous les graphiques
    if (slicerAppareil.length) rows = rows.filter(r => slicerAppareil.includes(r.nomAppareil ?? ''));
    if (slicerPiece.length) rows = rows.filter(r => slicerPiece.includes(r.deviceRoom ?? ''));
    return rows;
  }, [activeRows, showFeries, showWeekends, slicerAppareil, slicerPiece]);

  // ── Base des vues environnementales ──────────────────────────
  // filteredRows exclut les lignes 100% nulles côté énergie : en jeu mixte
  // (compteurs + météo), les relevés des capteurs env en sont donc absents.
  // Les vues env_* partent d'activeRows avec les mêmes filtres globaux, en ne
  // gardant que les lignes portant au moins une grandeur environnementale.
  const envRows = useMemo(() => {
    let rows = activeRows.filter(r => r.grandeurs || METRIQUES_ENV.some(m => typeof r[m.key] === 'number'));
    if (!showFeries) rows = rows.filter(r => !r.isJourFerie);
    if (!showWeekends) rows = rows.filter(r => !r.isWeekend);
    if (slicerAppareil.length) rows = rows.filter(r => slicerAppareil.includes(r.nomAppareil ?? ''));
    if (slicerPiece.length) rows = rows.filter(r => slicerPiece.includes(r.deviceRoom ?? ''));
    return rows;
  }, [activeRows, showFeries, showWeekends, slicerAppareil, slicerPiece]);

  // Grandeurs env réellement présentes → pilote l'affichage des modes env_*
  const paletteGrandeurs = usePalette();
  const envMetricsAvailable = useMemo(
    () => grandeursDisponibles(envRows, paletteGrandeurs),
    [envRows, paletteGrandeurs]);
  const hasEnvData = envMetricsAvailable.length > 0;
  // Signature = consommation × température extérieure : il faut une température
  const hasTemperature = useMemo(() => envRows.some(r => typeof r.temperature === 'number'), [envRows]);
  // Données énergie réelles (au moins un relevé non nul) → pilote les modes énergie
  const hasEnergyData = useMemo(
    () => activeRows.some(r =>
      (r.kwhTotal ?? 0) > 0 || (r.kwhRetourTotal ?? 0) > 0 || (r.puissKwTotal ?? 0) > 0 || (r.whTotal ?? 0) > 0),
    [activeRows]);

  const [envMetric, setEnvMetric] = useState<string>('temperature');
  const grandeurActive = envMetricsAvailable.find(m => m.key === envMetric) ?? envMetricsAvailable[0];
  // Fichier aux grandeurs quelconques (PM2.5, tension…) : « Grandeurs » plutôt qu'« Environnement »
  const libelleGrandeurs = envMetricsAvailable.some(m => !METRIQUES_ENV.some(e => e.key === m.key)) ? 'Grandeurs' : 'Environnement';
  // Grandeur sélectionnée absente des données chargées → retomber sur la première dispo
  useEffect(() => {
    if (envMetricsAvailable.length > 0 && !envMetricsAvailable.some(m => m.key === envMetric)) {
      setEnvMetric(envMetricsAvailable[0].key);
    }
  }, [envMetricsAvailable, envMetric]);

  // Mode actif indisponible pour ces données (ex. mode énergie sur un jeu 100%
  // météo, ou Signature sans les deux types de données) → basculer sur le
  // premier mode pertinent
  useEffect(() => {
    const isEnvMode = ENV_MODES.includes(mode);
    if (mode === 'signature' && !(hasEnergyData && hasTemperature)) {
      setMode(hasEnergyData ? 'courbe' : 'env_courbe');
    } else if (isEnvMode && !hasEnvData && hasEnergyData) {
      setMode('courbe');
    } else if (!isEnvMode && mode !== 'signature' && !hasEnergyData && hasEnvData) {
      setMode('env_courbe');
    }
  }, [mode, hasEnvData, hasEnergyData, hasTemperature]);

  // Slicers Power BI (saison, tranche, type de jour)
  const slicerRows = useMemo(() => {
    let rows = filteredRows;
    if (slicerSaison.length) rows = rows.filter(r => slicerSaison.includes(r.saison ?? ''));
    if (slicerTypeJour.length) {
      rows = rows.filter(r => {
        const t = r.isJourFerie ? 'Jours fériés'
          : r.jourSemaine === 'Sam' ? 'Samedis'
            : r.jourSemaine === 'Dim' ? 'Dimanches'
              : 'Jours ouvrés';
        return slicerTypeJour.includes(t);
      });
    }
    return rows;
  }, [filteredRows, slicerSaison, slicerTypeJour]);

  // Cross-filter : lignes correspondant au label sélectionné
  const crossFilteredRows = useMemo(() => {
    if (!crossFilter) return slicerRows;
    if (tcdLigne === 'mois') {
      return slicerRows.filter(r => {
        const key = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        return key === crossFilter;
      });
    }
    if (tcdLigne === 'jouSemaine') return slicerRows.filter(r => r.jourSemaine === crossFilter);
    if (tcdLigne === 'appareil') return slicerRows.filter(r => (r.nomAppareil || '(Sans nom)') === crossFilter);
    if (tcdLigne === 'piece') return slicerRows.filter(r => (r.deviceRoom || '(Sans pièce)') === crossFilter);
    const typeMap: Record<string, (r: ShellyRow) => boolean> = {
      'Jours ouvrés': r => !r.isWeekend && !r.isJourFerie,
      'Samedis': r => toDate(r.date).getDay() === 6,
      'Dimanches': r => toDate(r.date).getDay() === 0,
      'Jours fériés': r => r.isJourFerie,
    };
    return typeMap[crossFilter] ? slicerRows.filter(typeMap[crossFilter]) : slicerRows;
  }, [slicerRows, crossFilter, tcdLigne]);

  const stats = useMemo(() => {
    const vals = filteredRows
      .map(r => safeNum((r as unknown as Record<string, unknown>)[primarySerieMetric] as number, NaN))
      .filter(v => typeof v === 'number' && isFinite(v));
    return calculerStats(vals);
  }, [filteredRows, primarySerieMetric]);

  /**
   * Quel appareil et quand, derrière le maximum et le minimum.
   * Demande du manager (18/09) : « on ne sait pas c'est quel usage qui est à
   * 18,7 Wh — on l'a, mais on ne l'affiche pas ». Quand plusieurs appareils
   * sont chargés, la valeur affichée est une somme : sans l'attribution, elle
   * ne se rattache à rien.
   */
  const statsQui = useMemo(() => {
    let hi: { v: number; r: ShellyRow } | null = null;
    let lo: { v: number; r: ShellyRow } | null = null;
    for (const r of filteredRows) {
      const v = safeNum((r as unknown as Record<string, unknown>)[primarySerieMetric] as number, NaN);
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (!hi || v > hi.v) hi = { v, r };
      if (!lo || v < lo.v) lo = { v, r };
    }
    const decrire = (x: { v: number; r: ShellyRow } | null) => {
      if (!x) return null;
      const nom = x.r.nomAppareil?.trim();
      const quand = toDate(x.r.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return nom ? `${nom} · ${quand}` : quand;
    };
    return { max: decrire(hi), min: decrire(lo) };
  }, [filteredRows, primarySerieMetric]);

  const serieData = useMemo(() =>
    filteredRows.map(r => {
      const obj: Record<string, unknown> & { appareil: string; emplacement: string; piece: string } = {
        date: toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        consommation: +(r.kwhTotal ?? 0).toFixed(3),
        isWeekend: r.isWeekend,
        isFerie: r.isJourFerie,
        appareil: r.nomAppareil ?? '',
        emplacement: r.deviceLocation ?? '',
        piece: r.deviceRoom ?? '',
      };
      // Toutes les métriques disponibles dans la même ligne (pour multi-séries)
      for (const m of METRIQUES) {
        obj[m.key] = +(((r as unknown as Record<string, unknown>)[m.key] as number) ?? 0).toFixed(2);
      }
      return obj;
    }), [filteredRows]);

  // Sélecteur de type de graphique
  const [chartType, setChartType] = useState<ChartType>('bar');

  // ── Double axe Y : regroupe les métriques par unité (kWh à gauche, kW à droite, etc.) ──
  // Évite que la puissance (kW) soit écrasée par la consommation (kWh) sur un axe unique.
  const tcdUnits = useMemo(() => {
    const seen: string[] = [];
    for (const m of METRIQUES) {
      if (tcdMetrics.has(m.key) && !seen.includes(m.unit)) seen.push(m.unit);
    }
    return seen.length ? seen : ['kWh'];
  }, [tcdMetrics]);
  // Renvoie l'axe (gauche = 1ère unité, droite = unités suivantes)
  const unitAxis = useCallback((unit?: string): 'left' | 'right' =>
    unit && tcdUnits.indexOf(unit) > 0 ? 'right' : 'left', [tcdUnits]);
  const metricAxis = useCallback((mk: MetricKey): 'left' | 'right' =>
    unitAxis(METRIQUES.find(m => m.key === mk)?.unit), [unitAxis]);
  const primaryTcdUnit = METRIQUES.find(m => m.key === primaryTcdMetric)?.unit;

  // ── Idem pour la série temporelle (mode "serie") ──
  const serieUnits = useMemo(() => {
    const seen: string[] = [];
    for (const m of METRIQUES) {
      if (serieMetrics.has(m.key) && !seen.includes(m.unit)) seen.push(m.unit);
    }
    return seen.length ? seen : ['kWh'];
  }, [serieMetrics]);
  const serieMetricAxis = useCallback((unit?: string): 'left' | 'right' =>
    unit && serieUnits.indexOf(unit) > 0 ? 'right' : 'left', [serieUnits]);

  const getVal = (r: ShellyRow): number => (r[primaryTcdMetric] as number) ?? 0;

  const buildTcdGroup = (rows: ShellyRow[], key: string) => {
    const vals = rows.map(getVal);
    const perMetric: Record<string, number> = {};
    for (const mk of tcdMetrics) {
      const mvs = rows.map(r => (r[mk] as number) ?? 0);
      const isPower = METRIQUES.find(m => m.key === mk)?.unit === 'kW';
      perMetric[mk] = isPower
        ? +(mvs.length ? mvs.reduce((s, v) => s + v, 0) / mvs.length : 0).toFixed(2)
        : +mvs.reduce((s, v) => s + v, 0).toFixed(2);
    }
    const appareils = Array.from(new Set(rows.map(r => r.nomAppareil).filter((x): x is string => Boolean(x))));
    const emplacements = Array.from(new Set(rows.map(r => r.deviceLocation).filter((x): x is string => Boolean(x))));
    const pieces = Array.from(new Set(rows.map(r => r.deviceRoom).filter((x): x is string => Boolean(x))));
    return {
      label: key,
      ...perMetric,
      total: +vals.reduce((s, v) => s + v, 0).toFixed(2),
      moyenne: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : 0,
      max: vals.length ? +vals.reduce((a, v) => Math.max(a, v), -Infinity).toFixed(2) : 0,
      min: vals.length ? +vals.reduce((a, v) => Math.min(a, v), Infinity).toFixed(2) : 0,
      n: vals.length,
      _appareils: appareils,
      _emplacements: emplacements,
      _pieces: pieces,
    };
  };

  const tcdData = useMemo(() => {
    const src = slicerRows;
    if (src.length === 0) return [];

    // Drill-down : si un mois est sélectionné, afficher les jours de ce mois
    if (drillMonth) {
      const byDay: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        const mKey = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        if (mKey !== drillMonth) continue;
        const dKey = toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        if (!byDay[dKey]) byDay[dKey] = [];
        byDay[dKey].push(r);
      }
      return Object.entries(byDay).map(([label, rows]) => buildTcdGroup(rows, label));
    }

    if (tcdLigne === 'mois') {
      const byMois: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        const key = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        if (!byMois[key]) byMois[key] = [];
        byMois[key].push(r);
      }
      return Object.entries(byMois).map(([label, rows]) => buildTcdGroup(rows, label));
    }
    if (tcdLigne === 'jouSemaine') {
      const byJour: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        if (!byJour[r.jourSemaine]) byJour[r.jourSemaine] = [];
        byJour[r.jourSemaine].push(r);
      }
      return JOURS_SEMAINE.map(jour => buildTcdGroup(byJour[jour] ?? [], jour));
    }
    if (tcdLigne === 'appareil' || tcdLigne === 'piece') {
      const by: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        const k = tcdLigne === 'appareil' ? (r.nomAppareil || '(Sans nom)') : (r.deviceRoom || '(Sans pièce)');
        (by[k] ??= []).push(r);
      }
      // Tri par valeur décroissante de la métrique principale (plus gros consommateurs en premier)
      return Object.entries(by)
        .map(([label, rows]) => buildTcdGroup(rows, label))
        .sort((a, b) => (b[primaryTcdMetric] as number ?? 0) - (a[primaryTcdMetric] as number ?? 0));
    }
    const types = [
      { key: 'Jours ouvrés', rows: src.filter(r => !r.isWeekend && !r.isJourFerie) },
      { key: 'Samedis', rows: src.filter(r => toDate(r.date).getDay() === 6) },
      { key: 'Dimanches', rows: src.filter(r => toDate(r.date).getDay() === 0) },
      { key: 'Jours fériés', rows: src.filter(r => r.isJourFerie) },
    ];
    return types.map(({ key, rows }) => buildTcdGroup(rows, key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slicerRows, tcdLigne, tcdMetrics, drillMonth]);

  // Total de la métrique principale sur toutes les catégories → pour la colonne "Part %" (occupation)
  const tcdPrimaryTotal = useMemo(
    () => tcdData.reduce((s, r) => s + ((r as unknown as Record<string, number>)[primaryTcdMetric] ?? 0), 0),
    [tcdData, primaryTcdMetric]);
  const tcdPart = (row: Record<string, unknown>): string => {
    const v = (row as Record<string, number>)[primaryTcdMetric] ?? 0;
    return tcdPrimaryTotal > 0 ? `${fmtFr((v / tcdPrimaryTotal) * 100, 1)} %` : '—';
  };

  // Dimensions adaptatives du graphique TCD : libellés inclinés (mois/appareil/pièce/jour)
  // → besoin de plus de hauteur + grande marge basse pour ne rien couper.
  const tcdAngled = (tcdLigne !== 'jouSemaine' && tcdLigne !== 'typeJour') || !!drillMonth;
  // Plus de catégories ou libellés longs → graphique plus haut
  const tcdLongLabels = tcdData.some(d => String(d.label).length > 10);
  const tcdChartHeight = tcdAngled ? (tcdLongLabels ? 500 : 440) : 360;
  const tcdBottomMargin = tcdAngled ? (tcdLongLabels ? 130 : 95) : 28;
  const tcdXAxisHeight = tcdAngled ? (tcdLongLabels ? 125 : 90) : 32;
  // Variante compacte pour la grille 2×2 du plein écran
  const fsChartHeight = tcdAngled ? (tcdLongLabels ? 380 : 320) : 240;
  const fsBottomMargin = tcdAngled ? (tcdLongLabels ? 115 : 80) : 20;
  const fsXAxisHeight = tcdAngled ? (tcdLongLabels ? 110 : 78) : 28;

  // Stacked data phases A/B/C par mois
  // Série temporelle par phase (granularité = jour) — style Shelly Cloud
  const stackedData = useMemo(() => {
    const byDate = new Map<string, { d: Date; a: number; b: number; c: number }>();
    for (const r of slicerRows) {
      const d = toDate(r.date);
      const key = d.toISOString().slice(0, 10);
      const cur = byDate.get(key) ?? { d, a: 0, b: 0, c: 0 };
      cur.a += r.kwhA ?? 0;
      cur.b += r.kwhB ?? 0;
      cur.c += r.kwhC ?? 0;
      byDate.set(key, cur);
    }
    return Array.from(byDate.values())
      .sort((x, y) => x.d.getTime() - y.d.getTime())
      .map(({ d, a, b, c }) => ({
        label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        'Phase A': +a.toFixed(2),
        'Phase B': +b.toFixed(2),
        'Phase C': +c.toFixed(2),
        'Total':   +(a + b + c).toFixed(2),
      }));
  }, [slicerRows]);

  const profilSemaineData = useMemo(() =>
    JOURS_SEMAINE.map((jour, idx) => {
      const rows = filteredRows.filter(r => toDate(r.date).getDay() === idx);
      return {
        jour,
        kwhMoyen: rows.length ? +(rows.reduce((s, r) => s + r.kwhNet, 0) / rows.length).toFixed(2) : 0,
        n: rows.length,
      };
    }), [filteredRows]);

  const distributionData = useMemo(() => {
    if (filteredRows.length < 2) return [];
    const vals = filteredRows
      .map(r => r.kwhNet)
      .filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length < 2) return [];
    const dmin = vals.reduce((a, v) => Math.min(a, v), Infinity), dmax = vals.reduce((a, v) => Math.max(a, v), -Infinity);
    const step = (dmax - dmin) / 10;
    if (!isFinite(step) || step <= 0) return [];
    const classes = Array.from({ length: 10 }, (_, i) => ({
      label: `${(dmin + i * step).toFixed(0)}–${(dmin + (i + 1) * step).toFixed(0)}`,
      count: 0, min: dmin + i * step, max: dmin + (i + 1) * step,
    }));
    for (const v of vals) {
      const rawIdx = Math.floor((v - dmin) / step);
      if (!isFinite(rawIdx)) continue;
      const idx = Math.max(0, Math.min(rawIdx, 9));
      const bucket = classes[idx];
      if (bucket) bucket.count++;
    }
    return classes;
  }, [filteredRows]);

  const correlationData = useMemo(() =>
    filteredRows.map(r => ({ x: toDate(r.date).getDay(), y: +safeNum(r.kwhNet, 0).toFixed(2) })),
    [filteredRows]);

  // ============================================================
  return (
    <>
      <div className="space-y-4">

        {/* ---- Périmètre : un seul chargement pour toutes les vues ---- */}
        <PerimetreBar
          colonnesRecommandees={recommendedColumns}
          onCharge={(rows, colonnes, options, p) => { handleSupabaseData(rows, colonnes, options); setPerimetreAnalyse(p); }}
        />

        {/* ---- Qualité : une ligne, détail et réglages dans le Nettoyage ---- */}
        {supabaseRows.length > 0 && (
          <QualiteLigne q={qualite} onVoir={() => {
            setShellyRows(activeRows, supabaseChargement);
            setSelectedFile(null);
            setActiveTab('nettoyage');
          }} />
        )}

        {/* ---- Import fichier local ---- */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            onClick={() => setShowImport(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-400" />
              <span className="text-white font-medium text-sm">Analyser un fichier (CSV / XLSX) plutôt que les données Shelly</span>
              {dataSource && (
                <Badge className="bg-blue-600/30 text-blue-300 border-0 text-xs ml-2">
                  {localRows.length > 0 ? `${localRows.length} lignes · ${fileName}` : dataSource}
                </Badge>
              )}
            </div>
            {showImport ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {showImport && (
            <div className="border-t border-white/10 p-4 space-y-4">
              {/* Données Supabase actives */}
              {supabaseRows.length > 0 && (
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  <Database className="h-5 w-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{supabaseFileName}</p>
                    <p className="text-slate-400 text-xs">{supabaseRows.length} lignes chargées depuis Supabase</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={clearSupabase}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Fichiers déjà importés */}
              {state.files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Fichiers importés</p>
                  {state.files.map(f => {
                    const isActive = fileName === f.name && localRows.length > 0;
                    return (
                      <div
                        key={f.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors
                        ${isActive ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:bg-white/5'}`}
                      >
                        <FileSpreadsheet className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{f.name}</p>
                          <p className="text-slate-500 text-xs">{f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} col.</p>
                        </div>
                        {isActive
                          ? <Badge className="bg-blue-600/30 text-blue-300 border-0 text-xs">Actif</Badge>
                          : <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                              onClick={() => { void ensureFileContent(f.id).then(full => { if (full) loadFromImported(full); }); }}>Charger</Button>
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Nouveau fichier : un seul endroit pour l'importer et vérifier sa lecture */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>Nouveau fichier ? Importez-le dans <strong className="text-slate-300">Fichiers</strong> : dates, colonnes et unités s'y vérifient une fois pour toutes.</span>
                <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-slate-200 hover:bg-white/10"
                  onClick={() => setActiveTab('fichiers')}>Aller à Fichiers</Button>
              </div>

              {fichierIllisible && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Aucune date lisible dans « {fichierIllisible} ». Réimportez-le depuis <strong>Fichiers</strong> pour vérifier sa lecture (colonne date, ordre jour/mois).</span>
                </div>
              )}

              {/* Fichier chargé */}
              {localRows.length > 0 && (
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{fileName}</p>
                    <p className="text-slate-400 text-xs">{localRows.length} lignes chargées</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={clearLocal}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Pas de données ---- */}
        {activeRows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <BarChart2 className="h-16 w-16 opacity-20 mb-4" />
            <p className="text-lg font-medium">Aucune donnée à analyser</p>
            <p className="text-sm mt-1">
              Chargez depuis <strong className="text-green-400">Supabase</strong>, importez un fichier, ou utilisez l'onglet <strong className="text-slate-400">Upload</strong>
            </p>
          </div>
        )}

        {activeRows.length > 0 && (
          <>
            {/* Barre des vues : regroupées par question, filtres et affichage dans des menus */}
            {(() => {
              type Vue = { mode: AnalyseMode; libelle: string };
              const groupes: { cle: string; libelle: string; icone: React.ReactNode; vues: Vue[] }[] = [
                ...(hasEnergyData ? [
                  { cle: 'ensemble', libelle: "Vue d'ensemble", icone: <Zap className="h-3.5 w-3.5" />, vues: [{ mode: 'courbe' as AnalyseMode, libelle: 'Courbe de charge' }] },
                  { cle: 'profils', libelle: 'Profils', icone: <TrendingUp className="h-3.5 w-3.5" />, vues: [{ mode: 'profil_semaine' as AnalyseMode, libelle: 'Semaine type' }] },
                  { cle: 'detail', libelle: 'Détail temporel', icone: <Activity className="h-3.5 w-3.5" />, vues: [{ mode: 'serie' as AnalyseMode, libelle: 'Série temporelle' }] },
                  { cle: 'tcd', libelle: 'Tableau croisé', icone: <BarChart2 className="h-3.5 w-3.5" />, vues: [{ mode: 'tcd' as AnalyseMode, libelle: 'Tableau croisé' }] },
                  { cle: 'stats', libelle: 'Statistiques', icone: <Filter className="h-3.5 w-3.5" />, vues: [
                    { mode: 'distribution' as AnalyseMode, libelle: 'Distribution' },
                    { mode: 'correlation' as AnalyseMode, libelle: 'Corrélation' },
                  ] },
                ] : []),
                ...(hasEnvData ? [
                  { cle: 'env', libelle: libelleGrandeurs, icone: <Layers className="h-3.5 w-3.5" />, vues: [
                    { mode: 'env_courbe' as AnalyseMode, libelle: 'Courbe' },
                    { mode: 'env_bande' as AnalyseMode, libelle: 'Min/Max par jour' },
                    { mode: 'env_heatmap' as AnalyseMode, libelle: 'Carte de chaleur' },
                    { mode: 'env_profil24' as AnalyseMode, libelle: 'Profil 24 h' },
                  ] },
                ] : []),
                // Croisement consommation ↔ température : uniquement en jeu mixte
                ...(hasEnergyData && hasTemperature ? [
                  { cle: 'signature', libelle: 'Signature énergétique', icone: <Zap className="h-3.5 w-3.5" />, vues: [{ mode: 'signature' as AnalyseMode, libelle: 'Signature énergétique' }] },
                ] : []),
              ];
              const actif = groupes.find(g => g.vues.some(v => v.mode === mode)) ?? groupes[0];
              const nbFiltres = slicerAppareil.length + slicerPiece.length + (showFeries ? 0 : 1) + (showWeekends ? 0 : 1);
              return (
                <div className="bg-white/5 rounded-xl border border-white/10 p-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {groupes.map(g => (
                      <button key={g.cle} onClick={() => setMode(g.vues[0].mode)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${actif?.cle === g.cle ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                        style={actif?.cle === g.cle ? { backgroundColor: ACCENT_COLOR + '40', color: ACCENT_COLOR } : {}}>
                        {g.icone} {g.libelle}
                      </button>
                    ))}
                    <div className="flex items-center gap-2 ml-auto">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-slate-300 hover:text-white border border-white/15">
                            <Filter className="h-3.5 w-3.5" /> Filtres{nbFiltres > 0 && <span className="ml-1 px-1.5 rounded-full bg-violet-600/50 text-white">{nbFiltres}</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3 bg-[#1a1d2e] border-white/20 space-y-3">
                          {availableAppareils.length > 0 && (
                            <MultiSelectFilter label="Appareil" icon={<Zap className="h-3.5 w-3.5" />}
                              options={availableAppareils} selected={slicerAppareil} onChange={setSlicerAppareil} />
                          )}
                          {availablePieces.length > 0 && (
                            <MultiSelectFilter label="Pièce" icon={<Layers className="h-3.5 w-3.5" />}
                              options={availablePieces} selected={slicerPiece} onChange={setSlicerPiece} />
                          )}
                          <div className="flex items-center gap-2">
                            <Switch id="fe2" checked={showFeries} onCheckedChange={setShowFeries} className="data-[state=checked]:bg-purple-500 scale-75" />
                            <Label htmlFor="fe2" className="text-slate-300 text-xs">Inclure les jours fériés</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch id="we2" checked={showWeekends} onCheckedChange={setShowWeekends} className="data-[state=checked]:bg-yellow-500 scale-75" />
                            <Label htmlFor="we2" className="text-slate-300 text-xs">Inclure les week-ends</Label>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {/* Couleurs, légendes et titre — mêmes réglages que le module Mesures. */}
                      <ChartOptions chartId={`iot:${mode}`} defaultTitle={autoChartTitle} />
                      <span className="text-slate-500 text-xs">
                        {(ENV_MODES.includes(mode) ? envRows.length : filteredRows.length).toLocaleString('fr-FR')} relevés
                      </span>
                      <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 px-2" onClick={exportCSV} title="Exporter les relevés (Excel)">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-slate-400 hover:text-red-400 h-7 px-2" onClick={exportPDF} disabled={exportingPDF} title="Exporter le graphique en PDF">
                        {exportingPDF
                          ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                          : <FileText className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  {actif && actif.vues.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1 pl-1">
                      {actif.vues.map(v => (
                        <button key={v.mode} onClick={() => setMode(v.mode)}
                          className={`px-2.5 py-1 rounded-md text-xs ${mode === v.mode ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}>
                          {v.libelle}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div ref={chartRef} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              {/* Titre repris dans l'export PDF/image */}
              <p className="text-white font-medium text-sm">{displayChartTitle}</p>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div />
                {mode === 'serie' && (
                  <div className="flex items-center gap-2 flex-wrap max-w-[65%] justify-end">
                    {/* Aperçu pills des métriques sélectionnées */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {METRIQUES.filter(m => serieMetrics.has(m.key)).slice(0, 5).map(m => (
                        <span key={m.key}
                          className="inline-flex items-center gap-1 text-[0.625rem] px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: m.color + '25', color: m.color }}
                          title={`${m.label} (${m.unit})`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                          {m.label.split(' — ').pop()?.split(' (')[0] ?? m.label}
                          <span className="opacity-60">{m.unit}</span>
                        </span>
                      ))}
                      {serieMetrics.size > 5 && (
                        <span className="text-[0.625rem] text-slate-500">+{serieMetrics.size - 5}</span>
                      )}
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm"
                          className="bg-white/5 border-white/20 text-white text-sm h-8 gap-2">
                          <span className="text-slate-400 text-xs">Métriques :</span>
                          <span className="text-blue-300">{serieMetrics.size}</span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 bg-[#1a1d2e] border-white/20 p-2" align="end">
                        <div className="flex items-center justify-between px-2 py-1 mb-1">
                          <span className="text-slate-300 text-xs font-medium">Métriques à afficher</span>
                          <button
                            onClick={() => setSerieMetrics(serieMetrics.size === METRIQUES.length ? new Set() : new Set(METRIQUES.map(m => m.key)))}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {serieMetrics.size === METRIQUES.length ? 'Aucune' : 'Toutes'}
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                          {(['Énergie', 'Phase A', 'Phase B', 'Phase C', 'Puissance'] as MetricGroup[]).map(group => {
                            const groupMetrics = METRIQUES.filter(m => m.group === group);
                            if (groupMetrics.length === 0) return null;
                            return (
                              <div key={group}>
                                <div className="text-[0.625rem] text-slate-500 uppercase tracking-wide px-2 mb-1">{group}</div>
                                {groupMetrics.map(m => {
                                  const checked = serieMetrics.has(m.key);
                                  return (
                                    <label
                                      key={m.key}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                                    >
                                      <Checkbox checked={checked} onCheckedChange={() => toggleSerieMetric(m.key)} />
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                      <span className="text-white text-xs flex-1 truncate">{m.label}</span>
                                      <span className="text-slate-500 text-[0.625rem]">{m.unit}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {serieMetrics.size === 0 && (
                      <span className="text-amber-400 text-xs ml-1">Aucune métrique sélectionnée</span>
                    )}
                  </div>
                )}
              </div>

              {/* ---- Courbe de charge (ex-onglet Profil de charge) ---- */}
              {mode === 'courbe' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <ProfilChargeTab
                    perimetre={supabaseRows.length > 0 ? perimetreAnalyse : null}
                    lignes={supabaseRows.length > 0 ? undefined : activeRows}
                  />
                </div>
              )}

              {/* ---- Vues environnementales ---- */}
              {ENV_MODES.includes(mode) && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
                  {/* Sélecteur de grandeur — équivalent env du sélecteur de métriques kWh */}
                  {envMetricsAvailable.length > 12 ? (
                    // Analyseur réseau : des dizaines de grandeurs, une liste plutôt que des pastilles
                    <select value={grandeurActive?.key ?? ''} onChange={e => setEnvMetric(e.target.value)}
                      className="h-8 rounded-md bg-white/5 border border-white/20 text-white text-xs px-2 max-w-full">
                      {envMetricsAvailable.map(m => <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>)}
                    </select>
                  ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {envMetricsAvailable.map(m => (
                      <button key={m.key}
                        onClick={() => setEnvMetric(m.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                          ${envMetric === m.key ? 'text-white' : 'text-slate-400 border-white/15 hover:text-white hover:bg-white/5'}`}
                        style={envMetric === m.key
                          ? { backgroundColor: m.color + '30', borderColor: m.color + '60', color: m.color }
                          : {}}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                        {m.label}{m.unit ? ` (${m.unit})` : ''}
                      </button>
                    ))}
                  </div>
                  )}
                  {grandeurActive && <>
                    {mode === 'env_courbe' && <EnvCourbeView rows={envRows} g={grandeurActive} />}
                    {mode === 'env_bande' && <EnvBandeView rows={envRows} g={grandeurActive} />}
                    {mode === 'env_heatmap' && <EnvHeatmapView rows={envRows} g={grandeurActive} />}
                    {mode === 'env_profil24' && <EnvProfil24View rows={envRows} g={grandeurActive} />}
                  </>}
                </div>
              )}

              {/* ---- Signature énergétique (jeu mixte uniquement) ---- */}
              {mode === 'signature' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <SignatureView envRows={envRows} energyRows={filteredRows} />
                </div>
              )}

              {/* ---- Série temporelle ---- */}
              {mode === 'serie' && (
                <div className="space-y-4">
                  {/* Identité appareil */}
                  {(serieData[0]?.appareil || serieData[0]?.emplacement || serieData[0]?.piece) && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      {serieData[0].appareil && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                          <span className="text-cyan-500 font-normal">name</span>&nbsp;{serieData[0].appareil}
                        </span>
                      )}
                      {serieData[0].emplacement && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                          <span className="text-yellow-500 font-normal">site</span>&nbsp;{serieData[0].emplacement}
                        </span>
                      )}
                      {serieData[0].piece && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                          <span className="text-purple-500 font-normal">room</span>&nbsp;{serieData[0].piece}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold text-sm">Série temporelle</h3>
                      <span className="text-slate-500 text-xs">{serieMetrics.size} métrique{serieMetrics.size > 1 ? 's' : ''}</span>
                    </div>
                    {/* « Agrandir » : la courbe seule, en plein écran sur fond blanc (remarque du manager, 12/10). */}
                    <ChartZoom title={`Série temporelle — ${displayChartTitle}`} className="pt-7">
                    <ResponsiveContainer width="100%" height={520}>
                      <AreaChart data={serieData} margin={{ top: 10, right: 30, bottom: 35, left: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: '#cbd5e1', fontSize: 10 }} interval="preserveStartEnd"
                          label={{ value: 'Temps (date)', position: 'insideBottom', offset: -5, fill: '#cbd5e1', fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: 10 }}
                          tickFormatter={(v: number) => fmtFr(v, v >= 100 ? 0 : 1)}
                          label={{ value: axisLabelForUnit(serieUnits[0]), angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 11, offset: 5 }} />
                        {serieUnits.length > 1 && (
                          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: 10 }}
                            tickFormatter={(v: number) => fmtFr(v, v >= 100 ? 0 : 1)}
                            label={{ value: axisLabelForUnit(serieUnits[1]), angle: 90, position: 'insideRight', fill: '#cbd5e1', fontSize: 11, offset: 5 }} />
                        )}
                        <Tooltip content={<SerieTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 10 }}
                          onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                        <ReferenceLine yAxisId={serieMetricAxis(METRIQUES.find(m => m.key === primarySerieMetric)?.unit)} y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4"
                          label={{ value: `Moy. ${fmt1(stats.moyenne)} ${METRIQUES.find(m => m.key === primarySerieMetric)?.unit ?? ''}`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                        {METRIQUES.filter(m => serieMetrics.has(m.key)).map(m => (
                          <Area key={m.key} yAxisId={serieMetricAxis(m.unit)} type="monotone" dataKey={m.key} name={`${m.label} (${m.unit})`}
                            stroke={m.color} fill={`${m.color}25`}
                            strokeWidth={m.key === primarySerieMetric ? 2.5 : 1.5}
                            dot={false}
                            hide={isHidden(m.key)} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                    </ChartZoom>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {[
                      { label: 'Moyenne', value: fmt2(stats.moyenne), color: 'text-blue-400', qui: null },
                      { label: 'Médiane', value: fmt2(stats.mediane), color: 'text-cyan-400', qui: null },
                      { label: 'Écart-type', value: fmt2(stats.ecartType), color: 'text-purple-400', qui: null },
                      { label: 'P25', value: fmt2(stats.p25), color: 'text-green-400', qui: null },
                      { label: 'Minimum', value: fmt2(stats.min), color: 'text-green-400', qui: statsQui.min },
                      { label: 'Maximum', value: fmt2(stats.max), color: 'text-orange-400', qui: statsQui.max },
                    ].map(s => (
                      <div key={s.label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
                        <p className="text-slate-500 text-xs">{s.label}</p>
                        <p className={`${s.color} font-bold text-sm mt-1`}>{s.value}</p>
                        {s.qui && <p className="text-slate-500 text-[0.625rem] mt-0.5 leading-tight truncate" title={s.qui}>{s.qui}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- TCD ---- */}
              {mode === 'tcd' && (
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select value={tcdLigne} onValueChange={(v) => { setTcdLigne(v as typeof tcdLigne); setDrillMonth(null); setCrossFilter(null); }}>
                        <SelectTrigger className="w-44 bg-white/5 border-white/20 text-white text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          <SelectItem value="mois">Mois</SelectItem>
                          <SelectItem value="jouSemaine">Jour de semaine</SelectItem>
                          <SelectItem value="typeJour">Type de jour</SelectItem>
                          {availableAppareils.length > 0 && <SelectItem value="appareil">Par appareil</SelectItem>}
                          {availablePieces.length > 0 && <SelectItem value="piece">Par pièce</SelectItem>}
                        </SelectContent>
                      </Select>
                      {/* Sélecteur métrique (multi-select) */}
                      <div className="flex flex-wrap gap-1">
                        {METRIQUES.map(m => (
                          <button key={m.key} onClick={() => toggleTcdMetric(m.key)}
                            className={`px-2 py-1 rounded text-xs font-medium border transition-all ${tcdMetrics.has(m.key) ? 'border-transparent text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}
                            style={tcdMetrics.has(m.key) ? { backgroundColor: m.color + '30', borderColor: m.color + '60', color: m.color } : {}}
                          >{m.label}</button>
                        ))}
                      </div>
                      {/* Sélecteur type graphique */}
                      <div className="flex gap-1 border border-white/10 rounded-lg p-0.5">
                        {(['bar', 'line', 'area', 'pie'] as ChartType[]).map(ct => (
                          <button key={ct} onClick={() => setChartType(ct)}
                            className={`px-2 py-0.5 rounded text-xs transition-all ${chartType === ct ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                          >{{ bar: 'Barres', line: 'Ligne', area: 'Aire', pie: 'Camembert' }[ct]}</button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setFullscreenTCD(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-xs transition-all"
                      title="Ouvrir en plein écran">
                      <Maximize2 className="h-3.5 w-3.5" /><span>Plein écran</span>
                    </button>
                  </div>

                  {/* Breadcrumb drill-down */}
                  {drillMonth && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="hover:text-white">Tous les mois</button>
                      <ChevronRight className="h-3 w-3" />
                      <span className="text-white font-medium">{drillMonth}</span>
                      <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="ml-1 text-slate-500 hover:text-white"><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* Slicers compacts */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {[
                      { label: 'Hivernage', set: setSlicerSaison, arr: slicerSaison },
                      { label: 'Sèche', set: setSlicerSaison, arr: slicerSaison },
                      { label: 'Jours ouvrés', set: setSlicerTypeJour, arr: slicerTypeJour },
                      { label: 'Samedis', set: setSlicerTypeJour, arr: slicerTypeJour },
                      { label: 'Dimanches', set: setSlicerTypeJour, arr: slicerTypeJour },
                    ].map(({ label, set, arr }) => {
                      const active = arr.includes(label);
                      return (
                        <button key={label} onClick={() => set(prev => active ? prev.filter(x => x !== label) : [...prev, label])}
                          className={`px-2 py-0.5 rounded-full border transition-all ${active ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-slate-500 hover:text-white'}`}
                        >{label}</button>
                      );
                    })}
                    {(slicerSaison.length + slicerTypeJour.length) > 0 && (
                      <button onClick={() => { setSlicerSaison([]); setSlicerTypeJour([]); }}
                        className="px-2 py-0.5 rounded-full border border-red-500/30 text-red-400 hover:text-red-300 text-xs">✕ Reset</button>
                    )}
                  </div>

                  {/* Cross-filter banner */}
                  {crossFilter && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-blue-300">Filtré sur <span className="font-semibold">{crossFilter}</span> — {crossFilteredRows.length} lignes</span>
                      <button onClick={() => setCrossFilter(null)} className="ml-auto text-blue-500/60 hover:text-blue-300"><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* Graphique principal */}
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <TcdChart
                      compact={false}
                      data={tcdData}
                      chartType={chartType}
                      metrics={tcdMetrics}
                      primaryMetric={primaryTcdMetric}
                      units={tcdUnits}
                      crossFilter={crossFilter}
                      onBarClick={(e) => {
                        if (!e?.activeLabel) return;
                        const lbl = e.activeLabel as string;
                        if (tcdLigne === 'mois' && !drillMonth) { setDrillMonth(lbl); setCrossFilter(lbl); }
                        else { setCrossFilter(prev => prev === lbl ? null : lbl); }
                      }}
                      onPieClick={(entry) => { const lbl = entry?.label; if (lbl) setCrossFilter(prev => prev === lbl ? null : lbl); }}
                      metricAxis={metricAxis}
                      unitAxis={unitAxis}
                      primaryUnit={primaryTcdUnit}
                      accentColor={ACCENT_COLOR}
                      angled={tcdAngled}
                      height={tcdChartHeight}
                      bottomMargin={tcdBottomMargin}
                      xAxisHeight={tcdXAxisHeight}
                      xAxisLabel={drillMonth ? 'Jour' : TCD_LIGNE_LABEL[tcdLigne]}
                    />
                  </div>

                  {/* Tableau agrégé */}
                  <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          {['Catégorie', 'N'].map(h => <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium text-xs">{h}</th>)}
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            return <th key={mk} className="px-4 py-3 text-left font-medium text-xs" style={{ color: meta?.color }}>
                              {meta?.label ?? mk}{meta?.unit && <span className="text-slate-500 ml-1 font-normal">({meta.unit})</span>}
                            </th>;
                          })}
                          {['Moyenne', 'Max', 'Min'].map(h => {
                            const u = METRIQUES.find(m => m.key === primaryTcdMetric)?.unit;
                            return <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium text-xs">{h}{u && <span className="text-slate-500 ml-1 font-normal">({u})</span>}</th>;
                          })}
                          <th className="px-4 py-3 text-left text-amber-300 font-medium text-xs">Part <span className="text-slate-500 font-normal">(% {METRIQUES.find(m => m.key === primaryTcdMetric)?.label})</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tcdData.map((row, i) => (
                          <tr key={i} onClick={() => setCrossFilter(prev => prev === row.label ? null : row.label)}
                            className={`border-t border-white/10 cursor-pointer transition-colors ${crossFilter === row.label ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                            <td className="px-4 py-2 text-white font-medium text-xs">{row.label}</td>
                            <td className="px-4 py-2 text-slate-400 text-xs">{row.n}</td>
                            {Array.from(tcdMetrics).map(mk => {
                              const meta = METRIQUES.find(m => m.key === mk);
                              return <td key={mk} className="px-4 py-2 font-medium text-xs" style={{ color: meta?.color }}>
                                {fmtFr((row as unknown as Record<string, number>)[mk] ?? 0, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                              </td>;
                            })}
                            <td className="px-4 py-2 text-cyan-400 text-xs">{fmtFr(row.moyenne, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                            <td className="px-4 py-2 text-green-400 text-xs">{fmtFr(row.max, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                            <td className="px-4 py-2 text-slate-400 text-xs">{fmtFr(row.min, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                            <td className="px-4 py-2 text-amber-300 font-semibold text-xs">{tcdPart(row)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                          <td className="px-4 py-2 text-white text-xs">TOTAL</td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{tcdData.reduce((s, r) => s + r.n, 0)}</td>
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            const total = tcdData.reduce((s, r) => s + ((r as unknown as Record<string, number>)[mk] ?? 0), 0);
                            return <td key={mk} className="px-4 py-2 text-xs" style={{ color: meta?.color }}>
                              {fmtFr(total, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                            </td>;
                          })}
                          <td colSpan={3} />
                          <td className="px-4 py-2 text-amber-300 text-xs">100 %</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Données brutes repliables */}
                  <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <button onClick={() => { setShowRawData(v => !v); setRawPage(0); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-slate-400" />
                        Données brutes ({(crossFilter ? crossFilteredRows : slicerRows).length} lignes)
                      </span>
                      {showRawData ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                    {showRawData && (() => {
                      const rows = crossFilter ? crossFilteredRows : slicerRows;
                      const pageRows = rows.slice(rawPage * RAW_PAGE_SIZE, (rawPage + 1) * RAW_PAGE_SIZE);
                      const totalPages = Math.ceil(rows.length / RAW_PAGE_SIZE);
                      return (
                        <div className="border-t border-white/10">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-white/5 sticky top-0">
                                <tr>{['Date', 'Heure', 'Jour', 'kWh Net', 'kWh Total', 'Ph A (kWh)', 'Ph B (kWh)', 'Ph C (kWh)', 'Puiss. (kW)', 'Saison', 'Type'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody>
                                {pageRows.map((r, i) => (
                                  <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                                    <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{toDate(r.date).toLocaleDateString('fr-FR')}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{toDate(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="px-3 py-1.5 text-slate-400">{r.jourSemaine}</td>
                                    <td className="px-3 py-1.5 text-purple-400 font-medium">{fmt3(r.kwhNet)}</td>
                                    <td className="px-3 py-1.5 text-blue-400">{fmt3(r.kwhTotal)}</td>
                                    <td className="px-3 py-1.5 text-green-400">{fmt3(r.kwhA)}</td>
                                    <td className="px-3 py-1.5 text-yellow-400">{fmt3(r.kwhB)}</td>
                                    <td className="px-3 py-1.5 text-pink-400">{fmt3(r.kwhC)}</td>
                                    <td className="px-3 py-1.5 text-cyan-400">{fmt3(r.puissKwTotal)}</td>
                                    <td className="px-3 py-1.5 text-slate-400">{r.saison}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{r.isJourFerie ? 'Férié' : r.isWeekend ? 'Weekend' : 'Ouvré'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-xs text-slate-400">
                              <span>{rawPage * RAW_PAGE_SIZE + 1}–{Math.min((rawPage + 1) * RAW_PAGE_SIZE, rows.length)} / {rows.length}</span>
                              <div className="flex gap-1">
                                <button disabled={rawPage === 0} onClick={() => setRawPage(p => p - 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">‹</button>
                                <button disabled={rawPage >= totalPages - 1} onClick={() => setRawPage(p => p + 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">›</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* ---- Profil semaine ---- */}
            {mode === 'profil_semaine' && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-white font-semibold text-sm mb-4">Moyenne par jour de semaine</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="jour" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                      <Bar dataKey="kwhMoyen" name="kwhNet" radius={[4, 4, 0, 0]}>
                        {profilSemaineData.map((_, i) => (
                          <Cell key={i} fill={i === 0 || i === 6 ? '#a78bfa' : ACCENT_COLOR} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    ['Moyenne', fmt2(stats.moyenne), 'text-blue-400'],
                    ['Médiane', fmt2(stats.mediane), 'text-cyan-400'],
                    ['Écart-type', fmt2(stats.ecartType), 'text-purple-400'],
                    ['P25', fmt2(stats.p25), 'text-green-400'],
                    ['P75', fmt2(stats.p75), 'text-yellow-400'],
                    ['Max', fmt2(stats.max), 'text-orange-400'],
                  ].map(([label, val, color]) => (
                    <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
                      <p className="text-slate-500 text-xs">{label}</p>
                      <p className={`${color} font-bold text-sm mt-1`}>{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---- Distribution ---- */}
            {mode === 'distribution' && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-white font-semibold text-sm mb-4">Distribution (histogramme)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={distributionData} margin={{ top: 5, right: 20, bottom: 25, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Bar dataKey="count" name="Nb jours" radius={[4, 4, 0, 0]}>
                        {distributionData.map((d, i) => (
                          <Cell key={i} fill={d.min < safeNum(stats.p25, 0) ? '#a78bfa' : d.min < safeNum(stats.p75, 0) ? ACCENT_COLOR : '#f59e0b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-3 text-xs">
                  {[
                    { color: 'bg-purple-500', label: `Faible (< ${fmt0(stats.p25)})` },
                    { color: '', label: 'Normal (P25–P75)', style: { backgroundColor: ACCENT_COLOR } },
                    { color: 'bg-yellow-500', label: `Élevé (> ${fmt0(stats.p75)})` },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5 text-slate-400">
                      <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} style={l.style} />
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---- Corrélation ---- */}
            {mode === 'correlation' && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-white font-semibold text-sm mb-4">Consommation vs Jour de semaine</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 5, right: 20, bottom: tcdBottomMargin, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" dataKey="x" domain={[0, 6]} tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={(v) => JOURS_SEMAINE[v]} />
                      <YAxis type="number" dataKey="y" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(v: number, name) => [
                          name === 'y' ? `${v} kWh` : JOURS_SEMAINE[v as number],
                          name === 'y' ? 'Énergie nette' : 'Jour',
                        ]}
                      />
                      <Scatter data={correlationData} fill={ACCENT_COLOR} opacity={0.7} r={3} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h4 className="text-white font-medium text-sm mb-3">Courbe de tendance hebdomadaire</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="jour" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Line type="monotone" dataKey="kwhMoyen" name="kwhNet" stroke={ACCENT_COLOR} strokeWidth={2} dot={{ fill: ACCENT_COLOR, r: 4 }} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================
        OVERLAY FULLSCREEN — Dashboard Power BI
    ============================================================ */}
      {fullscreenTCD && (
        <div className="fixed inset-0 z-50 bg-[#0f111a] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <BarChart2 className="h-4 w-4 text-purple-400" />
              <span className="text-white font-semibold text-sm">TCD — {dataSource ?? 'Aucune donnée'}</span>
              <span className="text-slate-500 text-xs">{slicerRows.length} lignes</span>
            </div>
            {/* Sélecteur métrique (multi-select) */}
            <div className="flex flex-wrap gap-1">
              {METRIQUES.map(m => (
                <button key={m.key} onClick={() => toggleTcdMetric(m.key)}
                  className="px-2.5 py-1 rounded text-xs font-medium border transition-all"
                  style={tcdMetrics.has(m.key)
                    ? { backgroundColor: m.color + '25', borderColor: m.color + '60', color: m.color }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: '#64748b' }}
                >{m.label}</button>
              ))}
            </div>
            {/* Type graphique */}
            <div className="flex gap-1 border border-white/10 rounded-lg p-0.5">
              {(['bar', 'line', 'area', 'pie'] as ChartType[]).map(ct => (
                <button key={ct} onClick={() => setChartType(ct)}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${chartType === ct ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                >{{ bar: 'Barres', line: 'Ligne', area: 'Aire', pie: 'Camembert' }[ct]}</button>
              ))}
            </div>
            <button onClick={() => setFullscreenTCD(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs">
              <Minimize2 className="h-3.5 w-3.5" /><span>Réduire</span>
            </button>
          </div>

          {/* Slicers */}
          <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-white/5 bg-white/3 shrink-0 text-xs">
            <span className="text-slate-500 self-center mr-1">Filtres :</span>
            {[
              { label: 'Hivernage', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Sèche', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Période chaude', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Jours ouvrés', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Samedis', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Dimanches', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Jours fériés', set: setSlicerTypeJour, arr: slicerTypeJour },
            ].map(({ label, set, arr }) => {
              const active = arr.includes(label);
              return (
                <button key={label} onClick={() => set(prev => active ? prev.filter(x => x !== label) : [...prev, label])}
                  className={`px-2.5 py-0.5 rounded-full border transition-all ${active ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
                >{label}</button>
              );
            })}
            {(slicerSaison.length + slicerTypeJour.length) > 0 && (
              <button onClick={() => { setSlicerSaison([]); setSlicerTypeJour([]); }}
                className="px-2.5 py-0.5 rounded-full border border-red-500/30 text-red-400 hover:text-red-300">✕ Reset</button>
            )}
            {crossFilter && (
              <span className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                Filtre : <strong>{crossFilter}</strong>
                <button onClick={() => setCrossFilter(null)}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>

          {/* Corps scrollable */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Breadcrumb drill */}
            {drillMonth && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="hover:text-white">Tous les mois</button>
                <ChevronRight className="h-3 w-3" />
                <span className="text-white font-medium">{drillMonth}</span>
                <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="ml-1 text-slate-500 hover:text-white"><X className="h-3 w-3" /></button>
              </div>
            )}

            {/* Grille 2×2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart 1 : TCD principal */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-xs font-semibold">
                    {drillMonth ? `Jours — ${drillMonth}` : `Par ${TCD_LIGNE_LABEL[tcdLigne]}`}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {([
                      'mois', 'jouSemaine', 'typeJour',
                      ...(availableAppareils.length > 0 ? ['appareil'] as const : []),
                      ...(availablePieces.length > 0 ? ['piece'] as const : []),
                    ] as typeof tcdLigne[]).map(v => (
                      <button key={v} onClick={() => { setTcdLigne(v); setDrillMonth(null); setCrossFilter(null); }}
                        className={`px-2 py-0.5 rounded text-xs border transition-all ${tcdLigne === v ? 'bg-white/15 border-white/20 text-white' : 'border-white/10 text-slate-500 hover:text-white'}`}
                      >{{ mois: 'Mois', jouSemaine: 'Semaine', typeJour: 'Type', appareil: 'Appareil', piece: 'Pièce' }[v]}</button>
                    ))}
                  </div>
                </div>
                <TcdChart
                  compact
                  data={tcdData}
                  chartType={chartType}
                  metrics={tcdMetrics}
                  primaryMetric={primaryTcdMetric}
                  units={tcdUnits}
                  crossFilter={crossFilter}
                  onBarClick={(e) => {
                    if (!e?.activeLabel) return;
                    const lbl = e.activeLabel as string;
                    if (tcdLigne === 'mois' && !drillMonth) { setDrillMonth(lbl); setCrossFilter(lbl); }
                    else setCrossFilter(prev => prev === lbl ? null : lbl);
                  }}
                  onPieClick={(entry) => { const lbl = entry?.label; if (lbl) setCrossFilter(prev => prev === lbl ? null : lbl); }}
                  metricAxis={metricAxis}
                  unitAxis={unitAxis}
                  primaryUnit={primaryTcdUnit}
                  accentColor={ACCENT_COLOR}
                  angled={tcdAngled}
                  height={fsChartHeight}
                  bottomMargin={fsBottomMargin}
                  xAxisHeight={fsXAxisHeight}
                />
              </div>

              {/* Chart 2 : Phases A/B/C — séries temporelles superposées (style Shelly Cloud) */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <p className="text-white text-xs font-semibold mb-2">Répartition Phases A / B / C</p>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={stackedData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <defs>
                      <linearGradient id="phA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phTot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-30} textAnchor="end" height={50} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} unit=" kWh" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#94a3b8' }}
                      formatter={(v: number, name: string) => [`${fmtFr(v, 3)} kWh`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer' }} onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                    <Area type="monotone" dataKey="Total"   stroke="#22c55e" fill="url(#phTot)" strokeWidth={2}   hide={isHidden('Total')} />
                    <Area type="monotone" dataKey="Phase A" stroke="#a855f7" fill="url(#phA)"   strokeWidth={1.5} hide={isHidden('Phase A')} />
                    <Area type="monotone" dataKey="Phase B" stroke="#f59e0b" fill="url(#phB)"   strokeWidth={1.5} hide={isHidden('Phase B')} />
                    <Area type="monotone" dataKey="Phase C" stroke="#06b6d4" fill="url(#phC)"   strokeWidth={1.5} hide={isHidden('Phase C')} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3 : Série temporelle cross-filtrée */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <p className="text-white text-xs font-semibold mb-2">Série temporelle {crossFilter ? `— ${crossFilter}` : ''}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={(crossFilter ? crossFilteredRows : slicerRows).map(r => {
                    const obj: Record<string, unknown> = { date: toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) };
                    for (const mk of tcdMetrics) obj[mk] = +((r[mk] as number) ?? 0).toFixed(2);
                    return obj;
                  })} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#cbd5e1', fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: 9 }} label={{ value: axisLabelForUnit(tcdUnits[0]), angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }} />
                    {tcdUnits.length > 1 && (
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: 9 }} label={{ value: axisLabelForUnit(tcdUnits[1]), angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 10 }} />
                    )}
                    <Tooltip content={<TcdTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    {Array.from(tcdMetrics).map(mk => {
                      const meta = METRIQUES.find(m => m.key === mk);
                      return <Area key={mk} yAxisId={metricAxis(mk)} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? ACCENT_COLOR} fill={(meta?.color ?? ACCENT_COLOR) + '15'} strokeWidth={2} dot={false} />;
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 4 : Tableau agrégé */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 overflow-auto">
                <p className="text-white text-xs font-semibold mb-2">Synthèse</p>
                <table className="min-w-full text-xs">
                  <thead><tr>
                    {['Catégorie', 'N'].map(h => <th key={h} className="px-3 py-1.5 text-left text-slate-400 font-medium">{h}</th>)}
                    {Array.from(tcdMetrics).map(mk => {
                      const meta = METRIQUES.find(m => m.key === mk);
                      return <th key={mk} className="px-3 py-1.5 text-left font-medium" style={{ color: meta?.color }}>
                        {meta?.label ?? mk}{meta?.unit && <span className="text-slate-500 ml-1 font-normal">({meta.unit})</span>}
                      </th>;
                    })}
                    {['Moy.', 'Max', 'Min'].map(h => {
                      const u = METRIQUES.find(m => m.key === primaryTcdMetric)?.unit;
                      return <th key={h} className="px-3 py-1.5 text-left text-slate-400 font-medium">{h}{u && <span className="text-slate-500 ml-1 font-normal">({u})</span>}</th>;
                    })}
                  </tr></thead>
                  <tbody>
                    {tcdData.map((row, i) => (
                      <tr key={i} onClick={() => setCrossFilter(prev => prev === row.label ? null : row.label)}
                        className={`border-t border-white/5 cursor-pointer ${crossFilter === row.label ? 'bg-yellow-500/10' : 'hover:bg-white/5'}`}>
                        <td className="px-3 py-1.5 text-white font-medium">{row.label}</td>
                        <td className="px-3 py-1.5 text-slate-400">{row.n}</td>
                        {Array.from(tcdMetrics).map(mk => {
                          const meta = METRIQUES.find(m => m.key === mk);
                          return <td key={mk} className="px-3 py-1.5 font-medium" style={{ color: meta?.color }}>
                            {fmtFr((row as unknown as Record<string, number>)[mk] ?? 0, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                          </td>;
                        })}
                        <td className="px-3 py-1.5 text-cyan-400">{fmtFr(row.moyenne, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                        <td className="px-3 py-1.5 text-green-400">{fmtFr(row.max, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                        <td className="px-3 py-1.5 text-slate-400">{fmtFr(row.min, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/20 font-bold">
                      <td className="px-3 py-1.5 text-white">TOTAL</td>
                      <td className="px-3 py-1.5 text-slate-400">{tcdData.reduce((s, r) => s + r.n, 0)}</td>
                      {Array.from(tcdMetrics).map(mk => {
                        const meta = METRIQUES.find(m => m.key === mk);
                        const total = tcdData.reduce((s, r) => s + ((r as unknown as Record<string, number>)[mk] ?? 0), 0);
                        return <td key={mk} className="px-3 py-1.5" style={{ color: meta?.color }}>
                          {fmtFr(total, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                        </td>;
                      })}
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Données brutes plein écran */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                <span className="text-white text-xs font-semibold flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  Données brutes — {(crossFilter ? crossFilteredRows : slicerRows).length} lignes
                  {crossFilter && <span className="text-yellow-400 font-normal">· filtrées sur {crossFilter}</span>}
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {fsPage * FS_PAGE_SIZE + 1}–{Math.min((fsPage + 1) * FS_PAGE_SIZE, (crossFilter ? crossFilteredRows : slicerRows).length)} / {(crossFilter ? crossFilteredRows : slicerRows).length}
                  <button disabled={fsPage === 0} onClick={() => setFsPage(p => p - 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">‹</button>
                  <button disabled={fsPage >= Math.ceil((crossFilter ? crossFilteredRows : slicerRows).length / FS_PAGE_SIZE) - 1} onClick={() => setFsPage(p => p + 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">›</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/5 sticky top-0">
                    <tr>{['Date', 'Heure', 'Jour', 'Saison', 'kWh Net', 'kWh Total', 'Ph A (kWh)', 'Ph B (kWh)', 'Ph C (kWh)', 'Puiss. (kW)'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {(crossFilter ? crossFilteredRows : slicerRows).slice(fsPage * FS_PAGE_SIZE, (fsPage + 1) * FS_PAGE_SIZE).map((r, i) => (
                      <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{toDate(r.date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{toDate(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-slate-400">{r.jourSemaine}</td>
                        <td className="px-3 py-1.5 text-slate-400">{r.saison}</td>
                        <td className="px-3 py-1.5 text-purple-400 font-medium">{fmt3(r.kwhNet)}</td>
                        <td className="px-3 py-1.5 text-blue-400">{fmt3(r.kwhTotal)}</td>
                        <td className="px-3 py-1.5 text-green-400">{fmt3(r.kwhA)}</td>
                        <td className="px-3 py-1.5 text-yellow-400">{fmt3(r.kwhB)}</td>
                        <td className="px-3 py-1.5 text-pink-400">{fmt3(r.kwhC)}</td>
                        <td className="px-3 py-1.5 text-cyan-400">{fmt3(r.puissKwTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
