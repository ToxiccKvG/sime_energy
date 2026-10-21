import { cn } from '@/lib/utils';

// ─── KPI Card ───────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  unit,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'violet';
}) {
  const colors = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
  };
  return (
    <div className={cn('rounded-xl border p-4', colors[color])}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal ml-1 text-slate-400">{unit}</span>}
      </p>
    </div>
  );
}
