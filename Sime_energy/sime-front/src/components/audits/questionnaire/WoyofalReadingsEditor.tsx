import { Plus, X } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MesureReading } from '@/types/audit';
import {
  WOYOFAL_CODE_GROUPS, WOYOFAL_TIME_CODES, WOYOFAL_DATE_CODES, WOYOFAL_NUMBER_CODES,
  WOYOFAL_TOKEN_CODES,
} from '@/constants/pv-questionnaire-schema';
import { ReadingDateOnlyPicker, ReadingTimePicker } from './reading-pickers';
import { WoyofalReading } from './reading-types';

export function WoyofalReadingsEditor({ readings, onChange }: {
  readings: WoyofalReading[];
  onChange: (readings: MesureReading[]) => void;
}) {
  const add    = () => onChange([...readings, { kind: 'woyofal', id: crypto.randomUUID(), code: '', valeur: '' }]);
  const remove = (id: string) => onChange(readings.filter((r) => r.id !== id));
  const update = (id: string, field: 'code' | 'valeur', val: string) =>
    onChange(readings.map((r) => r.id === id ? { ...r, [field]: val } : r));

  return (
    <div className="space-y-2">
      {readings.length > 0 && (
        <div className="rounded-md border border-amber-500/20 overflow-hidden">
          <div className="grid grid-cols-[1.8fr_1fr_24px] gap-2 border-b border-amber-500/15 bg-amber-500/5 px-3 py-1.5">
            <span className="text-[10px] font-medium text-amber-400/70 uppercase tracking-wide">Code Woyofal</span>
            <span className="text-[10px] font-medium text-amber-400/70 uppercase tracking-wide">Valeur relevée</span>
            <span />
          </div>
          {readings.map((r, i) => (
            <div key={r.id} className={cn('grid grid-cols-[1.8fr_1fr_24px] gap-2 px-2 py-1 items-center border-b border-amber-500/10 last:border-0 group', i % 2 === 1 && 'bg-amber-500/5')}>
              <Select value={r.code || undefined} onValueChange={(val) => update(r.id, 'code', val)}>
                <SelectTrigger className="h-auto rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 focus:ring-1 focus:ring-amber-500/60">
                  <SelectValue placeholder="Sélectionner un code…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {WOYOFAL_CODE_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel className="text-[10px] uppercase tracking-wide text-amber-400/70">{g.group}</SelectLabel>
                      {g.codes.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="font-mono font-medium">{c.code}</span> — {c.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {WOYOFAL_TIME_CODES.has(r.code) ? (
                <ReadingTimePicker value={r.valeur} onChange={(v) => update(r.id, 'valeur', v)} />
              ) : WOYOFAL_DATE_CODES.has(r.code) ? (
                <ReadingDateOnlyPicker value={r.valeur} onChange={(v) => update(r.id, 'valeur', v)} />
              ) : WOYOFAL_NUMBER_CODES.has(r.code) ? (
                <input type="number" value={r.valeur} onChange={(e) => update(r.id, 'valeur', e.target.value)} placeholder="0"
                  className="w-full rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              ) : WOYOFAL_TOKEN_CODES.has(r.code) ? (
                <input type="text" value={r.valeur} onChange={(e) => update(r.id, 'valeur', e.target.value)} placeholder="— token"
                  className="w-full rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/60" />
              ) : (
                <input type="text" value={r.valeur} onChange={(e) => update(r.id, 'valeur', e.target.value)} placeholder="—"
                  className="w-full rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/60" />
              )}
              <button type="button" onClick={() => remove(r.id)}
                className="flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-400 transition-colors">
        <Plus className="h-3 w-3" />
        Ajouter un relevé
      </button>
    </div>
  );
}
