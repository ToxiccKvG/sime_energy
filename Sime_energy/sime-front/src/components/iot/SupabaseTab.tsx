import { useState, useEffect } from 'react';
import { Loader2, Database, Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { IotTabProps } from './shared';
import { getStatutFlux, getDernieresLectures, type IotReading } from '@/lib/iot-mesures-service';
import { getIotSites } from '@/lib/iot-sites-service';
import { getIotSources } from '@/lib/iot-sources-service';

const TABLES = [
  { name: 'iot_sites',            desc: 'Sites physiques liés aux orgs',          cols: ['id', 'organization_id', 'nom', 'shelly_site_name', 'tarif_actif_id'] },
  { name: 'iot_sources',          desc: 'Points de mesure M1–M5 par site',         cols: ['id', 'iot_site_id', 'code', 'nom', 'device_id', 'capteur', 'actif', 'est_deduit'] },
  { name: 'iot_readings',         desc: 'Mesures brutes (miroir SHELLY_GCP_00)',   cols: ['id', 'iot_site_id', 'source_code', 'timestamp', 'kw_total', 'kwh_total', 'kw_a/b/c'] },
  { name: 'iot_tarifs',           desc: 'Grilles tarifaires HP/HC par org',         cols: ['id', 'organization_id', 'fournisseur', 'tarif_k2_hp', 'tarif_k2_hc', 'tva_pct'] },
  { name: 'iot_calendrier',       desc: 'Jours fériés + événements par org',        cols: ['id', 'organization_id', 'date_ferie', 'nom', 'type_ferie', 'recurrent'] },
  { name: 'iot_simulations',      desc: 'Scénarios d\'optimisation sauvegardés',   cols: ['id', 'iot_site_id', 'nom', 'conditions (jsonb)', 'kwh_economises', 'gain_devise'] },
  { name: 'iot_exports_log',      desc: 'Historique des exports générés',          cols: ['id', 'organization_id', 'format', 'nb_lignes', 'created_at'] },
];

const VIEW = {
  name: 'iot_mesures_enrichies',
  desc: 'Vue calculée — 17 colonnes enrichies par lecture',
  cols: [
    'timestamp (Africa/Dakar)', 'kw_total', 'kwh_total', 'source_code', 'source_nom',
    'tranche_hp_hc', 'heure', 'jour_semaine', 'mois', 'annee',
    'periode_journee', 'periode_climatique', 'saison', 'ensoleillement_h',
    'heures_travail', 'flux_energetique', 'montant_fcfa',
  ],
};

export function SupabaseTab({ organizationId, siteId }: IotTabProps) {
  const [statut, setStatut]       = useState<{ actif: boolean; derniere_lecture: string | null; nb_appareils: number } | null>(null);
  const [dernières, setDernières] = useState<IotReading[]>([]);
  const [counts, setCounts]       = useState<{ sites: number; sources: number }>({ sites: 0, sources: 0 });
  const [loading, setLoading]     = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [sites, flux, lectures] = await Promise.all([
        getIotSites(organizationId),
        siteId ? getStatutFlux(siteId).catch(() => null) : Promise.resolve(null),
        siteId ? getDernieresLectures(siteId, 10).catch(() => []) : Promise.resolve([]),
      ]);
      const sources = siteId ? await getIotSources(siteId).catch(() => []) : [];
      setCounts({ sites: sites.length, sources: sources.length });
      setStatut(flux);
      setDernières(lectures);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [organizationId, siteId]);

  return (
    <div className="space-y-4">
      {/* Statut flux */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400 mb-1">Sites configurés</div>
          <div className="text-2xl font-bold text-slate-100">{counts.sites}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400 mb-1">Sources (M1–M5)</div>
          <div className="text-2xl font-bold text-slate-100">{counts.sources}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400 mb-1">Flux Shelly</div>
          <div className="flex items-center gap-2 mt-1">
            {statut === null ? (
              <span className="text-slate-500 text-sm">—</span>
            ) : statut.actif ? (
              <><Wifi size={16} className="text-green-400"/><span className="text-sm text-green-400">Actif</span></>
            ) : (
              <><WifiOff size={16} className="text-slate-500"/><span className="text-sm text-slate-500">Inactif</span></>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400 mb-1">Dernière lecture</div>
          <div className="text-sm text-slate-200 mt-1">
            {statut?.derniere_lecture
              ? new Date(statut.derniere_lecture).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
              : '—'}
          </div>
        </div>
      </div>

      {/* Bouton refresh */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}
          className="border-white/10 text-slate-300 hover:bg-white/10">
          {loading ? <Loader2 size={14} className="animate-spin mr-1"/> : <RefreshCw size={14} className="mr-1"/>}
          Actualiser
        </Button>
      </div>

      {/* Dernières lectures */}
      {dernières.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
            <Database size={14} className="text-slate-400"/>
            <span className="text-sm font-medium text-slate-200">Dernières lectures — iot_readings</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="px-4 py-2 text-left font-medium">Timestamp</th>
                  <th className="px-4 py-2 text-left font-medium">Source</th>
                  <th className="px-4 py-2 text-right font-medium">kW total</th>
                  <th className="px-4 py-2 text-right font-medium">kWh total</th>
                  <th className="px-4 py-2 text-right font-medium">kW_A</th>
                  <th className="px-4 py-2 text-right font-medium">kW_B</th>
                  <th className="px-4 py-2 text-right font-medium">kW_C</th>
                </tr>
              </thead>
              <tbody>
                {dernières.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-1.5 font-mono text-slate-300">
                      {new Date(r.timestamp).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-1.5">
                      <span className="rounded px-1.5 py-0.5 bg-blue-900/40 text-blue-300 font-bold">{r.source_code}</span>
                    </td>
                    <td className="px-4 py-1.5 text-right text-slate-200">{r.kw_total?.toFixed(3)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-200">{r.kwh_total?.toFixed(4)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-400">{r.kw_a?.toFixed(3)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-400">{r.kw_b?.toFixed(3)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-400">{r.kw_c?.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schéma des tables */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-300">Schéma — sime-front Supabase</div>

        {/* Vue enrichie */}
        <div className="rounded-xl border border-green-500/30 bg-green-900/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-green-400"/>
            <span className="text-xs font-bold text-green-300 uppercase tracking-wide">Vue SQL</span>
            <span className="font-mono text-sm text-green-200">{VIEW.name}</span>
          </div>
          <div className="text-xs text-slate-400 mb-2">{VIEW.desc}</div>
          <div className="flex flex-wrap gap-1">
            {VIEW.cols.map(c => (
              <span key={c} className="rounded px-1.5 py-0.5 bg-green-900/40 text-green-300 text-[10px] font-mono">{c}</span>
            ))}
          </div>
        </div>

        {/* Tables */}
        <div className="grid gap-3 sm:grid-cols-2">
          {TABLES.map(t => (
            <div key={t.name} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Database size={12} className="text-slate-500"/>
                <span className="font-mono text-xs font-bold text-slate-200">{t.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">{t.desc}</div>
              <div className="flex flex-wrap gap-1">
                {t.cols.map(c => (
                  <span key={c} className="rounded px-1.5 py-0.5 bg-white/5 text-slate-400 text-[10px] font-mono">{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flux de données */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-slate-200 mb-3">Flux de données</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300 font-medium">Shelly 3EM</span>
          <span>→</span>
          <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300 font-medium">SHELLY_GCP_00<br/><span className="font-mono text-[10px] text-slate-500">poll-shelly (1 min)</span></span>
          <span>→</span>
          <div className="flex flex-col items-center gap-1">
            <span className="rounded-lg bg-blue-900/40 border border-blue-500/30 px-3 py-1.5 text-blue-200 font-medium">iot_readings</span>
            <span className="text-[10px] text-slate-500">sime-front</span>
            <span className="rounded-full bg-amber-900/30 text-amber-400 text-[10px] px-2 py-0.5">À configurer</span>
          </div>
          <span>→</span>
          <span className="rounded-lg bg-green-900/40 border border-green-500/30 px-3 py-1.5 text-green-200 font-medium">iot_mesures_enrichies</span>
          <span>→</span>
          <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300 font-medium">Analyses / Exports</span>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-400">
          <XCircle size={12} className="mt-0.5 shrink-0"/>
          <span>La Edge Function <code className="font-mono">poll-shelly</code> (SHELLY_GCP_00) doit être mise à jour pour écrire aussi dans <code className="font-mono">iot_readings</code> de sime-front. En attendant, utilisez l'onglet Import pour charger des CSV.</span>
        </div>
      </div>
    </div>
  );
}
