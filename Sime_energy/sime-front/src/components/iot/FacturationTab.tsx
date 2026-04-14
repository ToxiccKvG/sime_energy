import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Calculator, Download, Plus, Trash2, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIOT } from './IOTContext';
import {
  calculerFacture, GRILLE_TARIFAIRE, formatFCFA, formatKWh,
  calculerCosPhi, calculerTauxChargeTransfo, genererScenarios,
} from '@/lib/iot-facturation-engine';
import type { ScenarioOptimisation } from './shared';
import type { CategorieTarifaire, ResultatFacturation, LigneFacturation } from './shared';
import { MOIS_FR } from './shared';

const CATEGORIES: { value: CategorieTarifaire; label: string; tension: string }[] = [
  { value: 'DPP', label: 'Dom. Petite Puiss. (DPP)', tension: 'BT' },
  { value: 'DMP', label: 'Dom. Moy. Puiss. (DMP)', tension: 'BT' },
  { value: 'PPP', label: 'Prof. Petite Puiss. (PPP)', tension: 'BT' },
  { value: 'PMP', label: 'Prof. Moy. Puiss. (PMP)', tension: 'BT' },
  { value: 'DGP', label: 'Dom. Grande Puiss. (DGP)', tension: 'BT-GP' },
  { value: 'PGP', label: 'Prof. Grande Puiss. (PGP)', tension: 'BT-GP' },
  { value: 'TCU', label: 'Tarif Courte Utilisation (TCU)', tension: 'MT' },
  { value: 'TG', label: 'Tarif Général MT (TG)', tension: 'MT' },
  { value: 'TLU', label: 'Tarif Longue Utilisation (TLU)', tension: 'MT' },
  { value: 'TG_HT', label: 'Tarif Général HT (TG-HT)', tension: 'HT' },
  { value: 'TS', label: 'Tarif Secours HT (TS)', tension: 'HT' },
];

function isBT(cat: CategorieTarifaire) {
  return ['DPP', 'DMP', 'PPP', 'PMP'].includes(cat);
}

interface FormulaireState {
  nJours: string;
  nJoursDepassement: string;
  puissanceSouscrite: string;
  puissanceMaxRelevee: string;
  puissanceTransfo: string;
  taxeCommunale: string;
  categorie: CategorieTarifaire;
  // Coefficients majoration (rapport TC/TP)
  alphaA: string;  // αa
  betaA: string;   // βa
  alphaR: string;  // αr
  betaR: string;   // βr
  h1: string;      // Heures transfo H1
  h2: string;      // Heures condensateurs H2
  redevance: string;
  // BT
  consommationTotale: string;
  // GP/MT/HT
  consomActiveK1: string;
  consomActiveK2: string;
  consomReactiveWr: string;
  // Modèle facture
  ancienIndexK1: string;
  nouvelIndexK1: string;
  ancienIndexK2: string;
  nouvelIndexK2: string;
  ancienIndexWr: string;
  nouvelIndexWr: string;
}

const DEFAULT_FORM: FormulaireState = {
  nJours: '31',
  nJoursDepassement: '0',
  puissanceSouscrite: '150',
  puissanceMaxRelevee: '150',
  puissanceTransfo: '400',
  taxeCommunale: '0',
  categorie: 'TG',
  // Valeurs type contrat MT SENELEC (modèle Excel)
  alphaA: '0.013',
  betaA: '0.65',
  alphaR: '0.04',
  betaR: '5.25',
  h1: '720',
  h2: '0',
  redevance: '0',
  consommationTotale: '0',
  consomActiveK1: '77752',
  consomActiveK2: '5459',
  consomReactiveWr: '27430',
  ancienIndexK1: '0',
  nouvelIndexK1: '77752',
  ancienIndexK2: '0',
  nouvelIndexK2: '5459',
  ancienIndexWr: '0',
  nouvelIndexWr: '27430',
};

