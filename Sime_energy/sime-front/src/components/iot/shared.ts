// ============================================================
// IOT MODULE — Shared Types
// Spec : IOT_MODULE_SPECS.md v1.0 — 7 onglets
// ============================================================

// ============================================================
// SOURCES — Onglet 1
// ============================================================

export type SourceType = 'SENELEC' | 'PV' | 'SECOURS' | 'CHARGE' | 'SELECTEUR';
export type SensorType = 'Shelly' | 'SMA' | 'Voltcraft' | 'Fluke' | 'DENT' | 'Sentinel' | 'Manuel' | 'Autre';
export type SourceRole = 'ARRIVEE' | 'GENERAL' | 'DEPART';
export type UsageType = 'Éclairage' | 'CVC' | 'Force motrice' | 'Bureautique' | 'IT' | 'Froid' | 'Cuisson' | 'Autres';

export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  SENELEC:   '#3b82f6', // Bleu
  PV:        '#eab308', // Jaune
  SECOURS:   '#f97316', // Orange
  CHARGE:    '#ef4444', // Rouge
  SELECTEUR: '#a855f7', // Violet
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  SENELEC:   'Réseau SENELEC',
  PV:        'Production solaire (PV)',
  SECOURS:   'Groupe électrogène',
  CHARGE:    'Circuit de consommation',
  SELECTEUR: 'ATS / Inverseur réseau',
};

export const SOURCE_ROLE_COLORS: Record<SourceRole, string> = {
  ARRIVEE: '#06b6d4',
  GENERAL: '#22c55e',
  DEPART:  '#f97316',
};

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  ARRIVEE: 'Arrivée',
  GENERAL: 'Général',
  DEPART:  'Départ',
};

export const USAGE_TYPES: UsageType[] = [
  'Éclairage', 'CVC', 'Force motrice', 'Bureautique', 'IT', 'Froid', 'Cuisson', 'Autres',
];

export const USAGE_TYPE_COLORS: Record<UsageType, string> = {
  'Éclairage':     '#eab308',
  'CVC':           '#3b82f6',
  'Force motrice': '#f97316',
  'Bureautique':   '#8b5cf6',
  'IT':            '#06b6d4',
  'Froid':         '#60a5fa',
  'Cuisson':       '#ef4444',
  'Autres':        '#6b7280',
};

export interface Source {
  id: string;
  nom: string;
  type: SourceType;
  description: string;
  couleur: string;        // hex — hérite de SOURCE_TYPE_COLORS, modifiable
  capteur: SensorType;
  actif: boolean;
  ordre: number;          // pour le glisser-déposer
  siteId?: string;        // association audit
  // Plan de comptage
  role?: SourceRole;
  usageType?: UsageType;
  entite?: string;
  puissanceInstallee?: number;
}

// ============================================================
// SÉRIES TEMPORELLES — données multi-sources normalisées
// ============================================================

export interface TimeSeriesRow {
  timestamp: Date;
  sourceId: string;
  puissanceKw: number;    // kW instantané
  energieKwh: number;     // kWh de la période
  energieCumKwh: number;  // kWh cumulés depuis début fichier
  // Optionnel selon capteur
  facteurPuissance?: number;
  tensionV?: number;
  courantA?: number;
  // Classifieurs (calculés)
  jourActivites?: ShellyRow['jourActivites'];
  trancheTarification?: ShellyRow['trancheTarification'];
  saison?: ShellyRow['saison'];
  periodeclimatique?: ShellyRow['periodeclimatique'];
}

// ============================================================
// CALENDRIER — Onglet 5
// ============================================================

export interface PlageHoraire {
  debut: string;   // "08:00"
  fin: string;     // "18:00"
}

export interface JourConfig {
  actif: boolean;
  plages: PlageHoraire[];
}

export interface CalendrierSite {
  id: string;
  nom: string;
  // Lun=1 ... Dim=0
  semaine: Record<number, JourConfig>;
  exceptions: { dateDebut: Date; dateFin: Date; description: string; plages: PlageHoraire[] }[];
}

