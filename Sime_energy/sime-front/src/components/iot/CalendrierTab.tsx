import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { IotTabProps } from './shared';
import { getFeries, addFerie, deleteFerie, initFeriesSenegal, type IotFerie } from '@/lib/iot-calendrier-service';

const TYPE_COLORS: Record<string, string> = {
  fixe:      'bg-blue-900/40 text-blue-300',
  variable:  'bg-amber-900/40 text-amber-300',
  evenement: 'bg-slate-700 text-slate-300',
};

export function CalendrierTab({ organizationId, siteId }: IotTabProps) {
  const [feries, setFeries]   = useState<IotFerie[]>([]);
  const [loading, setLoading] = useState(true);
  const [initing, setIniting] = useState(false);
  // Formulaire ajout
  const [date, setDate]       = useState('');
  const [nom, setNom]         = useState('');
  const [type, setType]       = useState<'fixe' | 'variable' | 'evenement'>('variable');
  const [saving, setSaving]   = useState(false);

  useEffect(() => { load(); }, [organizationId, siteId]);

  async function load() {
    setLoading(true);
    try {
      const f = await getFeries(organizationId, siteId ?? undefined);
      setFeries(f);
    } catch { toast.error('Erreur chargement calendrier'); }
    finally { setLoading(false); }
  }

  async function handleInit() {
    setIniting(true);
    try {
      await initFeriesSenegal(organizationId);
      await load();
      toast.success('Fériés sénégalais initialisés');
    } catch { toast.error('Erreur'); }
    finally { setIniting(false); }
  }

  async function handleAdd() {
    if (!date || !nom) return;
    setSaving(true);
    try {
      await addFerie(organizationId, { date_ferie: date, nom, type_ferie: type, iot_site_id: siteId ?? undefined });
      setDate(''); setNom('');
      await load();
      toast.success('Jour férié ajouté');
    } catch (e: any) { toast.error(e.message ?? 'Erreur'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteFerie(id); await load(); toast.success('Supprimé'); }
    catch { toast.error('Erreur'); }
  }

  // Grouper par type
  const fixes    = feries.filter(f => f.type_ferie === 'fixe');
  const variables = feries.filter(f => f.type_ferie === 'variable');
  const events   = feries.filter(f => f.type_ferie === 'evenement');

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleInit} disabled={initing}
          className="border-white/10 text-slate-300 hover:bg-white/10">
          {initing ? <Loader2 size={14} className="animate-spin mr-1"/> : <CalendarDays size={14} className="mr-1"/>}
          Initialiser fériés Sénégal {new Date().getFullYear()}
        </Button>
      </div>

      {/* Formulaire ajout */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-slate-200 mb-3">Ajouter un jour férié ou événement</div>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-white/5 border-white/10 text-slate-100 w-40"/>
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs text-slate-400 mb-1 block">Nom</label>
            <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Korité 2026" className="bg-white/5 border-white/10 text-slate-100"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type</label>
            <select value={type} onChange={e => setType(e.target.value as typeof type)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 h-9">
              <option value="fixe">Fixe</option>
              <option value="variable">Variable</option>
              <option value="evenement">Événement</option>
            </select>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving || !date || !nom} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
          </Button>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 p-4"><Loader2 size={16} className="animate-spin"/> Chargement…</div>
      ) : feries.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
          Aucun jour férié configuré. Cliquez "Initialiser fériés Sénégal" pour commencer.
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: 'Jours fériés fixes', items: fixes },
            { label: 'Jours fériés variables (Islam, Pâques…)', items: variables },
            { label: 'Événements exceptionnels', items: events },
          ].map(({ label, items }) => items.length > 0 && (
            <div key={label}>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{label}</div>
              <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
                {items.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-slate-300">{f.date_ferie}</span>
                      <span className="text-sm text-slate-200">{f.nom}</span>
                      <span className={`rounded-full text-[10px] px-2 py-0.5 font-medium ${TYPE_COLORS[f.type_ferie]}`}>
                        {f.type_ferie}
                      </span>
                      {f.recurrent && <span className="text-[10px] text-slate-500">↻ récurrent</span>}
                    </div>
                    <button onClick={() => handleDelete(f.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        <strong className="text-slate-300">Impact HP/HC :</strong> Les jours fériés sont classifiés "Jour férié" dans toutes les analyses. Ils peuvent être exclus des simulations ou traités comme jours chômés dans le profil de charge.
      </div>
    </div>
  );
}
