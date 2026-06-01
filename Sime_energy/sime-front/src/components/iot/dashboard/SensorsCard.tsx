// ============================================================
// Dashboard IOT — Capteurs environnementaux (T°, humidité, batterie)
// ============================================================

import { useMemo } from 'react';
import { Thermometer, Droplets, Battery, BatteryLow } from 'lucide-react';
import type { ShellyClRow } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
}

export function SensorsCard({ snapshot }: Props) {
  const sensors = useMemo(() =>
    snapshot
      .filter(r => r.device_family === 'CAPTEUR_ENV' || r.temperature != null || r.humidity != null)
      .filter(r => r.temperature != null || r.humidity != null)
      .sort((a, b) => (a.room ?? '').localeCompare(b.room ?? '')),
    [snapshot],
  );

  if (sensors.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <Thermometer className="h-4 w-4 text-cyan-400" /> Capteurs environnementaux
        </h3>
        <p className="text-center text-slate-500 text-sm py-8">Aucun capteur environnemental détecté.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
        <Thermometer className="h-4 w-4 text-cyan-400" /> Capteurs environnementaux · {sensors.length}
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {sensors.map(r => {
          const t = typeof r.temperature === 'number' ? r.temperature : null;
          const h = typeof r.humidity === 'number' ? r.humidity : null;
          const bat = typeof r.battery_level === 'number' ? r.battery_level : null;

          const tCrit  = t != null && (t < 15 || t > 35);
          const hCrit  = h != null && h > 80;
          const batLow = bat != null && bat < 20;

          return (
            <div key={r.device_id}
              className={`rounded-lg border bg-white/5 p-3 ${tCrit || hCrit || batLow ? 'border-amber-500/40' : 'border-white/10'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium truncate" title={r.name}>{r.name}</p>
                  <p className="text-slate-500 text-[10px] truncate">{r.room ?? r.site}</p>
                </div>
                {bat != null && (
                  <span className={`shrink-0 flex items-center gap-0.5 text-[10px] ${batLow ? 'text-amber-400' : 'text-slate-400'}`}>
                    {batLow ? <BatteryLow className="h-3 w-3" /> : <Battery className="h-3 w-3" />}
                    {bat}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className={`rounded p-1.5 ${tCrit ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                  <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                    <Thermometer className="h-2.5 w-2.5" /> Temp.
                  </p>
                  <p className={`text-base font-bold ${tCrit ? 'text-amber-400' : 'text-blue-300'}`}>
                    {t == null ? '—' : `${fmtFr(t, 1)}°`}
                  </p>
                </div>
                <div className={`rounded p-1.5 ${hCrit ? 'bg-amber-500/10' : 'bg-cyan-500/10'}`}>
                  <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                    <Droplets className="h-2.5 w-2.5" /> Hum.
                  </p>
                  <p className={`text-base font-bold ${hCrit ? 'text-amber-400' : 'text-cyan-300'}`}>
                    {h == null ? '—' : `${fmtFr(h, 0)}%`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
