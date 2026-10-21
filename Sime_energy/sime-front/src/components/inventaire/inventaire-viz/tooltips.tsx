import { CategoryStat, GroupStat, fmtKw, fmtKwh, fmtNum } from './stats';

// ── Custom Recharts tooltips ──────────────────────────────────────────────────

export const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as CategoryStat;
  return (
    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2.5 shadow-xl text-xs">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
        <span className="text-slate-100 font-semibold">{d.categoryName}</span>
      </div>
      <div className="pl-4 text-slate-400 space-y-0.5">
        <div>Énergie : <span className="text-slate-200">{fmtKwh(d.kwhAn)}/an</span></div>
        <div>Puissance : <span className="text-slate-200">{fmtKw(d.totalPowerW)}</span></div>
        <div>Équipements : <span className="text-slate-200">{fmtNum(d.nb)}</span></div>
        <div>Part : <span className="font-semibold" style={{ color: d.color }}>{d.pct.toFixed(1)}%</span></div>
      </div>
    </div>
  );
};

export const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as GroupStat;
  return (
    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2.5 shadow-xl text-xs">
      <p className="text-slate-100 font-semibold mb-1.5 truncate max-w-[200px]">{label}</p>
      <div className="text-slate-400 space-y-0.5">
        <div>Énergie : <span className="text-slate-200">{fmtKwh(d.kwhAn)}/an</span></div>
        <div>Puissance : <span className="text-slate-200">{fmtKw(d.totalPowerW)}</span></div>
        <div>Équipements : <span className="text-slate-200">{fmtNum(d.nb)}</span></div>
      </div>
    </div>
  );
};
