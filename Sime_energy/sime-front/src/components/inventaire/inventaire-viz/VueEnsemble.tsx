import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Zap, BarChart3, Activity, Tag } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { formatNumber } from '@/lib/format';
import { KPICard } from './KPICard';
import { CategoryStat, GROUP_OPTIONS, GroupBy, GroupStat, fmtKw, fmtKwh, fmtNum } from './stats';
import { BarTooltip, DonutTooltip } from './tooltips';

export function VueEnsemble({ categoryStats, topGroups, groupLabel, groupBy, kpis, hasKwhData, dataKey, hasZones, manualGroupBy, setManualGroupBy, onNavigateTo }: {
  filtered: EquipmentSnapshot[];
  categoryStats: CategoryStat[];
  topGroups: GroupStat[];
  groupLabel: string;
  groupBy: GroupBy;
  kpis: { nb: number; kw: number; kwh: number; cats: number; rooms: number; };
  hasKwhData: boolean;
  dataKey: 'kwhAn' | 'totalPowerW';
  hasZones: boolean;
  manualGroupBy: GroupBy | null;
  setManualGroupBy: (v: GroupBy | null) => void;
  onRefresh: () => void;
  onNavigateTo?: (sel: SelectionNode) => void;
}) {
  return (
    <>
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          label="Équipements actifs"
          value={fmtNum(kpis.nb)}
          sub={`${kpis.rooms} pièce${kpis.rooms > 1 ? 's' : ''}`}
          icon={Activity}
          color="#6366f1"
        />
        <KPICard
          label="Puissance installée"
          value={fmtKw(kpis.kw)}
          sub="total équipements EN service"
          icon={Zap}
          color="#f59e0b"
        />
        <KPICard
          label="Énergie estimée"
          value={fmtKwh(kpis.kwh)}
          sub={hasKwhData ? 'par an' : 'heures non renseignées — affichage kW'}
          icon={BarChart3}
          color="#10b981"
        />
        <KPICard
          label="Catégories"
          value={String(kpis.cats)}
          sub={`${fmtNum(categoryStats.length)} actives dans la sélection`}
          icon={Tag}
          color="#8b5cf6"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Donut — répartition par catégorie */}
        <div className="col-span-2 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">
            Répartition · {hasKwhData ? 'énergie kWh/an' : 'puissance kW installée'}
          </p>
          {categoryStats.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-600 text-xs">Aucune donnée</div>
          ) : (
            <>
              <div className="relative h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      cx="50%" cy="50%"
                      innerRadius={54} outerRadius={82}
                      paddingAngle={2}
                      dataKey={dataKey}
                      isAnimationActive
                    >
                      {categoryStats.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-base font-bold text-slate-100 leading-none">
                      {hasKwhData ? fmtKwh(kpis.kwh) : fmtKw(kpis.kw)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">total estimé</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {categoryStats.map(s => (
                  <div key={s.categoryId} className="flex items-center gap-2 text-xs group">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-400 flex-1 truncate">{s.categoryName}</span>
                    <span className="font-semibold tabular-nums" style={{ color: s.color }}>
                      {s.pct.toFixed(1)}%
                    </span>
                    <span className="text-slate-500 tabular-nums w-20 text-right">
                      {hasKwhData ? fmtKwh(s.kwhAn) : fmtKw(s.totalPowerW)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Horizontal bar — top consommateurs */}
        <div className="col-span-3 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <p className="text-xs font-semibold text-slate-300">
              Top consommateurs · par {groupLabel.toLowerCase()}
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {GROUP_OPTIONS.filter(o => o.id !== 'zone' || hasZones).map(o => (
                <button
                  key={o.id}
                  onClick={() => setManualGroupBy(manualGroupBy === o.id ? null : o.id)}
                  className={`h-5 px-2 rounded text-[10px] font-medium transition-colors ${
                    groupBy === o.id
                      ? 'bg-indigo-600/80 text-white'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {topGroups.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-600 text-xs">Aucune donnée</div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(topGroups.length * 30 + 24, 180)}
            >
              <BarChart
                data={topGroups}
                layout="vertical"
                margin={{ top: 0, right: 56, left: 4, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="rgba(71,85,105,0.12)" />
                <XAxis
                  type="number"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => hasKwhData ? fmtKwh(v) : fmtKw(v)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={116}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar
                  dataKey={dataKey}
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  style={{ cursor: onNavigateTo ? 'pointer' : 'default' }}
                  onClick={(data: GroupStat) => {
                    if (!onNavigateTo || !data.entityId) return;
                    if (groupBy === 'room' && data.parentId)
                      onNavigateTo({ type: 'room', id: data.entityId, levelId: data.parentId });
                    else if (groupBy === 'level' && data.parentId)
                      onNavigateTo({ type: 'level', id: data.entityId, buildingId: data.parentId });
                  }}
                  label={{
                    position: 'right',
                    fill: '#64748b',
                    fontSize: 10,
                    formatter: (v: number) => hasKwhData ? fmtKwh(v) : fmtKw(v),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Bilan table ── */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Bilan global — par catégorie</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Catégorie</th>
                <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">Énergie (kWh/an)</th>
                <th className="text-right px-3 py-2.5 font-medium w-16">Part</th>
                <th className="px-4 py-2.5 w-36">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map((s, i) => (
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
                  <td className="text-right px-3 py-2.5 text-slate-300 font-medium tabular-nums">
                    {hasKwhData ? fmtKwh(s.kwhAn) : '—'}
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
              {categoryStats.length > 0 && (
                <tr className="bg-slate-800/25 font-semibold">
                  <td className="px-4 py-2.5 text-slate-300">Total</td>
                  <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                    {fmtNum(categoryStats.reduce((s, c) => s + c.nb, 0))}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                    {formatNumber(categoryStats.reduce((s, c) => s + c.totalPowerW, 0) / 1000, 2)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-200 tabular-nums">
                    {hasKwhData ? fmtKwh(kpis.kwh) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300">100%</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
