// ============================================================
// IOT MODULE — Onglet 6 : Bilan énergétique M1 / M2 / M3
// M3 = total consommé · M2 = SENELEC · M1 = PV autoconsommé
// ============================================================

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Plus, Trash2, TrendingDown, Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIOT } from './IOTContext';
import type { BilanPeriode, ReleveCompteur } from './shared';
import { MOIS_FR } from './shared';

// ---- Calcul bilan ----
function calculerBilan(
  relevesM2: ReleveCompteur[],
  totalKwhM3: number,
  pvKwh: number,
  tarifSenelec: number,
): BilanPeriode | null {
  if (relevesM2.length < 2) return null;
  const sorted = [...relevesM2].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const m2Kwh = last.indexKwh - first.indexKwh;
  const m3Kwh = totalKwhM3 > 0 ? totalKwhM3 : m2Kwh;
  const m1Kwh = Math.max(0, m3Kwh - m2Kwh);
  const injecteKwh = Math.max(0, pvKwh - m1Kwh);
  const tauxAutoconso = m3Kwh > 0 ? (m1Kwh / m3Kwh) * 100 : 0;
  const tauxCouverturePV = pvKwh > 0 ? (m1Kwh / pvKwh) * 100 : 0;
  const coutEvite = m1Kwh * tarifSenelec;

  return {
    dateDebut: first.date,
    dateFin: last.date,
    m2Kwh, m1Kwh, m3Kwh, pvTotalKwh: pvKwh,
    injecteKwh, tauxAutoconso, tauxCouverturePV,
    coutEvite, tarifSenelec,
  };
}

