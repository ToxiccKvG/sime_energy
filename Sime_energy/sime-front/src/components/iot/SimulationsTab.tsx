// ============================================================
// IOT MODULE — Onglet 7 : Simulations
// Conditions filtrantes nommées + comparaison côte à côte
// ============================================================

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Plus, Trash2, Play, Pause, Copy, FlaskConical, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import type { Simulation, SimulationCondition, ConditionChamp, ConditionOperateur } from './shared';

// ---- Labels lisibles ----
const CHAMP_LABELS: Record<ConditionChamp, string> = {
  puissanceKw:  'Puissance (kW)',
  energieKwh:   'Énergie (kWh)',
  heure:        'Heure de la journée',
  jourSemaine:  'Jour de semaine',
  typeJour:     'Type de jour',
  date:         'Plage de dates',
};

const OP_LABELS: Record<ConditionOperateur, string> = {
  gt:      '> supérieur à',
  lt:      '< inférieur à',
  eq:      '= égal à',
  between: 'entre … et',
  outside: 'hors de',
};

// ---- Appliquer les conditions sur les données Shelly ----
function appliquerConditions(
  rows: { timestamp?: Date; date?: Date; kwhNet: number; puissKwTotal?: number; jourActivites?: string }[],
  conditions: SimulationCondition[],
): typeof rows {
  let filtered = [...rows];
  for (const cond of conditions) {
    if (!cond.actif) continue;
    filtered = filtered.filter(r => {
      const ts = (r as { timestamp?: Date; date?: Date }).timestamp ?? (r as { date?: Date }).date;
      switch (cond.champ) {
        case 'puissanceKw': {
          const val = (r as { puissKwTotal?: number }).puissKwTotal ?? 0;
          if (cond.operateur === 'gt') return val > Number(cond.valeur);
          if (cond.operateur === 'lt') return val < Number(cond.valeur);
          if (cond.operateur === 'eq') return val === Number(cond.valeur);
          if (cond.operateur === 'between') return val >= Number(cond.valeur) && val <= Number(cond.valeur2 ?? cond.valeur);
          if (cond.operateur === 'outside') return val < Number(cond.valeur) || val > Number(cond.valeur2 ?? cond.valeur);
          return true;
        }
        case 'energieKwh': {
          const val = r.kwhNet;
          if (cond.operateur === 'gt') return val > Number(cond.valeur);
          if (cond.operateur === 'lt') return val < Number(cond.valeur);
          if (cond.operateur === 'between') return val >= Number(cond.valeur) && val <= Number(cond.valeur2 ?? cond.valeur);
          if (cond.operateur === 'outside') return val < Number(cond.valeur) || val > Number(cond.valeur2 ?? cond.valeur);
          return true;
        }
        case 'heure': {
          if (!ts) return true;
          const h = ts.getHours();
          if (cond.operateur === 'between') return h >= Number(cond.valeur) && h < Number(cond.valeur2 ?? cond.valeur);
          if (cond.operateur === 'outside') return h < Number(cond.valeur) || h >= Number(cond.valeur2 ?? cond.valeur);
          if (cond.operateur === 'gt') return h > Number(cond.valeur);
          if (cond.operateur === 'lt') return h < Number(cond.valeur);
          return true;
        }
        case 'jourSemaine': {
          if (!ts) return true;
          return ts.getDay() !== Number(cond.valeur);
        }
        case 'typeJour': {
          const ja = (r as { jourActivites?: string }).jourActivites;
          if (cond.operateur === 'eq') return ja === cond.valeur;
          if (cond.operateur === 'outside') return ja !== cond.valeur;
          return true;
        }
        default: return true;
      }
    });
  }
  return filtered;
}

