// ============================================================
// IOT MODULE — Moteur Profil de Charge Shelly 3EM
// Reproduit exactement les 50 colonnes du modèle Excel
// "2026-03-11-modèle export données Shelly 3EM.xlsx"
// ============================================================

import type { ShellyRow, ShellyAnalyse, JourFerie } from '@/components/iot/shared';
import { JOURS_SEMAINE_LONG, MOIS_FR, JOURS_FERIES_FIXES } from '@/components/iot/shared';

// ============================================================
// PARAMÈTRES TARIFICATION (depuis Données d'entrées)
// ============================================================

export interface ParamsTarif {
  typeTarif: 'MT' | 'BT';
  tarifK1: number;   // Heures Hors Pointe (HHP) — FCFA/kWh
  tarifK2: number;   // Heures de Pointe (HP)    — FCFA/kWh
  tarifTranche1: number;
  tarifTranche2: number;
  tarifTranche3: number;
  tarifMoyenBT: number;
}

export const PARAMS_TARIF_DEFAUT: ParamsTarif = {
  typeTarif: 'MT',
  tarifK1: 140.74,
  tarifK2: 232.23,
  tarifTranche1: 82,
  tarifTranche2: 136.49,
  tarifTranche3: 159.36,
  tarifMoyenBT: 125.95,
};

// ============================================================
// HELPERS CLASSIFICATION
// ============================================================

/** Heure de pointe SENELEC : 19h ≤ h < 23h */
function isTranchePointe(heure: number): boolean {
  return heure >= 19 && heure < 23;
}

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
 * Pour données journalières (00h), on utilise 'Nuit' (valeur Excel pour lignes journalières)
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

/** Montant énergie FCFA pour une ligne journalière (tarif simplifié) */
function calcMontantEnergie(kwh: number, heure: number, params: ParamsTarif): number {
  if (params.typeTarif === 'MT') {
    return kwh * (isTranchePointe(heure) ? params.tarifK2 : params.tarifK1);
  }
  return kwh * params.tarifMoyenBT;
}

// ============================================================
// PARSE UNE LIGNE SHELLY depuis données brutes
// Format attendu: Temps | Wh_Phase A | Wh_Phase B | Wh_Phase C | Wh_Total |
//                 Wh_Retour Ph. A | Wh_Retour Ph. B | Wh_Retour Ph. C | Wh_Retour Total
// ============================================================

export function parseShellyRow(
  raw: Record<string, unknown>,
  joursFerier: JourFerie[] = [],
  params: ParamsTarif = PARAMS_TARIF_DEFAUT,
): ShellyRow | null {
  const parseNum = (v: unknown): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  // Trouver la colonne date/temps
  const dateRaw =
    raw['Temps'] ?? raw['temps'] ?? raw['Date'] ?? raw['date'] ??
    raw[' Temps'] ?? raw['timestamp'] ?? raw['Timestamp'];

  if (!dateRaw) return null;

  let date: Date;
  if (dateRaw instanceof Date) {
    date = dateRaw;
  } else {
    date = new Date(String(dateRaw));
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

  // ---- Puissances moyennes kW = kWh × 1000 / 24 (données journalières) ----
  const puissKwA = kwhA * 1000 / 24;
  const puissKwB = kwhB * 1000 / 24;
  const puissKwC = kwhC * 1000 / 24;
  const puissKwTotal = kwhTotal * 1000 / 24;
  const puissKwRetourA = kwhRetourA * 1000 / 24;
  const puissKwRetourB = kwhRetourB * 1000 / 24;
  const puissKwRetourC = kwhRetourC * 1000 / 24;
  const puissKwRetourTotal = kwhRetourTotal * 1000 / 24;

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

  // ---- Classifieurs ----
  const trancheTarification: ShellyRow['trancheTarification'] =
    isTranchePointe(heure) ? 'Heure de pointe' : 'Heure creuse';

  const montantEnergie = calcMontantEnergie(kwhTotal, heure, params);
  const montantEnergieRetour = calcMontantEnergie(kwhRetourTotal, heure, params);

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
    trancheTarification,
    montantEnergie,
    montantEnergieRetour,
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
  };
}

// ============================================================
// POST-TRAITEMENT — Calcul des cumuls après tri par date
// ============================================================

