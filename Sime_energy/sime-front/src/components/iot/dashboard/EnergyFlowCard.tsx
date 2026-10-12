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

import { useMemo, useState } from 'react';
import { Sun, Plug, ArrowRight, Zap, Building2, AlertTriangle } from 'lucide-react';
import type { ShellyClRow, EnergyAgg, Period, Device } from '@/lib/iot-dashboard-service';
import type { ShellyDeviceRole, DeviceRole } from '@/lib/shelly-device-role-service';
import { indexLieux, type PlageDetail } from '@/lib/iot-energy-detail-service';
import { EnergyDetailDialog, type EnergySubject } from './EnergyDetailDialog';

const fmtFr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  period: Period;
  /** device_id → rattachement électrique. Vide = aucune carte affichée. */
  roles: Map<string, ShellyDeviceRole>;
  /** Catalogue 7 jours — identifie un compteur même absent du snapshot 5 min. */
  allDevices: Device[];
  /** Période analysée par la popup de détail. */
  plage: PlageDetail;
}

// Rôles qui composent le schéma de flux. Les autres (DEPART, AMBIANCE…)
// n'y figurent pas : ce sont des sous-charges, pas des points de bilan.
const ROLES_FLUX: DeviceRole[] = ['M1_RESEAU', 'M2_SELECTEUR', 'M3_CHARGE', 'M5_PV'];

// ── Composants de présentation ────────────────────────────────

// Les icônes lucide reçoivent leur couleur en `style` et non par une classe :
// elle vient du rôle électrique du nœud, valeur calculée, pas d'une palette
// Tailwind connue à la compilation.
type IconeNoeud = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

// Un nœud est cliquable dès qu'un appareil lui est rattaché — y compris
// lorsqu'il n'a rien mesuré : c'est justement là qu'on veut savoir depuis
// quand il s'est tu, et ce qu'il mesurait avant.
const CLIQUABLE =
  'cursor-pointer transition-shadow hover:ring-1 hover:ring-white/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40';

// Nœud sans mesure : la valeur est remplacée par un tiret et le motif est
// affiché. Le contour passe en pointillé gris pour que l'œil distingue
// immédiatement « mesuré » de « non mesuré » sans lire les chiffres.
function NodeVide({ icon: Icon, name, sub, motif, onClick }: {
  icon: IconeNoeud;
  name: string; sub?: string; motif: string; onClick?: () => void;
}) {
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      title={onClick ? 'Voir le détail' : undefined}
      className={`rounded-xl border border-dashed border-slate-600/50 bg-slate-500/5 p-3 text-center ${onClick ? CLIQUABLE : ''}`}>
      <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1 bg-slate-500/15">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="text-slate-400 text-xs font-semibold">{name}</p>
      <p className="text-xl font-bold mt-1 text-slate-600">—</p>
      <p className="text-amber-500/80 text-[0.625rem] mt-0.5">{motif}</p>
      {sub && <p className="text-slate-600 text-[0.625rem]">{sub}</p>}
    </div>
  );
}

function NodeLive({ icon: Icon, color, name, power, energy, sub, onClick }: {
  icon: IconeNoeud;
  color: string; name: string; power: number | null; energy?: number | null; sub?: string;
  onClick?: () => void;
}) {
  if (power == null) return <NodeVide icon={Icon} name={name} sub={sub} motif="aucune donnée · hors ligne" onClick={onClick} />;
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      title={onClick ? 'Voir le détail' : undefined}
      className={`rounded-xl border p-3 text-center ${onClick ? CLIQUABLE : ''}`}
      style={{ backgroundColor: color + '10', borderColor: color + '50' }}>
      <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: color + '25' }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <p className="text-white text-xs font-semibold">{name}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>
        {fmtFr(power, 2)} <span className="text-[0.625rem] text-slate-400 font-normal">kW</span>
      </p>
      {typeof energy === 'number' && energy > 0 && (
        <p className="text-slate-500 text-[0.625rem] mt-0.5">{fmtFr(energy, 0)} kWh cumulés</p>
      )}
      {sub && <p className="text-slate-500 text-[0.625rem]">{sub}</p>}
    </div>
  );
}

function NodeHist({ icon: Icon, color, name, kwh, sub, onClick }: {
  icon: IconeNoeud;
  color: string; name: string; kwh: number | null; sub?: string; onClick?: () => void;
}) {
  if (kwh == null) return <NodeVide icon={Icon} name={name} sub={sub} motif="aucune donnée sur la période" onClick={onClick} />;
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      title={onClick ? 'Voir le détail' : undefined}
      className={`rounded-xl border p-3 text-center ${onClick ? CLIQUABLE : ''}`}
      style={{ backgroundColor: color + '10', borderColor: color + '50' }}>
      <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: color + '25' }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <p className="text-white text-xs font-semibold">{name}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>
        {fmtFr(kwh, kwh >= 100 ? 1 : 2)} <span className="text-[0.625rem] text-slate-400 font-normal">kWh</span>
      </p>
      {sub && <p className="text-slate-500 text-[0.625rem] mt-0.5">{sub}</p>}
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
      <p className="text-[0.625rem] font-semibold mt-0.5" style={{ color }}>
        {inconnu ? '—' : `${fmtFr(value, value >= 100 ? 1 : 2)} ${unit}`}
      </p>
    </div>
  );
}