// ---- Ligne d'une condition ----
function ConditionRow({
  cond,
  sources,
  onChange,
  onDelete,
}: {
  cond: SimulationCondition;
  sources: { id: string; nom: string }[];
  onChange: (data: Partial<SimulationCondition>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap bg-white/5 rounded-lg p-2 text-sm">
      <GripVertical className="h-4 w-4 text-slate-600 cursor-grab shrink-0" />

      <Switch checked={cond.actif} onCheckedChange={(v) => onChange({ actif: v })} className="data-[state=checked]:bg-blue-500" />

      {/* Champ */}
      <select
        value={cond.champ}
        onChange={(e) => onChange({ champ: e.target.value as ConditionChamp })}
        className="bg-white/10 border border-white/20 rounded text-white text-xs px-2 py-1.5 outline-none"
      >
        {(Object.keys(CHAMP_LABELS) as ConditionChamp[]).map(k => (
          <option key={k} value={k}>{CHAMP_LABELS[k]}</option>
        ))}
      </select>

      {/* Opérateur */}
      <select
        value={cond.operateur}
        onChange={(e) => onChange({ operateur: e.target.value as ConditionOperateur })}
        className="bg-white/10 border border-white/20 rounded text-white text-xs px-2 py-1.5 outline-none"
      >
        {(Object.keys(OP_LABELS) as ConditionOperateur[]).map(k => (
          <option key={k} value={k}>{OP_LABELS[k]}</option>
        ))}
      </select>

      {/* Valeur */}
      <Input
        type={cond.champ === 'typeJour' ? 'text' : 'number'}
        value={String(cond.valeur)}
        onChange={(e) => onChange({ valeur: e.target.value })}
        className="bg-white/10 border-white/20 text-white text-xs h-7 w-20"
        placeholder="valeur"
      />

      {(cond.operateur === 'between' || cond.operateur === 'outside') && (
        <>
          <span className="text-slate-500 text-xs">et</span>
          <Input
            type="number"
            value={String(cond.valeur2 ?? '')}
            onChange={(e) => onChange({ valeur2: e.target.value })}
            className="bg-white/10 border-white/20 text-white text-xs h-7 w-20"
            placeholder="valeur 2"
          />
        </>
      )}

      {/* Source */}
      <select
        value={cond.sourceId ?? ''}
        onChange={(e) => onChange({ sourceId: e.target.value || undefined })}
        className="bg-white/10 border border-white/20 rounded text-white text-xs px-2 py-1.5 outline-none"
      >
        <option value="">Toutes sources</option>
        {sources.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
      </select>

      <button onClick={onDelete} className="ml-auto text-slate-500 hover:text-red-400">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---- Carte simulation ----
function SimulationCard({
  sim,
  sources,
  onUpdate,
  onDelete,
  onToggle,
  onDuplicate,
  rows,
}: {
  sim: Simulation;
  sources: { id: string; nom: string }[];
  onUpdate: (data: Partial<Simulation>) => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  rows: { date?: Date; kwhNet: number; puissKwTotal?: number; jourActivites?: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const resultats = useMemo(() => {
    const filtered = appliquerConditions(rows, sim.conditions);
    const energieOriginaleKwh = rows.reduce((s, r) => s + r.kwhNet, 0);
    const energieFiltreeKwh   = filtered.reduce((s, r) => s + r.kwhNet, 0);
    return {
      pointsExclus: rows.length - filtered.length,
      pointsTotal: rows.length,
      energieOriginaleKwh,
      energieFiltreeKwh,
      reductionPct: energieOriginaleKwh > 0
        ? ((energieOriginaleKwh - energieFiltreeKwh) / energieOriginaleKwh) * 100
        : 0,
    };
  }, [rows, sim.conditions]);

  const addCondition = () => {
    const newCond: SimulationCondition = {
      id: `cond-${Date.now()}`,
      champ: 'energieKwh',
      operateur: 'gt',
      valeur: 0,
      actif: true,
      description: '',
    };
    onUpdate({ conditions: [...sim.conditions, newCond] });
  };

  const updateCondition = (i: number, data: Partial<SimulationCondition>) => {
    const conditions = sim.conditions.map((c, idx) => idx === i ? { ...c, ...data } : c);
    onUpdate({ conditions });
  };

  const deleteCondition = (i: number) => {
    onUpdate({ conditions: sim.conditions.filter((_, idx) => idx !== i) });
  };

  return (
    <div className={`rounded-xl border transition-all ${sim.actif ? 'border-white/20 bg-white/5' : 'border-white/10 bg-transparent opacity-50'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setExpanded(v => !v)} className="text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1">
          <Input
            value={sim.nom}
            onChange={(e) => onUpdate({ nom: e.target.value })}
            className="bg-transparent border-0 text-white font-semibold p-0 h-auto text-base focus-visible:ring-0"
          />
          {sim.description && <p className="text-slate-500 text-xs">{sim.description}</p>}
        </div>

        {/* Résultats rapides */}
        {rows.length > 0 && (
          <div className="flex gap-3 text-xs text-center">
            <div>
              <p className="text-red-400 font-bold">{resultats.pointsExclus}</p>
              <p className="text-slate-500">exclus</p>
            </div>
            <div>
              <p className="text-green-400 font-bold">{resultats.reductionPct.toFixed(1)}%</p>
              <p className="text-slate-500">réduction</p>
            </div>
          </div>
        )}

        <Badge className={`border-0 text-xs ${sim.conditions.length > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-slate-400'}`}>
          {sim.conditions.length} condition(s)
        </Badge>

        <div className="flex gap-1">
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            {sim.actif ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onDuplicate} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Détail conditions */}
      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-2">
          <Input
            value={sim.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description (optionnel)"
            className="bg-white/5 border-white/20 text-white text-sm h-8"
          />

          {sim.conditions.map((cond, i) => (
            <ConditionRow
              key={cond.id}
              cond={cond}
              sources={sources}
              onChange={(data) => updateCondition(i, data)}
              onDelete={() => deleteCondition(i)}
            />
          ))}

          <Button size="sm" variant="ghost" className="text-blue-400 hover:bg-blue-500/10" onClick={addCondition}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une condition
          </Button>

          {/* Résultats détaillés */}
          {rows.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/10 text-center text-xs">
              {[
                { label: 'Points total', val: resultats.pointsTotal, color: 'text-white' },
                { label: 'Points conservés', val: resultats.pointsTotal - resultats.pointsExclus, color: 'text-green-400' },
                { label: 'Points exclus', val: resultats.pointsExclus, color: 'text-red-400' },
                { label: 'Réduction énergie', val: `${resultats.reductionPct.toFixed(1)}%`, color: 'text-yellow-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white/5 rounded-lg p-2">
                  <p className={`${color} font-bold text-sm`}>{val}</p>
                  <p className="text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Comparaison côte à côte ----
function ComparaisonSimulations({
  simulations,
  rows,
}: {
  simulations: Simulation[];
  rows: { date?: Date; kwhNet: number; puissKwTotal?: number; jourActivites?: string }[];
}) {
  const [s1Id, setS1Id] = useState<string>(simulations[0]?.id ?? '');
  const [s2Id, setS2Id] = useState<string>(simulations[1]?.id ?? '');

  const buildData = (sim: Simulation | undefined) => {
    if (!sim || rows.length === 0) return [];
    const filtered = appliquerConditions(rows, sim.conditions);
    return filtered.map((r, i) => ({
      i,
      date: r.date?.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) ?? `J${i + 1}`,
      kwh: +r.kwhNet.toFixed(2),
    }));
  };

  const sim1 = simulations.find(s => s.id === s1Id);
  const sim2 = simulations.find(s => s.id === s2Id);
  const data1 = buildData(sim1);
  const data2 = buildData(sim2);

  // Aligner sur même longueur par index
  const maxLen = Math.max(data1.length, data2.length);
  const combined = Array.from({ length: maxLen }, (_, i) => ({
    label: data1[i]?.date ?? data2[i]?.date ?? `J${i + 1}`,
    [sim1?.nom ?? 'Sim1']: data1[i]?.kwh,
    [sim2?.nom ?? 'Sim2']: data2[i]?.kwh,
  }));

  if (simulations.length < 2) {
    return <p className="text-slate-500 text-sm text-center py-8">Créez au moins 2 simulations pour les comparer</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {[
          { label: 'Simulation 1', val: s1Id, set: setS1Id },
          { label: 'Simulation 2', val: s2Id, set: setS2Id },
        ].map(({ label, val, set }) => (
          <div key={label} className="flex-1">
            <Label className="text-slate-400 text-xs mb-1 block">{label}</Label>
            <Select value={val} onValueChange={set}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d2e] border-white/20">
                {simulations.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-white">{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {combined.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={combined} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit=" kWh" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              labelStyle={{ color: '#fff' }}
            />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <Area type="monotone" dataKey={sim1?.nom ?? 'Sim1'} stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
            <Area type="monotone" dataKey={sim2?.nom ?? 'Sim2'} stroke="#22c55e" fill="#22c55e20" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---- Onglet principal ----
export function SimulationsTab() {
  const { state, addSimulation, updateSimulation, removeSimulation, toggleSimulation } = useIOT();
  const [activeView, setActiveView] = useState<'simulations' | 'comparaison'>('simulations');

  const rows = state.shellyRows;

  const handleNew = () => {
    addSimulation({
      id: `sim-${Date.now()}`,
      nom: `Simulation ${state.simulations.length + 1}`,
      description: '',
      conditions: [],
      actif: true,
      createdAt: new Date(),
    });
  };

  const handleDuplicate = (sim: Simulation) => {
    addSimulation({
      ...sim,
      id: `sim-${Date.now()}`,
      nom: `${sim.nom} (copie)`,
      createdAt: new Date(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {(['simulations', 'comparaison'] as const).map(v => (
            <button
              key={v}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeView === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setActiveView(v)}
            >
              {v === 'simulations' ? 'Simulations' : 'Comparaison côte à côte'}
            </button>
          ))}
        </div>
        {activeView === 'simulations' && (
          <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" onClick={handleNew}>
            <Plus className="h-4 w-4 mr-1" /> Nouvelle simulation
          </Button>
        )}
      </div>

      {activeView === 'simulations' ? (
        state.simulations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <FlaskConical className="h-16 w-16 opacity-20 mb-4" />
            <p className="text-lg font-medium">Aucune simulation</p>
            <p className="text-sm mt-1 text-slate-600">Créez une simulation pour filtrer et analyser vos données</p>
            <Button className="mt-4 bg-blue-600 text-white" onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" /> Créer une simulation
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {state.simulations.map(sim => (
              <SimulationCard
                key={sim.id}
                sim={sim}
                sources={state.sources}
                rows={rows}
                onUpdate={(data) => updateSimulation(sim.id, data)}
                onDelete={() => removeSimulation(sim.id)}
                onToggle={() => toggleSimulation(sim.id)}
                onDuplicate={() => handleDuplicate(sim)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <ComparaisonSimulations simulations={state.simulations} rows={rows} />
        </div>
      )}

      {/* Guide conditions */}
      {activeView === 'simulations' && state.simulations.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <h4 className="text-slate-300 font-medium text-sm mb-2">Guide des conditions</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-500">
            {[
              { ex: 'Heure entre 6 et 22', desc: 'Heures actives uniquement' },
              { ex: 'Énergie < 200 kWh', desc: 'Exclure les valeurs aberrantes' },
              { ex: 'TypeJour = Jour ouvré', desc: 'Jours de semaine seulement' },
              { ex: 'Puissance > 50 kW', desc: 'Dépassements de seuil' },
            ].map(({ ex, desc }) => (
              <div key={ex} className="bg-white/5 rounded-lg p-2">
                <p className="text-slate-300 font-mono text-xs">{ex}</p>
                <p className="mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
