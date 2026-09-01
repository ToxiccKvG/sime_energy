// ============================================================
// IOT MODULE — Paramètres > Canaux multi-relais
// Shelly Cloud ne renvoie qu'un seul device_id pour un appareil
// à plusieurs relais (ex. prise 4 sorties). Cet écran permet de
// définir les canaux virtuels (nom par sortie) sans redéploiement.
// ============================================================

import { useEffect, useState } from 'react';
import { Split, Plus, Trash2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchChannels, upsertChannel, deleteChannel,
  type ShellyDeviceChannel,
} from '@/lib/shelly-device-config-service';
import { fetchAccounts } from '@/lib/shelly-account-service';

interface FormState {
  parent_device_id: string;
  channel_number: string;
  channel_name: string;
  site: string;
}

const EMPTY_FORM: FormState = { parent_device_id: '', channel_number: '', channel_name: '', site: '' };

export function ShellyDeviceChannelsPanel() {
  const [channels, setChannels] = useState<ShellyDeviceChannel[]>([]);
  const [sites, setSites]       = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [form, setForm]         = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, accounts] = await Promise.all([fetchChannels(), fetchAccounts()]);
      setChannels(c);
      setSites(accounts.map(a => a.site));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    const channelNumber = parseInt(form.channel_number, 10);
    if (!form.parent_device_id.trim() || !form.channel_name.trim() || !form.site.trim() || isNaN(channelNumber)) return;
    setSaving(true);
    try {
      await upsertChannel({
        parent_device_id: form.parent_device_id.trim(),
        channel_number: channelNumber,
        channel_name: form.channel_name.trim(),
        site: form.site.trim(),
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteChannel(id);
      setDeleteId(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
            <Split className="h-4 w-4 text-slate-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Canaux multi-relais</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Divisez un dispositif à plusieurs sorties (ex. prise 4 relais) en canaux nommés.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Erreur</p>
            <p className="text-red-400 mt-0.5">{error}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300 h-6 px-2"
            onClick={() => setError(null)}>✕</Button>
        </div>
      )}

      {/* Formulaire ajout */}
      <div className="border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-slate-300 text-sm font-medium">Diviser un dispositif en plusieurs canaux</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="device_id parent (ex: 34987a68c520)" value={form.parent_device_id}
            onChange={e => setForm(f => ({ ...f, parent_device_id: e.target.value }))}
            className="bg-slate-800 border-white/10 text-slate-200 text-sm" />
          <Input placeholder="N° canal (0, 1, 2…)" type="number" value={form.channel_number}
            onChange={e => setForm(f => ({ ...f, channel_number: e.target.value }))}
            className="bg-slate-800 border-white/10 text-slate-200 text-sm" />
          <Input placeholder="Nom du canal (ex: Prise 2)" value={form.channel_name}
            onChange={e => setForm(f => ({ ...f, channel_name: e.target.value }))}
            className="bg-slate-800 border-white/10 text-slate-200 text-sm" />
          <Input placeholder="Site (ex: Ma Maison)" value={form.site} list="shelly-sites"
            onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
            className="bg-slate-800 border-white/10 text-slate-200 text-sm" />
          <datalist id="shelly-sites">
            {sites.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Ajouter le canal
        </Button>
      </div>

      {/* Liste des canaux existants */}
      {loading ? (
        <div className="flex items-center justify-center h-24 text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Chargement…
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 border border-dashed border-white/10 rounded-xl">
          <Split className="h-6 w-6 text-slate-600" />
          <p className="text-slate-400 text-sm">Aucun canal configuré</p>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-400">Device parent</TableHead>
                <TableHead className="text-slate-400">Canal</TableHead>
                <TableHead className="text-slate-400">Nom</TableHead>
                <TableHead className="text-slate-400">Site</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map(c => (
                <TableRow key={c.id} className="border-white/10">
                  <TableCell className="text-white font-mono text-xs">{c.parent_device_id}</TableCell>
                  <TableCell className="text-slate-300 text-sm">{c.channel_number}</TableCell>
                  <TableCell className="text-slate-300 text-sm">{c.channel_name}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{c.site}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(c.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog confirmation suppression */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              Supprimer le canal
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm py-2">
            Le device parent redeviendra une seule ligne de collecte au prochain poll. Cette action est irréversible.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}
              className="text-slate-400 hover:text-white hover:bg-white/5">
              Annuler
            </Button>
            <Button
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
