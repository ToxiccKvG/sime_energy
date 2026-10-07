/**
 * Onglet « Modèles » du module Campagne de mesure.
 *
 * Chaque modèle répond à une question d'audit (profil type, talon, anomalies,
 * avant/après) sur la grandeur principale du relevé courant, restreinte à la
 * période partagée avec les onglets Analyse et Visualisation. Le calcul est
 * dans `services/analysisModels/`, ce fichier ne fait que l'afficher.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { isHoverArtifact } from '@/lib/chart-export';
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { MeasurementData } from '@/services/measurementService';
import {
  ANALYSIS_MODELS, DAY_CLASS_LABEL, ANOMALY_LABEL, computeAnomalies, computeAvantApres, computeProfilType, computeTalon,
  detectStepMs, fmtDay, toPoints, type AnomalyKind, type DayClass, type ModelId, type SeriesContext, type Severity,
} from '@/services/analysisModels';
import { PeriodFilter, filterByRange, toDatetimeLocalValue, useTimestampBounds, type DateRange } from './MeasurementPeriodFilter';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Image as ImageIcon, Info, Loader2, Moon, PiggyBank, Scale, Sigma, Sparkles, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';
import { KpiInfoIcon, KpiTooltip, Term } from '@/components/shared/InfoTip';
import type { GlossaryKey } from '@/components/shared/glossary';

interface AnalysisModelsPanelProps {
  data: MeasurementData;
  title?: string;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const CLASS_COLOR: Record<DayClass, string> = {
  ouvre: 'hsl(199 89% 48%)',
  weekend: 'hsl(38 92% 50%)',
  ferie: 'hsl(280 65% 60%)',
};
const COLOR_BEFORE = 'hsl(38 92% 50%)';
const COLOR_AFTER = 'hsl(160 84% 39%)';
const COLOR_TALON = 'hsl(0 84% 60%)';

const tooltipStyle = { background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 };
const tick = { fontSize: 11, fill: 'rgba(255,255,255,0.5)' };

/* ------------------------------------------------------------------ utils */

/** Unités qu'on peut préfixer (k, M) sans changer de sens. */
const SCALABLE = /^(W|Wh|VA|VAh|var|varh|Wh\/h)$/i;

function fmt(v: number | null | undefined, unit = '', digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  let val = v, u = unit;
  if (SCALABLE.test(unit)) {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) { val = v / 1_000_000; u = `M${unit}`; }
    else if (abs >= 1000) { val = v / 1000; u = `k${unit}`; }
  }
  return `${val.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(val) < 10 ? 2 : digits })}${u ? ` ${u}` : ''}`;
}

