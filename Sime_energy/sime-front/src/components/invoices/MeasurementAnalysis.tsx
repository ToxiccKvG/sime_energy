/**
 * Onglet « Analyse » du module Mesures.
 * Affiche les KPIs en cartes lisibles + une table de mesures recherchable,
 * paginée et exportable en CSV. S'adapte au capteur via les clés des mesures.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeMeasurementKpis, groupMeasurementsByDay, toDate, type ColumnStat, type QuantityKind } from '@/services/measurementStats';
import { exportReportToDocx, exportReportToPdf, type MeasurementReport } from '@/services/measurementReportExport';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Clock,
  Download,
  FileDown,
  FileText,
  Gauge,
  Hash,
  RotateCcw,
  Search,
  Sigma,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface AnalysisData {
  measurements?: any[];
  kpis?: Record<string, any>;
  unit?: string;
  metric_label?: string;
  sensor_type?: string;
  quantity_kind?: QuantityKind;
}

/** epoch ms → valeur compatible avec un <input type="datetime-local"> (heure locale). */
function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PAGE_SIZE = 25;

/** Libellés FR + icône pour les clés de KPI renvoyées par le backend. */
const KPI_META: Record<string, { label: string; icon: React.ReactNode; withUnit?: boolean }> = {
  duration: { label: 'Durée', icon: <Clock className="h-4 w-4" /> },
  measurementCount: { label: 'Nombre de mesures', icon: <Hash className="h-4 w-4" /> },
  avgConsumption: { label: 'Moyenne (hors zéros)', icon: <Gauge className="h-4 w-4" />, withUnit: true },
  peakConsumption: { label: 'Maximum', icon: <TrendingUp className="h-4 w-4" />, withUnit: true },
  minConsumption: { label: 'Minimum', icon: <TrendingDown className="h-4 w-4" />, withUnit: true },
  totalConsumption: { label: 'Cumul total', icon: <Sigma className="h-4 w-4" />, withUnit: true },
  stdConsumption: { label: 'Écart-type', icon: <ArrowDownUp className="h-4 w-4" />, withUnit: true },
};

const KPI_ORDER = [
  'duration',
  'avgConsumption',
  'peakConsumption',
  'minConsumption',
  'totalConsumption',
  'stdConsumption',
  'measurementCount',
];

const STAT_COLUMNS: { key: keyof ColumnStat; label: string }[] = [
  { key: 'mean', label: 'Moyenne' },
  { key: 'std', label: 'Écart-type' },
  { key: 'min', label: 'Min' },
  { key: 'p10', label: 'P10' },
  { key: 'median', label: 'Médiane' },
  { key: 'p90', label: 'P90' },
  { key: 'max', label: 'Max' },
  { key: 'count', label: 'N' },
];

/** Écart entre max et min — donne une lecture rapide de la plage de variation. */
function amplitude(min: number, max: number): number {
  return +(max - min).toFixed(2);
}

function fmtNumber(v: any): string {
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return String(v ?? '—');
}

/** Renomme les clés techniques en libellés affichables. */
function columnLabel(key: string, metricLabel: string): string {
  if (key === 'timestamp') return 'Horodatage';
  if (key === 'consumption') return metricLabel || 'Valeur';
  return key;
}

