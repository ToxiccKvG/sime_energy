import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { IotTabProps } from './shared';
import {
  getIotSites, createIotSite, type IotSite,
} from '@/lib/iot-sites-service';
import {
  getIotSources, createIotSource, updateIotSource, deleteIotSource, toggleIotSource,
  SOURCE_DEFAULTS, type IotSource, type SourceCode,
} from '@/lib/iot-sources-service';
import { getStatutFlux } from '@/lib/iot-mesures-service';

const SOURCE_CODES: SourceCode[] = ['M1', 'M2', 'M3', 'M4', 'M5'];
const CAPTEURS = ['Shelly 3EM', 'SMA Sunny Portal', 'Fluke', 'Voltcraft', 'DENT Elite Pro', 'Sentinel 8', 'Déduit', 'Autre'];

export function SourcesTab({ organizationId, userId, siteId, onSiteChange }: IotTabProps) {
  const [sites, setSites]       = useState<IotSite[]>([]);
  const [sources, setSources]   = useState<IotSource[]>([]);
  const [statut, setStatut]     = useState<{ actif: boolean; derniere_lecture: string | null; nb_appareils: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [dialogSite, setDialogSite]   = useState(false);
  const [dialogSource, setDialogSource] = useState(false);
  const [editSource, setEditSource]     = useState<IotSource | null>(null);
  const [saving, setSaving]     = useState(false);

  // Formulaire site
  const [nomSite, setNomSite]         = useState('');
  const [shellySite, setShellySite]   = useState('');

  // Formulaire source
  const [srcCode, setSrcCode]     = useState<SourceCode>('M1');
  const [srcDeviceId, setSrcDeviceId] = useState('');
  const [srcNom, setSrcNom]       = useState('');
  const [srcCapteur, setSrcCapteur] = useState('');
  const [srcDeduit, setSrcDeduit] = useState(false);

  useEffect(() => { loadAll(); }, [organizationId, siteId]);

  async function loadAll() {
    setLoading(true);
    try {
      const s = await getIotSites(organizationId);
      setSites(s);
      if (!siteId && s.length > 0) onSiteChange(s[0].id);
      if (siteId) {
        const [src, flux] = await Promise.all([
          getIotSources(siteId),
          getStatutFlux(siteId).catch(() => null),
        ]);
        setSources(src);
        setStatut(flux);
      }
    } catch (e) {
      toast.error('Erreur chargement sources');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSite() {
    if (!nomSite || !shellySite) return;
    setSaving(true);
    try {
      const site = await createIotSite({ organization_id: organizationId, shelly_site_name: shellySite, nom: nomSite }, userId);
      onSiteChange(site.id);
      setDialogSite(false);
      setNomSite(''); setShellySite('');
      await loadAll();
      toast.success('Site créé');
    } catch (e) {
      toast.error('Erreur création site');
    } finally { setSaving(false); }
  }

  function openNewSource() {
    setEditSource(null);
    setSrcCode('M1'); setSrcDeviceId(''); setSrcNom(''); setSrcCapteur(''); setSrcDeduit(false);
    setDialogSource(true);
  }
  function openEditSource(s: IotSource) {
    setEditSource(s);
    setSrcCode(s.code); setSrcDeviceId(s.device_id ?? ''); setSrcNom(s.nom); setSrcCapteur(s.capteur ?? ''); setSrcDeduit(s.est_deduit);
    setDialogSource(true);
  }

  async function handleSaveSource() {
    if (!siteId) return;
    setSaving(true);
    try {
      if (editSource) {
        await updateIotSource(editSource.id, { device_id: srcDeviceId || null, nom: srcNom, capteur: srcCapteur || null, est_deduit: srcDeduit });
      } else {
        await createIotSource({ iot_site_id: siteId, organization_id: organizationId, code: srcCode, device_id: srcDeviceId || undefined, nom: srcNom || undefined, capteur: srcCapteur || undefined, est_deduit: srcDeduit });
      }
      setDialogSource(false);
      await loadAll();
      toast.success(editSource ? 'Source modifiée' : 'Source ajoutée');
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteIotSource(id); await loadAll(); toast.success('Source supprimée'); }
    catch { toast.error('Erreur suppression'); }
  }

  async function handleToggle(s: IotSource) {
    try { await toggleIotSource(s.id, !s.actif); await loadAll(); }
    catch { toast.error('Erreur'); }
  }

  const siteCourant = sites.find(s => s.id === siteId);

  return (
    <div className="space-y-4">
      {/* Sélecteur de site */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={siteId ?? ''} onValueChange={onSiteChange}>
          <SelectTrigger className="w-56 bg-white/5 border-white/10 text-slate-200">
            <SelectValue placeholder="Sélectionner un site…" />
          </SelectTrigger>
          <SelectContent>
            {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="border-white/10 text-slate-300 hover:bg-white/10" onClick={() => setDialogSite(true)}>
          <Plus size={14} className="mr-1" /> Nouveau site
        </Button>
        {statut && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statut.actif ? 'bg-green-900/40 text-green-300' : 'bg-slate-800 text-slate-400'}`}>
            {statut.actif ? <Wifi size={12}/> : <WifiOff size={12}/>}
            {statut.actif ? `Flux actif · ${statut.nb_appareils} appareil(s)` : 'Pas de flux récent'}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 p-4"><Loader2 size={16} className="animate-spin"/> Chargement…</div>
      ) : !siteId ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Créez un site pour configurer les points de mesure M1–M5.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Site Shelly : <span className="font-mono text-slate-300">"{siteCourant?.shelly_site_name}"</span>
            </div>
            <Button size="sm" onClick={openNewSource} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={14} className="mr-1"/> Ajouter source
            </Button>
          </div>

          {/* Grille M1–M5 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SOURCE_CODES.map(code => {
              const src = sources.find(s => s.code === code);
              const def = SOURCE_DEFAULTS[code];
              return (
                <div key={code} className={`rounded-xl border p-4 transition-opacity ${src?.actif === false ? 'opacity-50' : ''}`}
                  style={{ borderColor: src ? src.couleur + '44' : 'rgba(255,255,255,0.1)', background: src ? src.couleur + '11' : 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: src?.couleur ?? '#475569' }}>{code}</span>
                      <div className="mt-1 text-sm font-medium text-slate-200">{src?.nom ?? def.nom}</div>
                      <div className="text-xs text-slate-400">{src?.capteur ?? '—'}</div>
                    </div>
                    {src && (
                      <div className="flex gap-1">
                        <button onClick={() => handleToggle(src)} className="text-slate-400 hover:text-slate-200">
                          {src.actif ? <ToggleRight size={16} className="text-green-400"/> : <ToggleLeft size={16}/>}
                        </button>
                        <button onClick={() => openEditSource(src)} className="text-slate-400 hover:text-blue-400"><Pencil size={14}/></button>
                        <button onClick={() => handleDelete(src.id)} className="text-slate-400 hover:text-red-400"><Trash2 size={14}/></button>
                      </div>
                    )}
                  </div>
                  {src?.device_id && <div className="text-[10px] font-mono text-slate-500 truncate">{src.device_id}</div>}
                  {src?.est_deduit && <div className="mt-1 text-[10px] text-amber-400">Déduit : {code === 'M5' ? 'M2 − M1' : '—'}</div>}
                  {!src && (
                    <button onClick={openNewSource} className="mt-2 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
                      + Configurer
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Dialog nouveau site */}
      <Dialog open={dialogSite} onOpenChange={setDialogSite}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100">
          <DialogHeader><DialogTitle>Nouveau site IoT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nom du site</label>
              <Input value={nomSite} onChange={e => setNomSite(e.target.value)} placeholder="ex: Académie CER2E" className="bg-white/5 border-white/10 text-slate-100"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nom Shelly Cloud (champ "site" exact)</label>
              <Input value={shellySite} onChange={e => setShellySite(e.target.value)} placeholder="ex: Académie CER2E" className="bg-white/5 border-white/10 text-slate-100 font-mono"/>
            </div>
            <Button onClick={handleCreateSite} disabled={saving || !nomSite || !shellySite} className="w-full bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 size={14} className="animate-spin mr-2"/> : null} Créer le site
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog source */}
      <Dialog open={dialogSource} onOpenChange={setDialogSource}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100">
          <DialogHeader><DialogTitle>{editSource ? 'Modifier la source' : 'Nouvelle source'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editSource && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Point de mesure</label>
                <Select value={srcCode} onValueChange={v => setSrcCode(v as SourceCode)}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-slate-200"><SelectValue/></SelectTrigger>
                  <SelectContent>{SOURCE_CODES.map(c => <SelectItem key={c} value={c}>{c} — {SOURCE_DEFAULTS[c].nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nom affiché</label>
              <Input value={srcNom} onChange={e => setSrcNom(e.target.value)} placeholder={SOURCE_DEFAULTS[srcCode].nom} className="bg-white/5 border-white/10 text-slate-100"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Capteur</label>
              <Select value={srcCapteur} onValueChange={setSrcCapteur}>
                <SelectTrigger className="bg-white/5 border-white/10 text-slate-200"><SelectValue placeholder="Sélectionner…"/></SelectTrigger>
                <SelectContent>{CAPTEURS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Device ID Shelly (laisser vide si déduit)</label>
              <Input value={srcDeviceId} onChange={e => setSrcDeviceId(e.target.value)} placeholder="ex: a8032ab1e064" className="bg-white/5 border-white/10 text-slate-100 font-mono"/>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={srcDeduit} onChange={e => setSrcDeduit(e.target.checked)} className="accent-green-500"/>
              Source déduite (M5 = M2 − M1)
            </label>
            <Button onClick={handleSaveSource} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 size={14} className="animate-spin mr-2"/> : null} {editSource ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
