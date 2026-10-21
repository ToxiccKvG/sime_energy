import { useMemo, useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { ResponsiveContainer } from '@/components/shared/ZoomableChart';
import { CouleursDonnees } from '@/components/shared/CouleursDonnees';
import { couleurDonnee, useChartPreferences } from '@/lib/chart-preferences';
import { Download, Zap, Calendar, Database, RefreshCw, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIOT } from './IOTContext';
import { analyserDonneesShelly, calculerStats, nettoyerProfil, cleJour, type RapportNettoyage, type NaturePrincipale } from '@/lib/iot-profil-engine';
import type { ShellyRow } from './shared';
import { supabase } from '@/lib/supabase';
import { fetchDisponibles, fetchProfilCharge, fetchSiteBilan, type ProfilChargeJour, type SiteBilan } from '@/lib/iot-supabase-service';
import type { PerimetreAnalyse } from './PerimetreBar';
import { fetchRegles, fetchSignalements, versionRegles, type RegleQualite, type Signalement } from '@/lib/iot-qualite-service';
import { fetchAccounts } from '@/lib/shelly-account-service';
import { fetchDevicePeriodes } from '@/lib/shelly-device-period-service';
import { useAuth } from '@/context/AuthContext';
import { construireRapport, etatDuFlux, type EntreeRapport } from '@/services/iotRapport';
import { exporterRapportExcel } from '@/services/iotRapportExcel';
import { exporterRapportPdf } from '@/services/iotRapportPdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/** Clé de couleur partagée avec Analyse (communs.METRIQUES) quand la donnée est la même. */
const CLE_COULEUR: Partial<Record<string, string>> = {
  total: 'kwhTotal', net: 'kwhNet', retour: 'kwhRetourTotal',
  phaseA: 'kwhA', phaseB: 'kwhB', phaseC: 'kwhC',
  puissTotal: 'puissKwTotal', puissA: 'puissKwA', puissB: 'puissKwB', puissC: 'puissKwC',
};

// Format français : remplace . par ,
const fmtFr = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');

// ── Transformation fn_profil_charge → ShellyRow[] (un appareil-jour) ──
function profilJourToShellyRows(
  rows: ProfilChargeJour[],
  roomByDevice: Map<string, string>,
  heuresParJour: number,
): ShellyRow[] {
  return rows.map(r => {
    const date = new Date(r.jour + 'T00:00:00');
    const dow = date.getDay();
    const month = date.getMonth();

    const whTotal = r.wh_conso ?? 0;
    const whInj = r.wh_inj ?? 0;
    const whA = r.wh_a ?? 0;
    const whB = r.wh_b ?? 0;
    const whC = r.wh_c ?? 0;
    const kwhTotal = whTotal / 1000;
    const kwhInj = whInj / 1000;
    const kwhA = whA / 1000;
    const kwhB = whB / 1000;
    const kwhC = whC / 1000;
    const kwhNet = Math.max(0, kwhTotal - kwhInj);
    // Puissance moyenne sur les heures analysées (plage De/À), pas sur 24 h
    const h = heuresParJour;

    return {
      date,
      whPhaseA: whA, whPhaseB: whB, whPhaseC: whC, whTotal,
      whRetourA: 0, whRetourB: 0, whRetourC: 0, whRetourTotal: whInj,
      kwhA, kwhB, kwhC, kwhTotal,
      kwhRetourA: 0, kwhRetourB: 0, kwhRetourC: 0, kwhRetourTotal: kwhInj,
      kwhCumA: 0, kwhCumB: 0, kwhCumC: 0, kwhCumTotal: kwhTotal,
      kwhCumRetourA: 0, kwhCumRetourB: 0, kwhCumRetourC: 0, kwhCumRetourTotal: 0,
      puissKwA: kwhA / h, puissKwB: kwhB / h, puissKwC: kwhC / h,
      puissKwTotal: kwhTotal / h,
      puissKwRetourA: 0, puissKwRetourB: 0, puissKwRetourC: 0, puissKwRetourTotal: 0,
      kwhNet,
      jour: date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      mois: date.toLocaleDateString('fr-FR', { month: 'short' }),
      annee: date.getFullYear(),
      jourActivites: [0, 6].includes(dow) ? 'Weekend' : 'Jour ouvré',
      periodeclimatique: [11, 0, 1, 2].includes(month) ? 'Période de fraîcheur' : 'Période chaude',
      saison: [6, 7, 8, 9].includes(month) ? 'Hivernage' : 'Sèche',
      periode: 'Journée',
      heuresEnsoleillement: 'Journée',
      heuresTravail: 'Journée',
      profil: kwhInj > kwhTotal ? 'SOUTIRAGE' : 'CHARGE',
      isWeekend: [0, 6].includes(dow),
      isJourFerie: false,
      jourSemaine: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      nomAppareil: r.name ?? r.device_id,
      deviceLocation: r.site ?? undefined,
      deviceRoom: roomByDevice.get(r.device_id),
      deviceId: r.device_id,
      deviceFamily: r.device_family ?? undefined,
      role: r.role,
      nbHeures: r.nb_heures,
      quarantaine: r.nb_h_exclues > 0 ? {
        kwh: (r.wh_conso_exclu ?? 0) / 1000, kwhRetour: (r.wh_inj_exclu ?? 0) / 1000,
        kwhA: (r.wh_a_exclu ?? 0) / 1000, kwhB: (r.wh_b_exclu ?? 0) / 1000, kwhC: (r.wh_c_exclu ?? 0) / 1000,
        heures: r.nb_h_exclues, regles: r.regles_exclues ?? [],
      } : undefined,
    };
  });
}

/** Heures de la plage De/À appliquée chaque jour (22 → 6 passe minuit). */
function heuresDansPlage(debut: number, fin: number): number {
  return debut <= fin ? fin - debut + 1 : 24 - debut + fin + 1;
}

// ── Bandeau Nettoyage : ce qui est écarté, et pourquoi ────────
// Les règles et leurs textes viennent de la base (qualite_regles) ; ce
// bandeau ne fait qu'afficher les signalements de fn_qualite et les choix.
type OptsNettoyage = { completude: boolean; masquerZeros: boolean; quarantaine: boolean };
const jjmm = (cle: string) => `${cle.slice(8, 10)}/${cle.slice(5, 7)}`;
const fmtPlage = (sg: Signalement) => {
  const d = new Date(sg.debut);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  if (sg.niveau === 'jour') return date;
  if (sg.niveau === 'appareil') return `${sg.nom ?? sg.device_id} muet depuis le ${date} (${fmtFr(sg.valeur ?? 0, 0)} j)`;
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${h}${sg.nb_heures && sg.nb_heures > 1 ? ` (${sg.nb_heures} h)` : ''}`;
};
// Ce que représente la série principale, et comment la consommation est obtenue (site_bilan)
const LIBELLE_NATURE: Record<NaturePrincipale, string> = {
  consommation: 'consommation du site',
  reseau: 'énergie soutirée au réseau (pas la consommation)',
  departs: 'somme des départs mesurés (partielle)',
  lignes: 'somme des lignes du fichier',
  aucune: 'rien de mesuré',
};
// Titre court des cartes et de la courbe principale
const TITRE_NATURE: Record<NaturePrincipale, string> = {
  consommation: 'Consommation',
  reseau: 'Énergie réseau soutirée',
  departs: 'Départs mesurés',
  lignes: 'Consommation totale',
  aucune: 'Énergie mesurée (voir détail)',
};
const LIBELLE_METHODE: Record<string, string> = {
  arrivee: "compteur d'arrivée",
  charge_M3: 'compteur de charge M3',
  departs: 'somme des départs',
  indeterminee: 'indéterminée',
  non_declaree: 'non déclarée',
};
const COULEUR_ACTION: Record<string, string> = {
  quarantaine: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  signaler: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  doublon: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function BandeauNettoyage({ rapport, options, onChange, nbJours, nbJoursRetenus, heuresParJour, version, avecQualite }: {
  rapport: RapportNettoyage;
  options: OptsNettoyage;
  onChange: (o: OptsNettoyage) => void;
  nbJours: number;
  nbJoursRetenus: number;
  heuresParJour: number | null;
  version: string | null;
  avecQualite: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const exclus = rapport.jours.filter(j => j.exclu);

  const resume = [
    `${nbJours} jours · ${nbJoursRetenus} retenus pour la moyenne`,
    exclus.length > 0 && `${exclus.length} écarté${exclus.length > 1 ? 's' : ''}`,
    rapport.joursSansDonnee.length > 0 && `${rapport.joursSansDonnee.length} sans donnée`,
    rapport.kwhQuarantaine > 0 && `${fmtFr(rapport.kwhQuarantaine, 2)} kWh en quarantaine`,
    rapport.horsTotal.length > 0 && `${rapport.horsTotal.length} appareils hors de la série principale`,
    rapport.groupes.length > 0 && `${rapport.groupes.length} type${rapport.groupes.length > 1 ? 's' : ''} de signalement`,
    rapport.appareilsMasques.length > 0 && `${rapport.appareilsMasques.length} appareils à 0 masqués`,
  ].filter(Boolean).join(' · ');

  const Case = ({ k, label, aide }: { k: keyof OptsNettoyage; label: string; aide: string }) => (
    <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer" title={aide}>
      <input type="checkbox" className="mt-0.5 accent-violet-500" checked={options[k]}
        onChange={e => onChange({ ...options, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-3 space-y-2">
      <button onClick={() => setOuvert(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm text-slate-300">
          <span className="text-white font-medium">Nettoyage</span>
          <span className="text-slate-400"> — {resume}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <p className="text-xs text-slate-500">
            Les données en base ne sont jamais modifiées et rien n'est extrapolé : les contrôles choisissent
            seulement ce qui entre dans les calculs.
            {version && <> Règles de qualité en vigueur au {new Date(version).toLocaleDateString('fr-FR')} (Paramètres → Qualité).</>}
          </p>
          {!avecQualite && (
            <p className="text-xs text-amber-300/80">
              Fichier importé : les contrôles de qualité du moteur ne s'appliquent pas encore aux fichiers.
            </p>
          )}
          <div className="grid md:grid-cols-3 gap-3">
            <Case k="quarantaine" label="Retirer l'énergie des heures en quarantaine"
              aide="Heures écartées par une règle d'action « quarantaine » (ex. capteur hors de sa période d'affectation)." />
            <Case k="completude" label="Écarter les journées incomplètes ou en cours de la moyenne, du min et du max (elles restent dans le total)"
              aide="Règle « Journée incomplète » : une heure de coupure compte comme présente." />
            <Case k="masquerZeros" label="Masquer du détail les appareils à 0 sur toute la période"
              aide="Un départ à 0 = appareil éteint, pas une anomalie. Sans effet sur les calculs." />
          </div>

          <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
            {heuresParJour != null && options.completude && (
              <li>Complétude jugée sur {heuresParJour} h/jour, d'après : {rapport.referenceCompletude.join(', ')}.</li>
            )}
            {exclus.map(j => (
              <li key={`x${j.cle}`}><span className="text-amber-300">{jjmm(j.cle)}</span> écarté — {j.exclu}</li>
            ))}
            {rapport.joursSansDonnee.length > 0 && (
              <li>Aucune donnée : {rapport.joursSansDonnee.map(jjmm).join(', ')}.</li>
            )}
            {rapport.sites.map(s => (
              <li key={`s${s.site}`}>
                <span className="text-slate-300">{s.site}</span> — {LIBELLE_NATURE[s.nature]}
                {s.nature === 'consommation' ? ` (${LIBELLE_METHODE[s.methode]})` : s.raison ? ` : ${s.raison}` : ''}
                {s.nonMesure != null && `. Non mesuré (consommation − départs) : ${fmtFr(s.nonMesure, 2)} kWh`}.
              </li>
            ))}
            {rapport.horsTotal.length > 0 && (
              <li>Hors de la série principale (comptés par un autre compteur, ou d'un autre rôle) : {rapport.horsTotal.join(', ')}.</li>
            )}
            {rapport.appareilsMasques.length > 0 && (
              <li>Masqués (0 kWh sur la période) : {rapport.appareilsMasques.join(', ')}.</li>
            )}
          </ul>

          {rapport.groupes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-300">Signalements du moteur de qualité</p>
              {rapport.groupes.map(g => (
                <div key={g.regle} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white font-medium">{g.libelle}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[0.625rem] ${COULEUR_ACTION[g.action] ?? COULEUR_ACTION.signaler}`}>{g.action}</span>
                    <span className="text-slate-400">
                      {g.plages.length} plage{g.plages.length > 1 ? 's' : ''}
                      {g.heures > 0 && ` · ${g.heures} h`}
                      {g.kwh > 0.005 && ` · ${fmtFr(g.kwh, 2)} kWh`}
                      {` · ${g.appareils.slice(0, 4).join(', ')}${g.appareils.length > 4 ? ` +${g.appareils.length - 4}` : ''}`}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">{g.explication}</p>
                  <p className="text-slate-400 mt-1">
                    {g.plages.slice(0, 8).map(fmtPlage).join(' · ')}
                    {g.plages.length > 8 && ` · … +${g.plages.length - 8}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ViewMode = 'journalier' | 'mensuel' | 'phases';
type ChartType = 'aire' | 'barres';

function KPICard({ label, value, unit, sub, color = 'blue' }: {
  label: string; value: string; unit: string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] ?? colorMap.blue}`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// Secours si la lecture des comptes Shelly échoue ; sinon les sites viennent de shelly_accounts
const SITES_SECOURS = ['Académie CER2E', 'Donsin', 'Ma Maison'];

// Familles qui ne mesurent pas d'énergie (station météo, H&T, portes,
// boutons…) : exclues de la courbe de charge, sinon leurs journées à 0 kWh
// faussent moyenne, minimum et médiane. Le classement type → famille se
// règle dans Paramètres → Types d'appareils.
const FAMILLES_SANS_ENERGIE = ['CAPTEUR_ENV', 'ETAT'];

interface TooltipEntry { name: string; value: number | string; unit?: string; color?: string; fill?: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', minWidth: 190 }}>
      <p style={{ color: '#e2e8f0', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>{label}</p>
      {payload.map((entry) => (
        // Texte clair + pastille de couleur : le texte coloré était illisible avec les palettes foncées.
        <p key={entry.name} style={{ color: '#e2e8f0', fontSize: 12, margin: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 9999, flexShrink: 0, backgroundColor: entry.color || entry.fill || '#94a3b8', boxShadow: '0 0 0 1px rgba(255,255,255,0.5)' }} />
            {entry.name}
          </span>
          <span style={{ fontWeight: 700 }}>{entry.value}{entry.unit ? ` ${entry.unit}` : ''}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * @param perimetre  fourni par l'onglet Analyse : la courbe se charge sur CE
 *   périmètre (même site, appareils, période, plage horaire que les autres
 *   vues) et n'affiche plus son propre chargeur.
 * @param lignes     lignes d'un fichier importé dans Analyse (sinon le contexte).
 */
export function ProfilChargeTab({ perimetre, lignes, demandeRapport = 0 }: {
  perimetre?: PerimetreAnalyse | null;
  lignes?: ShellyRow[];
  /** Incrémenté par le bouton « Rapport » de la barre d'Analyse : ouvre la fenêtre du rapport. */
  demandeRapport?: number;
} = {}) {
  const { state } = useIOT();
  const csvRows = lignes ?? state.shellyRows;

  // ── Mode source ───────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<'csv' | 'supabase'>('csv');
  const [supabaseRows, setSupabaseRows] = useState<ShellyRow[]>([]);
  // Filtres multi-sélection
  const [sbSelectedSites, setSbSelectedSites] = useState<string[]>(['Ma Maison']);
  const [sbSites, setSbSites] = useState<string[]>(SITES_SECOURS);
  useEffect(() => {
    fetchAccounts()
      .then(accounts => {
        const sites = Array.from(new Set(accounts.map(a => a.site).filter(Boolean))).sort();
        if (sites.length > 0) setSbSites(sites);
      })
      .catch(() => { /* liste de secours conservée */ });
  }, []);
  const [sbSelectedRooms, setSbSelectedRooms] = useState<string[]>([]);
  const [sbSelectedDeviceIds, setSbSelectedDeviceIds] = useState<string[]>([]);
  // Catalogues disponibles (chargés depuis Supabase)
  const [sbAvailableRooms, setSbAvailableRooms] = useState<string[]>([]);
  const [sbDevices, setSbDevices] = useState<{ device_id: string; name: string; room: string | null; site: string }[]>([]);
  const [sbDateDebut, setSbDateDebut] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().substring(0, 10);
  });
  const [sbDateFin, setSbDateFin] = useState(() => new Date().toISOString().substring(0, 10));
  const [sbHeureDebut, setSbHeureDebut] = useState(0);
  const [sbHeureFin, setSbHeureFin] = useState(23);
  // Paramètres du DERNIER chargement : le nettoyage s'y réfère, pas aux
  // sélecteurs, qu'on peut avoir modifiés depuis sans recharger
  const [chargement, setChargement] = useState<{
    debut: string; fin: string; heureDebut: number; heureFin: number; heures: number;
  } | null>(null);
  // Qualité : signalements et règles du dernier chargement
  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [regles, setRegles] = useState<RegleQualite[]>([]);
  // Méthode de consommation de chaque site (site_bilan)
  const [sitesBilan, setSitesBilan] = useState<SiteBilan[]>([]);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  const shellyRows = sourceMode === 'supabase' ? supabaseRows : csvRows;

  // Catalogue complet garanti : fetchDisponibles() lit la liste statique des 31+32 appareils.
  // Room enrichie depuis shelly_cl (fenêtre 90j, query légère device_id+room uniquement).
  const loadDevices = async (sites: string[]) => {
    if (sites.length === 0) { setSbDevices([]); setSbAvailableRooms([]); return; }
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ devices: allDevices }, { data: roomData }] = await Promise.all([
      fetchDisponibles(),
      supabase
        .from('shelly_cl')
        .select('device_id, room')
        .in('site', sites)
        .not('room', 'is', null)
        .gte('ts', since90d)
        .limit(5000),
    ]);

    const roomByDevice = new Map<string, string>();
    for (const r of roomData ?? []) {
      if (r.room && !roomByDevice.has(r.device_id)) roomByDevice.set(r.device_id, r.room);
    }

    const devices = allDevices
      .filter(d => sites.includes(d.site) && !FAMILLES_SANS_ENERGIE.includes(d.device_family))
      .map(d => ({ ...d, room: roomByDevice.get(d.device_id) ?? null }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));

    setSbDevices(devices);
    setSbSelectedDeviceIds([]);
    setSbSelectedRooms([]);
    const rooms = Array.from(new Set(devices.map(d => d.room).filter((r): r is string => Boolean(r)))).sort();
    setSbAvailableRooms(rooms);
  };

  const toggleSite = (site: string) => {
    setSbSelectedSites(prev => {
      const next = prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site];
      loadDevices(next);
      return next;
    });
    setSbSelectedRooms([]);
    setSbSelectedDeviceIds([]);
  };

  const toggleRoom = (room: string) => {
    setSbSelectedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
    setSbSelectedDeviceIds([]);
  };

  const toggleDevice = (id: string) =>
    setSbSelectedDeviceIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  // Charger les appareils automatiquement au passage en mode supabase
  useEffect(() => {
    if (sourceMode === 'supabase' && sbDevices.length === 0) loadDevices(sbSelectedSites);
  }, [sourceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Appareils visibles dans le filtre : filtrés par pièces sélectionnées
  const sbDevicesFiltered = sbSelectedRooms.length > 0
    ? sbDevices.filter(d => d.room && sbSelectedRooms.includes(d.room))
    : sbDevices;

  const loadFromSupabase = async () => {
    if (sbSelectedSites.length === 0) { setSbError('Sélectionnez au moins un site.'); return; }
    setSbLoading(true);
    setSbError(null);
    try {
      if (sbDateFin < sbDateDebut) { setSbError('La date de fin précède la date de début.'); setSbLoading(false); return; }
      // Résoudre les device_ids : appareils sélectionnés > pièces sélectionnées > tous
      let deviceIds: string[] | undefined;
      if (sbSelectedDeviceIds.length > 0) {
        deviceIds = sbSelectedDeviceIds;
      } else if (sbSelectedRooms.length > 0) {
        deviceIds = sbDevices
          .filter(d => d.room && sbSelectedRooms.includes(d.room))
          .map(d => d.device_id);
        if (deviceIds.length === 0) { setSbError('Aucun appareil dans les pièces sélectionnées.'); setSbLoading(false); return; }
      }

      await chargerPerimetre({
        dateDebut: sbDateDebut, dateFin: sbDateFin,
        heureDebut: sbHeureDebut, heureFin: sbHeureFin,
        sites: sbSelectedSites, deviceIds,
      });
    } catch (e) {
      setSbError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSbLoading(false);
    }
  };

  // Chargement d'un périmètre (depuis le panneau ci-dessous, ou imposé par Analyse)
  const chargerPerimetre = async (perimetre: {
    dateDebut: string; dateFin: string; heureDebut: number; heureFin: number; sites: string[]; deviceIds?: string[];
  }) => {
    // Agrégé côté serveur et lu par pages : toute la période, sans troncature.
    // Les familles sans énergie (shelly_familles) sont écartées par la fonction.
    // Qualité : signalements du moteur fn_qualite sur le même périmètre
    const [data, sig, rg, sb] = await Promise.all([
      fetchProfilCharge(perimetre),
      fetchSignalements(perimetre),
      fetchRegles(),
      fetchSiteBilan(),
    ]);
    setSignalements(sig);
    setRegles(rg);
    setSitesBilan(sb);

    // Pièces : déjà connues par la liste des appareils (loadDevices)
    const roomMap = new Map(sbDevices.filter(d => d.room).map(d => [d.device_id, d.room as string]));
    const heures = heuresDansPlage(perimetre.heureDebut, perimetre.heureFin);
    const rows = profilJourToShellyRows(data, roomMap, heures);
    setChargement({ debut: perimetre.dateDebut, fin: perimetre.dateFin, heureDebut: perimetre.heureDebut, heureFin: perimetre.heureFin, heures });
    setSupabaseRows(rows);
    if (rows.length === 0) setSbError('Aucune donnée pour cette sélection.');
  };

  // Périmètre imposé par l'onglet Analyse : un seul chargement pour toutes les vues
  useEffect(() => {
    if (!perimetre) return;
    setSourceMode('supabase');
    setSbLoading(true);
    setSbError(null);
    chargerPerimetre({
      dateDebut: perimetre.dateDebut, dateFin: perimetre.dateFin,
      heureDebut: perimetre.heureDebut, heureFin: perimetre.heureFin,
      sites: perimetre.site ? [perimetre.site] : sbSites,
      deviceIds: perimetre.deviceIds.length > 0 ? perimetre.deviceIds : undefined,
    })
      .catch(e => setSbError(e instanceof Error ? e.message : 'Erreur inconnue'))
      .finally(() => setSbLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perimetre?.version]);

  const [viewMode, setViewMode] = useState<ViewMode>('journalier');
  const [chartType, setChartType] = useState<ChartType>('aire');
  const [filterType, setFilterType] = useState<'tous' | 'ouvrés' | 'weekends' | 'fériés'>('tous');

  // Séries masquées dans les graphiques (clic sur la légende)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const isHidden = (key: string) => hiddenSeries.has(key);

  // Sélecteur multi-métriques affichées dans les graphiques journalier/mensuel
  type MetricKey = 'total' | 'net' | 'retour' | 'phaseA' | 'phaseB' | 'phaseC' | 'puissTotal' | 'puissA' | 'puissB' | 'puissC'
    | 'pv' | 'groupe' | 'reseau' | 'departs';
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(new Set(['total', 'net']));
  const toggleMetric = (k: MetricKey) =>
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const isMetric = (k: MetricKey) => selectedMetrics.has(k);

  // Filtrer les lignes
  const filteredRows = useMemo<ShellyRow[]>(() => {
    switch (filterType) {
      case 'ouvrés': return shellyRows.filter(r => !r.isWeekend && !r.isJourFerie);
      case 'weekends': return shellyRows.filter(r => r.isWeekend);
      case 'fériés': return shellyRows.filter(r => r.isJourFerie);
      default: return shellyRows;
    }
  }, [shellyRows, filterType]);

  // Nettoyage (la base n'est jamais modifiée) : chaque contrôle se désactive
  const [optsNettoyage, setOptsNettoyage] = useState<OptsNettoyage>({ completude: true, masquerZeros: true, quarantaine: true });
  const enSupabase = sourceMode === 'supabase' && chargement !== null;
  // Fichier importé : pas encore de signalements (étape 4, table de transit)
  const nettoyage = useMemo(() => nettoyerProfil(
    filteredRows,
    enSupabase ? signalements : [],
    regles,
    {
      ...optsNettoyage,
      sitesBilan: enSupabase ? sitesBilan : undefined,
      periode: enSupabase ? { debut: chargement.debut, fin: chargement.fin } : undefined,
    },
  ), [filteredRows, signalements, regles, sitesBilan, optsNettoyage, enSupabase, chargement]);

  // Bilan par rôle (données Supabase uniquement) : flux totaux, non mesuré, méthodes
  const nettoyageFlux = useMemo(() => {
    if (!nettoyage.fluxTotal) return null;
    const nonMesures = nettoyage.sites.map(s => s.nonMesure).filter((v): v is number => v != null);
    return {
      nature: nettoyage.nature,
      flux: nettoyage.fluxTotal,
      nonMesure: nonMesures.length ? nonMesures.reduce((a, b) => a + b, 0) : null,
      methodes: nettoyage.sites.map(s => `${s.site} : ${s.nature === 'consommation' ? LIBELLE_METHODE[s.methode] : LIBELLE_NATURE[s.nature]}`).join(' · '),
      raisons: nettoyage.sites.filter(s => s.raison).map(s => `${s.site} : ${s.raison}`).join(' · '),
    };
  }, [nettoyage]);

  // Bilan par rôle (données Supabase) : la série principale est nommée pour ce
  // qu'elle est (consommation, énergie réseau, départs) ; « nette » n'a plus de
  // sens à l'échelle du site et les flux par rôle deviennent des courbes à part.
  const bilan = nettoyageFlux;
  const prefsGraph = useChartPreferences();
  const METRICS_DEFAUT: { key: MetricKey; label: string; color: string; unit: string; mensuelKey?: string }[] = [
    { key: 'total', label: bilan ? TITRE_NATURE[bilan.nature] : 'Consommation totale', color: '#3b82f6', unit: 'kWh', mensuelKey: 'kwhTotal' },
    ...(bilan ? [] : [{ key: 'net' as MetricKey, label: 'Énergie nette', color: '#06b6d4', unit: 'kWh', mensuelKey: 'kwhNet' }]),
    // Injection : seulement s'il y a un compteur réseau pour la mesurer
    ...(!bilan || bilan.flux.reseauInjecte != null
      ? [{ key: 'retour' as MetricKey, label: bilan ? 'Injection au réseau' : 'Énergie injectée (retour)', color: '#a78bfa', unit: 'kWh', mensuelKey: 'kwhRetour' }]
      : []),
    ...(bilan?.flux.pv != null ? [{ key: 'pv' as MetricKey, label: 'Production PV', color: '#facc15', unit: 'kWh' }] : []),
    ...(bilan?.flux.groupe != null ? [{ key: 'groupe' as MetricKey, label: 'Groupe électrogène', color: '#f97316', unit: 'kWh' }] : []),
    ...(bilan && bilan.nature !== 'reseau' && bilan.flux.reseauSoutire != null ? [{ key: 'reseau' as MetricKey, label: 'Soutirage réseau', color: '#64748b', unit: 'kWh' }] : []),
    ...(bilan && bilan.nature !== 'departs' && bilan.flux.departs != null ? [{ key: 'departs' as MetricKey, label: 'Départs mesurés', color: '#22c55e', unit: 'kWh' }] : []),
    { key: 'phaseA', label: 'Phase A — Consommation', color: '#a855f7', unit: 'kWh' },
    { key: 'phaseB', label: 'Phase B — Consommation', color: '#f59e0b', unit: 'kWh' },
    { key: 'phaseC', label: 'Phase C — Consommation', color: '#ec4899', unit: 'kWh' },
    { key: 'puissTotal', label: 'Puissance totale', color: '#10b981', unit: 'kW' },
    { key: 'puissA', label: 'Puissance — Phase A', color: '#34d399', unit: 'kW' },
    { key: 'puissB', label: 'Puissance — Phase B', color: '#fbbf24', unit: 'kW' },
    { key: 'puissC', label: 'Puissance — Phase C', color: '#f87171', unit: 'kW' },
  ];
  // Couleur choisie par la personne (sélecteur « Couleurs »). Mêmes clés que
  // dans Analyse quand la donnée est la même, pour qu'elle garde sa couleur.
  const METRICS = METRICS_DEFAUT.map(m => ({
    ...m, color: couleurDonnee(prefsGraph, CLE_COULEUR[m.key] ?? `courbe:${m.key}`, m.color),
  }));

  const analyse = useMemo(
    () => analyserDonneesShelly(nettoyage.rowsCalcul, nettoyage.joursExclus, enSupabase ? chargement.heures : 24),
    [nettoyage, enSupabase, chargement]
  );
  const ctxFlux = { lignes: filteredRows, nettoyage, nbJours: analyse.nbJours, quarantaine: optsNettoyage.quarantaine };
  const statsKwh = useMemo(
    () => calculerStats(analyse.parJour.filter(j => !j.exclu).map(j => j.kwhNet)),
    [analyse]
  );

  // Données graphique journalier : un point par jour, appareils additionnés
  const chartDataJournalier = useMemo(() =>
    analyse.parJour.map(r => ({
      date: r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      total: +((r.kwhTotal ?? 0).toFixed(2)),
      net: +((r.kwhNet ?? 0).toFixed(2)),
      retour: +((r.kwhRetourTotal ?? 0).toFixed(2)),
      pv: r.flux?.pv != null ? +r.flux.pv.toFixed(2) : null,
      groupe: r.flux?.groupe != null ? +r.flux.groupe.toFixed(2) : null,
      reseau: r.flux?.reseauSoutire != null ? +r.flux.reseauSoutire.toFixed(2) : null,
      departs: r.flux?.departs != null ? +r.flux.departs.toFixed(2) : null,
      phaseA: +((r.kwhA ?? 0).toFixed(2)),
      phaseB: +((r.kwhB ?? 0).toFixed(2)),
      phaseC: +((r.kwhC ?? 0).toFixed(2)),
      puissTotal: +((r.puissKwTotal ?? 0).toFixed(3)),
      puissA: +((r.puissKwA ?? 0).toFixed(3)),
      puissB: +((r.puissKwB ?? 0).toFixed(3)),
      puissC: +((r.puissKwC ?? 0).toFixed(3)),
      isWeekend: r.isWeekend,
      isFerie: r.isJourFerie,
    })),
    [analyse]
  );

  // Données graphique mensuel
  const chartDataMensuel = useMemo(() =>
    Object.entries(analyse.parMois).map(([mois, data]) => ({
      mois,
      kwhTotal: +((data.kwhTotal ?? 0).toFixed(2)),
      kwhNet: +((data.kwhNet ?? 0).toFixed(2)),
      kwhRetour: +((data.kwhRetour ?? 0).toFixed(2)),
      nbJours: data.nbJours,
    })),
    [analyse]
  );

  // ── Rapport Excel ─────────────────────────────────────────
  // Remplace l'ancien export, dont la colonne « kWh Total » additionnait
  // arrivée et départs. Le rapport reprend les objets de l'écran tels quels
  // (services/iotRapport.ts) : il ne recalcule aucune énergie.
  const { user } = useAuth();
  const [rapportOuvert, setRapportOuvert] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [rapportEnCours, setRapportEnCours] = useState(false);
  const [rapportErreur, setRapportErreur] = useState<string | null>(null);
  const [periodes, setPeriodes] = useState<Awaited<ReturnType<typeof fetchDevicePeriodes>>>([]);
  useEffect(() => {
    if (demandeRapport > 0) setRapportOuvert(true);
  }, [demandeRapport]);
  useEffect(() => {
    if (!rapportOuvert || !enSupabase) return;
    fetchDevicePeriodes().then(setPeriodes).catch(() => setPeriodes([]));
  }, [rapportOuvert, enSupabase]);

  const entreeRapport = useMemo<EntreeRapport>(() => {
    const meta = user?.user_metadata ?? {};
    // Compte connecté ; espaces en trop du profil retirés (« Maurice  DIOUF »)
    const auteur = (meta.first_name && meta.last_name ? `${meta.first_name} ${meta.last_name}` : (user?.email ?? 'utilisateur'))
      .replace(/\s+/g, ' ').trim();
    const uniques = (f: (r: ShellyRow) => string | undefined) =>
      [...new Set(shellyRows.map(f).filter((x): x is string => Boolean(x)))].sort();
    return {
      analyse, nettoyage, bilan: nettoyageFlux, lignes: filteredRows,
      libellePrincipal: nettoyageFlux ? TITRE_NATURE[nettoyageFlux.nature] : 'Consommation totale',
      perimetre: {
        source: enSupabase ? 'base' : 'fichier',
        sites: uniques(r => r.deviceLocation),
        appareils: uniques(r => r.nomAppareil),
        debut: enSupabase ? chargement.debut : undefined,
        fin: enSupabase ? chargement.fin : undefined,
        heureDebut: enSupabase ? chargement.heureDebut : undefined,
        heureFin: enSupabase ? chargement.heureFin : undefined,
        filtreJours: { tous: 'tous les jours', 'ouvrés': 'jours ouvrés seulement', weekends: 'week-ends seulement', 'fériés': 'jours fériés seulement' }[filterType],
      },
      options: optsNettoyage,
      versionRegles: versionRegles(regles) ?? '—',
      periodes,
      auteur,
      commentaire,
      dateExport: new Date(),
    };
  }, [analyse, nettoyage, nettoyageFlux, filteredRows, enSupabase, chargement, shellyRows, filterType, optsNettoyage, regles, periodes, user, commentaire]);
  const apercuRapport = useMemo(() => (rapportOuvert ? construireRapport(entreeRapport) : null), [rapportOuvert, entreeRapport]);

  const exporterRapport = async (format: 'excel' | 'pdf') => {
    setRapportEnCours(true);
    setRapportErreur(null);
    try {
      const rapport = construireRapport({ ...entreeRapport, dateExport: new Date() });
      const p = entreeRapport.perimetre;
      const nom = [
        'Rapport_courbe_de_charge',
        p.sites.length === 1 ? p.sites[0] : p.sites.length ? `${p.sites.length}_sites` : 'fichier',
        p.debut, p.fin,
      ].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '_');
      if (format === 'excel') await exporterRapportExcel(rapport, `${nom}.xlsx`);
      else exporterRapportPdf(rapport, `${nom}.pdf`);
      setRapportOuvert(false);
    } catch (e) {
      setRapportErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setRapportEnCours(false);
    }
  };


  return (
    <div className="space-y-6">

      {perimetre && (sbLoading || sbError) && (
        <p className={`text-xs ${sbError ? 'text-red-400' : 'text-slate-400'}`}>
          {sbError ?? 'Chargement de la courbe de charge sur le périmètre choisi…'}
        </p>
      )}

      {/* ── Panneau source de données (sans périmètre imposé par Analyse) ── */}
      {!perimetre && (
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm font-medium">Source :</span>
          <button
            onClick={() => setSourceMode('csv')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sourceMode === 'csv'
                ? 'bg-blue-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            Fichiers importés {csvRows.length > 0 && <span className="ml-1 opacity-60">({csvRows.length.toLocaleString('fr-FR')} lignes)</span>}
          </button>
          <button
            onClick={() => { setSourceMode('supabase'); if (sbDevices.length === 0) loadDevices(sbSelectedSites); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sourceMode === 'supabase'
                ? 'bg-violet-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            <Database className="h-3.5 w-3.5" /> Supabase temps réel
          </button>
        </div>

        {sourceMode === 'supabase' && (
          <div className="flex flex-wrap items-end gap-3 pt-1">

            {/* ── Sites ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Sites {sbSelectedSites.length > 0 && <span className="text-violet-400">({sbSelectedSites.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-40 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedSites.length === 0 ? 'Tous les sites' : sbSelectedSites.join(', ')}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-[#1a1d2e] border-white/20" align="start">
                  {sbSites.map(s => (
                    <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={sbSelectedSites.includes(s)} onChange={() => toggleSite(s)} className="accent-violet-500" />
                      {s}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Pièces ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Pièces {sbSelectedRooms.length > 0 && <span className="text-violet-400">({sbSelectedRooms.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-44 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedRooms.length === 0 ? 'Toutes les pièces' : `${sbSelectedRooms.length} pièce(s)`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-[#1a1d2e] border-white/20 max-h-60 overflow-y-auto" align="start">
                  {sbAvailableRooms.length === 0
                    ? <p className="text-slate-500 text-xs px-2 py-1">Aucune pièce disponible</p>
                    : sbAvailableRooms.map(r => (
                      <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5 cursor-pointer">
                        <input type="checkbox" checked={sbSelectedRooms.includes(r)} onChange={() => toggleRoom(r)} className="accent-violet-500" />
                        {r}
                      </label>
                    ))
                  }
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Appareils ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Appareils {sbSelectedDeviceIds.length > 0 && <span className="text-violet-400">({sbSelectedDeviceIds.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-52 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedDeviceIds.length === 0 ? `Tous (${sbDevicesFiltered.length})` : `${sbSelectedDeviceIds.length} appareil(s)`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 bg-[#1a1d2e] border-white/20 max-h-72 overflow-y-auto" align="start">
                  {sbDevicesFiltered.length === 0
                    ? <p className="text-slate-500 text-xs px-2 py-1">Aucun appareil disponible</p>
                    : (() => {
                        const bySite = sbDevicesFiltered.reduce<Record<string, typeof sbDevicesFiltered>>((acc, d) => {
                          (acc[d.site] ??= []).push(d); return acc;
                        }, {});
                        return Object.entries(bySite).map(([site, devs]) => (
                          <div key={site}>
                            {Object.keys(bySite).length > 1 && (
                              <p className="text-[0.625rem] text-slate-500 uppercase tracking-wide px-2 pt-2 pb-1">{site}</p>
                            )}
                            {devs.map(d => (
                              <label key={d.device_id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-white/5 cursor-pointer">
                                <input type="checkbox" checked={sbSelectedDeviceIds.includes(d.device_id)} onChange={() => toggleDevice(d.device_id)} className="accent-violet-500" />
                                <span className="flex-1 truncate">{d.name}</span>
                                {d.room && <span className="text-slate-500 shrink-0">{d.room}</span>}
                              </label>
                            ))}
                          </div>
                        ));
                      })()
                  }
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Dates ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Du</Label>
              <Input type="date" value={sbDateDebut} onChange={e => setSbDateDebut(e.target.value)}
                className="w-36 bg-white/5 border-white/20 text-white text-sm h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Au</Label>
              <Input type="date" value={sbDateFin} onChange={e => setSbDateFin(e.target.value)}
                className="w-36 bg-white/5 border-white/20 text-white text-sm h-8" />
            </div>

            {/* ── Heures ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">De</Label>
              <select value={sbHeureDebut} onChange={e => setSbHeureDebut(Number(e.target.value))}
                className="w-20 h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-[#1a1d2e]">{String(i).padStart(2, '0')}h</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">À</Label>
              <select value={sbHeureFin} onChange={e => setSbHeureFin(Number(e.target.value))}
                className="w-20 h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-[#1a1d2e]">{String(i).padStart(2, '0')}h</option>
                ))}
              </select>
            </div>

            {/* ── Chips sélection active ── */}
            {(sbSelectedRooms.length > 0 || sbSelectedDeviceIds.length > 0) && (
              <div className="flex flex-wrap gap-1 self-end pb-0.5">
                {sbSelectedRooms.map(r => (
                  <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs border border-violet-500/30">
                    {r}<button onClick={() => toggleRoom(r)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {sbSelectedDeviceIds.map(id => {
                  const d = sbDevices.find(x => x.device_id === id);
                  return d ? (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30">
                      {d.name}<button onClick={() => toggleDevice(id)}><X className="h-3 w-3" /></button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <Button size="sm" onClick={loadFromSupabase} disabled={sbLoading}
              className="bg-violet-600 hover:bg-violet-700 text-white h-8">
              {sbLoading
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />Chargement…</>
                : <><Database className="h-3.5 w-3.5 mr-1" />Charger</>}
            </Button>
            {sbError && <p className="text-red-400 text-xs self-center">{sbError}</p>}
            {supabaseRows.length > 0 && !sbLoading && (
              <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 self-center">
                {new Set(supabaseRows.map(r => cleJour(r.date))).size} jours chargés · {new Set(supabaseRows.map(r => r.deviceId)).size} appareils
              </Badge>
            )}
          </div>
        )}
      </div>
      )}

      {shellyRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Zap className="h-12 w-12 opacity-20 mb-4" />
          {sourceMode === 'csv'
            ? <><p className="text-lg font-medium">Aucune donnée Shelly 3EM</p>
              <p className="text-sm mt-1">Importez un fichier dans l'onglet <strong className="text-slate-400">Import</strong> ou basculez sur Supabase.</p></>
            : <><p className="text-lg font-medium">Aucune donnée chargée</p>
              <p className="text-sm mt-1">Sélectionnez un site et une période, puis cliquez sur <strong className="text-slate-400">Charger</strong>.</p></>
          }
        </div>
      )}

      {shellyRows.length > 0 && <>
        <BandeauNettoyage
          rapport={nettoyage}
          options={optsNettoyage}
          onChange={setOptsNettoyage}
          nbJours={analyse.nbJours}
          nbJoursRetenus={analyse.nbJoursRetenus}
          heuresParJour={enSupabase ? chargement.heures : null}
          version={versionRegles(regles)}
          avecQualite={enSupabase}
        />

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label={nettoyageFlux ? TITRE_NATURE[nettoyageFlux.nature] : 'Consommation totale'}
            value={nettoyageFlux?.nature === 'aucune'
              ? '—'
              : analyse.totalKwhNet.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/\./g, ',')}
            unit={nettoyageFlux?.nature === 'aucune' ? '' : 'kWh'}
            sub={nettoyageFlux
              ? (nettoyageFlux.nature === 'aucune' && nettoyageFlux.raisons ? nettoyageFlux.raisons : `${analyse.nbJours} jours · ${nettoyageFlux.methodes}`)
              : `${analyse.nbJours} jours`}
            color="blue"
          />
          <KPICard
            label="Moyenne journalière"
            value={nettoyageFlux?.nature === 'aucune' ? '—' : fmtFr(analyse.moyenneJournaliere, 1).replace('.', ',')}
            unit={nettoyageFlux?.nature === 'aucune' ? '' : 'kWh/j'}
            sub={nettoyageFlux?.nature === 'aucune'
              ? 'Non calculable : rien de mesuré pour la série principale'
              : `Sur ${analyse.nbJoursRetenus} j retenus · Max ${fmtFr(analyse.maxJournalier, 1)} · Min ${fmtFr(analyse.minJournalier, 1)}`}
            color="green"
          />
          {nettoyageFlux ? <>
            {nettoyageFlux.flux.reseauSoutire != null && (() => {
              // Même règle que le rapport : un compteur qui émet mais compte 0
              // n'est pas « 0 kWh soutirés » (Académie, août 2026)
              const etat = etatDuFlux('reseauSoutire', nettoyageFlux.flux.reseauSoutire, ctxFlux);
              return (
                <KPICard
                  label="Réseau (arrivée)"
                  value={etat.valeur == null ? '—' : fmtFr(etat.valeur, 0)}
                  unit={etat.valeur == null ? '' : 'kWh soutirés'}
                  sub={etat.valeur == null || Math.abs(etat.valeur) < 0.0005
                    ? etat.precision
                    : `Injectés : ${fmtFr(nettoyageFlux.flux.reseauInjecte ?? 0, 1)} kWh`}
                  color="purple"
                />
              );
            })()}
            {(nettoyageFlux.flux.pv != null || nettoyageFlux.flux.groupe != null) && (
              <KPICard
                label={nettoyageFlux.flux.pv != null ? 'Production PV' : 'Groupe électrogène'}
                value={fmtFr((nettoyageFlux.flux.pv ?? nettoyageFlux.flux.groupe) ?? 0, 0)}
                unit="kWh"
                sub={nettoyageFlux.flux.pv != null && nettoyageFlux.flux.groupe != null ? `Groupe : ${fmtFr(nettoyageFlux.flux.groupe, 1)} kWh` : 'Mesuré à part, non additionné'}
                color="green"
              />
            )}
            {nettoyageFlux.flux.departs != null && nettoyageFlux.nature !== 'departs' && Math.abs(nettoyageFlux.flux.departs) < 0.0005 ? (
              <KPICard
                label="Départs mesurés"
                value={etatDuFlux('departs', nettoyageFlux.flux.departs, ctxFlux).valeur == null ? '—' : '0'}
                unit="kWh"
                sub={etatDuFlux('departs', nettoyageFlux.flux.departs, ctxFlux).precision}
                color="blue"
              />
            ) : nettoyageFlux.flux.departs != null && nettoyageFlux.nature !== 'departs' && (
              <KPICard
                label="Départs mesurés"
                value={fmtFr(nettoyageFlux.flux.departs, 0)}
                unit="kWh"
                sub={nettoyageFlux.nonMesure != null ? `Non mesuré : ${fmtFr(nettoyageFlux.nonMesure, 1)} kWh` : 'Hors bilan (autre arrivée ou série principale)'}
                color="blue"
              />
            )}
          </> : (
            <KPICard
              label="Énergie retournée"
              value={analyse.totalKwhRetour.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/\./g, ',')}
              unit="kWh"
              sub={analyse.totalKwhConsomme > 0 ? `${((analyse.totalKwhRetour / analyse.totalKwhConsomme) * 100).toFixed(1).replace('.', ',')}% du brut` : undefined}
              color="purple"
            />
          )}
        </div>

        {/* Profil par type de jour */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Jours ouvrés', data: analyse.jourOuvre, color: 'text-blue-400' },
            { label: 'Week-ends', data: analyse.weekend, color: 'text-yellow-400' },
            { label: 'Jours fériés', data: analyse.ferieOuDimanche, color: 'text-purple-400' },
          ].map(({ label, data, color }) => (
            <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
              <p className="text-slate-400 text-xs">{label}</p>
              <p className={`${color} text-xl font-bold mt-1`}>{fmtFr(data.kwhMoyen, 1)}</p>
              <p className="text-slate-500 text-xs">kWh moyen/j · {data.nbJours}j</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 bg-white/5 rounded-xl border border-white/10 p-4">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="journalier">Journalier</SelectItem>
              <SelectItem value="mensuel">Mensuel</SelectItem>
            </SelectContent>
          </Select>

          <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
            <SelectTrigger className="w-36 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="aire">Courbe / Aire</SelectItem>
              <SelectItem value="barres">Histogramme</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
            <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="tous">Tous les jours</SelectItem>
              <SelectItem value="ouvrés">Jours ouvrés</SelectItem>
              <SelectItem value="weekends">Week-ends</SelectItem>
              <SelectItem value="fériés">Jours fériés</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => setRapportOuvert(true)}
              title="Rapport Excel ou PDF : synthèse, journalier, types de jour, mensuel, qualité"
            >
              <Download className="h-4 w-4 mr-1" /> Rapport
            </Button>
          </div>
        </div>

        {/* Graphique principal */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h3 className="text-white font-semibold">
              {viewMode === 'journalier' ? 'Profil de charge journalier' : 'Consommation mensuelle'}
            </h3>
            {/* Sélecteur multi-métriques (pills cliquables) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 text-xs mr-1">Métriques :</span>
              {METRICS.map(m => {
                const active = isMetric(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => toggleMetric(m.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? 'border-transparent text-white' : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30'
                      }`}
                    style={active ? { backgroundColor: m.color + '30', borderColor: m.color, color: m.color } : undefined}
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </button>
                );
              })}
              {selectedMetrics.size === 0 && (
                <span className="text-amber-400 text-xs ml-2">Aucune métrique sélectionnée</span>
              )}
              <span className="ml-2">
                <CouleursDonnees donnees={METRICS.filter(m => isMetric(m.key)).map(m => ({
                  key: CLE_COULEUR[m.key] ?? `courbe:${m.key}`, label: `${m.label} (${m.unit})`, color: m.color,
                }))} />
              </span>
            </div>
          </div>

          <ResponsiveContainer key={`${viewMode}-${chartType}`} width="100%" height={360}>
            {viewMode === 'mensuel' ? (
              <BarChart data={chartDataMensuel} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Mois', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh"
                  label={{ value: 'Énergie (kWh)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                {METRICS.filter(m => m.mensuelKey && isMetric(m.key)).map(m => (
                  <Bar key={m.key} dataKey={m.mensuelKey!} name={m.label} fill={m.color} unit={m.unit}
                    radius={[4, 4, 0, 0]} hide={isHidden(m.mensuelKey!)} />
                ))}
              </BarChart>
            ) : chartType === 'aire' ? (
              <AreaChart data={chartDataJournalier} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd"
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Valeur', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                <ReferenceLine y={statsKwh.moyenne} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: `Moy. ${fmtFr(statsKwh.moyenne, 1)} kWh`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                {METRICS.filter(m => isMetric(m.key)).map(m => (
                  <Area key={m.key} type="monotone" dataKey={m.key} name={m.label} unit={m.unit}
                    stroke={m.color} fill={`${m.color}25`} strokeWidth={m.key === 'total' ? 2.5 : 1.5}
                    hide={isHidden(m.key)} />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={chartDataJournalier} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd"
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Valeur', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                {METRICS.filter(m => isMetric(m.key)).map(m => (
                  <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} unit={m.unit}
                    radius={[2, 2, 0, 0]} hide={isHidden(m.key)} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <Dialog open={rapportOuvert} onOpenChange={setRapportOuvert}>
          <DialogContent className="max-w-2xl bg-[#0f111a] border-white/10 text-slate-100">
            <DialogHeader>
              <DialogTitle>Rapport — courbe de charge</DialogTitle>
            </DialogHeader>
            {apercuRapport && (
              <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-1">
                  {apercuRapport.perimetre.slice(0, 5).map(([k, v]) => (
                    <p key={k} className="text-xs"><span className="text-slate-400">{k} : </span><span className="text-slate-200">{v}</span></p>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-300 mb-1">Synthèse calculée (reprise telle quelle dans le fichier)</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                    {apercuRapport.phrases.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
                <div>
                  <Label htmlFor="commentaire-rapport" className="text-xs text-slate-300">Commentaire de l'analyste (facultatif)</Label>
                  <Textarea
                    id="commentaire-rapport"
                    value={commentaire}
                    onChange={e => setCommentaire(e.target.value)}
                    placeholder="Votre interprétation : contexte, incident connu, recommandation…"
                    className="mt-1 min-h-24 bg-white/5 border-white/15 text-slate-100 text-xs"
                  />
                  <p className="text-[0.6875rem] text-slate-500 mt-1">
                    Signé {entreeRapport.auteur} et présenté comme l'avis de l'analyste, distinct des chiffres mesurés.
                  </p>
                </div>
                {rapportErreur && <p className="text-xs text-red-400">{rapportErreur}</p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" className="text-slate-300" onClick={() => setRapportOuvert(false)}>Annuler</Button>
              <Button onClick={() => exporterRapport('pdf')} disabled={rapportEnCours} variant="outline" className="border-white/20 text-white hover:bg-white/10"
                title="Document à lire : synthèse, chiffres clés, journalier, types de jour, mois, qualité">
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button onClick={() => exporterRapport('excel')} disabled={rapportEnCours} className="bg-blue-600 hover:bg-blue-500"
                title="Classeur complet, avec le détail par appareil et par jour">
                <Download className="h-4 w-4 mr-1" /> {rapportEnCours ? 'Préparation…' : 'Excel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tableau de données journalières */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Données journalières
            </h3>
            <Badge variant="outline" className="border-white/20 text-slate-300">
              {nettoyage.rowsAffichage.length} lignes · {analyse.nbJours} jours
            </Badge>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[#1a1d2e] z-10">
                <tr>
                  {['Date', 'Jour', 'Appareil', 'kWh Tot', 'kWh Ret', 'kWh Cum'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                  {/* Conso. par phase */}
                  <th className="px-2 py-2 text-right text-purple-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Conso. A</th>
                  <th className="px-2 py-2 text-right text-yellow-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Conso. B</th>
                  <th className="px-2 py-2 text-right text-pink-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Conso. C</th>
                  <th className="px-2 py-2 text-right text-cyan-400/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">kWh Net</th>
                  {/* Puissance par phase */}
                  <th className="px-2 py-2 text-right text-green-400/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Puiss. Tot</th>
                  <th className="px-2 py-2 text-right text-purple-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Puiss. A</th>
                  <th className="px-2 py-2 text-right text-yellow-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Puiss. B</th>
                  <th className="px-2 py-2 text-right text-pink-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Puiss. C</th>
                  <th className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10 text-[0.625rem] uppercase tracking-wide">Profil</th>
                </tr>
              </thead>
              <tbody>
                {nettoyage.rowsAffichage.map((r, i) => {
                  return (
                    <tr key={i} className={`border-t border-white/5 hover:bg-white/5 ${r.jourActivites === 'Jour férié' ? 'bg-purple-500/5' :
                        r.jourActivites === 'Weekend' ? 'bg-yellow-500/5' : ''
                      }`}>
                      <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{(r.date instanceof Date ? r.date : new Date(r.date as string)).toLocaleDateString('fr-FR')}</td>
                      <td className="px-2 py-1.5 text-slate-400">{r.jourSemaine}</td>
                      <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">
                        {r.nomAppareil ?? '—'}
                        {r.deviceId && nettoyage.idsHorsTotal.has(r.deviceId) && (
                          <span className="ml-1 text-slate-500" title="Mesuré, mais hors de la série principale : déjà compté par un autre compteur, ou d'un autre rôle (PV, groupe)">(hors total)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-blue-400 text-right">{fmtFr(r.kwhTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-purple-400 text-right">{fmtFr(r.kwhRetourTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-slate-400 text-right">{fmtFr(r.kwhCumTotal, 1)}</td>
                      {/* Conso. par phase */}
                      <td className="px-2 py-1.5 text-purple-300 text-right">{fmtFr(r.kwhA, 2)}</td>
                      <td className="px-2 py-1.5 text-yellow-300 text-right">{fmtFr(r.kwhB, 2)}</td>
                      <td className="px-2 py-1.5 text-pink-300 text-right">{fmtFr(r.kwhC, 2)}</td>
                      <td className="px-2 py-1.5 text-cyan-400 text-right font-medium">{fmtFr(r.kwhNet, 2)}</td>
                      {/* Puissance par phase */}
                      <td className="px-2 py-1.5 text-green-400 text-right">{fmtFr(r.puissKwTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-purple-300 text-right">{fmtFr(r.puissKwA, 2)}</td>
                      <td className="px-2 py-1.5 text-yellow-300 text-right">{fmtFr(r.puissKwB, 2)}</td>
                      <td className="px-2 py-1.5 text-pink-300 text-right">{fmtFr(r.puissKwC, 2)}</td>
                      <td className="px-2 py-1.5">
                        <Badge className={`border-0 text-[0.625rem] ${r.profil === 'CHARGE' ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}>
                          {r.profil}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </>}
    </div>
  );
}
