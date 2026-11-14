/**
 * Analyses du rapport enrichi : heures, circuits, pics, tableau croisé.
 *
 * Fonctions pures, sans écran ni base : tout vient de `EntreeAnalyses`.
 * Règles reprises du rapport de la Courbe de charge :
 *  - la série principale est celle du Bilan (idsPrincipaux) ; on n'additionne
 *    jamais une arrivée et ses départs, ni un circuit et ses sous-circuits ;
 *  - une mesure absente reste absente, jamais 0 ;
 *  - un constat n'est écrit que si les données suffisent.
 * Toutes les heures sont en UTC, qui est l'heure de Dakar.
 */

import type { ShellyRow } from '@/components/iot/shared';
import type { RapportNettoyage } from '@/lib/iot-profil-engine';
import type { Signalement } from '@/lib/iot-qualite-service';
import type { CoherenceCircuit, LigneHoraire, PicMinute, ReleveBrut, VoieMinute } from '@/lib/iot-rapport-service';
import type { ChiffreCle, Tableau } from './iotRapport';
import { tableauComparaisonSites } from './iotRapportCapteurs';

export interface TranchesHoraires {
  jourDebut: number;
  jourFin: number;
  soirDebut: number;
  soirFin: number;
  talonDebut: number;
  talonFin: number;
}

export const TRANCHES_DEFAUT: TranchesHoraires = { jourDebut: 7, jourFin: 19, soirDebut: 19, soirFin: 23, talonDebut: 0, talonFin: 3 };

interface EntreeAnalyses {
  lignes: LigneHoraire[];
  /** Appareils de la série principale ; null = pas de rôles (fichier) : toutes les lignes. */
  idsPrincipaux: Set<string> | null;
  nettoyage: RapportNettoyage;
  libellePrincipal: string;
  /** Période demandée, pour compter les heures attendues. */
  debut?: string;
  fin?: string;
  heureDebut?: number;
  heureFin?: number;
  tranches: TranchesHoraires;
  signalements: Signalement[];
  retirerQuarantaine: boolean;
  piecesParAppareil: Map<string, string>;
  /** Totaux de l'écran, pour le contrôle de rapprochement. */
  totalEcranKwh: number | null;
  voies: VoieMinute[] | null;
  pics: PicMinute[] | null;
  compteurPics: string | null;
  /** Plusieurs sites : les pics de chaque compteur de référence. */
  picsParCompteur?: { compteur: string; pics: PicMinute[] }[] | null;
  coherence: CoherenceCircuit[] | null;
  temperatures: Map<string, number> | null;
  aRetenir: string;
  aVerifier: string;
  maintenant?: Date;
}

export interface RapportAnalyses {
  essentiel: ChiffreCle[];
  constats: string[];
  aVerifierAuto: string[];
  aRetenir: string;
  aVerifier: string;
  controle: { ecartKwh: number; texte: string; ok: boolean } | null;
  tranches: Tableau;
  tranchesParType: Tableau;
  profil24: Tableau;
  profilCircuits: Tableau | null;
  carte: { jours: string[]; matrice: (number | null)[][] } | null;
  horaire: Tableau;
  voies: Tableau;
  bilan: Tableau;
  /** Feuilles de l'arbre, pour le camembert : consommation par usage. */
  repartition: { libelle: string; kwh: number; part: number | null }[];
  classement: Tableau;
  pics: Tableau | null;
  coherence: Tableau | null;
  /** Deux sites ou plus : une ligne par site, sinon null. */
  comparaisonSites: Tableau | null;
  tcd: { mois: Tableau; semaine: Tableau; jourSemaine: Tableau; typeJour: Tableau; appareil: Tableau; piece: Tableau | null; phases: Tableau | null };
  monotone: Tableau;
  distribution: Tableau;
  temperature: Tableau | null;
  couvertureParJour: Map<string, { heures: number; etat: string }>;
}

// ── Utilitaires ──────────────────────────────────────────────
const nf = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pc = (v: number, d = 0) => `${nf(v * 100, d)} %`;
const cleUtc = (d: Date) => d.toISOString().slice(0, 10);
const heureUtc = (d: Date) => d.getUTCHours();
const jjmm = (cle: string) => `${cle.slice(8, 10)}/${cle.slice(5, 7)}`;
const jourSemaineUtc = (cle: string) => new Date(`${cle}T00:00:00Z`).getUTCDay();
const FR_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const libelleHeure = (h: number) => `${String(h).padStart(2, '0')} h`;
const dansPlage = (h: number, debut: number, fin: number) => (debut <= fin ? h >= debut && h < fin : h >= debut || h < fin);
const nbHeuresPlage = (debut: number, fin: number) => (debut <= fin ? fin - debut : 24 - debut + fin);
const moyenne = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const typeDeJour = (cle: string) => {
  const d = jourSemaineUtc(cle);
  return d === 0 ? 'Dimanche' : d === 6 ? 'Samedi' : 'Jour ouvré';
};
const LIBELLE_ROLE: Record<string, string> = {
  M1_RESEAU: 'Arrivée réseau', M2_SELECTEUR: 'Sélecteur', M3_CHARGE: 'Charge', M4_GROUPE: 'Groupe', M5_PV: 'Production PV', DEPART: 'Départ',
};
const roleLisible = (r: string | null) => (r ? LIBELLE_ROLE[r] ?? r : 'sans rôle');
const ROLES_PRODUCTION = new Set(['M5_PV', 'M4_GROUPE']);

/** Lignes horaires d'un fichier importé : seulement s'il porte des heures. */
export function lignesHorairesDepuisFichier(rows: ShellyRow[]): LigneHoraire[] {
  const agr = new Map<string, LigneHoraire>();
  for (const r of rows) {
    const date = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
    if (Number.isNaN(date.getTime())) continue;
    const h = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()));
    const id = r.deviceId ?? r.nomAppareil ?? 'fichier';
    const k = `${h.getTime()}|${id}`;
    const c = agr.get(k) ?? {
      ts: h, site: r.deviceLocation ?? '', deviceId: id, nom: r.nomAppareil ?? id, famille: null, role: null, parentId: null,
      wh: 0, whInj: 0, wMoy: null, wMax: null, whA: 0, whB: 0, whC: 0, nbMesures: 0,
    };
    c.wh += (r.kwhTotal ?? 0) * 1000;
    c.whInj += (r.kwhRetourTotal ?? 0) * 1000;
    c.whA += (r.kwhA ?? 0) * 1000;
    c.whB += (r.kwhB ?? 0) * 1000;
    c.whC += (r.kwhC ?? 0) * 1000;
    c.nbMesures += 1;
    agr.set(k, c);
  }
  const lignes = [...agr.values()];
  // Un fichier journalier a toutes ses lignes à la même heure : pas d'analyse horaire possible
  return new Set(lignes.map(l => heureUtc(l.ts))).size > 1 ? lignes : [];
}

export interface RelevesRapport { brut: ReleveBrut[]; nettoye: ReleveBrut[]; journal: Tableau }

