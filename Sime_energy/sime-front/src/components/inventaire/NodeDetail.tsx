import { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  Layers,
  LayoutGrid,
  MapPin,
  Zap,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNumber, formatEnergy } from '@/lib/format';
import {
  createAuditBuilding,
  updateAuditBuilding,
  deleteAuditBuilding,
} from '@/lib/audit-service';
import {
  createZone,
  updateZone,
  deleteZone,
  createLevel,
  updateLevel,
  deleteLevel,
  createRoom,
  updateRoom,
  deleteRoom,
  getEquipmentByRoom,
  getEquipmentByBuilding,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  createCategory,
  getBuildingTypeParams,
} from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import {
  NIVEAU_OPTIONS,
  FUNCTIONAL_TYPES,
  BuildingTypeParams,
  getHourCategoryForEquipment,
  calculateHoursParametric,
} from '@/types/inventory';
import { BuildingHoursTab } from './BuildingHoursTab';

const BUILDING_TYPES = [
  'Administratif',
  'Industriel / Usine',
  'Commercial / Retail',
  'Hôtel / Hébergement',
  'Hôpital / Clinique',
  'École / Université',
  'Résidentiel',
  'Entrepôt / Logistique',
  'Restauration',
  'Sport / Loisirs',
  'Atelier / Maintenance',
  'Mixte',
  'Autre',
];

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
        <SelectValue placeholder={placeholder ?? 'Sélectionner…'} />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1d2e] border-slate-700">
        {options.map(o => (
          <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
import type { SelectionNode, TreeData } from '@/pages/Inventaire';
import type { InventoryEquipment, EquipmentCategory, InventoryZone } from '@/types/inventory';

interface NodeDetailProps {
  selection: SelectionNode | null;
  treeData: TreeData;
  categories: EquipmentCategory[];
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshZones: (siteId: string) => Promise<void>;
  onRefreshBuildings: (zoneId: string) => Promise<void>;
  onRefreshLevels: (buildingId: string) => Promise<void>;
  onRefreshRooms: (levelId: string) => Promise<void>;
}

// ─── Shared form field helpers ─────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-300 text-sm">{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500"
    />
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500"
    />
  );
}

function ComputedField({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-emerald-400">
        {value} {unit}
      </span>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#1a1d2e] border border-slate-700/50 rounded-xl">
      <div className="text-center text-slate-500">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">Sélectionner un élément</p>
        <p className="text-xs mt-1 text-slate-600">Cliquez sur un site, bâtiment, étage ou pièce</p>
      </div>
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'violet';
}) {
  const colors = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
  };
  return (
    <div className={cn('rounded-xl border p-4', colors[color])}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal ml-1 text-slate-400">{unit}</span>}
      </p>
    </div>
  );
}

// ─── SITE VIEW ──────────────────────────────────────────────────────────────

