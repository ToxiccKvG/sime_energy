import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Download, TrendingUp, Zap, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useIOT } from './IOTContext';
import { analyserDonneesShelly, calculerFacturationShelly, calculerStats } from '@/lib/iot-profil-engine';
import type { ShellyRow } from './shared';

type ViewMode = 'journalier' | 'mensuel' | 'phases';
type ChartType = 'aire' | 'barres';

const COLORS = {
  total: '#3b82f6',
  phaseA: '#22c55e',
  phaseB: '#f59e0b',
  phaseC: '#ec4899',
  retour: '#a78bfa',
  net: '#06b6d4',
};

function KPICard({ label, value, unit, sub, color = 'blue' }: {
  label: string; value: string; unit: string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] ?? colorMap.blue}`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function ProfilChargeTab() {
  const { state } = useIOT();
  const { shellyRows, paramsTarif } = state;
  const [viewMode, setViewMode] = useState<ViewMode>('journalier');
  const [chartType, setChartType] = useState<ChartType>('aire');
  const [showRetour, setShowRetour] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [filterType, setFilterType] = useState<'tous' | 'ouvrés' | 'weekends' | 'fériés'>('tous');

  // Filtrer les lignes
  const filteredRows = useMemo<ShellyRow[]>(() => {
    switch (filterType) {
      case 'ouvrés': return shellyRows.filter(r => !r.isWeekend && !r.isJourFerie);
      case 'weekends': return shellyRows.filter(r => r.isWeekend);
      case 'fériés': return shellyRows.filter(r => r.isJourFerie);
      default: return shellyRows;
    }
  }, [shellyRows, filterType]);

  const analyse = useMemo(() => analyserDonneesShelly(filteredRows), [filteredRows]);
  const facturation = useMemo(
    () => calculerFacturationShelly(filteredRows, paramsTarif),
    [filteredRows, paramsTarif]
  );
  const statsKwh = useMemo(
    () => calculerStats(filteredRows.map(r => r.kwhNet)),
    [filteredRows]
  );

  // Données graphique journalier
  const chartDataJournalier = useMemo(() =>
    filteredRows.map(r => ({
      date: r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      total: +r.kwhTotal.toFixed(2),
      net: +r.kwhNet.toFixed(2),
      retour: +r.kwhRetourTotal.toFixed(2),
      phaseA: +r.kwhA.toFixed(2),
      phaseB: +r.kwhB.toFixed(2),
      phaseC: +r.kwhC.toFixed(2),
      isWeekend: r.isWeekend,
      isFerie: r.isJourFerie,
    })),
    [filteredRows]
  );

  // Données graphique mensuel
  const chartDataMensuel = useMemo(() =>
    Object.entries(analyse.parMois).map(([mois, data]) => ({
      mois,
      kwhTotal: +data.kwhTotal.toFixed(2),
      kwhNet: +data.kwhNet.toFixed(2),
      kwhRetour: +data.kwhRetour.toFixed(2),
      nbJours: data.nbJours,
    })),
    [analyse]
  );

  // Export Excel
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Onglet données journalières
    const wsData = XLSX.utils.json_to_sheet(filteredRows.map(r => ({
      'Date': r.date.toLocaleDateString('fr-FR'),
      'Jour': r.jour,
      'Mois': r.mois,
      'Année': r.annee,
      'Wh Phase A': r.whPhaseA, 'Wh Phase B': r.whPhaseB, 'Wh Phase C': r.whPhaseC, 'Wh Total': r.whTotal,
      'Wh Retour A': r.whRetourA, 'Wh Retour B': r.whRetourB, 'Wh Retour C': r.whRetourC, 'Wh Retour Total': r.whRetourTotal,
      'kWh A': +r.kwhA.toFixed(3), 'kWh B': +r.kwhB.toFixed(3), 'kWh C': +r.kwhC.toFixed(3), 'kWh Total': +r.kwhTotal.toFixed(3),
      'kWh Retour A': +r.kwhRetourA.toFixed(3), 'kWh Retour B': +r.kwhRetourB.toFixed(3), 'kWh Retour C': +r.kwhRetourC.toFixed(3), 'kWh Retour Total': +r.kwhRetourTotal.toFixed(3),
      'kWh Cum Total': +r.kwhCumTotal.toFixed(3),
      'Puiss. kW A': +r.puissKwA.toFixed(3), 'Puiss. kW B': +r.puissKwB.toFixed(3), 'Puiss. kW C': +r.puissKwC.toFixed(3), 'Puiss. kW Total': +r.puissKwTotal.toFixed(3),
      'kWh Net': +r.kwhNet.toFixed(3),
      'Activités': r.jourActivites,
      'Tranche tarification': r.trancheTarification,
      'Saison': r.saison,
      'Période climatique': r.periodeclimatique,
      'Période journée': r.periode,
      'Ensoleillement': r.heuresEnsoleillement,
      'Heures travail': r.heuresTravail,
      'Montant énergie (FCFA)': +r.montantEnergie.toFixed(0),
      'Profil': r.profil,
    })));
    XLSX.utils.book_append_sheet(wb, wsData, 'PROFIL CHARGE');

    // Onglet mensuel
    const wsMonthly = XLSX.utils.json_to_sheet(chartDataMensuel.map(m => ({
      'Mois': m.mois,
      'kWh Total': m.kwhTotal,
      'kWh Net': m.kwhNet,
      'kWh Retour': m.kwhRetour,
      'Nb jours': m.nbJours,
    })));
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Mensuel');

    XLSX.writeFile(wb, 'profil_charge_shelly.xlsx');
  };

  if (shellyRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Zap className="h-16 w-16 opacity-20 mb-4" />
        <p className="text-lg font-medium">Aucune donnée Shelly 3EM</p>
        <p className="text-sm mt-1">Importez un fichier dans l'onglet <strong className="text-slate-400">Import</strong></p>
      </div>
    );
  }

  const totalCout = facturation.reduce((s, f) => s + (f.montantEnergie), 0);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Consommation totale"
          value={analyse.totalKwhNet.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
          unit="kWh net"
          sub={`${analyse.nbJours} jours`}
          color="blue"
        />
        <KPICard
          label="Moyenne journalière"
          value={analyse.moyenneJournaliere.toFixed(1)}
          unit="kWh/j"
          sub={`Max: ${analyse.maxJournalier.toFixed(0)} · Min: ${analyse.minJournalier.toFixed(0)}`}
          color="green"
        />
        <KPICard
          label="Énergie retournée"
          value={analyse.totalKwhRetour.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
          unit="kWh"
          sub={`${((analyse.totalKwhRetour / analyse.totalKwhConsomme) * 100).toFixed(1)}% du brut`}
          color="purple"
        />
        <KPICard
          label="Coût estimé"
          value={Math.round(totalCout).toLocaleString('fr-FR')}
          unit="FCFA"
          sub={`Tarif: ${paramsTarif.tarifK1} FCFA/kWh`}
          color="yellow"
        />
      </div>

      {/* Profil par type de jour */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Jours ouvrés', data: analyse.jourOuvre, color: 'text-blue-400' },
          { label: 'Week-ends', data: analyse.weekend, color: 'text-yellow-400' },
          { label: 'Jours fériés', data: analyse.ferieOuDimanche, color: 'text-purple-400' },
        ].map(({ label, data, color }) => (
          <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`${color} text-xl font-bold mt-1`}>{data.kwhMoyen.toFixed(1)}</p>
            <p className="text-slate-500 text-xs">kWh moyen/j · {data.nbJours}j</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-white/5 rounded-xl border border-white/10 p-4">
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            <SelectItem value="journalier">Journalier</SelectItem>
            <SelectItem value="mensuel">Mensuel</SelectItem>
            <SelectItem value="phases">Par phase</SelectItem>
          </SelectContent>
        </Select>

        <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
          <SelectTrigger className="w-36 bg-white/5 border-white/20 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            <SelectItem value="aire">Courbe / Aire</SelectItem>
            <SelectItem value="barres">Histogramme</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
          <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            <SelectItem value="tous">Tous les jours</SelectItem>
            <SelectItem value="ouvrés">Jours ouvrés</SelectItem>
            <SelectItem value="weekends">Week-ends</SelectItem>
            <SelectItem value="fériés">Jours fériés</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="showRetour"
            checked={showRetour}
            onCheckedChange={setShowRetour}
            className="data-[state=checked]:bg-purple-500"
          />
          <Label htmlFor="showRetour" className="text-slate-300 text-sm cursor-pointer">
            Retour réseau
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="showPhases"
            checked={showPhases}
            onCheckedChange={setShowPhases}
            className="data-[state=checked]:bg-green-500"
          />
          <Label htmlFor="showPhases" className="text-slate-300 text-sm cursor-pointer">
            Détail phases
          </Label>
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={exportExcel}
          >
            <Download className="h-4 w-4 mr-1" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Graphique principal */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <h3 className="text-white font-semibold mb-4">
          {viewMode === 'journalier' && 'Profil de charge journalier'}
          {viewMode === 'mensuel' && 'Consommation mensuelle'}
          {viewMode === 'phases' && 'Répartition par phase'}
        </h3>

        <ResponsiveContainer width="100%" height={340}>
          {viewMode === 'mensuel' ? (
            <BarChart data={chartDataMensuel} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="kwhNet" name="kWh Net" fill={COLORS.net} radius={[4, 4, 0, 0]} />
              {showRetour && <Bar dataKey="kwhRetour" name="kWh Retour" fill={COLORS.retour} radius={[4, 4, 0, 0]} />}
            </BarChart>
          ) : viewMode === 'phases' ? (
            <AreaChart data={chartDataJournalier} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Area type="monotone" dataKey="phaseA" name="Phase A" stroke={COLORS.phaseA} fill={`${COLORS.phaseA}20`} strokeWidth={1.5} />
              <Area type="monotone" dataKey="phaseB" name="Phase B" stroke={COLORS.phaseB} fill={`${COLORS.phaseB}20`} strokeWidth={1.5} />
              <Area type="monotone" dataKey="phaseC" name="Phase C" stroke={COLORS.phaseC} fill={`${COLORS.phaseC}20`} strokeWidth={1.5} />
            </AreaChart>
          ) : chartType === 'aire' ? (
            <AreaChart data={chartDataJournalier} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <ReferenceLine y={statsKwh.moyenne} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Moy.', fill: '#f59e0b', fontSize: 10 }} />
              <Area type="monotone" dataKey="net" name="kWh Net" stroke={COLORS.net} fill={`${COLORS.net}20`} strokeWidth={2} />
              {showRetour && <Area type="monotone" dataKey="retour" name="kWh Retour" stroke={COLORS.retour} fill={`${COLORS.retour}20`} strokeWidth={1.5} />}
            </AreaChart>
          ) : (
            <BarChart data={chartDataJournalier} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="net" name="kWh Net" fill={COLORS.net} radius={[2, 2, 0, 0]} />
              {showRetour && <Bar dataKey="retour" name="kWh Retour" fill={COLORS.retour} radius={[2, 2, 0, 0]} />}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Tableau de données journalières */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Données journalières
          </h3>
          <Badge variant="outline" className="border-white/20 text-slate-300">
            {filteredRows.length} jours
          </Badge>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-[#1a1d2e] z-10">
              <tr>
                {[
                  'Date','Jour','kWh Tot','kWh Net','kWh Ret','kWh Cum',
                  'Puiss. kW','Ph A','Ph B','Ph C',
                  'Activités','Tranche','Saison','Période clim.','Période J',
                  'Ensoleil.','Montant FCFA','Profil',
                ].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const actColor =
                  r.jourActivites === 'Jour férié' ? 'text-purple-400' :
                  r.jourActivites === 'Weekend'    ? 'text-yellow-400' : 'text-slate-300';
                const trancheColor = r.trancheTarification === 'Heure de pointe' ? 'text-orange-400' : 'text-slate-400';
                return (
                  <tr key={i} className={`border-t border-white/5 hover:bg-white/5 ${
                    r.jourActivites === 'Jour férié' ? 'bg-purple-500/5' :
                    r.jourActivites === 'Weekend'    ? 'bg-yellow-500/5' : ''
                  }`}>
                    <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{r.date.toLocaleDateString('fr-FR')}</td>
                    <td className="px-2 py-1.5 text-slate-400">{r.jourSemaine}</td>
                    <td className="px-2 py-1.5 text-blue-400 text-right">{r.kwhTotal.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-cyan-400 text-right font-medium">{r.kwhNet.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-purple-400 text-right">{r.kwhRetourTotal.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-slate-400 text-right">{r.kwhCumTotal.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-green-400 text-right">{r.puissKwTotal.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-green-300 text-right">{r.kwhA.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-yellow-300 text-right">{r.kwhB.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-pink-300 text-right">{r.kwhC.toFixed(2)}</td>
                    <td className={`px-2 py-1.5 whitespace-nowrap ${actColor}`}>{r.jourActivites}</td>
                    <td className={`px-2 py-1.5 whitespace-nowrap ${trancheColor}`}>{r.trancheTarification}</td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{r.saison}</td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{r.periodeclimatique}</td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{r.periode}</td>
                    <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.heuresEnsoleillement}</td>
                    <td className="px-2 py-1.5 text-yellow-400 text-right font-medium">{Math.round(r.montantEnergie).toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-1.5">
                      <Badge className={`border-0 text-[10px] ${r.profil === 'CHARGE' ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}>
                        {r.profil}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tableau facturation mensuelle */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Facturation mensuelle estimée
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                {['Mois', 'Jours', 'kWh HHP', 'kWh HP', 'kWh Net', 'kWh Retour', 'Tarif moy.', 'Montant FCFA'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturation.map((f, i) => (
                <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-medium">{f.mois}</td>
                  <td className="px-4 py-3 text-slate-400 text-right">{f.nbJours}</td>
                  <td className="px-4 py-3 text-slate-300 text-right">{f.kwhHHP.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-orange-400 text-right">{f.kwhHP.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-cyan-400 font-medium text-right">{f.kwhNet.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-purple-400 text-right">{f.kwhRetour.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-slate-400 text-right">{f.coutMoyen.toFixed(2)}</td>
                  <td className="px-4 py-3 text-yellow-400 font-medium text-right">
                    {Math.round(f.montantEnergie).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-white/20 bg-white/5">
                <td className="px-4 py-3 text-white font-bold">Total</td>
                <td className="px-4 py-3 text-slate-400 text-right">{analyse.nbJours}</td>
                <td className="px-4 py-3 text-slate-300 font-bold text-right">—</td>
                <td className="px-4 py-3 text-orange-400 font-bold text-right">—</td>
                <td className="px-4 py-3 text-cyan-400 font-bold text-right">
                  {analyse.totalKwhNet.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-purple-400 font-bold text-right">
                  {analyse.totalKwhRetour.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-yellow-400 font-bold text-right">
                  {Math.round(totalCout).toLocaleString('fr-FR')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
