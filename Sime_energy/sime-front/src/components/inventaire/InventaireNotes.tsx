import { useState, useEffect } from 'react';
import { Save, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getInventoryNotes, saveInventoryNotes } from '@/lib/audit-service';

interface InventaireNotesProps {
  auditId: string;
}

/** Ancien stockage navigateur — lu une seule fois pour reprendre les notes existantes en base */
function legacyStorageKey(id: string) {
  return `simee_inventaire_notes_${id}`;
}

export function InventaireNotes({ auditId }: InventaireNotesProps) {
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNotes('');
    setSaved(true);
    getInventoryNotes(auditId)
      .then(async enBase => {
        let texte = enBase ?? '';
        const local = localStorage.getItem(legacyStorageKey(auditId));
        if (!texte && local) {
          // Reprise des notes saisies avant leur passage en base
          await saveInventoryNotes(auditId, local);
          texte = local;
        }
        if (local != null) localStorage.removeItem(legacyStorageKey(auditId));
        if (!cancelled) setNotes(texte);
      })
      .catch(() => toast.error('Impossible de charger les notes'));
    return () => { cancelled = true; };
  }, [auditId]);

  const handleChange = (v: string) => {
    setNotes(v);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveInventoryNotes(auditId, notes);
      setSaved(true);
      toast.success('Notes sauvegardées');
    } catch {
      toast.error('Échec de la sauvegarde des notes');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [notes]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Constats & Rapport</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${saved ? 'text-slate-600' : 'text-amber-400'}`}>
            {saved ? 'Sauvegardé' : 'Modifications non sauvegardées'}
          </span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saved || saving}
            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Sauvegarder
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500 flex-shrink-0">
        Rédigez vos observations de terrain, anomalies constatées, potentiels d'économies et
        recommandations préliminaires. Raccourci : <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px]">Ctrl+S</kbd>
      </p>

      <Textarea
        value={notes}
        onChange={e => handleChange(e.target.value)}
        placeholder={`Observations générales…\n\nAnomalies constatées :\n- \n\nÉquipements vétustes :\n- \n\nPotentiels d'économies identifiés :\n- \n\nRecommandations :\n- `}
        className="flex-1 min-h-[420px] bg-[#151825] border-slate-700 text-slate-100 placeholder:text-slate-600 text-sm resize-none focus:border-indigo-500/60 leading-relaxed"
      />

      <div className="flex items-center justify-between text-xs text-slate-600 flex-shrink-0">
        <span>{notes.split('\n').length} lignes · {notes.length} caractères</span>
        <span className="text-slate-700">Stockage local navigateur</span>
      </div>
    </div>
  );
}
