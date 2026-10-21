import { BarChart3 } from 'lucide-react';
import { formatNumber } from '@/lib/format';

// ── TCD table cell helper ─────────────────────────────────────────────────────

export function TdNum({ v, unit = '', dash = false }: { v: number; unit?: string; dash?: boolean }) {
  if (dash && v === 0) return <td className="text-right px-3 py-2 text-slate-600">—</td>;
  return (
    <td className="text-right px-3 py-2 text-slate-300 tabular-nums">
      {formatNumber(v, v >= 10 ? 0 : 2)}{unit && <span className="text-slate-500 text-[10px] ml-1">{unit}</span>}
    </td>
  );
}

// ── Empty TCD ─────────────────────────────────────────────────────────────────

export function EmptyTcd() {
  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 py-16 flex flex-col items-center gap-3 text-slate-600">
      <BarChart3 className="w-8 h-8 opacity-20" />
      <p className="text-xs">Aucun équipement dans cette catégorie</p>
    </div>
  );
}
