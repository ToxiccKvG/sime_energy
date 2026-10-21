import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { EmptyTcd, TdNum } from './tcd-shared';

// ── TCD CLIMATISATION ─────────────────────────────────────────────────────────

export function TcdClimatisation({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      level: string; building: string; levelId: string; buildingId: string;
      nb: number; elecW: number; frigoW: number; copSum: number; copCount: number;
      surface: number; volumeM3: number; kwhAn: number;
    }>();
    for (const e of items) {
      const m = e.metadata;
      const key = e.levelId || e.levelName;
      if (!map.has(key)) {
        map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nb: 0, elecW: 0, frigoW: 0, copSum: 0, copCount: 0, surface: 0, volumeM3: 0, kwhAn: 0 });
      }
      const r = map.get(key)!;
      r.nb     += e.quantity;
      r.elecW  += e.totalPowerW ?? 0;
      r.frigoW += (m.puissanceFrigoW ?? 0);
      if (m.cop && m.cop > 0) { r.copSum += m.cop; r.copCount++; }
      r.surface  += m.surfaceClim ?? 0;
      r.volumeM3 += m.volumeM3 ?? 0;
      r.kwhAn    += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.elecW - a.elecW);
  }, [items]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    nb: acc.nb + r.nb,
    elecW: acc.elecW + r.elecW,
    frigoW: acc.frigoW + r.frigoW,
    surface: acc.surface + r.surface,
    volumeM3: acc.volumeM3 + r.volumeM3,
    kwhAn: acc.kwhAn + r.kwhAn,
  }), { nb: 0, elecW: 0, frigoW: 0, surface: 0, volumeM3: 0, kwhAn: 0 }), [rows]);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/50">
        <p className="text-xs font-semibold text-slate-300">TCD Climatisation — par étage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Unités</th>
              <th className="text-right px-3 py-2.5 font-medium">kW élec.</th>
              <th className="text-right px-3 py-2.5 font-medium">kW frigo.</th>
              <th className="text-right px-3 py-2.5 font-medium">EER moy.</th>
              <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
              <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const eerMoy = r.copCount > 0 ? r.copSum / r.copCount : 0;
              return (
                <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                  <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                  <td className="px-3 py-2 text-slate-400">{r.building}</td>
                  <TdNum v={r.nb} />
                  <TdNum v={r.elecW / 1000} unit="kW" />
                  <TdNum v={r.frigoW / 1000} unit="kW" dash />
                  <TdNum v={eerMoy} dash />
                  <TdNum v={r.surface} unit="m²" dash />
                  <TdNum v={r.surface > 0 ? r.elecW / r.surface : 0} unit="W/m²" dash />
                  <TdNum v={r.kwhAn} unit="kWh" dash />
                  {onNavigateTo && (
                    <td className="px-1 py-2 text-center">
                      <button
                        onClick={() => r.levelId && onNavigateTo({ type: 'level', id: r.levelId, buildingId: r.buildingId })}
                        title="Voir dans le Cadastre"
                        className="p-1 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
              <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
              <TdNum v={totals.nb} />
              <TdNum v={totals.elecW / 1000} unit="kW" />
              <TdNum v={totals.frigoW / 1000} unit="kW" dash />
              <td className="text-right px-3 py-2 text-slate-600">—</td>
              <TdNum v={totals.surface} unit="m²" />
              <TdNum v={totals.surface > 0 ? totals.elecW / totals.surface : 0} unit="W/m²" dash />
              <TdNum v={totals.kwhAn} unit="kWh" dash />
              {onNavigateTo && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
