// ============================================================
// Dashboard IOT — Liste des alertes/anomalies temps réel
// ============================================================

import { Bell, AlertTriangle, Battery, Activity, DoorOpen, Thermometer, Zap, WifiOff } from 'lucide-react';
import type { Alert, AlertSeverity } from '@/lib/iot-dashboard-service';

const SEV_STYLE: Record<AlertSeverity, { bg: string; text: string; ring: string }> = {
  critical: { bg: 'bg-red-500/10',    text: 'text-red-400',    ring: 'border-red-500/40' },
  warning:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  ring: 'border-amber-500/40' },
  info:     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   ring: 'border-blue-500/30' },
};

const TYPE_ICON: Record<Alert['type'], React.ComponentType<{ className?: string }>> = {
  offline:          WifiOff,
  battery_low:      Battery,
  voltage_anormal:  Zap,
  power_anormal:    Zap,
  temp_critical:    Thermometer,
  motion_detected:  Activity,
  door_open:        DoorOpen,
};

interface Props {
  alerts: Alert[];
}

function timeAgo(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `il y a ${Math.round(diff)}s`;
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  return new Date(ts).toLocaleString('fr-FR');
}

export function AlertsCard({ alerts }: Props) {
  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning:  alerts.filter(a => a.severity === 'warning').length,
    info:     alerts.filter(a => a.severity === 'info').length,
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" /> Alertes &amp; anomalies live
          <span className="text-slate-500 text-xs font-normal">· {alerts.length}</span>
        </h3>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">{counts.critical} critique{counts.critical > 1 ? 's' : ''}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{counts.warning} warning{counts.warning > 1 ? 's' : ''}</span>
          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{counts.info} info</span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 mb-2">
            <AlertTriangle className="h-6 w-6 text-green-400" />
          </div>
          <p className="text-green-400 font-medium text-sm">Tout est OK — aucune anomalie détectée</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {alerts.slice(0, 50).map(a => {
            const Icon = TYPE_ICON[a.type] ?? AlertTriangle;
            const s = SEV_STYLE[a.severity];
            return (
              <div key={a.id}
                className={`rounded-lg border ${s.bg} ${s.ring} px-3 py-2 flex items-start gap-2`}>
                <div className={`shrink-0 w-7 h-7 rounded-md ${s.bg} flex items-center justify-center`}>
                  <Icon className={`h-3.5 w-3.5 ${s.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{a.device_name}</p>
                  <p className={`text-xs ${s.text}`}>{a.message}</p>
                  <p className="text-slate-500 text-[10px]">
                    {a.site}{a.room ? ' · ' + a.room : ''} · {timeAgo(a.ts)}
                  </p>
                </div>
              </div>
            );
          })}
          {alerts.length > 50 && (
            <p className="text-slate-500 text-xs text-center pt-2">+ {alerts.length - 50} alertes supplémentaires</p>
          )}
        </div>
      )}
    </div>
  );
}
