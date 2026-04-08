import { useState, useEffect } from 'react';
import { Loader2, FileSpreadsheet, FileText, Image, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import type { IotTabProps } from './shared';
import { getExportsLog, logExport, type IotExportLog } from '@/lib/iot-exports-service';
import { getMesuresEnrichies } from '@/lib/iot-mesures-service';
import { getIotTarifs } from '@/lib/iot-tarifs-service';

// xlsx importé dynamiquement pour éviter les erreurs si non chargé
let XLSX: typeof import('xlsx') | null = null;
import('xlsx').then(m => { XLSX = m; }).catch(() => {});

type FormatExport = 'xlsx' | 'csv';

const FEUILLES_XLSX = [
  { id: 'mesures_brutes',   label: 'Mesures brutes (iot_readings)' },
  { id: 'mesures_enrichies',label: 'Données enrichies (17 colonnes)' },
  { id: 'bilan_m1m5',       label: 'Bilan M1–M5' },
  { id: 'tcd_horaire',      label: 'TCD Profil horaire' },
  { id: 'tcd_mensuel',      label: 'TCD Mensuel par source' },
  { id: 'hp_hc',            label: 'Analyse HP / HC Senelec' },
  { id: 'simulations',      label: 'Simulations' },
];

export function ExportsTab({ organizationId, userId, siteId }: IotTabProps) {
  const [log, setLog]           = useState<IotExportLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dateDebut, setDateDebut] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateFin, setDateFin]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [format_, setFormat]      = useState<FormatExport>('xlsx');
  const [feuilles, setFeuilles]   = useState<Set<string>>(new Set(['mesures_enrichies', 'bilan_m1m5', 'hp_hc']));

  useEffect(() => { loadLog(); }, [organizationId, siteId]);

  async function loadLog() {
    setLoading(true);
    try {
      const data = await getExportsLog(organizationId, siteId ?? undefined, 30);
      setLog(data);
    } catch { toast.error('Erreur chargement historique'); }
    finally { setLoading(false); }
  }

  function toggleFeuille(id: string) {
    setFeuilles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleExport() {
    if (!siteId) { toast.error('Sélectionnez un site d\'abord'); return; }
    if (!XLSX)   { toast.error('Librairie XLSX non chargée, réessayez'); return; }
    setExporting(format_);

    try {
      const [lectures, tarifs] = await Promise.all([
        getMesuresEnrichies({ siteId, dateDebut, dateFin }),
        getIotTarifs(organizationId),
      ]);

      const wb = XLSX.utils.book_new();
      const nomFichier = `SIME_IoT_${siteId.slice(0, 6)}_${dateDebut}_${dateFin}.${format_}`;

      if (format_ === 'csv') {
        // CSV = données enrichies uniquement
        const ws = XLSX.utils.json_to_sheet(lectures);
        XLSX.utils.book_append_sheet(wb, ws, 'Données');
      } else {
        // XLSX multi-feuilles
        for (const f of FEUILLES_XLSX) {
          if (!feuilles.has(f.id)) continue;

          let rows: object[] = [];

          if (f.id === 'mesures_brutes' || f.id === 'mesures_enrichies') {
            rows = lectures.map(r => ({
              Timestamp:          r.timestamp,
              Source:             r.source_code,
              'kW total':         r.kw_total,
              'kWh total':        r.kwh_total,
              'kW phase A':       r.kw_a,
              'kW phase B':       r.kw_b,
              'kW phase C':       r.kw_c,
              'Tranche HP/HC':    (r as any).tranche_hp_hc,
              'Période journée':  (r as any).periode_journee,
              'Période climatique': (r as any).periode_climatique,
              'Saison':           (r as any).saison,
              'Flux énergetique': (r as any).flux_energetique,
              'Montant FCFA':     (r as any).montant_fcfa,
            }));
          } else if (f.id === 'hp_hc') {
            const hp = lectures.filter((r: any) => r.tranche_hp_hc === 'HP');
            const hc = lectures.filter((r: any) => r.tranche_hp_hc === 'HC');
            const sumKwh = (arr: typeof lectures) => arr.reduce((a, r) => a + (r.kwh_total ?? 0), 0);
            const tarif = tarifs[0];
            rows = [
              { Tranche: 'HP (19h–23h)', 'Lectures': hp.length, 'kWh': sumKwh(hp).toFixed(2), 'Tarif FCFA/kWh': tarif?.tarif_k2_hp, 'Montant FCFA': (sumKwh(hp) * (tarif?.tarif_k2_hp ?? 0)).toFixed(0) },
              { Tranche: 'HC (reste)',    'Lectures': hc.length, 'kWh': sumKwh(hc).toFixed(2), 'Tarif FCFA/kWh': tarif?.tarif_k2_hc, 'Montant FCFA': (sumKwh(hc) * (tarif?.tarif_k2_hc ?? 0)).toFixed(0) },
              { Tranche: 'TOTAL',         'Lectures': lectures.length, 'kWh': sumKwh(lectures).toFixed(2), 'Tarif FCFA/kWh': '—', 'Montant FCFA': (sumKwh(hp) * (tarif?.tarif_k2_hp ?? 0) + sumKwh(hc) * (tarif?.tarif_k2_hc ?? 0)).toFixed(0) },
            ];
          } else if (f.id === 'tcd_horaire') {
            const byHour: Record<number, number> = {};
            for (const r of lectures) {
              const h = new Date(r.timestamp).getHours();
              byHour[h] = (byHour[h] ?? 0) + (r.kwh_total ?? 0);
            }
            rows = Array.from({ length: 24 }, (_, h) => ({ Heure: `${h}h`, 'kWh total': (byHour[h] ?? 0).toFixed(2) }));
          } else if (f.id === 'tcd_mensuel') {
            const byMonthSource: Record<string, Record<string, number>> = {};
            for (const r of lectures) {
              const m = r.timestamp.slice(0, 7);
              const src = r.source_code ?? 'N/A';
              if (!byMonthSource[m]) byMonthSource[m] = {};
              byMonthSource[m][src] = (byMonthSource[m][src] ?? 0) + (r.kwh_total ?? 0);
            }
            rows = Object.entries(byMonthSource).sort().map(([mois, srcs]) => ({ Mois: mois, ...Object.fromEntries(Object.entries(srcs).map(([k, v]) => [k, v.toFixed(2)])) }));
          } else {
            rows = [{ Info: `Feuille "${f.label}" — données non disponibles dans cette version` }];
          }

          if (rows.length) {
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, f.label.slice(0, 31));
          }
        }
      }

      XLSX.writeFile(wb, nomFichier);

      await logExport(organizationId, userId ?? '', {
        iot_site_id:  siteId,
        type_export:  format_,
        nom_fichier:  nomFichier,
        taille_octets: null,
        parametres:   { dateDebut, dateFin, feuilles: [...feuilles] },
      });

      await loadLog();
      toast.success(`Export "${nomFichier}" généré`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur export');
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4">
      {/* Paramètres export */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="text-sm font-medium text-slate-200">Paramètres d'export</div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date début</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date fin</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 h-9"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Format</label>
            <Select value={format_} onValueChange={v => setFormat(v as FormatExport)}>
              <SelectTrigger className="w-28 bg-white/5 border-white/10 text-slate-200 h-9 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">XLSX</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sélection feuilles XLSX */}
        {format_ === 'xlsx' && (
          <div>
            <div className="text-xs text-slate-400 mb-2">Feuilles à inclure</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {FEUILLES_XLSX.map(f => (
                <label key={f.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={feuilles.has(f.id)} onChange={() => toggleFeuille(f.id)}
                    className="accent-blue-500"/>
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleExport} disabled={!!exporting || !siteId}
            className="bg-green-700 hover:bg-green-600 text-white">
            {exporting ? <Loader2 size={14} className="animate-spin mr-2"/> : <Download size={14} className="mr-2"/>}
            {format_ === 'xlsx' ? 'Exporter XLSX' : 'Exporter CSV'}
          </Button>
          {!siteId && <span className="text-xs text-slate-500 self-center">Sélectionnez un site d'abord</span>}
        </div>
      </div>

      {/* Types d'export */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: FileSpreadsheet, label: 'Excel (XLSX)',  desc: 'Multi-feuilles, formules', color: 'text-green-400', available: true },
          { icon: FileText,        label: 'CSV',           desc: 'Données brutes',           color: 'text-blue-400',  available: true },
          { icon: FileText,        label: 'PDF',           desc: 'Rapport graphique',        color: 'text-red-400',   available: false },
          { icon: Image,           label: 'PNG / SVG',     desc: 'Capture graphiques',       color: 'text-purple-400',available: false },
        ].map(e => (
          <div key={e.label} className={`rounded-xl border border-white/10 p-3 ${e.available ? 'bg-white/5' : 'bg-white/3 opacity-50'}`}>
            <e.icon size={20} className={`${e.color} mb-2`}/>
            <div className="text-sm font-medium text-slate-200">{e.label}</div>
            <div className="text-xs text-slate-500">{e.desc}</div>
            {!e.available && <div className="text-[10px] text-slate-600 mt-1">Prochainement</div>}
          </div>
        ))}
      </div>

      {/* Historique */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10 text-sm font-medium text-slate-200">
          Historique des exports
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 p-4">
            <Loader2 size={16} className="animate-spin"/> Chargement…
          </div>
        ) : log.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Aucun export généré.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {log.map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {e.type_export === 'xlsx' ? <FileSpreadsheet size={14} className="text-green-400"/> : <FileText size={14} className="text-blue-400"/>}
                  <div>
                    <div className="text-sm text-slate-200 font-mono">{e.nom_fichier}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(e.generated_at).toLocaleString('fr-FR')}
                      {e.taille_octets && ` · ${(e.taille_octets / 1024).toFixed(1)} Ko`}
                    </div>
                  </div>
                </div>
                <span className={`rounded-full text-[10px] px-2 py-0.5 font-medium ${
                  e.type_export === 'xlsx' ? 'bg-green-900/40 text-green-300' : 'bg-blue-900/40 text-blue-300'
                }`}>
                  {e.type_export.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