export function MeasurementAnalysis({ data }: { data: AnalysisData }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedMeasures, setSelectedMeasures] = useState<string[] | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [dailyMetric, setDailyMetric] = useState<string | null>(null);

  const measurements = data.measurements ?? [];
  const unit = data.unit ?? data.kpis?.unit ?? '';
  const metricLabel = data.metric_label ?? 'Valeur';
  const quantityKind = data.quantity_kind ?? 'energy';

  // Bornes temporelles réelles du fichier — servent de valeurs par défaut au filtre de période.
  const timestampBounds = useMemo(() => {
    const times = measurements
      .map((m) => toDate(String(m.timestamp)).getTime())
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) return null;
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [measurements]);

  // Nouveau fichier chargé : on repart d'une sélection et d'une période complètes.
  useEffect(() => {
    setSelectedMeasures(null);
    setDateRange(null);
    setDailyMetric(null);
  }, [data]);

  const rangeStartMs = dateRange?.start ? new Date(dateRange.start).getTime() : (timestampBounds?.min ?? -Infinity);
  const rangeEndMs = dateRange?.end ? new Date(dateRange.end).getTime() : (timestampBounds?.max ?? Infinity);
  const isRangeFiltered = dateRange !== null;

  // Filtre de période : appliqué en amont de tout le reste (colonnes, stats, tableau, export).
  const dateFiltered = useMemo(() => {
    if (!timestampBounds) return measurements;
    return measurements.filter((m) => {
      const t = toDate(String(m.timestamp)).getTime();
      return Number.isFinite(t) && t >= rangeStartMs && t <= rangeEndMs;
    });
  }, [measurements, timestampBounds, rangeStartMs, rangeEndMs]);

  // KPIs recalculés côté client sur la période filtrée (voir measurementStats.ts).
  const kpis = useMemo(() => {
    try {
      return computeMeasurementKpis(dateFiltered, { unit, metricLabel, quantityKind });
    } catch {
      return undefined;
    }
  }, [dateFiltered, unit, metricLabel, quantityKind]);

  const dayRangeOf = (day: string) => ({ start: `${day}T00:00`, end: `${day}T23:59` });
  const isDayActive = (day: string) => {
    const r = dayRangeOf(day);
    return dateRange?.start === r.start && dateRange?.end === r.end;
  };
  const toggleDay = (day: string) => setDateRange(isDayActive(day) ? null : dayRangeOf(day));

  // Colonnes : on retire celles entièrement vides sur la période filtrée.
  const columns = useMemo(() => {
    if (dateFiltered.length === 0) return [];
    const keys = new Set<string>();
    dateFiltered.forEach((m) => Object.keys(m).forEach((k) => keys.add(k)));
    return Array.from(keys).filter((k) => dateFiltered.some((m) => m[k] != null));
  }, [dateFiltered]);

  // Grandeurs sélectionnables : toutes les colonnes hors horodatage.
  const allMeasureKeys = useMemo(() => columns.filter((c) => c !== 'timestamp'), [columns]);

  // Vue par jour : récap quotidien d'une grandeur choisie (par défaut la principale) sur la période filtrée.
  const dailyMetricKey = dailyMetric && allMeasureKeys.includes(dailyMetric)
    ? dailyMetric
    : (allMeasureKeys.includes('consumption') ? 'consumption' : allMeasureKeys[0]);
  const dailyGroups = useMemo(
    () => (dailyMetricKey ? groupMeasurementsByDay(dateFiltered, quantityKind, dailyMetricKey) : []),
    [dateFiltered, quantityKind, dailyMetricKey],
  );

  const selectedSet = useMemo(
    () => new Set(selectedMeasures ?? allMeasureKeys),
    [selectedMeasures, allMeasureKeys],
  );

  const toggleMeasure = (key: string) => {
    setSelectedMeasures((prev) => {
      const base = new Set(prev ?? allMeasureKeys);
      if (base.has(key)) base.delete(key); else base.add(key);
      return Array.from(base);
    });
  };

  const visibleColumns = useMemo(
    () => columns.filter((c) => c === 'timestamp' || selectedSet.has(c)),
    [columns, selectedSet],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return dateFiltered;
    const q = query.toLowerCase();
    return dateFiltered.filter((m) => visibleColumns.some((c) => String(m[c] ?? '').toLowerCase().includes(q)));
  }, [dateFiltered, visibleColumns, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = () => {
    const header = visibleColumns.map((c) => columnLabel(c, metricLabel)).join(';');
    const lines = dateFiltered.map((m) =>
      visibleColumns
        .map((c) => {
          const v = m[c];
          return typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v ?? '')}"`;
        })
        .join(';'),
    );
    const csv = '﻿' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mesures_${data.sensor_type ?? 'capteur'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Modèle de rapport partagé par les exports PDF et Word — reflète exactement
  // ce qui est affiché à l'écran (période active + grandeurs sélectionnées),
  // pas l'intégralité du fichier, pour rester pertinent.
  const report = useMemo<MeasurementReport | undefined>(() => {
    if (!kpis) return undefined;

    const periodText = isRangeFiltered && dateRange
      ? `Période : ${new Date(dateRange.start).toLocaleString('fr-FR')} → ${new Date(dateRange.end).toLocaleString('fr-FR')}`
      : `Période complète (${kpis.duration})`;
    const measuresText = `Grandeurs : ${Array.from(selectedSet).map((k) => columnLabel(k, metricLabel)).join(', ') || 'aucune'}`;

    const kpiRows: [string, string][] = selectedSet.has('consumption')
      ? KPI_ORDER.filter((k) => (kpis as Record<string, any>)[k] !== undefined && (kpis as Record<string, any>)[k] !== null).map((k) => {
          const meta = KPI_META[k];
          const raw = (kpis as Record<string, any>)[k];
          const cardUnit = k === 'totalConsumption' ? (kpis.totalUnit ?? unit) : unit;
          const value = meta?.withUnit && typeof raw === 'number' ? `${fmtNumber(raw)} ${cardUnit}` : fmtNumber(raw);
          return [meta?.label ?? k, value];
        })
      : [];

    const statsHeaders = ['Grandeur', ...STAT_COLUMNS.map((c) => c.label), 'Amplitude'];
    const statsRows: string[][] = [];
    if (selectedSet.has('consumption')) {
      statsRows.push([
        metricLabel,
        fmtNumber(kpis.avgConsumption), fmtNumber(kpis.stdConsumption), fmtNumber(kpis.minConsumption),
        fmtNumber(kpis.p10Consumption), fmtNumber(kpis.medianConsumption), fmtNumber(kpis.p90Consumption),
        fmtNumber(kpis.peakConsumption), fmtNumber(kpis.measurementCount),
        fmtNumber(amplitude(kpis.minConsumption, kpis.peakConsumption)),
      ]);
    }
    for (const [label, stat] of Object.entries(kpis.columnStats ?? {})) {
      if (!selectedSet.has(label)) continue;
      statsRows.push([
        label, fmtNumber(stat.mean), fmtNumber(stat.std), fmtNumber(stat.min), fmtNumber(stat.p10),
        fmtNumber(stat.median), fmtNumber(stat.p90), fmtNumber(stat.max), fmtNumber(stat.count),
        fmtNumber(amplitude(stat.min, stat.max)),
      ]);
    }

    const perColumn = Object.entries(kpis.interpretation.perColumn ?? {})
      .filter(([label]) => selectedSet.has(label))
      .map(([label, text]) => ({ label, text }));

    const dailyUnit = dailyMetricKey === 'consumption' ? ` ${unit}` : '';
    const dailyTable = dailyGroups.length > 1
      ? {
          title: `Vue par jour — ${columnLabel(dailyMetricKey, metricLabel)}`,
          headers: ['Jour', 'N', 'Moyenne', 'Min', 'Max', 'Cumul'],
          rows: dailyGroups.map((g) => [
            g.day,
            String(g.count),
            `${fmtNumber(g.mean)}${dailyUnit}`,
            `${fmtNumber(g.min)}${dailyUnit}`,
            `${fmtNumber(g.max)}${dailyUnit}`,
            g.total !== null ? `${fmtNumber(g.total)} ${kpis.totalUnit ?? ''}` : '—',
          ]),
        }
      : undefined;

    return {
      title: `Rapport de mesures — ${metricLabel}`,
      subtitle: `${periodText} — ${measuresText}`,
      generatedAt: new Date().toLocaleString('fr-FR'),
      summary: kpis.interpretation.summary,
      insights: kpis.interpretation.insights ?? [],
      perColumn,
      kpiRows,
      statsTable: { headers: statsHeaders, rows: statsRows },
      dailyTable,
    };
  }, [kpis, selectedSet, metricLabel, unit, dailyGroups, dailyMetricKey, isRangeFiltered, dateRange]);

  return (
    <div className="space-y-6">
      {/* Filtre de période : recalcule stats, tableau et rapport sur la plage choisie */}
      {timestampBounds && timestampBounds.max > timestampBounds.min && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Période :</span>
          <Input
            type="datetime-local"
            className="h-8 w-auto text-xs"
            value={dateRange?.start ?? toDatetimeLocalValue(timestampBounds.min)}
            onChange={(e) => setDateRange((prev) => ({
              start: e.target.value,
              end: prev?.end ?? toDatetimeLocalValue(timestampBounds.max),
            }))}
          />
          <span className="text-xs text-muted-foreground">à</span>
          <Input
            type="datetime-local"
            className="h-8 w-auto text-xs"
            value={dateRange?.end ?? toDatetimeLocalValue(timestampBounds.max)}
            onChange={(e) => setDateRange((prev) => ({
              start: prev?.start ?? toDatetimeLocalValue(timestampBounds.min),
              end: e.target.value,
            }))}
          />
          {isRangeFiltered && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDateRange(null)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Période complète
            </Button>
          )}
        </div>
      )}

      {/* Vue par jour : récap quotidien + drill-down (réutilise le filtre de période ci-dessus) */}
      {dailyGroups.length > 1 && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Vue par jour — {columnLabel(dailyMetricKey, metricLabel)} ({dailyGroups.length} jours)</span>
            {allMeasureKeys.length > 1 && (
              <select
                value={dailyMetricKey}
                onChange={(e) => setDailyMetric(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-normal bg-transparent border border-input rounded-md px-2 py-1 text-foreground"
              >
                {allMeasureKeys.map((key) => (
                  <option key={key} value={key}>{columnLabel(key, metricLabel)}</option>
                ))}
              </select>
            )}
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Jour</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">N</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Moyenne</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Min</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Max</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Cumul</th>
                </tr>
              </thead>
              <tbody>
                {dailyGroups.map((g) => {
                  const active = isDayActive(g.day);
                  const rowUnit = dailyMetricKey === 'consumption' ? ` ${unit}` : '';
                  return (
                    <tr
                      key={g.day}
                      onClick={() => toggleDay(g.day)}
                      className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 ${active ? 'bg-primary/10' : ''}`}
                    >
                      <td className="py-2 pr-3 font-medium">{g.day}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{g.count}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(g.mean)}{rowUnit}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(g.min)}{rowUnit}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(g.max)}{rowUnit}</td>
                      <td className="text-right py-2 px-3 tabular-nums">
                        {g.total !== null ? `${fmtNumber(g.total)} ${kpis?.totalUnit ?? ''}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground pt-2">
              Cliquer sur un jour filtre toute l'analyse sur cette journée (re-cliquer pour revenir en arrière).
            </p>
          </div>
        </details>
      )}

      {/* Sélecteur de grandeur(s) : filtre les stats et le tableau ci-dessous */}
      {allMeasureKeys.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Grandeurs affichées :</span>
          {allMeasureKeys.map((key) => {
            const active = selectedSet.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleMeasure(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-input hover:bg-muted'
                }`}
              >
                {columnLabel(key, metricLabel)}
              </button>
            );
          })}
          {selectedMeasures !== null && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedMeasures(null)}>
              Tout afficher
            </Button>
          )}
        </div>
      )}

      {/* KPIs en cartes : décrivent la grandeur principale, affichées seulement si elle est sélectionnée */}
      {kpis && selectedSet.has('consumption') && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {KPI_ORDER.filter((k) => (kpis as Record<string, any>)[k] !== undefined && (kpis as Record<string, any>)[k] !== null).map((k) => {
            const meta = KPI_META[k];
            const raw = (kpis as Record<string, any>)[k];
            const cardUnit = k === 'totalConsumption' ? (kpis.totalUnit ?? unit) : unit;
            const value = meta?.withUnit && typeof raw === 'number' ? `${fmtNumber(raw)} ${cardUnit}` : fmtNumber(raw);
            return (
              <div key={k} className="p-3 rounded-xl border bg-card">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {meta?.icon ?? <Activity className="h-4 w-4" />}
                  {meta?.label ?? k}
                </div>
                <p className="text-lg font-semibold mt-1 leading-tight">{value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Statistiques détaillées par colonne (grandeur principale + colonnes additionnelles) */}
      {kpis && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 font-medium text-sm">
            Statistiques détaillées
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Grandeur</th>
                  {STAT_COLUMNS.map((c) => (
                    <th key={c.key} className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Amplitude</th>
                </tr>
              </thead>
              <tbody>
                {selectedSet.has('consumption') && (
                  <tr className="border-b">
                    <td className="py-2 pr-3 font-medium">{metricLabel}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.avgConsumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.stdConsumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.minConsumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.p10Consumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.medianConsumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.p90Consumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.peakConsumption)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(kpis.measurementCount)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">
                      {fmtNumber(amplitude(kpis.minConsumption, kpis.peakConsumption))}
                    </td>
                  </tr>
                )}
                {Object.entries(kpis.columnStats ?? {})
                  .filter(([label]) => selectedSet.has(label))
                  .map(([label, stat]) => (
                    <tr key={label} className="border-b last:border-0">
                      <td className="py-2 pr-3">{label}</td>
                      {STAT_COLUMNS.map((c) => (
                        <td key={c.key} className="text-right py-2 px-3 tabular-nums">{fmtNumber(stat[c.key])}</td>
                      ))}
                      <td className="text-right py-2 px-3 tabular-nums">{fmtNumber(amplitude(stat.min, stat.max))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!selectedSet.has('consumption')
              && Object.keys(kpis.columnStats ?? {}).filter((label) => selectedSet.has(label)).length === 0 && (
              <p className="text-muted-foreground text-xs py-2">Aucune grandeur sélectionnée.</p>
            )}
          </div>
        </details>
      )}

      {/* Table */}
      {dateFiltered.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-medium">Détail des mesures</h4>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Rechercher…"
                  className="pl-8 h-9 w-44"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>
          </div>

          <div className="rounded-lg border overflow-auto max-h-[28rem]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b z-10">
                <tr>
                  {visibleColumns.map((c) => (
                    <th key={c} className="text-left p-2.5 font-medium whitespace-nowrap">
                      {columnLabel(c, metricLabel)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/40">
                    {visibleColumns.map((c) => (
                      <td key={c} className="p-2.5 whitespace-nowrap tabular-nums">
                        {fmtNumber(m[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filtered.length.toLocaleString('fr-FR')} mesure(s)
              {query && ` (filtré sur « ${query} »)`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Précédent
              </Button>
              <span>
                {safePage + 1} / {pageCount}
              </span>
              <Button variant="outline" size="sm" className="h-8" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          {isRangeFiltered ? 'Aucune mesure sur cette période.' : 'Aucune mesure à afficher pour ce fichier.'}
        </div>
      )}

      {/* Résumé global + points d'attention */}
      {kpis?.interpretation && report && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-blue-500" /> Résumé de l'analyse
            </h4>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => exportReportToPdf(report)}>
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => exportReportToDocx(report)}>
                <FileText className="h-4 w-4 mr-1" /> Word
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {kpis.interpretation.summary}
          </p>
          {kpis.interpretation.insights?.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {kpis.interpretation.insights.map((msg: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Interprétation par grandeur : une phrase par colonne sélectionnée, basée sur ses stats détaillées */}
          {kpis.interpretation.perColumn && Object.keys(kpis.interpretation.perColumn).length > 0 && (
            <div className="pt-2 space-y-1.5">
              <h5 className="text-sm font-medium">Détail par grandeur</h5>
              <ul className="space-y-1">
                {Object.entries(kpis.interpretation.perColumn)
                  .filter(([label]) => selectedSet.has(label))
                  .map(([label, text]) => (
                    <li key={label} className="text-sm text-muted-foreground leading-relaxed pl-3 border-l-2 border-border">
                      {text}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