/** Retire les lignes sans aucune mesure et les relectures d'une même mesure ; rien n'est modifié ni inventé. */
export function preparerReleves(brut: ReleveBrut[]): RelevesRapport {
  const VALEURS = ['power_w', 'p_a', 'p_b', 'p_c', 'v_a', 'v_b', 'v_c', 'i_a', 'i_b', 'i_c', 'wh_tot', 'wh_rtot'];
  const vus = new Set<string>();
  let vides = 0;
  let relectures = 0;
  const nettoye = brut.filter(r => {
    if (VALEURS.every(k => r[k] == null)) { vides++; return false; }
    if (r.measured_at != null) {
      const cle = `${r.device_id}|${r.measured_at}`;
      if (vus.has(cle)) { relectures++; return false; }
      vus.add(cle);
    }
    return true;
  });
  return {
    brut, nettoye,
    journal: {
      note: 'Les compteurs et les valeurs conservées ne sont jamais modifiés.',
      colonnes: [{ titre: 'Étape', format: 'texte' }, { titre: 'Lignes', format: 'nombre' }],
      lignes: [
        ['Relevés bruts', brut.length],
        ['Lignes sans aucune mesure, retirées', vides],
        ['Relectures d’une même mesure (même appareil, même heure de mesure), retirées', relectures],
        ['Relevés conservés', nettoye.length],
      ],
    },
  };
}

