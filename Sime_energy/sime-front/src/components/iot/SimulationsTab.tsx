import { useState, useEffect } from 'react';
import { Loader2, Play, Save, Trash2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { IotTabProps } from './shared';
import { getMesuresEnrichies, type IotReading } from '@/lib/iot-mesures-service';
import { getIotTarifs, type IotTarif } from '@/lib/iot-tarifs-service';
import { getIotSimulations, createIotSimulation, deleteIotSimulation, type IotSimulation } from '@/lib/iot-simulations-service';

type JourType = 'tous' | 'ouvres' | 'weekend' | 'feries';
type Periode  = 'HP' | 'HC' | 'tout';

interface ScenarioParams {
  nom: string;
  dateDebut: string;
  dateFin: string;
  jourType: JourType;
  periode: Periode;
  seuilKw: string;
  coefficient: string;
  tarifId: string;
}

const defaultParams = (): ScenarioParams => ({
  nom: 'Scénario ' + new Date().toLocaleDateString('fr-FR'),
  dateDebut: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  dateFin: format(new Date(), 'yyyy-MM-dd'),
  jourType: 'ouvres',
  periode: 'tout',
  seuilKw: '',
  coefficient: '1',
  tarifId: '',
});

const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#BA7517', '#7F77DD'];

export function SimulationsTab({ organizationId, userId, siteId }: IotTabProps) {
  const [params, setParams]             = useState<ScenarioParams>(defaultParams());
  const [tarifs, setTarifs]             = useState<IotTarif[]>([]);
  const [simulations, setSimulations]   = useState<IotSimulation[]>([]);
  const [results, setResults]           = useState<{ label: string; data: { name: string; kWh: number; fcfa: number }[] }[]>([]);
  const [running, setRunning]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    Promise.all([
      getIotTarifs(organizationId),
      siteId ? getIotSimulations(siteId) : Promise.resolve([]),
    ]).then(([t, s]) => {
      setTarifs(t);
      setSimulations(s);
      if (t.length) setParams(p => ({ ...p, tarifId: t[0].id }));
    }).catch(() => toast.error('Erreur chargement'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  function set<K extends keyof ScenarioParams>(k: K, v: ScenarioParams[K]) {
    setParams(p => ({ ...p, [k]: v }));
  }

  async function runSimulation() {
    if (!siteId) { toast.error('Sélectionnez un site d\'abord'); return; }
    setRunning(true);
    try {
      const lectures = await getMesuresEnrichies({
        siteId,
        dateDebut: params.dateDebut,
        dateFin: params.dateFin,
      });

      const filtered = filterLectures(lectures, params);
      const tarif = tarifs.find(t => t.id === params.tarifId);
      const monthly = aggregateByMonth(filtered, tarif, parseFloat(params.coefficient) || 1);

      const label = params.nom || 'Simulation';
      setResults(prev => {
        const existing = prev.findIndex(r => r.label === label);
        const entry = { label, data: monthly };
        if (existing >= 0) { const next = [...prev]; next[existing] = entry; return next; }
        return [...prev.slice(-4), entry]; // max 5 comparaisons
      });
      toast.success(`Simulation "${label}" calculée — ${filtered.length} lectures`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur simulation');
    } finally { setRunning(false); }
  }

  async function handleSave() {
    if (!results.length) return;
    setSaving(true);
    try {
      if (!siteId) return;
      await createIotSimulation(organizationId, siteId, {
        nom: params.nom,
        conditions: { tarif_id: params.tarifId, coefficient: parseFloat(params.coefficient) || 1 },
      }, userId ?? '');
      const s = await getIotSimulations(siteId);
      setSimulations(s);
      toast.success('Simulation sauvegardée');
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteIotSimulation(id);
      setSimulations(s => s.filter(x => x.id !== id));
      toast.success('Supprimée');
    } catch { toast.error('Erreur'); }
  }

  // Merge all simulation data for combined chart
  const allMonths = [...new Set(results.flatMap(r => r.data.map(d => d.name)))].sort();
  const chartData = allMonths.map(m => {
    const row: Record<string, number | string> = { name: m };
    results.forEach(r => {
      const point = r.data.find(d => d.name === m);
      row[r.label] = point?.kWh ?? 0;
    });
    return row;
  });

  return (
    <div className="space-y-4">
      {/* Formulaire */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm font-medium text-slate-200">Paramètres du scénario</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nom du scénario</label>
            <Input value={params.nom} onChange={e => set('nom', e.target.value)}
              className="bg-white/5 border-white/10 text-slate-100 h-8 text-sm"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date début</label>
            <input type="date" value={params.dateDebut} onChange={e => set('dateDebut', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-8"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date fin</label>
            <input type="date" value={params.dateFin} onChange={e => set('dateFin', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-8"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type de jours</label>
            <Select value={params.jourType} onValueChange={v => set('jourType', v as JourType)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 h-8 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les jours</SelectItem>
                <SelectItem value="ouvres">Jours ouvrés</SelectItem>
                <SelectItem value="weekend">Week-end</SelectItem>
                <SelectItem value="feries">Jours fériés</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Période HP/HC</label>
            <Select value={params.periode} onValueChange={v => set('periode', v as Periode)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 h-8 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="tout">Toute la journée</SelectItem>
                <SelectItem value="HP">Heures de Pointe (HP)</SelectItem>
                <SelectItem value="HC">Heures Creuses (HC)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tarif</label>
            <Select value={params.tarifId} onValueChange={v => set('tarifId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 h-8 text-sm"><SelectValue placeholder="Choisir…"/></SelectTrigger>
              <SelectContent>
                {tarifs.map(t => <SelectItem key={t.id} value={t.id}>{t.fournisseur}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Seuil kW (optionnel)</label>
            <Input type="number" value={params.seuilKw} onChange={e => set('seuilKw', e.target.value)}
              placeholder="ex: 50" className="bg-white/5 border-white/10 text-slate-100 h-8 text-sm"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Coefficient correcteur</label>
            <Input type="number" value={params.coefficient} onChange={e => set('coefficient', e.target.value)}
              placeholder="1.0" step="0.1" className="bg-white/5 border-white/10 text-slate-100 h-8 text-sm"/>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={runSimulation} disabled={running || !siteId}
            className="bg-green-700 hover:bg-green-600 text-white">
            {running ? <Loader2 size={14} className="animate-spin mr-1"/> : <Play size={14} className="mr-1"/>}
            Lancer
          </Button>
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !results.length}
            className="border-white/10 text-slate-300 hover:bg-white/10">
            {saving ? <Loader2 size={14} className="animate-spin mr-1"/> : <Save size={14} className="mr-1"/>}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Graphique comparaison */}
      {results.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium text-slate-200 mb-3">
            Comparaison des scénarios — consommation mensuelle (kWh)
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}/>
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v} kWh`}/>
              <Tooltip
                contentStyle={{ background: '#0f111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v.toFixed(0)} kWh`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}/>
              {results.map((r, i) => (
                <Line key={r.label} type="monotone" dataKey={r.label}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false}/>
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Résumé chiffré */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {results.map((r, i) => {
              const totalKwh  = r.data.reduce((a, d) => a + d.kWh, 0);
              const totalFcfa = r.data.reduce((a, d) => a + d.fcfa, 0);
              return (
                <div key={r.label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }}/>
                    <span className="text-xs font-medium text-slate-200 truncate">{r.label}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-100">{totalKwh.toFixed(0)} kWh</div>
                  <div className="text-xs text-slate-400">{Math.round(totalFcfa).toLocaleString('fr-FR')} FCFA</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Simulations sauvegardées */}
      {!loading && simulations.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium text-slate-200 mb-3">Scénarios sauvegardés</div>
          <div className="space-y-2">
            {simulations.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-sm text-slate-200">{s.nom}</div>
                  <div className="text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-slate-500 hover:text-red-400">
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!siteId && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-slate-400 text-sm">
          <FlaskConical size={24} className="mx-auto mb-2 opacity-40"/>
          Sélectionnez un site pour lancer des simulations.
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterLectures(lectures: IotReading[], params: ScenarioParams): IotReading[] {
  return lectures.filter(r => {
    const d = new Date(r.timestamp);
    const dow = d.getDay();
    const hour = d.getHours();

    if (params.jourType === 'ouvres'  && (dow === 0 || dow === 6)) return false;
    if (params.jourType === 'weekend' && dow !== 0 && dow !== 6)   return false;

    if (params.periode === 'HP' && !(hour >= 19 && hour < 23)) return false;
    if (params.periode === 'HC' &&   (hour >= 19 && hour < 23)) return false;

    if (params.seuilKw) {
      const seuil = parseFloat(params.seuilKw);
      if (!isNaN(seuil) && (r.kw_total ?? 0) > seuil) return false;
    }

    return true;
  });
}

function aggregateByMonth(
  lectures: IotReading[],
  tarif: IotTarif | undefined,
  coefficient: number,
): { name: string; kWh: number; fcfa: number }[] {
  const map = new Map<string, { kWh: number; fcfa: number }>();
  for (const r of lectures) {
    const d = new Date(r.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { kWh: 0, fcfa: 0 });
    const entry = map.get(key)!;
    const kwh = (r.kwh_total ?? 0) * coefficient;
    entry.kWh  += kwh;

    if (tarif) {
      const isHp = d.getHours() >= 19 && d.getHours() < 23;
      const rate = isHp ? (tarif.tarif_k2_hp ?? tarif.tarif_k2_hc ?? 0) : (tarif.tarif_k2_hc ?? 0);
      entry.fcfa += kwh * rate;
    }
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({ name, ...v }));
}