function RowKV({ label, value, highlight = false, className = '' }: {
  label: string; value: string; highlight?: boolean; className?: string;
}) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-white/5 ${className}`}>
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-medium text-sm ${highlight ? 'text-yellow-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}

export function FacturationTab() {
  const { state, setFacturationRows } = useIOT();
  const [form, setForm] = useState<FormulaireState>(DEFAULT_FORM);
  const [resultat, setResultat] = useState<ResultatFacturation | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioOptimisation[]>([]);
  const [historiqueLocal, setHistoriqueLocal] = useState<(LigneFacturation & { resultat: ResultatFacturation })[]>([]);
  const [activeView, setActiveView] = useState<'calculateur' | 'scenarios' | 'historique' | 'tarifs'>('calculateur');

  const f = (key: keyof FormulaireState, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const num = (s: string) => parseFloat(s) || 0;

  // Calcul automatique des consommations depuis indices
  const consomK1 = Math.max(0, num(form.nouvelIndexK1) - num(form.ancienIndexK1));
  const consomK2 = Math.max(0, num(form.nouvelIndexK2) - num(form.ancienIndexK2));
  const consomWr = Math.max(0, num(form.nouvelIndexWr) - num(form.ancienIndexWr));

  const cosPhi = useMemo(
    () => calculerCosPhi(consomK1 + consomK2, consomWr),
    [consomK1, consomK2, consomWr]
  );

  const tauxTransfo = useMemo(
    () => calculerTauxChargeTransfo(num(form.puissanceMaxRelevee), num(form.puissanceTransfo)),
    [form.puissanceMaxRelevee, form.puissanceTransfo]
  );

  const handleCalculer = () => {
    const tech = {
      nJours: num(form.nJours),
      nJoursDepassement: num(form.nJoursDepassement),
      puissanceSouscrite: num(form.puissanceSouscrite),
      puissanceMaxRelevee: num(form.puissanceMaxRelevee),
      puissanceTransfo: num(form.puissanceTransfo),
      taxeCommunale: num(form.taxeCommunale),
      categorie: form.categorie,
      alphaA: num(form.alphaA),
      betaA: num(form.betaA),
      alphaR: num(form.alphaR),
      betaR: num(form.betaR),
      h1: num(form.h1),
      h2: num(form.h2),
      redevance: num(form.redevance),
    };

    const k1 = consomK1 > 0 ? consomK1 : num(form.consomActiveK1);
    const k2 = consomK2 > 0 ? consomK2 : num(form.consomActiveK2);
    const wr = consomWr > 0 ? consomWr : num(form.consomReactiveWr);

    const donnees = isBT(form.categorie)
      ? { consommationTotale: num(form.consommationTotale) }
      : { consomActiveK1: k1, consomActiveK2: k2, consomReactiveWr: wr };

    const res = calculerFacture(form.categorie, tech, donnees);
    setResultat(res);

    // Générer les 5 scénarios d'optimisation (uniquement MT/HT)
    if (!isBT(form.categorie)) {
      const sc = genererScenarios(form.categorie, tech, { consomActiveK1: k1, consomActiveK2: k2, consomReactiveWr: wr });
      setScenarios(sc);
    } else {
      setScenarios([]);
    }
  };

  const handleAjouterHistorique = () => {
    if (!resultat) return;
    const now = new Date();
    const ligne: LigneFacturation & { resultat: ResultatFacturation } = {
      id: String(Date.now()),
      date: now,
      periode: `${MOIS_FR[now.getMonth()]} ${now.getFullYear()}`,
      consomActiveK1: consomK1 > 0 ? consomK1 : num(form.consomActiveK1),
      consomActiveK2: consomK2 > 0 ? consomK2 : num(form.consomActiveK2),
      consomReactiveWr: consomWr > 0 ? consomWr : num(form.consomReactiveWr),
      puissanceSouscrite: num(form.puissanceSouscrite),
      puissanceMaxRelevee: num(form.puissanceMaxRelevee),
      resultat,
    };
    setHistoriqueLocal(prev => [ligne, ...prev]);
    setFacturationRows([ligne, ...state.facturationRows]);
  };

  const exportHistorique = () => {
    if (historiqueLocal.length === 0) return;
    const rows = historiqueLocal.map(l => ({
      'Période': l.periode,
      'Catégorie': l.resultat ? form.categorie : '',
      'K1 (kWh)': l.consomActiveK1,
      'K2 (kWh)': l.consomActiveK2,
      'Wr (kVARh)': l.consomReactiveWr,
      'CosPhi': l.resultat?.cosPhi?.toFixed(3) ?? '',
      'Ps (kW)': l.puissanceSouscrite,
      'Pmaxr (kW)': l.puissanceMaxRelevee,
      'Énergie (FCFA)': l.resultat?.coutEnergie?.toFixed(0) ?? '',
      'Prime fixe (FCFA)': l.resultat?.primeFixe?.toFixed(0) ?? '',
      'Redevance (FCFA)': l.resultat?.redevance?.toFixed(0) ?? '',
      'TVA (FCFA)': l.resultat?.tva?.toFixed(0) ?? '',
      'Total TTC (FCFA)': l.resultat?.montantTTC?.toFixed(0) ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Historique');
    XLSX.writeFile(wb, 'historique_facturation.xlsx');
  };

  // Chart historique
  const chartData = historiqueLocal.map(l => ({
    periode: l.periode,
    energie: Math.round(l.resultat?.coutEnergie ?? 0),
    primeFixe: Math.round(l.resultat?.primeFixe ?? 0),
    total: Math.round(l.resultat?.montantTTC ?? 0),
    k1: l.consomActiveK1,
    k2: l.consomActiveK2,
  })).reverse();

  return (
    <div className="space-y-4">
      {/* Onglets internes */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(['calculateur', 'scenarios', 'historique', 'tarifs'] as const).map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize
              ${activeView === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveView(tab)}
          >
            {tab === 'calculateur' ? 'Calculateur'
              : tab === 'scenarios' ? 'Scénarios'
              : tab === 'historique' ? 'Historique'
              : 'Grille tarifaire'}
          </button>
        ))}
      </div>

      {/* ---- CALCULATEUR ---- */}
      {activeView === 'calculateur' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulaire gauche */}
          <div className="space-y-4">
            {/* Catégorie tarifaire */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
              <h3 className="text-white font-semibold text-sm">Catégorie tarifaire</h3>
              <Select value={form.categorie} onValueChange={(v) => f('categorie', v)}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-white/20">
                  {['BT', 'BT-GP', 'MT', 'HT'].map(tension => (
                    <div key={tension}>
                      <div className="px-2 py-1 text-xs text-slate-500 font-medium">{tension}</div>
                      {CATEGORIES.filter(c => c.tension === tension).map(c => (
                        <SelectItem key={c.value} value={c.value} className="text-white">{c.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Données techniques */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
              <h3 className="text-white font-semibold text-sm">Données techniques</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Nb jours (N)</Label>
                  <Input
                    type="number"
                    value={form.nJours}
                    onChange={(e) => f('nJours', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Nb jours dépassement</Label>
                  <Input
                    type="number"
                    value={form.nJoursDepassement}
                    onChange={(e) => f('nJoursDepassement', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Puissance souscrite Ps (kW)</Label>
                  <Input
                    type="number"
                    value={form.puissanceSouscrite}
                    onChange={(e) => f('puissanceSouscrite', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Puissance max relevée Pmaxr (kW)</Label>
                  <Input
                    type="number"
                    value={form.puissanceMaxRelevee}
                    onChange={(e) => f('puissanceMaxRelevee', e.target.value)}
                    className={`bg-white/5 border-white/20 text-white ${num(form.puissanceMaxRelevee) > num(form.puissanceSouscrite) ? 'border-orange-500' : ''}`}
                  />
                  {num(form.puissanceMaxRelevee) > num(form.puissanceSouscrite) && (
                    <p className="text-orange-400 text-xs mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Dépassement de {(num(form.puissanceMaxRelevee) - num(form.puissanceSouscrite)).toFixed(0)} kW
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Puissance transfo (kVA)</Label>
                  <Input
                    type="number"
                    value={form.puissanceTransfo}
                    onChange={(e) => f('puissanceTransfo', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Taxe communale (%)</Label>
                  <Input
                    type="number"
                    value={form.taxeCommunale}
                    onChange={(e) => f('taxeCommunale', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Coefficients majoration — GP/MT/HT uniquement */}
            {!isBT(form.categorie) && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-white font-semibold text-sm">Coefficients majoration (rapport TC/TP)</h3>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'alphaA' as const, label: 'αa', hint: 'Majo active' },
                    { key: 'betaA'  as const, label: 'βa', hint: 'Majo active H1' },
                    { key: 'alphaR' as const, label: 'αr', hint: 'Majo réactive' },
                    { key: 'betaR'  as const, label: 'βr', hint: 'Majo réactive H1' },
                    { key: 'h1'     as const, label: 'H1 (h)', hint: 'Heures transfo' },
                    { key: 'h2'     as const, label: 'H2 (h)', hint: 'Heures cond.' },
                  ]).map(({ key, label, hint }) => (
                    <div key={key}>
                      <Label className="text-slate-400 text-xs mb-1 block">{label} <span className="text-slate-600">— {hint}</span></Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={form[key]}
                        onChange={(e) => f(key, e.target.value)}
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-slate-600 text-xs">
                  MajoK1 = αa×K1 + βa×H1×K1/(K1+K2) · MajoWr = αr×Wr + βr×H1
                </p>
              </div>
            )}

            {/* Énergie — BT */}
            {isBT(form.categorie) && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-white font-semibold text-sm">Énergie (BT)</h3>
                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Consommation totale (kWh)</Label>
                  <Input
                    type="number"
                    value={form.consommationTotale}
                    onChange={(e) => f('consommationTotale', e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                  />
                </div>
              </div>
            )}

            {/* Énergie — GP/MT/HT — Avec indices */}
            {!isBT(form.categorie) && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-white font-semibold text-sm">Relevé indices compteur</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="col-span-2 grid grid-cols-3 gap-2 font-medium text-slate-400 pb-1 border-b border-white/10">
                    <span>Index</span><span>Ancien</span><span>Nouvel</span>
                  </div>
                  {[
                    { label: 'Énergie Active K1 (HHP)', aKey: 'ancienIndexK1' as const, nKey: 'nouvelIndexK1' as const, calc: consomK1, unit: 'kWh' },
                    { label: 'Énergie Active K2 (HP)', aKey: 'ancienIndexK2' as const, nKey: 'nouvelIndexK2' as const, calc: consomK2, unit: 'kWh' },
                    { label: 'Énergie Réactive Wr', aKey: 'ancienIndexWr' as const, nKey: 'nouvelIndexWr' as const, calc: consomWr, unit: 'kVARh' },
                  ].map(row => (
                    <div key={row.label} className="col-span-2 grid grid-cols-3 gap-2 items-center">
                      <span className="text-slate-400 text-xs">{row.label}</span>
                      <Input
                        type="number"
                        value={form[row.aKey]}
                        onChange={(e) => f(row.aKey, e.target.value)}
                        className="bg-white/5 border-white/20 text-white text-xs h-8"
                      />
                      <Input
                        type="number"
                        value={form[row.nKey]}
                        onChange={(e) => f(row.nKey, e.target.value)}
                        className="bg-white/5 border-white/20 text-white text-xs h-8"
                      />
                    </div>
                  ))}
                </div>

                {/* Consommations calculées */}
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-500/10 rounded-lg p-2">
                    <p className="text-xs text-slate-400">K1 consommé</p>
                    <p className="text-blue-400 font-bold">{consomK1.toLocaleString('fr-FR')} kWh</p>
                  </div>
                  <div className="bg-orange-500/10 rounded-lg p-2">
                    <p className="text-xs text-slate-400">K2 consommé</p>
                    <p className="text-orange-400 font-bold">{consomK2.toLocaleString('fr-FR')} kWh</p>
                  </div>
                  <div className="bg-purple-500/10 rounded-lg p-2">
                    <p className="text-xs text-slate-400">CosPhi calculé</p>
                    <p className={`font-bold ${cosPhi < 0.85 ? 'text-red-400' : cosPhi > 0.93 ? 'text-green-400' : 'text-white'}`}>
                      {cosPhi.toFixed(3)}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Taux de charge transfo: <span className={`font-medium ${tauxTransfo > 100 ? 'text-red-400' : tauxTransfo > 80 ? 'text-orange-400' : 'text-green-400'}`}>
                    {tauxTransfo.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              onClick={handleCalculer}
            >
              <Calculator className="h-4 w-4 mr-2" /> Calculer la facture
            </Button>
          </div>

          {/* Résultat droite */}
          <div className="space-y-4">
            {resultat ? (
              <>
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold">Résultat — {form.categorie}</h3>
                    <Badge className="bg-blue-600/30 text-blue-300 border-0">
                      {num(form.nJours)} jours
                    </Badge>
                  </div>

                  {/* BT tranches */}
                  {isBT(form.categorie) && (
                    <>
                      {resultat.consomTranche1 !== undefined && (
                        <RowKV label="Tranche 1" value={`${formatKWh(resultat.consomTranche1)} × ${GRILLE_TARIFAIRE[form.categorie].type === 'tranche' ? (GRILLE_TARIFAIRE[form.categorie] as {t1:number}).t1 : 0} = ${formatFCFA(resultat.coutTranche1 ?? 0)}`} />
                      )}
                      {(resultat.consomTranche2 ?? 0) > 0 && (
                        <RowKV label="Tranche 2" value={`${formatKWh(resultat.consomTranche2!)} → ${formatFCFA(resultat.coutTranche2 ?? 0)}`} />
                      )}
                      {(resultat.consomTranche3 ?? 0) > 0 && (
                        <RowKV label="Tranche 3" value={`${formatKWh(resultat.consomTranche3!)} → ${formatFCFA(resultat.coutTranche3 ?? 0)}`} />
                      )}
                    </>
                  )}

                  {/* GP/MT énergie + majoations */}
                  {!isBT(form.categorie) && (
                    <>
                      {(resultat.majoK1 ?? 0) > 0 && (
                        <RowKV label={`K1 brut — ${(consomK1||num(form.consomActiveK1)).toLocaleString('fr-FR')} kWh`} value="" />
                      )}
                      {(resultat.majoK1 ?? 0) > 0 && (
                        <RowKV label={`  + MajoK1 (αa/βa)`} value={`+${(resultat.majoK1??0).toFixed(0)} kWh`} />
                      )}
                      <RowKV label={`K1 facturé (${(resultat.k1Facture??0).toFixed(0)} kWh × ${(GRILLE_TARIFAIRE[form.categorie] as {hhp:number}).hhp} FCFA/kWh)`} value={formatFCFA(resultat.coutK1 ?? 0)} />
                      {(resultat.majoK2 ?? 0) > 0 && (
                        <RowKV label={`  + MajoK2 (αa/βa)`} value={`+${(resultat.majoK2??0).toFixed(0)} kWh`} />
                      )}
                      <RowKV label={`K2 facturé (${(resultat.k2Facture??0).toFixed(0)} kWh × ${(GRILLE_TARIFAIRE[form.categorie] as {hp:number}).hp} FCFA/kWh)`} value={formatFCFA(resultat.coutK2 ?? 0)} />
                      {(resultat.majoWr ?? 0) > 0 && (
                        <RowKV label={`MajoWr (αr/βr) — réactif corrigé`} value={`+${(resultat.majoWr??0).toFixed(0)} kVARh`} />
                      )}
                    </>
                  )}

                  <RowKV label="Coût énergie total" value={formatFCFA(resultat.coutEnergie)} />

                  {resultat.primeFixe !== undefined && resultat.primeFixe > 0 && (
                    <>
                      <RowKV label="Prime fixe mensuelle" value={formatFCFA(resultat.primeFixe - (resultat.majDepassement ?? 0))} />
                      {(resultat.majDepassement ?? 0) > 0 && (
                        <RowKV label="Majoration dépassement PS" value={formatFCFA(resultat.majDepassement!)} />
                      )}
                    </>
                  )}

                  {resultat.cosPhi !== undefined && (
                    <RowKV
                      label={`CosPhi (${resultat.cosPhi >= 0.85 ? '✓ ≥ 0.85' : '⚠ < 0.85'})`}
                      value={resultat.cosPhi.toFixed(3)}
                    />
                  )}

                  <RowKV label="Redevance" value={formatFCFA(resultat.redevance)} />

                  {resultat.taxeCommunale > 0 && (
                    <RowKV label="Taxe communale" value={formatFCFA(resultat.taxeCommunale)} />
                  )}

                  <div className="border-t border-white/20 mt-2 pt-2">
                    <RowKV label="Montant HT" value={formatFCFA(resultat.montantHT)} />
                    <RowKV label="TVA 18%" value={formatFCFA(resultat.tva)} />
                    <RowKV label="MONTANT TTC" value={formatFCFA(resultat.montantTTC)} highlight className="font-bold" />
                  </div>

                  {/* Indicateurs de performance */}
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-500/10 rounded-lg p-2">
                      <p className="text-xs text-slate-400">IPR</p>
                      <p className="text-blue-400 font-bold text-sm">{(resultat.ipr ?? 0).toFixed(2)}</p>
                      <p className="text-slate-500 text-xs">FCFA/kWh TTC</p>
                    </div>
                    <div className="bg-green-500/10 rounded-lg p-2">
                      <p className="text-xs text-slate-400">Tarif moyen HT</p>
                      <p className="text-green-400 font-bold text-sm">{(resultat.tarifMoyen ?? 0).toFixed(2)}</p>
                      <p className="text-slate-500 text-xs">FCFA/kWh HT</p>
                    </div>
                    <div className="bg-yellow-500/10 rounded-lg p-2">
                      <p className="text-xs text-slate-400">Taux charge transfo</p>
                      <p className={`font-bold text-sm ${tauxTransfo > 100 ? 'text-red-400' : tauxTransfo > 80 ? 'text-orange-400' : 'text-green-400'}`}>
                        {tauxTransfo.toFixed(1)}%
                      </p>
                      <p className="text-slate-500 text-xs">{num(form.puissanceTransfo)} kVA</p>
                    </div>
                  </div>
                </div>

                {/* Pie chart répartition */}
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h4 className="text-white font-medium text-sm mb-3">Répartition des postes</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Énergie', value: Math.round(resultat.coutEnergie) },
                          { name: 'Prime fixe', value: Math.round(resultat.primeFixe ?? 0) },
                          { name: 'Redevance', value: Math.round(resultat.redevance) },
                          { name: 'TVA', value: Math.round(resultat.tva) },
                        ].filter(d => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: '#94a3b8' }}
                      >
                        {['#3b82f6', '#22c55e', '#f59e0b', '#ec4899'].map((color, i) => (
                          <Cell key={i} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        formatter={(v: number) => formatFCFA(v)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10"
                  onClick={handleAjouterHistorique}
                >
                  <Plus className="h-4 w-4 mr-2" /> Ajouter à l'historique
                </Button>
              </>
            ) : (
              <div className="bg-white/5 rounded-xl border border-white/10 p-10 text-center text-slate-500">
                <Calculator className="mx-auto h-12 w-12 opacity-20 mb-3" />
                <p>Remplissez le formulaire et cliquez sur Calculer</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- SCÉNARIOS D'OPTIMISATION ---- */}
      {activeView === 'scenarios' && (
        <div className="space-y-4">
          {scenarios.length === 0 ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-10 text-center text-slate-500">
              <TrendingUp className="mx-auto h-12 w-12 opacity-20 mb-3" />
              <p>Calculez une facture MT/HT pour générer les scénarios d'optimisation</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      {['Scénario', 'Description', 'Total TTC', 'Économie/mois', 'Économie/an', 'IPR (FCFA/kWh)'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc, i) => (
                      <tr key={i} className={`border-t border-white/10 hover:bg-white/5 ${i === 0 ? 'bg-white/5' : ''}`}>
                        <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                          {i === 0
                            ? <Badge className="bg-slate-600/30 text-slate-300 border-0">Base</Badge>
                            : sc.economieVsBase > 0
                              ? <Badge className="bg-green-600/30 text-green-300 border-0">{sc.nom}</Badge>
                              : <Badge className="bg-red-600/30 text-red-300 border-0">{sc.nom}</Badge>
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{sc.description}</td>
                        <td className="px-4 py-3 text-yellow-400 font-medium">{formatFCFA(sc.resultat.montantTTC)}</td>
                        <td className={`px-4 py-3 font-medium ${sc.economieVsBase > 0 ? 'text-green-400' : sc.economieVsBase < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {sc.economieVsBase > 0 ? '+' : ''}{formatFCFA(sc.economieVsBase)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${sc.economieAnnuelle > 0 ? 'text-green-400' : sc.economieAnnuelle < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {sc.economieAnnuelle > 0 ? '+' : ''}{formatFCFA(sc.economieAnnuelle)}
                        </td>
                        <td className="px-4 py-3 text-blue-400">{sc.ipr.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Graphique comparatif */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h4 className="text-white font-medium text-sm mb-3">Comparaison des coûts TTC</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={scenarios.map(sc => ({ nom: sc.nom, ttc: Math.round(sc.resultat.montantTTC), eco: Math.round(sc.economieVsBase) }))}
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="nom" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      formatter={(v: number) => formatFCFA(v)}
                    />
                    <Legend wrapperStyle={{ color: '#94a3b8' }} />
                    <Bar dataKey="ttc" name="Total TTC" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- HISTORIQUE ---- */}
      {activeView === 'historique' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-semibold">{historiqueLocal.length} calcul(s) enregistré(s)</h3>
            {historiqueLocal.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={exportHistorique}
              >
                <Download className="h-4 w-4 mr-1" /> Export Excel
              </Button>
            )}
          </div>

          {chartData.length > 1 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h4 className="text-white font-medium text-sm mb-3">Évolution du coût total TTC</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="periode" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    formatter={(v: number) => formatFCFA(v)}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8' }} />
                  <Bar dataKey="energie" name="Énergie" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="primeFixe" name="Prime fixe" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {historiqueLocal.length > 0 ? (
            <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    {['Période', 'K1 kWh', 'K2 kWh', 'CosPhi', 'Énergie', 'Prime fixe', 'Redevance', 'TVA', 'Total TTC', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-slate-300 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historiqueLocal.map((l, i) => (
                    <tr key={l.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-3 py-2 text-white font-medium">{l.periode}</td>
                      <td className="px-3 py-2 text-slate-400">{l.consomActiveK1.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-slate-400">{l.consomActiveK2.toLocaleString('fr-FR')}</td>
                      <td className={`px-3 py-2 font-medium ${(l.resultat.cosPhi ?? 1) < 0.85 ? 'text-red-400' : 'text-green-400'}`}>
                        {l.resultat.cosPhi?.toFixed(3) ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{Math.round(l.resultat.coutEnergie).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-slate-400">{Math.round(l.resultat.primeFixe ?? 0).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-slate-400">{Math.round(l.resultat.redevance).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-slate-400">{Math.round(l.resultat.tva).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-yellow-400 font-bold">{Math.round(l.resultat.montantTTC).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0"
                          onClick={() => setHistoriqueLocal(prev => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <TrendingUp className="mx-auto h-12 w-12 opacity-20 mb-3" />
              <p>Aucun calcul dans l'historique</p>
              <p className="text-xs mt-1">Calculez une facture et cliquez sur "Ajouter à l'historique"</p>
            </div>
          )}
        </div>
      )}

      {/* ---- GRILLE TARIFAIRE ---- */}
      {activeView === 'tarifs' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-white font-semibold">Grille tarifaire SENELEC — Février 2017</h3>
              <p className="text-slate-400 text-xs mt-1">Heures de Pointe (HP): 19h–23h · Heures Hors Pointe (HHP): 0h–19h et 23h–24h</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-slate-300 font-medium">Catégorie</th>
                    <th className="px-4 py-3 text-left text-slate-300 font-medium">Tension</th>
                    <th className="px-4 py-3 text-right text-slate-300 font-medium">T1 / HHP (FCFA/kWh)</th>
                    <th className="px-4 py-3 text-right text-slate-300 font-medium">T2 / HP (FCFA/kWh)</th>
                    <th className="px-4 py-3 text-right text-slate-300 font-medium">T3 (FCFA/kWh)</th>
                    <th className="px-4 py-3 text-right text-slate-300 font-medium">Prime fixe (FCFA/kW/mois)</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const t = GRILLE_TARIFAIRE[cat.value];
                    return (
                      <tr key={cat.value} className="border-t border-white/10 hover:bg-white/5">
                        <td className="px-4 py-3 text-white font-medium">{cat.label}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="border-white/20 text-slate-300 text-xs">
                            {cat.tension}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-blue-400">
                          {t.type === 'tranche' ? t.t1 : t.hhp}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-400">
                          {t.type === 'tranche' ? t.t2 : t.hp}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {t.type === 'tranche' ? t.t3 : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-green-400">
                          {t.type !== 'tranche' ? t.primeFixe.toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h4 className="text-white font-medium text-sm mb-3">Tranches BT (kWh)</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="text-left py-1">Option</th>
                    <th className="text-right py-1">T1</th>
                    <th className="text-right py-1">T2</th>
                    <th className="text-right py-1">T3</th>
                  </tr>
                </thead>
                <tbody>
                  {(['DPP', 'DMP', 'PPP', 'PMP'] as const).map(cat => {
                    const t = GRILLE_TARIFAIRE[cat] as { seuil1: number; seuil2: number };
                    return (
                      <tr key={cat} className="border-b border-white/5">
                        <td className="py-2 text-white">{cat}</td>
                        <td className="text-right text-slate-400">0–{t.seuil1}</td>
                        <td className="text-right text-slate-400">{t.seuil1 + 1}–{t.seuil1 + t.seuil2}</td>
                        <td className="text-right text-slate-400">&gt;{t.seuil1 + t.seuil2}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h4 className="text-white font-medium text-sm mb-3">Paramètres fiscaux</h4>
              <RowKV label="TVA" value="18%" />
              <RowKV label="Heures de Pointe" value="19h–23h" />
              <RowKV label="Heures Hors Pointe" value="0h–19h et 23h–24h" />
              <RowKV label="Seuil CosPhi mini" value="0.85" />
              <RowKV label="Seuil CosPhi bon" value="0.93" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
