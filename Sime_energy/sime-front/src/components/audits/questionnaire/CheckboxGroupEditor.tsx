import { cn } from '@/lib/utils';
import type { PVCheckboxItem } from '@/types/audit';

// ─── CheckboxGroupEditor ──────────────────────────────────────────────────────

export function CheckboxGroupEditor({ items, onChange, withComment = false }: {
  items: PVCheckboxItem[];
  onChange: (items: PVCheckboxItem[]) => void;
  withComment?: boolean;
}) {
  const toggle = (id: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item));
  };
  const updateComment = (id: string, comment: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, comment } : item));
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="space-y-1.5">
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
              item.checked ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50',
            )}
            onClick={() => toggle(item.id)}
          >
            <div className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors',
              item.checked ? 'bg-blue-500 border-blue-500' : 'border-slate-500 bg-slate-700/50',
            )}>
              {item.checked && (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-slate-300 leading-relaxed select-none">{item.label}</span>
          </div>
          {withComment && item.checked && (
            <div className="ml-7">
              <textarea
                rows={2}
                value={item.comment || ''}
                onChange={(e) => updateComment(item.id, e.target.value)}
                placeholder="Commentaire / détails observés..."
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-slate-600/50 bg-slate-800/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