// ============================================================
// BILAN M1/M2/M3 — Onglet 6
// ============================================================

export interface ReleveCompteur {
  id: string;
  date: Date;
  indexKwh: number;
  sourceId: string;  // source SENELEC
  note?: string;
}

export interface BilanPeriode {
  dateDebut: Date;
  dateFin: Date;
  m2Kwh: number;          // SENELEC acheté
  m1Kwh: number;          // PV autoconsommé = M3 - M2
  m3Kwh: number;          // total site consommé
  pvTotalKwh: number;     // production PV totale
  injecteKwh: number;     // injection réseau = PV - M1
  tauxAutoconso: number;  // M1/M3 %
  tauxCouverturePV: number; // M1/PVtotal %
  coutEvite: number;      // M1 × tarif FCFA
  tarifSenelec: number;   // FCFA/kWh
}

// ============================================================
// SIMULATIONS — Onglet 7
// ============================================================

export type ConditionOperateur = 'gt' | 'lt' | 'eq' | 'between' | 'outside';
export type ConditionChamp = 'puissanceKw' | 'energieKwh' | 'heure' | 'jourSemaine' | 'typeJour' | 'date';

export interface SimulationCondition {
  id: string;
  champ: ConditionChamp;
  operateur: ConditionOperateur;
  valeur: number | string;
  valeur2?: number | string;  // pour 'between'
  sourceId?: string;          // null = toutes les sources
  actif: boolean;
  description: string;
}

export interface Simulation {
  id: string;
  nom: string;
  description: string;
  conditions: SimulationCondition[];
  actif: boolean;
  createdAt: Date;
  // Résultats calculés après application
  resultats?: {
    pointsExclus: number;
    pointsTotal: number;
    energieOriginaleKwh: number;
    energieFiltreeKwh: number;
    reductionPct: number;
  };
}

// ---- Shelly 3EM — Profil de Charge (50 colonnes exactes) ----

export interface ShellyRow {
  // ---- Données d'entrée ----
  date: Date;
  whPhaseA: number;
  whPhaseB: number;
  whPhaseC: number;
  whTotal: number;
  whRetourA: number;
  whRetourB: number;
  whRetourC: number;
  whRetourTotal: number;
  // ---- Consommations kWh ----
  kwhA: number;
  kwhB: number;
  kwhC: number;
  kwhTotal: number;
  kwhRetourA: number;
  kwhRetourB: number;
  kwhRetourC: number;
  kwhRetourTotal: number;
  // ---- Consommations cumulées kWh ----
  kwhCumA: number;
  kwhCumB: number;
  kwhCumC: number;
  kwhCumTotal: number;
  kwhCumRetourA: number;
  kwhCumRetourB: number;
  kwhCumRetourC: number;
  kwhCumRetourTotal: number;
  // ---- Puissances moyennes (kW) = kWh × 1000 / 24 ----
  puissKwA: number;
  puissKwB: number;
  puissKwC: number;
  puissKwTotal: number;
  puissKwRetourA: number;
  puissKwRetourB: number;
  puissKwRetourC: number;
  puissKwRetourTotal: number;
  // ---- Classifieurs ----
  jour: string;         // "lundi", "mardi"...
  mois: string;         // "janv", "févr"...
  annee: number;
  jourActivites: 'Jour ouvré' | 'Weekend' | 'Jour férié';
  trancheTarification: 'Heure creuse' | 'Heure de pointe';
  montantEnergie: number;       // FCFA
  montantEnergieRetour: number; // FCFA
  heuresEnsoleillement: 'En ensoleillement' | 'Hors ensoleillement';
  heuresTravail: 'Heures d\'activités' | 'Heures hors activités';
  periodeclimatique: 'Période de fraîcheur' | 'Période chaude';
  saison: 'Sèche' | 'Hivernage';
  periode: 'Nuit' | 'Matin' | 'Après-midi' | 'Soir';
  profil: 'CHARGE' | 'SOUTIRAGE';
  // ---- Helpers (rétrocompatibilité) ----
  kwhNet: number; // = kwhTotal - kwhRetourTotal
  isWeekend: boolean;
  isJourFerie: boolean;
  jourSemaine: string; // "Lun", "Mar"...
}

