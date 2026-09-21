/**
 * Comparaison côte à côte de deux relevés (module Campagne de mesure).
 * Ex. : un analyseur C.A 8335 et un compteur Shelly posés sur le même départ,
 * ou deux campagnes du même appareil. Les deux séries sont ramenées sur une
 * échelle de temps commune, superposées, et leurs indicateurs mis face à face.
 * Voir `lib/model-comparison.ts` pour les règles d'alignement.
 */

import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { isHoverArtifact } from '@/lib/chart-export';
import {
  Area, Brush, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { exportMultiSheetXlsx } from '@/lib/excel-utils';
import { MeasurementData, measurementLabel } from '@/services/measurementService';
import {
  compareModels, detectClockOffset, extractUnit, kindForUnit, numericKeys, STEPS,
  type ModelComparison, type SeriesSpec, type StepKey,
} from '@/lib/model-comparison';
import {
  Activity, AlertTriangle, ArrowLeftRight, Check, ChevronLeft, ChevronRight, Clock, Download, FileSpreadsheet,
  Image as ImageIcon, Loader2, Pencil, ScatterChart as ScatterIcon, Sigma, TrendingDown, TrendingUp, X,
} from 'lucide-react';

interface ModelComparisonPanelProps {
  measurementData: MeasurementData[];
  /** Renomme un relevé (alias libre, vide = retour au nom de fichier). */
  onRename?: (index: number, alias: string) => void;
}

const COLOR_A = 'hsl(38 92% 50%)';
const COLOR_B = 'hsl(199 89% 48%)';
const COLOR_DELTA = 'hsl(280 65% 60%)';
const COLOR_OUT = 'hsl(0 84% 60%)';
const PAGE_SIZE = 25;
/** Nombre max de points tracés dans le nuage A vs B (les stats restent calculées sur tout). */
const SCATTER_MAX = 2500;

/* ------------------------------------------------------------------ utils */

function fileLabel(d: MeasurementData, i: number): string {
  return measurementLabel(d, i);
}

function fmt(v: number | null | undefined, unit = '', digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function fmtTime(ms: number, stepMs: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (stepMs >= 86_400_000) return `${date}/${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // stepMs = 0 : horodatage complet (bornes de période, exports)
  return stepMs === 0 ? `${date}/${d.getFullYear()} ${time}` : `${date} ${time}`;
}

function seriesSpec(d: MeasurementData, i: number, key: string): SeriesSpec {
  const isMain = key === 'consumption';
  const unit = isMain ? (d.unit ?? '') : extractUnit(key);
  return {
    label: fileLabel(d, i),
    metricKey: key,
    metricLabel: isMain ? (d.metric_label ?? 'Grandeur principale') : key,
    unit,
    quantityKind: isMain ? (d.quantity_kind ?? 'other') : kindForUnit(unit),
    measurements: d.measurements ?? [],
  };
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
}

/* ------------------------------------------------------------------- main */

export function ModelComparisonPanel({ measurementData, onRename }: ModelComparisonPanelProps) {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);

  const [idxA, setIdxA] = useState<number | null>(measurementData.length > 1 ? 0 : null);
  const [idxB, setIdxB] = useState<number | null>(measurementData.length > 1 ? 1 : null);
  const [keyA, setKeyA] = useState('consumption');
  const [keyB, setKeyB] = useState('consumption');
  const [step, setStep] = useState<StepKey | 'auto'>('auto');
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [page, setPage] = useState(0);
  const [sortByDelta, setSortByDelta] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'xlsx' | null>(null);
  const [tolerancePct, setTolerancePct] = useState(5);
  const [offsetMin, setOffsetMin] = useState(0);
  const [detecting, setDetecting] = useState(false);

  const dataA = idxA != null ? measurementData[idxA] : undefined;
  const dataB = idxB != null ? measurementData[idxB] : undefined;
  const keysA = useMemo(() => numericKeys(dataA?.measurements ?? []), [dataA]);
  const keysB = useMemo(() => numericKeys(dataB?.measurements ?? []), [dataB]);

  const specA = dataA && idxA != null ? seriesSpec(dataA, idxA, keysA.includes(keyA) ? keyA : 'consumption') : null;
  const specB = dataB && idxB != null ? seriesSpec(dataB, idxB, keysB.includes(keyB) ? keyB : 'consumption') : null;

  const result = useMemo(() => {
    if (!specA || !specB) return null;
    return compareModels(specA, specB, {
      step,
      from: range.from ? new Date(range.from).getTime() : undefined,
      to: range.to ? new Date(range.to).getTime() : undefined,
      offsetBMs: offsetMin * 60_000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataA, dataB, specA?.metricKey, specB?.metricKey, step, range.from, range.to, offsetMin]);

  const cmp: ModelComparison | null = result && !('error' in result) ? result : null;
  const error = result && 'error' in result ? result.error : null;

  const isOut = (r: { deltaPct: number | null }) => r.deltaPct != null && Math.abs(r.deltaPct) > tolerancePct;
  const outCount = useMemo(() => (cmp ? cmp.rows.filter(isOut).length : 0), [cmp, tolerancePct]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(
    () => cmp?.rows.map((r) => ({
      label: fmtTime(r.t, cmp.stepMs),
      A: Number(r.a.toFixed(3)),
      B: Number(r.b.toFixed(3)),
      'Écart (B − A)': Number(r.delta.toFixed(3)),
      'Hors tolérance': isOut(r) ? Number(r.delta.toFixed(3)) : null,
    })) ?? [],
    [cmp, tolerancePct], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Nuage A vs B : sous-échantillonné pour l'affichage, droites y = x et ajustée.
  const scatter = useMemo(() => {
    if (!cmp) return null;
    const stride = Math.max(1, Math.ceil(cmp.rows.length / SCATTER_MAX));
    const pts = cmp.rows.filter((_, i) => i % stride === 0).map((r) => ({ x: r.a, y: r.b, out: isOut(r) }));
    const lo = Math.min(cmp.a.min, cmp.b.min);
    const hi = Math.max(cmp.a.max, cmp.b.max);
    const fit = cmp.regression;
    return {
      inside: pts.filter((p) => !p.out),
      outside: pts.filter((p) => p.out),
      lo, hi, stride,
      identity: [{ x: lo, y: lo }, { x: hi, y: hi }],
      fitted: fit ? [{ x: lo, y: fit.slope * lo + fit.intercept }, { x: hi, y: fit.slope * hi + fit.intercept }] : null,
    };
  }, [cmp, tolerancePct]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDetectOffset = () => {
    if (!specA || !specB) return;
    setDetecting(true);
    // Laisse le temps au bouton de passer en « recherche… » avant le calcul synchrone.
    setTimeout(() => {
      try {
        const found = detectClockOffset(specA, specB, {
          step,
          from: range.from ? new Date(range.from).getTime() : undefined,
          to: range.to ? new Date(range.to).getTime() : undefined,
        });
        if (!found) {
          toast({ title: 'Décalage introuvable', description: 'Pas assez de points communs pour estimer un décalage.', variant: 'destructive' });
        } else {
          setOffsetMin(found.offsetMinutes);
          const gain = found.baseline != null ? ` (r ${found.baseline.toFixed(3)} → ${found.correlation.toFixed(3)})` : '';
          toast({
            title: found.offsetMinutes === 0 ? 'Horloges alignées' : `Décalage détecté : ${found.offsetMinutes > 0 ? '+' : ''}${found.offsetMinutes} min`,
            description: found.offsetMinutes === 0 ? 'Aucun décalage n\'améliore la corrélation.' : `B décalé de ${found.offsetMinutes} min pour maximiser la corrélation${gain}.`,
          });
        }
      } finally {
        setDetecting(false);
      }
    }, 30);
  };

  const tableRows = useMemo(() => {
    if (!cmp) return [];
    const rows = [...cmp.rows];
    if (sortByDelta) rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return rows;
  }, [cmp, sortByDelta]);
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const pageRows = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const swap = () => {
    setIdxA(idxB); setIdxB(idxA); setKeyA(keyB); setKeyB(keyA); setPage(0);
  };

  /* ---- exports ---- */

  const exportPng = async () => {
    if (!chartRef.current || !cmp || !specA || !specB) return;
    setExporting('png');
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0f111a', scale: 2, logging: false,
        ignoreElements: isHoverArtifact,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `comparaison_${slug(specA.label)}_vs_${slug(specB.label)}.png`;
      a.click();
    } catch (e) {
      toast({ title: 'Export impossible', description: String(e), variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const indicatorRows = (c: ModelComparison) => {
    const u = c.unit;
    const rows: { label: string; a: number | null; b: number | null; unit: string }[] = [
      { label: 'Points comparés', a: c.a.count, b: c.b.count, unit: '' },
      { label: 'Moyenne', a: c.a.mean, b: c.b.mean, unit: u },
      { label: 'Minimum', a: c.a.min, b: c.b.min, unit: u },
      { label: 'Maximum', a: c.a.max, b: c.b.max, unit: u },
      { label: 'Écart-type', a: c.a.std, b: c.b.std, unit: u },
    ];
    if (c.totalUnit) rows.push({ label: 'Cumul (période commune)', a: c.a.total, b: c.b.total, unit: c.totalUnit });
    return rows.map((r) => ({
      ...r,
      delta: r.a != null && r.b != null ? r.b - r.a : null,
      deltaPct: r.a != null && r.b != null && r.a !== 0 ? ((r.b - r.a) / r.a) * 100 : null,
    }));
  };

  const exportXlsx = async () => {
    if (!cmp || !specA || !specB) return;
    setExporting('xlsx');
    try {
      const A = `A — ${specA.label}`;
      const B = `B — ${specB.label}`;
      const stepLabel = STEPS.find((s) => s.key === cmp.step)?.label ?? cmp.step;
      const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
      const resume: unknown[][] = [
        ['Comparaison de modèles — Campagne de mesure'],
        [],
        ['Relevé A', specA.label, specA.metricLabel, specA.unit],
        ['Relevé B', specB.label, specB.metricLabel, specB.unit],
        ['Période commune', fmtTime(cmp.from, 0), fmtTime(cmp.to, 0)],
        ['Pas de temps', stepLabel],
        ['Unité comparée', cmp.unit],
        ['Agrégation', cmp.aggregation === 'mean' ? 'moyenne par pas' : cmp.aggregation === 'sum' ? 'somme par pas' : 'énergie par pas (puissance intégrée)'],
        [],
        ['Points comparés', cmp.rows.length],
        ['Pas présents seulement en A', cmp.onlyA],
        ['Pas présents seulement en B', cmp.onlyB],
        ['Biais moyen (B − A)', cmp.meanDelta, cmp.unit],
        ['Écart absolu moyen (MAE)', cmp.mae, cmp.unit],
        ['RMSE', cmp.rmse, cmp.unit],
        ['Écart max', cmp.maxAbsDelta, cmp.unit, fmtTime(cmp.maxAbsDeltaAt, cmp.stepMs)],
        ['Écart global (% de A)', cmp.biasPct],
        ['Corrélation (r)', cmp.correlation],
        ['Régression B = a·A + b', cmp.regression ? `a = ${cmp.regression.slope.toFixed(4)}, b = ${cmp.regression.intercept.toFixed(3)} ${cmp.unit}, R² = ${cmp.regression.r2.toFixed(4)}` : '—'],
        ['Tolérance (± %)', tolerancePct],
        ['Pas hors tolérance', outCount, cmp.rows.length ? (outCount / cmp.rows.length) * 100 : null, '%'],
        ['Décalage horloge appliqué à B (min)', offsetMin],
        ...(cmp.warnings.length ? [[], ['Avertissements'], ...cmp.warnings.map((w) => [w])] : []),
      ];
      const indicateurs = indicatorRows(cmp).map((r) => ({
        Indicateur: r.label, [A]: r3(r.a), [B]: r3(r.b), 'Écart (B − A)': r3(r.delta), 'Écart (%)': r3(r.deltaPct), Unité: r.unit,
      }));
      const ecarts = cmp.rows.map((r) => ({
        Horodatage: new Date(r.t), [A]: r3(r.a), [B]: r3(r.b), 'Écart (B − A)': r3(r.delta), 'Écart (%)': r3(r.deltaPct),
        'Hors tolérance': isOut(r) ? 'oui' : '',
      }));
      await exportMultiSheetXlsx(
        [
          { name: 'Résumé', data: resume },
          { name: 'Indicateurs', data: indicateurs, autoFilter: true },
          { name: 'Écarts', data: ecarts, autoFilter: true },
        ],
        `comparaison_${slug(specA.label)}_vs_${slug(specB.label)}.xlsx`,
      );
    } catch (e) {
      toast({ title: 'Export impossible', description: String(e), variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const exportCsv = () => {
    if (!cmp || !specA || !specB) return;
    const header = ['Horodatage', `A - ${specA.label}`, `B - ${specB.label}`, 'Ecart (B-A)', 'Ecart (%)'];
    const lines = cmp.rows.map((r) => [
      fmtTime(r.t, 0), r.a, r.b, r.delta, r.deltaPct ?? '',
    ].map((v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : `"${v}"`)).join(';'));
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ecarts_${slug(specA.label)}_vs_${slug(specB.label)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  };

  /* ---- rendu ---- */

  if (measurementData.length < 2) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        Il faut au moins 2 fichiers uploadés pour comparer deux modèles.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sélection A / B */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <SidePicker
          tag="A" color={COLOR_A} data={measurementData} idx={idxA} keys={keysA} metricKey={specA?.metricKey ?? 'consumption'}
          onIdx={(i) => { setIdxA(i); setKeyA('consumption'); setPage(0); }} onKey={(k) => { setKeyA(k); setPage(0); }}
          onRename={onRename}
        />
        <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-9 mb-0.5"
          onClick={swap} title="Inverser A et B">
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <SidePicker
          tag="B" color={COLOR_B} data={measurementData} idx={idxB} keys={keysB} metricKey={specB?.metricKey ?? 'consumption'}
          onIdx={(i) => { setIdxB(i); setKeyB('consumption'); setPage(0); }} onKey={(k) => { setKeyB(k); setPage(0); }}
          onRename={onRename}
        />
      </div>

      {/* Pas de temps + période */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Pas de temps</label>
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10 w-fit">
            {(['auto', ...STEPS.map((s) => s.key)] as (StepKey | 'auto')[]).map((s) => (
              <button key={s} onClick={() => { setStep(s); setPage(0); }}
                className={`px-2.5 py-1.5 rounded-md text-xs transition-all ${step === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {s === 'auto' ? `Auto${cmp && step === 'auto' ? ` (${STEPS.find((x) => x.key === cmp.step)?.label})` : ''}` : STEPS.find((x) => x.key === s)!.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Période</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="datetime-local" value={range.from ?? ''} onChange={(e) => { setRange((r) => ({ ...r, from: e.target.value || undefined })); setPage(0); }}
              className="h-9 px-2 rounded-md bg-white/5 border border-white/20 text-slate-200 text-sm" />
            <span className="text-slate-500 text-xs">→</span>
            <input type="datetime-local" value={range.to ?? ''} onChange={(e) => { setRange((r) => ({ ...r, to: e.target.value || undefined })); setPage(0); }}
              className="h-9 px-2 rounded-md bg-white/5 border border-white/20 text-slate-200 text-sm" />
            {(range.from || range.to) && (
              <button className="text-xs text-slate-400 hover:text-white" onClick={() => { setRange({}); setPage(0); }}>Réinitialiser</button>
            )}
            {cmp && !range.from && !range.to && (
              <span className="text-xs text-slate-500">recouvrement : {fmtTime(cmp.from, 0)} → {fmtTime(cmp.to, 0)}</span>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Tolérance</label>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">±</span>
            <input type="number" min={0} max={100} step={0.5} value={tolerancePct}
              onChange={(e) => setTolerancePct(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-20 px-2 rounded-md bg-white/5 border border-white/20 text-slate-200 text-sm text-right" />
            <span className="text-slate-400 text-sm">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> Horloge de B</label>
          <div className="flex items-center gap-1.5">
            <input type="number" step={1} value={offsetMin} onChange={(e) => { setOffsetMin(Number(e.target.value) || 0); setPage(0); }}
              className="h-9 w-20 px-2 rounded-md bg-white/5 border border-white/20 text-slate-200 text-sm text-right" title="Décalage appliqué aux horodatages de B" />
            <span className="text-slate-400 text-sm">min</span>
            <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-9 text-xs"
              onClick={handleDetectOffset} disabled={!specA || !specB || detecting} title="Cherche le décalage (±2 h) qui maximise la corrélation entre A et B">
              {detecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
              {detecting ? 'Recherche…' : 'Détecter'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-amber-400/90 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {cmp && specA && specB && (
        <>
          {cmp.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}
            </p>
          ))}

          <p className="text-xs text-slate-500">
            {cmp.aggregation === 'mean' && `Moyenne par pas de ${STEPS.find((s) => s.key === cmp.step)?.label}, en ${cmp.unit}.`}
            {cmp.aggregation === 'sum' && `Somme par pas de ${STEPS.find((s) => s.key === cmp.step)?.label}, en ${cmp.unit}.`}
            {cmp.aggregation === 'energy' && `Énergie par pas de ${STEPS.find((s) => s.key === cmp.step)?.label} (la puissance est intégrée dans le temps), en ${cmp.unit}.`}
            {' '}Écart = B − A.
          </p>

          {/* Résumé */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Activity className="h-4 w-4 text-slate-300" />} label="Points comparés" value={String(cmp.rows.length)}
              hint={cmp.onlyA + cmp.onlyB > 0 ? `${cmp.onlyA + cmp.onlyB} sans vis-à-vis` : undefined} />
            <StatCard icon={cmp.meanDelta >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
              label="Biais moyen (B − A)" value={fmt(cmp.meanDelta, cmp.unit)} />
            <StatCard icon={<Sigma className="h-4 w-4 text-purple-400" />} label="Écart absolu moyen" value={fmt(cmp.mae, cmp.unit)} hint={`RMSE ${fmt(cmp.rmse, cmp.unit)}`} />
            <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} label="Écart max" value={fmt(cmp.maxAbsDelta, cmp.unit)} hint={fmtTime(cmp.maxAbsDeltaAt, cmp.stepMs)} />
            <StatCard icon={<Sigma className="h-4 w-4 text-blue-400" />} label={cmp.totalUnit ? 'Écart des cumuls' : 'Écart des moyennes'} value={fmtPct(cmp.biasPct)} />
            <StatCard icon={<Activity className="h-4 w-4 text-purple-400" />} label="Corrélation (r)" value={cmp.correlation != null ? cmp.correlation.toFixed(3) : '—'}
              hint={cmp.offsetBMs !== 0 ? `B décalé de ${cmp.offsetBMs > 0 ? '+' : ''}${Math.round(cmp.offsetBMs / 60_000)} min` : undefined} />
            <StatCard icon={<AlertTriangle className={`h-4 w-4 ${outCount > 0 ? 'text-red-400' : 'text-emerald-400'}`} />}
              label={`Hors tolérance (± ${tolerancePct} %)`}
              value={`${outCount} pas · ${cmp.rows.length ? ((outCount / cmp.rows.length) * 100).toFixed(1) : '0'} %`}
              hint={`${cmp.rows.length - outCount} pas dans la tolérance`} />
            <StatCard icon={<ScatterIcon className="h-4 w-4 text-blue-400" />} label="Régression B = a·A + b"
              value={cmp.regression ? `a = ${cmp.regression.slope.toFixed(3)} · b = ${fmt(cmp.regression.intercept, cmp.unit, 1)}` : '—'}
              hint={cmp.regression ? `R² = ${cmp.regression.r2.toFixed(4)}${Math.abs(cmp.regression.slope - 1) > 0.02 ? ' · gain ≠ 1 : calibrage / rapport de TC ?' : Math.abs(cmp.regression.intercept) > 0.05 * Math.max(1e-9, Math.abs(cmp.a.mean)) ? ' · offset constant : charge fantôme / zéro ?' : ' · A et B concordent'}` : undefined} />
          </div>

          {/* Graphique */}
          <Card className="p-4 bg-white/5 border-white/10">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-sm font-medium text-slate-200">A et B sur la même échelle de temps, écart en dessous</p>
              <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8 text-xs"
                onClick={exportPng} disabled={exporting != null}>
                {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
                Exporter en image
              </Button>
            </div>
            <div ref={chartRef} className="bg-[#0f111a] rounded-lg p-2">
              <p className="text-xs text-slate-400 px-2 pt-1">
                <span style={{ color: COLOR_A }}>A</span> {specA.label} · {specA.metricLabel} &nbsp;|&nbsp;
                <span style={{ color: COLOR_B }}>B</span> {specB.label} · {specB.metricLabel} &nbsp;|&nbsp; {cmp.unit}
              </p>
              <p className="text-[11px] text-slate-500 px-2 pb-1">
                {fmtTime(cmp.from, 0)} → {fmtTime(cmp.to, 0)} · pas {STEPS.find((s) => s.key === cmp.step)?.label} · biais {fmt(cmp.meanDelta, cmp.unit)} · {cmp.totalUnit ? 'écart des cumuls' : 'écart des moyennes'} {fmtPct(cmp.biasPct)} · r = {cmp.correlation != null ? cmp.correlation.toFixed(3) : '—'}
              </p>
              {/* Graphique du haut : A et B superposés. Graphique du bas : l'écart,
                  centré sur 0. Les deux sont synchronisés (survol + zoom du brush). */}
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} syncId="model-cmp" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} minTickGap={40} hide />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={80} tickFormatter={(v) => fmt(Number(v), '', 0)}
                    label={{ value: `A / B (${cmp.unit})`, angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n) => [fmt(Number(v), cmp.unit), n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                  <Line type="monotone" dataKey="A" name={`A — ${specA.label}`} stroke={COLOR_A} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="B" name={`B — ${specB.label}`} stroke={COLOR_B} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={170}>
                <ComposedChart data={chartData} syncId="model-cmp" margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={80} tickFormatter={(v) => fmt(Number(v), '', 0)}
                    domain={[-cmp.maxAbsDelta, cmp.maxAbsDelta]} allowDataOverflow
                    label={{ value: `Écart (${cmp.unit})`, angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n) => [fmt(Number(v), cmp.unit), n]} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                  <Area type="step" dataKey="Écart (B − A)" stroke={COLOR_DELTA} strokeWidth={1} fill={COLOR_DELTA} fillOpacity={0.3} baseValue={0} dot={false} isAnimationActive={false} />
                  {/* Points hors tolérance : une ligne sans trait, seuls les points non nuls sont dessinés. */}
                  <Line dataKey="Hors tolérance" stroke="none" dot={{ r: 2, fill: COLOR_OUT, stroke: 'none' }} activeDot={{ r: 3, fill: COLOR_OUT }} isAnimationActive={false} connectNulls={false} />
                  <Brush dataKey="label" height={22} stroke="rgba(255,255,255,0.3)" fill="#1a1d2e" travellerWidth={8} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Nuage A vs B + régression */}
          {scatter && (
            <Card className="p-4 bg-white/5 border-white/10">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-sm font-medium text-slate-200">Nuage A vs B — droite y = x (pointillés) et droite ajustée</p>
                <p className="text-xs text-slate-500">
                  {cmp.regression ? `B = ${cmp.regression.slope.toFixed(4)} · A ${cmp.regression.intercept >= 0 ? '+' : '−'} ${fmt(Math.abs(cmp.regression.intercept), cmp.unit)} · R² = ${cmp.regression.r2.toFixed(4)}` : 'régression impossible'}
                  {scatter.stride > 1 ? ` · 1 point sur ${scatter.stride} affiché` : ''}
                </p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" dataKey="x" name="A" domain={[scatter.lo, scatter.hi]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} tickFormatter={(v) => fmt(Number(v), '', 0)}
                    label={{ value: `A — ${specA.label} (${cmp.unit})`, position: 'insideBottom', offset: -4, fill: COLOR_A, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="B" domain={[scatter.lo, scatter.hi]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={80} tickFormatter={(v) => fmt(Number(v), '', 0)}
                    label={{ value: `B — ${specB.label} (${cmp.unit})`, angle: -90, position: 'insideLeft', fill: COLOR_B, fontSize: 11 }} />
                  <ZAxis range={[12, 12]} />
                  <Tooltip contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n) => [fmt(Number(v), cmp.unit), n === 'x' ? 'A' : n === 'y' ? 'B' : n]} labelFormatter={() => ''} />
                  <Scatter data={scatter.inside} fill={COLOR_DELTA} fillOpacity={0.55} isAnimationActive={false} name="dans la tolérance" />
                  <Scatter data={scatter.outside} fill={COLOR_OUT} fillOpacity={0.8} isAnimationActive={false} name="hors tolérance" />
                  <Line data={scatter.identity} dataKey="y" stroke="rgba(255,255,255,0.45)" strokeDasharray="6 4" strokeWidth={1.5} dot={false} isAnimationActive={false} name="y = x" />
                  {scatter.fitted && (
                    <Line data={scatter.fitted} dataKey="y" stroke={COLOR_B} strokeWidth={2} dot={false} isAnimationActive={false} name="ajustée" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Indicateurs face à face */}
          <Card className="p-4 bg-white/5 border-white/10">
            <p className="text-sm font-medium text-slate-200 mb-3">Indicateurs face à face</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-white/10">
                    <th className="text-left py-2 pr-3 font-medium">Indicateur</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_A }}>A — {specA.label}</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_B }}>B — {specB.label}</th>
                    <th className="text-right py-2 px-3 font-medium">Écart (B − A)</th>
                    <th className="text-right py-2 pl-3 font-medium">Écart %</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorRows(cmp).map((r) => (
                    <tr key={r.label} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-slate-300">{r.label}</td>
                      <td className="py-2 px-3 text-right text-white tabular-nums">{fmt(r.a, r.unit, r.label === 'Points comparés' ? 0 : 2)}</td>
                      <td className="py-2 px-3 text-right text-white tabular-nums">{fmt(r.b, r.unit, r.label === 'Points comparés' ? 0 : 2)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${deltaColor(r.delta)}`}>{fmt(r.delta, r.unit, r.label === 'Points comparés' ? 0 : 2)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums ${deltaColor(r.delta)}`}>{fmtPct(r.deltaPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Tableau des écarts */}
          <Card className="p-4 bg-white/5 border-white/10">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-sm font-medium text-slate-200">Tableau des écarts — {cmp.rows.length} pas de temps</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button className={`text-xs px-2.5 py-1 rounded-md border transition ${sortByDelta ? 'bg-blue-600 border-transparent text-white' : 'border-white/20 text-slate-400 hover:text-white'}`}
                  onClick={() => { setSortByDelta((s) => !s); setPage(0); }}>
                  Trier par écart
                </button>
                <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8 text-xs" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8 text-xs" onClick={exportXlsx} disabled={exporting != null}>
                  {exporting === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />}
                  Excel (résumé + indicateurs + écarts)
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-white/10">
                    <th className="text-left py-2 pr-3 font-medium">Horodatage</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_A }}>A ({cmp.unit})</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_B }}>B ({cmp.unit})</th>
                    <th className="text-right py-2 px-3 font-medium">Écart (B − A)</th>
                    <th className="text-right py-2 pl-3 font-medium">Écart %</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.t} className={`border-b border-white/5 ${isOut(r) ? 'bg-red-500/10' : ''}`}>
                      <td className="py-1.5 pr-3 text-slate-300 tabular-nums">
                        {isOut(r) && <AlertTriangle className="h-3 w-3 text-red-400 inline mr-1.5 -mt-0.5" />}{fmtTime(r.t, cmp.stepMs)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-white tabular-nums">{fmt(r.a)}</td>
                      <td className="py-1.5 px-3 text-right text-white tabular-nums">{fmt(r.b)}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums ${deltaColor(r.delta)}`}>{fmt(r.delta)}</td>
                      <td className={`py-1.5 pl-3 text-right tabular-nums ${deltaColor(r.delta)}`}>{fmtPct(r.deltaPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-end gap-2 mt-3 text-xs text-slate-400">
                <span>{page + 1} / {pageCount}</span>
                <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-7 w-7 p-0" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-7 w-7 p-0" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- atomes */

function deltaColor(d: number | null): string {
  if (d == null || d === 0) return 'text-slate-300';
  return d > 0 ? 'text-emerald-400' : 'text-red-400';
}

function SidePicker({
  tag, color, data, idx, keys, metricKey, onIdx, onKey, onRename,
}: {
  tag: string; color: string; data: MeasurementData[]; idx: number | null; keys: string[]; metricKey: string;
  onIdx: (i: number) => void; onKey: (k: string) => void; onRename?: (index: number, alias: string) => void;
}) {
  const d = idx != null ? data[idx] : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(d?.alias ?? ''); setEditing(true); };
  const commit = () => { if (idx != null) onRename?.(idx, draft); setEditing(false); };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold text-black" style={{ background: color }}>{tag}</span>
        Relevé {tag}
        {d && onRename && !editing && (
          <button className="text-slate-500 hover:text-white transition-colors" onClick={startEdit} title="Donner un nom à ce relevé">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={d?.file_name ?? 'Nom du relevé'}
            className="h-10 flex-1 px-3 rounded-md bg-white/5 border border-blue-500/50 text-white text-sm" />
          <button className="text-emerald-400 hover:text-emerald-300" onClick={commit} title="Valider"><Check className="h-4 w-4" /></button>
          <button className="text-slate-500 hover:text-white" onClick={() => setEditing(false)} title="Annuler"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <Select value={idx != null ? String(idx) : undefined} onValueChange={(v) => onIdx(Number(v))}>
          <SelectTrigger className="bg-white/5 border-white/20 text-white">
            <SelectValue placeholder="Sélectionnez un fichier…" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            {data.map((m, i) => (
              <SelectItem key={i} value={String(i)} className="text-slate-200 focus:bg-white/10">
                {fileLabel(m, i)}
                <span className="text-slate-500 ml-1.5 text-xs">{m.sensor_type}{m.metric_label ? ` · ${m.metric_label} (${m.unit})` : ''}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {d?.alias && !editing && <p className="text-[11px] text-slate-500 truncate">{d.file_name}</p>}
      {d && keys.length > 1 && (
        <Select value={metricKey} onValueChange={onKey}>
          <SelectTrigger className="bg-white/5 border-white/20 text-slate-200 h-8 text-xs">
            <SelectValue placeholder="Grandeur…" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            {keys.map((k) => (
              <SelectItem key={k} value={k} className="text-slate-200 focus:bg-white/10 text-xs">
                {k === 'consumption' ? `${d.metric_label ?? 'Grandeur principale'} (${d.unit ?? '—'})` : k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}{label}</div>
      <p className="text-lg font-semibold mt-1 leading-tight text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}
