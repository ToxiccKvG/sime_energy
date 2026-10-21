import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ─── DuplicateDialog ──────────────────────────────────────────────────────────

export function DuplicateDialog({ open, onOpenChange, count, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');

  const handleOpen = (v: boolean) => {
    if (v) setName(`Questionnaire ${count + 1}`);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Dupliquer le questionnaire</DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-1.5">
          <Label className="text-slate-400 text-sm">Nom du nouveau questionnaire</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onConfirm(name.trim()); onOpenChange(false); } }}
            placeholder="Ex: Building Communal — Visite 2"
            className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-blue-500"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200">
            Annuler
          </Button>
          <Button
            onClick={() => { if (name.trim()) { onConfirm(name.trim()); onOpenChange(false); } }}
            disabled={!name.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