// ---- Jauge demi-cercle ----
function JaugePct({ pct, label, color }: { pct: number; label: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const strokePct = (clamped / 100) * 50; // demi-cercle = 50% du périmètre total
  const r = 40;
  const cx = 60;
  const cy = 60;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-36 h-20">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" strokeLinecap="round"
        />
        {/* Arc coloré */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(strokePct / 50) * Math.PI * r} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.5s' }}
        />
        {/* Valeur */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">
          {clamped.toFixed(0)}%
        </text>
      </svg>
      <p className="text-slate-400 text-xs -mt-2">{label}</p>
    </div>
  );
}

// ---- KPI card ----
function KPI({ label, value, unit, color = 'blue', sub }: { label: string; value: string; unit: string; color?: string; sub?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  };
  const textMap: Record<string, string> = { blue: 'text-blue-400', green: 'text-green-400', yellow: 'text-yellow-400', purple: 'text-purple-400' };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textMap[color]}`}>{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function BilanTab() {
  const { state, addReleve, removeReleve, setBilanConfig } = useIOT();
  const { relevesCompteur, sourceM2Id, sourceM1Id, sourceM3Ids, tarifSenelec, sources, shellyRows } = state;

  const [newDate, setNewDate] = useState('');
  const [newIndex, setNewIndex] = useState('');
  const [pvKwh, setPvKwh] = useState('0');

  const sourcesActives = sources.filter(s => s.actif);

  // M3 depuis données Shelly si disponible
  const m3Total = useMemo(() => {
    if (shellyRows.length === 0) return 0;
    return shellyRows.reduce((s, r) => s + r.kwhNet, 0);
  }, [shellyRows]);

  // Relevés de la source M2
  const relevesM2 = useMemo(
    () => relevesCompteur.filter(r => r.sourceId === sourceM2Id).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [relevesCompteur, sourceM2Id]
  );

  const bilan = useMemo(
    () => calculerBilan(relevesM2, m3Total, parseFloat(pvKwh) || 0, tarifSenelec),
    [relevesM2, m3Total, pvKwh, tarifSenelec]
  );

  const handleAddReleve = () => {
    if (!newDate || !newIndex || !sourceM2Id) return;
    addReleve({
      id: `rel-${Date.now()}`,
      date: new Date(newDate),
      indexKwh: parseFloat(newIndex) || 0,
      sourceId: sourceM2Id,
    });
    setNewDate(''); setNewIndex('');
  };

  // Données graphique mensuel simulé (à partir de shellyRows si dispo)
  const chartMensuel = useMemo(() => {
    if (shellyRows.length === 0) return [];
    const parMois: Record<string, { m3: number }> = {};
    for (const r of shellyRows) {
      const k = `${MOIS_FR[r.date.getMonth()]} ${r.annee}`;
      if (!parMois[k]) parMois[k] = { m3: 0 };
      parMois[k].m3 += r.kwhNet;
    }
    return Object.entries(parMois).map(([mois, d]) => ({
      mois,
      m3: +d.m3.toFixed(0),
      m2: +(d.m3 * 0.8).toFixed(0), // simplifié: M2 ≈ 80% si PV
      m1: +(d.m3 * 0.2).toFixed(0),
    }));
  }, [shellyRows]);

  return (
    <div className="space-y-6">
      {/* Configuration sources bilan */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Source M2 — SENELEC (achat)</Label>
          <Select value={sourceM2Id ?? ''} onValueChange={(v) => setBilanConfig(v || null, sourceM1Id, sourceM3Ids, tarifSenelec)}>
            <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
              <SelectValue placeholder="Choisir..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {sourcesActives.filter(s => s.type === 'SENELEC').map(s => (
                <SelectItem key={s.id} value={s.id} className="text-white">{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Source M1 — PV (autoproduit)</Label>
          <Select
            value={sourceM1Id ?? '__none__'}
            onValueChange={(v) => setBilanConfig(sourceM2Id, v === '__none__' ? null : v, sourceM3Ids, tarifSenelec)}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
              <SelectValue placeholder="Choisir..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="__none__" className="text-slate-400">Aucune (pas de PV)</SelectItem>
              {sourcesActives.filter(s => s.type === 'PV').map(s => (
                <SelectItem key={s.id} value={s.id} className="text-white">{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Tarif SENELEC (FCFA/kWh)</Label>
          <Input
            type="number"
            value={tarifSenelec}
            onChange={(e) => setBilanConfig(sourceM2Id, sourceM1Id, sourceM3Ids, parseFloat(e.target.value) || 0)}
            className="bg-white/5 border-white/20 text-white text-sm h-8"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Production PV totale (kWh)</Label>
          <Input
            type="number"
            value={pvKwh}
            onChange={(e) => setPvKwh(e.target.value)}
            className="bg-white/5 border-white/20 text-white text-sm h-8"
          />
        </div>
      </div>

      {/* Saisie relevés compteur */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-400" /> Relevés compteur SENELEC (M2)
        </h3>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date</Label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="bg-white/5 border-white/20 text-white h-8 text-sm w-36" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Index (kWh)</Label>
            <Input type="number" value={newIndex} onChange={(e) => setNewIndex(e.target.value)}
              placeholder="ex : 12500"
              className="bg-white/5 border-white/20 text-white h-8 text-sm w-36" />
          </div>
          <Button size="sm" className="bg-blue-600 text-white h-8" onClick={handleAddReleve}
            disabled={!newDate || !newIndex || !sourceM2Id}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
          </Button>
        </div>

        {relevesM2.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>
                {['Date', 'Index (kWh)', 'Δ kWh', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium text-xs">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {relevesM2.map((r, i) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="px-3 py-2 text-slate-300">{r.date.toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-2 text-blue-400 font-medium">{r.indexKwh.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {i > 0 ? `+${(r.indexKwh - relevesM2[i - 1].indexKwh).toLocaleString('fr-FR')}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeReleve(r.id)} className="text-slate-500 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPIs bilan */}
      {bilan ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI label="M3 — Total consommé" value={(bilan.m3Kwh).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unit="kWh" color="blue"
              sub={`Du ${bilan.dateDebut.toLocaleDateString('fr-FR')} au ${bilan.dateFin.toLocaleDateString('fr-FR')}`} />
            <KPI label="M2 — Acheté SENELEC" value={(bilan.m2Kwh).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unit="kWh" color="purple" />
            <KPI label="M1 — PV autoconsommé" value={(bilan.m1Kwh).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unit="kWh" color="yellow"
              sub={`Injection: ${bilan.injecteKwh.toFixed(0)} kWh`} />
            <KPI label="Coût évité" value={Math.round(bilan.coutEvite).toLocaleString('fr-FR')} unit="FCFA" color="green"
              sub={`@ ${tarifSenelec} FCFA/kWh`} />
          </div>

          {/* Jauges */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <h4 className="text-white font-semibold text-sm mb-4">Indicateurs de performance PV</h4>
            <div className="flex justify-around flex-wrap gap-4">
              <JaugePct pct={bilan.tauxAutoconso} label="Taux d'autoconsommation (M1/M3)" color="#eab308" />
              <JaugePct pct={bilan.tauxCouverturePV} label="Taux de couverture PV (M1/PVtotal)" color="#22c55e" />
              <JaugePct pct={bilan.m2Kwh > 0 ? (bilan.m2Kwh / bilan.m3Kwh) * 100 : 0} label="Part SENELEC (M2/M3)" color="#3b82f6" />
            </div>
          </div>

          {/* Camembert SENELEC vs PV */}
          {bilan.m1Kwh > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Répartition M1 / M2 / M3
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'M2 — SENELEC', value: Math.round(bilan.m2Kwh) },
                        { name: 'M1 — PV autoconso', value: Math.round(bilan.m1Kwh) },
                      ]}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#94a3b8' }}
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#eab308" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      formatter={(v: number) => `${v.toLocaleString('fr-FR')} kWh`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Histogramme mensuel */}
              {chartMensuel.length > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h4 className="text-white font-semibold text-sm mb-3">Histogramme mensuel M1 + M2 = M3</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartMensuel} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit=" kWh" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        formatter={(v: number) => `${v.toLocaleString('fr-FR')} kWh`}
                      />
                      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
                      <Bar dataKey="m2" name="M2 SENELEC" fill="#3b82f6" stackId="a" />
                      <Bar dataKey="m1" name="M1 PV" fill="#eab308" stackId="a" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Courbe des index */}
          {relevesM2.length > 1 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Évolution de l'index M2 (compteur SENELEC)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={relevesM2.map(r => ({
                    date: r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                    index: r.indexKwh,
                  }))}
                  margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit=" kWh" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    formatter={(v: number) => `${v.toLocaleString('fr-FR')} kWh`}
                  />
                  <Area type="monotone" dataKey="index" name="Index M2" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Formule recap */}
          <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 text-sm">
            <p className="text-slate-300 font-medium mb-2">Formule bilan :</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'M3 (total consommé)', val: bilan.m3Kwh, color: 'text-blue-400' },
                { label: 'M2 (SENELEC acheté)', val: bilan.m2Kwh, color: 'text-purple-400' },
                { label: 'M1 (PV autoconsommé)', val: bilan.m1Kwh, color: 'text-yellow-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white/5 rounded-lg p-3">
                  <p className={`${color} font-bold text-xl`}>{val.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</p>
                  <p className="text-slate-400 text-xs mt-1">kWh</p>
                  <p className="text-slate-500 text-xs">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs text-center mt-3">M3 = M2 + M1 · M1 = M3 − M2</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <TrendingDown className="h-16 w-16 opacity-20 mb-4" />
          <p className="text-lg font-medium">Saisir au moins 2 relevés pour calculer le bilan</p>
          <p className="text-sm mt-1 text-slate-600">
            Configurez la source M2 (SENELEC) puis ajoutez des relevés de compteur
          </p>
        </div>
      )}
    </div>
  );
}
