import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import type { IotTabProps } from './shared';
import { getMesuresEnrichies, type IotReading } from '@/lib/iot-mesures-service';

type Axe = 'heure' | 'jour' | 'mois' | 'source' | 'periode_journee' | 'periode_climatique' | 'saison' | 'tranche';
type Agregat = 'kw_total' | 'kwh_total' | 'montant_fcfa';

const AXES: { id: Axe; label: string }[] = [
  { id: 'heure',             label: 'Heure (0–23)' },
  { id: 'jour',              label: 'Jour de semaine' },
  { id: 'mois',              label: 'Mois' },
  { id: 'source',            label: 'Source (M1–M5)' },
  { id: 'periode_journee',   label: 'Période journée' },
  { id: 'periode_climatique',label: 'Période climatique' },
  { id: 'saison',            label: 'Saison' },
  { id: 'tranche',           label: 'Tranche HP/HC' },
];

const AGREGATS: { id: Agregat; label: string; unit: string }[] = [
  { id: 'kw_total',    label: 'Puissance moy. (kW)',  unit: 'kW' },
  { id: 'kwh_total',   label: 'Énergie (kWh)',         unit: 'kWh' },
  { id: 'montant_fcfa',label: 'Montant (FCFA)',         unit: 'FCFA' },
];

const TEMPLATES = [
  { label: 'Consommation par source',       axeL: 'source' as Axe, axeC: 'mois' as Axe,  agregat: 'kwh_total' as Agregat },
  { label: 'Profil journalier 0h–23h',      axeL: 'heure' as Axe,  axeC: 'jour' as Axe,   agregat: 'kw_total' as Agregat },
  { label: 'HP vs HC Senelec',              axeL: 'tranche' as Axe, axeC: 'mois' as Axe,  agregat: 'kwh_total' as Agregat },
  { label: 'Comparaison mensuelle',         axeL: 'mois' as Axe,   axeC: 'source' as Axe, agregat: 'kwh_total' as Agregat },
  { label: 'Profil hebdomadaire',           axeL: 'jour' as Axe,   axeC: 'heure' as Axe,  agregat: 'kw_total' as Agregat },
];

const JOUR_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS_LABELS = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function getKey(r: IotReading, axe: Axe): string {
  const d = new Date(r.timestamp);
  switch (axe) {
    case 'heure':  return String(d.getHours()).padStart(2, '0') + 'h';
    case 'jour':   return JOUR_LABELS[d.getDay()];
    case 'mois':   return MOIS_LABELS[d.getMonth() + 1];
    case 'source': return r.source_code ?? '?';
    case 'periode_journee':    return (r as any).periode_journee ?? '?';
    case 'periode_climatique': return (r as any).periode_climatique ?? '?';
    case 'saison': return (r as any).saison ?? '?';
    case 'tranche': return (r as any).tranche_hp_hc ?? '?';
  }
}

function getValue(r: IotReading, agregat: Agregat): number {
  return (r as any)[agregat] ?? 0;
}

function heatColor(ratio: number): string {
  const h = Math.round((1 - ratio) * 240);
  return `hsl(${h}, 70%, 40%)`;
}