// Encart autoconsommation : affiche le pourcentage seulement s'il est mesuré.
function AutoConsoBloc({ pct, valeur, unite, manquants, onClick }: {
  pct: number | null; valeur: number | null; unite: string; manquants: string;
  onClick?: () => void;
}) {
  const clic = onClick
    ? {
        role: 'button' as const, tabIndex: 0, onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
        },
        title: 'Comparer PV, charges et réseau',
        className: CLIQUABLE,
      }
    : { className: '' };
  if (pct == null) {
    return (
      <div {...clic} className={`rounded-xl border border-dashed border-slate-600/50 bg-slate-500/5 p-3 text-center ${clic.className}`}>
        <p className="text-slate-400 text-[0.625rem] uppercase tracking-wide">Autoconsommation</p>
        <p className="text-2xl font-bold text-slate-600 mt-1">—</p>
        <p className="text-amber-500/80 text-[0.625rem] mt-0.5">
          incalculable · {manquants || 'compteur'} sans données
        </p>
      </div>
    );
  }
  return (
    <div {...clic} className={`rounded-xl border p-3 text-center bg-green-500/5 border-green-500/30 ${clic.className}`}>
      <p className="text-green-400 text-[0.625rem] uppercase tracking-wide">Autoconsommation</p>
      <p className="text-2xl font-bold text-green-400 mt-1">{fmtFr(pct, 0)}%</p>
      <p className="text-slate-500 text-[0.625rem] mt-0.5">
        {fmtFr(valeur ?? 0, 2)} {unite} utilisés sur place
      </p>
    </div>
  );
}

// ── Carte d'un site ───────────────────────────────────────────

