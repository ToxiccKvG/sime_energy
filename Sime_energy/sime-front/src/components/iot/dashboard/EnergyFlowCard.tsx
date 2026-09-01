// ============================================================
// Dashboard IOT — Flux énergétique par site
// Schéma : SENELEC → Sélecteur → Charges + PV → Sélecteur
// Live       → puissance instantanée (kW)
// Historique → énergie consommée sur la période (kWh)
//
// Les compteurs sont résolus par leur RÔLE (table shelly_device_roles),
// pas par une regex sur leur nom ni par un site codé en dur : les noms
// changent côté Shelly Cloud et les conventions diffèrent d'un site à
// l'autre. Un site sans rattachement n'affiche simplement pas de carte.
// ============================================================

import { useMemo } from 'react';
import { Sun, Plug, ArrowRight, Zap, Building2, AlertTriangle } from 'lucide-react';
import type { ShellyClRow, EnergyAgg, Period } from '@/lib/iot-dashboard-service';
import type { ShellyDeviceRole, DeviceRole } from '@/lib/shelly-device-role-service';

const fmtFr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  period: Period;
  /** device_id → rattachement électrique. Vide = aucune carte affichée. */
  roles: Map<string, ShellyDeviceRole>;
}

// Rôles qui composent le schéma de flux. Les autres (DEPART, AMBIANCE…)
// n'y figurent pas : ce sont des sous-charges, pas des points de bilan.
const ROLES_FLUX: DeviceRole[] = ['M1_RESEAU', 'M2_SELECTEUR', 'M3_CHARGE', 'M5_PV'];

// ── Composants de présentation ────────────────────────────────

// Nœud sans mesure : la valeur est remplacée par un tiret et le motif est
// affiché. Le contour passe en pointillé gris pour que l'œil distingue
// immédiatement « mesuré » de « non mesuré » sans lire les chiffres.
function NodeVide({ icon: Icon, name, sub, motif }: {
  icon: React.ComponentType<{ className?: string }>;
  name: string; sub?: string; motif: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600/50 bg-slate-500/5 p-3 text-center">
      <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1 bg-slate-500/15">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="text-slate-400 text-xs font-semibold">{name}</p>
      <p className="text-xl font-bold mt-1 text-slate-600">—</p>
      <p className="text-amber-500/80 text-[10px] mt-0.5">{motif}</p>
      {sub && <p className="text-slate-600 text-[10px]">{sub}</p>}
    </div>
  );
}

function NodeLive({ icon: Icon, color, name, power, energy, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  color: string; name: string; power: number | null; energy?: number | null; sub?: string;
}) {
  if (power == null) return <NodeVide icon={Icon} name={name} sub={sub} motif="aucune donnée · hors ligne" />;
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
  color: string; name: string; kwh: number | null; sub?: string;
}) {
  if (kwh == null) return <NodeVide icon={Icon} name={name} sub={sub} motif="aucune donnée sur la période" />;
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
    </div>
  );
}

function Arrow({ value, unit = 'kW', color = '#64748b', dim = false }: {
  value: number | null; unit?: string; color?: string; dim?: boolean;
}) {
  const inconnu = value == null;
  return (
    <div className={`flex flex-col items-center justify-center ${dim || inconnu ? 'opacity-30' : ''}`}>
      <ArrowRight className="h-5 w-5" style={{ color }} />
      <p className="text-[10px] font-semibold mt-0.5" style={{ color }}>
        {inconnu ? '—' : `${fmtFr(value, value >= 100 ? 1 : 2)} ${unit}`}
      </p>
    </div>
  );
}

