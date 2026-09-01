// ============================================================
// Dashboard IOT — Capteurs environnementaux (T°, humidité, batterie)
// + Station météo (UV, luminosité, vent, pression, pluie, ressenti)
//
// Les tuiles sont cliquables : chacune ouvre la popup de détail sur
// la grandeur choisie (voir SensorDetailDialog).
//
// Elles sont désormais construites depuis SENSOR_METRICS et n'affichent
// que les grandeurs réellement mesurées. L'ancienne règle
// `isWeatherStation = uv || lux || wind || pres` faisait passer le
// détecteur de mouvement pour une station météo dès qu'on a commencé à
// capter sa luminosité : il s'affichait avec sept tuiles vides.
// ============================================================

import { useMemo, useState } from 'react';
import { Thermometer, Battery, BatteryLow, Signal, SignalLow } from 'lucide-react';
import type { ShellyClRow } from '@/lib/iot-dashboard-service';
import { metriquesDisponibles, formatValeur, type MetricKey } from './sensorMetrics';
import { SensorDetailDialog } from './SensorDetailDialog';

interface Props {
  snapshot: ShellyClRow[];
}

export function SensorsCard({ snapshot }: Props) {
  const [ouvert, setOuvert] = useState<{ capteur: ShellyClRow; metrique: MetricKey } | null>(null);

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
        <span className="text-slate-500 text-xs font-normal ml-1">— cliquez une valeur pour le détail</span>
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {sensors.map(r => {
          const metriques = metriquesDisponibles(r);
          const bat  = typeof r.battery_level === 'number' ? r.battery_level : null;
          const batV = typeof r.battery_voltage_v === 'number' ? r.battery_voltage_v : null;
          const rssi = typeof r.signal_rssi === 'number' ? r.signal_rssi : null;
          const weak = rssi != null && rssi < -85;

          const t = typeof r.temperature === 'number' ? r.temperature : null;
          const h = typeof r.humidity === 'number' ? r.humidity : null;
          const tCrit  = t != null && (t < 15 || t > 35);
          const hCrit  = h != null && h > 80;
          const batLow = bat != null && bat < 20;

          // Une carte large dès que le capteur dépasse quatre grandeurs
          // (station météo), pour que les tuiles restent lisibles.
          const large = metriques.length > 4;

          return (
            <div key={r.device_id}
              className={`rounded-lg border bg-white/5 p-3 ${large ? 'col-span-2' : ''} ${tCrit || hCrit || batLow ? 'border-amber-500/40' : 'border-white/10'}`}>
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

              <div className={`grid gap-1.5 ${large ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
                {metriques.map(m => {
                  const valeur = m.valeur(r);
                  const alerte = (m.key === 'temperature' && tCrit) || (m.key === 'humidity' && hCrit);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setOuvert({ capteur: r, metrique: m.key })}
                      title={`${m.label} — voir le détail`}
                      className={`rounded p-1.5 text-left transition-colors hover:ring-1 hover:ring-white/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${alerte ? 'bg-amber-500/10' : m.fond}`}
                    >
                      <p className="text-[9px] text-slate-400 uppercase truncate">{m.labelCourt}</p>
                      <p className={`text-base font-bold ${alerte ? 'text-amber-400' : m.texte}`}>
                        {formatValeur(m, valeur)}
                        {m.unite && <span className="text-[10px] font-normal text-slate-400 ml-0.5">{m.unite}</span>}
                      </p>
                      {m.key === 'wind' && (() => {
                        const gust = typeof r.wind_gust_ms === 'number' ? r.wind_gust_ms * 3.6 : null;
                        const dir  = typeof r.wind_direction_deg === 'number' ? r.wind_direction_deg : null;
                        if (gust == null && dir == null) return null;
                        return (
                          <span className="block text-[9px] text-slate-500 mt-0.5">
                            {gust != null && `raf. ${gust.toFixed(0)} km/h`}
                            {gust != null && dir != null && ' · '}
                            {dir != null && `${dir.toFixed(0)}°`}
                          </span>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <SensorDetailDialog
        capteur={ouvert?.capteur ?? null}
        metriqueInitiale={ouvert?.metrique ?? null}
        onClose={() => setOuvert(null)}
      />
    </div>
  );
}
