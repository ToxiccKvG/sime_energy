import { Plus, X } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MesureReading, IndexSubValue } from '@/types/audit';
import { OBIS_TABLE, OBIS_BY_KEY } from '@/constants/pv-questionnaire-schema';
import { ReadingDateTimePicker } from './reading-pickers';
import { IndexReading } from './reading-types';

// ─── Index readings table (inside an INDEX session) ───────────────────────────

export function IndexReadingsEditor({ readings, onChange }: {
  readings: IndexReading[];
  onChange: (readings: MesureReading[]) => void;
}) {
  const addCustom = () => onChange([...readings, { kind: 'index', id: crypto.randomUUID(), key: '', valeur: '', date: '' }]);
  const remove    = (id: string) => onChange(readings.filter((r) => r.id !== id));

  const updateField = (id: string, field: 'key' | 'valeur' | 'date', val: string) =>
    onChange(readings.map((r) => r.id === id ? { ...r, [field]: val } : r));

  const addSubValue = (id: string) =>
    onChange(readings.map((r) => {
      if (r.id !== id) return r;
      const sv: IndexSubValue = { id: crypto.randomUUID(), code: '', valeur: '' };
      return { ...r, subValues: [...(r.subValues ?? []), sv] };
    }));

  const updateSubValue = (id: string, svId: string, field: 'code' | 'valeur', val: string) =>
    onChange(readings.map((r) => {
      if (r.id !== id) return r;
      return { ...r, subValues: r.subValues?.map((sv) => sv.id === svId ? { ...sv, [field]: val } : sv) };
    }));

  const removeSubValue = (id: string, svId: string) =>
    onChange(readings.map((r) => {
      if (r.id !== id) return r;
      return { ...r, subValues: r.subValues?.filter((sv) => sv.id !== svId) };
    }));

  const fixedRows  = readings.filter((r) => r.fixed);
  const customRows = readings.filter((r) => !r.fixed);

  // Grille interne des sous-valeurs : Code OBIS | Libellé | Valeur | ✕
  const subGridCls = 'grid grid-cols-[1.3fr_1.6fr_1fr_20px]';

  return (
    <div className="space-y-2">
      {/* Champs standards (prépopulés) */}
      {fixedRows.length > 0 && (
        <div className="rounded-md border border-blue-500/20 overflow-hidden">
          {/* En-tête : Paramètre | Date et heure | (Code OBIS | Libellé | Valeur) */}
          <div className="grid grid-cols-[1.1fr_0.8fr_2.7fr] border-b border-blue-500/15 bg-blue-500/5 px-3 py-1.5 gap-3">
            <span className="text-[10px] font-medium text-blue-400/70 uppercase tracking-wide">Paramètre</span>
            <span className="text-[10px] font-medium text-blue-400/70 uppercase tracking-wide">Date et heure</span>
            <div className={cn(subGridCls, 'gap-1.5')}>
              <span className="text-[10px] font-medium text-blue-400/70 uppercase tracking-wide">Code OBIS</span>
              <span className="text-[10px] font-medium text-blue-400/70 uppercase tracking-wide">Libellé</span>
              <span className="text-[10px] font-medium text-blue-400/70 uppercase tracking-wide">Valeur</span>
              <span />
            </div>
          </div>
          {fixedRows.map((r, i) => (
            <div key={r.id} className={cn(
              'grid grid-cols-[1.1fr_0.8fr_2.7fr] gap-3 px-3 py-2 border-b border-blue-500/10 last:border-0 items-start',
              i % 2 === 1 && 'bg-blue-500/5',
            )}>
              {/* Paramètre (catégorie) */}
              <span className="text-xs text-slate-300 pt-1.5 leading-tight font-medium">{r.key}</span>

              {/* Date et heure (horodatage de la catégorie) */}
              <ReadingDateTimePicker
                value={r.date ?? ''}
                onChange={(v) => updateField(r.id, 'date', v)}
              />

              {/* Sous-valeurs : Code OBIS (dropdown) | Libellé (auto) | Valeur (num.) */}
              <div className="space-y-1.5">
                {(r.subValues ?? []).map((sv) => {
                  const entry = OBIS_BY_KEY[sv.code];
                  return (
                    <div key={sv.id} className={cn(subGridCls, 'gap-1.5 items-center')}>
                      {/* Code OBIS — menu déroulant */}
                      <Select value={sv.code || undefined} onValueChange={(val) => updateSubValue(r.id, sv.id, 'code', val)}>
                        <SelectTrigger className="h-auto rounded border border-blue-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 focus:ring-1 focus:ring-blue-500/60">
                          <SelectValue placeholder="Choisir un code…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {OBIS_TABLE.map((e) => (
                            <SelectItem key={e.key} value={e.key} className="text-xs">
                              {e.code
                                ? <><span className="font-mono font-medium">{e.code}</span> → {e.signification}</>
                                : e.signification}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Libellé — affichage lecture seule dérivé du code */}
                      <span className="text-xs text-slate-400 px-1 leading-tight">
                        {entry?.libelle || <span className="text-slate-600">—</span>}
                      </span>

                      {/* Valeur numérique */}
                      <input
                        type="number"
                        value={sv.valeur}
                        onChange={(e) => updateSubValue(r.id, sv.id, 'valeur', e.target.value)}
                        placeholder="0"
                        className="w-full min-w-0 rounded border border-blue-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />

                      <button type="button" onClick={() => removeSubValue(r.id, sv.id)}
                        className="shrink-0 text-slate-600 hover:text-red-400 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => addSubValue(r.id)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors">
                  <Plus className="h-3 w-3" />
                  Ajouter une ligne
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lignes personnalisées */}
      {customRows.length > 0 && (
        <div className="rounded-md border border-slate-700/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 border-b border-slate-700/30 bg-slate-800/40 px-3 py-1.5">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Libellé personnalisé</span>
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Valeur</span>
            <span />
          </div>
          {customRows.map((r, i) => (
            <div key={r.id} className={cn('grid grid-cols-[1fr_1fr_24px] gap-2 px-2 py-1 items-center border-b border-slate-700/30 last:border-0 group', i % 2 === 1 && 'bg-slate-800/20')}>
              <input type="text" value={r.key} onChange={(e) => updateField(r.id, 'key', e.target.value)} placeholder="Libellé…"
                className="w-full rounded border border-slate-600/40 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60" />
              <input type="text" value={r.valeur} onChange={(e) => updateField(r.id, 'valeur', e.target.value)} placeholder="—"
                className="w-full rounded border border-slate-600/40 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60" />
              <button type="button" onClick={() => remove(r.id)}
                className="flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={addCustom}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors">
        <Plus className="h-3 w-3" />
        Ajouter une ligne personnalisée
      </button>
    </div>
  );
}
