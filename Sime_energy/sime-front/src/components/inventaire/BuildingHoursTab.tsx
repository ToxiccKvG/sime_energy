import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Clock, Sun, Wind, Monitor, Zap, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BuildingTypeParams,
  FUNCTIONAL_TYPES,
  calculateHoursParametric,
} from '@/types/inventory';
import {
  getBuildingTypeParams,
  upsertBuildingTypeParam,
  deleteBuildingTypeParam,
} from '@/lib/inventory-service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParamsFormState {
  typeFonctionnel: string;
  joursNonTravailles: string;
  joursFeries: string;
  joursFraicheur: string;
  correctionFraicheur: string;
  correctionWeekend: string;
  correctionFerie: string;
  correctionOuvres: string;
  tpsEcl: string;
  tpsClim: string;
  tpsInform: string;
  tpsElectrom: string;
  tpsServeur: string;
}

const DEFAULT_FORM: ParamsFormState = {
  typeFonctionnel: '',
  joursNonTravailles: '104',
  joursFeries: '5',
  joursFraicheur: '60',
  correctionFraicheur: '0.9',
  correctionWeekend: '1.0',
  correctionFerie: '1.0',
  correctionOuvres: '0.8',
  tpsEcl: '8',
  tpsClim: '8',
  tpsInform: '8',
  tpsElectrom: '24',
  tpsServeur: '24',
};

function formToParams(f: ParamsFormState) {
  return {
    joursNonTravailles: parseInt(f.joursNonTravailles) || 104,
    joursFeries: parseInt(f.joursFeries) || 5,
    joursFraicheur: parseInt(f.joursFraicheur) || 60,
    correctionFraicheur: parseFloat(f.correctionFraicheur) || 0.9,
    correctionWeekend: parseFloat(f.correctionWeekend) || 1.0,
    correctionFerie: parseFloat(f.correctionFerie) || 1.0,
    correctionOuvres: parseFloat(f.correctionOuvres) || 0.8,
    tpsEcl: parseFloat(f.tpsEcl) || 8,
    tpsClim: parseFloat(f.tpsClim) || 8,
    tpsInform: parseFloat(f.tpsInform) || 8,
    tpsElectrom: parseFloat(f.tpsElectrom) || 24,
    tpsServeur: parseFloat(f.tpsServeur) || 24,
  };
}

function paramsToForm(p: BuildingTypeParams): ParamsFormState {
  return {
    typeFonctionnel: p.typeFonctionnel,
    joursNonTravailles: String(p.joursNonTravailles),
    joursFeries: String(p.joursFeries),
    joursFraicheur: String(p.joursFraicheur),
    correctionFraicheur: String(p.correctionFraicheur),
    correctionWeekend: String(p.correctionWeekend),
    correctionFerie: String(p.correctionFerie),
    correctionOuvres: String(p.correctionOuvres),
    tpsEcl: String(p.tpsEcl),
    tpsClim: String(p.tpsClim),
    tpsInform: String(p.tpsInform),
    tpsElectrom: String(p.tpsElectrom),
    tpsServeur: String(p.tpsServeur),
  };
}

// ─── Category display config ──────────────────────────────────────────────────

