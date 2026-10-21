import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, LayoutGrid, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNumber, formatEnergy } from '@/lib/format';
import {
  updateRoom, deleteRoom, getEquipmentByRoom, createEquipment, updateEquipment,
  deleteEquipment, createCategory, getBuildingTypeParams,
} from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import {
  FUNCTIONAL_TYPES, BuildingTypeParams, getHourCategoryForEquipment,
  calculateHoursParametric,
} from '@/types/inventory';
import type { TreeData } from '@/pages/Inventaire';
import type { InventoryEquipment, EquipmentCategory } from '@/types/inventory';
import { EquipmentFormFields } from './EquipmentFormFields';
import { KpiCard } from './KpiCard';
import { EqFormState, emptyEqForm } from './equipment-form';
import { Field, NumInput, TextInput } from './fields';

// ─── ROOM VIEW ───────────────────────────────────────────────────────────────

export function RoomView({
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