export function TCDTab({ organizationId, siteId }: IotTabProps) {
  const [lectures, setLectures] = useState<IotReading[]>([]);
  const [loading, setLoading]   = useState(false);
  const [axeLignes, setAxeLignes] = useState<Axe>('heure');
  const [axeCols, setAxeCols]     = useState<Axe>('mois');
  const [agregat, setAgregat]     = useState<Agregat>('kwh_total');
  const [dateDebut, setDateDebut] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateFin, setDateFin]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [heatmap, setHeatmap]     = useState(true);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await getMesuresEnrichies({ siteId, dateDebut, dateFin });
      setLectures(data);
    } catch { toast.error('Erreur chargement données TCD'); }
    finally { setLoading(false); }
  }, [siteId, dateDebut, dateFin]);

  useEffect(() => { load(); }, [load]);

  function applyTemplate(t: typeof TEMPLATES[0]) {
    setAxeLignes(t.axeL); setAxeCols(t.axeC); setAgregat(t.agregat);
  }

  // Build pivot
  const pivot = (() => {
    if (!lectures.length) return { rows: [] as string[], cols: [] as string[], data: {} as Record<string, Record<string, number[]>>, max: 0 };
    const data: Record<string, Record<string, number[]>> = {};
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    for (const r of lectures) {
      const rk = getKey(r, axeLignes);
      const ck = getKey(r, axeCols);
      const v  = getValue(r, agregat);
      rowSet.add(rk); colSet.add(ck);
      if (!data[rk]) data[rk] = {};
      if (!data[rk][ck]) data[rk][ck] = [];
      data[rk][ck].push(v);
    }
    const rows = [...rowSet].sort();
    const cols = [...colSet].sort();
    let max = 0;
    for (const r of rows) for (const c of cols) {
      const vals = data[r]?.[c] ?? [];
      if (vals.length) { const s = vals.reduce((a, b) => a + b, 0); if (s > max) max = s; }
    }
    return { rows, cols, data, max };
  })();

  const unit = AGREGATS.find(a => a.id === agregat)?.unit ?? '';

  return (
    <div className="space-y-4">
      {!siteId ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Sélectionnez un site dans l'onglet Sources pour afficher le tableau croisé dynamique.
        </div>
      ) : (
        <>
          {/* Templates */}
          <div className="flex gap-1.5 flex-wrap">
            {TEMPLATES.map(t => (
              <button key={t.label} onClick={() => applyTemplate(t)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 transition-colors">
                {t.label}
              </button>
            ))}
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>
            <span className="text-slate-500 text-sm">→</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>

            <Select value={axeLignes} onValueChange={v => setAxeLignes(v as Axe)}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-slate-200 h-9 text-sm">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent>{AXES.map(a => <SelectItem key={a.id} value={a.id}>Lignes : {a.label}</SelectItem>)}</SelectContent>
            </Select>

            <Select value={axeCols} onValueChange={v => setAxeCols(v as Axe)}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-slate-200 h-9 text-sm">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent>{AXES.map(a => <SelectItem key={a.id} value={a.id}>Colonnes : {a.label}</SelectItem>)}</SelectContent>
            </Select>

            <Select value={agregat} onValueChange={v => setAgregat(v as Agregat)}>
              <SelectTrigger className="w-44 bg-white/5 border-white/10 text-slate-200 h-9 text-sm">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent>{AGREGATS.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={heatmap} onChange={e => setHeatmap(e.target.checked)} className="accent-blue-500"/>
              Heatmap
            </label>

            <Button size="sm" variant="outline" onClick={load} disabled={loading}
              className="border-white/10 text-slate-300 hover:bg-white/10 h-9">
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <Loader2 size={24} className="animate-spin"/>
            </div>
          ) : pivot.rows.length === 0 ? (
            <div className="flex items-center justify-center h-40 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-sm">
              <TableProperties size={20} className="mr-2"/> Aucune donnée sur la période sélectionnée.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-[#0f111a] px-3 py-2 text-left text-slate-400 font-medium border-b border-r border-white/10 whitespace-nowrap">
                      {AXES.find(a => a.id === axeLignes)?.label} \ {AXES.find(a => a.id === axeCols)?.label}
                    </th>
                    {pivot.cols.map(c => (
                      <th key={c} className="px-3 py-2 text-center text-slate-400 font-medium border-b border-white/5 whitespace-nowrap">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-center text-slate-400 font-medium border-b border-l border-white/10 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.rows.map(r => {
                    let rowTotal = 0;
                    return (
                      <tr key={r} className="hover:bg-white/5">
                        <td className="sticky left-0 bg-[#0f111a] px-3 py-1.5 font-medium text-slate-300 border-r border-white/10 whitespace-nowrap">{r}</td>
                        {pivot.cols.map(c => {
                          const vals = pivot.data[r]?.[c] ?? [];
                          const sum = vals.reduce((a, b) => a + b, 0);
                          rowTotal += sum;
                          const ratio = pivot.max > 0 ? sum / pivot.max : 0;
                          return (
                            <td key={c} className="px-3 py-1.5 text-center text-slate-200 border-b border-white/5 whitespace-nowrap"
                              style={heatmap && sum > 0 ? { background: heatColor(ratio) + '55', color: '#e2e8f0' } : {}}>
                              {sum > 0 ? sum.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-center font-semibold text-slate-200 border-b border-l border-white/10 whitespace-nowrap">
                          {rowTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10">
                    <td className="sticky left-0 bg-[#0f111a] px-3 py-1.5 font-semibold text-slate-300 border-r border-white/10">Total</td>
                    {pivot.cols.map(c => {
                      const total = pivot.rows.reduce((acc, r) => {
                        const vals = pivot.data[r]?.[c] ?? [];
                        return acc + vals.reduce((a, b) => a + b, 0);
                      }, 0);
                      return (
                        <td key={c} className="px-3 py-1.5 text-center font-semibold text-slate-200 whitespace-nowrap">
                          {total.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-center font-bold text-blue-300 border-l border-white/10">
                      {pivot.rows.reduce((acc, r) => {
                        return acc + pivot.cols.reduce((a2, c) => {
                          const vals = pivot.data[r]?.[c] ?? [];
                          return a2 + vals.reduce((x, y) => x + y, 0);
                        }, 0);
                      }, 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-3 py-2 text-xs text-slate-500 border-t border-white/10">
                Unité : {unit} · {lectures.length.toLocaleString()} lectures · {pivot.rows.length} lignes × {pivot.cols.length} colonnes
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
