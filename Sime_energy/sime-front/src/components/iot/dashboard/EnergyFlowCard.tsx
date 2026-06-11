// ============================================================
// Dashboard IOT — Flux énergétique PV / SENELEC (Académie CER2E)
// Schéma simple : SENELEC → Sélecteur → Charges + PV → Sélecteur
// Live       → puissance instantanée (kW)
// Historique → énergie consommée sur la période (kWh)
// ============================================================

import { useMemo } from 'react';
import { Sun, Plug, ArrowRight, Zap, Building2 } from 'lucide-react';
import type { ShellyClRow, EnergyAgg, Period } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  period: Period;
}

function findByPattern(rows: ShellyClRow[], pattern: RegExp): ShellyClRow | undefined {
  return rows.find(r => pattern.test(r.name));
}
function findAggByPattern(agg: EnergyAgg[], pattern: RegExp): EnergyAgg | undefined {
  return agg.find(e => pattern.test(e.name) && e.site === 'Académie CER2E');
}

export function EnergyFlowCard({ snapshot, energyAgg, period }: Props) {
  const isHistoric = period !== 'live';

  // ── Mode live ─────────────────────────────────────────────────
  const live = useMemo(() => {
    const academie = snapshot.filter(r => r.site === 'Académie CER2E');
    return {
      m1: findByPattern(academie, /M1[_\s]?SENELEC/i),
      m2: findByPattern(academie, /M2[_\s]?SELECTEUR/i),
      m3: findByPattern(academie, /M3[_\s]?CHARGE/i),
      pv: findByPattern(academie, /PV_BUILDING|PV[_\s]|M5/i),
    };
  }, [snapshot]);

  // ── Mode historique ───────────────────────────────────────────
  const hist = useMemo(() => ({
    m1: findAggByPattern(energyAgg, /M1[_\s]?SENELEC/i),
    m2: findAggByPattern(energyAgg, /M2[_\s]?SELECTEUR/i),
    m3: findAggByPattern(energyAgg, /M3[_\s]?CHARGE/i),
    pv: findAggByPattern(energyAgg, /PV_BUILDING|PV[_\s]|M5/i),
  }), [energyAgg]);

  const hasLive = !!(live.m1 || live.m2 || live.m3 || live.pv);
  const hasHist = !!(hist.m1 || hist.m2 || hist.m3 || hist.pv);
  if (!hasLive && !hasHist) return null;

  // ── Valeurs live ──────────────────────────────────────────────
  const pSenelec = Math.max(0, Number(live.m1?.power_w ?? 0)) / 1000;
  const pSelect  = Math.max(0, Number(live.m2?.power_w ?? 0)) / 1000;
  const pCharge  = Math.max(0, Number(live.m3?.power_w ?? 0)) / 1000;
  const pPV      = Math.max(0, Number(live.pv?.power_w ?? 0)) / 1000;
  const eSenelec = Number(live.m1?.wh_tot ?? live.m1?.wh_counter ?? 0) / 1000;
  const eCharge  = Number(live.m3?.wh_tot ?? live.m3?.wh_counter ?? 0) / 1000;
  const ePV      = Number(live.pv?.wh_tot ?? live.pv?.wh_counter ?? 0) / 1000;
  const autoConsoKwLive  = Math.min(pPV, pCharge);
  const autoConsoPctLive = pCharge > 0 ? (autoConsoKwLive / pCharge) * 100 : 0;
  const surplusPVLive    = Math.max(0, pPV - pCharge);

  // ── Valeurs historiques ───────────────────────────────────────
  const hSenelec = hist.m1?.kwh ?? 0;
  const hSelect  = hist.m2?.kwh ?? 0;
  const hCharge  = hist.m3?.kwh ?? 0;
  const hPV      = hist.pv?.kwh ?? 0;
  // Autoconsommation : énergie charges qui vient du PV (charges - import réseau)
  const autoConsoKwhHist = Math.max(0, hCharge - hSenelec);
  const autoConsoPctHist = hCharge > 0 ? (autoConsoKwhHist / hCharge) * 100 : 0;
  const surplusKwh       = Math.max(0, hPV - autoConsoKwhHist);

  // ── Composants internes ───────────────────────────────────────
  function NodeLive({ icon: Icon, color, name, power, energy, sub }: {
    icon: React.ComponentType<{ className?: string }>;
    color: string; name: string; power: number; energy?: number; sub?: string;
  }) {
    return (
      <div className="rounded-xl border p-3 text-center" style={{ backgroundColor: color + '10', borderColor: color + '50' }}>
        <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: color + '25' }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <p className="text-white text-xs font-semibold">{name}</p>
        <p className="text-xl font-bold mt-1" style={{ color }}>
          {fmtFr(power, 2)} <span className="text-[10px] text-slate-400 font-normal">kW</span>
        </p>
        {typeof energy === 'number' && energy > 0 && (
          <p className="text-slate-500 text-[10px] mt-0.5">{fmtFr(energy, 0)} kWh cumulés</p>
        )}
        {sub && <p className="text-slate-500 text-[10px]">{sub}</p>}
      </div>
    );
  }

  function NodeHist({ icon: Icon, color, name, kwh, sub }: {
    icon: React.ComponentType<{ className?: string }>;
    color: string; name: string; kwh: number; sub?: string;
  }) {
    return (
      <div className="rounded-xl border p-3 text-center" style={{ backgroundColor: color + '10', borderColor: color + '50' }}>
        <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: color + '25' }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <p className="text-white text-xs font-semibold">{name}</p>
        <p className="text-xl font-bold mt-1" style={{ color }}>
          {fmtFr(kwh, kwh >= 100 ? 1 : 2)} <span className="text-[10px] text-slate-400 font-normal">kWh</span>
        </p>
        {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
        {kwh === 0 && <p className="text-slate-600 text-[10px] italic">aucune donnée</p>}
      </div>
    );
  }

  function Arrow({ value, unit = 'kW', color = '#64748b', dim = false }: {
    value: number; unit?: string; color?: string; dim?: boolean;
  }) {
    return (
      <div className={`flex flex-col items-center justify-center ${dim ? 'opacity-30' : ''}`}>
        <ArrowRight className="h-5 w-5" style={{ color }} />
        <p className="text-[10px] font-semibold mt-0.5" style={{ color }}>
          {fmtFr(value, value >= 100 ? 1 : 2)} {unit}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start sm:items-center justify-between mb-3 gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" /> Flux énergétique — Académie CER2E
        </h3>
        <span className="text-slate-500 text-xs">
          {isHistoric ? 'Historique' : 'Live'} · M1 · M2 · M3 · M5 PV
        </span>
      </div>

      {isHistoric ? (
        /* ── Vue historique : kWh ── */
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr,auto,1fr] gap-2 items-center">
          <NodeHist icon={Plug}      color="#3b82f6" name="M1 — SENELEC"   kwh={hSenelec} sub="Import réseau" />
          <Arrow value={hSenelec} unit="kWh" dim={hSenelec === 0} />
          <NodeHist icon={Building2} color="#06b6d4" name="M2 — Sélecteur"  kwh={hSelect}  sub="Aiguillage PV/réseau" />
          <Arrow value={hCharge}  unit="kWh" dim={hCharge === 0} />
          <NodeHist icon={Building2} color="#ef4444" name="M3 — Charges"    kwh={hCharge}  sub="Consommation totale" />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeHist icon={Sun} color="#facc15" name="M5 — PV" kwh={hPV} sub="Production solaire" />
              <Arrow value={autoConsoKwhHist} unit="kWh" color="#22c55e" dim={hPV === 0} />
              <div className="rounded-xl border p-3 text-center bg-green-500/5 border-green-500/30">
                <p className="text-green-400 text-[10px] uppercase tracking-wide">Autoconsommation</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{fmtFr(autoConsoPctHist, 0)}%</p>
                <p className="text-slate-500 text-[10px] mt-0.5">{fmtFr(autoConsoKwhHist, 2)} kWh utilisés sur place</p>
              </div>
            </div>
          </div>

          {surplusKwh > 0.05 && (
            <div className="md:col-span-5 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
              <p className="text-amber-300 text-xs">
                ⚡ Surplus PV injecté réseau : <span className="font-bold">{fmtFr(surplusKwh, 2)} kWh</span>
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Vue live : kW ── */
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr,auto,1fr] gap-2 items-center">
          <NodeLive icon={Plug}      color="#3b82f6" name="M1 — SENELEC"  power={pSenelec} energy={eSenelec} sub="Compteur réseau" />
          <Arrow value={pSenelec} dim={pSenelec === 0} />
          <NodeLive icon={Building2} color="#06b6d4" name="M2 — Sélecteur" power={pSelect}  sub="Aiguillage PV/réseau" />
          <Arrow value={pCharge} dim={pCharge === 0} />
          <NodeLive icon={Building2} color="#ef4444" name="M3 — Charges"   power={pCharge}  energy={eCharge} sub="Consommation totale" />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeLive icon={Sun} color="#facc15" name="M5 — PV" power={pPV} energy={ePV} sub="Production solaire" />
              <Arrow value={Math.min(pPV, pCharge)} color="#22c55e" dim={pPV === 0} />
              <div className="rounded-xl border p-3 text-center bg-green-500/5 border-green-500/30">
                <p className="text-green-400 text-[10px] uppercase tracking-wide">Autoconsommation</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{fmtFr(autoConsoPctLive, 0)}%</p>
                <p className="text-slate-500 text-[10px] mt-0.5">{fmtFr(autoConsoKwLive, 2)} kW utilisés sur place</p>
              </div>
            </div>
          </div>

          {surplusPVLive > 0.05 && (
            <div className="md:col-span-5 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
              <p className="text-amber-300 text-xs">
                ⚡ Surplus PV injecté réseau : <span className="font-bold">{fmtFr(surplusPVLive, 2)} kW</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
