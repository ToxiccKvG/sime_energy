// ============================================================
// Dashboard IOT — Détail d'un indicateur énergie (popup)
//
// Même principe que SensorDetailDialog, transposé aux compteurs :
// les tuiles du dashboard n'affichent qu'un TOTAL (123,9 kWh,
// 2 826,6 kWh, 2,6 A…) sans dire comment il s'est constitué. La
// popup ouvre ce total :
//  · la courbe du pas de temps (heure ou jour) qui le compose ;
//  · la pointe de puissance et le moment où elle est tombée ;
//  · l'injection / le retour compteur, invisible sur la carte ;
//  · la répartition entre phases et entre appareils.
//
// Une même popup sert les trois cartes (KPI, flux, qualité 3 phases)
// parce qu'elles posent la même question à des ensembles d'appareils
// différents. L'appelant décrit son sujet, pas la requête.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Clock, Info, MapPin, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  fetchEnergyProfile, fetchEnergyRepartition,
  type EnergyDevicePart, type EnergyProfilePoint, type PlageDetail,
} from '@/lib/iot-energy-detail-service';

// ── Description du sujet, fournie par la carte appelante ──────

export interface EnergySerie {
  label: string;
  couleur: string;
  /** Appareils agrégés dans la série. `inverse` = TC monté à l'envers. */
  devices: {
    device_id: string;
    name: string;
    inverse?: boolean;
    site?: string;
    /** Pièce Shelly. `null` = appareil non affecté, à distinguer d'inconnu. */
    room?: string | null;
  }[];
}

export type EnergyMetricKey = 'energie' | 'puissance' | 'tension' | 'phases';

export interface EnergySubject {
  titre: string;
  sousTitre?: string;
  couleur: string;
  plage: PlageDetail;
  /** La première série porte les statistiques ; les autres servent de comparaison. */
  series: EnergySerie[];
  /** Précisions métier affichées sous l'en-tête (formule, réserve de lecture…). */
  notes?: string[];
  /** Valeurs instantanées à rappeler, que l'agrégat horaire ne porte pas. */
  instantane?: { label: string; valeur: string }[];
  metriqueInitiale?: EnergyMetricKey;
}

interface Props {
  sujet: EnergySubject | null;
  onClose: () => void;
}

// ── Utilitaires ───────────────────────────────────────────────

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/**
 * Message d'erreur lisible.
 *
 * Supabase renvoie un objet nu, pas une instance d'Error : le `instanceof
 * Error` d'origine retombait donc systématiquement sur « Profil
 * indisponible », qui masquait la seule cause vraiment probable — la fonction
 * d'agrégation pas encore déployée sur la base. Une popup qui ne sait pas
 * dire pourquoi elle est vide oblige à ouvrir la console.
 */
function messageErreur(e: unknown): string {
  const err = e as { code?: string; message?: string; hint?: string } | null;
  if (err?.code === 'PGRST202' || /fn_energy_profile/.test(err?.message ?? '')) {
    return "La fonction d'agrégation fn_energy_profile n'existe pas encore sur la base : "
      + 'appliquer la migration 20260901_add_fn_energy_profile.sql.';
  }
  if (err?.message) return err.code ? `${err.message} (${err.code})` : err.message;
  return e instanceof Error ? e.message : 'Profil indisponible';
}

/** Décimales adaptées à l'ordre de grandeur — 0,00 kWh comme 9 079,5 kWh. */
const auto = (n: number) => fmtFr(n, Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 10 ? 2 : 2);

function libelleBucket(iso: string, bucket: 'hour' | 'day'): string {
  const d = new Date(iso);
  return bucket === 'day'
    ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    : `${d.getHours()} h`;
}

const METRIQUES: { key: EnergyMetricKey; label: string; unite: string }[] = [
  { key: 'energie',   label: 'Énergie',   unite: 'kWh' },
  { key: 'puissance', label: 'Puissance', unite: 'W' },
  { key: 'tension',   label: 'Tension',   unite: 'V' },
  { key: 'phases',    label: 'Phases',    unite: 'W' },
];

// ── Composant ─────────────────────────────────────────────────

