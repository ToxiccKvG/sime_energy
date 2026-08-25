// ============================================================
// IOT MODULE — Onglet 1 : Sources
// Chaque source peut être liée à d'autres sources ("SENELEC + PV")
// ============================================================

import { useState, useRef, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Zap, Sun, Fuel, Activity, GitBranch,
  Check, X, Battery, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import type {
  Source, SourceType, SensorType,
  ModeSource, TransfertEnergie, TypeTableau, ChargeId, ProfilMi, ModeGrid,
} from './shared';
import { SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS, PROFIL_MI_LABELS } from './shared';

// ---- Icônes ----
const TYPE_ICONS: Record<SourceType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  SENELEC:   Zap,
  PV:        Sun,
  BESS:      Battery,
  GROUPE:    Fuel,
  SECOURS:   Fuel,
  CHARGE:    Activity,
  SELECTEUR: GitBranch,
};

const SOURCE_TYPES: SourceType[]     = ['SENELEC', 'PV', 'BESS', 'GROUPE', 'SECOURS', 'CHARGE', 'SELECTEUR'];
const SENSOR_TYPES: SensorType[]     = ['Shelly', 'SMA', 'Voltcraft', 'Fluke', 'DENT', 'Sentinel', 'Manuel', 'Autre'];
const MODES: ModeSource[]            = ['A', 'B', 'C', 'D', 'E', 'F'];
const TRANSFERTS: TransfertEnergie[] = ['Selecteur', 'Inverseur', 'Direct'];
const TABLEAUX: TypeTableau[]        = ['TGBT', 'TD1', 'TD2', 'TD3', 'Autre'];
const CHARGES: { value: ChargeId; label: string }[] = [
  { value: 'CH1_TGBT', label: 'CH1 — TGBT' },
  { value: 'CH2_TGBT', label: 'CH2 — TGBT' },
  { value: 'CH3_TD1',  label: 'CH3 — TD1'  },
  { value: 'CH4_TD2',  label: 'CH4 — TD2'  },
  { value: 'Autre',    label: 'Autre'       },
  { value: '',         label: '—'           },
];
const PROFILS_MI: ProfilMi[] = ['M1_SENELEC', 'M2_SELECTEUR', 'M3_CHARGE', 'M4_GROUPE', 'M5_PV'];
const MODES_GRID: ModeGrid[] = ['ON-GRID', 'OFF-GRID'];

const MODE_COLORS: Record<ModeSource, string> = {
  A: '#22c55e', B: '#3b82f6', C: '#f97316', D: '#ef4444',
  E: '#a855f7', F: '#06b6d4',
};
const MODE_LABELS: Record<ModeSource, string> = {
  A: 'Réseau seul',
  B: 'Hybride réseau+PV',
  C: 'PV+BESS',
  D: 'GROUPE',
  E: 'SENELEC & GE',
  F: 'PV + GE',
};
const PROFIL_MI_COLORS: Record<ProfilMi, string> = {
  M1_SENELEC: '#3b82f6', M2_SELECTEUR: '#a855f7',
  M3_CHARGE: '#ef4444', M4_GROUPE: '#f97316', M5_PV: '#eab308',
};

// Mapping des images pour chaque mode
const MODE_IMAGES: Record<ModeSource, string> = {
  A: '/images/modes/mode-a.png',
  B: '/images/modes/mode-b.png',
  C: '/images/modes/mode-c.png',
  D: '/images/modes/mode-d.png',
  E: '/images/modes/mode-e.png',
  F: '/images/modes/mode-f.png',
};

const DEFAULT_SOURCE: Omit<Source, 'id' | 'ordre'> = {
  nom: '', type: 'SENELEC', description: '',
  couleur: SOURCE_TYPE_COLORS.SENELEC, capteur: 'Shelly', actif: true,
  modes: [], linkedSourceIds: [],
  transfert: 'Direct', tableau: 'TGBT', chargeId: 'CH1_TGBT',
  profilMi: 'M1_SENELEC', modeGrid: 'ON-GRID',
};

