/**
 * Compteur général / sous-compteurs — les sous-compteurs expliquent-ils
 * l'arrivée ? Le relevé du compteur général est comparé à la somme des relevés
 * des départs mesurés en aval. Le calcul est dans lib/sensor-comparison.ts ;
 * ici on parle le langage du gestionnaire de site : arrivée, départs, part non
 * mesurée, et un verdict en une phrase avant les chiffres. Les indicateurs
 * techniques (corrélation, conversions) restent disponibles, repliés.
 */

import { useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ResponsiveContainer } from '@/components/shared/ZoomableChart';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, GitBranch, AlertTriangle, CheckCircle2, AlertCircle, ChevronRight, HelpCircle } from 'lucide-react';
import { MeasurementData, measurementLabel } from '@/services/measurementService';
import { computeComparison, areUnitsCompatible, energyUnitFor, isPowerUnit, type BucketGranularity, type ComparisonResult } from '@/lib/sensor-comparison';
import { KpiInfoIcon, KpiTooltip } from '@/components/shared/InfoTip';
import type { GlossaryKey } from '@/components/shared/glossary';

interface SensorComparisonPanelProps {
  measurementData: MeasurementData[];
}

/** Nom du relevé + grandeur, pour distinguer deux fichiers du même appareil. */
function fileLabel(d: MeasurementData, i: number): string {
  const name = measurementLabel(d, i);
  return d.metric_label ? `${name} · ${d.metric_label}` : name;
}

