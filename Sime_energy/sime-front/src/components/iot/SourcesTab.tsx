// ============================================================
// IOT MODULE — Onglet 1 : Sources (Plan de comptage & bilan)
// Architecture : ARRIVÉES → GÉNÉRAL → DÉPARTS
// Règle : Σ ARRIVÉES = GÉNÉRAL = Σ DÉPARTS
// ============================================================

import { useState, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, Zap, Sun, Fuel, Activity, GitBranch,
  GripVertical, Check, X, ArrowRight, AlertTriangle,
  CheckCircle2, Info, BarChart2,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import type { Source, SourceType, SensorType, SourceRole, UsageType, TimeSeriesRow } from './shared';
import {
  SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS,
  SOURCE_ROLE_COLORS, SOURCE_ROLE_LABELS,
  USAGE_TYPE_COLORS, USAGE_TYPES,
} from './shared';

// ── Backward-compat helper ────────────────────────────────
function resolveRole(source: Source): SourceRole {
  if (source.role) return source.role;
  if (source.type === 'CHARGE') return 'DEPART';
  if (source.type === 'SELECTEUR') return 'GENERAL';
  return 'ARRIVEE';
}

// ── Icons per type ────────────────────────────────────────
const TYPE_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  SENELEC:   Zap,
  PV:        Sun,
  SECOURS:   Fuel,
  CHARGE:    Activity,
  SELECTEUR: GitBranch,
};

// ── Dropdown lists ────────────────────────────────────────
const SENSOR_TYPES: SensorType[] = ['Shelly', 'SMA', 'Voltcraft', 'Fluke', 'DENT', 'Sentinel', 'Manuel', 'Autre'];
const ALL_SOURCE_TYPES: SourceType[] = ['SENELEC', 'PV', 'SECOURS', 'CHARGE', 'SELECTEUR'];
const ARRIVEE_TYPES: SourceType[] = ['SENELEC', 'PV', 'SECOURS'];
const ROLES: SourceRole[] = ['ARRIVEE', 'GENERAL', 'DEPART'];

const ROLE_DESCRIPTIONS: Record<SourceRole, string> = {
  ARRIVEE: 'Source d\'énergie entrante (SENELEC, PV, GE)',
  GENERAL: 'Compteur global — mesure la totalité du site',
  DEPART:  'Circuit de consommation — usage ou zone',
};

// ── kWh sum helper ────────────────────────────────────────
function sumKwh(rows: TimeSeriesRow[] | undefined): number | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.energieKwh, 0);
}

// ═══════════════════════════════════════════════════════════
// SOURCE FORM
// ═══════════════════════════════════════════════════════════

interface FormState {
  nom: string;
  role: SourceRole;
  type: SourceType;
  description: string;
  couleur: string;
  capteur: SensorType;
  usageType: UsageType | '';
  entite: string;
  puissanceInstallee: string;
}

const DEFAULT_FORM: FormState = {
  nom: '', role: 'ARRIVEE', type: 'SENELEC',
  description: '', couleur: SOURCE_TYPE_COLORS.SENELEC,
  capteur: 'Shelly', usageType: '', entite: '', puissanceInstallee: '',
};

function formFromSource(s: Source): FormState {
  return {
    nom: s.nom,
    role: resolveRole(s),
    type: s.type,
    description: s.description,
    couleur: s.couleur,
    capteur: s.capteur,
    usageType: s.usageType ?? '',
    entite: s.entite ?? '',
    puissanceInstallee: s.puissanceInstallee != null ? String(s.puissanceInstallee) : '',
  };
}

