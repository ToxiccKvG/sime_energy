// ============================================================
// Dashboard IOT — KPIs globaux par site (puissance, énergie, coût)
// ============================================================

import { useMemo } from 'react';
import { Activity, Zap, CheckCircle2, AlertTriangle, BatteryCharging, Sun } from 'lucide-react';
import { ACCOUNT_BY_SITE, isMainMeter, isPVMeter, type ShellyClRow, type Device, type EnergyAgg, type Period } from '@/lib/iot-dashboard-service';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
  allDevices: Device[];
  alertsBySite: Record<string, number>;
  period: Period;
  energyAgg: EnergyAgg[];
}

export function KPIBand({ snapshot, allDevices, alertsBySite, period, energyAgg }: Props) {
  const isHistoric = period !== 'live';

  // Mode live : agrégat par site depuis le snapshot brut
  const liveBySite = useMemo(() => {
    const map = new Map<string, {
      totalDevices: number;
      onlineDevices: number;
      mainPowerW: number;
      allPowerW: number;
    }>();
    const sites = new Set<string>();
    for (const d of allDevices) if (d.site) sites.add(d.site);
    for (const s of sites) {
      map.set(s, { totalDevices: allDevices.filter(d => d.site === s).length, onlineDevices: 0, mainPowerW: 0, allPowerW: 0 });
    }
    for (const r of snapshot) {
      const entry = map.get(r.site);
      if (!entry) continue;
      entry.onlineDevices += 1;
      const p = Math.max(0, Number(r.power_w ?? 0));
      entry.allPowerW += p;
      if (isMainMeter(r.name)) entry.mainPowerW += p;
    }
    return Array.from(map.entries()).map(([site, v]) => ({ site, ...v }));
  }, [snapshot, allDevices]);

  // Mode historique : séparer compteurs principaux et sous-appareils
  // ─ kwhImport   = M1 SENELEC (import réseau) → base du coût facturé
  // ─ kwhCharges  = M3 Charges (consommation totale) → affiché comme "conso"
  // ─ kwhPV       = M5 PV (production solaire)
  // ─ kwhFallback = somme des compteurs principaux si M1/M3 absents
  // ─ nbSubDevices = nombre de sous-appareils (hors compteurs principaux)
  const historicBySite = useMemo(() => {
    type SiteAgg = {
      kwhImport: number;
      kwhCharges: number;
      kwhPV: number;
      kwhFallback: number;
      nbSubDevices: number;
      nbMainMeters: number;
    };
    const map = new Map<string, SiteAgg>();

    for (const e of energyAgg) {
      const cur = map.get(e.site) ?? {
        kwhImport: 0, kwhCharges: 0, kwhPV: 0,
        kwhFallback: 0, nbSubDevices: 0, nbMainMeters: 0,
      };
      const isSenelec = /M1[_\s]?SENELEC|EM-SENELEC|SENELEC/i.test(e.name);
      const isCharge  = /M3[_\s]?CHARGE|CHARGE_CONSOMMATION|TGBT/i.test(e.name);
      const isPV      = isPVMeter(e.name);
      const isMain    = isMainMeter(e.name);

      if (isSenelec)      { cur.kwhImport  += e.kwh; cur.nbMainMeters++; }
      else if (isCharge)  { cur.kwhCharges += e.kwh; cur.nbMainMeters++; }
      else if (isPV)      { cur.kwhPV      += e.kwh; cur.nbMainMeters++; }
      else if (isMain)    { cur.kwhFallback += e.kwh; cur.nbMainMeters++; }
      else                { cur.nbSubDevices++; }

      map.set(e.site, cur);
    }

    const knownSites = Array.from(new Set(allDevices.map(d => d.site).filter(Boolean)));
    return knownSites.map(site => ({ site, ...(map.get(site) ?? {
      kwhImport: 0, kwhCharges: 0, kwhPV: 0,
      kwhFallback: 0, nbSubDevices: 0, nbMainMeters: 0,
    }) }));
  }, [energyAgg, allDevices]);

  const sites = isHistoric ? historicBySite : liveBySite;

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-slate-400 text-sm">
        {isHistoric
          ? 'Aucune donnée pour la période sélectionnée.'
          : 'Aucun site détecté. Vérifie que le polling Shelly tourne dans Supabase.'}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${sites.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
      {sites.map(s => {
        const account = ACCOUNT_BY_SITE[s.site] ?? s.site;
        const alerts = alertsBySite[s.site] ?? 0;

        if (isHistoric) {
          const hs = s as typeof historicBySite[number];
          const noData = hs.kwhImport === 0 && hs.kwhCharges === 0 && hs.kwhFallback === 0 && hs.nbSubDevices === 0;

          // Consommation affichée = M3 Charges en priorité, sinon import M1,
          // sinon somme des compteurs principaux détectés
          const kwhConso = hs.kwhCharges > 0 ? hs.kwhCharges
            : hs.kwhImport > 0 ? hs.kwhImport
            : hs.kwhFallback;
          const consoLabel = hs.kwhCharges > 0 ? 'M3 — Charges totales'
            : hs.kwhImport > 0 ? 'M1 — Import réseau'
            : 'Compteur(s) principal/aux';

          return (
            <div key={s.site}
              className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-white/[0.02] p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-400" /> {s.site}
                  </h3>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mt-0.5">{account}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hs.nbSubDevices > 0 && (
                    <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                      {hs.nbSubDevices} sous-appareils
                    </span>
                  )}
                  {alerts > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs">
                      <AlertTriangle className="h-3 w-3" /> {alerts}
                    </span>
                  )}
                </div>
              </div>

              {noData ? (
                <p className="text-slate-500 text-xs italic py-2">
                  Aucune donnée pour la période sélectionnée.
                </p>
              ) : (
                <>
                  <div className={`grid gap-2 ${hs.kwhPV > 0 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
                    {/* Consommation totale — M3 Charges */}
                    <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                        <BatteryCharging className="h-3 w-3" /> Consommation
                      </p>
                      <p className="text-white text-xl font-bold mt-1">
                        {fmtFr(kwhConso, kwhConso >= 100 ? 1 : 2)}
                        <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                      </p>
                      <p className="text-slate-500 text-[10px] mt-0.5">{consoLabel}</p>
                    </div>

                    {/* Import réseau — M1 SENELEC (si distinct de la conso) */}
                    {hs.kwhImport > 0 && hs.kwhCharges > 0 && (
                      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Zap className="h-3 w-3" /> Import réseau
                        </p>
                        <p className="text-white text-xl font-bold mt-1">
                          {fmtFr(hs.kwhImport, hs.kwhImport >= 100 ? 1 : 2)}
                          <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                        </p>
                        <p className="text-slate-500 text-[10px] mt-0.5">M1 — SENELEC</p>
                      </div>
                    )}

                    {/* Production PV — M5 */}
                    {hs.kwhPV > 0 && (
                      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Sun className="h-3 w-3" /> Production PV
                        </p>
                        <p className="text-white text-xl font-bold mt-1">
                          {fmtFr(hs.kwhPV, hs.kwhPV >= 100 ? 1 : 2)}
                          <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                        </p>
                        <p className="text-slate-500 text-[10px] mt-0.5">M5 — Solaire</p>
                      </div>
                    )}

                  </div>
                </>
              )}
            </div>
          );
        }

        // Mode live
        const ls = s as typeof liveBySite[number];
        const offline = ls.totalDevices - ls.onlineDevices;
        return (
          <div key={s.site}
            className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" /> {s.site}
                </h3>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mt-0.5">{account}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> {ls.onlineDevices}/{ls.totalDevices}
                </span>
                {offline > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400">{offline} offline</span>
                )}
                {alerts > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {alerts}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Puissance live
                </p>
                <p className="text-white text-xl font-bold mt-1">
                  {fmtFr(ls.mainPowerW / 1000, 2)}
                  <span className="text-xs text-slate-400 font-normal ml-1">kW</span>
                </p>
                <p className="text-slate-500 text-[10px] mt-0.5">Compteurs principaux</p>
              </div>
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total appareils</p>
                <p className="text-white text-xl font-bold mt-1">
                  {fmtFr(ls.allPowerW / 1000, 2)}
                  <span className="text-xs text-slate-400 font-normal ml-1">kW</span>
                </p>
                <p className="text-slate-500 text-[10px] mt-0.5">Toutes familles confondues</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
