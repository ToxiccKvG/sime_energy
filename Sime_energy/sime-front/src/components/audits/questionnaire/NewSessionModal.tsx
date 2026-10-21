import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MesureSession } from '@/types/audit';
import { ReadingDateTimePicker } from './reading-pickers';

// ─── New session modal ────────────────────────────────────────────────────────

export function NewSessionModal({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (s: Omit<MesureSession, 'id' | 'readings'>) => void;
}) {
  const [type, setType] = useState<'WOYOFAL' | 'INDEX'>('WOYOFAL');
  const [label, setLabel] = useState('');
  const [dateTime, setDateTime] = useState('');

  useEffect(() => {
    if (open) { setType('WOYOFAL'); setLabel(''); setDateTime(''); }
  }, [open]);

  const handleCreate = () => {
    const fallback = type === 'WOYOFAL' ? 'Campagne Woyofal' : 'Relevé index';
    onCreate({ type, label: label.trim() || fallback, dateTime });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-700/60 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-slate-100">Nouvelle mesure</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Type de compteur</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['INDEX', 'WOYOFAL'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={cn(
                    'px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors text-left',
                    type === t
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600/60 hover:text-slate-300',
                  )}>
                  {t === 'WOYOFAL' ? 'Woyofal (prépayé)' : 'Compteur classique'}
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Nom de la campagne <span className="text-slate-600">(optionnel)</span></Label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={type === 'WOYOFAL' ? 'ex: Campagne lundi matin' : 'ex: Relevé index mardi'}
              className="w-full rounded-lg border border-slate-600/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          </div>

          {/* Date/Heure */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Date et heure de la mesure</Label>
            <ReadingDateTimePicker value={dateTime} onChange={setDateTime} />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-200">
            Annuler
          </Button>
          <Button size="sm" onClick={handleCreate}
            className="bg-amber-600 hover:bg-amber-500 text-white">
            Créer la mesure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
