// ============================================================
// Dashboard IOT — KPIs globaux par site (puissance, énergie)
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Activity, Zap, CheckCircle2, AlertTriangle, BatteryCharging, Sun } from 'lucide-react';
import { fetchAccountLabels, isMainMeter, isPVMeter, type ShellyClRow, type Device, type EnergyAgg, type Period } from '@/lib/iot-dashboard-service';
import type { ShellyDeviceRole } from '@/lib/shelly-device-role-service';
import { indexLieux, type PlageDetail } from '@/lib/iot-energy-detail-service';
import { EnergyDetailDialog, type EnergySubject } from './EnergyDetailDialog';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

// Une tuile chiffrée est un bouton : elle ouvre le détail de son total.
const TUILE_CLIC =
  'text-left w-full cursor-pointer transition-shadow hover:ring-1 hover:ring-white/25 ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ' +
  'disabled:cursor-default disabled:hover:ring-0';

interface Props {
  snapshot: ShellyClRow[];
  allDevices: Device[];
  alertsBySite: Record<string, number>;
  period: Period;
  energyAgg: EnergyAgg[];
  /** device_id → rattachement électrique (table shelly_device_roles). */
  roles: Map<string, ShellyDeviceRole>;
  /** Période analysée par la popup de détail. */
  plage: PlageDetail;
}

/** Appareil agrégé dans une tuile. La popup ira chercher sa contribution. */
interface Contributeur {
  device_id: string;
  name: string;
}

// Rôle d'un appareil dans le bilan du site.
//
//  Le rattachement explicite prime toujours ; la reconnaissance par nom
//  (isMainMeter/isPVMeter) ne sert plus que de repli pour les sites pas encore
//  rattachés. Elle est structurellement faillible : « Arrivée générale » à
//  Donsin ne matche aucun motif, le site affichait donc 0,00 kW de compteurs
//  principaux alors que son arrivée tourne en permanence.
type Classe = 'M1' | 'M3' | 'PV' | 'MAIN' | 'SUB';

function classer(deviceId: string, name: string, roles: Map<string, ShellyDeviceRole>): Classe {
  const role = roles.get(deviceId)?.role;
  if (role) {
    if (role === 'M1_RESEAU') return 'M1';
    if (role === 'M3_CHARGE')  return 'M3';
    if (role === 'M5_PV')      return 'PV';
    if (role === 'M2_SELECTEUR' || role === 'M4_GROUPE' || role === 'BESS') return 'MAIN';
    return 'SUB';
  }
  if (isPVMeter(name)) return 'PV';
  if (/M1[_\s]?SENELEC|EM-SENELEC|SENELEC/i.test(name)) return 'M1';
  if (/M3[_\s]?CHARGE|CHARGE_CONSOMMATION|TGBT/i.test(name)) return 'M3';
  if (isMainMeter(name)) return 'MAIN';
  return 'SUB';
}

