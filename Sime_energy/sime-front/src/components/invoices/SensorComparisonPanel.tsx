/**
 * Comparaison maître/esclave entre capteurs déjà uploadés dans la session.
 * Principe : un capteur "maître" (ex: arrivée générale) est comparé à la somme
 * d'un ou plusieurs capteurs "esclaves" (ex: sous-compteurs) censés l'expliquer.
 */

import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crown, GitBranch, TrendingDown, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { MeasurementData } from '@/services/measurementService';
import { computeComparison, areUnitsCompatible, energyUnitFor, isPowerUnit, type BucketGranularity } from '@/lib/sensor-comparison';

interface SensorComparisonPanelProps {
  measurementData: MeasurementData[];
}

function fileLabel(d: MeasurementData, i: number): string {
  return d.metric_label ? `${d.metric_label} (${d.sensor_type ?? `Fichier ${i + 1}`})` : d.sensor_type ?? `Fichier ${i + 1}`;
}

function fmt(v: number, unit?: string): string {
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

function formatBucketLabel(key: string): string {
  // 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH'
  const [datePart, hourPart] = key.split('T');
  const [, mm, dd] = datePart.split('-');
  return hourPart ? `${dd}/${mm} ${hourPart}h` : `${dd}/${mm}`;
}

export function SensorComparisonPanel({ measurementData }: SensorComparisonPanelProps) {
  const [masterIdx, setMasterIdx] = useState<number | null>(measurementData.length > 1 ? 0 : null);
  const [slaveIdxs, setSlaveIdxs] = useState<Set<number>>(new Set());
  const [granularity, setGranularity] = useState<BucketGranularity>('day');

  const masterUnit = masterIdx != null ? measurementData[masterIdx]?.unit : undefined;
  // Les cumuls sont toujours exprimés en énergie (Wh/VAh/varh selon la famille du
  // maître), même si le capteur maître lui-même reporte une puissance instantanée.
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

  const result = useMemo(() => {
    if (masterIdx == null || slaveIdxs.size === 0) return null;
    const master = measurementData[masterIdx];
    const slaves = Array.from(slaveIdxs).map((i) => measurementData[i]);
    return computeComparison(
      { id: String(masterIdx), label: fileLabel(master, masterIdx), unit: master.unit, measurements: master.measurements ?? [] },
      slaves.map((s, k) => {
        const idx = Array.from(slaveIdxs)[k];
        return { id: String(idx), label: fileLabel(s, idx), unit: s.unit, measurements: s.measurements ?? [] };
      }),
      granularity,
    );
  }, [measurementData, masterIdx, slaveIdxs, granularity]);

  if (measurementData.length < 2) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        Il faut au moins 2 fichiers uploadés pour faire une comparaison maître/esclave.
      </div>
    );
  }

  const chartData = result?.buckets.map((b) => ({
    key: formatBucketLabel(b.key),
    Maître: Number(b.masterValue.toFixed(2)),
    'Σ Esclaves': Number(b.slavesSum.toFixed(2)),
  })) ?? [];

  const worstBuckets = result
    ? [...result.buckets].sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual)).slice(0, 3)
    : [];

  return (
    <div className="space-y-5">
      {/* Sélection maître / esclaves */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> Capteur maître
          </label>
          <Select
            value={masterIdx != null ? String(masterIdx) : undefined}
            onValueChange={(v) => { setMasterIdx(Number(v)); setSlaveIdxs(new Set()); }}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue placeholder="Sélectionnez le capteur de référence…" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {measurementData.map((d, i) => (
                <SelectItem key={i} value={String(i)} className="text-slate-200 focus:bg-white/10">
                  {fileLabel(d, i)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-blue-400" /> Granularité
          </label>
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
          <label className="text-sm font-medium text-slate-200">Capteurs esclaves</label>
          {eligibleSlaves.length === 0 ? (
            <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Aucun autre capteur de la même grandeur électrique (active/apparente/réactive — {masterUnit ?? '—'}) n'est disponible.
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
                          ({isPowerUnit(d.unit) ? `${d.unit} intégré dans le temps en ${energyUnitFor(d.unit)}` : `converti en ${energyUnitFor(masterUnit)}`})
                        </span>
                      )}
                      {!crossesKind && d.unit && d.unit !== masterUnit && (
                        <span className="text-slate-500 ml-1.5 text-xs">(converti de {d.unit} vers {resultUnit})</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Résultats */}
      {result && (
        <>
          {isPowerUnit(masterUnit) && (
            <p className="text-xs text-slate-500">
              Le maître reporte une puissance instantanée ({masterUnit}) — les totaux ci-dessous sont son énergie intégrée dans le temps ({resultUnit}), pas une somme brute de puissances.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Crown className="h-4 w-4 text-amber-400" />} label="Total maître" value={fmt(result.masterTotal, resultUnit)} />
            <StatCard icon={<GitBranch className="h-4 w-4 text-blue-400" />} label="Total Σ esclaves" value={fmt(result.slavesTotal, resultUnit)} />
            <StatCard
              icon={result.deltaAbs >= 0 ? <TrendingDown className="h-4 w-4 text-red-400" /> : <TrendingUp className="h-4 w-4 text-emerald-400" />}
              label="Écart"
              value={`${fmt(result.deltaAbs, resultUnit)}${result.deltaPct != null ? ` (${result.deltaPct.toFixed(1)}%)` : ''}`}
            />
            <StatCard
              icon={<Activity className="h-4 w-4 text-purple-400" />}
              label="Corrélation (r)"
              value={result.correlation != null ? result.correlation.toFixed(3) : '—'}
            />
          </div>

          <Card className="p-4 bg-white/5 border-white/10">
            <p className="text-sm font-medium text-slate-200 mb-3">Maître vs Σ esclaves — {granularity === 'day' ? 'par jour' : 'par heure'}</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="key" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} unit={resultUnit ? ` ${resultUnit}` : ''} />
                <Tooltip contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="Maître" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Σ Esclaves" stroke="hsl(199 89% 48%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {worstBuckets.length > 0 && (
            <Card className="p-4 bg-white/5 border-white/10">
              <p className="text-sm font-medium text-slate-200 mb-3">Plus gros écarts</p>
              <div className="space-y-1.5">
                {worstBuckets.map((b) => (
                  <div key={b.key} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-slate-300">{formatBucketLabel(b.key)}</span>
                    <span className={b.residual >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {fmt(b.residual, resultUnit)}{b.residualPct != null ? ` (${b.residualPct.toFixed(1)}%)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}{label}</div>
      <p className="text-lg font-semibold mt-1 leading-tight text-white">{value}</p>
    </div>
  );
}

