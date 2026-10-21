

// ── KPI Card ──────────────────────────────────────────────────────────────────

export function KPICard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-[#1a1d2e] rounded-xl p-4 border border-slate-800/60 flex items-start gap-3">
      <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${color}22` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-100 leading-none truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
