import { useState, useEffect, useCallback } from 'react';
import { Loader2, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { IotTabProps } from './shared';
import { getMesuresEnrichies, type IotReading, type Granularite } from '@/lib/iot-mesures-service';
import type { SourceCode } from '@/lib/iot-sources-service';

const SOURCE_COLORS: Record<SourceCode, string> = {
  M1: '#378ADD', M2: '#D85A30', M3: '#7F77DD', M4: '#BA7517', M5: '#1D9E75',
};

const GRANULARITES: { id: Granularite; label: string }[] = [
  { id: '15min', label: '15 min' }, { id: '30min', label: '30 min' },
  { id: '1h', label: '1 heure' },  { id: '1j', label: '1 jour' },
];

const SOURCES: SourceCode[] = ['M1', 'M2', 'M3', 'M4', 'M5'];

export function CourbeChargeTab({ organizationId, siteId }: IotTabProps) {
  const [lectures, setLectures] = useState<IotReading[]>([]);
  const [loading, setLoading]   = useState(false);
  const [chartType, setChartType] = useState<'area' | 'line'>('area');
  const [granularite, setGranularite] = useState<Granularite>('1h');
  const [dateDebut, setDateDebut] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateFin, setDateFin]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeSources, setActiveSources] = useState<Set<SourceCode>>(new Set(['M1', 'M3', 'M5']));
  const [seuilKw, setSeuilKw]   = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await getMesuresEnrichies({ siteId, dateDebut, dateFin, sources: [...activeSources] });
      setLectures(data);
    } catch { toast.error('Erreur chargement courbe'); }
    finally { setLoading(false); }
  }, [siteId, dateDebut, dateFin, activeSources]);

  useEffect(() => { load(); }, [load]);

  // Agréger selon granularité
  const chartData = (() => {
    if (!lectures.length) return [];
    const map = new Map<string, Record<string, number>>();
    for (const r of lectures) {
      const d = new Date(r.timestamp);
      let key: string;
      if (granularite === '15min') key = `${format(d, 'dd/MM HH:mm')}`;
      else if (granularite === '30min') { d.setMinutes(Math.floor(d.getMinutes() / 30) * 30, 0, 0); key = format(d, 'dd/MM HH:mm'); }
      else if (granularite === '1h')  { d.setMinutes(0, 0, 0); key = format(d, 'dd/MM HH:mm'); }
      else key = format(d, 'dd/MM');

      if (!map.has(key)) map.set(key, { t: d.getTime() });
      const entry = map.get(key)!;
      const code = r.source_code as SourceCode;
      if (code && activeSources.has(code)) {
        entry[code] = (entry[code] ?? 0) + (r.kw_total ?? 0);
      }
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => a.t - b.t)
      .map(([key, vals]) => ({ name: key, ...vals }));
  })();

  function toggleSource(code: SourceCode) {
    setActiveSources(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const ChartComp = chartType === 'area' ? AreaChart : LineChart;

  return (
    <div className="space-y-4">
      {!siteId ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Sélectionnez un site dans l'onglet Sources pour afficher la courbe de charge.
        </div>
      ) : (
        <>
          {/* Filtres */}
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>
            <span className="text-slate-500 text-sm">→</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>
            <Select value={granularite} onValueChange={v => setGranularite(v as Granularite)}>
              <SelectTrigger className="w-28 bg-white/5 border-white/10 text-slate-200 h-9 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>{GRANULARITES.map(g => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={chartType} onValueChange={v => setChartType(v as typeof chartType)}>
              <SelectTrigger className="w-28 bg-white/5 border-white/10 text-slate-200 h-9 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="area">Aires</SelectItem><SelectItem value="line">Lignes</SelectItem></SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="border-white/10 text-slate-300 hover:bg-white/10 h-9">
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            </Button>
            <div>
              <input type="number" value={seuilKw} onChange={e => setSeuilKw(e.target.value)}
                placeholder="Seuil kW…" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9 w-32"/>
            </div>
          </div>

          {/* Sélecteur sources */}
          <div className="flex gap-2 flex-wrap">
            {SOURCES.map(code => (
              <button key={code} onClick={() => toggleSource(code)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border"
                style={{
                  borderColor: activeSources.has(code) ? SOURCE_COLORS[code] : 'rgba(255,255,255,0.1)',
                  background:  activeSources.has(code) ? SOURCE_COLORS[code] + '22' : 'transparent',
                  color:       activeSources.has(code) ? SOURCE_COLORS[code] : '#64748b',
                }}>
                <span className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS[code] }}/>
                {code}
              </button>
            ))}
          </div>

          {/* Graphique */}
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <Loader2 size={24} className="animate-spin"/>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-sm">
              Aucune donnée sur la période sélectionnée.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ResponsiveContainer width="100%" height={320}>
                <ChartComp data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}/>
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v} kW`}/>
                  <Tooltip
                    contentStyle={{ background: '#0f111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v: number, name: string) => [`${v.toFixed(2)} kW`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}/>
                  {seuilKw && <ReferenceLine y={parseFloat(seuilKw)} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Seuil ${seuilKw} kW`, fill: '#ef4444', fontSize: 10 }}/>}
                  {/* Zones HP 19h-23h — annotées via les données */}
                  {[...activeSources].map(code =>
                    chartType === 'area' ? (
                      <Area key={code} type="monotone" dataKey={code} stroke={SOURCE_COLORS[code]} fill={SOURCE_COLORS[code] + '33'} strokeWidth={1.5} dot={false}/>
                    ) : (
                      <Line key={code} type="monotone" dataKey={code} stroke={SOURCE_COLORS[code]} strokeWidth={1.5} dot={false}/>
                    )
                  )}
                </ChartComp>
              </ResponsiveContainer>
              <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                <span>{chartData.length} points · {lectures.length.toLocaleString()} lectures</span>
                <div className="flex gap-2">
                  <span className="rounded px-2 py-0.5 bg-amber-900/40 text-amber-300">HP 19h–23h</span>
                  <span className="rounded px-2 py-0.5 bg-blue-900/40 text-blue-300">HC reste</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