export function KPIBand({ snapshot, allDevices, alertsBySite, period, energyAgg, roles, plage }: Props) {
  const isHistoric = period !== 'live';
  const [detail, setDetail] = useState<EnergySubject | null>(null);

  // Libellé du compte Shelly par site, lu depuis shelly_accounts
  const [accountLabels, setAccountLabels] = useState<Record<string, string>>({});
  useEffect(() => { fetchAccountLabels().then(setAccountLabels).catch(() => {}); }, []);

  // Site et pièce de chaque appareil : `fn_energy_by_device` ne renvoie pas la
  // pièce, seul le catalogue la porte.
  const lieux = useMemo(() => indexLieux(allDevices, snapshot), [allDevices, snapshot]);

  /**
   * Ouvre le détail d'une tuile. Le sujet est un ENSEMBLE d'appareils, pas un
   * compteur : « Consommation » d'un site peut être portée par plusieurs M3,
   * et « Total appareils » par vingt prises. La popup somme, et calcule
   * elle-même la répartition sur la période pour que le total reste
   * explicable — la carte ne lui transmet que QUI regarder, pas les valeurs.
   */
  const ouvrir = (
    titre: string, site: string, couleur: string, sub: string,
    contributeurs: Contributeur[], notes?: string[],
  ) => {
    if (contributeurs.length === 0) return;
    setDetail({
      titre,
      sousTitre: `${site} · ${sub}`,
      couleur,
      plage,
      series: [{
        label: titre,
        couleur,
        devices: contributeurs.map(c => ({
          device_id: c.device_id,
          name: c.name,
          inverse: roles.get(c.device_id)?.sens_inverse ?? false,
          site: lieux.get(c.device_id)?.site ?? site,
          room: lieux.get(c.device_id)?.room ?? null,
        })),
      }],
      notes,
    });
  };

  // Mode live : agrégat par site depuis le snapshot brut
  //
  //  `null` = puissance INCONNUE, distincte de 0 kW mesuré. Le `?? 0` d'origine
  //  faisait passer un compteur débranché pour un compteur à l'arrêt.
  const liveBySite = useMemo(() => {
    const map = new Map<string, {
      totalDevices: number;
      onlineDevices: number;
      mainPowerW: number | null;
      allPowerW: number | null;
      nbMain: number;        // compteurs principaux identifiés sur le site
      nbMainMesures: number; // ... dont ceux qui remontent réellement une valeur
      // Appareils du site. La popup en a besoin pour ouvrir l'historique — y
      // compris celui d'un compteur actuellement muet, qui est justement
      // celui dont on veut savoir depuis quand il s'est tu.
      mainDevices: Contributeur[];
      allDevicesSite: Contributeur[];
    }>();
    const sites = new Set<string>();
    for (const d of allDevices) if (d.site) sites.add(d.site);
    for (const s of sites) {
      const duSite = allDevices.filter(d => d.site === s);
      const principaux = duSite.filter(d => {
        const c = classer(d.device_id, d.name, roles);
        return c === 'M1' || c === 'M3' || c === 'MAIN';
      });
      map.set(s, {
        totalDevices: duSite.length,
        onlineDevices: 0, mainPowerW: null, allPowerW: null, nbMainMesures: 0,
        mainDevices:    principaux.map(d => ({ device_id: d.device_id, name: d.name })),
        allDevicesSite: duSite.map(d => ({ device_id: d.device_id, name: d.name })),
        // Compté sur le catalogue (fenêtre 7 j) et non sur le snapshot (5 min) :
        // poll-shelly n'écrit les lignes « offline » qu'une fois toutes les
        // 10 minutes, le libellé alternerait sinon entre « aucun compteur
        // rattaché » et « compteurs hors ligne » d'un rafraîchissement à l'autre.
        nbMain: principaux.length,
      });
    }
    for (const r of snapshot) {
      const entry = map.get(r.site);
      if (!entry) continue;
      entry.onlineDevices += 1;
      const classe = classer(r.device_id, r.name, roles);
      const estPrincipal = classe === 'M1' || classe === 'M3' || classe === 'MAIN';

      const injoignable = r.state === 'offline' || r.online === false || r.power_w == null;
      if (injoignable) continue;

      const p = Math.max(0, Number(r.power_w));
      entry.allPowerW = (entry.allPowerW ?? 0) + p;
      if (estPrincipal) {
        entry.mainPowerW = (entry.mainPowerW ?? 0) + p;
        entry.nbMainMesures += 1;
      }
    }
    return Array.from(map.entries()).map(([site, v]) => ({ site, ...v }));
  }, [snapshot, allDevices, roles]);

  // Mode historique : séparer compteurs principaux et sous-appareils
  // ─ kwhImport   = M1 SENELEC (import réseau) → énergie soutirée au réseau
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
      /** Appareils derrière chaque total — la popup doit pouvoir les rouvrir. */
      parClasse: Record<Classe, Contributeur[]>;
    };
    const vide = (): SiteAgg => ({
      kwhImport: 0, kwhCharges: 0, kwhPV: 0,
      kwhFallback: 0, nbSubDevices: 0, nbMainMeters: 0,
      parClasse: { M1: [], M3: [], PV: [], MAIN: [], SUB: [] },
    });
    const map = new Map<string, SiteAgg>();

    for (const e of energyAgg) {
      const cur = map.get(e.site) ?? vide();
      const classe = classer(e.device_id, e.name, roles);
      switch (classe) {
        case 'M1':   cur.kwhImport   += e.kwh; cur.nbMainMeters++; break;
        case 'M3':   cur.kwhCharges  += e.kwh; cur.nbMainMeters++; break;
        case 'PV':   cur.kwhPV       += e.kwh; cur.nbMainMeters++; break;
        case 'MAIN': cur.kwhFallback += e.kwh; cur.nbMainMeters++; break;
        default:     cur.nbSubDevices++;
      }
      cur.parClasse[classe].push({ device_id: e.device_id, name: e.name });

      map.set(e.site, cur);
    }

    const knownSites = Array.from(new Set(allDevices.map(d => d.site).filter(Boolean)));
    return knownSites.map(site => ({ site, ...(map.get(site) ?? vide()) }));
  }, [energyAgg, allDevices, roles]);

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
        const account = accountLabels[s.site] ?? s.site;
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
          // Les appareils ouverts par la popup doivent être EXACTEMENT ceux
          // sommés dans la tuile, repli compris — sinon le détail contredirait
          // le total qu'il est censé expliquer.
          const consoDevices = hs.kwhCharges > 0 ? hs.parClasse.M3
            : hs.kwhImport > 0 ? hs.parClasse.M1
            : hs.parClasse.MAIN;

          return (
            <div key={s.site}
              className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-white/[0.02] p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-400" /> {s.site}
                  </h3>
                  <p className="text-slate-500 text-[0.625rem] uppercase tracking-wide mt-0.5">{account}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hs.nbSubDevices > 0 && (
                    <span className="text-[0.625rem] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
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
                    <button type="button"
                      onClick={() => ouvrir('Consommation', s.site, '#f59e0b', consoLabel, consoDevices)}
                      disabled={consoDevices.length === 0}
                      title="Voir le détail — profil, pointe, répartition"
                      className={`rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 ${TUILE_CLIC}`}>
                      <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                        <BatteryCharging className="h-3 w-3" /> Consommation
                      </p>
                      <p className="text-white text-xl font-bold mt-1">
                        {fmtFr(kwhConso, kwhConso >= 100 ? 1 : 2)}
                        <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                      </p>
                      <p className="text-slate-500 text-[0.625rem] mt-0.5">{consoLabel}</p>
                    </button>

                    {/* Import réseau — M1 SENELEC (si distinct de la conso) */}
                    {hs.kwhImport > 0 && hs.kwhCharges > 0 && (
                      <button type="button"
                        onClick={() => ouvrir('Import réseau', s.site, '#3b82f6', 'M1 — Réseau', hs.parClasse.M1)}
                        title="Voir le détail — profil, pointe, répartition"
                        className={`rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 ${TUILE_CLIC}`}>
                        <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Zap className="h-3 w-3" /> Import réseau
                        </p>
                        <p className="text-white text-xl font-bold mt-1">
                          {fmtFr(hs.kwhImport, hs.kwhImport >= 100 ? 1 : 2)}
                          <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                        </p>
                        <p className="text-slate-500 text-[0.625rem] mt-0.5">M1 — Réseau</p>
                      </button>
                    )}

                    {/* Production PV — M5 */}
                    {hs.kwhPV > 0 && (
                      <button type="button"
                        onClick={() => ouvrir('Production PV', s.site, '#facc15', 'M5 — Solaire', hs.parClasse.PV)}
                        title="Voir le détail — profil de production, pointe"
                        className={`rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 ${TUILE_CLIC}`}>
                        <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Sun className="h-3 w-3" /> Production PV
                        </p>
                        <p className="text-white text-xl font-bold mt-1">
                          {fmtFr(hs.kwhPV, hs.kwhPV >= 100 ? 1 : 2)}
                          <span className="text-xs text-slate-400 font-normal ml-1">kWh</span>
                        </p>
                        <p className="text-slate-500 text-[0.625rem] mt-0.5">M5 — Solaire</p>
                      </button>
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
                <p className="text-slate-500 text-[0.625rem] uppercase tracking-wide mt-0.5">{account}</p>
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
              <button type="button"
                onClick={() => ouvrir(
                  'Puissance — compteurs principaux', s.site, '#3b82f6',
                  'M1 · M2 · M3 · groupe · batterie', ls.mainDevices,
                  ['Vue live : la popup montre les 24 dernières heures, contexte que la valeur instantanée n\'a pas'],
                )}
                disabled={ls.mainDevices.length === 0}
                title="Voir les 24 dernières heures"
                className={`rounded-lg p-3 border ${TUILE_CLIC} ${ls.mainPowerW == null
                ? 'bg-slate-500/5 border-dashed border-slate-600/50'
                : 'bg-blue-500/5 border-blue-500/20'}`}>
                <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Puissance live
                </p>
                {ls.mainPowerW == null ? (
                  <>
                    <p className="text-slate-600 text-xl font-bold mt-1">—</p>
                    <p className="text-amber-500/80 text-[0.625rem] mt-0.5">
                      {ls.nbMain === 0
                        ? 'aucun compteur principal rattaché'
                        : 'compteurs principaux hors ligne'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white text-xl font-bold mt-1">
                      {fmtFr(ls.mainPowerW / 1000, 2)}
                      <span className="text-xs text-slate-400 font-normal ml-1">kW</span>
                    </p>
                    <p className="text-slate-500 text-[0.625rem] mt-0.5">
                      Compteurs principaux
                      {ls.nbMainMesures < ls.nbMain && ` · ${ls.nbMain - ls.nbMainMesures} hors ligne`}
                    </p>
                  </>
                )}
              </button>
              <button type="button"
                onClick={() => ouvrir(
                  'Puissance — tous appareils', s.site, '#22c55e',
                  'toutes familles confondues', ls.allDevicesSite,
                  ['Somme de TOUS les appareils : compteurs principaux et sous-appareils comptent donc deux fois la même énergie'],
                )}
                disabled={ls.allDevicesSite.length === 0}
                title="Voir les 24 dernières heures"
                className={`rounded-lg p-3 border ${TUILE_CLIC} ${ls.allPowerW == null
                ? 'bg-slate-500/5 border-dashed border-slate-600/50'
                : 'bg-green-500/5 border-green-500/20'}`}>
                <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide">Total appareils</p>
                {ls.allPowerW == null ? (
                  <>
                    <p className="text-slate-600 text-xl font-bold mt-1">—</p>
                    <p className="text-amber-500/80 text-[0.625rem] mt-0.5">aucun appareil joignable</p>
                  </>
                ) : (
                  <>
                    <p className="text-white text-xl font-bold mt-1">
                      {fmtFr(ls.allPowerW / 1000, 2)}
                      <span className="text-xs text-slate-400 font-normal ml-1">kW</span>
                    </p>
                    <p className="text-slate-500 text-[0.625rem] mt-0.5">Toutes familles confondues</p>
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}

      <EnergyDetailDialog sujet={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