function fmt(v: number, unit?: string): string {
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

function fmtPct(v: number): string {
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function formatBucketLabel(key: string): string {
  // 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH'
  const [datePart, hourPart] = key.split('T');
  const [, mm, dd] = datePart.split('-');
  return hourPart ? `${dd}/${mm} ${hourPart}h` : `${dd}/${mm}`;
}

// ---------------------------------------------------------------------------
// Verdict — la conclusion que l'utilisateur attend, avant les chiffres.
// Seuils : au-delà de 5 % de dépassement on soupçonne un double comptage ;
// en dessous de 90 % de couverture il manque des départs ; à couverture bonne,
// une corrélation sous 0,7 signifie que les courbes ne bougent pas ensemble
// (mauvais circuit). La corrélation n'est pas jugée à couverture faible : les
// courbes diffèrent forcément quand la moitié de l'énergie n'est pas mesurée.
// ---------------------------------------------------------------------------

const EXCESS_PCT = 5;
const GOOD_COVERAGE_PCT = 90;
const MIN_CORRELATION = 0.7;

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

interface Verdict {
  tone: Tone;
  title: string;
  detail: string;
}

function buildVerdict(r: ComparisonResult, unit?: string): Verdict {
  if (r.buckets.length === 0) {
    return { tone: 'neutral', title: 'Les relevés ne couvrent pas la même période.', detail: 'Le compteur général et les sous-compteurs n\'ont aucun jour en commun : rien ne peut être comparé. Vérifiez que les fichiers viennent de la même campagne de mesure.' };
  }
  if (r.masterTotal <= 0) {
    return { tone: 'neutral', title: 'Le compteur général ne reporte aucune énergie sur la période.', detail: 'Vérifiez la période commune aux relevés et le fichier choisi comme compteur général.' };
  }
  const coverage = (r.slavesTotal / r.masterTotal) * 100;
  const excess = -(r.deltaPct ?? 0);

  if (excess > EXCESS_PCT) {
    return {
      tone: 'bad',
      title: `La somme des départs dépasse l'arrivée de ${fmtPct(excess)}.`,
      detail: 'Un sous-compteur compte probablement en double (deux capteurs sur le même circuit) ou est mal câblé. Un sous-compteur ne peut pas mesurer plus que le compteur qui l\'alimente.',
    };
  }
  if (coverage < GOOD_COVERAGE_PCT) {
    return {
      tone: 'warn',
      title: `${fmtPct(100 - coverage)} de l'énergie de l'arrivée n'est mesurée par aucun sous-compteur.`,
      detail: `${fmt(r.deltaAbs, unit)} passent par des départs non instrumentés. Pour savoir où va cette énergie, il faut équiper les départs manquants — ou cocher les sous-compteurs qui manquent à la sélection.`,
    };
  }
  // Couverture bonne mais courbes qui ne bougent pas ensemble : les totaux se
  // ressemblent par hasard, pas parce que les capteurs mesurent le même circuit.
  if (r.correlation != null && r.correlation < MIN_CORRELATION) {
    return {
      tone: 'bad',
      title: 'Les totaux concordent, mais pas les courbes.',
      detail: 'Les variations de l\'arrivée ne se retrouvent pas dans les départs : vérifiez que les sous-compteurs sont bien en aval de ce compteur général, et que les horloges des appareils sont à l\'heure.',
    };
  }
  return {
    tone: 'good',
    title: `Les sous-compteurs couvrent ${fmtPct(coverage)} de l'arrivée : l'installation est bien mesurée.`,
    detail: `Il reste ${fmt(r.deltaAbs, unit)} non mesurés, ce qui correspond aux petites charges sans capteur (éclairage, prises, auxiliaires).`,
  };
}

const TONE_STYLE: Record<Tone, { box: string; icon: React.ReactNode }> = {
  good: { box: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100', icon: <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" /> },
  warn: { box: 'border-amber-500/40 bg-amber-500/10 text-amber-100', icon: <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" /> },
  bad: { box: 'border-red-500/40 bg-red-500/10 text-red-100', icon: <AlertCircle className="h-5 w-5 text-red-400 shrink-0" /> },
  neutral: { box: 'border-white/15 bg-white/5 text-slate-200', icon: <HelpCircle className="h-5 w-5 text-slate-400 shrink-0" /> },
};

/** Couleurs des départs empilés dans le graphique. */
const SLAVE_COLORS = ['hsl(199 89% 48%)', 'hsl(160 60% 45%)', 'hsl(262 60% 60%)', 'hsl(330 65% 55%)', 'hsl(24 85% 55%)', 'hsl(45 90% 50%)'];
const MASTER_COLOR = 'hsl(38 92% 50%)';

/** Le compteur général est presque toujours le relevé au plus gros cumul : on le propose d'office. */
function guessMasterIdx(data: MeasurementData[]): number | null {
  if (data.length < 2) return null;
  let best = 0;
  let bestTotal = -Infinity;
  data.forEach((d, i) => {
    const total = (d.measurements ?? []).reduce((s, m) => s + (Number(m.consumption) || 0), 0);
    if (total > bestTotal) { bestTotal = total; best = i; }
  });
  return best;
}

export function SensorComparisonPanel({ measurementData }: SensorComparisonPanelProps) {
  const [masterIdx, setMasterIdx] = useState<number | null>(() => guessMasterIdx(measurementData));
  const [slaveIdxs, setSlaveIdxs] = useState<Set<number>>(new Set());
  const [granularity, setGranularity] = useState<BucketGranularity>('day');
  const [showDetails, setShowDetails] = useState(false);

  const masterUnit = masterIdx != null ? measurementData[masterIdx]?.unit : undefined;
  // Les cumuls sont toujours exprimés en énergie (Wh/VAh/varh selon la famille du
  // compteur général), même si celui-ci reporte une puissance instantanée.
  const resultUnit = energyUnitFor(masterUnit);

  const eligibleSlaves = useMemo(
    () => measurementData
      .map((d, i) => ({ d, i }))
      .filter(({ i, d }) => i !== masterIdx && (!masterUnit || areUnitsCompatible(d.unit, masterUnit))),
    [measurementData, masterIdx, masterUnit],
  );

  const toggleSlave = (i: number) => {
    setSlaveIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const slaveList = useMemo(() => Array.from(slaveIdxs), [slaveIdxs]);

  const result = useMemo(() => {
    if (masterIdx == null || slaveList.length === 0) return null;
    const master = measurementData[masterIdx];
    return computeComparison(
      { id: String(masterIdx), label: fileLabel(master, masterIdx), unit: master.unit, measurements: master.measurements ?? [] },
      slaveList.map((idx) => {
        const s = measurementData[idx];
        return { id: String(idx), label: fileLabel(s, idx), unit: s.unit, measurements: s.measurements ?? [] };
      }),
      granularity,
    );
  }, [measurementData, masterIdx, slaveList, granularity]);

  if (measurementData.length < 2) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-slate-300 text-sm">Pour vérifier la cohérence d'une installation, il faut au moins deux relevés.</p>
        <p className="text-slate-500 text-xs">Importez le relevé du compteur général (l'arrivée) et celui d'au moins un sous-compteur mesurant la même grandeur (ex. puissance active en W).</p>
      </div>
    );
  }

  const verdict = result ? buildVerdict(result, resultUnit) : null;
  const coverage = result && result.masterTotal > 0 ? (result.slavesTotal / result.masterTotal) * 100 : null;
  const missingLabel = result && result.deltaAbs < 0 ? 'Surcompté' : 'Non mesuré';

  const chartData = result?.buckets.map((b) => {
    const row: Record<string, string | number> = {
      key: formatBucketLabel(b.key),
      'Compteur général': Number(b.masterValue.toFixed(2)),
    };
    slaveList.forEach((idx) => {
      row[measurementLabel(measurementData[idx], idx)] = Number((b.slaveValues[String(idx)] ?? 0).toFixed(2));
    });
    return row;
  }) ?? [];

  const worstBuckets = result
    ? [...result.buckets].sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual)).slice(0, 3)
    : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">
        Le compteur général mesure tout ce qui entre dans le bâtiment ; les sous-compteurs mesurent chaque départ.
        Si leur somme est proche de l'arrivée, l'installation est bien couverte. S'il manque une part, des départs ne sont pas mesurés.
        Si la somme dépasse l'arrivée, un capteur compte en double.
      </p>

      {/* Sélection compteur général / sous-compteurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-amber-400" /> Compteur général
            <span className="text-xs text-slate-500 font-normal">— l'arrivée, le TGBT</span>
          </label>
          <Select
            value={masterIdx != null ? String(masterIdx) : undefined}
            onValueChange={(v) => { setMasterIdx(Number(v)); setSlaveIdxs(new Set()); }}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue placeholder="Choisir le relevé de l'arrivée…" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {measurementData.map((d, i) => (
                <SelectItem key={i} value={String(i)} className="text-slate-200 focus:bg-white/10">
                  {fileLabel(d, i)}{d.unit ? ` (${d.unit})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Détail</label>
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10 w-fit">
            {(['day', 'hour'] as BucketGranularity[]).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${granularity === g ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {g === 'day' ? 'Par jour' : 'Par heure'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {masterIdx != null && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-blue-400" /> Sous-compteurs
            <span className="text-xs text-slate-500 font-normal">— les départs mesurés en aval</span>
          </label>
          {eligibleSlaves.length === 0 ? (
            <p className="text-xs text-amber-400/80 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Aucun autre relevé ne mesure la même grandeur que ce compteur général ({masterUnit ?? 'unité inconnue'}).
                On ne peut additionner que des relevés comparables : puissance active avec puissance active (W ou Wh), apparente avec apparente (VA), réactive avec réactive (var).
              </span>
            </p>
          ) : (
            <div className="space-y-1.5">
              {eligibleSlaves.map(({ d, i }) => {
                const crossesKind = d.unit && masterUnit && isPowerUnit(d.unit) !== isPowerUnit(masterUnit);
                return (
                  <label key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                    <input type="checkbox" checked={slaveIdxs.has(i)} onChange={() => toggleSlave(i)}
                      className="w-4 h-4 accent-blue-500" />
                    <span className="text-sm text-slate-200">
                      {fileLabel(d, i)}
                      {crossesKind && (
                        <span className="text-slate-500 ml-1.5 text-xs">
                          ({isPowerUnit(d.unit) ? `${d.unit} converti en énergie ${energyUnitFor(d.unit)}` : `converti en ${energyUnitFor(masterUnit)}`})
                        </span>
                      )}
                      {!crossesKind && d.unit && d.unit !== masterUnit && (
                        <span className="text-slate-500 ml-1.5 text-xs">(converti de {d.unit} vers {resultUnit})</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {slaveIdxs.size === 0 && (
                <p className="text-xs text-slate-500">Cochez les sous-compteurs branchés en aval de ce compteur général.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Résultats */}
      {result && verdict && (
        <>
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${TONE_STYLE[verdict.tone].box}`}>
            {TONE_STYLE[verdict.tone].icon}
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-snug">{verdict.title}</p>
              <p className="text-xs opacity-80 leading-relaxed">{verdict.detail}</p>
            </div>
          </div>

          {(result.masterOnlyBuckets > 0 || result.slavesOnlyBuckets > 0) && result.buckets.length > 0 && (
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400/70" />
              <span>
                Comparaison limitée à la période commune ({result.buckets.length} {granularity === 'day' ? 'jour(s)' : 'heure(s)'}).
                {result.masterOnlyBuckets > 0 && ` ${result.masterOnlyBuckets} ${granularity === 'day' ? 'jour(s)' : 'heure(s)'} du compteur général sans aucun sous-compteur écarté(s).`}
                {result.slavesOnlyBuckets > 0 && ` ${result.slavesOnlyBuckets} ${granularity === 'day' ? 'jour(s)' : 'heure(s)'} de sous-compteurs sans compteur général écarté(s).`}
              </span>
            </p>
          )}

          {result.buckets.length > 0 && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard term="couverture" label="Couverture" value={coverage != null ? fmtPct(coverage) : '—'} accent />
            <StatCard term="arrivee" label="Arrivée" value={fmt(result.masterTotal, resultUnit)} />
            <StatCard term="sommeDeparts" label="Somme des départs" hint={`${slaveList.length} sous-compteur${slaveList.length > 1 ? 's' : ''}`} value={fmt(result.slavesTotal, resultUnit)} />
            <StatCard
              term={result.deltaAbs < 0 ? 'surcompte' : 'nonMesure'}
              label={missingLabel}
              hint={result.deltaAbs < 0 ? 'les départs dépassent l\'arrivée' : 'passe par des départs sans capteur'}
              value={`${fmt(Math.abs(result.deltaAbs), resultUnit)}${result.deltaPct != null ? ` (${fmtPct(Math.abs(result.deltaPct))})` : ''}`}
              tone={result.deltaAbs < 0 ? 'bad' : undefined}
            />
          </div>

          <Card className="p-4 bg-white/5 border-white/10">
            <p className="text-sm font-medium text-slate-200">Arrivée et départs — {granularity === 'day' ? 'par jour' : 'par heure'}</p>
            <p className="text-xs text-slate-500 mb-3">Les départs sont empilés ; l'espace entre le haut de la pile et la ligne de l'arrivée est la part non mesurée.</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="key" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} unit={resultUnit ? ` ${resultUnit}` : ''} />
                <Tooltip contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }} />
                <Legend />
                {slaveList.map((idx, k) => (
                  <Area key={idx} type="monotone" stackId="departs"
                    dataKey={measurementLabel(measurementData[idx], idx)}
                    stroke={SLAVE_COLORS[k % SLAVE_COLORS.length]} fill={SLAVE_COLORS[k % SLAVE_COLORS.length]} fillOpacity={0.35} />
                ))}
                <Line type="monotone" dataKey="Compteur général" stroke={MASTER_COLOR} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {worstBuckets.length > 0 && (
            <Card className="p-4 bg-white/5 border-white/10">
              <p className="text-sm font-medium text-slate-200 mb-1">
                {granularity === 'day' ? 'Jours' : 'Heures'} où l'écart est le plus grand
              </p>
              <p className="text-xs text-slate-500 mb-3">Un écart isolé un jour précis peut signaler un capteur qui a décroché ce jour-là.</p>
              <div className="space-y-1.5">
                {worstBuckets.map((b) => (
                  <div key={b.key} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-slate-300">{formatBucketLabel(b.key)}</span>
                    <span className={b.residual >= 0 ? 'text-amber-300' : 'text-red-400'}>
                      {b.residual >= 0 ? 'manque ' : 'excès '}{fmt(Math.abs(b.residual), resultUnit)}
                      {b.residualPct != null ? ` (${fmtPct(Math.abs(b.residualPct))})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          </>)}

          {/* Indicateurs techniques, repliés : l'auditeur les trouve, les autres ne les voient pas. */}
          <div className="rounded-xl border border-white/10 bg-white/5">
            <button onClick={() => setShowDetails((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:text-white">
              <ChevronRight className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
              Détails techniques
            </button>
            {showDetails && (
              <div className="px-4 pb-4 space-y-2 text-xs text-slate-400">
                <p>
                  <span className="text-slate-300">Corrélation (r) : {result.correlation != null ? result.correlation.toFixed(3) : '—'}</span>
                  {' '}— proche de 1, les deux courbes montent et descendent ensemble ; sous {MIN_CORRELATION}, elles ne décrivent probablement pas le même circuit.
                </p>
                <p>
                  Écart signé : {fmt(result.deltaAbs, resultUnit)}{result.deltaPct != null ? ` (${result.deltaPct.toFixed(1)} % de l'arrivée)` : ''}, positif quand l'arrivée dépasse la somme des départs.
                </p>
                {isPowerUnit(masterUnit) && (
                  <p>
                    Le compteur général reporte une puissance instantanée ({masterUnit}) : les cumuls sont son énergie intégrée dans le temps ({resultUnit}), pas une somme brute de puissances.
                  </p>
                )}
                <p>
                  Seuils du verdict : dépassement &gt; {EXCESS_PCT} % = double comptage suspecté ; couverture &lt; {GOOD_COVERAGE_PCT} % = départs manquants ; sinon r &lt; {MIN_CORRELATION} = courbes différentes.
                </p>
                <p>Période comparée : {result.buckets.length} {granularity === 'day' ? 'jour(s)' : 'heure(s)'} où les deux côtés ont une valeur.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, hint, value, accent, tone, term }: { label: string; hint?: string; value: string; accent?: boolean; tone?: Tone; term?: GlossaryKey }) {
  const valueColor = tone === 'bad' ? 'text-red-300' : accent ? 'text-blue-200' : 'text-white';
  return (
    <KpiTooltip term={term} hint={hint}>
      <div className={`p-3 rounded-xl border h-full ${accent ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/10 bg-white/5'}`}>
        <div className="flex items-center gap-1.5 text-slate-400 text-xs">{label}{(term || hint) && <KpiInfoIcon />}</div>
        <p className={`text-lg font-semibold mt-1 leading-tight ${valueColor}`}>{value}</p>
      </div>
    </KpiTooltip>
  );
}
