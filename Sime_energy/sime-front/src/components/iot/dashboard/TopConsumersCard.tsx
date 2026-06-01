// ============================================================
// Dashboard IOT — Top consommateurs (live)
// Bar chart horizontal des appareils par puissance instantanée
// ============================================================

import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ShellyClRow, EnergyAgg, Period } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

const SITE_COLORS: Record<string, string> = {
  'Ma Maison':       '#3b82f6',
  'Académie CER2E':  '#a855f7',
};

interface Props {
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  period: Period;
}

export function TopConsumersCard({ snapshot, energyAgg, period }: Props) {
  const isHistoric = period !== 'live';

  const liveTop10 = useMemo(() => {
    return [...snapshot]
      .filter(r => (r.power_w ?? 0) > 0)
      .sort((a, b) => (b.power_w ?? 0) - (a.power_w ?? 0))
      .slice(0, 10)
      .map(r => ({
        name: r.name.length > 28 ? r.name.slice(0, 26) + '…' : r.name,
        fullName: r.name,
        value: Number((r.power_w ?? 0).toFixed(1)),
        site: r.site,
        room: r.room ?? null,
      }));
  }, [snapshot]);

  const historicTop10 = useMemo(() => {
    return [...energyAgg]
      .filter(e => e.kwh > 0)
      .slice(0, 10)
      .map(e => ({
        name: e.name.length > 28 ? e.name.slice(0, 26) + '…' : e.name,
        fullName: e.name,
        value: +e.kwh.toFixed(3),
        site: e.site,
        room: e.room,
      }));
  }, [energyAgg]);

  const top10 = isHistoric ? historicTop10 : liveTop10;
  const unit = isHistoric ? 'kWh' : 'W';
  const axisLabel = isHistoric ? 'Énergie consommée (kWh)' : 'Puissance instantanée (W)';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-400" />
          {isHistoric ? 'Top 10 consommateurs (période)' : 'Top 10 consommateurs (live)'}
        </h3>
        <span className="text-slate-500 text-xs">
          {top10.length} {isHistoric ? 'appareils · trié par kWh' : 'actifs · trié par puissance'}
        </span>
      </div>

      {top10.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-8">
          {isHistoric ? 'Aucune donnée pour la période sélectionnée.' : 'Aucun appareil consommateur détecté en ce moment.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(280, top10.length * 30)}>
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 130 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickFormatter={(v: number) => `${fmtFr(v, isHistoric ? 2 : 0)} ${unit}`}
              label={{ value: axisLabel, position: 'insideBottom', offset: -3, fill: '#94a3b8', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={125} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof top10[number];
                return (
                  <div className="px-3 py-2 text-xs space-y-1">
                    <p className="text-white font-semibold">{d.fullName}</p>
                    <p className="text-slate-400">Site : <span className="text-blue-300">{d.site}</span></p>
                    {d.room && <p className="text-slate-400">Pièce : <span className="text-purple-300">{d.room}</span></p>}
                    <p className="text-orange-400 font-bold pt-1 border-t border-white/10">
                      {fmtFr(d.value, isHistoric ? 3 : 1)} {unit}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {top10.map((d, i) => (
                <Cell key={i} fill={SITE_COLORS[d.site] ?? '#06b6d4'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