// Encart autoconsommation : affiche le pourcentage seulement s'il est mesuré.
function AutoConsoBloc({ pct, valeur, unite, manquants }: {
  pct: number | null; valeur: number | null; unite: string; manquants: string;
}) {
  if (pct == null) {
    return (
      <div className="rounded-xl border border-dashed border-slate-600/50 bg-slate-500/5 p-3 text-center">
        <p className="text-slate-400 text-[10px] uppercase tracking-wide">Autoconsommation</p>
        <p className="text-2xl font-bold text-slate-600 mt-1">—</p>
        <p className="text-amber-500/80 text-[10px] mt-0.5">
          incalculable · {manquants || 'compteur'} sans données
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-3 text-center bg-green-500/5 border-green-500/30">
      <p className="text-green-400 text-[10px] uppercase tracking-wide">Autoconsommation</p>
      <p className="text-2xl font-bold text-green-400 mt-1">{fmtFr(pct, 0)}%</p>
      <p className="text-slate-500 text-[10px] mt-0.5">
        {fmtFr(valeur ?? 0, 2)} {unite} utilisés sur place
      </p>
    </div>
  );
}

// ── Carte d'un site ───────────────────────────────────────────

function SiteFlow({ site, snapshot, energyAgg, isHistoric, roles }: {
  site: string;
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  isHistoric: boolean;
  roles: Map<string, ShellyDeviceRole>;
}) {
  const live = useMemo(() => {
    const rows = snapshot.filter(r => r.site === site);
    const byRole = (role: DeviceRole) => rows.find(r => roles.get(r.device_id)?.role === role);
    return { m1: byRole('M1_RESEAU'), m2: byRole('M2_SELECTEUR'), m3: byRole('M3_CHARGE'), pv: byRole('M5_PV') };
  }, [snapshot, site, roles]);

  const hist = useMemo(() => {
    const rows = energyAgg.filter(e => e.site === site);
    const byRole = (role: DeviceRole) => rows.find(e => roles.get(e.device_id)?.role === role);
    return { m1: byRole('M1_RESEAU'), m2: byRole('M2_SELECTEUR'), m3: byRole('M3_CHARGE'), pv: byRole('M5_PV') };
  }, [energyAgg, site, roles]);

  // ── Valeurs live ──────────────────────────────────────────────
  //
  //  `null` = grandeur INCONNUE, à ne jamais confondre avec 0. Un compteur
  //  débranché renvoyait ici `?? 0`, et le tableau de bord affirmait donc que
  //  le site ne consommait rien. Un site non mesuré n'est pas un site à
  //  l'arrêt : tout indicateur dérivé d'une grandeur inconnue reste inconnu.
  const powerKw = (r?: ShellyClRow): number | null => {
    if (!r || r.state === 'offline' || r.online === false || r.power_w == null) return null;
    return Math.max(0, Number(r.power_w)) / 1000;
  };
  // TC monté à l'envers (cas relevé sur PV_BUILDING COMMUNAL) : la production
  // est comptée en soutirage. Le rattachement porte le drapeau, on permute ici.
  const energyKwh = (r?: ShellyClRow): number | null => {
    if (!r) return null;
    const inverse = roles.get(r.device_id)?.sens_inverse ?? false;
    const wh = inverse ? (r.wh_rtot ?? r.wh_tot) : r.wh_tot;
    return wh == null ? null : Number(wh) / 1000;
  };

  const pSenelec = powerKw(live.m1);
  const pSelect  = powerKw(live.m2);
  const pCharge  = powerKw(live.m3);
  const pPV      = powerKw(live.pv);
  const eSenelec = energyKwh(live.m1);
  const eCharge  = energyKwh(live.m3);
  const ePV      = energyKwh(live.pv);

  // Autoconsommation et surplus croisent PV et charges : sans l'un des deux,
  // le résultat n'existe pas — on ne le remplace pas par 0 %.
  const liveKnown        = pPV != null && pCharge != null;
  const autoConsoKwLive  = liveKnown ? Math.min(pPV, pCharge) : null;
  const autoConsoPctLive = liveKnown && pCharge > 0 ? (autoConsoKwLive! / pCharge) * 100 : null;
  const surplusPVLive    = liveKnown ? Math.max(0, pPV - pCharge) : null;

  // ── Valeurs historiques ───────────────────────────────────────
  const hSenelec = hist.m1?.kwh ?? null;
  const hSelect  = hist.m2?.kwh ?? null;
  const hCharge  = hist.m3?.kwh ?? null;
  const hPV      = hist.pv?.kwh ?? null;
  const histKnown        = hCharge != null && hSenelec != null;
  const autoConsoKwhHist = histKnown ? Math.max(0, hCharge - hSenelec) : null;
  const autoConsoPctHist = histKnown && hCharge > 0 ? (autoConsoKwhHist! / hCharge) * 100 : null;
  const surplusKwh       = hPV != null && autoConsoKwhHist != null
    ? Math.max(0, hPV - autoConsoKwhHist)
    : null;

  // Nomme les compteurs muets, pour que l'absence soit explicable et non subie.
  const manquantsLive = [
    pPV == null     ? 'M5 PV' : null,
    pCharge == null ? 'M3 charges' : null,
  ].filter(Boolean).join(' et ');
  const manquantsHist = [
    hCharge == null  ? 'M3 charges' : null,
    hSenelec == null ? 'M1 réseau' : null,
  ].filter(Boolean).join(' et ');

  // Rattachements encore à l'état de proposition : le schéma peut donc reposer
  // sur une hypothèse. On le dit plutôt que de le laisser croire acquis.
  //
  //  Le décompte porte sur TOUS les appareils du site portant un rôle de bilan,
  //  pas seulement sur ceux résolus dans le snapshot : poll-shelly n'écrit les
  //  lignes « offline » qu'une fois toutes les 10 minutes (bloc ID_FALLBACK
  //  conditionné à forceMetaRefresh) alors que le snapshot ne regarde que les
  //  5 dernières minutes. Un compteur débranché entre donc et sort du snapshot,
  //  et le badge oscillait entre 1 et 4 d'un rafraîchissement à l'autre.
  const aConfirmer = useMemo(() => {
    const idsDuSite = new Set<string>();
    for (const r of snapshot)   if (r.site === site) idsDuSite.add(r.device_id);
    for (const e of energyAgg)  if (e.site === site) idsDuSite.add(e.device_id);
    let n = 0;
    for (const id of idsDuSite) {
      const rattachement = roles.get(id);
      if (rattachement && ROLES_FLUX.includes(rattachement.role) && rattachement.confirme_at == null) n += 1;
    }
    return n;
  }, [snapshot, energyAgg, site, roles]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start sm:items-center justify-between mb-3 gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" /> Flux énergétique — {site}
        </h3>
        <div className="flex items-center gap-2">
          {aConfirmer > 0 && (
            <span className="text-amber-400/90 text-[11px] flex items-center gap-1" title="Rattachements appareil → rôle proposés automatiquement, pas encore validés">
              <AlertTriangle className="h-3 w-3" />
              {aConfirmer} rattachement{aConfirmer > 1 ? 's' : ''} à confirmer
            </span>
          )}
          <span className="text-slate-500 text-xs">
            {isHistoric ? 'Historique' : 'Live'} · M1 · M2 · M3 · M5 PV
          </span>
        </div>
      </div>

      {isHistoric ? (
        /* ── Vue historique : kWh ── */
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr,auto,1fr] gap-2 items-center">
          <NodeHist icon={Plug}      color="#3b82f6" name="M1 — Réseau"   kwh={hSenelec} sub="Import réseau" />
          <Arrow value={hSenelec} unit="kWh" dim={hSenelec === 0} />
          <NodeHist icon={Building2} color="#06b6d4" name="M2 — Sélecteur"  kwh={hSelect}  sub="Aiguillage PV/réseau" />
          <Arrow value={hCharge}  unit="kWh" dim={hCharge === 0} />
          <NodeHist icon={Building2} color="#ef4444" name="M3 — Charges"    kwh={hCharge}  sub="Consommation totale" />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeHist icon={Sun} color="#facc15" name="M5 — PV" kwh={hPV} sub="Production solaire" />
              <Arrow value={autoConsoKwhHist} unit="kWh" color="#22c55e" dim={hPV === 0} />
              <AutoConsoBloc pct={autoConsoPctHist} valeur={autoConsoKwhHist} unite="kWh" manquants={manquantsHist} />
            </div>
          </div>

          {surplusKwh != null && surplusKwh > 0.05 && (
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
          <NodeLive icon={Plug}      color="#3b82f6" name="M1 — Réseau"  power={pSenelec} energy={eSenelec} sub="Compteur réseau" />
          <Arrow value={pSenelec} dim={pSenelec === 0} />
          <NodeLive icon={Building2} color="#06b6d4" name="M2 — Sélecteur" power={pSelect}  sub="Aiguillage PV/réseau" />
          <Arrow value={pCharge} dim={pCharge === 0} />
          <NodeLive icon={Building2} color="#ef4444" name="M3 — Charges"   power={pCharge}  energy={eCharge} sub="Consommation totale" />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeLive icon={Sun} color="#facc15" name="M5 — PV" power={pPV} energy={ePV} sub="Production solaire" />
              <Arrow value={autoConsoKwLive} color="#22c55e" dim={pPV === 0} />
              <AutoConsoBloc pct={autoConsoPctLive} valeur={autoConsoKwLive} unite="kW" manquants={manquantsLive} />
            </div>
          </div>

          {surplusPVLive != null && surplusPVLive > 0.05 && (
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

// ── Point d'entrée : une carte par site rattaché ──────────────

export function EnergyFlowCard({ snapshot, energyAgg, period, roles }: Props) {
  const isHistoric = period !== 'live';

  // Sites qui portent au moins un compteur du schéma de flux. Un site dont les
  // appareils ne sont pas encore rattachés n'apparaît pas — c'est le signal
  // qu'il faut passer par l'écran de rattachement, pas un bug.
  const sites = useMemo(() => {
    const withFlux = new Set<string>();
    const scan = (rows: { site: string; device_id: string }[]) => {
      for (const r of rows) {
        const role = roles.get(r.device_id)?.role;
        if (role && ROLES_FLUX.includes(role)) withFlux.add(r.site);
      }
    };
    scan(snapshot);
    scan(energyAgg);
    return Array.from(withFlux).sort();
  }, [snapshot, energyAgg, roles]);

  if (sites.length === 0) return null;

  return (
    <div className="space-y-3">
      {sites.map(site => (
        <SiteFlow
          key={site}
          site={site}
          snapshot={snapshot}
          energyAgg={energyAgg}
          isHistoric={isHistoric}
          roles={roles}
        />
      ))}
    </div>
  );
}
