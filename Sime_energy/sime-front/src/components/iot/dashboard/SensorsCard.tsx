// ============================================================
// Dashboard IOT — Capteurs environnementaux (T°, humidité, batterie)
// + Station météo (UV, luminosité, vent, pression, pluie, ressenti)
// ============================================================

import { useMemo } from 'react';
import {
  Thermometer, Droplets, Battery, BatteryLow, Sun, Lightbulb,
  Wind, Gauge, CloudRain, Droplet, Signal, SignalLow,
} from 'lucide-react';
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
          const t   = typeof r.temperature === 'number' ? r.temperature : null;
          const h   = typeof r.humidity === 'number' ? r.humidity : null;
          const bat = typeof r.battery_level === 'number' ? r.battery_level : null;
          const batV  = typeof r.battery_voltage_v === 'number' ? r.battery_voltage_v : null;
          const rssi  = typeof r.signal_rssi === 'number' ? r.signal_rssi : null;
          const weak  = rssi != null && rssi < -85;

          const uv    = typeof r.uv_index === 'number' ? r.uv_index : null;
          const lux   = typeof r.illuminance_lux === 'number' ? r.illuminance_lux : null;
          const wind  = typeof r.wind_speed_ms === 'number' ? r.wind_speed_ms : null;
          const gust  = typeof r.wind_gust_ms === 'number' ? r.wind_gust_ms : null;
          const dir   = typeof r.wind_direction_deg === 'number' ? r.wind_direction_deg : null;
          const pres  = typeof r.pressure_hpa === 'number' ? r.pressure_hpa : null;
          const rain  = typeof r.precipitation_mm === 'number' ? r.precipitation_mm : null;
          const dew   = typeof r.dewpoint_c === 'number' ? r.dewpoint_c : null;
          const feels = typeof r.feels_like_c === 'number' ? r.feels_like_c : null;
          const isWeatherStation = uv != null || lux != null || wind != null || pres != null;

          const tCrit  = t != null && (t < 15 || t > 35);
          const hCrit  = h != null && h > 80;
          const batLow = bat != null && bat < 20;

          return (
            <div key={r.device_id}
              className={`rounded-lg border bg-white/5 p-3 ${isWeatherStation ? 'col-span-2' : ''} ${tCrit || hCrit || batLow ? 'border-amber-500/40' : 'border-white/10'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium truncate" title={r.name}>{r.name}</p>
                  <p className="text-slate-500 text-[10px] truncate">{r.room ?? r.site}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {rssi != null && (
                    <span className={`flex items-center gap-0.5 text-[10px] ${weak ? 'text-amber-400' : 'text-slate-500'}`} title={`Signal : ${rssi} dBm`}>
                      {weak ? <SignalLow className="h-3 w-3" /> : <Signal className="h-3 w-3" />}
                    </span>
                  )}
                  {bat != null && (
                    <span className={`flex items-center gap-0.5 text-[10px] ${batLow ? 'text-amber-400' : 'text-slate-400'}`}
                      title={batV != null ? `${batV.toFixed(1)} V` : undefined}>
                      {batLow ? <BatteryLow className="h-3 w-3" /> : <Battery className="h-3 w-3" />}
                      {bat}%
                    </span>
                  )}
                </div>
              </div>

              <div className={`grid gap-1.5 ${isWeatherStation ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
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

                {isWeatherStation && (
                  <>
                    <div className="rounded p-1.5 bg-orange-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Thermometer className="h-2.5 w-2.5" /> Ressenti
                      </p>
                      <p className="text-base font-bold text-orange-300">
                        {feels == null ? '—' : `${fmtFr(feels, 1)}°`}
                      </p>
                    </div>
                    <div className="rounded p-1.5 bg-yellow-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Sun className="h-2.5 w-2.5" /> UV
                      </p>
                      <p className="text-base font-bold text-yellow-300">
                        {uv == null ? '—' : fmtFr(uv, 0)}
                      </p>
                    </div>
                    <div className="rounded p-1.5 bg-amber-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Lightbulb className="h-2.5 w-2.5" /> Luminosité
                      </p>
                      <p className="text-base font-bold text-amber-300">
                        {lux == null ? '—' : lux >= 1000 ? `${fmtFr(lux / 1000, 1)}k` : fmtFr(lux, 0)} <span className="text-[10px] font-normal text-slate-400">lx</span>
                      </p>
                    </div>
                    <div className="rounded p-1.5 bg-sky-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Wind className="h-2.5 w-2.5" /> Vent
                      </p>
                      <p className="text-base font-bold text-sky-300">
                        {wind == null ? '—' : fmtFr(wind * 3.6, 1)} <span className="text-[10px] font-normal text-slate-400">km/h</span>
                      </p>
                      {(gust != null || dir != null) && (
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          {gust != null && `raf. ${fmtFr(gust * 3.6, 0)} km/h`}{gust != null && dir != null && ' · '}{dir != null && `${fmtFr(dir, 0)}°`}
                        </p>
                      )}
                    </div>
                    <div className="rounded p-1.5 bg-violet-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Gauge className="h-2.5 w-2.5" /> Pression
                      </p>
                      <p className="text-base font-bold text-violet-300">
                        {pres == null ? '—' : fmtFr(pres, 0)} <span className="text-[10px] font-normal text-slate-400">hPa</span>
                      </p>
                    </div>
                    <div className="rounded p-1.5 bg-blue-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <CloudRain className="h-2.5 w-2.5" /> Pluie
                      </p>
                      <p className="text-base font-bold text-blue-300">
                        {rain == null ? '—' : fmtFr(rain, 1)} <span className="text-[10px] font-normal text-slate-400">mm</span>
                      </p>
                    </div>
                    <div className="rounded p-1.5 bg-teal-500/10">
                      <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                        <Droplet className="h-2.5 w-2.5" /> Rosée
                      </p>
                      <p className="text-base font-bold text-teal-300">
                        {dew == null ? '—' : `${fmtFr(dew, 1)}°`}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
