// ============================================================
// Dashboard IOT — Calendrier d'activité (90 derniers jours, GitHub-style)
// ============================================================

import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { CalendarDay } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

function colorFor(intensity: number): string {
  if (intensity <= 0) return 'rgba(255,255,255,0.05)';
  if (intensity < 0.2) return 'rgba(34,197,94,0.2)';
  if (intensity < 0.4) return 'rgba(34,197,94,0.45)';
  if (intensity < 0.6) return 'rgba(34,197,94,0.7)';
  if (intensity < 0.8) return 'rgba(22,163,74,0.85)';
  return 'rgba(21,128,61,1)';
}

interface Props {
  days: CalendarDay[];
}

const JOURS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function CalendarCard({ days }: Props) {
  const { weeks, max } = useMemo(() => {
    if (days.length === 0) return { weeks: [] as { date: Date; kwh: number }[][], max: 0 };
    // Map dates → kwh
    const byDate = new Map(days.map(d => [d.date, d.kwh]));
    let max = 0;
    for (const v of byDate.values()) if (v > max) max = v;

    // 90 jours en arrière → début de la 1re semaine ISO
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60_000);
    // Recule jusqu'au lundi
    const startMonday = new Date(start);
    const offsetMon = (startMonday.getDay() + 6) % 7;
    startMonday.setDate(startMonday.getDate() - offsetMon);

    const weeks: { date: Date; kwh: number }[][] = [];
    const cursor = new Date(startMonday);
    while (cursor <= end) {
      const week: { date: Date; kwh: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        const key = d.toISOString().slice(0, 10);
        week.push({ date: d, kwh: byDate.get(key) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, max };
  }, [days]);

  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-emerald-400" /> Calendrier d'activité
        </h3>
        <p className="text-center text-slate-500 text-sm py-8">Aucune donnée pour les 90 derniers jours.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-400" /> Calendrier d'activité — 90 derniers jours
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>Moins</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
            <span key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorFor(i) }} />
          ))}
          <span>Plus</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 mr-1 pt-3">
            {JOURS_FR.map((j, i) => (
              <div key={i} className="h-3 text-[9px] text-slate-500 leading-3">{i % 2 === 1 ? j : ''}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((cell, di) => {
                const intensity = max > 0 ? cell.kwh / max : 0;
                const dateLabel = cell.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                return (
                  <div key={di}
                    className="w-3 h-3 rounded-sm cursor-pointer"
                    style={{ backgroundColor: colorFor(intensity) }}
                    title={`${dateLabel} — ${fmtFr(cell.kwh, 2)} kWh`} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
