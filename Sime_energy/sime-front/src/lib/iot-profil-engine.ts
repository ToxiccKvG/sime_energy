// ============================================================
// IOT MODULE — Moteur Profil de Charge Shelly 3EM
// Reproduit exactement les 50 colonnes du modèle Excel
// "2026-03-11-modèle export données Shelly 3EM.xlsx"
// ============================================================

import type { ShellyRow, ShellyAnalyse, JourFerie } from '@/components/iot/shared';
import { JOURS_SEMAINE_LONG, MOIS_FR, JOURS_FERIES_FIXES } from '@/components/iot/shared';

// ============================================================
// HELPERS CLASSIFICATION (jours d'activité, saisons, périodes climatiques)
// La couche tarification SENELEC a été retirée (sera réintroduite au merge).
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
  const maxJournalier = rowsAvecCumuls.reduce((a, r) => Math.max(a, r.kwhNet), -Infinity);
  const minJournalier = rowsAvecCumuls.reduce((a, r) => Math.min(a, r.kwhNet), Infinity);

  // Par mois
  const parMois: ShellyAnalyse['parMois'] = {};
  for (const r of rowsAvecCumuls) {
    const key = `${r.mois} ${r.annee}`;
    if (!parMois[key]) parMois[key] = { kwhTotal: 0, kwhNet: 0, kwhRetour: 0, nbJours: 0 };
    parMois[key].kwhTotal  += r.kwhTotal;
    parMois[key].kwhNet    += r.kwhNet;
    parMois[key].kwhRetour += r.kwhRetourTotal;
    parMois[key].nbJours++;
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
// PROFIL JOURNALIER (agrégé sur tous les jours)
// ============================================================

export interface ProfilHoraire {
  heure: number;
  kwhMoyen: number;
  kwhMax: number;
  kwhMin: number;
  isHP: boolean;
}

// Profil type normalisé (Sénégal) — somme ≈ 24, redistribution réaliste sur la journée
const PROFIL_TYPE_JOURNALIER = [
  0.25, 0.25, 0.20, 0.20, 0.20, 0.30, // 0h–5h  : nuit
  0.55, 0.85, 1.15, 1.20, 1.20, 1.10, // 6h–11h : matin
  1.00, 1.10, 1.20, 1.10, 1.00, 0.90, // 12h–17h: après-midi
  0.80, 1.30, 1.40, 1.30, 1.00, 0.55, // 18h–23h: soir / pointe
];
const SOMME_PROFIL_TYPE = PROFIL_TYPE_JOURNALIER.reduce((s, v) => s + v, 0);

export function calculerProfilHoraire(rows: ShellyRow[]): ProfilHoraire[] {
  const profil: ProfilHoraire[] = Array.from({ length: 24 }, (_, h) => ({
    heure: h,
    kwhMoyen: 0,
    kwhMax: 0,
    kwhMin: 0,
    isHP: h >= 19 && h < 23,
  }));

  if (rows.length === 0) return profil;

  // Détecte si les données sont horaires (plusieurs heures distinctes)
  const heuresDistinctes = new Set(rows.map(r => toDateSafe(r.date).getHours()));
  const isHourly = heuresDistinctes.size > 2;

  if (isHourly) {
    // Données horaires : grouper par heure et calculer moy/min/max réels
    const parHeure: number[][] = Array.from({ length: 24 }, () => []);
    for (const r of rows) {
      const h = toDateSafe(r.date).getHours();
      if (h >= 0 && h < 24) parHeure[h].push(r.kwhNet);
    }
    for (let h = 0; h < 24; h++) {
      const vals = parHeure[h];
      if (vals.length === 0) continue;
      profil[h].kwhMoyen = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4);
      profil[h].kwhMax   = +Math.max(...vals).toFixed(4);
      profil[h].kwhMin   = +Math.min(...vals).toFixed(4);
    }
  } else {
    // Données journalières : distribuer via profil type Sénégal
    const kwhNets = rows.map(r => r.kwhNet).filter(v => v > 0);
    if (kwhNets.length === 0) return profil;
    const moyJour = kwhNets.reduce((s, v) => s + v, 0) / kwhNets.length;
    const maxJour = Math.max(...kwhNets);
    const minJour = Math.min(...kwhNets);
    for (let h = 0; h < 24; h++) {
      const coef = PROFIL_TYPE_JOURNALIER[h] / SOMME_PROFIL_TYPE;
      profil[h].kwhMoyen = +(moyJour * coef).toFixed(4);
      profil[h].kwhMax   = +(maxJour * coef).toFixed(4);
      profil[h].kwhMin   = +(minJour * coef).toFixed(4);
    }
  }

  return profil;
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
  const isShelly  = hasPhases && colonneDate !== null;

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
