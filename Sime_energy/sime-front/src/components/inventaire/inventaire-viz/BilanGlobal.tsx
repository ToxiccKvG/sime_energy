import { useMemo } from 'react';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { formatNumber } from '@/lib/format';
import { buildCategoryStats, fmtKwh, fmtNum } from './stats';
import { EmptyTcd } from './tcd-shared';

// ── BILAN GLOBAL ──────────────────────────────────────────────────────────────

export function BilanGlobal({ items }: { items: EquipmentSnapshot[] }) {
  const stats = useMemo(() => buildCategoryStats(items), [items]);

  if (stats.length === 0) return <EmptyTcd />;

  const totalKwhAn = stats.reduce((s, c) => s + c.kwhAn, 0);
  const totalPowerKw = stats.reduce((s, c) => s + c.totalPowerW, 0) / 1000;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / jour</p>
          <p className="text-xl font-bold text-slate-100">{fmtKwh(totalKwhAn / 365)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/jour moyen</p>
        </div>
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / mois</p>
          <p className="text-xl font-bold text-slate-100">{fmtKwh(totalKwhAn / 12)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/mois moyen</p>
        </div>
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / an</p>
          <p className="text-xl font-bold text-emerald-400">{fmtKwh(totalKwhAn)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/an</p>
        </div>
      </div>

      {/* Bilan table */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Bilan global — répartition par usage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Usage</th>
                <th className="text-right px-3 py-2.5 font-medium">Nombre</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/jour</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/mois</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                <th className="text-right px-3 py-2.5 font-medium w-14">Part</th>
                <th className="px-4 py-2.5 w-28">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr
                  key={s.categoryId}
                  className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-200">{s.categoryName}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">{fmtNum(s.nb)}</td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {formatNumber(s.totalPowerW / 1000, 2)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn / 365) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn / 12) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300 font-medium tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 font-semibold tabular-nums" style={{ color: s.color }}>
                    {s.pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
                <td className="px-4 py-2.5 text-slate-300">Total</td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {fmtNum(stats.reduce((s, c) => s + c.nb, 0))}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {formatNumber(totalPowerKw, 2)}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn / 365) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn / 12) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-200 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300">100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