export interface ShellyAnalyse {
  rows: ShellyRow[];
  totalKwhConsomme: number;
  totalKwhRetour: number;
  totalKwhNet: number;
  moyenneJournaliere: number;
  maxJournalier: number;
  minJournalier: number;
  nbJours: number;
  parMois: Record<string, { kwhTotal: number; kwhNet: number; kwhRetour: number; nbJours: number; montantEnergie: number }>;
  jourOuvre: { kwhMoyen: number; nbJours: number };
  weekend: { kwhMoyen: number; nbJours: number };
  ferieOuDimanche: { kwhMoyen: number; nbJours: number };
}

// ---- SENELEC — Tarification ----

export type NiveauTension = 'BT' | 'MT' | 'HT';
export type CategoriesTarifairesBT = 'DPP' | 'DMP' | 'PPP' | 'PMP' | 'DGP' | 'PGP';
export type CategoriesTarifairesMT = 'TCU' | 'TG' | 'TLU';
export type CategoriesTarifairesHT = 'TG_HT' | 'TS';
export type CategorieTarifaire = CategoriesTarifairesBT | CategoriesTarifairesMT | CategoriesTarifairesHT;

export interface TarifBTTranche {
  type: 'tranche';
  t1: number; t2: number; t3: number;
  seuil1: number; seuil2: number;
  primeMensuelle: number;
  redevance: number;
}

export interface TarifGP {
  type: 'gp';
  hhp: number; hp: number;
  primeFixe: number;
  redevance30: number; redevance31: number;
}

export interface TarifMT {
  type: 'mt';
  hhp: number; hp: number;
  primeFixe: number;
}

export interface TarifHT {
  type: 'ht';
  hhp: number; hp: number;
  primeFixe: number;
}

export type TarifDetail = TarifBTTranche | TarifGP | TarifMT | TarifHT;

// ---- Données techniques (paramètres de la facture) ----

export interface DonneesTechniques {
  nJours: number;
  nJoursDepassement: number;
  puissanceSouscrite: number;
  puissanceMaxRelevee: number;
  puissanceTransfo: number;
  taxeCommunale: number;
  categorie: CategorieTarifaire;
  // Coefficients de correction (rapport TC/TP)
  alphaA: number;   // αa — coefficient majoration active K1
  betaA: number;    // βa — coefficient majoration active K2
  alphaR: number;   // αr — coefficient majoration réactive
  betaR: number;    // βr — coefficient majoration réactive H1
  h1: number;       // Heures transformateur H1
  h2: number;       // Heures condensateurs H2
  redevance: number;
}

export interface DonneesEnergieBT {
  consommationTotale: number;
}

export interface DonneesEnergieGP {
  consomActiveK1: number;  // kWh HHP (sans majo)
  consomActiveK2: number;  // kWh HP (sans majo)
  consomReactiveWr: number; // kVARh (sans majo)
}

export type DonneesEnergie = DonneesEnergieBT | DonneesEnergieGP;

// ---- Résultat facturation complet ----

