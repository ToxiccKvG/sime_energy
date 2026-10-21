import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Building2, Layers, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import { updateAuditBuilding, deleteAuditBuilding } from '@/lib/audit-service';
import { createLevel, getEquipmentByBuilding } from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import { NIVEAU_OPTIONS } from '@/types/inventory';
import { BuildingHoursTab } from '../BuildingHoursTab';
import { BUILDING_TYPES } from '@/constants/building-types';
import type { TreeData } from '@/pages/Inventaire';
import { KpiCard } from './KpiCard';
import { Field, NumInput, SelectInput, TextInput } from './fields';

// ─── BUILDING VIEW ──────────────────────────────────────────────────────────

export function BuildingView({
  buildingId,
  zoneId,
  treeData,
  auditId,
  orgId,
  userId,
  onRefreshLevels,
  onRefreshBuildings,
}: {
  buildingId: string;
  zoneId: string;
  treeData: TreeData;
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshLevels: (buildingId: string) => Promise<void>;
  onRefreshBuildings: (zoneId: string) => Promise<void>;
}) {
  const building = (treeData.buildings[zoneId] ?? []).find(b => b.id === buildingId);
  const levels = treeData.levels[buildingId] ?? [];
  const [activeTab, setActiveTab] = useState<'etages' | 'heures'>('etages');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    building_name: building?.building_name ?? '',
    building_type: building?.building_type ?? '',
    surface_terrain: String(building?.surface_terrain ?? ''),
    surface_batie: String(building?.surface_batie ?? ''),
    surface_toiture: String(building?.surface_toiture ?? ''),
  });
  const [levelForm, setLevelForm] = useState({ name: '', order_index: '0' });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bilanEq, setBilanEq] = useState<{ total: number; totalW: number; kwhAn: number; byCategory: { name: string; color: string; count: number; w: number }[] } | null>(null);

  // Auto-load levels if not yet cached (e.g. when navigating directly to a building)
  useEffect(() => {
    if (treeData.levels[buildingId] === undefined) {
      onRefreshLevels(buildingId);
    }
  }, [buildingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load aggregated bilan for this building on mount
  useEffect(() => {
    getEquipmentByBuilding(buildingId)
      .then(eqs => {
        const totalW = eqs.reduce((s, e) => s + (e.totalPowerW ?? 0), 0);
        const kwhAn = eqs.reduce((s, e) => s + (e.kwhPerYear ?? 0), 0);
        const catMap = new Map<string, { name: string; color: string; count: number; w: number }>();
        eqs.forEach(e => {
          const key = e.categoryName ?? 'Autre';
          const cur = catMap.get(key) ?? { name: key, color: '#6366f1', count: 0, w: 0 };
          catMap.set(key, { ...cur, count: cur.count + 1, w: cur.w + (e.totalPowerW ?? 0) });
        });
        setBilanEq({ total: eqs.length, totalW, kwhAn, byCategory: Array.from(catMap.values()) });
      })
      .catch(() => {/* silent — bilan is optional */});
  }, [buildingId]);

  if (!building) return null;

  const handleUpdateBuilding = async () => {
    setSaving(true);
    try {
      await updateAuditBuilding(buildingId, {
        building_name: editForm.building_name,
        building_type: editForm.building_type || undefined,
        surface_terrain: editForm.surface_terrain ? parseFloat(editForm.surface_terrain) : undefined,
        surface_batie: editForm.surface_batie ? parseFloat(editForm.surface_batie) : undefined,
        surface_toiture: editForm.surface_toiture ? parseFloat(editForm.surface_toiture) : undefined,
      });
      await onRefreshBuildings(zoneId);
      toast.success('Bâtiment mis à jour');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBuilding = async () => {
    try {
      await deleteAuditBuilding(buildingId);
      await onRefreshBuildings(zoneId);
      toast.success('Bâtiment supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
  };

  const handleAddLevel = async () => {
    if (!levelForm.name) {
      toast.error('Sélectionnez un niveau');
      return;
    }
    setSaving(true);
    try {
      await createLevel(
        auditId,
        buildingId,
        levelForm.name,
        parseInt(levelForm.order_index || '0')
      );
      await onRefreshLevels(buildingId);
      await logActivity(
        auditId,
        orgId,
        userId,
        'custom',
        'Étage ajouté',
        `${levelForm.name} ajouté à ${building.building_name}`
      );
      toast.success('Étage créé');
      setLevelForm({ name: '', order_index: '0' });
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur création étage');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Building header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/15">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-slate-100">{building.building_name}</h2>
            {building.building_type && (
              <p className="text-sm text-slate-400">{building.building_type}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
              {building.surface_terrain && <span>Terrain: {building.surface_terrain} m²</span>}
              {building.surface_batie && <span>Bâtie: {building.surface_batie} m²</span>}
              {building.surface_toiture && <span>Toiture: {building.surface_toiture} m²</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bilan énergétique bâtiment */}
      {bilanEq && bilanEq.total > 0 && (
        <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-4 space-y-3 flex-shrink-0">
          <p className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Bilan énergétique bâtiment
          </p>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Équipements" value={bilanEq.total} color="blue" />
            <KpiCard
              label="Puissance totale"
              value={bilanEq.totalW >= 1000 ? formatNumber(bilanEq.totalW / 1000, 2) : formatNumber(bilanEq.totalW, 0)}
              unit={bilanEq.totalW >= 1000 ? 'kW' : 'W'}
              color="amber"
            />
            <KpiCard label="Consommation" value={formatNumber(bilanEq.kwhAn, 0)} unit="kWh/an" color="emerald" />
          </div>
          {bilanEq.byCategory.length > 0 && (
            <div className="space-y-1.5">
              {bilanEq.byCategory.map(c => {
                const pct = bilanEq.totalW > 0 ? (c.w / bilanEq.totalW) * 100 : 0;
                return (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-slate-300 w-32 truncate">{c.name}</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                    <span className="text-slate-400 w-10 text-right">{formatNumber(pct, 0)} %</span>
                    <span className="text-slate-500 w-16 text-right">{formatNumber(c.w, 0)} W</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabs: Étages / Heures de fonctionnement */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-slate-700/50 flex-shrink-0">
          {(['etages', 'heures'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-5 py-3 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'text-slate-100 border-b-2 border-teal-400'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {tab === 'etages' ? `Étages (${levels.length})` : 'Heures de fonctionnement'}
            </button>
          ))}
        </div>

        {/* Tab: Étages */}
        {activeTab === 'etages' && (
          <>
            <div className="flex items-center justify-end px-5 py-3 border-b border-slate-700/30 flex-shrink-0">
              <Button
                size="sm"
                onClick={() => setShowAdd(true)}
                className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ajouter
              </Button>
            </div>
            <div>
              <div className="p-4 space-y-2">
                {levels
                  .slice()
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map(level => (
                    <div
                      key={level.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
                    >
                      <Layers className="w-4 h-4 text-violet-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-200">{level.name}</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        index {level.orderIndex}
                      </span>
                    </div>
                  ))}
                {levels.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    <Layers className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    Aucun étage — ajoutez-en un
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab: Heures de fonctionnement */}
        {activeTab === 'heures' && (
          <div className="p-4">
            <BuildingHoursTab buildingId={buildingId} auditId={auditId} />
          </div>
        )}
      </div>

      {/* Add level dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Nouvel étage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Niveau *">
              <Select
                value={levelForm.name}
                onValueChange={v => setLevelForm(f => ({ ...f, name: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {NIVEAU_OPTIONS.map(n => (
                    <SelectItem key={n} value={n} className="text-slate-100 focus:bg-slate-700/50">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ordre d'affichage">
              <NumInput
                value={levelForm.order_index}
                onChange={v => setLevelForm(f => ({ ...f, order_index: v }))}
                placeholder="0"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleAddLevel}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit building dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Modifier le bâtiment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nom *">
              <TextInput
                value={editForm.building_name}
                onChange={v => setEditForm(f => ({ ...f, building_name: v }))}
              />
            </Field>
            <Field label="Type de bâtiment">
              <SelectInput
                value={editForm.building_type}
                onChange={v => setEditForm(f => ({ ...f, building_type: v }))}
                options={BUILDING_TYPES}
                placeholder="Sélectionner un type…"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Terrain (m²)">
                <NumInput
                  value={editForm.surface_terrain}
                  onChange={v => setEditForm(f => ({ ...f, surface_terrain: v }))}
                />
              </Field>
              <Field label="Bâtie (m²)">
                <NumInput
                  value={editForm.surface_batie}
                  onChange={v => setEditForm(f => ({ ...f, surface_batie: v }))}
                />
              </Field>
              <Field label="Toiture (m²)">
                <NumInput
                  value={editForm.surface_toiture}
                  onChange={v => setEditForm(f => ({ ...f, surface_toiture: v }))}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleUpdateBuilding}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
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
            <AlertDialogTitle className="text-slate-100">Supprimer ce bâtiment ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera définitivement le bâtiment et tous ses étages et pièces.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBuilding}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
