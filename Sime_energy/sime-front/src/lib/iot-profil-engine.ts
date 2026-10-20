// ============================================================
// IOT MODULE — Moteur Profil de Charge Shelly 3EM
// Reproduit exactement les 50 colonnes du modèle Excel
// "2026-03-11-modèle export données Shelly 3EM.xlsx"
// ============================================================

import type { ShellyRow, ShellyAnalyse, JourFerie, JourAgrege, FluxRoles } from '@/components/iot/shared';
import type { MethodeConsommation, SiteBilan } from '@/lib/iot-supabase-service';
import type { Signalement, RegleQualite } from '@/lib/iot-qualite-service';
import { JOURS_SEMAINE_LONG, MOIS_FR, JOURS_FERIES_FIXES } from '@/components/iot/shared';

// ============================================================
// HELPERS CLASSIFICATION (jours d'activité, saisons, périodes climatiques)
// Pas de tarification ici : les coûts relèvent du module Facturation.
// ============================================================

/** Heures d'ensoleillement : 8h ≤ h < 19h */
function isEnsoleillement(heure: number): boolean {
  return heure >= 8 && heure < 19;
}

/** Heures de travail / activités : 8h ≤ h < 18h */
function isHeureActivite(heure: number): boolean {
  return heure >= 8 && heure < 18;
}

/**
 * Période de la journée
 * Nuit : 0h-5h59 | Matin : 6h-11h59 | Après-midi : 12h-17h59 | Soir : 18h-23h59
 */
function getPeriode(heure: number): ShellyRow['periode'] {
  if (heure < 6)  return 'Nuit';
  if (heure < 12) return 'Matin';
  if (heure < 18) return 'Après-midi';
  return 'Soir';
}

/** Saison climatique Sénégal : Jun-Oct = Hivernage, Nov-May = Sèche */
function getSaison(mois: number): ShellyRow['saison'] {
  return mois >= 6 && mois <= 10 ? 'Hivernage' : 'Sèche';
}

/** Période climatique : Oct-Avr = Fraîcheur, Mai-Sep = Chaude */
function getPeriodeClimatique(mois: number): ShellyRow['periodeclimatique'] {
  const fraicheur = mois <= 4 || mois >= 10;
  return fraicheur ? 'Période de fraîcheur' : 'Période chaude';
}

/** Convertit en nombre si la valeur est exploitable, sinon undefined (pour ne pas afficher 0 pour un capteur qui n'a jamais remonté cette donnée) */
function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

// ============================================================
// PARSE UNE LIGNE SHELLY depuis données brutes
// Format attendu: Temps | Wh_Phase A | Wh_Phase B | Wh_Phase C | Wh_Total |
//                 Wh_Retour Ph. A | Wh_Retour Ph. B | Wh_Retour Ph. C | Wh_Retour Total
// ============================================================