function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${signed && v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function fmtDateTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const SEVERITY_LABEL: Record<Severity, string> = { info: 'Info', warn: 'À vérifier', critical: 'Critique' };

/* ------------------------------------------------------------------- main */

export function AnalysisModelsPanel({ data, title, dateRange, onDateRangeChange }: AnalysisModelsPanelProps) {
  const [modelId, setModelId] = useState<ModelId>('profilType');
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const allMeasurements = useMemo(() => data.measurements ?? [], [data.measurements]);
  const bounds = useTimestampBounds(allMeasurements);
  const measurements = useMemo(() => filterByRange(allMeasurements, dateRange, bounds), [allMeasurements, dateRange, bounds]);

  const ctx: SeriesContext = useMemo(() => ({
    label: title ?? data.file_name ?? 'Relevé',
    sensorType: data.sensor_type,
    measurements,
    metricKey: 'consumption',
    metricLabel: data.metric_label ?? 'Valeur',
    unit: data.unit ?? data.kpis?.unit ?? '',
    quantityKind: data.quantity_kind ?? 'energy',
  }), [measurements, title, data]);

  // Applicabilité de chaque modèle d'après la nature des données.
  const shape = useMemo(() => {
    const pts = toPoints(ctx);
    const stepMs = detectStepMs(pts);
    const days = new Set(pts.map((p) => new Date(p.t).toDateString())).size;
    return { subDaily: stepMs < 86_400_000, days, points: pts.length };
  }, [ctx]);

  const availability = useMemo(
    () => Object.fromEntries(ANALYSIS_MODELS.map((m) => [m.id, m.notApplicable(ctx.quantityKind, shape.subDaily, shape.days)])) as Record<ModelId, string | null>,
    [ctx.quantityKind, shape],
  );

  // Si le modèle courant ne s'applique plus (changement de fichier), on bascule sur le premier disponible.
  useEffect(() => {
    if (availability[modelId]) {
      const first = ANALYSIS_MODELS.find((m) => !availability[m.id]);
      if (first) setModelId(first.id);
    }
  }, [availability, modelId]);

  const exportImage = async () => {
    if (!resultRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(resultRef.current, {
        scale: 2, logging: false, useCORS: true, backgroundColor: '#0f111a',
        ignoreElements: isHoverArtifact,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const slug = (title ?? ctx.metricLabel).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      a.download = `${slug}_${modelId}.png`;
      a.click();
    } catch (e) {
      toast({ title: 'Export impossible', description: String(e), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  if (shape.points === 0) {
    return <div className="text-center py-10 text-slate-500 text-sm">Aucune mesure numérique sur la période choisie.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Choix du modèle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {ANALYSIS_MODELS.map((m) => {
          const reason = availability[m.id];
          const active = m.id === modelId;
          return (
            <button key={m.id} disabled={!!reason} onClick={() => setModelId(m.id)} title={reason ?? undefined}
              className={`text-left p-3 rounded-xl border transition-all
                ${active ? 'border-blue-500/60 bg-blue-600/15' : reason ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
              <p className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-200'}`}>{m.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{m.question}</p>
              {reason && <p className="text-[11px] text-slate-500 mt-1">{reason}</p>}
            </button>
          );
        })}
      </div>

      {/* Période + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodFilter bounds={bounds} value={dateRange} onChange={onDateRangeChange} />
        <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8 text-xs" onClick={exportImage} disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
          Exporter en image
        </Button>
      </div>

      <div ref={resultRef} className="space-y-4 rounded-lg p-1">
        <p className="text-xs text-slate-500 px-1">
          {ctx.label} · {ctx.metricLabel}{ctx.unit ? ` (${ctx.unit})` : ''} · {shape.days} jour(s) · {shape.points.toLocaleString('fr-FR')} mesures
        </p>
        {modelId === 'profilType' && <ProfilTypeView ctx={ctx} />}
        {modelId === 'talon' && <TalonView ctx={ctx} />}
        {modelId === 'anomalies' && <AnomaliesView ctx={ctx} />}
        {modelId === 'avantApres' && <AvantApresView ctx={ctx} bounds={bounds} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Profil type */

function ProfilTypeView({ ctx }: { ctx: SeriesContext }) {
  const res = useMemo(() => computeProfilType(ctx), [ctx]);
  const [dayClass, setDayClass] = useState<DayClass>(res.profiles[0]?.dayClass ?? 'ouvre');
  const profile = res.profiles.find((p) => p.dayClass === dayClass) ?? res.profiles[0];

  useEffect(() => {
    if (!res.profiles.some((p) => p.dayClass === dayClass) && res.profiles[0]) setDayClass(res.profiles[0].dayClass);
  }, [res, dayClass]);

  const chartData = useMemo(
    () => (profile?.slots ?? []).map((s) => ({ hour: `${String(s.hour).padStart(2, '0')}h`, Médiane: s.median, 'P10–P90': [s.p10, s.p90], Moyenne: s.mean })),
    [profile],
  );
  const typical = res.typicalDays.find((t) => t.dayClass === dayClass);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {res.profiles.map((p) => (
          <StatCard key={p.dayClass} icon={<CalendarDays className="h-4 w-4" style={{ color: CLASS_COLOR[p.dayClass] }} />}
            term="jourType" label={`${DAY_CLASS_LABEL[p.dayClass]} · ${p.days} j`}
            value={fmt(p.dailyMedian, res.dailyUnit)}
            hint={`moyenne journalière : ${fmt(p.dailyMean, res.dailyUnit)}`} />
        ))}
        {res.profiles.length >= 2 && (() => {
          const o = res.profiles.find((p) => p.dayClass === 'ouvre');
          const w = res.profiles.find((p) => p.dayClass === 'weekend');
          if (!o || !w || !o.dailyMedian) return null;
          const ratio = (w.dailyMedian / o.dailyMedian) * 100;
          return <StatCard icon={<Scale className="h-4 w-4 text-blue-400" />} term="ratioWeekend" label="Week-end / ouvré" value={fmtPct(ratio, false)}
            hint={ratio > 80 ? 'le site tourne presque autant le week-end' : ratio > 40 ? 'baisse partielle le week-end' : 'le site s\'éteint bien le week-end'} />;
        })()}
      </div>

      {res.subDaily && profile ? (
        <Card className="p-4 bg-white/5 border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="text-sm font-medium text-slate-200">Journée type — médiane et enveloppe P10–P90 par heure</p>
            <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10" data-no-export>
              {res.profiles.map((p) => (
                <button key={p.dayClass} onClick={() => setDayClass(p.dayClass)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${p.dayClass === dayClass ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {DAY_CLASS_LABEL[p.dayClass]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            {DAY_CLASS_LABEL[dayClass]} · {profile.days} jour(s){typical ? ` · jour le plus représentatif : ${fmtDay(typical.day)}` : ''} · valeurs horaires en {res.hourlyUnit} · courbes : <Term k="mediane">médiane</Term> et <Term k="p10p90">enveloppe P10–P90</Term>
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="hour" tick={tick} />
              <YAxis tick={tick} width={70} tickFormatter={(v) => fmt(Number(v), '', 0)} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number | number[], n) => [Array.isArray(v) ? `${fmt(v[0], res.hourlyUnit)} → ${fmt(v[1], res.hourlyUnit)}` : fmt(Number(v), res.hourlyUnit), n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
              <Area type="monotone" dataKey="P10–P90" stroke="none" fill={CLASS_COLOR[dayClass]} fillOpacity={0.18} isAnimationActive={false} />
              <Line type="monotone" dataKey="Médiane" stroke={CLASS_COLOR[dayClass]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Moyenne" stroke="rgba(255,255,255,0.5)" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Note>Données journalières : pas de profil horaire, seule la comparaison ouvré / week-end / férié est disponible.</Note>
      )}

      <Card className="p-4 bg-white/5 border-white/10">
        <p className="text-sm font-medium text-slate-200 mb-1">Jours atypiques</p>
        <p className="text-[11px] text-slate-500 mb-3">Jours qui s'écartent de plus de 20 % de la <Term k="mediane">médiane</Term> journalière de leur <Term k="classeJour">classe de jour</Term> — à recouper avec ce qui s'est passé sur site.</p>
        {res.atypical.length === 0 ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Aucun jour ne sort du lot.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-white/10">
                <th className="text-left py-2 pr-3 font-medium">Jour</th>
                <th className="text-left py-2 px-3 font-medium">Classe</th>
                <th className="text-right py-2 px-3 font-medium">Valeur du jour</th>
                <th className="text-right py-2 pl-3 font-medium">Écart à la médiane</th>
              </tr>
            </thead>
            <tbody>
              {res.atypical.map((a) => (
                <tr key={a.day} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-slate-200">{fmtDay(a.day)}</td>
                  <td className="py-2 px-3 text-slate-400">{DAY_CLASS_LABEL[a.dayClass]}</td>
                  <td className="py-2 px-3 text-right text-slate-200 tabular-nums">{fmt(a.daily, res.dailyUnit)}</td>
                  <td className={`py-2 pl-3 text-right tabular-nums ${a.deviationPct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmtPct(a.deviationPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Talon */

function TalonView({ ctx }: { ctx: SeriesContext }) {
  const res = useMemo(() => computeTalon(ctx), [ctx]);
  const chartData = useMemo(
    () => res.days.map((d) => ({ day: fmtDay(d.day).slice(0, 5), Talon: d.talon, Pointe: d.peak, dayClass: d.dayClass })),
    [res],
  );
  if (!res.applicable) return <Note>{res.reason}</Note>;

  const o = res.talonByClass.find((c) => c.dayClass === 'ouvre');
  const w = res.talonByClass.find((c) => c.dayClass === 'weekend');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Moon className="h-4 w-4 text-red-400" />} term="talon" label="Talon retenu" value={fmt(res.talon, res.hourlyUnit)}
          hint={`pointe P95 de la période : ${fmt(res.peak, res.hourlyUnit)}`} />
        <StatCard icon={<Scale className="h-4 w-4 text-blue-400" />} term="talonPointe" label="Talon / pointe" value={fmtPct(res.talonToPeak * 100, false)}
          hint={res.talonToPeak > 0.5 ? 'plus de la moitié de la pointe ne s\'éteint jamais' : res.talonToPeak > 0.25 ? 'charge de base notable' : 'charge de base faible'} />
        <StatCard icon={<Sigma className="h-4 w-4 text-amber-400" />} term="partTalon" label="Part du talon dans le cumul" value={fmtPct(res.share * 100, false)}
          hint={`${fmt(res.talonEnergy, res.dailyUnit)} sur ${fmt(res.totalEnergy, res.dailyUnit)} (${Math.round(res.periodHours)} h)`} />
        <StatCard icon={<Zap className="h-4 w-4 text-purple-400" />} term="projectionTalon" label="Projection annuelle du talon" value={fmt(res.yearly, res.dailyUnit)} />
      </div>

      {o && w && Number.isFinite(o.talon) && Number.isFinite(w.talon) && (
        <Note icon={<Info className="h-4 w-4 text-blue-400 shrink-0" />}>
          Talon ouvré {fmt(o.talon, res.hourlyUnit)} · week-end {fmt(w.talon, res.hourlyUnit)}
          {Math.abs(w.talon - o.talon) < 0.1 * Math.max(Math.abs(o.talon), 1e-9)
            ? ' — identique le week-end : ce qui reste allumé la nuit reste allumé tout le week-end.'
            : w.talon < o.talon ? ' — plus bas le week-end : une partie des équipements est bien arrêtée.' : ' — plus haut le week-end : à expliquer.'}
        </Note>
      )}

      <Card className="p-4 bg-white/5 border-white/10">
        <p className="text-sm font-medium text-slate-200 mb-1">Talon et pointe de chaque jour</p>
        <p className="text-[11px] text-slate-500 mb-2">Barres : pointe horaire · trait rouge : <Term k="talon">talon</Term> du jour · ligne pointillée : talon retenu ({res.hourlyUnit})</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" tick={tick} minTickGap={24} />
            <YAxis tick={tick} width={70} tickFormatter={(v) => fmt(Number(v), '', 0)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [fmt(Number(v), res.hourlyUnit), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
            <Bar dataKey="Pointe" fill="rgba(255,255,255,0.35)" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={CLASS_COLOR[d.dayClass]} fillOpacity={0.5} />)}
            </Bar>
            <Line type="monotone" dataKey="Talon" stroke={COLOR_TALON} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            <ReferenceLine y={res.talon} stroke={COLOR_TALON} strokeDasharray="4 3" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 mt-1">
          Couleur des barres : <span style={{ color: CLASS_COLOR.ouvre }}>ouvré</span> · <span style={{ color: CLASS_COLOR.weekend }}>week-end</span> · <span style={{ color: CLASS_COLOR.ferie }}>férié</span>
          {res.days.some((d) => d.fromP5) && ' · jours sans mesure de nuit : talon = P5 des points du jour'}
        </p>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- Anomalies */

function AnomaliesView({ ctx }: { ctx: SeriesContext }) {
  const res = useMemo(() => computeAnomalies(ctx), [ctx]);
  const [filter, setFilter] = useState<AnomalyKind | 'all'>('all');
  const events = filter === 'all' ? res.events : res.events.filter((e) => e.kind === filter);
  const kinds: AnomalyKind[] = ['gap', 'flat', 'high', 'low'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle2 className={`h-4 w-4 ${res.completeness > 0.98 ? 'text-emerald-400' : res.completeness > 0.9 ? 'text-amber-400' : 'text-red-400'}`} />}
          term="completude" label="Complétude de la collecte" value={fmtPct(res.completeness * 100, false)}
          hint={`${res.actualPoints.toLocaleString('fr-FR')} mesures sur ${res.expectedPoints.toLocaleString('fr-FR')} attendues au pas natif`} />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} term="trousFigees" label="Trous · valeurs figées" value={`${res.counts.gap} · ${res.counts.flat}`} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-red-400" />} term="pics" label="Pics inhabituels" value={String(res.counts.high)}
          hint={res.profileAvailable ? 'tranches bien au-dessus du profil habituel' : 'profil de référence indisponible (< 3 jours par classe)'} />
        <StatCard icon={<TrendingDown className="h-4 w-4 text-blue-400" />} term="creux" label="Creux inhabituels" value={String(res.counts.low)}
          hint={res.profileAvailable ? 'tranches bien en dessous du profil habituel' : 'profil de référence indisponible (< 3 jours par classe)'} />
      </div>

      <Card className="p-4 bg-white/5 border-white/10">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm font-medium text-slate-200">Événements — {events.length}</p>
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10" data-no-export>
            {(['all', ...kinds] as (AnomalyKind | 'all')[]).map((k) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${k === filter ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {k === 'all' ? 'Tous' : ANOMALY_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Rien à signaler.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#141625]">
                <tr className="text-xs text-slate-400 border-b border-white/10">
                  <th className="text-left py-2 pr-3 font-medium">Début</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Gravité</th>
                  <th className="text-left py-2 pl-3 font-medium">Détail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-white/5 align-top">
                    <td className="py-2 pr-3 text-slate-200 whitespace-nowrap tabular-nums">{fmtDateTime(e.start)}</td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{ANOMALY_LABEL[e.kind]}</td>
                    <td className="py-2 px-3"><span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${SEVERITY_STYLE[e.severity]}`}>{SEVERITY_LABEL[e.severity]}</span></td>
                    <td className="py-2 pl-3 text-slate-400">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- Avant / Après */

function AvantApresView({ ctx, bounds }: { ctx: SeriesContext; bounds: { min: number; max: number } | null }) {
  // Coupure par défaut au milieu de la période.
  const defaultSplit = bounds ? bounds.min + (bounds.max - bounds.min) / 2 : Date.now();
  const [splitInput, setSplitInput] = useState<string>(toDatetimeLocalValue(defaultSplit).slice(0, 10));
  useEffect(() => { setSplitInput(toDatetimeLocalValue(defaultSplit).slice(0, 10)); }, [defaultSplit]);
  const splitAt = new Date(`${splitInput}T00:00:00`).getTime();

  const res = useMemo(() => computeAvantApres(ctx, Number.isFinite(splitAt) ? splitAt : defaultSplit), [ctx, splitAt, defaultSplit]);

  const dailyData = useMemo(
    () => res.daily.map((d) => ({ day: fmtDay(d.day).slice(0, 5), value: d.value, side: d.side, dayClass: d.dayClass })),
    [res],
  );
  const profileData = useMemo(() => {
    const byHour = new Map<number, { hour: string; Avant?: number; Après?: number }>();
    for (const s of res.profileBefore) byHour.set(s.hour, { hour: `${String(s.hour).padStart(2, '0')}h`, Avant: s.median });
    for (const s of res.profileAfter) byHour.set(s.hour, { ...(byHour.get(s.hour) ?? { hour: `${String(s.hour).padStart(2, '0')}h` }), Après: s.median });
    return Array.from(byHour.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [res]);

  const gainColor = (v: number) => (!Number.isFinite(v) ? 'text-white' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" data-no-export>
        <span className="text-xs text-slate-400">Date de l'action (début de la période « après ») :</span>
        <Input type="date" className="h-8 w-auto text-xs bg-white/5 border-white/20 text-white" value={splitInput}
          min={bounds ? toDatetimeLocalValue(bounds.min).slice(0, 10) : undefined} max={bounds ? toDatetimeLocalValue(bounds.max).slice(0, 10) : undefined}
          onChange={(e) => e.target.value && setSplitInput(e.target.value)} />
      </div>

      {res.warnings.length > 0 && (
        <div className="space-y-1">
          {res.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-400/80 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CalendarDays className="h-4 w-4" style={{ color: COLOR_BEFORE }} />} term="avant" label={`Avant · ${res.before?.days ?? 0} j`}
          value={fmt(res.before?.dailyMean, res.dailyUnit)} hint={res.before ? `par jour · ${fmtDay(res.before.from)} → ${fmtDay(res.before.to)}` : 'aucune journée'} />
        <StatCard icon={<CalendarDays className="h-4 w-4" style={{ color: COLOR_AFTER }} />} term="apres" label={`Après · ${res.after?.days ?? 0} j`}
          value={fmt(res.after?.dailyMean, res.dailyUnit)} hint={res.after ? `par jour · ${fmtDay(res.after.from)} → ${fmtDay(res.after.to)}` : 'aucune journée'} />
        <StatCard icon={res.delta < 0 ? <TrendingDown className="h-4 w-4 text-emerald-400" /> : <TrendingUp className="h-4 w-4 text-red-400" />}
          term="ecartAvantApres" label="Écart après − avant" value={`${fmt(res.delta, res.dailyUnit)} (${fmtPct(res.deltaPct)})`}
          hint={res.robust ? 'écart net par rapport à la variabilité journalière' : 'écart du même ordre que la variabilité journalière'} />
        {res.cumulable ? (
          <StatCard icon={<PiggyBank className="h-4 w-4 text-emerald-400" />} term="gain" label="Gain sur la période après"
            value={<span className={gainColor(res.savedAfter)}>{fmt(res.savedAfter, res.dailyUnit)}</span>}
            hint={`projection sur un an : ${fmt(res.savedYearly, res.dailyUnit)} (à classe de jour égale)`} />
        ) : (
          <StatCard icon={<Sparkles className="h-4 w-4 text-blue-400" />} term="lecture" label="Lecture" value={fmtPct(res.deltaPct)} />
        )}
      </div>

      <Card className="p-4 bg-white/5 border-white/10">
        <p className="text-sm font-medium text-slate-200 mb-3">Par <Term k="classeJour">classe de jour</Term></p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-white/10">
              <th className="text-left py-2 pr-3 font-medium">Classe</th>
              <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_BEFORE }}>Avant / jour</th>
              <th className="text-right py-2 px-3 font-medium" style={{ color: COLOR_AFTER }}>Après / jour</th>
              <th className="text-right py-2 px-3 font-medium">Écart</th>
              <th className="text-right py-2 pl-3 font-medium">Écart %</th>
            </tr>
          </thead>
          <tbody>
            {res.byClass.map((c) => (
              <tr key={c.dayClass} className="border-b border-white/5">
                <td className="py-2 pr-3 text-slate-200">{DAY_CLASS_LABEL[c.dayClass]}<span className="text-slate-500 text-xs"> · {c.before?.days ?? 0} / {c.after?.days ?? 0} j</span></td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-200">{fmt(c.before?.dailyMean, res.dailyUnit)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-200">{fmt(c.after?.dailyMean, res.dailyUnit)}</td>
                <td className={`py-2 px-3 text-right tabular-nums ${gainColor(-c.delta)}`}>{fmt(c.delta, res.dailyUnit)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${gainColor(-c.delta)}`}>{fmtPct(c.deltaPct)}{c.robust ? '' : c.before && c.after ? ' ?' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-2">« ? » : écart du même ordre que la variabilité d'un jour à l'autre.</p>
      </Card>

      <Card className="p-4 bg-white/5 border-white/10">
        <p className="text-sm font-medium text-slate-200 mb-1">Valeur de chaque jour</p>
        <p className="text-[11px] text-slate-500 mb-2">{res.dailyUnit} par jour · <span style={{ color: COLOR_BEFORE }}>avant</span> / <span style={{ color: COLOR_AFTER }}>après</span> · lignes pointillées : moyennes de chaque côté</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" tick={tick} minTickGap={24} />
            <YAxis tick={tick} width={70} tickFormatter={(v) => fmt(Number(v), '', 0)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(Number(v), res.dailyUnit), 'Jour']} />
            <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {dailyData.map((d, i) => <Cell key={i} fill={d.side === 'before' ? COLOR_BEFORE : COLOR_AFTER} fillOpacity={d.dayClass === 'ouvre' ? 0.85 : 0.45} />)}
            </Bar>
            {res.before && <ReferenceLine y={res.before.dailyMean} stroke={COLOR_BEFORE} strokeDasharray="4 3" />}
            {res.after && <ReferenceLine y={res.after.dailyMean} stroke={COLOR_AFTER} strokeDasharray="4 3" />}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 mt-1">Barres pleines : jours ouvrés · barres claires : week-ends et fériés.</p>
      </Card>

      {res.subDaily && profileData.length > 0 && (
        <Card className="p-4 bg-white/5 border-white/10">
          <p className="text-sm font-medium text-slate-200 mb-1">Journée type avant / après</p>
          <p className="text-[11px] text-slate-500 mb-2">
            Médiane horaire ({res.hourlyUnit}) sur {res.profileClass === 'ouvre' ? 'les jours ouvrés' : 'tous les jours'} — montre à quelles heures l'action a joué.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={profileData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="hour" tick={tick} />
              <YAxis tick={tick} width={70} tickFormatter={(v) => fmt(Number(v), '', 0)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [fmt(Number(v), res.hourlyUnit), n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
              <Line type="monotone" dataKey="Avant" stroke={COLOR_BEFORE} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Après" stroke={COLOR_AFTER} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function StatCard({ icon, label, value, hint, term }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; term?: GlossaryKey }) {
  return (
    <KpiTooltip term={term} hint={hint}>
      <div className="p-3 rounded-xl border border-white/10 bg-white/5 h-full">
        <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}{label}{(term || hint) && <KpiInfoIcon />}</div>
        <p className="text-lg font-semibold mt-1 leading-tight text-white">{value}</p>
      </div>
    </KpiTooltip>
  );
}

function Note({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="text-sm text-slate-300 flex items-start gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
      {icon ?? <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </p>
  );
}