export function EnergyDetailDialog({ sujet, onClose }: Props) {
  const [profils, setProfils] = useState<EnergyProfilePoint[][]>([]);
  const [parts, setParts] = useState<EnergyDevicePart[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [metrique, setMetrique] = useState<EnergyMetricKey>(sujet?.metriqueInitiale ?? 'energie');
  const [axe, setAxe] = useState<'appareil' | 'piece' | 'site'>('appareil');

  useEffect(() => { setMetrique(sujet?.metriqueInitiale ?? 'energie'); }, [sujet]);

  // Clé de dépendance stable : le sujet est un objet recréé à chaque rendu de
  // la carte appelante, s'y fier relancerait la requête en boucle.
  const cle = sujet
    ? JSON.stringify([sujet.plage.since, sujet.plage.until, sujet.plage.bucket,
        sujet.series.map(s => s.devices.map(d => d.device_id))])
    : null;

  useEffect(() => {
    if (!sujet) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    // La répartition n'est demandée que si le total agrège plusieurs
    // appareils — sur un compteur unique, elle ne dirait rien de plus.
    const principaux = sujet.series[0]?.devices ?? [];
    Promise.all([
      Promise.all(sujet.series.map(s => fetchEnergyProfile({
        since:     sujet.plage.since,
        until:     sujet.plage.until,
        bucket:    sujet.plage.bucket,
        deviceIds: s.devices.map(d => d.device_id),
        inverses:  s.devices.filter(d => d.inverse).map(d => d.device_id),
      }))),
      principaux.length > 1
        ? fetchEnergyRepartition({
            since:     sujet.plage.since,
            until:     sujet.plage.until,
            deviceIds: principaux.map(d => d.device_id),
            inverses:  principaux.filter(d => d.inverse).map(d => d.device_id),
          })
        : Promise.resolve([] as EnergyDevicePart[]),
    ])
      .then(([res, rep]) => { if (!annule) { setProfils(res); setParts(rep); } })
      .catch(e => { if (!annule) { console.error('[EnergyDetailDialog] fn_energy_profile:', e); setErreur(messageErreur(e)); } })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const principal = profils[0] ?? [];
  const bucket = sujet?.plage.bucket ?? 'hour';
  const pasLabel = bucket === 'day' ? 'jour' : 'heure';

  // Grandeurs réellement présentes : un monophasé n'a pas de p_a/p_b/p_c, un
  // capteur de flux sans tension n'a pas de courbe de tension. On n'affiche
  // pas un onglet qui ne pourrait montrer qu'une page vide.
  const disponibles = useMemo(() => {
    const a = (f: (p: EnergyProfilePoint) => number | null) => principal.some(p => num(f(p)) != null);
    return METRIQUES.filter(m => {
      if (m.key === 'energie')   return true;
      if (m.key === 'puissance') return a(p => p.p_moy_w);
      if (m.key === 'tension')   return a(p => p.v_a) || a(p => p.v_mono);
      return a(p => p.p_a);
    });
  }, [principal]);

  const active = disponibles.find(m => m.key === metrique) ?? disponibles[0];

  // ── Série du graphe : un point par pas de temps, une clé par série ──
  const donnees = useMemo(() => {
    const index = new Map<string, Record<string, number | string | null>>();
    const cle0 = (b: string) => b;
    for (let i = 0; i < profils.length; i++) {
      for (const p of profils[i]) {
        const ligne = index.get(cle0(p.bucket)) ?? { bucket: p.bucket, x: libelleBucket(p.bucket, bucket) };
        if (i === 0) {
          ligne.kwh_inj = num(p.kwh_inj);
          ligne.p_max   = num(p.p_max_w);
          ligne.v_a = num(p.v_a); ligne.v_b = num(p.v_b); ligne.v_c = num(p.v_c);
          ligne.v_mono = num(p.v_mono);
          ligne.p_a = num(p.p_a); ligne.p_b = num(p.p_b); ligne.p_c = num(p.p_c);
        }
        ligne[`s${i}`] = active?.key === 'puissance' ? num(p.p_moy_w) : num(p.kwh);
        index.set(cle0(p.bucket), ligne);
      }
    }
    return Array.from(index.values()).sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
  }, [profils, bucket, active?.key]);

  // ── Statistiques de la série principale ───────────────────────
  const stats = useMemo(() => {
    const kwh   = principal.map(p => num(p.kwh)).filter((v): v is number => v != null);
    const inj   = principal.map(p => num(p.kwh_inj)).filter((v): v is number => v != null);
    const pMoy  = principal.map(p => num(p.p_moy_w)).filter((v): v is number => v != null);
    const total = kwh.reduce((s, v) => s + v, 0);
    const totalInj = inj.reduce((s, v) => s + v, 0);

    // Pas de temps le plus chargé — le « quand » manque autant que le « combien ».
    let pic: { valeur: number; bucket: string } | null = null;
    for (const p of principal) {
      const v = num(p.kwh);
      if (v != null && (pic == null || v > pic.valeur)) pic = { valeur: v, bucket: p.bucket };
    }
    let picP: { valeur: number; bucket: string } | null = null;
    for (const p of principal) {
      const v = num(p.p_max_w);
      if (v != null && (picP == null || v > picP.valeur)) picP = { valeur: v, bucket: p.bucket };
    }

    const moyP = pMoy.length > 0 ? pMoy.reduce((s, v) => s + v, 0) / pMoy.length : null;

    // Tensions : on regarde la moyenne des phases mesurées, pas une seule.
    const tensions = principal
      .map(p => {
        const v = [num(p.v_a), num(p.v_b), num(p.v_c)].filter((x): x is number => x != null);
        if (v.length > 0) return v.reduce((s, x) => s + x, 0) / v.length;
        return num(p.v_mono);
      })
      .filter((v): v is number => v != null);

    // Déséquilibre moyen entre phases, calculé pas de temps par pas de temps :
    // moyenner d'abord les tensions puis comparer masquerait les écarts.
    const desequilibres = principal
      .map(p => {
        const v = [num(p.v_a), num(p.v_b), num(p.v_c)].filter((x): x is number => x != null && x > 0);
        if (v.length < 3) return null;
        const moy = v.reduce((s, x) => s + x, 0) / v.length;
        return moy > 0 ? ((Math.max(...v) - Math.min(...v)) / moy) * 100 : null;
      })
      .filter((v): v is number => v != null);

    const phase = (f: (p: EnergyProfilePoint) => number | null) => {
      const vals = principal.map(f).map(num).filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    return {
      total, totalInj, pic, picP, moyP,
      nbPas: principal.length,
      nbDevices: Math.max(0, ...principal.map(p => p.nb_devices ?? 0)),
      moyPas: principal.length > 0 ? total / principal.length : 0,
      tMin: tensions.length > 0 ? Math.min(...tensions) : null,
      tMax: tensions.length > 0 ? Math.max(...tensions) : null,
      tMoy: tensions.length > 0 ? tensions.reduce((s, v) => s + v, 0) / tensions.length : null,
      desMoy: desequilibres.length > 0 ? desequilibres.reduce((s, v) => s + v, 0) / desequilibres.length : null,
      desMax: desequilibres.length > 0 ? Math.max(...desequilibres) : null,
      pA: phase(p => p.p_a), pB: phase(p => p.p_b), pC: phase(p => p.p_c),
    };
  }, [principal]);

  if (!sujet) return null;

  const nbAppareils = sujet.series[0]?.devices.length ?? 0;
  const couleur = sujet.series[0]?.couleur ?? sujet.couleur;

  // Localisation de la série principale. Un total de site ne dit pas D'OÙ il
  // vient : deux compteurs dans deux pièces différentes s'y confondent.
  const appareils = sujet.series[0]?.devices ?? [];
  const sitesCouverts = Array.from(new Set(appareils.map(d => d.site).filter(Boolean))) as string[];
  const piecesCouvertes = Array.from(new Set(appareils.map(d => d.room).filter(Boolean))) as string[];
  const sansPiece = appareils.filter(d => d.site != null && !d.room).length;
  const lieu = appareils.length === 1
    ? [appareils[0].site, appareils[0].room].filter(Boolean).join(' · ')
    : null;

  const Stat = ({ label, valeur, aide, accent }: {
    label: string; valeur: string; aide?: string; accent?: string;
  }) => (
    <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center" title={aide}>
      <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: accent ?? '#fff' }}>{valeur}</p>
    </div>
  );

  const axeCommun = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
      <XAxis dataKey="x" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={48} domain={['auto', 'auto']} />
    </>
  );
  const infobulle = (unite: string, d = 2) => (
    <Tooltip
      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 10 }}
      labelFormatter={(x: string) => (bucket === 'day' ? `Le ${x}` : `${x}`)}
      formatter={(v: number, nom: string) => [`${auto(Number(v))} ${unite}`, nom]}
    />
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#12141f] border-white/15 text-slate-200 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-base flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: couleur }} /> {sujet.titre}
          </DialogTitle>
          {sujet.sousTitre && <p className="text-slate-400 text-xs">{sujet.sousTitre}</p>}
        </DialogHeader>

        {/* Contexte : ce que la popup a réellement lu */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-y border-white/10 py-2">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-500" /> {sujet.plage.libelle}
          </span>
          <span className="text-slate-400">
            {nbAppareils} appareil{nbAppareils > 1 ? 's' : ''}
            {stats.nbDevices > 0 && stats.nbDevices < nbAppareils &&
              ` · ${nbAppareils - stats.nbDevices} sans données`}
          </span>
          <span className="text-slate-400">
            {stats.nbPas} {pasLabel}{stats.nbPas > 1 ? 's' : ''} avec données
          </span>
          {lieu && <span className="text-slate-400"><MapPin className="h-3.5 w-3.5 inline mb-0.5 text-slate-500" /> {lieu}</span>}
          {!lieu && sitesCouverts.length > 0 && (
            <span className="text-slate-400" title={sitesCouverts.join(', ')}>
              <MapPin className="h-3.5 w-3.5 inline mb-0.5 text-slate-500" />{' '}
              {sitesCouverts.length === 1 ? sitesCouverts[0] : `${sitesCouverts.length} sites`}
              {piecesCouvertes.length > 0 && (
                <span className="text-slate-500" title={piecesCouvertes.join(', ')}>
                  {' · '}{piecesCouvertes.length} pièce{piecesCouvertes.length > 1 ? 's' : ''}
                  {sansPiece > 0 && ` + ${sansPiece} hors pièce`}
                </span>
              )}
            </span>
          )}
          {sujet.instantane?.map(v => (
            <span key={v.label} className="text-slate-400">
              {v.label} <span className="text-white font-medium">{v.valeur}</span>
            </span>
          ))}
        </div>

        {sujet.notes && sujet.notes.length > 0 && (
          <div className="flex items-start gap-2 text-[0.6875rem] text-slate-400">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-500" />
            <span>{sujet.notes.join(' · ')}</span>
          </div>
        )}

        {/* Sélecteur de grandeur */}
        {disponibles.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {disponibles.map(m => (
              <button
                key={m.key}
                onClick={() => setMetrique(m.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active?.key === m.key ? 'text-white' : 'text-slate-400 border-white/15 hover:bg-white/5 hover:text-white'
                }`}
                style={active?.key === m.key
                  ? { backgroundColor: couleur + '25', borderColor: couleur + '60', color: couleur }
                  : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {chargement ? (
          <p className="text-slate-500 text-xs text-center py-16">Chargement du profil…</p>
        ) : erreur ? (
          <p className="text-amber-400/90 text-xs text-center py-16 px-6 leading-relaxed">{erreur}</p>
        ) : principal.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-16">
            Aucun agrégat horaire pour cet ensemble sur la période.
          </p>
        ) : (
          <>
            {/* Valeur maîtresse + statistiques de la grandeur active */}
            {active?.key === 'energie' && (
              <>
                <div className="flex items-baseline flex-wrap gap-x-2">
                  <span className="text-3xl font-bold" style={{ color: couleur }}>{auto(stats.total)}</span>
                  <span className="text-slate-400 text-sm">kWh</span>
                  <span className="text-slate-500 text-xs ml-1">sur la période</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label={`Moyenne / ${pasLabel}`} valeur={`${auto(stats.moyPas)} kWh`} />
                  <Stat
                    label={`${pasLabel === 'jour' ? 'Jour' : 'Heure'} le plus chargé`}
                    valeur={stats.pic ? `${auto(stats.pic.valeur)} kWh` : '—'}
                    aide={stats.pic ? libelleBucket(stats.pic.bucket, bucket) : undefined}
                  />
                  <Stat
                    label="À"
                    valeur={stats.pic ? libelleBucket(stats.pic.bucket, bucket) : '—'}
                  />
                  <Stat
                    label="Injection / retour"
                    valeur={stats.totalInj > 0.01 ? `${auto(stats.totalInj)} kWh` : '—'}
                    aide="Compteur retour (wh_rtot) : injection réseau, ou consommation d'un TC monté à l'envers."
                    accent={stats.totalInj > 0.01 ? '#facc15' : undefined}
                  />
                </div>
              </>
            )}

            {active?.key === 'puissance' && (
              <>
                <div className="flex items-baseline flex-wrap gap-x-2">
                  <span className="text-3xl font-bold" style={{ color: couleur }}>
                    {stats.moyP != null ? auto(stats.moyP) : '—'}
                  </span>
                  <span className="text-slate-400 text-sm">W</span>
                  <span className="text-slate-500 text-xs ml-1">puissance moyenne</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    label="Pointe"
                    valeur={stats.picP ? `${auto(stats.picP.valeur)} W` : '—'}
                    aide={nbAppareils > 1
                      ? "Somme des maxima appareil sur l'heure : majorant, les pointes ne sont pas forcément simultanées."
                      : 'Maximum de puissance relevé sur un pas horaire.'}
                    accent="#f59e0b"
                  />
                  <Stat label="À" valeur={stats.picP ? libelleBucket(stats.picP.bucket, bucket) : '—'} />
                  <Stat
                    label="Facteur de charge"
                    valeur={stats.moyP != null && stats.picP && stats.picP.valeur > 0
                      ? `${fmtFr((stats.moyP / stats.picP.valeur) * 100, 0)} %`
                      : '—'}
                    aide="Puissance moyenne / pointe. Bas = installation dimensionnée pour des pics rares."
                  />
                  <Stat label="Énergie" valeur={`${auto(stats.total)} kWh`} />
                </div>
              </>
            )}

            {active?.key === 'tension' && (
              <>
                <div className="flex items-baseline flex-wrap gap-x-2">
                  <span className="text-3xl font-bold" style={{ color: couleur }}>
                    {stats.tMoy != null ? fmtFr(stats.tMoy, 1) : '—'}
                  </span>
                  <span className="text-slate-400 text-sm">V</span>
                  <span className="text-slate-500 text-xs ml-1">moyenne des phases mesurées</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Min" valeur={stats.tMin != null ? `${fmtFr(stats.tMin, 1)} V` : '—'}
                    accent={stats.tMin != null && stats.tMin < 220 ? '#f59e0b' : undefined} />
                  <Stat label="Max" valeur={stats.tMax != null ? `${fmtFr(stats.tMax, 1)} V` : '—'}
                    accent={stats.tMax != null && stats.tMax > 245 ? '#f59e0b' : undefined} />
                  <Stat label="Déséquilibre moyen" valeur={stats.desMoy != null ? `${fmtFr(stats.desMoy, 2)} %` : '—'} />
                  <Stat label="Déséquilibre max" valeur={stats.desMax != null ? `${fmtFr(stats.desMax, 2)} %` : '—'}
                    accent={stats.desMax != null && stats.desMax > 5 ? '#f59e0b' : undefined}
                    aide="Alerte au-delà de 5 % : au-dessus, les moteurs triphasés chauffent." />
                </div>
              </>
            )}

            {active?.key === 'phases' && (() => {
              const tot = (stats.pA ?? 0) + (stats.pB ?? 0) + (stats.pC ?? 0);
              const part = (v: number | null) => (v != null && tot > 0 ? `${fmtFr((v / tot) * 100, 0)} %` : '—');
              return (
                <>
                  <div className="flex items-baseline flex-wrap gap-x-2">
                    <span className="text-3xl font-bold" style={{ color: couleur }}>{auto(tot)}</span>
                    <span className="text-slate-400 text-sm">W</span>
                    <span className="text-slate-500 text-xs ml-1">moyenne des trois phases</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <Stat label="Phase A" valeur={stats.pA != null ? `${auto(stats.pA)} W · ${part(stats.pA)}` : '—'} accent="#22c55e" />
                    <Stat label="Phase B" valeur={stats.pB != null ? `${auto(stats.pB)} W · ${part(stats.pB)}` : '—'} accent="#f59e0b" />
                    <Stat label="Phase C" valeur={stats.pC != null ? `${auto(stats.pC)} W · ${part(stats.pC)}` : '—'} accent="#ec4899" />
                    <Stat
                      label="Déséquilibre charge"
                      valeur={tot > 0
                        ? `${fmtFr(((Math.max(stats.pA ?? 0, stats.pB ?? 0, stats.pC ?? 0)
                            - Math.min(stats.pA ?? 0, stats.pB ?? 0, stats.pC ?? 0)) / (tot / 3)) * 100, 0)} %`
                        : '—'}
                      aide="(max − min) / moyenne des puissances de phase. Une charge très déséquilibrée tire la tension d'une phase vers le bas."
                    />
                  </div>
                </>
              );
            })()}

            {/* Courbe */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <ResponsiveContainer width="100%" height={200}>
                {active?.key === 'energie' ? (
                  <BarChart data={donnees} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    {axeCommun}
                    {infobulle('kWh')}
                    {sujet.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {sujet.series.map((s, i) => (
                      <Bar key={s.label} dataKey={`s${i}`} name={s.label} fill={s.couleur}
                        radius={[3, 3, 0, 0]} maxBarSize={26} />
                    ))}
                  </BarChart>
                ) : active?.key === 'puissance' ? (
                  <AreaChart data={donnees} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    {axeCommun}
                    {infobulle('W')}
                    {sujet.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {sujet.series.map((s, i) => (
                      <Area key={s.label} type="monotone" dataKey={`s${i}`} name={s.label}
                        stroke={s.couleur} fill={s.couleur + (i === 0 ? '25' : '10')} strokeWidth={2} dot={false} />
                    ))}
                  </AreaChart>
                ) : active?.key === 'tension' ? (
                  <LineChart data={donnees} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    {axeCommun}
                    {infobulle('V', 1)}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {donnees.some(d => d.v_a != null) ? (
                      <>
                        <Line type="monotone" dataKey="v_a" name="Phase A" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="v_b" name="Phase B" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="v_c" name="Phase C" stroke="#ec4899" strokeWidth={2} dot={false} connectNulls />
                      </>
                    ) : (
                      <Line type="monotone" dataKey="v_mono" name="Tension" stroke={couleur} strokeWidth={2} dot={false} connectNulls />
                    )}
                  </LineChart>
                ) : (
                  <AreaChart data={donnees} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    {axeCommun}
                    {infobulle('W')}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="p_a" name="Phase A" stackId="p" stroke="#22c55e" fill="#22c55e30" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="p_b" name="Phase B" stackId="p" stroke="#f59e0b" fill="#f59e0b30" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="p_c" name="Phase C" stackId="p" stroke="#ec4899" fill="#ec489930" strokeWidth={1.5} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
              <p className="text-slate-600 text-[0.625rem] text-center mt-1">
                Agrégats {bucket === 'day' ? 'journaliers' : 'horaires'} · shelly_cl_horaire
              </p>
            </div>

            {/* Répartition — seule réponse au « qui consomme quoi, et où » */}
            {parts.length > 1 && (() => {
              // Unité alignée sur l'onglet affiché : en « Puissance » on
              // répartit des W moyens, partout ailleurs des kWh. Une
              // répartition dans une autre unité que le total qu'elle explique
              // est illisible — c'était le défaut de la version précédente.
              const enPuissance = active?.key === 'puissance';
              const unite = enPuissance ? 'W' : 'kWh';
              const lieuDe = new Map(appareils.map(d => [d.device_id, d]));

              const rep = parts.map(p => {
                const d = lieuDe.get(p.device_id);
                return {
                  device_id: p.device_id,
                  name: d?.name ?? p.name ?? p.device_id,
                  site: d?.site ?? p.site,
                  room: d?.room ?? null,
                  valeur: (enPuissance ? p.p_moy_w : p.kwh) ?? 0,
                  muet: (p.nb_heures ?? 0) === 0,
                };
              });

              // Les axes lieu ne s'affichent que s'ils DISTINGUENT quelque
              // chose : un regroupement par site à un seul site, ou par pièce
              // quand aucune n'est renseignée, ne serait qu'une barre unique.
              const nbSites  = new Set(rep.map(l => l.site).filter(Boolean)).size;
              const nbPieces = new Set(rep.map(l => l.room).filter(Boolean)).size;
              const axes = [
                { key: 'appareil' as const, label: 'Par appareil', actif: true },
                { key: 'piece'    as const, label: 'Par pièce',    actif: nbPieces > 0 },
                { key: 'site'     as const, label: 'Par site',     actif: nbSites > 1 },
              ].filter(a => a.actif);
              const axeActif = axes.some(a => a.key === axe) ? axe : 'appareil';

              // Regroupement. Une pièce vide est nommée, jamais fondue dans le
              // reste : « non affecté » est une information de terrain.
              const groupes = new Map<string, { valeur: number; detail?: string; nb: number }>();
              for (const l of rep) {
                const cle = axeActif === 'appareil' ? l.name
                  : axeActif === 'site' ? (l.site ?? 'Site inconnu')
                  : (l.room ?? 'Sans pièce affectée');
                const cur = groupes.get(cle) ?? { valeur: 0, nb: 0 };
                cur.valeur += l.valeur;
                cur.nb += 1;
                if (axeActif === 'appareil') {
                  cur.detail = [l.site, l.room].filter(Boolean).join(' · ') || undefined;
                }
                groupes.set(cle, cur);
              }
              const toutes = Array.from(groupes.entries())
                .map(([nom, g]) => ({ nom, ...g }))
                .sort((a, b) => b.valeur - a.valeur);
              const lignes = toutes.slice(0, 8);
              const max = Math.max(...lignes.map(l => l.valeur), 0);
              const total = toutes.reduce((s, l) => s + l.valeur, 0);
              const muets = rep.filter(l => l.muet).length;
              const absents = appareils.length - parts.length;

              return (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <p className="text-[0.625rem] text-slate-400 uppercase tracking-wide">
                      Répartition
                      {toutes.length > lignes.length && ` · ${lignes.length} premiers sur ${toutes.length}`}
                    </p>
                    {axes.length > 1 && (
                      <div className="flex gap-1">
                        {axes.map(a => (
                          <button key={a.key} onClick={() => setAxe(a.key)}
                            className={`px-2 py-0.5 rounded text-[0.625rem] border transition-colors ${
                              axeActif === a.key
                                ? 'bg-white/10 border-white/25 text-white'
                                : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                            }`}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {lignes.map(l => (
                    <div key={l.nom} className="flex items-center gap-2 text-xs">
                      <span className="w-44 shrink-0 truncate" title={l.detail ? `${l.nom} — ${l.detail}` : l.nom}>
                        <span className="text-slate-300">{l.nom}</span>
                        {l.detail && <span className="text-slate-600 ml-1">{l.detail}</span>}
                        {axeActif !== 'appareil' && l.nb > 1 && (
                          <span className="text-slate-600 ml-1">({l.nb})</span>
                        )}
                      </span>
                      <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <span className="block h-full rounded-full"
                          style={{ width: `${max > 0 ? (l.valeur / max) * 100 : 0}%`, backgroundColor: couleur }} />
                      </span>
                      <span className="text-white font-medium w-28 text-right shrink-0">
                        {auto(l.valeur)} <span className="text-slate-500 font-normal">{unite}</span>
                        {total > 0 && (
                          <span className="text-slate-600 ml-1">{fmtFr((l.valeur / total) * 100, 0)}%</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {(absents > 0 || muets > 0) && (
                    <p className="text-slate-600 text-[0.625rem] pt-1">
                      {absents > 0 && `${absents} appareil${absents > 1 ? 's' : ''} sans aucune heure agrégée sur la période`}
                      {absents > 0 && muets > 0 && ' · '}
                      {muets > 0 && `${muets} sans relevé`}
                    </p>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