export function parseShellyRow(
  raw: Record<string, unknown>,
  joursFerier: JourFerie[] = [],
): ShellyRow | null {
  const parseNum = (v: unknown): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  // Trouver la colonne date/temps (recherche insensible à la casse)
  const DATE_KEYS = [
    'Temps', 'temps', 'TEMPS', 'Date', 'date', 'DATE',
    ' Temps', 'Time', 'time', 'TIME', 'DateTime', 'datetime', 'DATETIME',
    'timestamp', 'Timestamp', 'TIMESTAMP',
  ];
  let dateRaw: unknown =
    DATE_KEYS.reduce<unknown>((found, k) => found ?? raw[k], undefined);
  // Fallback : chercher toute clé contenant 'temps', 'date' ou 'time'
  if (dateRaw === undefined || dateRaw === null) {
    const key = Object.keys(raw).find(k => {
      const l = k.toLowerCase().replace(/[\uFEFF\u200B]/g, '').trim();
      return l === 'temps' || l === 'date' || l === 'time'
        || l.includes('timestamp') || l.includes('datetime')
        || l.includes('temps') || l.startsWith('time');
    });
    if (key) dateRaw = raw[key];
  }

  if (!dateRaw) return null;

  let date: Date;
  if (dateRaw instanceof Date) {
    date = dateRaw;
  } else {
    const s = String(dateRaw).trim();
    // Essayer DD/MM/YYYY ou DD-MM-YYYY (format français/africain)
    const ddmm = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmm) {
      const [, dd, mm, yy, hh = '0', min = '0', ss = '0'] = ddmm;
      const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
      date = new Date(year, parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min), parseInt(ss));
    } else {
      date = new Date(s);
    }
    if (isNaN(date.getTime())) return null;
  }

  // ---- Énergie en Wh ----
  const whPhaseA = Math.abs(parseNum(
    raw['Wh_\uFEFF\uFEFFPhase A'] ?? raw['Wh_Phase A'] ?? raw['WH_A'] ?? raw['phase_a_wh'] ?? 0
  ));
  const whPhaseB = Math.abs(parseNum(
    raw['Wh_\uFEFF\uFEFFPhase B'] ?? raw['Wh_Phase B'] ?? raw['WH_B'] ?? raw['phase_b_wh'] ?? 0
  ));
  const whPhaseC = Math.abs(parseNum(
    raw['Wh_\uFEFF\uFEFFPhase C'] ?? raw['Wh_Phase C'] ?? raw['WH_C'] ?? raw['phase_c_wh'] ?? 0
  ));
  const whTotalRaw = parseNum(raw['Wh_Total'] ?? raw['WH_Total'] ?? raw['total_wh'] ?? 0);
  const whTotal = whTotalRaw > 0 ? whTotalRaw : whPhaseA + whPhaseB + whPhaseC;

  // ---- Retour réseau ----
  const whRetourA = Math.abs(parseNum(raw['Wh_Retour Ph. A'] ?? raw['Retour_A'] ?? 0));
  const whRetourB = Math.abs(parseNum(raw['Wh_Retour Ph. B'] ?? raw['Retour_B'] ?? 0));
  const whRetourC = Math.abs(parseNum(raw['Wh_Retour Ph. C'] ?? raw['Retour_C'] ?? 0));
  const whRetourTotalRaw = Math.abs(parseNum(raw['Wh_Retour Total'] ?? raw['Retour_Total'] ?? 0));
  const whRetourTotal = whRetourTotalRaw > 0 ? whRetourTotalRaw : whRetourA + whRetourB + whRetourC;

  // ---- kWh (÷ 1000) ----
  const kwhA = whPhaseA / 1000;
  const kwhB = whPhaseB / 1000;
  const kwhC = whPhaseC / 1000;
  const kwhTotal = whTotal / 1000;
  const kwhRetourA = whRetourA / 1000;
  const kwhRetourB = whRetourB / 1000;
  const kwhRetourC = whRetourC / 1000;
  const kwhRetourTotal = whRetourTotal / 1000;

  // ---- Consommation nette ----
  const kwhNet = Math.max(0, kwhTotal - kwhRetourTotal);

  // ---- Puissances moyennes kW = kWh / 24 h (données journalières) ----
  const puissKwA = kwhA / 24;
  const puissKwB = kwhB / 24;
  const puissKwC = kwhC / 24;
  const puissKwTotal = kwhTotal / 24;
  const puissKwRetourA = kwhRetourA / 24;
  const puissKwRetourB = kwhRetourB / 24;
  const puissKwRetourC = kwhRetourC / 24;
  const puissKwRetourTotal = kwhRetourTotal / 24;

  // ---- Qualificatifs date ----
  const dayOfWeek = date.getDay(); // 0=Dim, 6=Sam
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dayOfWeek];
  const moisNum = date.getMonth() + 1; // 1-12
  const heure = date.getHours();

  // Jour férié
  const dateStr = `${date.getFullYear()}-${moisNum}-${date.getDate()}`;
  const isJourFerie = joursFerier.some(jf => {
    const jfStr = `${jf.date.getFullYear()}-${jf.date.getMonth() + 1}-${jf.date.getDate()}`;
    return jfStr === dateStr && jf.actif;
  }) || JOURS_FERIES_FIXES.some(jf =>
    jf.mois === moisNum && jf.jour === date.getDate()
  );

  const jourActivites: ShellyRow['jourActivites'] =
    isJourFerie ? 'Jour férié' : isWeekend ? 'Weekend' : 'Jour ouvré';

  const heuresEnsoleillement: ShellyRow['heuresEnsoleillement'] =
    isEnsoleillement(heure) ? 'En ensoleillement' : 'Hors ensoleillement';

  const heuresTravail: ShellyRow['heuresTravail'] =
    isHeureActivite(heure) ? "Heures d'activités" : 'Heures hors activités';

  const periodeclimatique = getPeriodeClimatique(moisNum);
  const saison = getSaison(moisNum);
  const periode = getPeriode(heure);
  const profil: ShellyRow['profil'] = kwhNet >= kwhRetourTotal ? 'CHARGE' : 'SOUTIRAGE';

  return {
    date,
    whPhaseA, whPhaseB, whPhaseC, whTotal,
    whRetourA, whRetourB, whRetourC, whRetourTotal,
    kwhA, kwhB, kwhC, kwhTotal,
    kwhRetourA, kwhRetourB, kwhRetourC, kwhRetourTotal,
    // Cumulative — calculated in analyserDonneesShelly
    kwhCumA: 0, kwhCumB: 0, kwhCumC: 0, kwhCumTotal: 0,
    kwhCumRetourA: 0, kwhCumRetourB: 0, kwhCumRetourC: 0, kwhCumRetourTotal: 0,
    puissKwA, puissKwB, puissKwC, puissKwTotal,
    puissKwRetourA, puissKwRetourB, puissKwRetourC, puissKwRetourTotal,
    // Classifieurs
    jour: JOURS_SEMAINE_LONG[dayOfWeek],
    mois: MOIS_FR[date.getMonth()],
    annee: date.getFullYear(),
    jourActivites,
    heuresEnsoleillement,
    heuresTravail,
    periodeclimatique,
    saison,
    periode,
    profil,
    // Helpers
    kwhNet,
    isWeekend,
    isJourFerie,
    jourSemaine,
    // Identité appareil (préservée si présente dans la source)
    nomAppareil:    (raw['Appareil'] ?? raw['Nom'] ?? raw['name'] ?? raw['nomAppareil'] ?? raw['device_name']) as string | undefined,
    deviceId:       (raw['__deviceId'] ?? raw['device_id'] ?? raw['deviceId']) as string | undefined,
    deviceLocation: (raw['Emplacement'] ?? raw['Site'] ?? raw['site'] ?? raw['deviceLocation']) as string | undefined,
    deviceRoom:     (raw['Piece'] ?? raw['Pièce'] ?? raw['Room'] ?? raw['room'] ?? raw['deviceRoom']) as string | undefined,
    // Capteurs environnementaux (préservés si présents dans la source — colonnes PROFIL Mi)
    temperature:      numOrUndef(raw['Temperature']),
    humidite:         numOrUndef(raw['Humidite']),
    ressenti:         numOrUndef(raw['Ressenti']),
    pointRosee:       numOrUndef(raw['Point_Rosee']),
    uvIndex:          numOrUndef(raw['UV_Index']),
    luminosite:       numOrUndef(raw['Luminosite']),
    pression:         numOrUndef(raw['Pression']),
    tendancePression: (raw['Tendance_Pression'] ?? undefined) as string | undefined,
    precipitation:    numOrUndef(raw['Precipitation']),
    precipitationIncr: numOrUndef(raw['Precipitation_Incr']),
    mesureAt:         (() => { const v = raw['Mesure_Le']; if (!v) return undefined; const d = v instanceof Date ? v : new Date(String(v)); return isNaN(d.getTime()) ? undefined : d; })(),
    alarmeHumidite:   typeof raw['Alarme_Humidite'] === 'boolean' ? raw['Alarme_Humidite'] as boolean : undefined,
    ventVitesse:      numOrUndef(raw['Vent_Vitesse']),
    ventRafale:       numOrUndef(raw['Vent_Rafale']),
    ventDirection:    numOrUndef(raw['Vent_Direction']),
    etatCapteur:      (raw['Etat_Capteur'] ?? undefined) as string | undefined,
    angleInclinaison: numOrUndef(raw['Angle_Inclinaison']),
    concentrationGaz: numOrUndef(raw['Concentration_Gaz']),
    tempInterne:      numOrUndef(raw['Temp_Interne']),
    batterie:         numOrUndef(raw['Batterie']),
    batterieV:        numOrUndef(raw['Batterie_V']),
    signal:           numOrUndef(raw['Signal']),
  };
}

// ============================================================
// POST-TRAITEMENT — Calcul des cumuls après tri par date
// ============================================================

