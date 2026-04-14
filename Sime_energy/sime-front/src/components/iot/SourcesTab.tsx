// ============================================================
// IOT MODULE — Onglet 1 : Sources
// Définir et gérer les sources de données énergétiques
// ============================================================

import { useState } from 'react';
import { Plus, Edit2, Trash2, Zap, Sun, Fuel, Activity, GitBranch, GripVertical, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import type { Source, SourceType, SensorType } from './shared';
import { SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from './shared';

// ---- Icônes par type ----
const TYPE_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  SENELEC:   Zap,
  PV:        Sun,
  SECOURS:   Fuel,
  CHARGE:    Activity,
  SELECTEUR: GitBranch,
};

const SENSOR_TYPES: SensorType[] = ['Shelly', 'SMA', 'Voltcraft', 'Fluke', 'DENT', 'Sentinel', 'Manuel', 'Autre'];

const SOURCE_TYPES: SourceType[] = ['SENELEC', 'PV', 'SECOURS', 'CHARGE', 'SELECTEUR'];

// ---- Formulaire d'ajout/édition ----
interface FormState {
  nom: string;
  type: SourceType;
  description: string;
  couleur: string;
  capteur: SensorType;
}

const DEFAULT_FORM: FormState = {
  nom: '',
  type: 'SENELEC',
  description: '',
  couleur: SOURCE_TYPE_COLORS.SENELEC,
  capteur: 'Shelly',
};

function SourceCard({
  source,
  onEdit,
  onToggle,
  onDelete,
}: {
  source: Source;
  onEdit: (s: Source) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = TYPE_ICONS[source.type];
  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${
        source.actif
          ? 'border-white/20 bg-white/5'
          : 'border-white/10 bg-white/2 opacity-50'
      }`}
      style={{ borderLeftColor: source.couleur, borderLeftWidth: 3 }}
    >
      {/* Drag handle */}
      <div className="absolute top-3 right-3 text-slate-600 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex items-start gap-3">
        {/* Icône colorée */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: source.couleur + '20', border: `1px solid ${source.couleur}40` }}
        >
          <Icon className="h-5 w-5" style={{ color: source.couleur }} />
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold">{source.nom}</h3>
            <Badge
              className="text-xs border-0"
              style={{ backgroundColor: source.couleur + '30', color: source.couleur }}
            >
              {source.type}
            </Badge>
            <Badge className="text-xs border-white/20 bg-transparent text-slate-400">
              {source.capteur}
            </Badge>
          </div>
          {source.description && (
            <p className="text-slate-500 text-xs mt-1">{source.description}</p>
          )}
          <p className="text-slate-600 text-xs mt-1">{SOURCE_TYPE_LABELS[source.type]}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
        <Switch
          checked={source.actif}
          onCheckedChange={() => onToggle(source.id)}
          className="data-[state=checked]:bg-green-500"
        />
        <Label className="text-slate-400 text-xs cursor-pointer" onClick={() => onToggle(source.id)}>
          {source.actif ? 'Active' : 'Inactive'}
        </Label>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(source)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            onClick={() => onDelete(source.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Formulaire ----
function SourceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const f = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // Auto-couleur quand le type change
  const handleTypeChange = (type: SourceType) => {
    setForm(prev => ({
      ...prev,
      type,
      couleur: SOURCE_TYPE_COLORS[type],
    }));
  };

  return (
    <div className="bg-white/5 rounded-xl border border-white/20 p-5 space-y-4">
      <h3 className="text-white font-semibold">
        {initial.nom ? 'Modifier la source' : 'Nouvelle source'}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Nom *</Label>
          <Input
            value={form.nom}
            onChange={(e) => f('nom', e.target.value)}
            placeholder="ex : Compteur SENELEC principal"
            className="bg-white/5 border-white/20 text-white"
          />
        </div>

        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Type de source</Label>
          <Select value={form.type} onValueChange={(v) => handleTypeChange(v as SourceType)}>
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {SOURCE_TYPES.map(t => (
                <SelectItem key={t} value={t} className="text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SOURCE_TYPE_COLORS[t] }} />
                    {t} — {SOURCE_TYPE_LABELS[t]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Capteur / Appareil</Label>
          <Select value={form.capteur} onValueChange={(v) => f('capteur', v as SensorType)}>
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {SENSOR_TYPES.map(s => (
                <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Couleur de courbe</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.couleur}
              onChange={(e) => f('couleur', e.target.value)}
              className="w-10 h-9 rounded border border-white/20 bg-transparent cursor-pointer p-0.5"
            />
            <span className="text-slate-400 text-sm font-mono">{form.couleur}</span>
            <div className="w-6 h-6 rounded ml-1" style={{ backgroundColor: form.couleur }} />
          </div>
        </div>

        <div className="col-span-2">
          <Label className="text-slate-400 text-xs mb-1 block">Description</Label>
          <Input
            value={form.description}
            onChange={(e) => f('description', e.target.value)}
            placeholder="ex : Compteur principal bâtiment A, tarif TG"
            className="bg-white/5 border-white/20 text-white"
          />
        </div>
      </div>

      {/* Prévisualisation */}
      <div
        className="rounded-lg border p-3 flex items-center gap-3"
        style={{ borderColor: form.couleur + '60', backgroundColor: form.couleur + '10' }}
      >
        {(() => { const Icon = TYPE_ICONS[form.type]; return <Icon className="h-5 w-5" style={{ color: form.couleur }} />; })()}
        <div>
          <p className="text-white font-medium text-sm">{form.nom || '(nom)'}</p>
          <p className="text-slate-400 text-xs">{form.type} · {form.capteur}</p>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Annuler
        </Button>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => onSave(form)}
          disabled={!form.nom.trim()}
        >
          <Check className="h-4 w-4 mr-1" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ---- Onglet principal ----
export function SourcesTab() {
  const { state, addSource, updateSource, removeSource } = useIOT();
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  const sortedSources = [...state.sources].sort((a, b) => a.ordre - b.ordre);

  const handleToggle = (id: string) => {
    const src = state.sources.find(s => s.id === id);
    if (src) updateSource(id, { actif: !src.actif });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Supprimer cette source ?')) removeSource(id);
  };

  const handleSave = (form: FormState) => {
    if (editingSource) {
      updateSource(editingSource.id, form);
      setEditingSource(null);
    } else {
      addSource({
        id: `src-${Date.now()}`,
        ...form,
        actif: true,
        ordre: state.sources.length,
      });
      setShowForm(false);
    }
  };

  const handleEdit = (src: Source) => {
    setEditingSource(src);
    setShowForm(false);
  };

  // Statistiques
  const actives  = sortedSources.filter(s => s.actif).length;
  const avecData = sortedSources.filter(s => state.sourceData[s.id]?.length > 0).length;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm text-slate-400">
          <span><span className="text-white font-bold">{sortedSources.length}</span> source(s)</span>
          <span><span className="text-green-400 font-bold">{actives}</span> active(s)</span>
          <span><span className="text-blue-400 font-bold">{avecData}</span> avec données</span>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => { setShowForm(true); setEditingSource(null); }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nouvelle source
        </Button>
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <SourceForm
          initial={DEFAULT_FORM}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Liste des sources */}
      {sortedSources.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Zap className="h-16 w-16 opacity-20 mb-4" />
          <p className="text-lg font-medium">Aucune source définie</p>
          <p className="text-sm mt-1">Créez une source pour commencer à importer des données</p>
          <Button
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Créer une source
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedSources.map(src =>
            editingSource?.id === src.id ? (
              <div key={src.id} className="md:col-span-2 xl:col-span-3">
                <SourceForm
                  initial={{ nom: src.nom, type: src.type, description: src.description, couleur: src.couleur, capteur: src.capteur }}
                  onSave={handleSave}
                  onCancel={() => setEditingSource(null)}
                />
              </div>
            ) : (
              <SourceCard
                key={src.id}
                source={src}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      )}

      {/* Légende des types */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <h4 className="text-slate-300 font-medium text-sm mb-3">Types de sources disponibles</h4>
        <div className="flex flex-wrap gap-3">
          {SOURCE_TYPES.map(type => {
            const Icon = TYPE_ICONS[type];
            return (
              <div key={type} className="flex items-center gap-2 text-sm">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ backgroundColor: SOURCE_TYPE_COLORS[type] + '20' }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: SOURCE_TYPE_COLORS[type] }} />
                </div>
                <span className="text-slate-400">{type}</span>
                <span className="text-slate-600 text-xs">— {SOURCE_TYPE_LABELS[type]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