const HOUR_CATS = [
  {
    key: 'Eclairage' as const,
    label: 'Éclairage',
    Icon: Sun,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-300',
    iconColor: 'text-amber-400',
  },
  {
    key: 'Climatisation' as const,
    label: 'Climatisation',
    Icon: Wind,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-300',
    iconColor: 'text-blue-400',
  },
  {
    key: 'Informatique' as const,
    label: 'Informatique',
    Icon: Monitor,
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    text: 'text-violet-300',
    iconColor: 'text-violet-400',
  },
  {
    key: 'Electromenager' as const,
    label: 'Électroménager',
    Icon: Zap,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-300',
    iconColor: 'text-emerald-400',
  },
  {
    key: 'Serveur' as const,
    label: 'Serveur',
    Icon: Server,
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    text: 'text-slate-300',
    iconColor: 'text-slate-400',
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NF({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-400 text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-slate-800/60 border-slate-600 text-slate-100 h-8 text-sm"
      />
    </div>
  );
}

function HoursPreview({ form }: { form: ParamsFormState }) {
  const p = formToParams(form);
  const dummy: BuildingTypeParams = {
    id: '', buildingId: '', auditId: '', typeFonctionnel: '',
    createdAt: '', updatedAt: '', ...p,
  };
  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-700/50 p-3">
      <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Aperçu heures/an</p>
      <div className="grid grid-cols-5 gap-2">
        {HOUR_CATS.map(c => {
          const h = calculateHoursParametric(dummy, c.key);
          return (
            <div key={c.key} className={`rounded-lg ${c.bg} border ${c.border} p-2 text-center`}>
              <c.Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${c.iconColor}`} />
              <div className={`text-base font-bold ${c.text}`}>{h.toFixed(0)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">h/an</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-2 mt-1">
        {HOUR_CATS.map(c => (
          <div key={c.key} className="text-center">
            <span className="text-[10px] text-slate-500">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card for a configured type ───────────────────────────────────────────────

function ParamsCard({
  p,
  onEdit,
  onDelete,
}: {
  p: BuildingTypeParams;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const joursOuvres = 365 - p.joursNonTravailles - p.joursFeries;

  return (
    <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/40 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/15">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <span className="text-sm font-semibold text-slate-100">{p.typeFonctionnel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {joursOuvres} j ouvrés · {(p.correctionOuvres * 100).toFixed(0)}% occupation
          </span>
          <div className="flex gap-1">
            <Button
              size="sm" variant="ghost"
              onClick={onEdit}
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-slate-400 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Hours grid */}
      <div className="grid grid-cols-5 divide-x divide-slate-700/30">
        {HOUR_CATS.map(c => {
          const h = calculateHoursParametric(p, c.key);
          return (
            <div key={c.key} className="flex flex-col items-center py-4 gap-1.5">
              <c.Icon className={`w-4 h-4 ${c.iconColor}`} />
              <span className={`text-xl font-bold tabular-nums ${c.text}`}>
                {h.toFixed(0)}
              </span>
              <span className="text-[10px] text-slate-500">h/an</span>
              <span className="text-[10px] text-slate-600">{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  buildingId: string;
  auditId: string;
}

export function BuildingHoursTab({ buildingId, auditId }: Props) {
  const [params, setParams] = useState<BuildingTypeParams[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BuildingTypeParams | null>(null);
  const [form, setForm] = useState<ParamsFormState>(DEFAULT_FORM);

  const load = async () => {
    try {
      const data = await getBuildingTypeParams(buildingId);
      setParams(data);
    } catch (err: any) {
      toast.error('Erreur chargement: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [buildingId]);

  const openAdd = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: BuildingTypeParams) => {
    setEditingId(p.id);
    setForm(paramsToForm(p));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.typeFonctionnel) {
      toast.error('Sélectionnez un type fonctionnel');
      return;
    }
    setSaving(true);
    try {
      await upsertBuildingTypeParam(buildingId, auditId, form.typeFonctionnel, formToParams(form));
      await load();
      toast.success('Paramètres enregistrés');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBuildingTypeParam(deleteTarget.id);
      setParams(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success('Type supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    } finally {
      setDeleteTarget(null);
    }
  };

  const usedTypes = new Set(params.map(p => p.typeFonctionnel));
  const availableTypes = FUNCTIONAL_TYPES.filter(
    t => !usedTypes.has(t) || t === form.typeFonctionnel
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 leading-relaxed">
          Heures de fonctionnement annuelles calculées par type de zone.
          Ces valeurs préfillent automatiquement les fiches équipements.
        </p>
        <Button
          size="sm"
          onClick={openAdd}
          className="h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white shrink-0 ml-4"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Ajouter un type
        </Button>
      </div>

      {/* Cards */}
      {params.length > 0 ? (
        <div className="space-y-3">
          {params.map(p => (
            <ParamsCard
              key={p.id}
              p={p}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-slate-700/50 text-slate-500">
          <Clock className="w-8 h-8 mb-3 opacity-25" />
          <p className="text-sm font-medium">Aucun type configuré</p>
          <p className="text-xs mt-1 text-slate-600">
            Ajoutez un type fonctionnel pour activer le calcul automatique des heures
          </p>
          <Button
            size="sm"
            onClick={openAdd}
            className="mt-4 h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingId ? 'Modifier les paramètres' : 'Nouveau type fonctionnel'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-5 pr-3 py-1">
              {/* Type fonctionnel */}
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Type fonctionnel *</Label>
                <Select
                  value={form.typeFonctionnel}
                  onValueChange={v => setForm(f => ({ ...f, typeFonctionnel: v }))}
                  disabled={!!editingId}
                >
                  <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-slate-700">
                    {availableTypes.map(t => (
                      <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Calendrier */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Calendrier</p>
                <div className="grid grid-cols-3 gap-3">
                  <NF label="Jours non travaillés" value={form.joursNonTravailles} onChange={v => setForm(f => ({ ...f, joursNonTravailles: v }))} />
                  <NF label="Jours fériés" value={form.joursFeries} onChange={v => setForm(f => ({ ...f, joursFeries: v }))} />
                  <NF label="Jours fraîcheur" value={form.joursFraicheur} onChange={v => setForm(f => ({ ...f, joursFraicheur: v }))} />
                </div>
              </div>

              {/* Coefficients */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Coefficients de correction (0–1)</p>
                <div className="grid grid-cols-2 gap-3">
                  <NF label="Coeff. fraîcheur" value={form.correctionFraicheur} onChange={v => setForm(f => ({ ...f, correctionFraicheur: v }))} />
                  <NF label="Coeff. weekend" value={form.correctionWeekend} onChange={v => setForm(f => ({ ...f, correctionWeekend: v }))} />
                  <NF label="Coeff. fériés" value={form.correctionFerie} onChange={v => setForm(f => ({ ...f, correctionFerie: v }))} />
                  <NF label="Coeff. occupation" value={form.correctionOuvres} onChange={v => setForm(f => ({ ...f, correctionOuvres: v }))} />
                </div>
              </div>

              {/* Heures journalières */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Heures d'usage journalières (h/j)</p>
                <div className="grid grid-cols-3 gap-3">
                  <NF label="Éclairage" value={form.tpsEcl} onChange={v => setForm(f => ({ ...f, tpsEcl: v }))} />
                  <NF label="Climatisation" value={form.tpsClim} onChange={v => setForm(f => ({ ...f, tpsClim: v }))} />
                  <NF label="Informatique" value={form.tpsInform} onChange={v => setForm(f => ({ ...f, tpsInform: v }))} />
                  <NF label="Électroménager" value={form.tpsElectrom} onChange={v => setForm(f => ({ ...f, tpsElectrom: v }))} />
                  <NF label="Serveur" value={form.tpsServeur} onChange={v => setForm(f => ({ ...f, tpsServeur: v }))} />
                </div>
              </div>

              {/* Live preview */}
              <HoursPreview form={form} />
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#1a1d2e] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Supprimer «{deleteTarget?.typeFonctionnel}» ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Les heures préfills des pièces de ce type ne seront plus calculées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