function SiteView({
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

// ─── ZONE VIEW ──────────────────────────────────────────────────────────────

function ZoneView({
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
    setSaving(true);
    try {
      await createAuditBuilding(siteId, auditId, {
        building_name: buildingForm.building_name,
        building_type: buildingForm.building_type || undefined,
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
            <Field label="Type de bâtiment">
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

// ─── BUILDING VIEW ──────────────────────────────────────────────────────────

function BuildingView({
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

// ─── LEVEL VIEW ──────────────────────────────────────────────────────────────

function LevelView({
  levelId,
  buildingId,
  treeData,
  auditId,
  orgId,
  userId,
  onRefreshRooms,
  onRefreshLevels,
}: {
  levelId: string;
  buildingId: string;
  treeData: TreeData;
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshRooms: (levelId: string) => Promise<void>;
  onRefreshLevels: (buildingId: string) => Promise<void>;
}) {
  const level = (treeData.levels[buildingId] ?? []).find(l => l.id === levelId);
  const rooms = treeData.rooms[levelId] ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState({ code: '', service: '', surfaceM2: '', typeFonctionnel: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: level?.name ?? '',
    orderIndex: String(level?.orderIndex ?? 0),
  });

  if (!level) return null;

  const handleAddRoom = async () => {
    if (!roomForm.code.trim()) {
      toast.error('Le code de pièce est requis');
      return;
    }
    setSaving(true);
    try {
      await createRoom(auditId, levelId, {
        code: roomForm.code,
        service: roomForm.service || undefined,
        surfaceM2: roomForm.surfaceM2 ? parseFloat(roomForm.surfaceM2) : undefined,
        typeFonctionnel: roomForm.typeFonctionnel || undefined,
      });
      await onRefreshRooms(levelId);
      await logActivity(
        auditId,
        orgId,
        userId,
        'custom',
        'Pièce ajoutée',
        `${roomForm.code} ajoutée à l'étage ${level.name}`
      );
      toast.success('Pièce créée');
      setRoomForm({ code: '', service: '', surfaceM2: '', typeFonctionnel: '' });
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur création pièce');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLevel = async () => {
    setSaving(true);
    try {
      await updateLevel(levelId, {
        name: editForm.name,
        orderIndex: parseInt(editForm.orderIndex || '0'),
      });
      await onRefreshLevels(buildingId);
      toast.success('Étage mis à jour');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLevel = async () => {
    try {
      await deleteLevel(levelId);
      await onRefreshLevels(buildingId);
      toast.success('Étage supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Level header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/15">
            <Layers className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-100">Étage {level.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {rooms.length} pièce{rooms.length !== 1 ? 's' : ''}
            </p>
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

      {/* Rooms list */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-amber-400" />
            Pièces
          </h3>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>

        <div>
          <div className="p-4 space-y-2">
            {rooms.map(room => (
              <div
                key={room.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
              >
                <LayoutGrid className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium text-slate-200">{room.code}</p>
                  {room.service && (
                    <p className="text-xs text-slate-500">{room.service}</p>
                  )}
                </div>
                {room.surfaceM2 && (
                  <span className="text-xs text-slate-500">{room.surfaceM2} m²</span>
                )}
              </div>
            ))}
            {rooms.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                <LayoutGrid className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Aucune pièce — ajoutez-en une
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add room dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Nouvelle pièce</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Code pièce *" hint="ex: A1P1, BUR-01, LABO-3">
              <TextInput
                value={roomForm.code}
                onChange={v => setRoomForm(f => ({ ...f, code: v }))}
                placeholder="ex: A1P1"
              />
            </Field>
            <Field label="Service / Affectation">
              <TextInput
                value={roomForm.service}
                onChange={v => setRoomForm(f => ({ ...f, service: v }))}
                placeholder="ex: Comptabilité, Réception…"
              />
            </Field>
            <Field label="Surface (m²)">
              <NumInput
                value={roomForm.surfaceM2}
                onChange={v => setRoomForm(f => ({ ...f, surfaceM2: v }))}
                placeholder="0"
              />
            </Field>
            <Field label="Type fonctionnel" hint="Permet le calcul automatique des heures de fonctionnement">
              <Select
                value={roomForm.typeFonctionnel}
                onValueChange={v => setRoomForm(f => ({ ...f, typeFonctionnel: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {FUNCTIONAL_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleAddRoom}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit level dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Modifier l'étage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Niveau">
              <Select
                value={editForm.name}
                onValueChange={v => setEditForm(f => ({ ...f, name: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue />
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleUpdateLevel}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
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
            <AlertDialogTitle className="text-slate-100">Supprimer cet étage ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Toutes les pièces et équipements de cet étage seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLevel}
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

// ─── EQUIPMENT FORM (dynamic per category) ──────────────────────────────────

interface EqFormState {
  categoryId: string;   // resolved group ID (visualization + form detection)
  groupeNom: string;    // group name — also drives which technical fields appear
  name: string;
  brand: string;
  model: string;
  numSerie: string;
  anneeFab: string;
  status: 'EN service' | 'Hors Service';
  service: string;      // service/local de l'équipement (per-equipment)
  nomOccupant: string;  // occupant/responsable
  powerW: string;
  quantity: string;
  facteurUtilisation: string; // 0–1, default 1 — usage pattern coefficient
  // Heures — two modes: direct heuresAn OR heuresJour × joursEffectifs
  heuresAn: string;
  heuresJour: string;
  joursEffectifs: string;
  tauxCharge: string;    // % load factor (FORCE MOTRICE only)
  // ÉCLAIRAGE
  typeLuminaire: string;     // description libre du type
  typeReflecteur: string;    // type de réflecteur
  technologie: string;
  nbLuminaires: string;
  lampesParLuminaire: string;
  hauteurFixation: string;
  eclairement: string;
  surfaceLocale: string;
  // APPAREILS DIVERS
  categorieMeta: string;
  surfaceM2: string;
  volumeM3: string;
  weekend: boolean;
  feries: boolean;
  caracteristiquesTechniques: string;
  // CLIM
  technologieClim: string;
  btu: string;
  modePose: string;
  reglageConsigne: string;   // température de consigne
  surfaceClim: string;
  volumeM3Clim: string;      // volume climatisé m³
  // FORCE MOTRICE
  rendementMoteur: string;   // η %
  facteurPuissance: string;  // cos φ
  typeMoteur: string;
  // VENTILATION
  debitAir: string;   // m³/h
  pressionPa: string; // Pa
  typeVentil: string;
  // ALIMENTATIONS
  typeSource: string;
  tableauElectrique: string;
}

const emptyEqForm = (): EqFormState => ({
  categoryId: '',
  groupeNom: '',
  name: '',
  brand: '',
  model: '',
  numSerie: '',
  anneeFab: '',
  status: 'EN service',
  service: '',
  nomOccupant: '',
  powerW: '',
  quantity: '1',
  facteurUtilisation: '1',
  heuresAn: '',
  heuresJour: '',
  joursEffectifs: '',
  tauxCharge: '',
  typeLuminaire: '',
  typeReflecteur: '',
  technologie: '',
  nbLuminaires: '',
  lampesParLuminaire: '1',
  hauteurFixation: '',
  eclairement: '',
  surfaceLocale: '',
  categorieMeta: '',
  surfaceM2: '',
  volumeM3: '',
  weekend: false,
  feries: false,
  caracteristiquesTechniques: '',
  technologieClim: '',
  btu: '',
  modePose: '',
  reglageConsigne: '',
  surfaceClim: '',
  volumeM3Clim: '',
  rendementMoteur: '',
  facteurPuissance: '',
  typeMoteur: '',
  debitAir: '',
  pressionPa: '',
  typeVentil: '',
  typeSource: '',
  tableauElectrique: '',
});

function EquipmentFormFields({
  form,
  onChange,
  categories,
  formSubmitted,
}: {
  form: EqFormState;
  onChange: (updates: Partial<EqFormState>) => void;
  categories: EquipmentCategory[];
  formSubmitted?: boolean;
}) {
  const gNom = form.groupeNom.toUpperCase();
  const isEclairage = gNom.includes('CLAIRAGE');
  const isClim = gNom.includes('CLIM');
  const isAppareils = gNom.includes('DIVERS') || gNom.includes('APPAREILS');
  const isPedago = gNom.includes('DAGOGIQUE') || gNom.includes('PÉDAGO');
  const isForcemotrice = gNom.includes('FORCE') || gNom.includes('MOTRICE');
  const isVentil = gNom.includes('VENTIL');
  const isAlim = gNom.includes('ALIM');

  // Effective heuresAn — either direct input OR heuresJour × joursEffectifs
  const effectiveHeuresAn = (form.heuresJour && form.joursEffectifs)
    ? (parseFloat(form.heuresJour) || 0) * (parseFloat(form.joursEffectifs) || 0)
    : (parseFloat(form.heuresAn) || 0);

  const facteurUtil = Math.min(1, Math.max(0, parseFloat(form.facteurUtilisation) || 1));

  // Computed for ÉCLAIRAGE (1 lampe par luminaire par défaut)
  const nbLampesTotal = isEclairage
    ? (parseInt(form.nbLuminaires || '0') || 0)
    : 0;
  const eclTotalW = isEclairage
    ? (parseFloat(form.powerW || '0') || 0) * nbLampesTotal * facteurUtil
    : 0;
  const eclKwh = eclTotalW > 0 && effectiveHeuresAn > 0
    ? (eclTotalW / 1000) * effectiveHeuresAn
    : 0;

  // Computed for others
  const genericTotalW =
    (parseFloat(form.powerW || '0') || 0) * (parseFloat(form.quantity || '1') || 1) * facteurUtil;
  const genericKwh = genericTotalW > 0 && effectiveHeuresAn > 0
    ? (genericTotalW / 1000) * effectiveHeuresAn
    : 0;

  // FORCE MOTRICE specific
  const fmRendement = (parseFloat(form.rendementMoteur) || 100) / 100;
  const fmTauxCharge = (parseFloat(form.tauxCharge) || 100) / 100;
  const fmPowerKw = (parseFloat(form.powerW) || 0) / 1000;
  const fmTotalW = fmPowerKw * 1000 * fmTauxCharge * (parseFloat(form.quantity) || 1) * facteurUtil;
  const fmKwh = fmPowerKw > 0 && effectiveHeuresAn > 0
    ? fmPowerKw * fmTauxCharge * (1 / fmRendement) * effectiveHeuresAn * (parseFloat(form.quantity) || 1) * facteurUtil
    : 0;

  // CLIM auto-calculations
  const climQty = parseFloat(form.quantity) || 1;
  const climBtu = parseFloat(form.btu) || 0;
  const climElecW = parseFloat(form.powerW) || 0;
  const climPuissanceFrigoW = climBtu * climQty * 0.29307; // BTU/h → W
  const climElecTotaleW = climElecW * climQty * facteurUtil;
  const climCOP = climElecTotaleW > 0 ? climPuissanceFrigoW / (climElecW * climQty) : 0;
  const climKwh = climElecTotaleW > 0 && effectiveHeuresAn > 0
    ? (climElecTotaleW / 1000) * effectiveHeuresAn : 0;

  const inputCls = 'bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500';
  const f = (label: string, el: React.ReactNode, hint?: string) => (
    <Field label={label} hint={hint}>
      {el}
    </Field>
  );

  return (
    <div className="space-y-4">
      {/* Groupe — manager-defined, also drives which technical fields appear */}
      <Field
        label="Catégorie *"
        error={formSubmitted && !form.groupeNom.trim() ? 'La catégorie est requise' : undefined}
        hint={!formSubmitted && !form.categoryId
          ? (form.groupeNom.trim() ? 'Nouveau groupe — sera créé à la sauvegarde' : 'Choisissez un groupe existant ou tapez un nouveau nom')
          : undefined}
      >
        <Input
          value={form.groupeNom}
          onChange={e => {
            const nom = e.target.value;
            const existing = categories.find(c => c.name.toLowerCase() === nom.toLowerCase());
            onChange({ groupeNom: nom, categoryId: existing?.id ?? '' });
          }}
          list="groupes-datalist"
          placeholder="ex: CONFORT, ÉCLAIRAGE, BUREAUTIQUE…"
          className={`${inputCls} ${formSubmitted && !form.groupeNom.trim() ? 'border-red-500/60' : ''}`}
        />
        <datalist id="groupes-datalist">
          {categories.map(c => <option key={c.id} value={c.name} />)}
        </datalist>
      </Field>

      {/* Common fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field
            label="Nom de l'équipement *"
            error={formSubmitted && !form.name.trim() ? 'Le nom est requis' : undefined}
          >
            <Input
              value={form.name}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="ex: Luminaire LED bureau 201"
              className={`${inputCls} ${formSubmitted && !form.name.trim() ? 'border-red-500/60' : ''}`}
            />
          </Field>
        {f(
          'Marque',
          <Input
            value={form.brand}
            onChange={e => onChange({ brand: e.target.value })}
            placeholder="ex: Philips"
            className={inputCls}
          />
        )}
        {f(
          'Modèle / Référence',
          <Input
            value={form.model}
            onChange={e => onChange({ model: e.target.value })}
            placeholder="ex: TL5-28W"
            className={inputCls}
          />
        )}
        {f(
          'Année de fabrication',
          <Input
            type="number"
            value={form.anneeFab}
            onChange={e => onChange({ anneeFab: e.target.value })}
            placeholder="ex: 2018"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'État',
          <Select
            value={form.status}
            onValueChange={v => onChange({ status: v as EqFormState['status'] })}
          >
            <SelectTrigger className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-slate-700">
              <SelectItem value="EN service" className="text-slate-100 focus:bg-slate-700/50">
                EN service
              </SelectItem>
              <SelectItem value="Hors Service" className="text-slate-100 focus:bg-slate-700/50">
                Hors Service
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {f(
          'Puissance unitaire (W)',
          <Input
            type="number"
            value={form.powerW}
            onChange={e => onChange({ powerW: e.target.value })}
            placeholder="0"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'Facteur d\'utilisation (0–1)',
          <Input
            type="number"
            min="0" max="1" step="0.05"
            value={form.facteurUtilisation}
            onChange={e => onChange({ facteurUtilisation: e.target.value })}
            placeholder="1"
            className={inputCls}
          />,
          'Corrige la puissance nominale selon le profil d\'usage réel. Défaut: 1'
        )}
        {f(
          'Service / Local',
          <Input
            value={form.service}
            onChange={e => onChange({ service: e.target.value })}
            placeholder="ex: Bureau DG, Salle de cours…"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'Occupant / Responsable',
          <Input
            value={form.nomOccupant}
            onChange={e => onChange({ nomOccupant: e.target.value })}
            placeholder="ex: M. Dupont"
            className={inputCls}
          />
        )}
      </div>

      <Separator className="bg-slate-700/50" />

      {/* ÉCLAIRAGE specific */}
      {isEclairage && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Type de luminaire',
              <Input
                value={form.typeLuminaire}
                onChange={e => onChange({ typeLuminaire: e.target.value })}
                placeholder="ex: Réglette, Downlight, Projecteur…"
                className={inputCls}
              />
            )}
            {f(
              'Type de réflecteur',
              <Input
                value={form.typeReflecteur}
                onChange={e => onChange({ typeReflecteur: e.target.value })}
                placeholder="ex: Spéculaire, Diffus…"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Technologie',
              <Select value={form.technologie} onValueChange={v => onChange({ technologie: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['LED', 'Fluo', 'Économique', 'Halogène'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Nb luminaires',
              <Input
                type="number"
                value={form.nbLuminaires}
                onChange={e => onChange({ nbLuminaires: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Surface locale (m²)',
              <Input
                type="number"
                value={form.surfaceLocale}
                onChange={e => onChange({ surfaceLocale: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          {/* Auto-computed */}
          <div className="space-y-2">
            <ComputedField label="Nb lampes total" value={nbLampesTotal} />
            <ComputedField label="Puissance totale" value={eclTotalW.toFixed(0)} unit="W" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Hauteur fixation (m)',
              <Input
                type="number"
                value={form.hauteurFixation}
                onChange={e => onChange({ hauteurFixation: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
            {f(
              'Éclairement (lux)',
              <Input
                type="number"
                value={form.eclairement}
                onChange={e => onChange({ eclairement: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 10" className={inputCls} />)}
              {f('Jours effectifs/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2920 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an utilisées" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {eclKwh > 0 && (
            <ComputedField label="Consommation estimée" value={eclKwh.toFixed(1)} unit="kWh/an" />
          )}
        </>
      )}

      {/* APPAREILS DIVERS specific */}
      {isAppareils && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Sous-catégorie',
              <Select value={form.categorieMeta} onValueChange={v => onChange({ categorieMeta: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Bureautique', 'Informatique', 'Réseau', 'Multimédia', 'Téléphonie', 'Électroménager', 'Autres'].map(c => (
                    <SelectItem key={c} value={c} className="text-slate-100 focus:bg-slate-700/50">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {f(
            'Caractéristiques techniques',
            <Input
              value={form.caracteristiquesTechniques}
              onChange={e => onChange({ caracteristiquesTechniques: e.target.value })}
              placeholder="ex: Mono/Triphasé, tension, marque…"
              className={inputCls}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {f('Surface (m²)', <Input type="number" value={form.surfaceM2} onChange={e => onChange({ surfaceM2: e.target.value })} placeholder="0" className={inputCls} />)}
            {f('Volume (m³)', <Input type="number" value={form.volumeM3} onChange={e => onChange({ volumeM3: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 8" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2080 h/an" className={inputCls} />)}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.weekend} onChange={e => onChange({ weekend: e.target.checked })} className="rounded" />
                Fonctionnement weekend
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.feries} onChange={e => onChange({ feries: e.target.checked })} className="rounded" />
                Fonctionnement jours fériés
              </label>
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {genericKwh > 0 && (
            <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />
          )}
        </>
      )}

      {/* CLIM specific */}
      {isClim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
            {f(
              'Technologie',
              <Select value={form.technologieClim} onValueChange={v => onChange({ technologieClim: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Inverter', 'Classique'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Capacité (BTU/h)',
              <Input
                type="number"
                value={form.btu}
                onChange={e => onChange({ btu: e.target.value })}
                placeholder="ex: 12000"
                className={inputCls}
              />
            )}
            {f(
              'Mode de pose',
              <Input
                value={form.modePose}
                onChange={e => onChange({ modePose: e.target.value })}
                placeholder="Mural, Cassette, Gainable…"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f('Réglage consigne (°C)', <Input type="number" value={form.reglageConsigne} onChange={e => onChange({ reglageConsigne: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
            {f('Surface climatisée (m²)', <Input type="number" value={form.surfaceClim} onChange={e => onChange({ surfaceClim: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          {f('Volume climatisé (m³)', <Input type="number" value={form.volumeM3Clim} onChange={e => onChange({ volumeM3Clim: e.target.value })} placeholder="0" className={inputCls} />)}
          {/* Auto-calculated values */}
          <div className="space-y-1.5">
            {climPuissanceFrigoW > 0 && (
              <ComputedField label="Puissance frigorifique" value={(climPuissanceFrigoW).toFixed(0)} unit="W" />
            )}
            <ComputedField label="Puissance élec. totale" value={climElecTotaleW.toFixed(0)} unit="W" />
            {climCOP > 0 && (
              <ComputedField label="COP/EER auto-calculé" value={climCOP.toFixed(2)} />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 10" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 180" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 1800 h/an" className={inputCls} />)}
            </div>
          </div>
          {climKwh > 0 && <ComputedField label="Consommation électrique" value={climKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* PÉDAGOGIQUE specific */}
      {isPedago && (
        <>
          {f('Quantité', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
          {f('Heures / an', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 1000" className={inputCls} />)}
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* FORCE MOTRICE specific */}
      {isForcemotrice && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f('Nb moteurs / unités', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
            {f('Type de moteur', <Input value={form.typeMoteur} onChange={e => onChange({ typeMoteur: e.target.value })} placeholder="ex: Asynchrone triphasé" className={inputCls} />)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {f('Rendement η (%)', <Input type="number" value={form.rendementMoteur} onChange={e => onChange({ rendementMoteur: e.target.value })} placeholder="ex: 90" className={inputCls} />, 'Rendement nominal du moteur')}
            {f('Taux de charge (%)', <Input type="number" value={form.tauxCharge} onChange={e => onChange({ tauxCharge: e.target.value })} placeholder="ex: 75" className={inputCls} />, '% de charge effective')}
            {f('Facteur puissance (cos φ)', <Input type="number" value={form.facteurPuissance} onChange={e => onChange({ facteurPuissance: e.target.value })} placeholder="ex: 0.85" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 16" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 300" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 4800 h/an" className={inputCls} />)}
            </div>
          </div>
          <ComputedField label="Puissance effective absorbée" value={fmTotalW.toFixed(0)} unit="W" />
          {fmKwh > 0 && <ComputedField label="Consommation réelle" value={fmKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* VENTILATION specific */}
      {isVentil && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f('Nb unités', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
            {f('Type', <Input value={form.typeVentil} onChange={e => onChange({ typeVentil: e.target.value })} placeholder="ex: Axial, CTA, VMC" className={inputCls} />)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f('Débit d\'air (m³/h)', <Input type="number" value={form.debitAir} onChange={e => onChange({ debitAir: e.target.value })} placeholder="0" className={inputCls} />)}
            {f('Pression (Pa)', <Input type="number" value={form.pressionPa} onChange={e => onChange({ pressionPa: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-2 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 365" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 8760 h/an" className={inputCls} />)}
            </div>
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* GENERIC — shown for custom categories (CONFORT, etc.) not covered above */}
      {!isEclairage && !isClim && !isAppareils && !isPedago && !isForcemotrice && !isVentil && !isAlim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 8" className={inputCls} />)}
              {f('Jours/an',    <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2080 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* ALIMENTATIONS specific (onduleurs, groupes électrogènes) */}
      {isAlim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Type de source',
              <Select value={form.typeSource} onValueChange={v => onChange({ typeSource: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Onduleur', 'Groupe électrogène', 'Convertisseur', 'Autre'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          {f('Tableau électrique rattaché', <Input value={form.tableauElectrique} onChange={e => onChange({ tableauElectrique: e.target.value })} placeholder="ex: TGBT, TD-01…" className={inputCls} />)}
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 365" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 8760 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}
    </div>
  );
}

// ─── ROOM VIEW ───────────────────────────────────────────────────────────────

function RoomView({
  roomId,
  levelId,
  buildingId,
  treeData,
  categories,
  auditId,
  orgId,
  userId,
  onRefreshRooms,
}: {
  roomId: string;
  levelId: string;
  buildingId: string;
  treeData: TreeData;
  categories: EquipmentCategory[];
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshRooms: (levelId: string) => Promise<void>;
}) {
  const room = (treeData.rooms[levelId] ?? []).find(r => r.id === roomId);
  // Local copy of categories so newly created groups are immediately available in the combobox
  const [localCategories, setLocalCategories] = useState<EquipmentCategory[]>(categories);
  useEffect(() => { setLocalCategories(categories); }, [categories]);

  const [equipment, setEquipment] = useState<InventoryEquipment[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [eqDialogOpen, setEqDialogOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<InventoryEquipment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteEqId, setDeleteEqId] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState(false);
  const [deleteRoomOpen, setDeleteRoomOpen] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [roomForm, setRoomForm] = useState({
    code: room?.code ?? '',
    service: room?.service ?? '',
    surfaceM2: String(room?.surfaceM2 ?? ''),
    typeFonctionnel: room?.typeFonctionnel ?? '',
  });
  // Keep roomForm in sync if the room is updated from outside
  useEffect(() => {
    if (room) {
      setRoomForm({
        code: room.code,
        service: room.service ?? '',
        surfaceM2: String(room.surfaceM2 ?? ''),
        typeFonctionnel: room.typeFonctionnel ?? '',
      });
    }
  }, [room?.id]);
  const [eqForm, setEqForm] = useState<EqFormState>(emptyEqForm());
  const [eqStatusFilter, setEqStatusFilter] = useState<'all' | 'EN service' | 'Hors Service'>('all');

  // Building type params for heuresAn prefill
  const [buildingParams, setBuildingParams] = useState<BuildingTypeParams[]>([]);
  useEffect(() => {
    if (!buildingId) return;
    getBuildingTypeParams(buildingId)
      .then(setBuildingParams)
      .catch(() => {/* silent — prefill is optional */});
  }, [buildingId]);

  // Load equipment when room changes
  useEffect(() => {
    if (!roomId) return;
    setLoadingEq(true);
    getEquipmentByRoom(roomId)
      .then(setEquipment)
      .catch(err => toast.error('Erreur chargement équipements: ' + err.message))
      .finally(() => setLoadingEq(false));
  }, [roomId]);

  if (!room) return null;

  const filteredEquipment = eqStatusFilter === 'all'
    ? equipment
    : equipment.filter(e => e.status === eqStatusFilter);

  // For Hors Service equipment, totalPowerW is always 0 by design.
  // Show nominal installed power (P × qty × util_factor) instead so the filter is meaningful.
  const nominalW = (e: typeof equipment[0]) =>
    (e.powerW ?? 0) * (e.quantity ?? 1) * (e.utilizationFactor ?? 1);

  const totalW = filteredEquipment.reduce((sum, e) =>
    sum + (eqStatusFilter === 'Hors Service' ? nominalW(e) : (e.totalPowerW ?? 0)), 0);
  const totalKwh = filteredEquipment.reduce((sum, e) => sum + (e.kwhPerYear ?? 0), 0);

  // Category breakdown — scoped to filtered equipment
  const catBreakdown = categories
    .map(cat => {
      const eqs = filteredEquipment.filter(e => e.categoryId === cat.id);
      const w = eqs.reduce((s, e) =>
        s + (eqStatusFilter === 'Hors Service' ? nominalW(e) : (e.totalPowerW ?? 0)), 0);
      return { name: cat.name, color: cat.color, w, count: eqs.length };
    })
    .filter(c => c.count > 0);

  // Wrapper: auto-prefill heuresAn when groupeNom changes and room has a type_fonctionnel
  const handleEqFormChange = (updates: Partial<EqFormState>) => {
    setEqForm(prev => {
      const next = { ...prev, ...updates };
      if ('groupeNom' in updates && room?.typeFonctionnel) {
        const param = buildingParams.find(p => p.typeFonctionnel === room.typeFonctionnel);
        if (param) {
          const hourCat = getHourCategoryForEquipment(
            next.groupeNom,
            next.categorieMeta
          );
          if (hourCat) {
            const prefilled = calculateHoursParametric(param, hourCat);
            next.heuresAn = String(Math.round(prefilled));
            next.heuresJour = '';
            next.joursEffectifs = '';
          }
        }
      }
      return next;
    });
  };

  const openAdd = () => {
    setEditingEq(null);
    setEqForm(emptyEqForm());
    setFormSubmitted(false);
    setEqDialogOpen(true);
  };

  const openEdit = (eq: InventoryEquipment) => {
    setEditingEq(eq);
    const cat = categories.find(c => c.id === eq.categoryId);
    const catName = (cat?.name ?? '').toUpperCase();
    const isEclairage = catName.includes('CLAIRAGE');
    const isAppareils = catName.includes('DIVERS') || catName.includes('APPAREILS');
    const isClim = catName.includes('CLIM');
    const m = (eq.metadata ?? {}) as any;
    setEqForm({
      categoryId: eq.categoryId ?? '',
      groupeNom: cat?.name ?? '',
      name: eq.name,
      brand: eq.brand ?? '',
      model: m.model ?? '',
      numSerie: m.numSerie ?? '',
      anneeFab: String(m.anneeFab ?? ''),
      status: eq.status,
      service: m.service ?? '',
      nomOccupant: m.nomOccupant ?? '',
      powerW: String(eq.powerW ?? ''),
      quantity: String(isEclairage ? (m.nbLuminaires ?? 1) : eq.quantity),
      facteurUtilisation: String(eq.utilizationFactor ?? 1),
      heuresAn: String(m.heuresAn ?? ''),
      heuresJour: String(m.heuresJour ?? ''),
      joursEffectifs: String(m.joursEffectifs ?? ''),
      tauxCharge: String(m.tauxCharge ?? ''),
      typeLuminaire: m.typeLuminaire ?? '',
      typeReflecteur: m.typeReflecteur ?? '',
      technologie: !isClim ? (m.technologie ?? '') : '',
      nbLuminaires: String(m.nbLuminaires ?? ''),
      lampesParLuminaire: String(m.lampesParLuminaire ?? '1'),
      hauteurFixation: String(m.hauteurFixation ?? ''),
      eclairement: String(m.eclairement ?? ''),
      surfaceLocale: String(m.surfaceLocale ?? ''),
      categorieMeta: m.categorie ?? '',
      surfaceM2: String(m.surfaceM2 ?? ''),
      volumeM3: String(isClim ? '' : (m.volumeM3 ?? '')),
      weekend: m.weekend ?? false,
      feries: m.feries ?? false,
      caracteristiquesTechniques: m.caracteristiquesTechniques ?? '',
      technologieClim: isClim ? (m.technologie ?? '') : '',
      btu: String(m.btu ?? ''),
      modePose: m.modePose ?? '',
      reglageConsigne: m.reglageConsigne ?? '',
      surfaceClim: String(m.surfaceClim ?? ''),
      volumeM3Clim: String(isClim ? (m.volumeM3 ?? '') : ''),
      rendementMoteur: String(m.rendementMoteur ?? ''),
      facteurPuissance: String(m.facteurPuissance ?? ''),
      typeMoteur: m.typeMoteur ?? '',
      debitAir: String(m.debitAir ?? ''),
      pressionPa: String(m.pressionPa ?? ''),
      typeVentil: m.typeVentil ?? '',
      typeSource: m.typeSource ?? '',
      tableauElectrique: m.tableauElectrique ?? '',
    });
    setFormSubmitted(false);
    setEqDialogOpen(true);
  };

  const buildEqPayload = (resolvedCategoryId?: string) => {
    const gNom = eqForm.groupeNom.toUpperCase();
    const isEclairage = gNom.includes('CLAIRAGE');
    const isAppareils = gNom.includes('DIVERS') || gNom.includes('APPAREILS');
    const isClim = gNom.includes('CLIM');
    const isForcemotrice = gNom.includes('FORCE') || gNom.includes('MOTRICE');
    const isVentil = gNom.includes('VENTIL');
    const isAlim = gNom.includes('ALIM');

    const powerW = parseFloat(eqForm.powerW) || 0;
    let quantity = parseInt(eqForm.quantity) || 1;
    let metadata: Record<string, any> = {};

    // Effective heuresAn
    const effHours = (eqForm.heuresJour && eqForm.joursEffectifs)
      ? (parseFloat(eqForm.heuresJour) || 0) * (parseFloat(eqForm.joursEffectifs) || 0)
      : parseFloat(eqForm.heuresAn) || undefined;

    // Common extra fields (go into all metadata)
    const commonExtra = {
      model: eqForm.model || undefined,
      numSerie: eqForm.numSerie || undefined,
      anneeFab: parseInt(eqForm.anneeFab) || undefined,
      service: eqForm.service || undefined,
      nomOccupant: eqForm.nomOccupant || undefined,
    };

    if (isEclairage) {
      const nbLum = parseInt(eqForm.nbLuminaires) || 0;
      const lam = parseInt(eqForm.lampesParLuminaire) || 1;
      quantity = nbLum * lam; // nbLampesTotal stored as quantity
      metadata = {
        ...commonExtra,
        typeLuminaire: eqForm.typeLuminaire || undefined,
        typeReflecteur: eqForm.typeReflecteur || undefined,
        technologie: eqForm.technologie || undefined,
        nbLuminaires: nbLum || undefined,
        lampesParLuminaire: lam,
        hauteurFixation: parseFloat(eqForm.hauteurFixation) || undefined,
        eclairement: parseFloat(eqForm.eclairement) || undefined,
        surfaceLocale: parseFloat(eqForm.surfaceLocale) || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
      };
    } else if (isAppareils) {
      metadata = {
        ...commonExtra,
        categorie: eqForm.categorieMeta || undefined,
        caracteristiquesTechniques: eqForm.caracteristiquesTechniques || undefined,
        surfaceM2: parseFloat(eqForm.surfaceM2) || undefined,
        volumeM3: parseFloat(eqForm.volumeM3) || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
        weekend: eqForm.weekend || undefined,
        feries: eqForm.feries || undefined,
      };
    } else if (isClim) {
      // Auto-calculate frigo power and COP
      const btu = parseFloat(eqForm.btu) || 0;
      const puissanceFrigoW = btu * quantity * 0.29307;
      const puissanceElecTotaleW = powerW * quantity;
      const calculatedCOP = puissanceElecTotaleW > 0 ? puissanceFrigoW / puissanceElecTotaleW : undefined;
      metadata = {
        ...commonExtra,
        technologie: eqForm.technologieClim || undefined,
        btu: btu || undefined,
        puissanceFrigoW: puissanceFrigoW || undefined,
        cop: calculatedCOP,
        modePose: eqForm.modePose || undefined,
        reglageConsigne: eqForm.reglageConsigne || undefined,
        surfaceClim: parseFloat(eqForm.surfaceClim) || undefined,
        volumeM3: parseFloat(eqForm.volumeM3Clim) || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
      };
    } else if (isForcemotrice) {
      const rendement = (parseFloat(eqForm.rendementMoteur) || 100) / 100;
      const tauxCharge = (parseFloat(eqForm.tauxCharge) || 100) / 100;
      const kwhPreCalc = powerW > 0 && effHours
        ? (powerW / 1000) * tauxCharge * (1 / rendement) * effHours * quantity
        : undefined;
      metadata = {
        ...commonExtra,
        typeMoteur: eqForm.typeMoteur || undefined,
        rendementMoteur: parseFloat(eqForm.rendementMoteur) || undefined,
        facteurPuissance: parseFloat(eqForm.facteurPuissance) || undefined,
        tauxCharge: parseFloat(eqForm.tauxCharge) || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
        kwhPreCalculated: kwhPreCalc,
      };
    } else if (isVentil) {
      metadata = {
        ...commonExtra,
        typeVentil: eqForm.typeVentil || undefined,
        debitAir: parseFloat(eqForm.debitAir) || undefined,
        pressionPa: parseFloat(eqForm.pressionPa) || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
      };
    } else if (isAlim) {
      metadata = {
        ...commonExtra,
        typeSource: eqForm.typeSource || undefined,
        tableauElectrique: eqForm.tableauElectrique || undefined,
        heuresAn: effHours,
        heuresJour: parseFloat(eqForm.heuresJour) || undefined,
        joursEffectifs: parseFloat(eqForm.joursEffectifs) || undefined,
      };
    } else {
      // PÉDAGOGIQUE / other
      metadata = {
        ...commonExtra,
        heuresAn: effHours,
      };
    }

    return {
      categoryId: resolvedCategoryId ?? eqForm.categoryId,
      name: eqForm.name,
      brand: eqForm.brand || undefined,
      status: eqForm.status as 'EN service' | 'Hors Service',
      powerW: powerW || undefined,
      quantity,
      utilizationFactor: Math.min(1, Math.max(0, parseFloat(eqForm.facteurUtilisation) || 1)),
      metadata,
    };
  };

  const handleSaveEquipment = async () => {
    setFormSubmitted(true);
    if (!eqForm.groupeNom.trim() || !eqForm.name.trim()) return;
    setSaving(true);
    try {
      // Resolve group: use existing categoryId or create a new category on the fly
      let resolvedCategoryId = eqForm.categoryId;
      if (!resolvedCategoryId && eqForm.groupeNom.trim()) {
        const newCat = await createCategory(orgId, eqForm.groupeNom.trim());
        setLocalCategories(prev => [...prev, newCat]);
        resolvedCategoryId = newCat.id;
      }
      if (!resolvedCategoryId) { toast.error('Groupe introuvable'); setSaving(false); return; }

      const payload = buildEqPayload(resolvedCategoryId);
      if (editingEq) {
        const updated = await updateEquipment(editingEq.id, payload);
        setEquipment(prev => prev.map(e => e.id === editingEq.id ? updated : e));
        toast.success('Équipement mis à jour');
      } else {
        const created = await createEquipment(auditId, roomId, payload);
        setEquipment(prev => [...prev, created]);
        await logActivity(
          auditId, orgId, userId, 'custom',
          'Équipement ajouté',
          `${payload.name} ajouté à la pièce ${room.code}`
        );
        toast.success('Équipement créé');
      }
      setEqDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur sauvegarde équipement');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEquipment = async (eqId: string) => {
    try {
      await deleteEquipment(eqId);
      setEquipment(prev => prev.filter(e => e.id !== eqId));
      toast.success('Équipement supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
    setDeleteEqId(null);
  };

  const handleUpdateRoom = async () => {
    try {
      await updateRoom(roomId, {
        code: roomForm.code,
        service: roomForm.service || undefined,
        surfaceM2: roomForm.surfaceM2 ? parseFloat(roomForm.surfaceM2) : undefined,
        typeFonctionnel: roomForm.typeFonctionnel || undefined,
      });
      await onRefreshRooms(levelId);
      toast.success('Pièce mise à jour');
      setEditRoom(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur mise à jour pièce');
    }
  };

  const handleDeleteRoom = async () => {
    try {
      await deleteRoom(roomId);
      await onRefreshRooms(levelId);
      toast.success('Pièce supprimée');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression pièce');
    }
    setDeleteRoomOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Room header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/15">
            <LayoutGrid className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-100 font-mono">{room.code}</h2>
            {room.service && <p className="text-sm text-slate-400">{room.service}</p>}
            {room.surfaceM2 && (
              <p className="text-xs text-slate-500 mt-0.5">{room.surfaceM2} m²</p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditRoom(true)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteRoomOpen(true)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        <KpiCard label="Équipements" value={filteredEquipment.length} color="blue" />
        <KpiCard
          label="Puissance totale"
          value={totalW >= 1000 ? formatNumber(totalW / 1000, 2) : formatNumber(totalW, 0)}
          unit={totalW >= 1000 ? 'kW' : 'W'}
          color="amber"
        />
        <KpiCard
          label="Consommation"
          value={formatNumber(totalKwh, 0)}
          unit="kWh/an"
          color="emerald"
        />
      </div>

      {/* Category breakdown */}
      {catBreakdown.length > 0 && (
        <div className="flex gap-2 flex-wrap flex-shrink-0">
          {catBreakdown.map(c => (
            <div
              key={c.name}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/50 border border-slate-700/30 text-xs"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              <span className="text-slate-300">{c.name}</span>
              <span className="text-slate-500">{c.count} ({formatNumber(c.w, 0)} W)</span>
            </div>
          ))}
        </div>
      )}

      {/* Equipment list */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Équipements
          </h3>
          <div className="flex items-center gap-2">
            {(['all', 'EN service', 'Hors Service'] as const).map(f => (
              <button
                key={f}
                onClick={() => setEqStatusFilter(f)}
                className={cn(
                  'h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors',
                  eqStatusFilter === f
                    ? f === 'Hors Service'
                      ? 'bg-red-500/20 text-red-300'
                      : f === 'EN service'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800/70 text-slate-400 hover:bg-slate-700/60'
                )}
              >
                {f === 'all' ? 'Tous' : f}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-700/50" />
            <Button
              size="sm"
              onClick={openAdd}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Ajouter
            </Button>
          </div>
        </div>

        <div>
          {loadingEq ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="p-2">
              {equipment.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  <Zap className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  Aucun équipement dans cette pièce
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700/50">
                      <th className="text-left pb-2 px-2 font-medium">Désignation</th>
                      <th className="text-left pb-2 px-2 font-medium">Famille</th>
                      <th className="text-right pb-2 px-2 font-medium">P. Unit.</th>
                      <th className="text-right pb-2 px-2 font-medium">Qté</th>
                      <th className="text-right pb-2 px-2 font-medium">P. Tot. (W)</th>
                      <th className="text-right pb-2 px-2 font-medium">kWh/an</th>
                      <th className="text-right pb-2 px-2 font-medium">État</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipment.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-slate-500 text-xs">
                          Aucun équipement "{eqStatusFilter}" dans cette pièce
                        </td>
                      </tr>
                    ) : null}
                    {filteredEquipment.map(eq => (
                      <tr
                        key={eq.id}
                        className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 px-2">
                          <p className="font-medium text-slate-200">{eq.name}</p>
                          {eq.brand && (
                            <p className="text-xs text-slate-500">{eq.brand}</p>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {eq.categoryName && (
                            <span className="text-xs text-slate-400">{eq.categoryName}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-300">
                          {eq.powerW ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-300">{eq.quantity}</td>
                        <td className="py-2 px-2 text-right text-slate-300">
                          {eq.totalPowerW != null ? formatNumber(eq.totalPowerW, 0) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-emerald-400">
                          {eq.kwhPerYear != null ? formatEnergy(eq.kwhPerYear) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs border-0',
                              eq.status === 'EN service'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            )}
                          >
                            {eq.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(eq)}
                              className="h-6 w-6 p-0 text-slate-500 hover:text-slate-100"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteEqId(eq.id)}
                              className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Equipment add/edit dialog */}
      <Dialog open={eqDialogOpen} onOpenChange={setEqDialogOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingEq ? 'Modifier l\'équipement' : 'Ajouter un équipement'}
            </DialogTitle>
          </DialogHeader>
          <EquipmentFormFields
            form={eqForm}
            onChange={handleEqFormChange}
            categories={localCategories}
            formSubmitted={formSubmitted}
          />
          <DialogFooter className="mt-4">
            <Button
              variant="ghost"
              onClick={() => setEqDialogOpen(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveEquipment}
              disabled={saving || !eqForm.groupeNom.trim() || !eqForm.name.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingEq ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit room dialog */}
      <Dialog open={editRoom} onOpenChange={setEditRoom}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Modifier la pièce</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Code pièce *">
              <TextInput
                value={roomForm.code}
                onChange={v => setRoomForm(f => ({ ...f, code: v }))}
              />
            </Field>
            <Field label="Service">
              <TextInput
                value={roomForm.service}
                onChange={v => setRoomForm(f => ({ ...f, service: v }))}
              />
            </Field>
            <Field label="Surface (m²)">
              <NumInput
                value={roomForm.surfaceM2}
                onChange={v => setRoomForm(f => ({ ...f, surfaceM2: v }))}
              />
            </Field>
            <Field label="Type fonctionnel" hint="Préfill automatique des heures de fonctionnement">
              <Select
                value={roomForm.typeFonctionnel}
                onValueChange={v => setRoomForm(f => ({ ...f, typeFonctionnel: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {FUNCTIONAL_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRoom(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleUpdateRoom}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete room confirm */}
      <AlertDialog open={deleteRoomOpen} onOpenChange={setDeleteRoomOpen}>
        <AlertDialogContent className="bg-[#1a1d2e] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer la pièce {room.code} ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tous les équipements de cette pièce seront également supprimés. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRoom}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete equipment confirm */}
      <AlertDialog open={!!deleteEqId} onOpenChange={open => !open && setDeleteEqId(null)}>
        <AlertDialogContent className="bg-[#1a1d2e] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer cet équipement ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEqId && handleDeleteEquipment(deleteEqId)}
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

// ─── BREADCRUMB ──────────────────────────────────────────────────────────────

function Breadcrumb({ parts }: { parts: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-700">/</span>}
          <span className={p.color}>{p.label}</span>
        </span>
      ))}
    </div>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function NodeDetail({
  selection,
  treeData,
  categories,
  auditId,
  orgId,
  userId,
  onRefreshZones,
  onRefreshBuildings,
  onRefreshLevels,
  onRefreshRooms,
}: NodeDetailProps) {
  if (!selection) return <EmptyState />;

  // Build breadcrumb parts from selection
  const getBreadcrumb = () => {
    const site = (['site', 'zone', 'building'] as const).includes(selection.type as any)
      ? treeData.sites.find(s => s.id === (
          selection.type === 'site' ? selection.id :
          (selection as any).siteId
        ))
      : undefined;

    const zone = selection.type === 'zone'
      ? (treeData.zones[(selection as any).siteId] ?? []).find(z => z.id === selection.id)
      : selection.type === 'building'
        ? Object.values(treeData.zones).flat().find(z => z.id === (selection as any).zoneId)
        : undefined;

    const buildingId = selection.type === 'building' ? selection.id
      : selection.type === 'level' ? selection.buildingId
      : selection.type === 'room'
        ? Object.entries(treeData.levels).find(([, levels]) =>
            levels.some(l => l.id === selection.levelId)
          )?.[0]
        : undefined;

    const building = buildingId
      ? Object.values(treeData.buildings).flat().find(b => b.id === buildingId)
      : undefined;

    const level = selection.type === 'level'
      ? (treeData.levels[selection.buildingId] ?? []).find(l => l.id === selection.id)
      : selection.type === 'room'
        ? Object.values(treeData.levels).flat().find(l => l.id === selection.levelId)
        : undefined;

    const room = selection.type === 'room'
      ? (treeData.rooms[selection.levelId] ?? []).find(r => r.id === selection.id)
      : undefined;

    const parts = [];
    if (site) parts.push({ label: site.name, color: 'text-emerald-400' });
    if (zone) parts.push({ label: zone.name, color: 'text-teal-400' });
    if (building) parts.push({ label: building.building_name, color: 'text-blue-400' });
    if (level) parts.push({ label: `Étage ${level.name}`, color: 'text-violet-400' });
    if (room) parts.push({ label: room.code, color: 'text-amber-400' });
    return parts;
  };

  const breadcrumb = getBreadcrumb();
  const commonPanel = 'flex-1 overflow-y-auto flex flex-col gap-3 pb-6';

  if (selection.type === 'site') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <SiteView
          siteId={selection.id}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshZones={onRefreshZones}
        />
      </div>
    );
  }

  if (selection.type === 'zone') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <ZoneView
          zoneId={selection.id}
          siteId={selection.siteId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshBuildings={onRefreshBuildings}
          onRefreshZones={onRefreshZones}
        />
      </div>
    );
  }

  if (selection.type === 'building') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <BuildingView
          buildingId={selection.id}
          zoneId={selection.zoneId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshLevels={onRefreshLevels}
          onRefreshBuildings={onRefreshBuildings}
        />
      </div>
    );
  }

  if (selection.type === 'level') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <LevelView
          levelId={selection.id}
          buildingId={selection.buildingId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshRooms={onRefreshRooms}
          onRefreshLevels={onRefreshLevels}
        />
      </div>
    );
  }

  if (selection.type === 'room') {
    // Resolve buildingId for the selected room (needed for heuresAn prefill)
    const roomBuildingId = Object.entries(treeData.levels).find(
      ([, levels]) => levels.some(l => l.id === selection.levelId)
    )?.[0] ?? '';
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <RoomView
          roomId={selection.id}
          levelId={selection.levelId}
          buildingId={roomBuildingId}
          treeData={treeData}
          categories={categories}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshRooms={onRefreshRooms}
        />
      </div>
    );
  }

  return <EmptyState />;
}
