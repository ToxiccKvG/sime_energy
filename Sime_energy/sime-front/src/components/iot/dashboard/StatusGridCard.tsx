// ============================================================
// Dashboard IOT — Grille état appareils (on/off/offline/anomalie)
// ============================================================

import { useMemo, useState } from 'react';
import {
  Plug, Lightbulb, Thermometer, DoorOpen, Activity, CircleOff,
  Zap, AlertTriangle,
} from 'lucide-react';
import type { ShellyClRow, Device, DeviceFamily } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

const FAMILY_ICON: Record<DeviceFamily, React.ComponentType<{ className?: string }>> = {
  ENERGIE_3PH: Zap,
  ENERGIE_2PH: Zap,
  ENERGIE_1PH: Plug,
  LUMIERE:     Lightbulb,
  CAPTEUR_ENV: Thermometer,
  ETAT:        DoorOpen,
  INCONNU:     Activity,
};

type FilterStatus = 'all' | 'on' | 'off' | 'offline' | 'alert';

interface Props {
  snapshot: ShellyClRow[];
  allDevices: Device[];
  alertDeviceIds: Set<string>;
}

interface Tile {
  device: Device;
  row: ShellyClRow | undefined;
  status: 'on' | 'off' | 'offline' | 'alert';
  detail: string;
}

export function StatusGridCard({ snapshot, allDevices, alertDeviceIds }: Props) {
  const [filter, setFilter] = useState<FilterStatus>('all');

  const tiles = useMemo<Tile[]>(() => {
    const byId = new Map(snapshot.map(r => [r.device_id, r]));
    return allDevices.map(d => {
      const r = byId.get(d.device_id);
      let status: Tile['status'] = 'offline';
      let detail = 'Hors-ligne';
      if (!r) {
        status = 'offline';
      } else if (alertDeviceIds.has(d.device_id)) {
        status = 'alert';
        detail = 'Anomalie';
      } else {
        const p = Number(r.power_w ?? 0);
        const st = r.state ?? '';
        if (p > 1)                                          { status = 'on';  detail = `${fmtFr(p, 1)} W`; }
        else if (st === 'on' || st === 'motion' || st === 'open' || st === 'pressed') {
                                                              status = 'on';  detail = st; }
        else                                                { status = 'off'; detail = 'Veille'; }
      }
      return { device: d, row: r, status, detail };
    });
  }, [snapshot, allDevices, alertDeviceIds]);

  const counts = useMemo(() => ({
    all:     tiles.length,
    on:      tiles.filter(t => t.status === 'on').length,
    off:     tiles.filter(t => t.status === 'off').length,
    offline: tiles.filter(t => t.status === 'offline').length,
    alert:   tiles.filter(t => t.status === 'alert').length,
  }), [tiles]);

  const filtered = filter === 'all' ? tiles : tiles.filter(t => t.status === filter);

  const STATUS_STYLE: Record<Tile['status'], { bg: string; border: string; ring: string; text: string }> = {
    on:      { bg: 'bg-green-500/10',  border: 'border-green-500/40',  ring: 'bg-green-400',  text: 'text-green-400' },
    off:     { bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  ring: 'bg-slate-500',  text: 'text-slate-400' },
    offline: { bg: 'bg-zinc-900/40',   border: 'border-white/5',       ring: 'bg-zinc-700',   text: 'text-zinc-500' },
    alert:   { bg: 'bg-red-500/10',    border: 'border-red-500/40',    ring: 'bg-red-400',    text: 'text-red-400' },
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <CircleOff className="h-4 w-4 text-cyan-400" /> État des appareils
        </h3>
        <div className="overflow-x-auto">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5 text-xs min-w-max">
            {([
              { key: 'all',     label: `Tous (${counts.all})` },
              { key: 'on',      label: `On (${counts.on})` },
              { key: 'off',     label: `Off (${counts.off})` },
              { key: 'offline', label: `Offline (${counts.offline})` },
              { key: 'alert',   label: `Alertes (${counts.alert})` },
            ] as { key: FilterStatus; label: string }[]).map(b => (
              <button key={b.key} onClick={() => setFilter(b.key)}
                className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${filter === b.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-8">Aucun appareil dans cette catégorie.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filtered.map(t => {
            const Icon = FAMILY_ICON[t.device.device_family] ?? Activity;
            const s = STATUS_STYLE[t.status];
            const extras: string[] = [];
            if (typeof t.row?.device_temp_c === 'number') extras.push(`${fmtFr(t.row.device_temp_c, 0)}°C interne`);
            if (typeof t.row?.frequency_hz === 'number')  extras.push(`${fmtFr(t.row.frequency_hz, 1)} Hz`);
            if (typeof t.row?.tilt_angle === 'number')    extras.push(`inclinaison ${fmtFr(t.row.tilt_angle, 0)}°`);
            if (typeof t.row?.signal_rssi === 'number')   extras.push(`signal ${t.row.signal_rssi} dBm`);
            const tooltip = `${t.device.name} — ${t.device.site}${t.device.room ? ' · ' + t.device.room : ''}`
              + (extras.length > 0 ? ` (${extras.join(' · ')})` : '');
            return (
              <div key={t.device.device_id}
                title={tooltip}
                className={`relative rounded-lg border ${s.bg} ${s.border} p-2.5 transition-colors hover:bg-white/5`}>
                <div className="flex items-start gap-2">
                  <div className={`shrink-0 w-7 h-7 rounded-md ${s.bg} flex items-center justify-center`}>
                    <Icon className={`h-3.5 w-3.5 ${s.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{t.device.name}</p>
                    <p className="text-slate-500 text-[10px] truncate">{t.device.room ?? t.device.site}</p>
                    <p className={`text-[10px] font-medium ${s.text}`}>{t.detail}</p>
                  </div>
                  {t.status === 'alert' && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                  <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${s.ring}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
