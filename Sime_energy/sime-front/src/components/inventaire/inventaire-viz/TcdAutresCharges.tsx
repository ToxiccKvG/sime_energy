import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { EmptyTcd, TdNum } from './tcd-shared';

// ── TCD AUTRES CHARGES ────────────────────────────────────────────────────────

export function TcdAutresCharges({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  // By level
  const byLevel = useMemo(() => {
    const map = new Map<string, { level: string; building: string; levelId: string; buildingId: string; nb: number; powerW: number; kwhAn: number; }>();
    for (const e of items) {
      const key = e.levelId || e.levelName;
      if (!map.has(key)) map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nb: 0, powerW: 0, kwhAn: 0 });
      const r = map.get(key)!;
      r.nb     += e.quantity;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  // By category (metadata.categorie)
  const byCategorie = useMemo(() => {
    const map = new Map<string, { cat: string; nb: number; powerW: number; kwhAn: number; }>();
    for (const e of items) {
      const cat = (e.metadata.categorie as string) || 'Non renseigné';
      if (!map.has(cat)) map.set(cat, { cat, nb: 0, powerW: 0, kwhAn: 0 });
      const r = map.get(cat)!;
      r.nb     += e.quantity;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  if (byLevel.length === 0) return <EmptyTcd />;

  return (
    <div className="space-y-4">
      {/* By level */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Autres Charges — par étage</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {byLevel.map((r, i) => (
              <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                <td className="px-3 py-2 text-slate-400">{r.building}</td>
                <TdNum v={r.nb} />
                <TdNum v={r.powerW / 1000} unit="kW" />
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
          </tbody>
        </table>
      </div>

      {/* By categorie */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Autres Charges — par sous-catégorie</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Sous-catégorie</th>
              <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              <th className="px-4 py-2.5 w-32">Répartition</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const total = byCategorie.reduce((s, r) => s + r.powerW, 0);
              return byCategorie.map((r, i) => (
                <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                  <td className="px-4 py-2 text-slate-200">{r.cat}</td>
                  <TdNum v={r.nb} />
                  <TdNum v={r.powerW / 1000} unit="kW" />
                  <TdNum v={r.kwhAn} unit="kWh" dash />
                  <td className="px-4 py-2">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all duration-700"
                        style={{ width: `${total > 0 ? Math.min((r.powerW / total) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