function toDateSafe(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export function ajouterCumulatifs(rows: ShellyRow[]): ShellyRow[] {
  // Trier par date croissante
  const sorted = [...rows].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime());
  let cumA = 0, cumB = 0, cumC = 0, cumTotal = 0;
  let cumRA = 0, cumRB = 0, cumRC = 0, cumRTotal = 0;

  return sorted.map(r => {
    cumA     += r.kwhA;
    cumB     += r.kwhB;
    cumC     += r.kwhC;
    cumTotal += r.kwhTotal;
    cumRA    += r.kwhRetourA;
    cumRB    += r.kwhRetourB;
    cumRC    += r.kwhRetourC;
    cumRTotal += r.kwhRetourTotal;
    return {
      ...r,
      kwhCumA: cumA,
      kwhCumB: cumB,
      kwhCumC: cumC,
      kwhCumTotal: cumTotal,
      kwhCumRetourA: cumRA,
      kwhCumRetourB: cumRB,
      kwhCumRetourC: cumRC,
      kwhCumRetourTotal: cumRTotal,
    };
  });
}

// ============================================================
// ANALYSE COMPLÈTE — Calculs agrégés
// ============================================================

/**
 * Regroupe les lignes par journée calendaire. Une ligne n'est pas un jour :
 * la source Supabase en donne une par appareil et par jour, un fichier peut
 * en donner une par heure. Sans ce regroupement, nbJours, moyenne, max et min
 * étaient calculés par ligne.
 */
