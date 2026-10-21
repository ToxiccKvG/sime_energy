import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { EmptyTcd, TdNum } from './tcd-shared';

// ── TCD ÉCLAIRAGE ─────────────────────────────────────────────────────────────

export function TcdEclairage({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      level: string; building: string; levelId: string; buildingId: string;
      nbLuminaires: number; nbLampes: number; powerW: number; surface: number; kwhAn: number;
    }>();
    for (const e of items) {
      const m = e.metadata;
      const key = e.levelId || e.levelName;
      if (!map.has(key)) {
        map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nbLuminaires: 0, nbLampes: 0, powerW: 0, surface: 0, kwhAn: 0 });
      }
      const r = map.get(key)!;
      r.nbLuminaires += m.nbLuminaires ?? 0;
      r.nbLampes     += e.quantity;
      r.powerW       += e.totalPowerW ?? 0;
      r.surface      += m.surfaceLocale ?? 0;
      r.kwhAn        += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    nbLuminaires: acc.nbLuminaires + r.nbLuminaires,
    nbLampes: acc.nbLampes + r.nbLampes,
    powerW: acc.powerW + r.powerW,
    surface: acc.surface + r.surface,
    kwhAn: acc.kwhAn + r.kwhAn,
  }), { nbLuminaires: 0, nbLampes: 0, powerW: 0, surface: 0, kwhAn: 0 }), [rows]);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/50">
        <p className="text-xs font-semibold text-slate-300">TCD Éclairage — par étage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Nb luminaires</th>
              <th className="text-right px-3 py-2.5 font-medium">Nb lampes</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (W)</th>
              <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
              <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                <td className="px-3 py-2 text-slate-400">{r.building}</td>
                <TdNum v={r.nbLuminaires} />
                <TdNum v={r.nbLampes} />
                <TdNum v={r.powerW} unit="W" />
                <TdNum v={r.surface} unit="m²" dash />
                <TdNum v={r.surface > 0 ? r.powerW / r.surface : 0} unit="W/m²" dash />
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
            ))}
            <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
              <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
              <TdNum v={totals.nbLuminaires} />
              <TdNum v={totals.nbLampes} />
              <TdNum v={totals.powerW} unit="W" />
              <TdNum v={totals.surface} unit="m²" />
              <TdNum v={totals.surface > 0 ? totals.powerW / totals.surface : 0} unit="W/m²" dash />
              <TdNum v={totals.kwhAn} unit="kWh" dash />
              {onNavigateTo && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