export interface ResultatFacturation {
  // Majoration (αa/βa/αr/βr)
  majoK1: number;      // kWh
  majoK2: number;      // kWh
  majoWr: number;      // kVARh
  k1Facture: number;   // K1 + MajoK1 kWh
  k2Facture: number;   // K2 + MajoK2 kWh
  // Énergie
  coutK1: number;
  coutK2: number;
  coutEnergie: number;
  // Tranches BT
  consomTranche1?: number; consomTranche2?: number; consomTranche3?: number;
  coutTranche1?: number; coutTranche2?: number; coutTranche3?: number;
  // CosPhi
  cosPhi: number;
  bonusCosphi: number;
  // Prime fixe
  primeFixeMensuelle: number;
  majDepassement: number;
  primeFixe: number;   // total = primeFixeMensuelle + majDepassement
  // Taxes
  redevance: number;
  taxeCommunale: number;
  montantHT: number;
  tva: number;
  montantTTC: number;
  // Indicateurs
  consomJournaliere: number;
  tauxChargeTransfo: number;
  ipr: number;   // Indicateur de Performance de Référence (FCFA/kWh TTC)
  tarifMoyen: number; // Coût moyen pondéré HT (FCFA/kWh)
  // Décomposition pour poids
  surcoût: number; // prime fixe + majo dép + pénalité cosφ
  taxes: number;   // TVA + TCO + redevance
}

// ---- Scénario d'optimisation ----

export interface ScenarioOptimisation {
  nom: string;
  description: string;
  resultat: ResultatFacturation;
  economieVsBase: number;   // FCFA (positif = économie)
  economieAnnuelle: number;
  ipr: number;
}

// ---- Ligne facturation historique (Tab_Facturation) ----

export interface LigneFacturation {
  id: string;
  date: Date;
  periode: string;
  nomClient?: string;
  adresse?: string;
  police?: string;
  factureNum?: string;
  dateFacture?: Date;
  nJours?: number;
  puissanceSouscrite?: number;
  puissanceMaxRelevee?: number;
  depassement?: number;
  // Indices
  ancienIndexK1?: number; nouvelIndexK1?: number;
  ancienIndexK2?: number; nouvelIndexK2?: number;
  ancienIndexWr?: number; nouvelIndexWr?: number;
  // Consommations facturées
  consomActiveK1: number;
  consomActiveK2: number;
  totEnergieActive?: number;
  consomReactiveWr: number;
  majoK1?: number;
  majoK2?: number;
  majoReact?: number;
  cosPhi?: number;
  // Montants
  montantK1?: number;
  montantK2?: number;
  montantPrimeFixe?: number;
  montantHT?: number;
  redevance?: number;
  montantTVA?: number;
  montantTTC?: number;
  prixTarifK1?: number;
  prixTarifK2?: number;
  tauxChargeTransfo?: number;
  facteurUtilisation?: number;
  nHeuresUtilisation?: number;
  ipr?: number;
  // Résultat calculé
  resultat?: ResultatFacturation;
}

// ---- Jours fériés ----

export interface JourFerie {
  date: Date;
  nom: string;
  type: 'férie' | 'fête' | 'événement';
  actif: boolean;
}

// ---- Import file ----

export interface ImportedFile {
  id: string;
  name: string;
  type: 'shelly' | 'facturation' | 'autre';
  sourceId?: string;
  uploadedAt: Date;
  rowCount: number;
  columns: string[];
  preview: Record<string, unknown>[];
  rawData: Record<string, unknown>[];
}

// ---- Constants ----

export const JOURS_SEMAINE_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const JOURS_SEMAINE = JOURS_SEMAINE_COURT;

export const JOURS_SEMAINE_LONG = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];

export const MOIS_FR = [
  'janv', 'févr', 'mars', 'avr', 'mai', 'juin',
  'juil', 'août', 'sept', 'oct', 'nov', 'déc',
];

export const TAUX_TVA = 0.18;

export const JOURS_FERIES_FIXES: { mois: number; jour: number; nom: string }[] = [
  { mois: 1, jour: 1, nom: "Jour de l'An" },
  { mois: 4, jour: 4, nom: "Fête de l'Indépendance" },
  { mois: 5, jour: 1, nom: "Fête du Travail" },
  { mois: 8, jour: 15, nom: "Assomption" },
  { mois: 11, jour: 1, nom: "Toussaint" },
  { mois: 12, jour: 25, nom: "Noël" },
];