export function ajouterCumulatifs(rows: ShellyRow[]): ShellyRow[] {
  // Trier par date croissante
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
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

export function analyserDonneesShelly(rows: ShellyRow[]): ShellyAnalyse {
  if (rows.length === 0) {
    return {
      rows: [],
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
  const nbJours = rowsAvecCumuls.length;
  const moyenneJournaliere = totalKwhNet / nbJours;
  const maxJournalier = Math.max(...rowsAvecCumuls.map(r => r.kwhNet));
  const minJournalier = Math.min(...rowsAvecCumuls.map(r => r.kwhNet));

  // Par mois
  const parMois: ShellyAnalyse['parMois'] = {};
  for (const r of rowsAvecCumuls) {
    const key = `${r.mois} ${r.annee}`;
    if (!parMois[key]) parMois[key] = { kwhTotal: 0, kwhNet: 0, kwhRetour: 0, nbJours: 0, montantEnergie: 0 };
    parMois[key].kwhTotal     += r.kwhTotal;
    parMois[key].kwhNet       += r.kwhNet;
    parMois[key].kwhRetour    += r.kwhRetourTotal;
    parMois[key].nbJours++;
    parMois[key].montantEnergie += r.montantEnergie;
  }

  // Par type de jour
  const joursOuvres  = rowsAvecCumuls.filter(r => r.jourActivites === 'Jour ouvré');
  const weekendRows  = rowsAvecCumuls.filter(r => r.jourActivites === 'Weekend');
  const feriesRows   = rowsAvecCumuls.filter(r => r.jourActivites === 'Jour férié');

  const avg = (arr: ShellyRow[]) =>
    arr.length > 0 ? arr.reduce((s, r) => s + r.kwhNet, 0) / arr.length : 0;

  return {
    rows: rowsAvecCumuls,
    totalKwhConsomme, totalKwhRetour, totalKwhNet,
    moyenneJournaliere, maxJournalier, minJournalier, nbJours,
    parMois,
    jourOuvre: { kwhMoyen: avg(joursOuvres), nbJours: joursOuvres.length },
    weekend:   { kwhMoyen: avg(weekendRows),  nbJours: weekendRows.length },
    ferieOuDimanche: { kwhMoyen: avg(feriesRows), nbJours: feriesRows.length },
  };
}

// ============================================================
// CALCUL FACTURATION MENSUELLE sur données Shelly
// ============================================================

export interface FactureShelly {
  mois: string;
  kwhNet: number;
  kwhRetour: number;
  kwhHHP: number;  // kWh Hors Heures de Pointe
  kwhHP: number;   // kWh Heures de Pointe
  montantEnergie: number;
  nbJours: number;
  coutMoyen: number;
}

export function calculerFacturationShelly(
  rows: ShellyRow[],
  params: ParamsTarif = PARAMS_TARIF_DEFAUT
): FactureShelly[] {
  const groupes: Record<string, ShellyRow[]> = {};
  for (const r of rows) {
    const key = `${r.mois} ${r.annee}`;
    if (!groupes[key]) groupes[key] = [];
    groupes[key].push(r);
  }

  return Object.entries(groupes).map(([mois, lignes]) => {
    const kwhNet    = lignes.reduce((s, r) => s + r.kwhNet, 0);
    const kwhRetour = lignes.reduce((s, r) => s + r.kwhRetourTotal, 0);
    const kwhHHP    = lignes.filter(r => r.trancheTarification === 'Heure creuse')
                            .reduce((s, r) => s + r.kwhTotal, 0);
    const kwhHP     = lignes.filter(r => r.trancheTarification === 'Heure de pointe')
                            .reduce((s, r) => s + r.kwhTotal, 0);
    const montantEnergie = lignes.reduce((s, r) => s + r.montantEnergie, 0);
    const nbJours   = lignes.length;

    const tarifK1 = params.typeTarif === 'MT' ? params.tarifK1 : params.tarifMoyenBT;
    const tarifK2 = params.typeTarif === 'MT' ? params.tarifK2 : params.tarifMoyenBT;
    const totalKwh = kwhHHP + kwhHP;
    const coutMoyen = totalKwh > 0
      ? (kwhHHP * tarifK1 + kwhHP * tarifK2) / totalKwh
      : tarifK1;

    return { mois, kwhNet, kwhRetour, kwhHHP, kwhHP, montantEnergie, nbJours, coutMoyen };
  });
}

// ============================================================
// PROFIL JOURNALIER (agrégé sur tous les jours)
// ============================================================

export interface ProfilHoraire {
  heure: number;
  kwhMoyen: number;
  kwhMax: number;
  kwhMin: number;
  isHP: boolean;
}

export function calculerProfilHoraire(rows: ShellyRow[]): ProfilHoraire[] {
  const profil: ProfilHoraire[] = Array.from({ length: 24 }, (_, h) => ({
    heure: h,
    kwhMoyen: 0,
    kwhMax: 0,
    kwhMin: Infinity,
    isHP: h >= 19 && h < 23,
  }));

  if (rows.length === 0) return profil;

  const kwhParHeure = rows.map(r => r.kwhNet / 24);
  const moyenneHoraire = kwhParHeure.reduce((s, v) => s + v, 0) / rows.length;
  const maxHoraire = Math.max(...kwhParHeure);
  const minHoraire = Math.min(...kwhParHeure);

  for (let h = 0; h < 24; h++) {
    profil[h].kwhMoyen = moyenneHoraire;
    profil[h].kwhMax   = maxHoraire;
    profil[h].kwhMin   = minHoraire === Infinity ? 0 : minHoraire;
  }

  return profil;
}

// ============================================================
// DÉTECTION FORMAT SHELLY
// ============================================================

export function detecterFormatShelly(colonnes: string[]): {
  isShelly: boolean;
  hasPhases: boolean;
  hasRetour: boolean;
  colonneDate: string | null;
} {
  const cols = colonnes.map(c => c.toLowerCase().trim());

  const colonneDate = colonnes.find(c =>
    c.toLowerCase().includes('temps') ||
    c.toLowerCase().includes('date') ||
    c.toLowerCase().includes('time') ||
    c.toLowerCase().includes('timestamp')
  ) ?? null;

  const hasPhases = cols.some(c => c.includes('phase') || c.includes('wh_'));
  const hasRetour = cols.some(c => c.includes('retour') || c.includes('return'));
  const isShelly  = hasPhases && colonneDate !== null;

  return { isShelly, hasPhases, hasRetour, colonneDate };
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
