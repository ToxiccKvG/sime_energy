import { BarChart3 } from 'lucide-react';

// ─── Empty state ────────────────────────────────────────────────────────────

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#1a1d2e] border border-slate-700/50 rounded-xl">
      <div className="text-center text-slate-500">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">Sélectionner un élément</p>
        <p className="text-xs mt-1 text-slate-600">Cliquez sur un site, bâtiment, étage ou pièce</p>
      </div>
    </div>
  );
}
