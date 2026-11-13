import { useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PVQuestionnaire } from '@/types/audit';

// ─── QuestionnaireTabBar ──────────────────────────────────────────────────────

export function QuestionnaireTabBar({ questionnaires, activeId, onSelect, onAdd, onRemove, onRename }: {
  questionnaires: PVQuestionnaire[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (q: PVQuestionnaire, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(q.id);
    setEditValue(q.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-1 px-1.5 py-1 bg-slate-900/60 rounded-xl border border-slate-700/50 flex-wrap">
        {questionnaires.map((q, i) => (
          <div
            key={q.id}
            onClick={() => onSelect(q.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-all select-none group',
              q.id === activeId
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
            )}
          >
            {editingId === q.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-blue-400 text-slate-100 text-sm outline-none w-28 min-w-0"
              />
            ) : (
              <>
                <span className="max-w-[140px] truncate">{q.name}</span>
                <button
                  type="button"
                  onClick={(e) => startEdit(q, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-all"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
            {i > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(q.id); }}
                className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-slate-500 hover:border-blue-500/60 hover:text-blue-400 transition-all text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Dupliquer
        </button>
      </div>
    </div>
  );
}
