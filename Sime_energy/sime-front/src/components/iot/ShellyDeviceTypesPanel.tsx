// ============================================================
// IOT MODULE — Paramètres > Types de dispositifs
// Classification des types de matériel Shelly (device_type → family).
// Remplace la nécessité de coder en dur un nouveau type Shelly :
// dès qu'un type inconnu apparaît dans la collecte, il se retrouve
// ici pour classification en un clic.
// ============================================================

import { useEffect, useState } from 'react';
import { Tag, RefreshCw, XCircle, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchDeviceTypes, upsertDeviceType, deleteDeviceType,
  fetchUnclassifiedDeviceTypes,
  DEVICE_FAMILIES,
  type ShellyDeviceType, type UnclassifiedDeviceType, type DeviceFamily,
} from '@/lib/shelly-device-config-service';

export function ShellyDeviceTypesPanel() {
  const [types, setTypes]             = useState<ShellyDeviceType[]>([]);
  const [unclassified, setUnclassified] = useState<UnclassifiedDeviceType[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState<string | null>(null); // device_type en cours de sauvegarde
  const [pendingFamily, setPendingFamily] = useState<Record<string, DeviceFamily>>({});
  const [deleteId, setDeleteId]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, u] = await Promise.all([fetchDeviceTypes(), fetchUnclassifiedDeviceTypes()]);
      setTypes(t);
      setUnclassified(u);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleClassify(deviceType: string) {
    const family = pendingFamily[deviceType];
    if (!family) return;
    setSaving(deviceType);
    try {
      await upsertDeviceType({ device_type: deviceType, device_family: family, label: null, match_prefix: false });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleFamilyChange(t: ShellyDeviceType, family: DeviceFamily) {
    setSaving(t.device_type);
    try {
      await upsertDeviceType({ device_type: t.device_type, device_family: family, label: t.label, match_prefix: t.match_prefix });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleTogglePrefix(t: ShellyDeviceType) {
    setSaving(t.device_type);
    try {
      await upsertDeviceType({ device_type: t.device_type, device_family: t.device_family, label: t.label, match_prefix: !t.match_prefix });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDeviceType(id);
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
            <Tag className="h-4 w-4 text-slate-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Types de dispositifs</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Classifiez un nouveau type de matériel Shelly sans redéploiement.
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

      {/* Types non classifiés */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h3 className="text-slate-200 font-medium text-sm">
            Types non classifiés {unclassified.length > 0 && <span className="text-amber-400">({unclassified.length})</span>}
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24 text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Chargement…
          </div>
        ) : unclassified.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl p-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Aucun type non classifié détecté.
          </div>
        ) : (
          <div className="border border-amber-500/20 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-400">Type Shelly</TableHead>
                  <TableHead className="text-slate-400">Exemple</TableHead>
                  <TableHead className="text-slate-400">Sites</TableHead>
                  <TableHead className="text-slate-400">Famille à assigner</TableHead>
                  <TableHead className="text-slate-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unclassified.map(u => (
                  <TableRow key={u.device_type} className="border-white/10">
                    <TableCell className="text-white font-mono text-xs">{u.device_type}</TableCell>
                    <TableCell className="text-slate-300 text-sm">{u.example_name}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{u.sites.join(', ')}</TableCell>
                    <TableCell>
                      <Select
                        value={pendingFamily[u.device_type]}
                        onValueChange={(v) => setPendingFamily(prev => ({ ...prev, [u.device_type]: v as DeviceFamily }))}
                      >
                        <SelectTrigger className="h-8 w-48 bg-slate-800 border-white/10 text-slate-200 text-xs">
                          <SelectValue placeholder="Choisir une famille" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEVICE_FAMILIES.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!pendingFamily[u.device_type] || saving === u.device_type}
                        onClick={() => handleClassify(u.device_type)}
                        className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                        {saving === u.device_type ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Assigner'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Types déjà classifiés */}
      <div>
        <h3 className="text-slate-200 font-medium text-sm mb-3">Types classifiés ({types.length})</h3>
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-400">Type Shelly</TableHead>
                <TableHead className="text-slate-400">Famille</TableHead>
                <TableHead className="text-slate-400">Correspondance préfixe</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map(t => (
                <TableRow key={t.id} className="border-white/10">
                  <TableCell className="text-white font-mono text-xs">{t.device_type}</TableCell>
                  <TableCell>
                    <Select value={t.device_family} onValueChange={(v) => handleFamilyChange(t, v as DeviceFamily)}>
                      <SelectTrigger className="h-8 w-48 bg-slate-800 border-white/10 text-slate-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICE_FAMILIES.map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`cursor-pointer ${t.match_prefix ? 'bg-blue-600/20 text-blue-300 border-blue-500/30' : 'bg-slate-700/50 text-slate-400 border-slate-600/50'}`}
                      onClick={() => handleTogglePrefix(t)}
                    >
                      {t.match_prefix ? 'Préfixe activé' : 'Correspondance exacte'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(t.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog confirmation suppression */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              Supprimer la classification
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm py-2">
            Ce type de dispositif redeviendra "non classifié" au prochain poll qui le détecte. Cette action est irréversible.
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