export function sommerParJour(rows: ShellyRow[], heuresParJour = 24): JourAgrege[] {
  const jours = new Map<string, JourAgrege>();
  for (const r of rows) {
    const key = cleJour(r.date);
    const d = toDateSafe(r.date);
    let j = jours.get(key);
    if (!j) {
      j = {
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        mois: r.mois, annee: r.annee,
        jourActivites: r.jourActivites, isWeekend: r.isWeekend, isJourFerie: r.isJourFerie,
        kwhA: 0, kwhB: 0, kwhC: 0, kwhTotal: 0, kwhRetourTotal: 0, kwhNet: 0,
        puissKwA: 0, puissKwB: 0, puissKwC: 0, puissKwTotal: 0,
        nbLignes: 0,
      };
      jours.set(key, j);
    }
    j.kwhA += r.kwhA ?? 0;
    j.kwhB += r.kwhB ?? 0;
    j.kwhC += r.kwhC ?? 0;
    j.kwhTotal += r.kwhTotal ?? 0;
    j.kwhRetourTotal += r.kwhRetourTotal ?? 0;
    j.kwhNet += r.kwhNet ?? 0;
    if (r.flux) j.flux = ajouterFlux(j.flux, r.flux);
    j.nbLignes++;
  }
  return [...jours.values()]
    .map(j => ({
      ...j,
      // Puissance moyenne sur les heures analysées (24, ou la plage De/À)
      puissKwA: j.kwhA / heuresParJour, puissKwB: j.kwhB / heuresParJour, puissKwC: j.kwhC / heuresParJour,
      puissKwTotal: j.kwhTotal / heuresParJour,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Somme de deux jeux de flux ; null + null reste null (rien mesuré). */
export function ajouterFlux(a: FluxRoles | undefined, b: FluxRoles): FluxRoles {
  const plus = (x: number | null | undefined, y: number | null) =>
    x == null ? y : y == null ? x : x + y;
  return {
    reseauSoutire: plus(a?.reseauSoutire, b.reseauSoutire),
    reseauInjecte: plus(a?.reseauInjecte, b.reseauInjecte),
    pv: plus(a?.pv, b.pv),
    groupe: plus(a?.groupe, b.groupe),
    charge: plus(a?.charge, b.charge),
    departs: plus(a?.departs, b.departs),
  };
}

/** Clé de jour calendaire local, stable entre sources (Date ou chaîne). */
export function cleJour(v: unknown): string {
  const d = toDateSafe(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param joursExclus clé jour → raison. Ces jours restent dans les totaux
 *   mais sortent de la moyenne, du min, du max et des moyennes par type de jour.
 */
export function analyserDonneesShelly(
  rows: ShellyRow[],
  joursExclus: Map<string, string> = new Map(),
  heuresParJour = 24,
): ShellyAnalyse {
  if (rows.length === 0) {
    return {
      rows: [],
      parJour: [],
      nbJoursRetenus: 0,
      totalKwhConsomme: 0, totalKwhRetour: 0, totalKwhNet: 0,
      moyenneJournaliere: 0, maxJournalier: 0, minJournalier: 0,
      nbJours: 0,
      parMois: {},
      jourOuvre: { kwhMoyen: 0, nbJours: 0 },
      weekend: { kwhMoyen: 0, nbJours: 0 },
      ferieOuDimanche: { kwhMoyen: 0, nbJours: 0 },
    };
  }

  // Calculer cumuls
  const rowsAvecCumuls = ajouterCumulatifs(rows);

  // Totaux
  const totalKwhConsomme = rowsAvecCumuls.reduce((s, r) => s + r.kwhTotal, 0);
  const totalKwhRetour   = rowsAvecCumuls.reduce((s, r) => s + r.kwhRetourTotal, 0);
  const totalKwhNet      = rowsAvecCumuls.reduce((s, r) => s + r.kwhNet, 0);
  // Moyenne, extremums et types de jour se calculent sur les journées, pas sur les lignes
  const parJour = sommerParJour(rowsAvecCumuls, heuresParJour)
    .map(j => ({ ...j, exclu: joursExclus.get(cleJour(j.date)) }));
  const nbJours = parJour.length;
  const retenus = parJour.filter(j => !j.exclu);
  const moyenneJournaliere = retenus.length > 0 ? retenus.reduce((s, j) => s + j.kwhNet, 0) / retenus.length : 0;
  const maxJournalier = retenus.length > 0 ? Math.max(...retenus.map(j => j.kwhNet)) : 0;
  const minJournalier = retenus.length > 0 ? Math.min(...retenus.map(j => j.kwhNet)) : 0;

  // Par mois
  const parMois: ShellyAnalyse['parMois'] = {};
  for (const j of parJour) {
    const key = `${j.mois} ${j.annee}`;
    if (!parMois[key]) parMois[key] = { kwhTotal: 0, kwhNet: 0, kwhRetour: 0, nbJours: 0 };
    parMois[key].kwhTotal  += j.kwhTotal;
    parMois[key].kwhNet    += j.kwhNet;
    parMois[key].kwhRetour += j.kwhRetourTotal;
    parMois[key].nbJours++;
  }

  // Par type de jour
  const joursOuvres  = retenus.filter(j => j.jourActivites === 'Jour ouvré');
  const weekendRows  = retenus.filter(j => j.jourActivites === 'Weekend');
  const feriesRows   = retenus.filter(j => j.jourActivites === 'Jour férié');

  const avg = (arr: JourAgrege[]) =>
    arr.length > 0 ? arr.reduce((s, j) => s + j.kwhNet, 0) / arr.length : 0;

  return {
    rows: rowsAvecCumuls,
    parJour,
    nbJoursRetenus: retenus.length,
    totalKwhConsomme, totalKwhRetour, totalKwhNet,
    moyenneJournaliere, maxJournalier, minJournalier, nbJours,
    parMois,
    jourOuvre: { kwhMoyen: avg(joursOuvres), nbJours: joursOuvres.length },
    weekend:   { kwhMoyen: avg(weekendRows),  nbJours: weekendRows.length },
    ferieOuDimanche: { kwhMoyen: avg(feriesRows), nbJours: feriesRows.length },
  };
}


// ============================================================
// NETTOYAGE DU PROFIL DE CHARGE
// Aucune règle de qualité ici : elles vivent en base (qualite_regles) et
// sont évaluées par fn_qualite (lib/iot-qualite-service.ts). Aucune façon
// de calculer la consommation non plus : elle est déclarée par site dans
// site_bilan. Ce module applique seulement ces déclarations et les choix
// de l'utilisateur :
//  - soustraire ou non la part en quarantaine ;
//  - écarter des statistiques journalières les jours signalés incomplets ;
//  - bilan par rôle : consommation selon la méthode du site, flux mesurés
//    (réseau, PV, groupe, départs) affichés à part, jamais additionnés
//    entre eux.
// La base n'est jamais modifiée, rien n'est extrapolé, tout ce qui est
// écarté est listé avec sa raison.
// ============================================================

export interface OptionsNettoyage {
  /** Écarter de la moyenne, du min et du max les jours signalés JOUR_INCOMPLET */
  completude: boolean;
  /** Masquer du détail les appareils à 0 sur toute la période */
  masquerZeros: boolean;
  /** Soustraire l'énergie des heures en quarantaine (fn_qualite) */
  quarantaine: boolean;
  /** Méthode de consommation de chaque site (table site_bilan) */
  sitesBilan?: SiteBilan[];
  /** Période demandée ('YYYY-MM-DD'), pour lister les jours sans aucune donnée */
  periode?: { debut: string; fin: string };
  aujourdhui?: Date;
}

/** Signalements d'une règle, regroupés pour l'affichage. */
export interface GroupeSignalements {
  regle: string;
  libelle: string;
  explication: string;
  action: string;
  plages: Signalement[];
  heures: number;
  kwh: number;
  appareils: string[];
}

export interface JourControle {
  cle: string;
  exclu?: string;        // raison de l'exclusion des statistiques
  coupureMin: number;
  repriseKwh: number;
  incoherence?: string;
}

/** Ce que la série principale représente, site par site. */
export type NaturePrincipale = 'consommation' | 'reseau' | 'departs' | 'lignes' | 'aucune';

export interface BilanSite {
  site: string;
  methode: MethodeConsommation | 'non_declaree';
  explication: string;
  nature: NaturePrincipale;
  /** Pourquoi la série n'est pas la consommation, quand c'est le cas */
  raison?: string;
  flux: FluxRoles;
  principal: number;             // kWh de la série principale sur la période
  nonMesure: number | null;      // consommation − départs, si la consommation est connue
}

export interface RapportNettoyage {
  rowsCalcul: ShellyRow[];        // une ligne par jour (bilan) ou les lignes du fichier
  rowsAffichage: ShellyRow[];     // lignes du détail
  joursExclus: Map<string, string>;
  jours: JourControle[];
  joursSansDonnee: string[];
  referenceCompletude: string[];  // appareils dont la complétude décide d'un jour
  sites: BilanSite[];             // vide pour un fichier importé
  nature: NaturePrincipale;       // nature commune de la série principale, ou 'aucune' si mélange
  horsTotal: string[];            // appareils mesurés mais hors de la série principale
  idsHorsTotal: Set<string>;
  fluxTotal: FluxRoles | null;    // null pour un fichier importé
  appareilsMasques: string[];
  kwhQuarantaine: number;
  groupes: GroupeSignalements[];
}

const FLUX_VIDE: FluxRoles = { reseauSoutire: null, reseauInjecte: null, pv: null, groupe: null, charge: null, departs: null };

/** Retire d'une ligne la part en quarantaine (champs kWh bruts → nets). */
function sansQuarantaine(r: ShellyRow): ShellyRow {
  const q = r.quarantaine;
  if (!q || q.heures === 0) return r;
  const kwhTotal = Math.max(0, r.kwhTotal - q.kwh);
  const kwhRetourTotal = Math.max(0, r.kwhRetourTotal - q.kwhRetour);
  return {
    ...r,
    kwhTotal, kwhRetourTotal,
    kwhA: Math.max(0, r.kwhA - q.kwhA), kwhB: Math.max(0, r.kwhB - q.kwhB), kwhC: Math.max(0, r.kwhC - q.kwhC),
    whTotal: kwhTotal * 1000, whRetourTotal: kwhRetourTotal * 1000,
    kwhNet: Math.max(0, kwhTotal - kwhRetourTotal),
  };
}

/** Flux par rôle d'un ensemble de lignes (sens inverse déjà appliqué par fn_profil_charge). */
function fluxDe(lignes: ShellyRow[]): FluxRoles {
  const somme = (role: string, f: (r: ShellyRow) => number) => {
    const l = lignes.filter(r => r.role === role);
    return l.length ? l.reduce((s, r) => s + f(r), 0) : null;
  };
  return {
    reseauSoutire: somme('M1_RESEAU', r => r.kwhTotal),
    reseauInjecte: somme('M1_RESEAU', r => r.kwhRetourTotal),
    // Production PV : l'énergie qui SORT du champ PV, c.-à-d. son injection
    // une fois le sens du TC corrigé (PV_BUILDING est déclaré en sens inverse)
    pv: somme('M5_PV', r => r.kwhRetourTotal),
    groupe: somme('M4_GROUPE', r => r.kwhTotal),
    charge: somme('M3_CHARGE', r => r.kwhTotal),
    departs: somme('DEPART', r => r.kwhTotal),
  };
}

const ROLE_DE_NATURE: Record<string, string | null> = {
  arrivee: 'M1_RESEAU', charge_M3: 'M3_CHARGE', departs: 'DEPART', reseau: 'M1_RESEAU',
};

export function nettoyerProfil(
  rowsBruts: ShellyRow[],
  signalements: Signalement[],
  regles: RegleQualite[],
  opts: OptionsNettoyage,
): RapportNettoyage {
  const nomDe = (r: ShellyRow) => r.nomAppareil ?? r.deviceId ?? '?';
  const idDe = (r: ShellyRow) => r.deviceId ?? nomDe(r);
  const siteDe = (r: ShellyRow) => r.deviceLocation ?? '';
  const regleDe = new Map(regles.map(rg => [rg.code, rg]));

  // ── Quarantaine (décidée par fn_qualite) ───────────────────
  const kwhQuarantaine = opts.quarantaine
    ? rowsBruts.reduce((s, r) => s + (r.quarantaine?.kwh ?? 0), 0)
    : 0;
  const rows = opts.quarantaine ? rowsBruts.map(sansQuarantaine) : rowsBruts;

  // ── Bilan par rôle (données Supabase : les lignes portent un rôle) ──
  const avecRoles = rows.some(r => r.role);
  const methodeDe = new Map((opts.sitesBilan ?? []).map(b => [b.site, b]));
  const sites: BilanSite[] = [];
  const idsPrincipaux = new Set<string>();
  // nature retenue par site, constante sur la période (on ne mélange pas
  // consommation un jour et énergie réseau le lendemain)
  const natureSite = new Map<string, NaturePrincipale>();

  // Jours où un compteur émet mais mesure 0 (règle ZERO_ARRIVEE, « Compteur
  // principal à zéro ») : une plage peut couvrir plusieurs jours
  const joursZero = new Map<string, Set<string>>();   // device_id → clés de jour
  for (const sg of signalements) {
    if (sg.regle !== 'ZERO_ARRIVEE' || !sg.device_id) continue;
    const set = joursZero.get(sg.device_id) ?? new Set<string>();
    const d = new Date(sg.debut);
    const fin = new Date(sg.fin);
    for (; d < fin; d.setHours(d.getHours() + 1)) set.add(cleJour(d));
    joursZero.set(sg.device_id, set);
  }
  const estZero = (r: ShellyRow) => !!r.deviceId && Math.abs(r.kwhTotal) < 0.0005 && !!joursZero.get(r.deviceId)?.has(cleJour(r.date));

  if (avecRoles) {
    for (const site of [...new Set(rows.map(siteDe))].sort()) {
      const lignes = rows.filter(r => siteDe(r) === site);
      const decl = methodeDe.get(site);
      const flux = fluxDe(lignes);
      let nature: NaturePrincipale;
      let raison: string | undefined;
      const methode = decl?.methode;
      if (methode === 'arrivee' && flux.reseauSoutire != null) nature = 'consommation';
      else if (methode === 'charge_M3' && flux.charge != null) nature = 'consommation';
      else if (methode === 'departs' && flux.departs != null) nature = 'consommation';
      else {
        raison = !decl
          ? (site
            ? 'méthode de consommation non déclarée pour ce site (site_bilan)'
            // Fichier importé (pas de site) : production seule, par exemple
            : 'aucune consommation dans ce fichier')
          : methode === 'indeterminee'
            ? decl.explication
            : `${methode === 'arrivee' ? "l'arrivée" : methode === 'charge_M3' ? 'le compteur de charge M3' : 'les départs'} n'a aucune mesure sur la période`;
        // Repli honnête : ce qui est mesuré, nommé pour ce que c'est
        nature = flux.reseauSoutire != null ? 'reseau' : flux.departs != null ? 'departs' : 'aucune';
      }
      // Le compteur de la série principale émet mais mesure 0 tous les jours :
      // ce n'est pas une consommation nulle, c'est une mesure absente
      const roleConso = nature === 'consommation' ? ROLE_DE_NATURE[methode!] : null;
      const lignesConso = roleConso ? lignes.filter(r => r.role === roleConso) : [];
      if (lignesConso.length > 0 && lignesConso.every(estZero)) {
        nature = 'aucune';
        raison = `${lignesConso[0].nomAppareil ?? roleConso} émet mais mesure 0 sur toute la période (règle « Compteur principal à zéro ») : consommation non mesurée`;
      }
      natureSite.set(site, nature);
      const role = nature === 'consommation' ? ROLE_DE_NATURE[methode!] : nature === 'aucune' ? null : ROLE_DE_NATURE[nature];
      for (const r of lignes) if (role && r.role === role) idsPrincipaux.add(idDe(r));
      const principal = lignes.filter(r => role && r.role === role).reduce((s, r) => s + r.kwhTotal, 0);
      sites.push({
        site, methode: decl?.methode ?? 'non_declaree', explication: decl?.explication ?? '',
        nature, raison, flux, principal,
        // « Non mesuré » = consommation − départs, seulement si l'arrivée alimente
        // tous les départs (méthode arrivee). À l'Académie, les départs sont sur
        // une autre arrivée (bureau, Woyofal) : la soustraction n'aurait pas de sens.
        nonMesure: nature === 'consommation' && methode === 'arrivee' && flux.departs != null ? principal - flux.departs : null,
      });
    }
  }

  // Série principale : une ligne par jour (sites additionnés), ou les lignes
  // du fichier telles quelles (pas de rôles : on ne peut rien distinguer)
  let rowsCalcul: ShellyRow[];
  if (avecRoles) {
    const parJourAvec = new Map<string, ShellyRow[]>();
    for (const r of rows) {
      const k = cleJour(r.date);
      if (!parJourAvec.has(k)) parJourAvec.set(k, []);
      parJourAvec.get(k)!.push(r);
    }
    rowsCalcul = [...parJourAvec.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, lignes]) => {
      const contrib = lignes.filter(r => idsPrincipaux.has(idDe(r)));
      const somme = (f: (r: ShellyRow) => number) => contrib.reduce((s, r) => s + f(r), 0);
      const kwhTotal = somme(r => r.kwhTotal);
      const flux = fluxDe(lignes);
      const injecte = flux.reseauInjecte ?? 0;
      const base = lignes[0];
      return {
        ...base,
        nomAppareil: 'Bilan du site', deviceId: undefined, role: undefined, quarantaine: undefined,
        deviceRoom: undefined, deviceFamily: undefined,
        kwhTotal, kwhNet: kwhTotal, kwhRetourTotal: injecte,
        kwhA: somme(r => r.kwhA), kwhB: somme(r => r.kwhB), kwhC: somme(r => r.kwhC),
        whTotal: kwhTotal * 1000, whRetourTotal: injecte * 1000,
        whPhaseA: somme(r => r.whPhaseA), whPhaseB: somme(r => r.whPhaseB), whPhaseC: somme(r => r.whPhaseC),
        puissKwTotal: somme(r => r.puissKwTotal),
        puissKwA: somme(r => r.puissKwA), puissKwB: somme(r => r.puissKwB), puissKwC: somme(r => r.puissKwC),
        profil: 'CHARGE',
        flux,
      } as ShellyRow;
    });
  } else {
    rowsCalcul = rows;
  }

  const natures = [...new Set(sites.map(s => s.nature))];
  const nature: NaturePrincipale = !avecRoles ? 'lignes' : natures.length === 1 ? natures[0] : 'aucune';

  const nomsHorsTotal = new Map<string, string>();
  if (avecRoles) {
    for (const r of [...rows].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime())) {
      if (!idsPrincipaux.has(idDe(r))) nomsHorsTotal.set(idDe(r), nomDe(r));
    }
  }

  // ── Signalements par jour ──────────────────────────────────
  const parJourRegle = new Map<string, Signalement[]>();
  for (const sg of signalements) {
    const k = `${cleJour(sg.debut)}|${sg.regle}`;
    if (!parJourRegle.has(k)) parJourRegle.set(k, []);
    parJourRegle.get(k)!.push(sg);
  }
  const duJour = (cle: string, regle: string) => parJourRegle.get(`${cle}|${regle}`) ?? [];

  // Référence de complétude : le ou les compteurs qui font la série
  // principale (arrivée, M3) ; pour des départs, tout appareil continu —
  // fn_qualite ne signale JOUR_INCOMPLET que pour ceux-là.
  const compteurs = new Map(rows
    .filter(r => idsPrincipaux.has(idDe(r)) && (r.role === 'M1_RESEAU' || r.role === 'M3_CHARGE'))
    .map(r => [idDe(r), nomDe(r)]));
  const referenceIds = compteurs.size > 0 ? new Set(compteurs.keys()) : null;

  const parCle = new Map<string, ShellyRow[]>();
  for (const r of rows) {
    const k = cleJour(r.date);
    if (!parCle.has(k)) parCle.set(k, []);
    parCle.get(k)!.push(r);
  }

  const cleAujourdhui = cleJour(opts.aujourdhui ?? new Date());
  const jours: JourControle[] = [];
  for (const cle of [...parCle.keys()].sort()) {
    const lignes = parCle.get(cle)!;
    const coupureMin = duJour(cle, 'COUPURE').reduce((s, sg) => s + (sg.valeur ?? 0), 0);
    const repriseKwh = duJour(cle, 'REPRISE').reduce((s, sg) => s + (sg.kwh ?? 0), 0);

    let exclu: string | undefined;
    if (opts.completude) {
      const incomplets = duJour(cle, 'JOUR_INCOMPLET')
        .filter(sg => sg.device_id && (!referenceIds || referenceIds.has(sg.device_id)));
      const absents = referenceIds
        ? [...referenceIds].filter(id => !lignes.some(l => idDe(l) === id)).map(id => `${compteurs.get(id)} absent`)
        : [];
      const aZero = lignes.filter(l => idsPrincipaux.has(idDe(l)) && estZero(l));
      if (cle === cleAujourdhui || incomplets.some(sg => sg.detail?.en_cours === true)) {
        exclu = 'journée en cours';
      } else if (aZero.length > 0) {
        exclu = `${aZero.map(nomDe).join(', ')} à 0 alors qu'il émet (compteur principal à zéro)`;
      } else if (incomplets.length > 0 || absents.length > 0) {
        exclu = 'incomplet : ' + [
          ...incomplets.map(sg => {
            const d = sg.detail ?? {};
            const h = Number(d.heures_presentes ?? 0) + Number(d.heures_coupees ?? 0);
            return `${sg.nom ?? sg.device_id} ${h} h/${d.heures_attendues ?? '?'}`;
          }),
          ...absents,
        ].join(', ');
      }
    }

    const incoherence = duJour(cle, 'DEPARTS_SUP_ARRIVEE')
      .map(sg => `${sg.site} : départs ${Number(sg.detail?.kwh_departs ?? 0).toFixed(2)} kWh > arrivée ${Number(sg.detail?.kwh_arrivee ?? 0).toFixed(2)} kWh`)
      .join(' ; ') || undefined;

    jours.push({ cle, exclu, coupureMin, repriseKwh, incoherence });
  }

  const joursSansDonnee: string[] = [];
  if (opts.periode) {
    const d = new Date(`${opts.periode.debut}T00:00:00`);
    const fin = new Date(`${opts.periode.fin}T00:00:00`);
    for (; d <= fin; d.setDate(d.getDate() + 1)) {
      const k = cleJour(d);
      if (!parCle.has(k) && k <= cleAujourdhui) joursSansDonnee.push(k);
    }
  }

  // ── Appareils à 0 sur toute la période (bruit dans le détail) ──
  const energieParApp = new Map<string, { nom: string; kwh: number }>();
  for (const r of rows) {
    const id = idDe(r);
    const e = energieParApp.get(id) ?? { nom: nomDe(r), kwh: 0 };
    e.kwh += Math.abs(r.kwhTotal) + Math.abs(r.kwhRetourTotal);
    energieParApp.set(id, e);
  }
  const idsMasques = new Set(
    opts.masquerZeros ? [...energieParApp].filter(([, e]) => e.kwh < 0.0005).map(([id]) => id) : [],
  );

  // ── Tous les signalements, par règle (ordre et textes de la base) ──
  const groupesMap = new Map<string, GroupeSignalements>();
  for (const sg of signalements) {
    const rg = regleDe.get(sg.regle);
    let g = groupesMap.get(sg.regle);
    if (!g) {
      g = {
        regle: sg.regle, libelle: rg?.libelle ?? sg.regle, explication: rg?.explication ?? '',
        action: rg?.action ?? sg.action, plages: [], heures: 0, kwh: 0, appareils: [],
      };
      groupesMap.set(sg.regle, g);
    }
    g.plages.push(sg);
    g.heures += sg.nb_heures ?? 0;
    g.kwh += sg.kwh ?? 0;
    const qui = sg.nom ?? (sg.device_id ? sg.device_id : `site ${sg.site}`);
    if (!g.appareils.includes(qui)) g.appareils.push(qui);
  }
  const ordre = (code: string) => regleDe.get(code)?.ordre ?? 999;
  const groupes = [...groupesMap.values()].sort((a, b) => ordre(a.regle) - ordre(b.regle));

  return {
    rowsCalcul,
    rowsAffichage: rows.filter(r => !idsMasques.has(idDe(r))),
    joursExclus: new Map(jours.filter(j => j.exclu).map(j => [j.cle, j.exclu!])),
    jours,
    joursSansDonnee,
    referenceCompletude: referenceIds ? [...compteurs.values()] : ['appareils continus analysés'],
    sites,
    nature,
    horsTotal: [...nomsHorsTotal.values()].sort(),
    idsHorsTotal: new Set(nomsHorsTotal.keys()),
    fluxTotal: avecRoles ? sites.reduce<FluxRoles>((acc, s) => ajouterFlux(acc, s.flux), FLUX_VIDE) : null,
    appareilsMasques: [...idsMasques].map(id => energieParApp.get(id)!.nom).sort(),
    kwhQuarantaine,
    groupes,
  };
}


// ============================================================
// CONVERTISSEUR PROFIL Mi → ShellyRow
// Remédie au mismatch de noms entre la sortie de transformRowsToProfilMi
// (Wh_PhA, Wh_RetourA…) et les noms attendus par parseShellyRow (Wh_Phase A…)
// ============================================================

export function profilMiToShellyRow(
  r: Record<string, unknown>,
  joursFerier: JourFerie[] = [],
): ShellyRow | null {
  // Convertit kWh → Wh quand les colonnes Wh brutes sont absentes (export partiel)
  const toWh = (whKey: string, kwhKey: string, fallback = 0): number => {
    const wh = Number(r[whKey] ?? NaN);
    if (!isNaN(wh)) return wh;
    const kwh = Number(r[kwhKey] ?? NaN);
    if (!isNaN(kwh)) return kwh * 1000;
    return fallback;
  };

  const remapped: Record<string, unknown> = {
    ...r,
    'Wh_Phase A':      toWh('Wh_PhA',       'kWh_PhA')   || toWh('Wh_Total', 'kWh_Total'),
    'Wh_Phase B':      toWh('Wh_PhB',       'kWh_PhB'),
    'Wh_Phase C':      toWh('Wh_PhC',       'kWh_PhC'),
    'Wh_Total':        toWh('Wh_Total',     'kWh_Total'),
    'Wh_Retour Ph. A': toWh('Wh_RetourA',   'kWh_RetourA'),
    'Wh_Retour Ph. B': toWh('Wh_RetourB',   'kWh_RetourB'),
    'Wh_Retour Ph. C': toWh('Wh_RetourC',   'kWh_RetourC'),
    'Wh_Retour Total': toWh('Wh_RetourTotal','kWh_RetourTotal'),
    // Identité appareil (préservée si présente dans les colonnes PROFIL Mi)
    Appareil:    r['Appareil']    ?? r['Nom']         ?? r['name']       ?? '',
    Emplacement: r['Emplacement'] ?? r['Site']        ?? r['site']       ?? '',
    Piece:       r['Piece']       ?? r['Pièce']       ?? r['room']       ?? r['Room'] ?? '',
  };

  const row = parseShellyRow(remapped, joursFerier);
  if (!row) return null;

  // Si les colonnes kW_PhX sont présentes (export Supabase horaire/minute),
  // on les utilise directement au lieu de recalculer kWh÷24 (qui suppose des données journalières).
  const kW_A    = Number(r['kW_PhA']        ?? NaN);
  const kW_B    = Number(r['kW_PhB']        ?? NaN);
  const kW_C    = Number(r['kW_PhC']        ?? NaN);
  const kW_Tot  = Number(r['kW_Total']      ?? NaN);
  const kW_RA   = Number(r['kW_RetourA']    ?? NaN);
  const kW_RB   = Number(r['kW_RetourB']    ?? NaN);
  const kW_RC   = Number(r['kW_RetourC']    ?? NaN);
  const kW_RTot = Number(r['kW_RetourTotal'] ?? NaN);

  return {
    ...row,
    puissKwA:           isNaN(kW_A)    ? row.puissKwA           : kW_A,
    puissKwB:           isNaN(kW_B)    ? row.puissKwB           : kW_B,
    puissKwC:           isNaN(kW_C)    ? row.puissKwC           : kW_C,
    puissKwTotal:       isNaN(kW_Tot)  ? row.puissKwTotal       : kW_Tot,
    puissKwRetourA:     isNaN(kW_RA)   ? row.puissKwRetourA     : kW_RA,
    puissKwRetourB:     isNaN(kW_RB)   ? row.puissKwRetourB     : kW_RB,
    puissKwRetourC:     isNaN(kW_RC)   ? row.puissKwRetourC     : kW_RC,
    puissKwRetourTotal: isNaN(kW_RTot) ? row.puissKwRetourTotal : kW_RTot,
  };
}

// ============================================================
// DÉTECTION FORMAT SHELLY / SUPABASE
// ============================================================

export type FormatShelly =
  | 'shelly_excel'      // Excel Shelly 3EM d'origine (Wh_Phase A, Temps…)
  | 'supabase_cl'       // Export CSV de shelly_cl (device_id, ts, p_a, wh_tot…)
  | 'supabase_horaire'  // Export CSV de shelly_cl_horaire (device_id, ts_heure, wh_conso…)
  | 'profil_mi'         // Format PROFIL Mi déjà transformé (Temps, Wh_PhA, kWh_Total…)
  | 'shelly_section'    // Shelly Cloud export multi-section (Phase A / Phase B / …)
  | 'generic';          // Format inconnu → mapping manuel

export function detecterFormatShelly(colonnes: string[]): {
  format: FormatShelly;
  isShelly: boolean;
  hasPhases: boolean;
  hasRetour: boolean;
  colonneDate: string | null;
} {
  const cols    = colonnes.map(c => c.replace(/[﻿​]/g, "").toLowerCase().trim());
  const colsSet = new Set(cols);

  // ── 0. Shelly Cloud multi-section : 1ère colonne = "Phase A", "Phase B", "Total"… ──
  const firstColLower = cols[0] ?? '';
  if (
    firstColLower.startsWith('phase') ||
    firstColLower === 'total' ||
    (cols.length <= 3 && cols.some(c => c.startsWith('phase')))
  ) {
    return {
      format: 'shelly_section', isShelly: true,
      hasPhases: true, hasRetour: true,
      colonneDate: colonnes[0],
    };
  }

  // ── 1. shelly_cl_horaire : device_id + ts_heure + wh_conso ──
  if (colsSet.has('device_id') && colsSet.has('ts_heure') && colsSet.has('wh_conso')) {
    return {
      format: 'supabase_horaire', isShelly: true,
      hasPhases: true, hasRetour: colsSet.has('wh_inj'),
      colonneDate: colonnes.find(c => c.toLowerCase() === 'ts_heure') ?? 'ts_heure',
    };
  }

  // ── 2. shelly_cl : device_id + ts (ou timestamp) ─────────────
  if (colsSet.has('device_id') && (colsSet.has('ts') || colsSet.has('timestamp'))) {
    return {
      format: 'supabase_cl', isShelly: true,
      hasPhases: cols.some(c => c === 'p_a' || c === 'wh_tot' || c === 'power_w'),
      hasRetour: colsSet.has('wh_ra'),
      colonneDate: colonnes.find(c => c.toLowerCase() === 'ts' || c.toLowerCase() === 'timestamp') ?? 'ts',
    };
  }

  // ── 3. PROFIL Mi déjà transformé : Wh_PhA / kWh_Total + Temps ─
  // Note: wh_total seul est ambigu (présent aussi dans Shelly Excel) — exiger wh_pha ou kwh_total
  const hasProfilMiCols = cols.some(c => c === 'wh_pha' || c === 'kwh_total');
  const hasTemps        = cols.some(c => c === 'temps' || c === 'date');
  if (hasProfilMiCols && hasTemps) {
    return {
      format: 'profil_mi', isShelly: true,
      hasPhases: true, hasRetour: cols.some(c => c.includes('retour')),
      colonneDate: colonnes.find(c => c.toLowerCase() === 'temps' || c.toLowerCase() === 'date') ?? null,
    };
  }

  // ── 4. Excel Shelly d'origine (Wh_Phase A, Temps…) ──────────
  const colonneDate = colonnes.find(c => {
    const l = c.toLowerCase();
    return l.includes('temps') || l.includes('date') || l.includes('time') || l.includes('timestamp');
  }) ?? null;
  const hasPhases = cols.some(c => c.includes('phase') || c.includes('wh_'));
  const hasRetour = cols.some(c => c.includes('retour') || c.includes('return'));
  // Colonnes « Wh_… » exigées : parseShellyRow ne lit que celles-là. Un tableau
  // réorganisé par sections (« Phase A (Wh) », lib/tableau-sections.ts) passe
  // par le lecteur générique, qui range chaque colonne à sa phase.
  const isShelly  = cols.some(c => c.startsWith('wh_')) && colonneDate !== null;

  return {
    format: isShelly ? 'shelly_excel' : 'generic',
    isShelly, hasPhases, hasRetour, colonneDate,
  };
}

// ============================================================
// PARSER FORMAT SHELLY CLOUD MULTI-SECTION
// ============================================================

const SHELLY_SECTION_MAP: Record<string, string> = {
  'phase a':       'Wh_Phase A',
  'phase b':       'Wh_Phase B',
  'phase c':       'Wh_Phase C',
  'total':         'Wh_Total',
  'retour phase a':'Wh_Retour Ph. A',
  'retour phase b':'Wh_Retour Ph. B',
  'retour phase c':'Wh_Retour Ph. C',
  'retour total':  'Wh_Retour Total',
};
const SHELLY_SECTION_NAMES = new Set(Object.keys(SHELLY_SECTION_MAP));

export function parseShellySectionCSV(
  rawData: Record<string, unknown>[],
  joursFerier: JourFerie[] = [],
): ShellyRow[] {
  if (!rawData.length) return [];
  const [col0, col1] = Object.keys(rawData[0]);

  const mergedRows = new Map<string, Record<string, unknown>>();

  // Section initiale dérivée du nom de la première colonne
  const firstColName = col0.toLowerCase().replace(/[\uFEFF\u200B]/g, '').trim();
  let currentWHKey: string = SHELLY_SECTION_MAP[firstColName] ?? 'Wh_Phase A';

  for (const row of rawData) {
    const v0 = String(row[col0] ?? '').replace(/[\uFEFF\u200B]/g, '').trim();
    const v1 = row[col1];

    if (!v0 || v0 === 'Temps') continue;

    const v0Lower = v0.toLowerCase();
    if (SHELLY_SECTION_NAMES.has(v0Lower)) {
      currentWHKey = SHELLY_SECTION_MAP[v0Lower];
      continue;
    }

    if (!mergedRows.has(v0)) {
      mergedRows.set(v0, { Temps: v0 });
    }
    mergedRows.get(v0)![currentWHKey] = v1;
  }

  return Array.from(mergedRows.values())
    .map(r => parseShellyRow(r, joursFerier))
    .filter((r): r is ShellyRow => r !== null);
}

// ============================================================
// STATS DESCRIPTIVES
// ============================================================

export interface StatsDescriptives {
  moyenne: number;
  mediane: number;
  ecartType: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

export function calculerStats(valeurs: number[]): StatsDescriptives {
  if (valeurs.length === 0) {
    return { moyenne: 0, mediane: 0, ecartType: 0, p25: 0, p75: 0, min: 0, max: 0 };
  }

  const sorted = [...valeurs].sort((a, b) => a - b);
  const n = sorted.length;
  const moyenne = valeurs.reduce((s, v) => s + v, 0) / n;
  const variance = valeurs.reduce((s, v) => s + (v - moyenne) ** 2, 0) / n;

  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return {
    moyenne,
    mediane:  percentile(50),
    ecartType: Math.sqrt(variance),
    p25: percentile(25),
    p75: percentile(75),
    min: sorted[0],
    max: sorted[n - 1],
  };
}
