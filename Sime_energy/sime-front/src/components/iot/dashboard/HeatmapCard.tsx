// ============================================================
// Dashboard IOT — Heatmap appareils × heures (24h type)
// ============================================================

import { useMemo } from 'react';
import { Grid3x3 } from 'lucide-react';
import type { HeatmapCell } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Props {
  cells: HeatmapCell[];
}

// palette green → yellow → red selon intensité (0..1)
function colorFor(intensity: number): string {
  if (intensity <= 0) return 'rgba(255,255,255,0.03)';
  if (intensity < 0.2) return 'rgba(34,197,94,0.25)';   // green-500/25
  if (intensity < 0.4) return 'rgba(34,197,94,0.55)';   // green darker
  if (intensity < 0.6) return 'rgba(250,204,21,0.65)';  // yellow
  if (intensity < 0.8) return 'rgba(249,115,22,0.7)';   // orange
  return 'rgba(239,68,68,0.8)';                          // red
}

export function HeatmapCard({ cells }: Props) {
  const { devices, max } = useMemo(() => {
    const byDev = new Map<string, { name: string; hours: number[] }>();
    let max = 0;
    for (const c of cells) {
      const cur = byDev.get(c.device_id) ?? { name: c.name, hours: Array(24).fill(0) };
      cur.hours[c.hour] = c.kwh;
      if (c.kwh > max) max = c.kwh;
      byDev.set(c.device_id, cur);
    }
    return {
      devices: Array.from(byDev.entries()).map(([id, v]) => ({ id, name: v.name, hours: v.hours }))
        .sort((a, b) => b.hours.reduce((s, x) => s + x, 0) - a.hours.reduce((s, x) => s + x, 0)),
      max,
    };
  }, [cells]);

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <Grid3x3 className="h-4 w-4 text-orange-400" /> Heatmap consommation par heure
        </h3>
        <p className="text-center text-slate-500 text-sm py-8">Aucune donnée horaire disponible pour cette période.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-orange-400" /> Consommation par heure (moy. sur la période)
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>Faible</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
            <span key={i} className="w-3 h-3 rounded" style={{ backgroundColor: colorFor(i) }} />
          ))}
          <span>Élevé</span>
          <span className="text-slate-500 ml-2">max ≈ {fmtFr(max, 2)} kWh</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-slate-500 text-right font-normal pr-2 text-[10px]">Heure →</th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="text-slate-500 font-normal text-[9px] w-3 md:w-6">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.slice(0, 30).map(d => (
              <tr key={d.id}>
                <td className="text-slate-300 text-right pr-2 truncate max-w-[80px] sm:max-w-[130px] md:max-w-[180px]" title={d.name}>
                  {d.name.length > 14 ? d.name.slice(0, 12) + '…' : d.name}
                </td>
                {d.hours.map((kwh, h) => {
                  const intensity = max > 0 ? kwh / max : 0;
                  return (
                    <td key={h}
                      className="w-3 h-3 md:w-6 md:h-6 rounded"
                      style={{ backgroundColor: colorFor(intensity) }}
                      title={`${d.name} · ${h}h : ${fmtFr(kwh, 3)} kWh`} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length > 30 && (
          <p className="text-slate-500 text-xs mt-2 text-center">{devices.length - 30} appareils supplémentaires non affichés. Filtre par appareil ou famille pour affiner.</p>
        )}
      </div>
    </div>
  );
}
