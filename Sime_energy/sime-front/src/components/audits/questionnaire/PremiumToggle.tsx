import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── PremiumToggle ────────────────────────────────────────────────────────────

export function PremiumToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        'group cursor-pointer rounded-xl border transition-all duration-300 p-4',
        enabled
          ? 'border-blue-500/25 bg-blue-500/5'
          : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600/70 hover:bg-slate-800/60',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center justify-center h-9 w-9 rounded-lg transition-colors',
            enabled ? 'bg-blue-500/20' : 'bg-slate-700/60 group-hover:bg-slate-700/80',
          )}>
            <ClipboardList className={cn('h-5 w-5 transition-colors', enabled ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-400')} />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-200">Questionnaire d'inspection</span>
            <p className="text-xs text-slate-500 mt-0.5">Optionnel — formulaire structuré en 11 sections</p>
          </div>
        </div>

        {/* Custom pill toggle */}
        <div className={cn(
          'relative flex-shrink-0 h-6 w-11 rounded-full border transition-all duration-300',
          enabled ? 'bg-blue-500/80 border-blue-400/60' : 'bg-slate-700 border-slate-600',
        )}>
          <div className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full shadow-md transition-all duration-300',
            enabled ? 'left-[22px] bg-white' : 'left-0.5 bg-slate-400',
          )} />
        </div>
      </div>
    </div>
  );
}