// ---- Select générique compact ----
function CellSelect<T extends string>({
  value, options, onChange, placeholder = '—', renderOption,
}: {
  value: T | undefined; options: T[]; onChange: (v: T) => void;
  placeholder?: string; renderOption?: (v: T) => React.ReactNode;
}) {
  return (
    <Select value={value ?? ''} onValueChange={v => onChange(v as T)}>
      <SelectTrigger className="h-8 text-xs bg-white/5 border-white/15 text-white px-2">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1d2e] border-white/20">
        {options.map(o => (
          <SelectItem key={o} value={o} className="text-white text-xs">
            {renderOption ? renderOption(o) : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================
// Ligne source principale avec sources liées inline
// ============================================================
function SourceRow({
  source,
  allSources,
  onEdit,
  onSetActif,
  onDelete,
  onUnlink,
  onAddClone,
}: {
  source: Source;
  allSources: Source[];
  onEdit: (src: Source) => void;
  onSetActif: (id: string, actif: boolean) => void;
  onDelete: () => void;
  onUnlink: (targetId: string) => void;
  onAddClone: (baseId: string) => void;
}) {
  const Icon = TYPE_ICONS[source.type];
  const linked = (source.linkedSourceIds ?? [])
    .map(id => allSources.find(s => s.id === id))
    .filter(Boolean) as Source[];

  const basePrefix = source.nom.replace(/\d+$/, '');
  const basePrefixEscaped = basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nextCloneIndex = (() => {
    const indices = allSources
      .map(s => {
        const m = s.nom.match(new RegExp(`^${basePrefixEscaped}(\\d+)$`));
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
    return indices.length ? Math.max(...indices) + 1 : 1;
  })();

  const modes = source.modes ?? [];

  return (
    <div className={`rounded-xl border border-white/10 transition-all ${!source.actif ? 'opacity-40' : 'hover:border-white/20'}`}>
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap">

        {/* ── Source principale ── */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border"
          style={{ backgroundColor: source.couleur + '12', borderColor: source.couleur + '40' }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: source.couleur + '25' }}>
            <Icon className="h-4 w-4" style={{ color: source.couleur }} />
          </div>
          <span className="text-white text-sm font-bold whitespace-nowrap">{source.nom}</span>
          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ color: source.couleur, backgroundColor: source.couleur + '20' }}>
            {source.type}
          </span>
        </div>

        {/* ── Sources liées (+ PV, + BESS…) ── */}
        {linked.map(lsrc => {
          const LIcon = TYPE_ICONS[lsrc.type];
          return (
            <div key={lsrc.id} className="flex items-center gap-2">
              {/* Séparateur + */}
              <span className="text-2xl font-bold text-slate-500 select-none leading-none">+</span>
              {/* Chip source liée */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border group ${!lsrc.actif ? 'opacity-60' : ''}`}
                style={{ backgroundColor: lsrc.couleur + '12', borderColor: lsrc.couleur + '40' }}
              >
                <Switch
                  checked={lsrc.actif}
                  onCheckedChange={(v) => onSetActif(lsrc.id, v)}
                  className="data-[state=checked]:bg-green-500 scale-75"
                  aria-label={`Activer/désactiver ${lsrc.nom}`}
                />
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: lsrc.couleur + '25' }}>
                  <LIcon className="h-4 w-4" style={{ color: lsrc.couleur }} />
                </div>
                <span className="text-white text-sm font-bold whitespace-nowrap">{lsrc.nom}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ color: lsrc.couleur, backgroundColor: lsrc.couleur + '20' }}>
                  {lsrc.type}
                </span>
                {/* Bouton modifier */}
                <button
                  onClick={() => onEdit(lsrc)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-blue-400"
                  title="Modifier cette source"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                {/* Bouton retirer */}
                <button
                  onClick={() => onUnlink(lsrc.id)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
                  title="Retirer cette source"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* ── Bouton + : ajoute automatiquement PV1/PV2… (même logique pour SENELEC/GE) ── */}
        <div className="relative">
          <button
            onClick={() => onAddClone(source.id)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-dashed border-white/25 text-slate-500 hover:text-white hover:border-white/50 transition-all text-xs"
            title={`Ajouter ${basePrefix}${nextCloneIndex}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Badges modes ── */}
        {modes.length > 0 && (
          <div className="flex gap-1">
            {modes.map(m => (
              <span key={m} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: MODE_COLORS[m] + '25', color: MODE_COLORS[m] }}
                title={MODE_LABELS[m]}>
                {m}
              </span>
            ))}
          </div>
        )}

        {/* ── Badge profil Mi ── */}
        {source.profilMi && (
          <Badge className="text-[10px] border-0 px-1.5 py-0.5"
            style={{ backgroundColor: PROFIL_MI_COLORS[source.profilMi] + '25', color: PROFIL_MI_COLORS[source.profilMi] }}>
            {source.profilMi.split('_')[0]}
          </Badge>
        )}

        {/* ── Badge réseau ── */}
        {source.modeGrid && (
          <Badge className={`text-[10px] border-0 px-1.5 py-0.5 ${source.modeGrid === 'ON-GRID' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
            {source.modeGrid}
          </Badge>
        )}

        {/* ── Contrôles ── */}
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={source.actif} onCheckedChange={(v) => onSetActif(source.id, v)}
            className="data-[state=checked]:bg-green-500 scale-75" />
          <Button size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(source)}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Formulaire création / édition source
// ============================================================
function SourceForm({
  draft, onChange, onSave, onCancel,
}: {
  draft: Partial<Source>;
  onChange: (d: Partial<Source>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const f = <K extends keyof Source>(key: K, val: Source[K]) => onChange({ ...draft, [key]: val });

  const toggleMode = (m: ModeSource) => {
    const cur = draft.modes ?? [];
    f('modes', cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m]);
  };

  return (
    <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-4 space-y-3">
      <p className="text-blue-300 text-sm font-semibold">
        {draft.id ? 'Modifier la source' : 'Nouvelle source'}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Nom */}
        <div className="col-span-2 md:col-span-1">
          <label className="text-xs text-slate-400 mb-1 block">Nom *</label>
          <Input value={draft.nom ?? ''} onChange={e => f('nom', e.target.value)}
            placeholder="ex: M1_SENELEC"
            className="h-8 text-xs bg-white/5 border-white/20 text-white" />
        </div>
        {/* Type */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Type</label>
          <CellSelect value={draft.type} options={SOURCE_TYPES}
            onChange={v => onChange({ ...draft, type: v, couleur: SOURCE_TYPE_COLORS[v] })}
            renderOption={v => (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SOURCE_TYPE_COLORS[v] }} />
                {v}
              </span>
            )} />
        </div>
        {/* Capteur */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Capteur</label>
          <CellSelect value={draft.capteur} options={SENSOR_TYPES} onChange={v => f('capteur', v)} />
        </div>
        {/* Profil Mi */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Profil Mi</label>
          <CellSelect value={draft.profilMi} options={PROFILS_MI} onChange={v => f('profilMi', v)}
            renderOption={v => (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROFIL_MI_COLORS[v] }} />
                {v.split('_')[0]}
              </span>
            )} />
        </div>
        {/* Transfert */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Transfert</label>
          <CellSelect value={draft.transfert} options={TRANSFERTS} onChange={v => f('transfert', v)} />
        </div>
        {/* Tableau */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Tableau</label>
          <CellSelect value={draft.tableau} options={TABLEAUX} onChange={v => f('tableau', v)} />
        </div>
        {/* Charge */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Charge</label>
          <Select value={draft.chargeId ?? ''} onValueChange={v => f('chargeId', v as ChargeId)}>
            <SelectTrigger className="h-8 text-xs bg-white/5 border-white/15 text-white px-2">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {CHARGES.map(c => (
                <SelectItem key={c.value || 'none'} value={c.value || 'none'} className="text-white text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Couleur */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Couleur</label>
          <div className="flex items-center gap-2">
            <input type="color" value={draft.couleur ?? '#3b82f6'}
              onChange={e => f('couleur', e.target.value)}
              className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer p-0.5" />
            <span className="text-slate-500 text-xs font-mono">{draft.couleur}</span>
          </div>
        </div>
      </div>

      {/* Modes de fonctionnement */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">Modes de fonctionnement</label>
        <div className="flex gap-2">
          {MODES.map(m => {
            const active = (draft.modes ?? []).includes(m);
            return (
              <button key={m} type="button" onClick={() => toggleMode(m)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={active
                  ? { backgroundColor: MODE_COLORS[m] + '25', borderColor: MODE_COLORS[m], color: MODE_COLORS[m] }
                  : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: '#64748b' }
                }>
                <span className="font-bold">{m}</span>
                <span className="hidden sm:inline font-normal">{MODE_LABELS[m]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Réseau + Actif + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Réseau</label>
            <CellSelect value={draft.modeGrid} options={MODES_GRID} onChange={v => f('modeGrid', v)} />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Switch checked={draft.actif ?? true} onCheckedChange={v => f('actif', v)}
              className="data-[state=checked]:bg-green-500" />
            <span className="text-xs text-slate-400">Active</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-white/10" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" /> Annuler
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white"
            onClick={onSave} disabled={!draft.nom?.trim()}>
            <Check className="h-3.5 w-3.5 mr-1" /> Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
// ============================================================
// Composant pour afficher l'image au survol d'un mode
// ============================================================
function ModeImageTooltip({ mode, children }: { mode: ModeSource; children: React.ReactNode }) {
  const [showImage, setShowImage] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageUrl = MODE_IMAGES[mode];

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setShowImage(true);
    }, 400);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowImage(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {showImage && imageUrl && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[75vw] h-[75vh] flex flex-col">
            <img
              src={imageUrl}
              alt={`Mode ${mode}`}
              className="flex-1 w-full object-contain min-h-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="text-lg text-center mt-4 text-slate-800 font-bold shrink-0">
              {MODE_LABELS[mode]}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// Légende
// ============================================================
function LegendPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
        onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" />
          <span className="text-slate-300 font-medium text-sm">Légende — modèle LEGENDE</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-white/10 p-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <p className="text-slate-300 font-semibold mb-2">Modes</p>
            <div className="space-y-2">
              {MODES.map(m => (
                <ModeImageTooltip key={m} mode={m}>
                  <div className="flex items-center gap-2 cursor-help hover:bg-white/5 p-1 rounded transition-colors">
                    <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: MODE_COLORS[m] + '25', color: MODE_COLORS[m] }}>{m}</span>
                    <span className="text-slate-400">{MODE_LABELS[m]}</span>
                  </div>
                </ModeImageTooltip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-slate-300 font-semibold mb-2">Types de sources</p>
            <div className="space-y-1">
              {SOURCE_TYPES.map(t => {
                const Icon = TYPE_ICONS[t];
                return (
                  <div key={t} className="flex items-center gap-2 text-slate-400">
                    <Icon className="h-3 w-3" style={{ color: SOURCE_TYPE_COLORS[t] }} />
                    <span style={{ color: SOURCE_TYPE_COLORS[t] }} className="font-medium">{t}</span>
                    <span className="text-slate-600 text-[10px]">— {SOURCE_TYPE_LABELS[t]}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-slate-300 font-semibold mb-2">Profils Mi (TCD)</p>
            <div className="space-y-1">
              {PROFILS_MI.map(p => (
                <div key={p} className="flex items-center gap-2 text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROFIL_MI_COLORS[p] }} />
                  <span style={{ color: PROFIL_MI_COLORS[p] }} className="font-medium">{p.split('_')[0]}</span>
                  <span className="text-slate-600 text-[10px]">— {PROFIL_MI_LABELS[p]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-slate-300 font-semibold mb-2">Transfert / Charges</p>
            <div className="space-y-1 text-slate-400">
              <p><span className="text-white">Selecteur</span> — ATS (bascule auto réseau ⇄ PV/groupe)</p>
              <p><span className="text-white">Inverseur</span> — Onduleur (convertit DC→AC PV/batterie)</p>
              <p><span className="text-white">Direct</span> — Raccordement direct au réseau</p>
            </div>
            <div className="space-y-1 text-slate-400 mt-2">
              <p><span className="text-white">CH1_TGBT</span> — Circuit 1 sur le TGBT</p>
              <p><span className="text-white">CH2_TGBT</span> — Circuit 2 sur le TGBT</p>
              <p><span className="text-white">CH3_TD1</span> — Circuit 3 sur le TD1</p>
              <p><span className="text-white">CH4_TD2</span> — Circuit 4 sur le TD2</p>
            </div>
          </div>
          </div>

          {/* Glossaire des abréviations techniques */}
          <div className="border-t border-white/10 pt-3">
            <p className="text-slate-300 font-semibold mb-2">Glossaire des abréviations</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5 text-slate-400">
              {[
                ['TGBT', 'Tableau Général Basse Tension'],
                ['TD1 / TD2 / TD3', 'Tableaux Divisionnaires (sous-tableaux)'],
                ['ATS', 'Automatic Transfer Switch — inverseur de source automatique'],
                ['Onduleur', 'Convertisseur courant continu → alternatif (PV / batterie)'],
                ['SENELEC', 'Réseau électrique national (distributeur Sénégal)'],
                ['PV', 'Panneaux photovoltaïques (production solaire)'],
                ['BESS', 'Battery Energy Storage System — stockage par batterie'],
                ['GROUPE', 'Groupe électrogène (secours)'],
                ['ON-GRID / OFF-GRID', 'Connecté / déconnecté du réseau'],
                ['M1 → M5', 'Points de mesure (SENELEC, sélecteur, charge, groupe, PV)'],
                ['CHi', 'Circuit de charge n°i (départ tableau)'],
                ['kWh / kW', 'Énergie (cumul) / Puissance (instantanée)'],
              ].map(([abbr, desc]) => (
                <p key={abbr}><span className="text-white font-medium">{abbr}</span> — {desc}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Onglet principal
// ============================================================
export function SourcesTab() {
  const { state, addSource, updateSource, removeSource } = useIOT();
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editDraft, setEditDraft]     = useState<Partial<Source>>({});
  const [addDraft, setAddDraft]       = useState<Partial<Source>>({ ...DEFAULT_SOURCE });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLegend, setShowLegend]   = useState(false);
  const [cloneForm, setCloneForm]     = useState<{ baseId: string; nom: string } | null>(null);

  const sortedSources = [...state.sources].sort((a, b) => a.ordre - b.ordre);
  // Les "sources liées" (PV1/PV2..., SENELEC1/...) doivent rester affichées uniquement en chips inline.
  // On cache donc les sources qui sont référencées comme linkedSourceIds par une autre source.
  const parentedIds = new Set<string>(
    state.sources.flatMap(s => (s.linkedSourceIds ?? []))
  );
  const visibleSources = sortedSources.filter(s => !parentedIds.has(s.id));

  const actives = visibleSources.filter(s => s.actif).length;
  const avecData = visibleSources.filter(s => state.sourceData[s.id]?.length > 0).length;

  const handleSetActif = (id: string, actif: boolean) => {
    const src = state.sources.find(s => s.id === id);
    if (src) updateSource(id, { actif });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Supprimer cette source ?')) removeSource(id);
  };

  const handleEdit = (src: Source) => {
    setEditingId(src.id);
    setEditDraft({ ...src });
    setShowAddForm(false);
    setCloneForm(null); // Fermer le formulaire de clone si ouvert
  };

  const handleSaveEdit = () => {
    if (!editingId || !editDraft.nom?.trim()) return;
    updateSource(editingId, editDraft);
    setEditingId(null);
    setEditDraft({});
  };

  const handleSaveNew = () => {
    if (!addDraft.nom?.trim()) return;
    addSource({
      id: `src-${Date.now()}`,
      ordre: state.sources.length,
      nom:             addDraft.nom ?? '',
      type:            addDraft.type ?? 'SENELEC',
      description:     addDraft.description ?? '',
      couleur:         addDraft.couleur ?? SOURCE_TYPE_COLORS.SENELEC,
      capteur:         addDraft.capteur ?? 'Shelly',
      actif:           addDraft.actif ?? true,
      modes:           addDraft.modes ?? [],
      linkedSourceIds: [],
      transfert:       addDraft.transfert,
      tableau:         addDraft.tableau,
      chargeId:        addDraft.chargeId,
      profilMi:        addDraft.profilMi,
      modeGrid:        addDraft.modeGrid,
    });
    setShowAddForm(false);
    setAddDraft({ ...DEFAULT_SOURCE });
  };

  // Source groupée : PV+ -> ajoute PV1/PV2..., SENELEC+ -> SENELEC1/...
  const handleAddClone = (baseId: string) => {
    const base = state.sources.find(s => s.id === baseId);
    if (!base) return;

    const prefix = base.nom.replace(/\d+$/, '');
    const prefixEscaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // "Racine" : PV (sans suffixe numérique) pour que PV1+ n'ajoute pas sous PV1.
    const root = state.sources.find(s => s.nom === prefix && s.type === base.type) ?? base;

    const allFamilyClones = state.sources.filter(s => s.type === base.type && s.nom.match(new RegExp(`^${prefixEscaped}(\\d+)$`)));
    const indices = allFamilyClones
      .map(s => {
        const m = s.nom.match(new RegExp(`^${prefixEscaped}(\\d+)$`));
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    let nextIndex = indices.length ? Math.max(...indices) + 1 : 1;
    let cloneNom = `${prefix}${nextIndex}`;
    while (state.sources.some(s => s.nom === cloneNom)) {
      nextIndex += 1;
      cloneNom = `${prefix}${nextIndex}`;
    }

    // Ouvrir le formulaire de modification du nom
    setCloneForm({ baseId: root.id, nom: cloneNom });
  };

  // Créer la source clonée avec le nom modifié
  const handleCreateClone = () => {
    if (!cloneForm) return;

    const base = state.sources.find(s => s.id === cloneForm.baseId);
    if (!base) return;

    const cloneId = `src-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    addSource({
      id: cloneId,
      ordre: state.sources.length,
      nom: cloneForm.nom,
      type: base.type,
      description: base.description ?? '',
      couleur: base.couleur,
      capteur: base.capteur,
      actif: true,
      modes: base.modes ?? [],
      linkedSourceIds: [],
      transfert: base.transfert,
      tableau: base.tableau,
      chargeId: base.chargeId,
      profilMi: base.profilMi,
      modeGrid: base.modeGrid,
      siteId: base.siteId,
    });

    updateSource(base.id, {
      linkedSourceIds: [...(base.linkedSourceIds ?? []), cloneId],
    });

    setCloneForm(null);
  };

  // Supprimer une source liée
  const handleUnlink = (sourceId: string, targetId: string) => {
    const src = state.sources.find(s => s.id === sourceId);
    if (!src) return;
    
    // Retirer la source des liens de la source parente
    updateSource(sourceId, { linkedSourceIds: (src.linkedSourceIds ?? []).filter(id => id !== targetId) });
    
    // Supprimer complètement la source liée
    removeSource(targetId);
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-4 text-sm text-slate-400">
          <span><span className="text-white font-bold">{visibleSources.length}</span> source(s)</span>
          <span><span className="text-green-400 font-bold">{actives}</span> active(s)</span>
          <span><span className="text-blue-400 font-bold">{avecData}</span> avec données</span>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => { setShowAddForm(true); setEditingId(null); }}
          disabled={showAddForm}>
          <Plus className="h-4 w-4 mr-1" /> Nouvelle source
        </Button>
      </div>

      {/* Formulaire ajout */}
      {showAddForm && (
        <SourceForm
          draft={addDraft}
          onChange={setAddDraft}
          onSave={handleSaveNew}
          onCancel={() => { setShowAddForm(false); setAddDraft({ ...DEFAULT_SOURCE }); }}
        />
      )}

      {/* Formulaire de modification du nom pour les sources clonées */}
      {cloneForm && (
        <div className="bg-green-600/10 border border-green-500/30 rounded-xl p-4 space-y-3">
          <p className="text-green-300 text-sm font-semibold">
            Personnaliser le nom de la nouvelle source
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Nom de la source</label>
              <Input 
                value={cloneForm.nom} 
                onChange={e => setCloneForm({ ...cloneForm, nom: e.target.value })}
                placeholder="ex: SENELEC1, PV2, etc."
                className="h-8 text-xs bg-white/5 border-white/20 text-white" 
              />
            </div>
            <div className="flex gap-2 items-end">
              <Button size="sm" variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-white/10" 
                onClick={() => setCloneForm(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Annuler
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white"
                onClick={handleCreateClone} disabled={!cloneForm.nom?.trim()}>
                <Check className="h-3.5 w-3.5 mr-1" /> Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des sources */}
      <div className="space-y-2">
        {visibleSources.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Zap className="h-14 w-14 opacity-20 mb-4" />
            <p className="text-base font-medium">Aucune source configurée</p>
            <p className="text-sm mt-1 text-slate-600">Créez une source puis liez-en d'autres avec le bouton +</p>
            <Button className="mt-4 bg-blue-600 hover:bg-blue-500 text-white" size="sm"
              onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Créer une source
            </Button>
          </div>
        ) : (
          visibleSources.map(src =>
            editingId === src.id ? (
              <SourceForm
                key={src.id}
                draft={editDraft}
                onChange={setEditDraft}
                onSave={handleSaveEdit}
                onCancel={() => { setEditingId(null); setEditDraft({}); }}
              />
            ) : (
              <SourceRow
                key={src.id}
                source={src}
                allSources={state.sources}
                onEdit={handleEdit}
                onSetActif={handleSetActif}
                onDelete={() => handleDelete(src.id)}
                onUnlink={targetId => handleUnlink(src.id, targetId)}
                onAddClone={handleAddClone}
              />
            )
          )
        )}
        
        {/* Formulaire d'édition pour les sources liées */}
        {editingId && !visibleSources.some(s => s.id === editingId) && (
          <div className="bg-orange-600/10 border border-orange-500/30 rounded-xl p-4 space-y-3">
            <p className="text-orange-300 text-sm font-semibold">
              Modifier une source liée
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nom</label>
                <Input 
                  value={editDraft.nom ?? ''} 
                  onChange={e => setEditDraft({ ...editDraft, nom: e.target.value })}
                  className="h-8 text-xs bg-white/5 border-white/20 text-white" 
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <Input 
                  value={editDraft.description ?? ''} 
                  onChange={e => setEditDraft({ ...editDraft, description: e.target.value })}
                  className="h-8 text-xs bg-white/5 border-white/20 text-white" 
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-white/10" 
                onClick={() => { setEditingId(null); setEditDraft({}); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Annuler
              </Button>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-500 text-white"
                onClick={handleSaveEdit} disabled={!editDraft.nom?.trim()}>
                <Check className="h-3.5 w-3.5 mr-1" /> Enregistrer
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Légende */}
      <LegendPanel open={showLegend} onToggle={() => setShowLegend(v => !v)} />
    </div>
  );
}