function SiteFlow({ site, snapshot, energyAgg, isHistoric, roles, allDevices, plage }: {
  site: string;
  snapshot: ShellyClRow[];
  energyAgg: EnergyAgg[];
  isHistoric: boolean;
  roles: Map<string, ShellyDeviceRole>;
  allDevices: Device[];
  plage: PlageDetail;
}) {
  const [detail, setDetail] = useState<EnergySubject | null>(null);
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

  // Appareil porteur de chaque rôle sur le site. Résolu sur le CATALOGUE
  // (fenêtre 7 j) et pas seulement sur le snapshot : un compteur débranché
  // sort du snapshot au bout de 5 minutes, or c'est précisément celui dont on
  // veut ouvrir l'historique. Le snapshot et l'agrégat ne servent que de
  // repli, pour un appareil trop récent pour le catalogue.
  const appareilParRole = useMemo(() => {
    const lieux = indexLieux(allDevices, snapshot);
    const map = new Map<DeviceRole, {
      device_id: string; name: string; inverse: boolean; site: string; room: string | null;
    }>();
    const ajouter = (device_id: string, name: string, siteRow: string) => {
      if (siteRow !== site) return;
      const r = roles.get(device_id);
      if (!r || !ROLES_FLUX.includes(r.role) || map.has(r.role)) return;
      map.set(r.role, {
        device_id, name,
        inverse: r.sens_inverse ?? false,
        site: siteRow,
        room: lieux.get(device_id)?.room ?? null,
      });
    };
    for (const d of allDevices) ajouter(d.device_id, d.name, d.site);
    for (const r of snapshot)   ajouter(r.device_id, r.name, r.site);
    for (const e of energyAgg)  ajouter(e.device_id, e.name, e.site);
    return map;
  }, [allDevices, snapshot, energyAgg, site, roles]);

  /** Sujet de popup pour un compteur du schéma. `null` si rien n'y est rattaché. */
  const sujetRole = (role: DeviceRole, titre: string, couleur: string, sub: string): EnergySubject | null => {
    const d = appareilParRole.get(role);
    if (!d) return null;
    return {
      titre,
      sousTitre: [site, d.room, sub, d.name].filter(Boolean).join(' · '),
      couleur,
      plage,
      series: [{ label: titre, couleur, devices: [d] }],
      notes: d.inverse
        ? ['TC monté à l\'envers : consommation et injection sont permutées à la lecture.']
        : undefined,
    };
  };

  const ouvrir = (role: DeviceRole, titre: string, couleur: string, sub: string) => {
    const sujet = sujetRole(role, titre, couleur, sub);
    if (sujet) setDetail(sujet);
  };

  // L'autoconsommation n'est pas une mesure mais un croisement : la popup
  // superpose donc les trois compteurs qui la composent plutôt que d'afficher
  // un pourcentage sans ses termes.
  const ouvrirAutoConso = useMemo(() => {
    const pv = appareilParRole.get('M5_PV');
    const ch = appareilParRole.get('M3_CHARGE');
    const re = appareilParRole.get('M1_RESEAU');
    const series = [
      pv && { label: 'M5 — PV', couleur: '#facc15', devices: [pv] },
      ch && { label: 'M3 — Charges', couleur: '#ef4444', devices: [ch] },
      re && { label: 'M1 — Réseau', couleur: '#3b82f6', devices: [re] },
    ].filter(Boolean) as EnergySubject['series'];
    if (series.length < 2) return undefined;
    return () => setDetail({
      titre: 'Autoconsommation',
      sousTitre: `${site} · part de la charge couverte par le PV`,
      couleur: '#22c55e',
      plage,
      series,
      notes: [
        'Autoconsommation = M3 charges − M1 réseau (ce que le site a consommé sans le prendre au réseau)',
        'Comparer les trois courbes montre à quelles heures le PV couvre réellement la charge',
      ],
    });
  }, [appareilParRole, site, plage]);

  /** Un rôle n'est cliquable que s'il porte un appareil. */
  const clic = (role: DeviceRole, titre: string, couleur: string, sub: string) =>
    appareilParRole.has(role) ? () => ouvrir(role, titre, couleur, sub) : undefined;

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
            <span className="text-amber-400/90 text-[0.6875rem] flex items-center gap-1" title="Rattachements appareil → rôle proposés automatiquement, pas encore validés">
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
          <NodeHist icon={Plug}      color="#3b82f6" name="M1 — Réseau"   kwh={hSenelec} sub="Import réseau"
            onClick={clic('M1_RESEAU', 'M1 — Réseau', '#3b82f6', 'Import réseau')} />
          <Arrow value={hSenelec} unit="kWh" dim={hSenelec === 0} />
          <NodeHist icon={Building2} color="#06b6d4" name="M2 — Sélecteur"  kwh={hSelect}  sub="Aiguillage PV/réseau"
            onClick={clic('M2_SELECTEUR', 'M2 — Sélecteur', '#06b6d4', 'Aiguillage PV/réseau')} />
          <Arrow value={hCharge}  unit="kWh" dim={hCharge === 0} />
          <NodeHist icon={Building2} color="#ef4444" name="M3 — Charges"    kwh={hCharge}  sub="Consommation totale"
            onClick={clic('M3_CHARGE', 'M3 — Charges', '#ef4444', 'Consommation totale')} />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeHist icon={Sun} color="#facc15" name="M5 — PV" kwh={hPV} sub="Production solaire"
                onClick={clic('M5_PV', 'M5 — PV', '#facc15', 'Production solaire')} />
              <Arrow value={autoConsoKwhHist} unit="kWh" color="#22c55e" dim={hPV === 0} />
              <AutoConsoBloc pct={autoConsoPctHist} valeur={autoConsoKwhHist} unite="kWh" manquants={manquantsHist}
                onClick={ouvrirAutoConso} />
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
          <NodeLive icon={Plug}      color="#3b82f6" name="M1 — Réseau"  power={pSenelec} energy={eSenelec} sub="Compteur réseau"
            onClick={clic('M1_RESEAU', 'M1 — Réseau', '#3b82f6', 'Import réseau')} />
          <Arrow value={pSenelec} dim={pSenelec === 0} />
          <NodeLive icon={Building2} color="#06b6d4" name="M2 — Sélecteur" power={pSelect}  sub="Aiguillage PV/réseau"
            onClick={clic('M2_SELECTEUR', 'M2 — Sélecteur', '#06b6d4', 'Aiguillage PV/réseau')} />
          <Arrow value={pCharge} dim={pCharge === 0} />
          <NodeLive icon={Building2} color="#ef4444" name="M3 — Charges"   power={pCharge}  energy={eCharge} sub="Consommation totale"
            onClick={clic('M3_CHARGE', 'M3 — Charges', '#ef4444', 'Consommation totale')} />

          <div className="md:col-span-3 md:col-start-1 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <NodeLive icon={Sun} color="#facc15" name="M5 — PV" power={pPV} energy={ePV} sub="Production solaire"
                onClick={clic('M5_PV', 'M5 — PV', '#facc15', 'Production solaire')} />
              <Arrow value={autoConsoKwLive} color="#22c55e" dim={pPV === 0} />
              <AutoConsoBloc pct={autoConsoPctLive} valeur={autoConsoKwLive} unite="kW" manquants={manquantsLive}
                onClick={ouvrirAutoConso} />
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

      <EnergyDetailDialog sujet={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// ── Point d'entrée : une carte par site rattaché ──────────────

export function EnergyFlowCard({ snapshot, energyAgg, period, roles, allDevices, plage }: Props) {
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
          allDevices={allDevices}
          plage={plage}
        />
      ))}
    </div>
  );
}
