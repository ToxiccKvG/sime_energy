import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Zap, TrendingDown, Sun, Battery, ArrowDownUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { IotTabProps } from './shared';
import { getBilanM1M5, type BilanM1M5 } from '@/lib/iot-mesures-service';
import { getIotTarifs, type IotTarif } from '@/lib/iot-tarifs-service';
import { getIotSiteById } from '@/lib/iot-sites-service';

export function BilanTab({ organizationId, siteId }: IotTabProps) {
  const [bilan, setBilan]     = useState<BilanM1M5 | null>(null);
  const [tarif, setTarif]     = useState<IotTarif | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateDebut, setDateDebut] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateFin, setDateFin]     = useState(format(new Date(), 'yyyy-MM-dd'));

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [site, tarifs] = await Promise.all([
        getIotSiteById(siteId).catch(() => null),
        getIotTarifs(organizationId),
      ]);
      const activeTarif = tarifs.find(t => t.id === site?.tarif_actif_id) ?? tarifs[0] ?? null;
      setTarif(activeTarif);
      const data = await getBilanM1M5(siteId, dateDebut, dateFin, activeTarif ?? undefined);
      setBilan(data);
    } catch { toast.error('Erreur chargement bilan'); }
    finally { setLoading(false); }
  }, [siteId, dateDebut, dateFin, organizationId]);

  useEffect(() => { load(); }, [load]);

  const kpiCards = bilan ? [
    {
      label: 'Énergie réseau (M1)',
      value: bilan.m1_kwh.toFixed(0),
      unit: 'kWh',
      icon: Zap,
      color: 'text-blue-400',
      bg: 'bg-blue-900/30 border-blue-500/30',
    },
    {
      label: 'Consommation totale (M3)',
      value: bilan.m3_kwh.toFixed(0),
      unit: 'kWh',
      icon: TrendingDown,
      color: 'text-amber-400',
      bg: 'bg-amber-900/30 border-amber-500/30',
    },
    {
      label: 'Production renouvelable (M5)',
      value: bilan.m5_kwh.toFixed(0),
      unit: 'kWh',
      icon: Sun,
      color: 'text-green-400',
      bg: 'bg-green-900/30 border-green-500/30',
    },
    {
      label: 'Taux de couverture',
      value: bilan.taux_couverture_pct.toFixed(1),
      unit: '%',
      icon: Battery,
      color: 'text-purple-400',
      bg: 'bg-purple-900/30 border-purple-500/30',
    },
    {
      label: 'Économies FCFA',
      value: Math.round(bilan.economie_devise).toLocaleString('fr-FR'),
      unit: 'FCFA',
      icon: ArrowDownUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-900/30 border-emerald-500/30',
    },
  ] : [];

  const barData = bilan ? [
    { name: 'M1 Réseau', kWh: bilan.m1_kwh, fill: '#378ADD' },
    { name: 'M3 Conso.', kWh: bilan.m3_kwh, fill: '#D85A30' },
    { name: 'M5 Renouv.', kWh: bilan.m5_kwh, fill: '#1D9E75' },
  ] : [];

  return (
    <div className="space-y-4">
      {!siteId ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Sélectionnez un site dans l'onglet Sources pour afficher le bilan énergétique.
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
            <Button size="sm" variant="outline" onClick={load} disabled={loading}
              className="border-white/10 text-slate-300 hover:bg-white/10 h-9">
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            </Button>
            {tarif && (
              <span className="rounded-full bg-blue-900/30 border border-blue-500/30 px-3 py-1 text-xs text-blue-300">
                Tarif : {tarif.fournisseur}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <Loader2 size={24} className="animate-spin"/>
            </div>
          ) : !bilan ? (
            <div className="flex items-center justify-center h-40 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-sm">
              Aucune donnée sur la période sélectionnée.
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {kpiCards.map(k => (
                  <div key={k.label} className={`rounded-xl border p-4 ${k.bg}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <k.icon size={16} className={k.color}/>
                      <span className="text-xs text-slate-400">{k.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-100">{k.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{k.unit}</div>
                  </div>
                ))}
              </div>

              {/* Bar Chart */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium text-slate-200 mb-3">Bilan énergétique M1 / M3 / M5</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} barSize={48}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false}/>
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} tickFormatter={v => `${v} kWh`}/>
                    <Tooltip
                      contentStyle={{ background: '#0f111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [`${v.toFixed(0)} kWh`]}
                    />
                    <Bar dataKey="kWh" radius={[4, 4, 0, 0]}
                      fill="#378ADD"
                      label={{ position: 'top', fill: '#94a3b8', fontSize: 10, formatter: (v: number) => `${v.toFixed(0)} kWh` }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Formulas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400 mb-1">Formule M3</div>
                  <div className="font-mono text-sm text-slate-200">M3 = M1 + M5</div>
                  <div className="text-xs text-slate-500 mt-1">Consommation = Réseau + Renouvelable</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400 mb-1">Taux couverture</div>
                  <div className="font-mono text-sm text-slate-200">M5 / M3 × 100</div>
                  <div className="text-xs text-slate-500 mt-1">Part renouvelable dans la consommation totale</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400 mb-1">Économies FCFA</div>
                  <div className="font-mono text-sm text-slate-200">M5_kWh × Tarif_moy</div>
                  <div className="text-xs text-slate-500 mt-1">Énergie renouvelable valorisée au tarif actif</div>
                </div>
              </div>

              {/* Additional metrics */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium text-slate-200 mb-3">Flux détaillés</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Autoconsommation</div>
                      <div className="text-lg font-bold text-green-400">{(bilan.taux_autoconsommation * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Énergie injectée réseau</div>
                      <div className="text-lg font-bold text-amber-400">{bilan.energie_injectee_kwh.toFixed(0)} kWh</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Facture réseau estimée</div>
                      <div className="text-lg font-bold text-red-400">{Math.round(bilan.cout_reseau_devise).toLocaleString('fr-FR')} FCFA</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Économies réalisées</div>
                      <div className="text-lg font-bold text-emerald-400">{Math.round(bilan.economie_devise).toLocaleString('fr-FR')} FCFA</div>
                    </div>
                  </div>
                </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
