import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MesureSession } from '@/types/audit';
import { IndexReadingsEditor } from './IndexReadingsEditor';
import { WoyofalReadingsEditor } from './WoyofalReadingsEditor';
import { IndexReading, WoyofalReading } from './reading-types';

// ─── Session card (accordion) ────────────────────────────────────────────────

export function SessionCard({ session, open, onToggle, onUpdate, onRemove }: {
  session: MesureSession;
  open: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<MesureSession>) => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState(session.label);
  const isWoyofal = session.type === 'WOYOFAL';
  const count = session.readings.length;

  const commitRename = () => {
    onUpdate({ label: labelDraft.trim() || session.label });
    setRenaming(false);
  };

  const woyofalReadings = session.readings.filter((r): r is WoyofalReading => r.kind === 'woyofal');
  const indexReadings   = session.readings.filter((r): r is IndexReading   => r.kind === 'index');

  return (
    <div className="rounded-lg border border-slate-700/50 overflow-hidden">
      {/* ── Header ── */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800/70 transition-colors',
        open && 'border-b border-slate-700/50',
      )}>
        <button type="button" onClick={onToggle} className="flex-1 flex items-center gap-2 min-w-0 text-left">
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}

          <span className={cn(
            'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide',
            isWoyofal ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300',
          )}>
            {isWoyofal ? 'WOYOFAL' : 'INDEX'}
          </span>

          {renaming ? (
            <input
              autoFocus
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setLabelDraft(session.label); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-transparent border-b border-amber-500/40 text-xs text-slate-100 focus:outline-none"
            />
          ) : (
            <span className="text-xs font-medium text-slate-200 truncate">{session.label}</span>
          )}

          {session.dateTime && (
            <span className="shrink-0 text-[10px] text-slate-500">{session.dateTime}</span>
          )}
          {count > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-slate-700/60 text-[10px] text-slate-400">
              {count} relevé{count > 1 ? 's' : ''}
            </span>
          )}
        </button>

        <button type="button" title="Renommer"
          onClick={(e) => { e.stopPropagation(); setLabelDraft(session.label); setRenaming(true); }}
          className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors">
          <Pencil className="h-3 w-3" />
        </button>
        <button type="button" title="Supprimer"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 text-slate-600 hover:text-red-400 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Body ── */}
      {open && (
        <div className="p-3 bg-slate-800/20">
          {isWoyofal ? (
            <WoyofalReadingsEditor
              readings={woyofalReadings}
              onChange={(readings) => onUpdate({ readings })}
            />
          ) : (
            <IndexReadingsEditor
              readings={indexReadings}
              onChange={(readings) => onUpdate({ readings })}
            />
          )}
        </div>
      )}
    </div>
  );
}
