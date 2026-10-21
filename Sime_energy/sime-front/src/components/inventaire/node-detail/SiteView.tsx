import { useState } from 'react';
import { Plus, Loader2, Building2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createZone } from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import type { TreeData } from '@/pages/Inventaire';
import { Field, TextInput } from './fields';

// ─── SITE VIEW ──────────────────────────────────────────────────────────────

export function SiteView({
  siteId,
  treeData,
  auditId,
  orgId,
  userId,
  onRefreshZones,
}: {
  siteId: string;
  treeData: TreeData;
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshZones: (siteId: string) => Promise<void>;
}) {
  const site = treeData.sites.find(s => s.id === siteId);
  const zones = treeData.zones[siteId] ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  if (!site) return null;

  const handleAddZone = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom de la zone est requis');
      return;
    }
    setSaving(true);
    try {
      await createZone(auditId, siteId, form.name, form.description || undefined);
      await onRefreshZones(siteId);
      await logActivity(auditId, orgId, userId, 'custom', 'Zone ajoutée', `${form.name} ajoutée au site ${site.name}`);
      toast.success('Zone créée');
      setForm({ name: '', description: '' });
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur création zone');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Site header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15">
            <MapPin className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-slate-100">{site.name}</h2>
            {site.address && <p className="text-sm text-slate-400 mt-0.5">{site.address}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className={cn(
                  'border-0 text-xs',
                  site.status === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : site.status === 'in_progress'
                    ? 'bg-blue-500/15 text-blue-300'
                    : 'bg-slate-500/15 text-slate-400'
                )}
              >
                {site.status === 'completed'
                  ? 'Terminé'
                  : site.status === 'in_progress'
                  ? 'En cours'
                  : 'Planifié'}
              </Badge>
              <span className="text-xs text-slate-500">
                {zones.length} zone{zones.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Zones list */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-400" />
            Zones
          </h3>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>

        <div>
          <div className="p-4 space-y-2">
            {zones.map(z => (
              <div
                key={z.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
              >
                <Building2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{z.name}</p>
                  {z.description && (
                    <p className="text-xs text-slate-500">{z.description}</p>
                  )}
                </div>
              </div>
            ))}
            {zones.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Building2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Aucune zone — ajoutez-en une
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add zone dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Nouvelle zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nom de la zone *">
              <TextInput
                value={form.name}
                onChange={v => setForm(f => ({ ...f, name: v }))}
                placeholder="ex: Zone Maternité, Bloc Opératoire…"
              />
            </Field>
            <Field label="Description">
              <TextInput
                value={form.description}
                onChange={v => setForm(f => ({ ...f, description: v }))}
                placeholder="Optionnel"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleAddZone}
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
