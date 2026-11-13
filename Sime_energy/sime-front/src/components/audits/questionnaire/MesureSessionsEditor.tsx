import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { MesureSession, MesureReading, IndexSubValue } from '@/types/audit';
import { OBIS_TABLE } from '@/constants/pv-questionnaire-schema';
import { NewSessionModal } from './NewSessionModal';
import { SessionCard } from './SessionCard';

// ─── Index fixed rows (prépopulés à la création d'une session INDEX) ──────────

const INDEX_MULTI_VALUE_KEYS = new Set(['Index départ', 'Index fin']);

// Sous-valeurs par défaut : les 21 codes OBIS préchargés (une ligne par code).
const DEFAULT_SUB_VALUES: Omit<IndexSubValue, 'id'>[] = OBIS_TABLE.map((e) => ({ code: e.key, valeur: '' }));

// 'Index départ' et 'Index fin' sont les 2 relevés de référence ; les autres
// paramètres (puissance max demandée, facteur de puissance, etc.) sont saisis
// comme sous-catégories propres à chacun (relevé complet à chaque instant).
const INDEX_FIXED_ROWS = [
  'Index départ',
  'Index fin',
];

// ─── MesureSessionsEditor (main) ──────────────────────────────────────────────

export function MesureSessionsEditor({ sessions, onChange }: {
  sessions: MesureSession[];
  onChange: (sessions: MesureSession[]) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const addSession = (partial: Omit<MesureSession, 'id' | 'readings'>) => {
    const readings: MesureReading[] = partial.type === 'INDEX'
      ? INDEX_FIXED_ROWS.map((label) => ({
          kind: 'index' as const,
          id: crypto.randomUUID(),
          key: label,
          valeur: '',
          date: '',
          fixed: true,
          subValues: INDEX_MULTI_VALUE_KEYS.has(label)
            ? DEFAULT_SUB_VALUES.map((sv) => ({ ...sv, id: crypto.randomUUID() }))
            : [],
        }))
      : [];
    const s: MesureSession = { id: crypto.randomUUID(), readings, ...partial };
    onChange([...sessions, s]);
    setOpenIds((prev) => new Set([...prev, s.id]));
  };

  const removeSession = (id: string) => onChange(sessions.filter((s) => s.id !== id));

  const updateSession = (id: string, updates: Partial<MesureSession>) =>
    onChange(sessions.map((s) => s.id === id ? { ...s, ...updates } : s));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-400/90 uppercase tracking-wide">Relevés de compteurs</p>
        <button type="button" onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-400 transition-colors">
          <Plus className="h-3 w-3" />
          Ajouter une mesure
        </button>
      </div>

      {sessions.length > 0 ? (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              open={openIds.has(session.id)}
              onToggle={() => toggle(session.id)}
              onUpdate={(updates) => updateSession(session.id, updates)}
              onRemove={() => removeSession(session.id)}
            />
          ))}
        </div>
      ) : (
        <div onClick={() => setModalOpen(true)}
          className="rounded-lg border border-dashed border-amber-500/20 bg-amber-500/5 px-4 py-4 text-center cursor-pointer hover:bg-amber-500/10 transition-colors">
          <p className="text-xs text-slate-500">Aucune mesure saisie — cliquez pour ajouter</p>
        </div>
      )}

      <NewSessionModal open={modalOpen} onOpenChange={setModalOpen} onCreate={addSession} />
    </div>
  );
}
