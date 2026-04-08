import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { IotTabProps } from './shared';
import {
  getIotTarifs, createIotTarifFromPreset, updateIotTarif, deleteIotTarif,
  calculerCoutPondere, type IotTarif, type FournisseurPreset,
} from '@/lib/iot-tarifs-service';
import { setTarifActif, getIotSiteById } from '@/lib/iot-sites-service';

const PRESETS: { id: FournisseurPreset; label: string; pays: string }[] = [
  { id: 'Senelec_K2', label: 'Senelec — Tarif K2 MT (industriel)', pays: 'Sénégal' },
  { id: 'Senelec_K1', label: 'Senelec — Tarif K1 BT (résidentiel)', pays: 'Sénégal' },
  { id: 'CIE',        label: 'CIE — HC/HN/HP',                       pays: 'Côte d\'Ivoire' },
  { id: 'SONABEL',    label: 'SONABEL — HC/HP',                       pays: 'Burkina Faso' },
];

export function TarifsTab({ organizationId, userId, siteId }: IotTabProps) {
  const [tarifs, setTarifs]       = useState<IotTarif[]>([]);
  const [tarifActifId, setTarifActifId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarif, setEditTarif] = useState<IotTarif | null>(null);
  const [saving, setSaving]       = useState(false);
  const [preset, setPreset]       = useState<FournisseurPreset>('Senelec_K2');

  // Champs tarif personnalisé
  const [fournisseur, setFournisseur] = useState('');
  const [hp, setHp]   = useState('');
  const [hc, setHc]   = useState('');
  const [tva, setTva] = useState('18');
  const [heureDebutHp, setHeureDebutHp] = useState('19:00');
  const [heureFinHp, setHeureFinHp]     = useState('23:00');

  useEffect(() => { loadAll(); }, [organizationId, siteId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [t, site] = await Promise.all([
        getIotTarifs(organizationId),
        siteId ? getIotSiteById(siteId).catch(() => null) : Promise.resolve(null),
      ]);
      setTarifs(t);
      setTarifActifId(site?.tarif_actif_id ?? null);
    } catch { toast.error('Erreur chargement tarifs'); }
    finally { setLoading(false); }
  }

  async function handleAddPreset() {
    setSaving(true);
    try {
      await createIotTarifFromPreset(organizationId, preset, userId);
      await loadAll();
      toast.success('Tarif ajouté');
    } catch (e: any) { toast.error(e.message ?? 'Erreur'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteIotTarif(id); await loadAll(); toast.success('Tarif supprimé'); }
    catch { toast.error('Erreur'); }
  }

  async function handleSetActif(id: string) {
    if (!siteId) { toast.error('Sélectionner un site d\'abord'); return; }
    try {
      await setTarifActif(siteId, id);
      setTarifActifId(id);
      toast.success('Tarif actif mis à jour');
    } catch { toast.error('Erreur'); }
  }

  async function handleSaveEdit() {
    if (!editTarif) return;
    setSaving(true);
    try {
      await updateIotTarif(editTarif.id, {
        fournisseur, tarif_k2_hp: parseFloat(hp), tarif_k2_hc: parseFloat(hc),
        tva_pct: parseFloat(tva), heure_debut_hp: heureDebutHp + ':00', heure_fin_hp: heureFinHp + ':00',
      });
      setDialogOpen(false);
      await loadAll();
      toast.success('Tarif modifié');
    } catch { toast.error('Erreur'); }
    finally { setSaving(false); }
  }

  function openEdit(t: IotTarif) {
    setEditTarif(t);
    setFournisseur(t.fournisseur);
    setHp(String(t.tarif_k2_hp ?? ''));
    setHc(String(t.tarif_k2_hc ?? ''));
    setTva(String(t.tva_pct ?? 18));
    setHeureDebutHp((t.heure_debut_hp ?? '19:00:00').slice(0, 5));
    setHeureFinHp((t.heure_fin_hp ?? '23:00:00').slice(0, 5));
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Ajouter depuis preset */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-slate-200 mb-3">Ajouter une grille tarifaire</div>
        <div className="flex gap-2 flex-wrap">
          <Select value={preset} onValueChange={v => setPreset(v as FournisseurPreset)}>
            <SelectTrigger className="w-72 bg-white/5 border-white/10 text-slate-200">
              <SelectValue/>
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAddPreset} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <Loader2 size={14} className="animate-spin mr-1"/> : <Plus size={14} className="mr-1"/>} Ajouter
          </Button>
        </div>
      </div>

      {/* Liste des tarifs */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 p-4"><Loader2 size={16} className="animate-spin"/> Chargement…</div>
      ) : tarifs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Aucune grille tarifaire configurée.
        </div>
      ) : (
        <div className="space-y-3">
          {tarifs.map(t => {
            const isActif = t.id === tarifActifId;
            const pondere = t.tarif_k2_hc && t.tarif_k2_hp ? calculerCoutPondere(t) : null;
            return (
              <div key={t.id} className={`rounded-xl border p-4 transition-all ${isActif ? 'border-blue-500/50 bg-blue-950/30' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-200">{t.fournisseur}</span>
                      <span className="text-xs text-slate-500">{t.pays} · {t.symbole_devise}</span>
                      {isActif && <span className="rounded-full bg-blue-600/30 text-blue-300 text-[10px] px-2 py-0.5 font-medium">Actif</span>}
                    </div>
                    {/* Grille tarifaire */}
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {t.tarif_k2_hc && (
                        <div className="flex items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 bg-blue-900/60 text-blue-300 text-[10px]">HC</span>
                          <span className="text-slate-300 font-medium">{t.tarif_k2_hc} {t.symbole_devise}/kWh</span>
                          <span className="text-slate-500">{(t.heure_debut_hp ?? '19:00:00').slice(0,5)}→{(t.heure_fin_hp ?? '23:00:00').slice(0,5)} exclu</span>
                        </div>
                      )}
                      {t.tarif_k2_hp && (
                        <div className="flex items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 bg-amber-900/60 text-amber-300 text-[10px]">HP</span>
                          <span className="text-slate-300 font-medium">{t.tarif_k2_hp} {t.symbole_devise}/kWh</span>
                          <span className="text-slate-500">{(t.heure_debut_hp ?? '19:00:00').slice(0,5)}–{(t.heure_fin_hp ?? '23:00:00').slice(0,5)}</span>
                        </div>
                      )}
                      {t.tarif_k1 && (
                        <div className="flex items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px]">K1</span>
                          <span className="text-slate-300 font-medium">{t.tarif_k1} {t.symbole_devise}/kWh</span>
                        </div>
                      )}
                      {t.tarif_bt_tranche1 && (
                        <div className="flex items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px]">BT1</span>
                          <span className="text-slate-300 font-medium">{t.tarif_bt_tranche1} {t.symbole_devise}/kWh</span>
                        </div>
                      )}
                    </div>
                    {pondere && (
                      <div className="mt-2 text-xs text-slate-400">
                        Moy. pondérée ≈ <strong className="text-slate-200">{pondere.toFixed(0)} {t.symbole_devise}/kWh</strong>
                        {' · '}TVA {t.tva_pct}%
                        {' · '}Coût réel estimé ≈ <strong className="text-slate-200">{Math.round(pondere * 1.18)} {t.symbole_devise}/kWh</strong>
                      </div>
                    )}
                    {t.cout_unitaire_reel && (
                      <div className="mt-1 text-xs text-green-400">
                        Coût réel facture : {t.cout_unitaire_reel.toFixed(2)} {t.symbole_devise}/kWh
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {!isActif && siteId && (
                      <button onClick={() => handleSetActif(t.id)} title="Activer pour ce site"
                        className="rounded-lg border border-blue-500/30 bg-blue-950/40 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-900/60 flex items-center gap-1">
                        <Check size={10}/> Activer
                      </button>
                    )}
                    <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-blue-400"><Pencil size={14}/></button>
                    <button onClick={() => handleDelete(t.id)} className="text-slate-400 hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100">
          <DialogHeader><DialogTitle>Modifier le tarif</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fournisseur</label>
              <Input value={fournisseur} onChange={e => setFournisseur(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tarif HC ({editTarif?.symbole_devise}/kWh)</label>
                <Input type="number" value={hc} onChange={e => setHc(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tarif HP ({editTarif?.symbole_devise}/kWh)</label>
                <Input type="number" value={hp} onChange={e => setHp(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Début HP</label>
                <Input type="time" value={heureDebutHp} onChange={e => setHeureDebutHp(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fin HP</label>
                <Input type="time" value={heureFinHp} onChange={e => setHeureFinHp(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">TVA (%)</label>
                <Input type="number" value={tva} onChange={e => setTva(e.target.value)} className="bg-white/5 border-white/10 text-slate-100"/>
              </div>
            </div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 size={14} className="animate-spin mr-2"/> : null} Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
