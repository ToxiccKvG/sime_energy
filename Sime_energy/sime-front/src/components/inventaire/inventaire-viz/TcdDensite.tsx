import { useMemo } from 'react';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { formatNumber } from '@/lib/format';
import { EmptyTcd, TdNum } from './tcd-shared';

// ── TCD DENSITÉ SURFACIQUE ────────────────────────────────────────────────────

export function TcdDensite({ items }: { items: EquipmentSnapshot[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      building: string; site: string; surface: number;
      powerW: number; kwhAn: number; nb: number;
    }>();
    for (const e of items) {
      const key = e.buildingId || e.buildingName;
      if (!map.has(key)) {
        map.set(key, {
          building: e.buildingName, site: e.siteName,
          surface: e.buildingSurface ?? 0,
          powerW: 0, kwhAn: 0, nb: 0,
        });
      }
      const r = map.get(key)!;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear  ?? 0;
      r.nb     += e.quantity;
    }
    return Array.from(map.values())
      .sort((a, b) => {
        const da = a.surface > 0 ? a.powerW / a.surface : 0;
        const db = b.surface > 0 ? b.powerW / b.surface : 0;
        return db - da;
      });
  }, [items]);

  const totalSurface = rows.reduce((s, r) => s + r.surface, 0);
  const totalPower   = rows.reduce((s, r) => s + r.powerW, 0);
  const totalKwh     = rows.reduce((s, r) => s + r.kwhAn, 0);
  const hasSurface   = rows.some(r => r.surface > 0);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="space-y-4">
      {!hasSurface && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-xs text-amber-300">
          Aucune surface bâtie renseignée. Renseignez "Surface bâtie (m²)" dans la fiche bâtiment du Projet pour calculer la densité surfacique.
        </div>
      )}

      {/* KPIs surfaciques */}
      {hasSurface && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Surface bâtie totale</p>
            <p className="text-xl font-bold text-slate-100">{formatNumber(totalSurface, 0)} m²</p>
            <p className="text-[10px] text-slate-600 mt-0.5">tous bâtiments cumulés</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Puissance surfacique moy.</p>
            <p className="text-xl font-bold text-amber-400">
              {totalSurface > 0 ? formatNumber(totalPower / totalSurface, 1) : '—'} W/m²
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">puissance installée / surface</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Intensité énergétique moy.</p>
            <p className="text-xl font-bold text-emerald-400">
              {totalSurface > 0 ? formatNumber(totalKwh / totalSurface, 0) : '—'} kWh/m²/an
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">énergie annuelle / surface</p>
          </div>
        </div>
      )}

      {/* Table densité par bâtiment */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Densité énergétique — par bâtiment</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Bâtiment</th>
                <th className="text-left px-3 py-2.5 font-medium">Site</th>
                <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
                <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/m²/an</th>
                <th className="px-4 py-2.5 w-28">Densité relative</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxWm2 = Math.max(...rows.map(r => r.surface > 0 ? r.powerW / r.surface : 0), 0.001);
                return rows.map((r, i) => {
                  const wm2 = r.surface > 0 ? r.powerW / r.surface : 0;
                  const kwhmAn = r.surface > 0 ? r.kwhAn / r.surface : 0;
                  return (
                    <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                      <td className="px-4 py-2 text-slate-200 font-medium">{r.building}</td>
                      <td className="px-3 py-2 text-slate-400">{r.site}</td>
                      <TdNum v={r.nb} />
                      <TdNum v={r.powerW / 1000} unit="kW" />
                      <td className={`text-right px-3 py-2 tabular-nums ${r.surface > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                        {r.surface > 0 ? `${formatNumber(r.surface, 0)} m²` : '—'}
                      </td>
                      <td className={`text-right px-3 py-2 font-semibold tabular-nums ${wm2 > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {wm2 > 0 ? `${formatNumber(wm2, 1)} W/m²` : '—'}
                      </td>
                      <TdNum v={r.kwhAn} unit="kWh" dash />
                      <td className={`text-right px-3 py-2 tabular-nums ${kwhmAn > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {kwhmAn > 0 ? `${formatNumber(kwhmAn, 0)} kWh/m²` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-700"
                            style={{ width: `${maxWm2 > 0 ? Math.min((wm2 / maxWm2) * 100, 100) : 0}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
              <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
                <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
                <TdNum v={rows.reduce((s, r) => s + r.nb, 0)} />
                <TdNum v={totalPower / 1000} unit="kW" />
                <td className="text-right px-3 py-2 text-slate-300 tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalSurface, 0)} m²` : '—'}
                </td>
                <td className="text-right px-3 py-2 text-amber-400 font-bold tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalPower / totalSurface, 1)} W/m²` : '—'}
                </td>
                <TdNum v={totalKwh} unit="kWh" dash />
                <td className="text-right px-3 py-2 text-emerald-400 font-bold tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalKwh / totalSurface, 0)} kWh/m²` : '—'}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-site comparison — only if multiple sites */}
      {(() => {
        const siteMap = new Map<string, { site: string; surface: number; powerW: number; kwhAn: number; nb: number; buildings: number }>();
        for (const r of rows) {
          if (!siteMap.has(r.site)) siteMap.set(r.site, { site: r.site, surface: 0, powerW: 0, kwhAn: 0, nb: 0, buildings: 0 });
          const s = siteMap.get(r.site)!;
          s.surface  += r.surface;
          s.powerW   += r.powerW;
          s.kwhAn    += r.kwhAn;
          s.nb       += r.nb;
          s.buildings++;
        }
        const siteRows = Array.from(siteMap.values()).sort((a, b) => b.powerW - a.powerW);
        if (siteRows.length <= 1) return null;
        return (
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/50">
              <p className="text-xs font-semibold text-slate-300">Comparatif — tous les sites</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800/40">
                    <th className="text-left px-4 py-2.5 font-medium">Site</th>
                    <th className="text-right px-3 py-2.5 font-medium">Bâtiments</th>
                    <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                    <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
                    <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
                    <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                    <th className="text-right px-3 py-2.5 font-medium">kWh/m²/an</th>
                    <th className="text-right px-3 py-2.5 font-medium">% Puissance</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((s, i) => {
                    const wm2  = s.surface > 0 ? s.powerW / s.surface : 0;
                    const kwh2 = s.surface > 0 ? s.kwhAn / s.surface : 0;
                    const pct  = totalPower > 0 ? (s.powerW / totalPower) * 100 : 0;
                    return (
                      <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                        <td className="px-4 py-2.5 text-slate-200 font-medium">{s.site}</td>
                        <TdNum v={s.buildings} />
                        <TdNum v={s.nb} />
                        <TdNum v={s.powerW / 1000} unit="kW" />
                        <td className={`text-right px-3 py-2.5 tabular-nums ${s.surface > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                          {s.surface > 0 ? `${formatNumber(s.surface, 0)} m²` : '—'}
                        </td>
                        <td className={`text-right px-3 py-2.5 font-semibold tabular-nums ${wm2 > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                          {wm2 > 0 ? `${formatNumber(wm2, 1)} W/m²` : '—'}
                        </td>
                        <TdNum v={s.kwhAn} unit="kWh" dash />
                        <td className={`text-right px-3 py-2.5 tabular-nums ${kwh2 > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {kwh2 > 0 ? `${formatNumber(kwh2, 0)} kWh/m²` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-slate-400 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