export function construireAnalyses(e: EntreeAnalyses): RapportAnalyses {
  const t = e.tranches;
  const maintenant = e.maintenant ?? new Date();

  // ── Quarantaine : mêmes heures que fn_profil_charge ─────────
  const plages = e.retirerQuarantaine
    ? e.signalements.filter(s => s.action === 'quarantaine' && s.niveau === 'heure' && s.device_id)
    : [];
  const plagesDe = new Map<string, { d: number; f: number }[]>();
  for (const s of plages) {
    const l = plagesDe.get(s.device_id as string) ?? [];
    l.push({ d: new Date(s.debut).getTime(), f: new Date(s.fin).getTime() });
    plagesDe.set(s.device_id as string, l);
  }
  const lignes = e.lignes.map(l => {
    const tsMs = l.ts.getTime();
    return plagesDe.get(l.deviceId)?.some(p => tsMs >= p.d && tsMs < p.f)
      ? { ...l, wh: 0, whInj: 0, whA: 0, whB: 0, whC: 0 }
      : l;
  });

  const joursExclus = e.nettoyage.joursExclus;
  const estPrincipal = (id: string) => (e.idsPrincipaux ? e.idsPrincipaux.has(id) : true);
  const lignesP = lignes.filter(l => estPrincipal(l.deviceId));
  const mesure = lignesP.length > 0;

  // Appareils
  const appareils = new Map<string, { id: string; nom: string; site: string; famille: string | null; role: string | null; parentId: string | null; wh: number; whInj: number; heures: number; somWMoy: number; nW: number }>();
  for (const l of lignes) {
    const a = appareils.get(l.deviceId) ?? { id: l.deviceId, nom: l.nom, site: l.site, famille: l.famille, role: l.role, parentId: l.parentId, wh: 0, whInj: 0, heures: 0, somWMoy: 0, nW: 0 };
    a.nom = l.nom;
    a.wh += l.wh;
    a.whInj += l.whInj;
    if (l.nbMesures > 0) a.heures += 1;
    if (l.wMoy != null) { a.somWMoy += l.wMoy; a.nW += 1; }
    appareils.set(l.deviceId, a);
  }
  const nomDe = (id: string) => appareils.get(id)?.nom ?? id;
  // La production se lit sur le compteur retour (sens du TC corrigé)
  const kwhDe = (a: { role: string | null; wh: number; whInj: number }) => (a.role === 'M5_PV' ? a.whInj : a.wh) / 1000;

  // ── Série principale par heure ──────────────────────────────
  const parHeure = new Map<number, { ts: Date; wh: number; whA: number; whB: number; whC: number; present: boolean; wMoy: number; aW: boolean; wMax: number | null }>();
  for (const l of lignesP) {
    const k = l.ts.getTime();
    const c = parHeure.get(k) ?? { ts: l.ts, wh: 0, whA: 0, whB: 0, whC: 0, present: false, wMoy: 0, aW: false, wMax: null };
    c.wh += l.wh; c.whA += l.whA; c.whB += l.whB; c.whC += l.whC;
    if (l.nbMesures > 0) c.present = true;
    if (l.wMoy != null) { c.wMoy += l.wMoy; c.aW = true; }
    if (l.wMax != null) c.wMax = (c.wMax ?? 0) + l.wMax;
    parHeure.set(k, c);
  }
  const heures = [...parHeure.values()].filter(h => h.present).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const totalKwh = heures.reduce((s, h) => s + h.wh, 0) / 1000;

  // Couverture et jours
  const parJour = new Map<string, { kwh: number; heures: number }>();
  for (const h of heures) {
    const c = parJour.get(cleUtc(h.ts)) ?? { kwh: 0, heures: 0 };
    c.kwh += h.wh / 1000;
    c.heures += 1;
    parJour.set(cleUtc(h.ts), c);
  }
  const heuresParJourAttendu = e.heureDebut != null && e.heureFin != null
    ? (e.heureDebut <= e.heureFin ? e.heureFin - e.heureDebut + 1 : 24 - e.heureDebut + e.heureFin + 1) : 24;
  const couvertureParJour = new Map([...parJour].map(([k, v]) => [k, {
    heures: v.heures, etat: v.heures >= heuresParJourAttendu - 1 ? 'complète' : 'partielle',
  }]));
  const jours = [...parJour.keys()].sort();
  const joursRetenus = jours.filter(j => !joursExclus.has(j));
  const retenu = (ts: Date) => !joursExclus.has(cleUtc(ts));
  const heuresAttendues = (() => {
    if (!e.debut || !e.fin) return null;
    let n = 0;
    const d = new Date(`${e.debut}T00:00:00Z`);
    const fin = new Date(`${e.fin}T23:00:00Z`);
    for (; d <= fin && d < maintenant; d.setUTCHours(d.getUTCHours() + 1)) {
      const h = d.getUTCHours();
      if (e.heureDebut == null || e.heureFin == null || (e.heureDebut <= e.heureFin ? h >= e.heureDebut && h <= e.heureFin : h >= e.heureDebut || h <= e.heureFin)) n++;
    }
    return n;
  })();

  // ── Tranches ────────────────────────────────────────────────
  const dansJour = (h: number) => dansPlage(h, t.jourDebut, t.jourFin);
  const dansSoir = (h: number) => dansPlage(h, t.soirDebut, t.soirFin);
  const sommeSi = (f: (h: number) => boolean) => heures.filter(h => f(heureUtc(h.ts))).reduce((s, h) => s + h.wh, 0) / 1000;
  const nbSi = (f: (h: number) => boolean) => heures.filter(h => f(heureUtc(h.ts))).length;
  const defTranches = [
    { nom: `Jour (${t.jourDebut} h–${t.jourFin} h)`, f: dansJour },
    { nom: `Nuit (${t.jourFin} h–${t.jourDebut} h)`, f: (h: number) => !dansJour(h) },
    { nom: `dont soirée (${t.soirDebut} h–${t.soirFin} h)`, f: dansSoir },
  ];
  const tranches: Tableau = {
    note: 'La soirée est comptée dans la tranche qui la contient : ne pas l’ajouter au jour et à la nuit. Heures locales de Dakar.',
    colonnes: [
      { titre: 'Tranche', format: 'texte' }, { titre: 'kWh', format: 'kwh' }, { titre: 'Part de l’énergie', format: 'pct' },
      { titre: 'Part du temps', format: 'pct' }, { titre: 'Puissance moyenne (W)', format: 'nombre' }, { titre: 'Heures mesurées', format: 'nombre' },
    ],
    lignes: mesure ? defTranches.map(d => {
      const kwh = sommeSi(d.f);
      const n = nbSi(d.f);
      return [d.nom, kwh, totalKwh > 0 ? kwh / totalKwh : null, heures.length ? n / heures.length : null, n ? (kwh / n) * 1000 : null, n];
    }) : [],
  };

  const typesListe = ['Jour ouvré', 'Samedi', 'Dimanche'];
  const tranchesParType: Tableau = {
    note: 'Moyennes sur les jours retenus (hors jours exclus des statistiques).',
    colonnes: [
      { titre: 'Type de jour', format: 'texte' }, { titre: 'Jours', format: 'nombre' }, { titre: 'kWh par jour', format: 'kwh' },
      { titre: 'Jour : kWh par jour', format: 'kwh' }, { titre: 'Nuit : kWh par jour', format: 'kwh' }, { titre: 'Soirée : kWh par jour', format: 'kwh' },
      { titre: 'Part du jour', format: 'pct' },
    ],
    lignes: mesure ? typesListe.map(type => {
      const js = joursRetenus.filter(j => typeDeJour(j) === type);
      const hs = heures.filter(h => retenu(h.ts) && typeDeJour(cleUtc(h.ts)) === type);
      const som = (f: (h: number) => boolean) => hs.filter(h => f(heureUtc(h.ts))).reduce((s, h) => s + h.wh, 0) / 1000;
      const tot = som(() => true);
      return js.length === 0
        ? [type, 0, null, null, null, null, null]
        : [type, js.length, tot / js.length, som(dansJour) / js.length, som(h => !dansJour(h)) / js.length, som(dansSoir) / js.length, tot > 0 ? som(dansJour) / tot : null];
    }) : [],
  };

  // ── Profil 24 h ─────────────────────────────────────────────
  const moyHeure = (filtre: (cle: string) => boolean) => {
    const v: number[][] = Array.from({ length: 24 }, () => []);
    for (const h of heures) if (retenu(h.ts) && filtre(cleUtc(h.ts))) v[heureUtc(h.ts)].push(h.wh / 1000);
    return v.map(moyenne);
  };
  const pTous = moyHeure(() => true);
  const pOuvre = moyHeure(c => typeDeJour(c) === 'Jour ouvré');
  const pSam = moyHeure(c => typeDeJour(c) === 'Samedi');
  const pDim = moyHeure(c => typeDeJour(c) === 'Dimanche');
  const pMaxH: (number | null)[] = Array.from({ length: 24 }, () => null);
  for (const h of heures) {
    const i = heureUtc(h.ts);
    if (h.wMax != null && lignesP.length > 0) pMaxH[i] = Math.max(pMaxH[i] ?? 0, h.wMax);
  }
  const profil24: Tableau = {
    note: 'kWh moyen de chaque heure sur les jours retenus. La puissance maximale additionne les compteurs de la série principale s’il y en a plusieurs.',
    colonnes: [
      { titre: 'Heure', format: 'texte' }, { titre: 'Tous les jours (kWh)', format: 'kwh' }, { titre: 'Jours ouvrés (kWh)', format: 'kwh' },
      { titre: 'Samedis (kWh)', format: 'kwh' }, { titre: 'Dimanches (kWh)', format: 'kwh' }, { titre: 'Puissance max observée (W)', format: 'nombre' },
    ],
    lignes: mesure ? Array.from({ length: 24 }, (_, h) => [libelleHeure(h), pTous[h], pOuvre[h], pSam[h], pDim[h], pMaxH[h]]) : [],
  };

  // Profil par circuit (W moyens), les plus gros d'abord
  const circuits = [...appareils.values()].filter(a => a.nW > 0).sort((a, b) => kwhDe(b) - kwhDe(a)).slice(0, 12);
  let profilCircuits: Tableau | null = null;
  if (circuits.length > 1) {
    const cumul = new Map<string, { s: number; n: number }[]>();
    for (const a of circuits) cumul.set(a.id, Array.from({ length: 24 }, () => ({ s: 0, n: 0 })));
    for (const l of lignes) {
      const c = cumul.get(l.deviceId);
      if (!c || l.wMoy == null || !retenu(l.ts)) continue;
      const i = heureUtc(l.ts);
      c[i].s += l.wMoy;
      c[i].n += 1;
    }
    profilCircuits = {
      note: 'Puissance moyenne de chaque heure, jours retenus. Un circuit inclut ses sous-circuits : ne pas additionner les colonnes.',
      colonnes: [{ titre: 'Heure', format: 'texte' }, ...circuits.map(a => ({ titre: `${a.nom} (W)`, format: 'nombre' as const }))],
      lignes: Array.from({ length: 24 }, (_, h) => [libelleHeure(h), ...circuits.map(a => {
        const v = cumul.get(a.id)![h];
        return v.n ? v.s / v.n : null;
      })]),
    };
  }

  // ── Carte de chaleur ────────────────────────────────────────
  const indexJour = new Map(jours.map((j, i) => [j, i]));
  const matrice: (number | null)[][] = Array.from({ length: 24 }, () => jours.map(() => null));
  for (const h of heures) matrice[heureUtc(h.ts)][indexJour.get(cleUtc(h.ts))!] = h.wh / 1000;
  const carte = jours.length > 0 ? { jours, matrice } : null;

  // ── Horaire ─────────────────────────────────────────────────
  const circuitsH = circuits.slice(0, 8);
  const parHeureCircuit = new Map<number, Map<string, number>>();
  for (const l of lignes) {
    if (l.nbMesures === 0) continue;
    const m = parHeureCircuit.get(l.ts.getTime()) ?? new Map<string, number>();
    m.set(l.deviceId, (l.role === 'M5_PV' ? l.whInj : l.wh) / 1000);
    parHeureCircuit.set(l.ts.getTime(), m);
  }
  const horaire: Tableau = {
    note: 'Une ligne par heure mesurée. Un circuit inclut ses sous-circuits : ne pas additionner les colonnes.',
    colonnes: [
      { titre: 'Heure', format: 'dateheure' }, { titre: `${e.libellePrincipal} (kWh)`, format: 'kwh' },
      { titre: 'Puissance moyenne (W)', format: 'nombre' }, { titre: 'Puissance max (W)', format: 'nombre' },
      ...circuitsH.map(a => ({ titre: `${a.nom} (kWh)`, format: 'kwh' as const })),
    ],
    lignes: heures.map(h => [
      h.ts, h.wh / 1000, h.aW ? h.wMoy : null, h.wMax,
      ...circuitsH.map(a => parHeureCircuit.get(h.ts.getTime())?.get(a.id) ?? null),
    ]),
  };

  // ── Arbre : circuit seul = circuit − ses enfants mesurés ────
  const enfantsDe = new Map<string, string[]>();
  for (const a of appareils.values()) {
    if (a.parentId && appareils.has(a.parentId)) enfantsDe.set(a.parentId, [...(enfantsDe.get(a.parentId) ?? []), a.id]);
  }
  const kwhSeul = (id: string) => {
    const a = appareils.get(id)!;
    return kwhDe(a) - (enfantsDe.get(id) ?? []).reduce((s, c) => s + kwhDe(appareils.get(c)!), 0);
  };
  // Ordre de l'arbre : parent puis enfants
  const ordreArbre: { id: string; niveau: number }[] = [];
  const vus = new Set<string>();
  const descendre = (id: string, niveau: number) => {
    if (vus.has(id)) return;
    vus.add(id);
    ordreArbre.push({ id, niveau });
    for (const c of (enfantsDe.get(id) ?? []).sort((a, b) => kwhDe(appareils.get(b)!) - kwhDe(appareils.get(a)!))) descendre(c, niveau + 1);
  };
  const ordreRole = (r: string | null) => ['M1_RESEAU', 'M3_CHARGE', 'M2_SELECTEUR', 'M5_PV', 'M4_GROUPE', 'DEPART'].indexOf(r ?? '') + 1 || 9;
  [...appareils.values()]
    .filter(a => !a.parentId || !appareils.has(a.parentId))
    .sort((a, b) => a.site.localeCompare(b.site) || ordreRole(a.role) - ordreRole(b.role) || kwhDe(b) - kwhDe(a))
    .forEach(a => descendre(a.id, 0));
  for (const a of appareils.values()) descendre(a.id, 0);

  // ── Synthèse par voie ───────────────────────────────────────
  // Conso. de fond : médiane des puissances horaires déjà chargées, sans relire la base.
  // Changer sa plage horaire est donc instantané, et elle peut passer minuit.
  const talons = new Map<string, number[]>();
  for (const l of e.lignes) {
    if (l.wMoy == null || !dansPlage(heureUtc(l.ts), t.talonDebut, t.talonFin)) continue;
    const v = talons.get(l.deviceId);
    if (v) v.push(l.wMoy); else talons.set(l.deviceId, [l.wMoy]);
  }
  const mediane = (v: number[] | undefined) => {
    if (!v?.length) return null;
    const tri = [...v].sort((a, b) => a - b);
    const i = (tri.length - 1) / 2;
    return (tri[Math.floor(i)] + tri[Math.ceil(i)]) / 2;
  };
  const voieDe = new Map((e.voies ?? []).map(v => [v.device_id, { ...v, talon_w: mediane(talons.get(v.device_id)) }]));
  const voies: Tableau = {
    note: e.voies
      ? 'Puissance moyenne = énergie ÷ heures mesurées. Puissance max et min sur les relevés bruts. Talon = médiane de la puissance moyenne horaire '
        + `entre ${t.talonDebut} h et ${t.talonFin} h. Tensions sous 50 V ignorées (relais ouvert).`
      : 'Relevés à la minute indisponibles sur ce périmètre : puissance max, talon et tensions non renseignés.',
    colonnes: [
      { titre: 'Circuit', format: 'texte' }, { titre: 'Alimenté par', format: 'texte' }, { titre: 'Site', format: 'texte' }, { titre: 'Rôle', format: 'texte' },
      { titre: 'Heures mesurées', format: 'nombre' }, { titre: 'Énergie (kWh)', format: 'kwh' }, { titre: 'P moy (W)', format: 'nombre' },
      { titre: 'P max (W)', format: 'nombre' }, { titre: 'Heure de P max', format: 'dateheure' }, { titre: 'P min (W)', format: 'nombre' },
      { titre: 'Talon nuit (W)', format: 'nombre' }, { titre: 'V min (V)', format: 'kwh' }, { titre: 'V max (V)', format: 'kwh' },
    ],
    lignes: ordreArbre.map(({ id, niveau }) => {
      const a = appareils.get(id)!;
      const v = voieDe.get(id);
      return [
        `${'   '.repeat(niveau)}${a.nom}`, a.parentId ? nomDe(a.parentId) : '—', a.site, roleLisible(a.role), a.heures, kwhDe(a),
        a.heures ? (kwhDe(a) / a.heures) * 1000 : null, v?.p_max ?? null, v?.heure_p_max ? new Date(v.heure_p_max) : null,
        v?.p_min ?? null, v?.talon_w ?? null, v?.v_min ?? null, v?.v_max ?? null,
      ];
    }),
  };

  // ── Bilan : où va l'énergie, site par site ──────────────────
  const lignesBilan: (string | number | null)[][] = [];
  const repartition: { libelle: string; kwh: number; part: number | null }[] = [];
  const sites = [...new Set([...appareils.values()].map(a => a.site))].sort();
  const plusieursSites = sites.length > 1;
  for (const site of sites) {
    const duSite = [...appareils.values()].filter(a => a.site === site);
    const bilanSite = e.nettoyage.sites.find(s => s.site === site);
    const principaux = duSite.filter(a => estPrincipal(a.id));
    const baseKwh = principaux.reduce((s, a) => s + kwhDe(a), 0);
    const arrivee = bilanSite?.methode === 'arrivee' ? duSite.find(a => a.role === 'M1_RESEAU') : undefined;

    // Consommateurs : tout sauf les compteurs de production et le compteur de tête
    const racines = principaux.map(a => a.id);
    const estTete = (a: { role: string | null; id: string }) => a.role === 'M1_RESEAU' || a.role === 'M3_CHARGE' || a.role === 'M2_SELECTEUR';
    const consommateurs = duSite.filter(a => !ROLES_PRODUCTION.has(a.role ?? '') && !estTete(a));

    if (e.idsPrincipaux === null) {
      for (const a of duSite) {
        const kwh = kwhDe(a);
        const part = baseKwh > 0 ? kwh / baseKwh : null;
        lignesBilan.push([site, a.nom, 'Mesuré', kwh, part, 'Ligne du fichier']);
        repartition.push({ libelle: a.nom, kwh, part });
      }
      continue;
    }

    for (const a of principaux) {
      lignesBilan.push([site, a.nom, 'Compteur de référence', kwhDe(a), baseKwh > 0 ? kwhDe(a) / baseKwh : null, 'Série principale du site']);
    }
    for (const a of consommateurs.sort((x, y) => kwhSeul(y.id) - kwhSeul(x.id))) {
      if (racines.includes(a.id) && (enfantsDe.get(a.id) ?? []).length === 0) continue;
      const kwh = kwhSeul(a.id);
      const enfants = enfantsDe.get(a.id) ?? [];
      const part = baseKwh > 0 ? kwh / baseKwh : null;
      lignesBilan.push([
        site, enfants.length ? `${a.nom} (seul)` : a.nom, 'Circuit', kwh, part,
        enfants.length ? `${a.nom} − ${enfants.map(nomDe).join(' − ')}` : 'Mesuré directement',
      ]);
      repartition.push({ libelle: `${plusieursSites ? `${site} · ` : ''}${a.nom}${enfants.length ? ' (seul)' : ''}`, kwh, part });
    }
    // Départs seuls pris comme série principale
    for (const a of principaux.filter(x => x.role === 'DEPART' && (enfantsDe.get(x.id) ?? []).length === 0 && !repartition.some(r => r.libelle.endsWith(x.nom)))) {
      repartition.push({ libelle: `${plusieursSites ? `${site} · ` : ''}${a.nom}`, kwh: kwhDe(a), part: baseKwh > 0 ? kwhDe(a) / baseKwh : null });
    }
    if (arrivee) {
      const enfantsDirects = consommateurs.filter(a => !a.parentId || a.parentId === arrivee.id);
      if (enfantsDirects.length > 0) {
        const nonMesure = kwhDe(arrivee) - enfantsDirects.reduce((s, a) => s + kwhDe(a), 0);
        const part = baseKwh > 0 ? nonMesure / baseKwh : null;
        lignesBilan.push([site, 'Non mesuré / écart', 'Écart', nonMesure, part, `${arrivee.nom} − circuits de premier niveau`]);
        repartition.push({ libelle: `${plusieursSites ? `${site} · ` : ''}Non mesuré / écart`, kwh: nonMesure, part });
      }
    }
    for (const a of duSite.filter(x => ROLES_PRODUCTION.has(x.role ?? ''))) {
      lignesBilan.push([site, a.nom, 'Production (à part)', kwhDe(a), null, 'Jamais additionnée à la consommation']);
    }
  }
  const bilan: Tableau = {
    note: 'Un circuit qui alimente d’autres circuits est donné « seul », sous-circuits retirés : les lignes « Circuit » et « Écart » d’un site s’additionnent au compteur de référence, quand il s’agit de l’arrivée.',
    colonnes: [
      { titre: 'Site', format: 'texte' }, { titre: 'Circuit', format: 'texte' }, { titre: 'Nature', format: 'texte' },
      { titre: 'kWh', format: 'kwh' }, { titre: 'Part du compteur de référence', format: 'pct' }, { titre: 'Calcul', format: 'texte' },
    ],
    lignes: lignesBilan,
  };

  const triRep = [...repartition].filter(r => r.kwh > 0).sort((a, b) => b.kwh - a.kwh);
  const sommeRep = triRep.reduce((s, r) => s + r.kwh, 0);
  let cumul = 0;
  const classement: Tableau = {
    note: 'Du plus gros usage au plus petit. Le cumul permet de voir quels circuits font l’essentiel de la consommation.',
    colonnes: [{ titre: 'Usage', format: 'texte' }, { titre: 'kWh', format: 'kwh' }, { titre: 'Part', format: 'pct' }, { titre: 'Cumul', format: 'pct' }],
    lignes: triRep.map(r => {
      cumul += r.kwh;
      return [r.libelle, r.kwh, sommeRep > 0 ? r.kwh / sommeRep : null, sommeRep > 0 ? cumul / sommeRep : null];
    }),
  };

  // ── Pics ────────────────────────────────────────────────────
  let pics: Tableau | null = null;
  if (e.pics && e.pics.length > 0) {
    const autres = [...new Set(e.pics.flatMap(p => Object.keys(p.circuits)))].filter(id => id !== e.compteurPics && appareils.has(id));
    pics = {
      note: `Les minutes les plus fortes de ${e.compteurPics ? nomDe(e.compteurPics) : 'la série principale'}, et ce que mesurait chaque circuit à cet instant (sa dernière mesure des 12 minutes précédentes).`,
      colonnes: [
        { titre: 'Minute', format: 'dateheure' }, { titre: `${e.compteurPics ? nomDe(e.compteurPics) : 'Compteur'} (W)`, format: 'nombre' },
        ...autres.map(id => ({ titre: `${nomDe(id)} (W)`, format: 'nombre' as const })),
      ],
      lignes: e.pics.map(p => [new Date(p.minute), p.power_w, ...autres.map(id => p.circuits[id] ?? null)]),
    };
  }

  if (e.picsParCompteur && e.picsParCompteur.length > 0) {
    pics = {
      note: 'Les minutes les plus fortes de chaque compteur de référence. Elles n’ont pas lieu au même moment : ne pas les additionner.',
      colonnes: [{ titre: 'Site', format: 'texte' }, { titre: 'Compteur', format: 'texte' }, { titre: 'Minute', format: 'dateheure' }, { titre: 'Puissance (W)', format: 'nombre' }],
      lignes: e.picsParCompteur.flatMap(({ compteur, pics: liste }) => liste.slice(0, 5).map(p => [appareils.get(compteur)?.site ?? '', nomDe(compteur), new Date(p.minute), p.power_w])),
    };
  }

  // ── Cohérence ───────────────────────────────────────────────
  let coherence: Tableau | null = null;
  let fiabilite: { pct: number; nom: string; minutes: number; toleranceTete: boolean } | null = null;
  if (e.coherence && e.coherence.length > 0) {
    coherence = {
      note: 'Parent = somme de ses enfants, minute par minute, à ± max(30 W ; 5 %). Un faible taux n’est pas forcément une erreur : le parent peut alimenter aussi des charges sans compteur.',
      colonnes: [
        { titre: 'Parent', format: 'texte' }, { titre: 'Enfants', format: 'texte' }, { titre: 'Minutes communes', format: 'nombre' },
        { titre: 'Minutes concordantes', format: 'pct' }, { titre: 'Écart médian (W)', format: 'nombre' }, { titre: 'Écart au 95e centile (W)', format: 'nombre' },
        { titre: 'Lecture', format: 'texte' },
      ],
      lignes: e.coherence.map(c => {
        const pct = c.minutes_communes ? c.minutes_ok / c.minutes_communes : null;
        const enfants = [...appareils.values()].filter(a => a.parentId === c.parent_device_id).map(a => a.nom).join(', ');
        return [
          nomDe(c.parent_device_id), enfants, c.minutes_communes, pct, c.ecart_median_w, c.ecart_p95_w,
          pct == null ? '' : pct >= 0.9 ? 'Compteurs cohérents' : `L'écart médian de ${nf(c.ecart_median_w ?? 0, 0)} W peut être une charge du parent sans compteur propre : à vérifier`,
        ];
      }),
    };
    const tete = e.coherence.find(c => {
      const r = appareils.get(c.parent_device_id)?.role;
      return r === 'M1_RESEAU' || r === 'M3_CHARGE';
    });
    if (tete && tete.minutes_communes > 0) fiabilite = { pct: tete.minutes_ok / tete.minutes_communes, nom: nomDe(tete.parent_device_id), minutes: tete.minutes_communes, toleranceTete: true };
  }

  // ── Tableau croisé (mêmes vues que le plein écran, sans double comptage) ──
  const groupe = (cle: (j: string) => string, ordre?: (a: string, b: string) => number) => {
    const m = new Map<string, { kwh: number; jours: Set<string>; heures: number; max: number | null; min: number | null }>();
    for (const [j, v] of parJour) {
      const k = cle(j);
      const c = m.get(k) ?? { kwh: 0, jours: new Set<string>(), heures: 0, max: null, min: null };
      c.kwh += v.kwh;
      c.jours.add(j);
      c.heures += v.heures;
      if (!joursExclus.has(j)) {
        c.max = c.max == null ? v.kwh : Math.max(c.max, v.kwh);
        c.min = c.min == null ? v.kwh : Math.min(c.min, v.kwh);
      }
      m.set(k, c);
    }
    return [...m.entries()].sort(([a], [b]) => (ordre ? ordre(a, b) : a.localeCompare(b)));
  };
  const COL_TCD = [
    { titre: 'kWh', format: 'kwh' as const }, { titre: 'Part', format: 'pct' as const }, { titre: 'Jours', format: 'nombre' as const },
    { titre: 'kWh par jour', format: 'kwh' as const }, { titre: 'Jour le plus haut (kWh)', format: 'kwh' as const }, { titre: 'Jour le plus bas (kWh)', format: 'kwh' as const },
  ];
  const ligneTcd = (lib: string, c: { kwh: number; jours: Set<string>; max: number | null; min: number | null }) =>
    [lib, c.kwh, totalKwh > 0 ? c.kwh / totalKwh : null, c.jours.size, c.jours.size ? c.kwh / c.jours.size : null, c.max, c.min];
  const lundiDe = (j: string) => {
    const d = new Date(`${j}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return cleUtc(d);
  };
  const mois: Tableau = {
    colonnes: [{ titre: 'Mois', format: 'texte' }, ...COL_TCD],
    lignes: groupe(j => j.slice(0, 7)).map(([k, c]) => ligneTcd(`${FR_MOIS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`, c)),
  };
  const semaine: Tableau = {
    colonnes: [{ titre: 'Semaine du', format: 'texte' }, ...COL_TCD],
    lignes: groupe(lundiDe).map(([k, c]) => ligneTcd(jjmm(k), c)),
  };
  const ordreSemaine = [1, 2, 3, 4, 5, 6, 0];
  const jourSemaine: Tableau = {
    colonnes: [{ titre: 'Jour de la semaine', format: 'texte' }, ...COL_TCD],
    lignes: groupe(j => String(ordreSemaine.indexOf(jourSemaineUtc(j)))).map(([k, c]) => ligneTcd(FR_JOURS[ordreSemaine[Number(k)]], c)),
  };
  const typeJour: Tableau = {
    colonnes: [{ titre: 'Type de jour', format: 'texte' }, ...COL_TCD],
    lignes: groupe(typeDeJour, (a, b) => typesListe.indexOf(a) - typesListe.indexOf(b)).map(([k, c]) => ligneTcd(k, c)),
  };
  const appareil: Tableau = {
    note: 'Énergie mesurée par chaque compteur. Compteurs de niveaux différents : la colonne ne s’additionne pas.',
    colonnes: [{ titre: 'Appareil', format: 'texte' }, { titre: 'Site', format: 'texte' }, { titre: 'Rôle', format: 'texte' }, { titre: 'kWh', format: 'kwh' }, { titre: 'Heures mesurées', format: 'nombre' }],
    lignes: ordreArbre.map(({ id }) => {
      const a = appareils.get(id)!;
      return [a.nom, a.site, roleLisible(a.role), kwhDe(a), a.heures];
    }),
  };
  const parPiece = new Map<string, number>();
  for (const a of appareils.values()) {
    if (ROLES_PRODUCTION.has(a.role ?? '') || (a.role && a.role !== 'DEPART')) continue;
    const piece = e.piecesParAppareil.get(a.id);
    if (piece) parPiece.set(piece, (parPiece.get(piece) ?? 0) + kwhSeul(a.id));
  }
  const piece: Tableau | null = parPiece.size > 0 ? {
    note: 'Circuits de chaque pièce, sous-circuits retirés.',
    colonnes: [{ titre: 'Pièce', format: 'texte' }, { titre: 'kWh', format: 'kwh' }],
    lignes: [...parPiece].sort((a, b) => b[1] - a[1]).map(([p, k]) => [p, k]),
  } : null;

  const parJourPhases = new Map<string, { a: number; b: number; c: number }>();
  for (const h of heures) {
    const p = parJourPhases.get(cleUtc(h.ts)) ?? { a: 0, b: 0, c: 0 };
    p.a += h.whA / 1000; p.b += h.whB / 1000; p.c += h.whC / 1000;
    parJourPhases.set(cleUtc(h.ts), p);
  }
  const totauxPhases = [...parJourPhases.values()].reduce((s, p) => ({ a: s.a + p.a, b: s.b + p.b, c: s.c + p.c }), { a: 0, b: 0, c: 0 });
  const sommePhases = totauxPhases.a + totauxPhases.b + totauxPhases.c;
  // Un compteur monophasé n'est pas « déséquilibré » : il faut trois phases réellement chargées
  // Additionner les phases de compteurs de sites différents n'aurait pas de sens
  const avecPhases = sites.length <= 1 && sommePhases > 0 && [totauxPhases.a, totauxPhases.b, totauxPhases.c].every(v => v / sommePhases >= 0.05);
  const desequilibre = (p: { a: number; b: number; c: number }) => {
    const m = (p.a + p.b + p.c) / 3;
    return m > 0 ? Math.max(Math.abs(p.a - m), Math.abs(p.b - m), Math.abs(p.c - m)) / m : null;
  };
  const phases: Tableau | null = avecPhases ? {
    note: 'Calculé à partir de la puissance moyenne de chaque phase. Déséquilibre = plus grand écart à la moyenne des trois phases.',
    colonnes: [
      { titre: 'Jour', format: 'texte' }, { titre: 'Phase A (kWh)', format: 'kwh' }, { titre: 'Phase B (kWh)', format: 'kwh' },
      { titre: 'Phase C (kWh)', format: 'kwh' }, { titre: 'Déséquilibre', format: 'pct' },
    ],
    lignes: [...parJourPhases].sort(([x], [y]) => x.localeCompare(y)).map(([j, p]) => [jjmm(j), p.a, p.b, p.c, desequilibre(p)]),
  } : null;

  // ── Monotone et distribution ────────────────────────────────
  const valeursH = heures.map(h => h.wh / 1000).sort((a, b) => b - a);
  const monotone: Tableau = {
    note: 'Les heures classées de la plus chargée à la moins chargée.',
    colonnes: [{ titre: 'Rang', format: 'nombre' }, { titre: 'Part des heures', format: 'pct' }, { titre: 'kWh de l’heure', format: 'kwh' }, { titre: 'Part cumulée de l’énergie', format: 'pct' }],
    lignes: (() => {
      let c = 0;
      return valeursH.map((v, i) => {
        c += v;
        return [i + 1, (i + 1) / valeursH.length, v, totalKwh > 0 ? c / totalKwh : null];
      });
    })(),
  };
  const distribution: Tableau = (() => {
    const col = [{ titre: 'Classe (kWh par heure)', format: 'texte' as const }, { titre: 'Nombre d’heures', format: 'nombre' as const }, { titre: 'Part des heures', format: 'pct' as const }];
    if (valeursH.length < 2 || valeursH[0] <= valeursH[valeursH.length - 1]) return { colonnes: col, lignes: [] };
    const mn = valeursH[valeursH.length - 1];
    const pas = (valeursH[0] - mn) / 10;
    const n = Array.from({ length: 10 }, () => 0);
    for (const v of valeursH) n[Math.min(9, Math.floor((v - mn) / pas))]++;
    return { colonnes: col, lignes: n.map((c, i) => [`${nf(mn + i * pas, 2)} – ${nf(mn + (i + 1) * pas, 2)}`, c, c / valeursH.length]) };
  })();

  // ── Température ─────────────────────────────────────────────
  let temperature: Tableau | null = null;
  let correlation: number | null = null;
  if (e.temperatures && e.temperatures.size > 0) {
    const paires = joursRetenus.filter(j => e.temperatures!.has(j)).map(j => ({ j, t: e.temperatures!.get(j)!, k: parJour.get(j)!.kwh }));
    if (paires.length > 0) {
      temperature = {
        note: 'Température moyenne des capteurs du site, intérieurs et extérieurs confondus : un repère, pas une mesure météo.',
        colonnes: [{ titre: 'Jour', format: 'texte' }, { titre: 'Température moyenne (°C)', format: 'kwh' }, { titre: 'kWh', format: 'kwh' }],
        lignes: paires.map(p => [jjmm(p.j), p.t, p.k]),
      };
      if (paires.length >= 7) {
        const mt = moyenne(paires.map(p => p.t))!;
        const mk = moyenne(paires.map(p => p.k))!;
        const num = paires.reduce((s, p) => s + (p.t - mt) * (p.k - mk), 0);
        const den = Math.sqrt(paires.reduce((s, p) => s + (p.t - mt) ** 2, 0) * paires.reduce((s, p) => s + (p.k - mk) ** 2, 0));
        correlation = den > 0 ? num / den : null;
      }
    }
  }

  // ── Comparaison des sites ───────────────────────────────────
  let comparaisonSites: Tableau | null = null;
  const lignesSites: Parameters<typeof tableauComparaisonSites>[0] = [];
  if (sites.length > 1) {
    for (const site of sites) {
      const du = lignesP.filter(l => l.site === site);
      if (du.length === 0) continue;
      const heuresSite = new Set(du.filter(l => l.nbMesures > 0).map(l => l.ts.getTime()));
      const joursSite = new Set(du.filter(l => l.nbMesures > 0).map(l => cleUtc(l.ts)));
      const somme = (f: (h: number) => boolean) => du.filter(l => f(heureUtc(l.ts))).reduce((s, l) => s + l.wh, 0) / 1000;
      const compteurs = [...new Set(du.map(l => l.deviceId))];
      const voie = compteurs.length === 1 ? voieDe.get(compteurs[0]) : undefined;
      const bilanSite = e.nettoyage.sites.find(s => s.site === site);
      lignesSites.push({
        site, nature: bilanSite?.nature === 'consommation' ? 'Consommation' : bilanSite?.nature === 'reseau' ? 'Énergie réseau' : bilanSite?.nature === 'departs' ? 'Départs mesurés' : 'Mesuré',
        kwh: somme(() => true), jours: joursSite.size, heures: heuresSite.size,
        jourKwh: somme(dansJour), nuitKwh: somme(h => !dansJour(h)), soirKwh: somme(dansSoir),
        pMax: voie?.p_max ?? null, talon: voie?.talon_w ?? null,
      });
    }
    if (lignesSites.length > 1) comparaisonSites = tableauComparaisonSites(lignesSites);
  }

  // ── L'essentiel ─────────────────────────────────────────────
  // Compteur de référence : la série principale s'il n'y a qu'un compteur
  const reference = [...appareils.values()].filter(a => estPrincipal(a.id));
  const voiesRef = reference.map(a => voieDe.get(a.id)).filter((v): v is VoieMinute => !!v);
  const unSeul = reference.length === 1;
  const pic = unSeul ? voiesRef[0] : null;
  const talonW = unSeul ? voiesRef[0]?.talon_w ?? null : null;
  // Tension du site : seulement sur des compteurs à pinces. Sur une prise, relais et
  // appels de courant donnent des valeurs qui ne décrivent pas le réseau.
  const voiesTension = reference.filter(a => a.famille === 'ENERGIE_2PH' || a.famille === 'ENERGIE_3PH')
    .map(a => voieDe.get(a.id)).filter((v): v is VoieMinute => !!v);
  const vMin = voiesTension.length ? Math.min(...voiesTension.map(v => v.v_min ?? Infinity)) : null;
  const vMax = voiesTension.length ? Math.max(...voiesTension.map(v => v.v_max ?? -Infinity)) : null;
  const tensionConnue = vMin != null && vMax != null && Number.isFinite(vMin) && Number.isFinite(vMax);
  const fmtInstant = (s: string) => {
    const d = new Date(s);
    return `${FR_JOURS[d.getUTCDay()]} ${jjmm(cleUtc(d))} à ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };
  const essentiel: ChiffreCle[] = [
    { libelle: e.libellePrincipal, valeur: mesure ? totalKwh : null, unite: 'kWh', precision: mesure ? `Sur ${jours.length} jour${jours.length > 1 ? 's' : ''} avec mesures` : 'Non mesuré sur ce périmètre' },
    { libelle: 'Pic de puissance', valeur: pic?.p_max ?? null, unite: 'W', precision: pic?.heure_p_max ? fmtInstant(pic.heure_p_max) : (unSeul ? 'Relevés à la minute indisponibles' : 'Non donné : plusieurs compteurs de référence') },
    { libelle: `Consommation de fond (${t.talonDebut} h–${t.talonFin} h)`, valeur: talonW, unite: 'W', precision: talonW != null ? 'Médiane de la puissance la nuit, charges permanentes' : 'Non disponible' },
  ];
  if (tensionConnue) essentiel.push({ libelle: 'Tension minimale', valeur: vMin as number, unite: 'V', precision: `Maximale : ${nf(vMax as number)} V` });
  essentiel.push({
    libelle: 'Fiabilité des mesures', valeur: fiabilite ? fiabilite.pct * 100 : null, unite: '%',
    precision: fiabilite ? `Minutes où ${fiabilite.nom} = somme de ses circuits` : 'Non évaluée : aucun arbre de circuits déclaré sur ce périmètre',
  });
  essentiel.push({
    libelle: 'Heures mesurées', valeur: heures.length, unite: 'h',
    precision: heuresAttendues != null ? `Sur ${heuresAttendues} heures attendues (${heuresAttendues ? pc(heures.length / heuresAttendues) : '—'})` : 'Lignes du fichier',
  });

  // ── Constats : chacun a sa condition ────────────────────────
  const constats: string[] = [];
  const aVerifierAuto: string[] = [];
  if (comparaisonSites && totalKwh > 0) {
    const tri = [...lignesSites].sort((a, b) => b.kwh - a.kwh);
    constats.push(`${tri[0].site} pèse ${pc(tri[0].kwh / totalKwh)} de l'énergie des ${tri.length} sites (${nf(tri[0].kwh)} kWh).`);
  }
  const nbJoursOk = joursRetenus.length;
  if (mesure && totalKwh > 0 && nbJoursOk >= 3) {
    const kj = sommeSi(dansJour);
    constats.push(`Le jour (${t.jourDebut} h–${t.jourFin} h) concentre ${pc(kj / totalKwh)} de l'énergie, la nuit ${pc(1 - kj / totalKwh)}.`);
    const ks = sommeSi(dansSoir);
    const tempsSoir = nbHeuresPlage(t.soirDebut, t.soirFin) / 24;
    if (ks / totalKwh > tempsSoir * 1.2) constats.push(`La soirée (${t.soirDebut} h–${t.soirFin} h) pèse ${pc(ks / totalKwh)} de l'énergie pour ${pc(tempsSoir)} du temps.`);
    const pics24 = pTous.map((v, h) => ({ v, h })).filter((x): x is { v: number; h: number } => x.v != null).sort((a, b) => b.v - a.v);
    if (pics24.length >= 12) constats.push(`Heure la plus chargée en moyenne : ${libelleHeure(pics24[0].h)} (${nf(pics24[0].v, 2)} kWh) ; la moins chargée : ${libelleHeure(pics24[pics24.length - 1].h)} (${nf(pics24[pics24.length - 1].v, 2)} kWh).`);
  } else if (mesure && totalKwh <= 0) {
    constats.push(`${e.libellePrincipal} : aucune énergie comptée sur ce périmètre${e.retirerQuarantaine ? ', heures en quarantaine retirées' : ''}. Voir la feuille Qualité avant toute conclusion.`);
  } else if (mesure) {
    constats.push('Répartition jour / nuit : données insuffisantes (moins de 3 jours retenus).');
  }
  if (pic?.p_max != null && pic.heure_p_max) {
    constats.push(`Pic de puissance : ${nf(pic.p_max, 0)} W, ${fmtInstant(pic.heure_p_max)}.`);
    if (mesure && totalKwh > 0 && heures.length >= 24) {
      const moy = (totalKwh / heures.length) * 1000;
      constats.push(`Puissance moyenne ${nf(moy, 0)} W, soit ${pc(moy / pic.p_max)} du pic : ${moy / pic.p_max < 0.25 ? 'la charge est très concentrée sur quelques moments' : 'la charge est plutôt étalée dans le temps'}.`);
    }
  }
  if (talonW != null && talonW > 0 && mesure && nbJoursOk >= 3 && totalKwh > 0) {
    const kwhParJour = (talonW * 24) / 1000;
    const conso = totalKwh / jours.length;
    constats.push(`Consommation de fond d'environ ${nf(talonW, 0)} W, soit ${nf(kwhParJour)} kWh par jour et ${pc(kwhParJour / conso)} de la consommation : c'est ce qui consomme en permanence.`);
  }
  if (nbJoursOk >= 7) {
    const parDow = new Map<number, number[]>();
    for (const j of joursRetenus) parDow.set(jourSemaineUtc(j), [...(parDow.get(jourSemaineUtc(j)) ?? []), parJour.get(j)!.kwh]);
    const moy = [...parDow].filter(([, v]) => v.length >= 1).map(([d, v]) => ({ d, m: moyenne(v)! }));
    if (moy.length === 7) {
      const haut = moy.reduce((a, b) => (b.m > a.m ? b : a));
      const autres = moyenne(moy.filter(x => x.d !== haut.d).map(x => x.m))!;
      if (autres > 0 && haut.m / autres >= 1.3) constats.push(`Le ${FR_JOURS[haut.d]} consomme ${nf(haut.m / autres)} fois plus que la moyenne des autres jours.`);
    }
  }
  if (jours.length >= 14) {
    const derniers = jours.slice(-7).filter(j => !joursExclus.has(j));
    const avant = jours.slice(-14, -7).filter(j => !joursExclus.has(j));
    if (derniers.length >= 5 && avant.length >= 5) {
      const a = moyenne(derniers.map(j => parJour.get(j)!.kwh))!;
      const b = moyenne(avant.map(j => parJour.get(j)!.kwh))!;
      if (b > 0 && Math.abs(a / b - 1) >= 0.1) constats.push(`Sur les 7 derniers jours, la consommation a ${a > b ? 'augmenté' : 'baissé'} de ${pc(Math.abs(a / b - 1))} par rapport aux 7 jours précédents.`);
    }
  }
  if (triRep.length >= 3 && sommeRep > 0) {
    let c = 0;
    let n = 0;
    for (const r of triRep) { c += r.kwh; n++; if (c / sommeRep >= 0.8) break; }
    if (n < triRep.length) constats.push(`${n} usage${n > 1 ? 's' : ''} sur ${triRep.length} font ${pc(c / sommeRep)} de la consommation répartie ; le premier : ${triRep[0].libelle} (${pc(triRep[0].kwh / sommeRep)}).`);
  }
  if (avecPhases) {
    const d = desequilibre(totauxPhases);
    if (d != null && d >= 0.15) constats.push(`Phases déséquilibrées : A ${pc(totauxPhases.a / sommePhases)}, B ${pc(totauxPhases.b / sommePhases)}, C ${pc(totauxPhases.c / sommePhases)}.`);
  }
  if (tensionConnue) {
    const dansNorme = (vMin as number) >= 207 && (vMax as number) <= 253;
    constats.push(`Tension entre ${nf(vMin as number, 0)} et ${nf(vMax as number, 0)} V : ${dansNorme ? 'dans la plage usuelle de 230 V ± 10 %' : 'hors de la plage usuelle de 230 V ± 10 %, à vérifier'}.`);
    if (!dansNorme) aVerifierAuto.push(`Tension hors de 230 V ± 10 % : ${nf(vMin as number, 0)} à ${nf(vMax as number, 0)} V.`);
  }
  if (fiabilite) constats.push(`Fiabilité : sur ${fiabilite.minutes.toLocaleString('fr-FR')} minutes communes, ${fiabilite.nom} et ses circuits concordent ${pc(fiabilite.pct)} du temps.`);
  if (correlation != null && Math.abs(correlation) >= 0.5) {
    constats.push(`La consommation ${correlation > 0 ? 'monte' : 'baisse'} quand la température monte (corrélation ${nf(correlation, 2)}). Une corrélation ne prouve pas la cause.`);
  }

  // ── À vérifier : détecté automatiquement, à confirmer sur site ──
  const nonMesures = repartition.filter(r => r.libelle.endsWith('Non mesuré / écart'));
  for (const r of nonMesures) {
    if (r.part != null && Math.abs(r.part) >= 0.1) aVerifierAuto.push(`${r.libelle} : ${nf(r.kwh)} kWh, soit ${pc(Math.abs(r.part))} de l'arrivée : usage sans compteur, ou erreur de câblage ?`);
  }
  if (heuresAttendues != null && heuresAttendues > 0 && heures.length / heuresAttendues < 0.9) {
    aVerifierAuto.push(`Seulement ${pc(heures.length / heuresAttendues)} des heures attendues sont mesurées : coupure, ou compteur injoignable ?`);
  }
  for (const a of appareils.values()) {
    if (a.heures < 24) continue;
    const v = voieDe.get(a.id);
    const base = reference.reduce((s, x) => s + (x.site === a.site ? kwhDe(x) : 0), 0);
    // Une prise ou une lampe éteinte la nuit est normale : ces pistes ne valent que pour un circuit sur pinces
    const circuitSurPinces = a.famille === 'ENERGIE_2PH' || a.famille === 'ENERGIE_3PH';
    if (circuitSurPinces && !ROLES_PRODUCTION.has(a.role ?? '') && !estPrincipal(a.id) && base > 0 && kwhDe(a) / base < 0.002) {
      aVerifierAuto.push(`${a.nom} : presque rien mesuré (${nf(kwhDe(a), 2)} kWh). La pince est-elle sur le bon câble, ou le circuit est-il coupé ?`);
    }
    if (v?.p_min != null && v.p_min < -20) {
      aVerifierAuto.push(`${a.nom} : puissance négative jusqu'à ${nf(v.p_min, 0)} W. Pince inversée, ou faible retour hors allumage ?`);
    }
    if (circuitSurPinces && v?.talon_w != null && Math.abs(v.talon_w) < 1 && kwhDe(a) > 0.5 && a.role === 'DEPART') {
      aVerifierAuto.push(`${a.nom} : 0 W la nuit mais ${nf(kwhDe(a))} kWh sur la période. Ce profil correspond-il à ce que le circuit est censé alimenter ?`);
    }
  }

  // ── Contrôle ────────────────────────────────────────────────
  let controle: RapportAnalyses['controle'] = null;
  if (e.totalEcranKwh != null && mesure) {
    const ecart = totalKwh - e.totalEcranKwh;
    const ok = Math.abs(ecart) < Math.max(0.05, Math.abs(e.totalEcranKwh) * 0.001);
    controle = {
      ecartKwh: ecart, ok,
      texte: ok
        ? `Contrôle : le total par heures (${nf(totalKwh, 3)} kWh) retombe sur le total par jours de l'écran.`
        : `Écart à vérifier : le total par heures (${nf(totalKwh, 3)} kWh) diffère du total par jours (${nf(e.totalEcranKwh, 3)} kWh) de ${nf(ecart, 3)} kWh.`,
    };
    if (!ok) aVerifierAuto.unshift(controle.texte);
  }

  return {
    essentiel, constats, aVerifierAuto,
    aRetenir: e.aRetenir.trim(), aVerifier: e.aVerifier.trim(),
    controle, tranches, tranchesParType, profil24, profilCircuits, carte, horaire, voies, bilan, repartition, classement,
    pics, coherence, comparaisonSites,
    tcd: { mois, semaine, jourSemaine, typeJour, appareil, piece, phases },
    monotone, distribution, temperature, couvertureParJour,
  };
}