function SourceForm({
  initial, onSave, onCancel,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleRoleChange = (role: SourceRole) => {
    setForm(p => ({
      ...p,
      role,
      type: role === 'DEPART' ? 'CHARGE' : p.type === 'CHARGE' ? 'SENELEC' : p.type,
      couleur: SOURCE_ROLE_COLORS[role],
    }));
  };

  const availableTypes =
    form.role === 'ARRIVEE' ? ARRIVEE_TYPES :
    form.role === 'DEPART'  ? (['CHARGE'] as SourceType[]) :
    ALL_SOURCE_TYPES;

  const Icon = TYPE_ICONS[form.type];

  return (
    <div className="bg-white/5 rounded-xl border border-white/20 p-5 space-y-5">
      <h3 className="text-white font-semibold">
        {initial.nom ? 'Modifier la source' : 'Nouvelle source'}
      </h3>

      {/* Rôle */}
      <div>
        <Label className="text-slate-400 text-xs mb-2 block">Rôle dans le plan de comptage *</Label>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map(role => (
            <button
              key={role}
              type="button"
              onClick={() => handleRoleChange(role)}
              className="rounded-lg border p-3 text-left transition-all"
              style={form.role === role ? {
                borderColor: SOURCE_ROLE_COLORS[role],
                backgroundColor: SOURCE_ROLE_COLORS[role] + '18',
              } : { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              <div className="font-semibold text-sm" style={{ color: form.role === role ? SOURCE_ROLE_COLORS[role] : '#94a3b8' }}>
                {SOURCE_ROLE_LABELS[role]}
              </div>
              <div className="text-slate-500 text-xs mt-0.5 leading-tight">{ROLE_DESCRIPTIONS[role]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Nom */}
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Nom *</Label>
          <Input
            value={form.nom}
            onChange={e => upd('nom', e.target.value)}
            placeholder="ex : Compteur SENELEC principal"
            className="bg-white/5 border-white/20 text-white"
          />
        </div>

        {/* Type */}
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Type de source</Label>
          <Select
            value={form.type}
            onValueChange={v => upd('type', v as SourceType)}
            disabled={form.role === 'DEPART'}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {availableTypes.map(t => (
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

        {/* Capteur */}
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Capteur / Appareil</Label>
          <Select value={form.capteur} onValueChange={v => upd('capteur', v as SensorType)}>
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

        {/* Puissance installée */}
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Puissance installée (kW)</Label>
          <Input
            type="number"
            value={form.puissanceInstallee}
            onChange={e => upd('puissanceInstallee', e.target.value)}
            placeholder="ex : 45"
            className="bg-white/5 border-white/20 text-white"
          />
        </div>

        {/* Couleur */}
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Couleur de courbe</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.couleur}
              onChange={e => upd('couleur', e.target.value)}
              className="w-10 h-9 rounded border border-white/20 bg-transparent cursor-pointer p-0.5"
            />
            <span className="text-slate-400 text-sm font-mono">{form.couleur}</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: form.couleur }} />
          </div>
        </div>

        {/* DEPART — Type d'usage */}
        {form.role === 'DEPART' && (
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Type d'usage</Label>
            <Select value={form.usageType} onValueChange={v => upd('usageType', v as UsageType | '')}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d2e] border-white/20">
                {USAGE_TYPES.map(u => (
                  <SelectItem key={u} value={u} className="text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: USAGE_TYPE_COLORS[u] }} />
                      {u}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Description */}
        <div className={form.role === 'DEPART' ? '' : 'col-span-2'}>
          <Label className="text-slate-400 text-xs mb-1 block">Description</Label>
          <Input
            value={form.description}
            onChange={e => upd('description', e.target.value)}
            placeholder="ex : Circuit éclairage bâtiment A"
            className="bg-white/5 border-white/20 text-white"
          />
        </div>

        {/* DEPART — Entité / Zone */}
        {form.role === 'DEPART' && (
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Entité / Zone</Label>
            <Input
              value={form.entite}
              onChange={e => upd('entite', e.target.value)}
              placeholder="ex : Atelier 1, Bâtiment B"
              className="bg-white/5 border-white/20 text-white"
            />
          </div>
        )}
      </div>

      {/* Prévisualisation */}
      <div
        className="rounded-lg border p-3 flex items-center gap-3"
        style={{ borderColor: form.couleur + '60', backgroundColor: form.couleur + '10' }}
      >
        <Icon className="h-5 w-5 shrink-0" style={{ color: form.couleur }} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-medium text-sm">{form.nom || '(nom)'}</p>
            <Badge
              className="text-xs border-0 px-1.5 py-0"
              style={{ backgroundColor: SOURCE_ROLE_COLORS[form.role] + '30', color: SOURCE_ROLE_COLORS[form.role] }}
            >
              {SOURCE_ROLE_LABELS[form.role]}
            </Badge>
          </div>
          <p className="text-slate-400 text-xs mt-0.5">
            {form.type} · {form.capteur}
            {form.usageType && ` · ${form.usageType}`}
            {form.entite && ` · ${form.entite}`}
            {form.puissanceInstallee && ` · ${form.puissanceInstallee} kW`}
          </p>
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

// ═══════════════════════════════════════════════════════════
// SOURCE CARD
// ═══════════════════════════════════════════════════════════

function SourceCard({
  source, onEdit, onToggle, onDelete, kwh,
}: {
  source: Source;
  onEdit: (s: Source) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  kwh: number | null;
}) {
  const Icon = TYPE_ICONS[source.type];
  const role = resolveRole(source);
  const roleColor = SOURCE_ROLE_COLORS[role];

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${
        source.actif ? 'border-white/20 bg-white/5' : 'border-white/10 bg-white/[0.02] opacity-50'
      }`}
      style={{ borderLeftColor: source.couleur, borderLeftWidth: 3 }}
    >
      <div className="absolute top-3 right-3 text-slate-600 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: source.couleur + '20', border: `1px solid ${source.couleur}40` }}
        >
          <Icon className="h-5 w-5" style={{ color: source.couleur }} />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-sm">{source.nom}</h3>
            <Badge
              className="text-xs border-0 px-1.5 py-0"
              style={{ backgroundColor: roleColor + '25', color: roleColor }}
            >
              {SOURCE_ROLE_LABELS[role]}
            </Badge>
            {source.usageType && (
              <Badge
                className="text-xs border-0 px-1.5 py-0"
                style={{
                  backgroundColor: USAGE_TYPE_COLORS[source.usageType] + '25',
                  color: USAGE_TYPE_COLORS[source.usageType],
                }}
              >
                {source.usageType}
              </Badge>
            )}
            {source.entite && (
              <Badge className="text-xs bg-transparent border-white/15 text-slate-400 px-1.5 py-0">
                {source.entite}
              </Badge>
            )}
          </div>

          <div className="text-slate-500 text-xs mt-1">
            {source.type} · {source.capteur}
            {source.puissanceInstallee != null && ` · ${source.puissanceInstallee} kW`}
          </div>

          {source.description && (
            <p className="text-slate-600 text-xs mt-0.5 truncate">{source.description}</p>
          )}

          {kwh !== null && (
            <div className="mt-2">
              <span
                className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: source.couleur + '20', color: source.couleur }}
              >
                {kwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWh
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
        <Switch
          checked={source.actif}
          onCheckedChange={() => onToggle(source.id)}
          className="data-[state=checked]:bg-green-500"
        />
        <Label
          className="text-slate-400 text-xs cursor-pointer"
          onClick={() => onToggle(source.id)}
        >
          {source.actif ? 'Active' : 'Inactive'}
        </Label>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(source)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost"
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

// ═══════════════════════════════════════════════════════════
// PLAN DE COMPTAGE — schéma visuel
// ═══════════════════════════════════════════════════════════

function PlanDeComptageSchema({ sources }: { sources: Source[] }) {
  const byRole = {
    ARRIVEE: sources.filter(s => resolveRole(s) === 'ARRIVEE'),
    GENERAL: sources.filter(s => resolveRole(s) === 'GENERAL'),
    DEPART:  sources.filter(s => resolveRole(s) === 'DEPART'),
  };

  const Column = ({ role, list }: { role: SourceRole; list: Source[] }) => {
    const color = SOURCE_ROLE_COLORS[role];
    return (
      <div className="flex-1 min-w-0">
        <div
          className="rounded-t-lg px-3 py-2 border border-b-0 text-center"
          style={{ borderColor: color + '50', backgroundColor: color + '15' }}
        >
          <div className="font-bold text-xs tracking-wide" style={{ color }}>
            {SOURCE_ROLE_LABELS[role].toUpperCase()}S
          </div>
          <div className="text-slate-500 text-xs">
            {list.length} source{list.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div
          className="rounded-b-lg border border-t-0 p-2 min-h-[72px] space-y-1"
          style={{ borderColor: color + '40', backgroundColor: color + '06' }}
        >
          {list.length === 0 ? (
            <p className="text-slate-700 text-xs text-center py-4 italic">vide</p>
          ) : list.map(s => {
            const Icon = TYPE_ICONS[s.type];
            return (
              <div key={s.id} className="flex items-center gap-1.5 px-1 py-0.5">
                <Icon className="h-3 w-3 shrink-0" style={{ color: s.couleur }} />
                <span className="text-slate-300 text-xs truncate">{s.nom}</span>
                {!s.actif && <span className="text-slate-600 text-xs ml-auto">off</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="h-4 w-4 text-slate-400" />
        <h4 className="text-slate-300 font-medium text-sm">Schéma du plan de comptage</h4>
      </div>
      <div className="flex items-center gap-1.5">
        <Column role="ARRIVEE" list={byRole.ARRIVEE} />
        <ArrowRight className="h-5 w-5 text-slate-600 shrink-0 mt-4" />
        <Column role="GENERAL" list={byRole.GENERAL} />
        <ArrowRight className="h-5 w-5 text-slate-600 shrink-0 mt-4" />
        <Column role="DEPART"  list={byRole.DEPART} />
      </div>
      <p className="text-slate-700 text-xs mt-2 text-center font-mono">
        Σ Arrivées = Général = Σ Départs
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BILAN DE COHÉRENCE
// ═══════════════════════════════════════════════════════════

function CoherencePanel({
  sources, sourceData,
}: {
  sources: Source[];
  sourceData: Record<string, TimeSeriesRow[]>;
}) {
  const actives  = sources.filter(s => s.actif);
  const arrivees = actives.filter(s => resolveRole(s) === 'ARRIVEE');
  const generaux = actives.filter(s => resolveRole(s) === 'GENERAL');
  const departs  = actives.filter(s => resolveRole(s) === 'DEPART');

  const kwhOf = (id: string) => sumKwh(sourceData[id]);

  const hasA = arrivees.some(s => kwhOf(s.id) !== null);
  const hasG = generaux.some(s => kwhOf(s.id) !== null);
  const hasD = departs.some(s => kwhOf(s.id) !== null);

  const sumA = arrivees.reduce((acc, s) => { const v = kwhOf(s.id); return v !== null ? acc + v : acc; }, 0);
  const sumG = generaux.reduce((acc, s) => { const v = kwhOf(s.id); return v !== null ? acc + v : acc; }, 0);
  const sumD = departs.reduce((acc, s)  => { const v = kwhOf(s.id); return v !== null ? acc + v : acc; }, 0);

  if (!hasA && !hasG && !hasD) {
    return (
      <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl border border-white/10 px-4 py-3">
        <Info className="h-4 w-4 text-slate-600 shrink-0" />
        <p className="text-slate-600 text-xs">
          Chargez des données via l'onglet <strong className="text-slate-400">Upload</strong> pour afficher le bilan de cohérence
        </p>
      </div>
    );
  }

  const ecartAG = (hasA && hasG && sumG > 0) ? Math.abs(sumA - sumG) / sumG * 100 : null;
  const ref     = hasG ? sumG : sumA;
  const ecartGD = (hasD && ref > 0) ? Math.abs(ref - sumD) / ref * 100 : null;

  const statusColor = (pct: number | null) =>
    pct === null ? '#4b5563' : pct < 2 ? '#22c55e' : pct < 5 ? '#f59e0b' : '#ef4444';

  const EcartBadge = ({ pct, label }: { pct: number | null; label: string }) => {
    if (pct === null) return <span className="text-slate-600 text-xs">{label} : —</span>;
    const color = statusColor(pct);
    return (
      <div className="flex items-center gap-1">
        {pct < 2
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          : <AlertTriangle className="h-3.5 w-3.5" style={{ color }} />
        }
        <span className="text-xs font-medium" style={{ color }}>
          {label} : {pct.toFixed(1)}%{pct < 2 ? ' ✓' : ''}
        </span>
      </div>
    );
  };

  const Metric = ({ label, value, hasData, color }: {
    label: string; value: number; hasData: boolean; color: string;
  }) => (
    <div className="flex-1 text-center">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      {hasData
        ? <div className="text-xl font-bold tabular-nums" style={{ color }}>
            {value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
            <span className="text-xs font-normal text-slate-500 ml-1">kWh</span>
          </div>
        : <div className="text-slate-600 text-base">—</div>
      }
    </div>
  );

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 space-y-3">
      <h4 className="text-slate-300 font-medium text-sm">Bilan de cohérence</h4>
      <div className="flex gap-3 items-center">
        <Metric label="Σ Arrivées" value={sumA} hasData={hasA} color={SOURCE_ROLE_COLORS.ARRIVEE} />
        <div className="w-px h-10 bg-white/10" />
        <Metric label="Général"    value={sumG} hasData={hasG} color={SOURCE_ROLE_COLORS.GENERAL} />
        <div className="w-px h-10 bg-white/10" />
        <Metric label="Σ Départs"  value={sumD} hasData={hasD} color={SOURCE_ROLE_COLORS.DEPART}  />
      </div>
      <div className="flex gap-5 pt-1 border-t border-white/10">
        <EcartBadge pct={ecartAG} label="Écart Arr./Gén." />
        <EcartBadge pct={ecartGD} label="Écart Gén./Dép." />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BILAN PAR RÉPARTITION
// ═══════════════════════════════════════════════════════════

function BilanRepartition({
  sources, sourceData,
}: {
  sources: Source[];
  sourceData: Record<string, TimeSeriesRow[]>;
}) {
  const departs  = sources.filter(s => s.actif && resolveRole(s) === 'DEPART');
  const generaux = sources.filter(s => s.actif && resolveRole(s) === 'GENERAL');
  const arrivees = sources.filter(s => s.actif && resolveRole(s) === 'ARRIVEE');

  const departData = departs
    .map(s => ({ source: s, kwh: sumKwh(sourceData[s.id]) }))
    .filter((d): d is { source: Source; kwh: number } => d.kwh !== null);

  if (departData.length === 0) return null;

  const sumG = generaux.reduce((acc, s) => { const v = sumKwh(sourceData[s.id]); return v ? acc + v : acc; }, 0);
  const sumA = arrivees.reduce((acc, s) => { const v = sumKwh(sourceData[s.id]); return v ? acc + v : acc; }, 0);
  const hasG = generaux.some(s => sumKwh(sourceData[s.id]) !== null);
  const ref  = hasG ? sumG : sumA || departData.reduce((acc, d) => acc + d.kwh, 0);
  const nonMesure = Math.max(0, ref - departData.reduce((acc, d) => acc + d.kwh, 0));

  const pieData = [
    ...departData.map(d => ({ name: d.source.nom, value: d.kwh, color: d.source.couleur })),
    ...(nonMesure > 0.5 ? [{ name: 'Non mesuré', value: nonMesure, color: '#374151' }] : []),
  ];

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-slate-300 font-medium text-sm">Bilan par répartition</h4>
        <span className="text-slate-600 text-xs">
          — réf. {ref.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh
        </span>
      </div>

      <div className="flex gap-4">
        {/* Donut */}
        <div className="w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={38} outerRadius={66}
                dataKey="value" paddingAngle={2}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: number) => [
                  `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWh`, '',
                ]}
                contentStyle={{
                  backgroundColor: '#1a1d2e',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, fontSize: 12,
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Table détail */}
        <div className="flex-1 min-w-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-slate-500 font-normal pb-2 text-xs">Source</th>
                <th className="text-right text-slate-500 font-normal pb-2 text-xs">kWh</th>
                <th className="text-right text-slate-500 font-normal pb-2 text-xs pr-1">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {departData.map(({ source, kwh }) => {
                const pct = ref > 0 ? kwh / ref * 100 : 0;
                return (
                  <tr key={source.id} className="border-b border-white/5">
                    <td className="py-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: source.couleur }} />
                        <span className="text-slate-300 text-xs">{source.nom}</span>
                        {source.usageType && (
                          <Badge
                            className="text-xs border-0 px-1 py-0"
                            style={{
                              backgroundColor: USAGE_TYPE_COLORS[source.usageType] + '25',
                              color: USAGE_TYPE_COLORS[source.usageType],
                            }}
                          >
                            {source.usageType}
                          </Badge>
                        )}
                        {source.entite && (
                          <span className="text-slate-600 text-xs">{source.entite}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right text-slate-300 text-xs py-1.5 tabular-nums">
                      {kwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: source.couleur }}
                          />
                        </div>
                        <span className="text-slate-300 text-xs tabular-nums w-10 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {nonMesure > 0.5 && (
                <tr>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-700" />
                      <span className="text-slate-600 text-xs italic">Non mesuré</span>
                    </div>
                  </td>
                  <td className="text-right text-slate-600 text-xs py-1.5 tabular-nums">
                    {nonMesure.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <span className="text-slate-600 text-xs tabular-nums">
                      {(nonMesure / ref * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function SourcesTab() {
  const { state, addSource, updateSource, removeSource } = useIOT();
  const [showForm, setShowForm]       = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  const sorted = useMemo(
    () => [...state.sources].sort((a, b) => a.ordre - b.ordre),
    [state.sources],
  );

  const byRole = useMemo(() => ({
    ARRIVEE: sorted.filter(s => resolveRole(s) === 'ARRIVEE'),
    GENERAL: sorted.filter(s => resolveRole(s) === 'GENERAL'),
    DEPART:  sorted.filter(s => resolveRole(s) === 'DEPART'),
  }), [sorted]);

  const handleToggle = (id: string) => {
    const src = state.sources.find(s => s.id === id);
    if (src) updateSource(id, { actif: !src.actif });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Supprimer cette source ?')) removeSource(id);
  };

  const handleSave = (form: FormState) => {
    const patch: Partial<Source> = {
      nom: form.nom,
      role: form.role,
      type: form.type,
      description: form.description,
      couleur: form.couleur,
      capteur: form.capteur,
      usageType: form.usageType || undefined,
      entite: form.entite || undefined,
      puissanceInstallee: form.puissanceInstallee ? parseFloat(form.puissanceInstallee) : undefined,
    };
    if (editingSource) {
      updateSource(editingSource.id, patch);
      setEditingSource(null);
    } else {
      addSource({ id: `src-${Date.now()}`, actif: true, ordre: state.sources.length, ...patch } as Source);
      setShowForm(false);
    }
  };

  const handleEdit = (src: Source) => {
    setEditingSource(src);
    setShowForm(false);
  };

  const actives  = sorted.filter(s => s.actif).length;
  const avecData = sorted.filter(s => (state.sourceData[s.id]?.length ?? 0) > 0).length;

  const RoleSection = ({ role, list }: { role: SourceRole; list: Source[] }) => {
    if (list.length === 0) return null;
    const color = SOURCE_ROLE_COLORS[role];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <div
            className="px-3 py-0.5 rounded-full text-xs font-semibold border tracking-wide"
            style={{ borderColor: color + '50', backgroundColor: color + '15', color }}
          >
            {SOURCE_ROLE_LABELS[role].toUpperCase()}S ({list.length})
          </div>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map(src =>
            editingSource?.id === src.id ? (
              <div key={src.id} className="md:col-span-2 xl:col-span-3">
                <SourceForm
                  initial={formFromSource(src)}
                  onSave={handleSave}
                  onCancel={() => setEditingSource(null)}
                />
              </div>
            ) : (
              <SourceCard
                key={src.id}
                source={src}
                kwh={sumKwh(state.sourceData[src.id])}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm text-slate-400">
          <span><span className="text-white font-bold">{sorted.length}</span> source(s)</span>
          <span><span className="text-green-400 font-bold">{actives}</span> active(s)</span>
          {avecData > 0 && (
            <span><span className="text-blue-400 font-bold">{avecData}</span> avec données</span>
          )}
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => { setShowForm(true); setEditingSource(null); }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nouvelle source
        </Button>
      </div>

      {/* Schéma plan de comptage */}
      <PlanDeComptageSchema sources={sorted} />

      {/* Cohérence */}
      <CoherencePanel sources={sorted} sourceData={state.sourceData} />

      {/* Formulaire ajout */}
      {showForm && (
        <SourceForm
          initial={DEFAULT_FORM}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Sources vides */}
      {sorted.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Zap className="h-16 w-16 opacity-20 mb-4" />
          <p className="text-lg font-medium">Aucune source définie</p>
          <p className="text-sm mt-1">Créez des sources pour établir votre plan de comptage</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" /> Créer une source
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {(['ARRIVEE', 'GENERAL', 'DEPART'] as SourceRole[]).map(role => (
            <RoleSection key={role} role={role} list={byRole[role]} />
          ))}
        </div>
      )}

      {/* Bilan répartition */}
      <BilanRepartition sources={sorted} sourceData={state.sourceData} />
    </div>
  );
}
