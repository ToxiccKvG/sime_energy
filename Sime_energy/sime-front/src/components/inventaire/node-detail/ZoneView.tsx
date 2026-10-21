import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { createAuditBuilding } from '@/lib/audit-service';
import { updateZone, deleteZone } from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import { BUILDING_TYPES } from '@/constants/building-types';
import type { TreeData } from '@/pages/Inventaire';
import type { InventoryZone } from '@/types/inventory';
import { Field, NumInput, SelectInput, TextInput } from './fields';

// ─── ZONE VIEW ──────────────────────────────────────────────────────────────

export function ZoneView({
  zoneId,
  siteId,
  treeData,
  auditId,
  orgId,
  userId,
  onRefreshBuildings,
  onRefreshZones,
}: {
  zoneId: string;
  siteId: string;
  treeData: TreeData;
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshBuildings: (zoneId: string) => Promise<void>;
  onRefreshZones: (siteId: string) => Promise<void>;
}) {
  const zone: InventoryZone | undefined = (treeData.zones[siteId] ?? []).find(z => z.id === zoneId);
  const buildings = treeData.buildings[zoneId] ?? [];
  const site = treeData.sites.find(s => s.id === siteId);
  const [showAdd, setShowAdd] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buildingForm, setBuildingForm] = useState({
    building_name: '',
    building_type: '',
    surface_terrain: '',
    surface_batie: '',
    surface_toiture: '',
  });
  const [editForm, setEditForm] = useState({ name: zone?.name ?? '', description: zone?.description ?? '' });

  if (!zone) return null;

  const handleAddBuilding = async () => {
    if (!buildingForm.building_name.trim()) {
      toast.error('Le nom du bâtiment est requis');
      return;
    }
    if (!buildingForm.building_type) {
      toast.error('Le type de bâtiment est requis');
      return;
    }
    setSaving(true);
    try {
      await createAuditBuilding(siteId, auditId, {
        building_name: buildingForm.building_name,
        building_type: buildingForm.building_type,
        surface_terrain: buildingForm.surface_terrain ? parseFloat(buildingForm.surface_terrain) : undefined,
        surface_batie: buildingForm.surface_batie ? parseFloat(buildingForm.surface_batie) : undefined,
        surface_toiture: buildingForm.surface_toiture ? parseFloat(buildingForm.surface_toiture) : undefined,
        zone_id: zoneId,
      });
      await onRefreshBuildings(zoneId);
      await logActivity(auditId, orgId, userId, 'custom', 'Bâtiment ajouté', `${buildingForm.building_name} ajouté à ${zone.name}`);
      toast.success('Bâtiment créé');
      setBuildingForm({ building_name: '', building_type: '', surface_terrain: '', surface_batie: '', surface_toiture: '' });
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur création bâtiment');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateZone = async () => {
    setSaving(true);
    try {
      await updateZone(zoneId, { name: editForm.name, description: editForm.description || undefined });
      await onRefreshZones(siteId);
      toast.success('Zone mise à jour');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async () => {
    try {
      await deleteZone(zoneId);
      await onRefreshZones(siteId);
      toast.success('Zone supprimée');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Zone header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-teal-500/15">
            <Building2 className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-slate-100">{zone.name}</h2>
            {zone.description && <p className="text-sm text-slate-400 mt-0.5">{zone.description}</p>}
            {site && <p className="text-xs text-slate-500 mt-1">Site : {site.name}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)} className="h-7 w-7 p-0 text-slate-400 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Buildings list */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            Bâtiments
          </h3>
          <Button size="sm" onClick={() => setShowAdd(true)} className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>
        <div className="p-4 space-y-2">
          {buildings.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
              <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{b.building_name}</p>
                {b.building_type && <p className="text-xs text-slate-500">{b.building_type}</p>}
              </div>
              {b.surface_batie && <span className="text-xs text-slate-500">{b.surface_batie} m²</span>}
            </div>
          ))}
          {buildings.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Building2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Aucun bâtiment — ajoutez-en un
            </div>
          )}
        </div>
      </div>

      {/* Add building dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Nouveau bâtiment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nom du bâtiment *">
              <TextInput value={buildingForm.building_name} onChange={v => setBuildingForm(f => ({ ...f, building_name: v }))} placeholder="ex: Bâtiment A" />
            </Field>
            <Field label="Type de bâtiment *">
              <SelectInput value={buildingForm.building_type} onChange={v => setBuildingForm(f => ({ ...f, building_type: v }))} options={BUILDING_TYPES} placeholder="Sélectionner un type…" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Surface terrain (m²)">
                <NumInput value={buildingForm.surface_terrain} onChange={v => setBuildingForm(f => ({ ...f, surface_terrain: v }))} placeholder="0" />
              </Field>
              <Field label="Surface bâtie (m²)">
                <NumInput value={buildingForm.surface_batie} onChange={v => setBuildingForm(f => ({ ...f, surface_batie: v }))} placeholder="0" />
              </Field>
              <Field label="Surface toiture (m²)">
                <NumInput value={buildingForm.surface_toiture} onChange={v => setBuildingForm(f => ({ ...f, surface_toiture: v }))} placeholder="0" />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400">Annuler</Button>
            <Button onClick={handleAddBuilding} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit zone dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Modifier la zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nom *">
              <TextInput value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder="ex: Zone Maternité" />
            </Field>
            <Field label="Description">
              <TextInput value={editForm.description} onChange={v => setEditForm(f => ({ ...f, description: v }))} placeholder="Optionnel" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-slate-400">Annuler</Button>
            <Button onClick={handleUpdateZone} disabled={saving} className="bg-teal-600 hover:bg-teal-500 text-white">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-[#1a1d2e] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer cette zone ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tous les bâtiments, étages, pièces et équipements de cette zone seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteZone} className="bg-red-600 hover:bg-red-500 text-white">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
