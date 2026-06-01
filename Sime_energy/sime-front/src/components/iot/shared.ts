// ============================================================
// IOT MODULE — Shared Types
// Note : la couche facturation/tarification SENELEC a été retirée
// (sera réintroduite par le merge avec le code du dev billing).
// Conservé ici : sources, mesures énergie, capteurs, calendrier, jours d'activité.
// ============================================================

// ============================================================
// SOURCES — Onglet Sources
// ============================================================

export type SourceType = 'SENELEC' | 'PV' | 'BESS' | 'GROUPE' | 'SECOURS' | 'CHARGE' | 'SELECTEUR';
export type SensorType = 'Shelly' | 'SMA' | 'Voltcraft' | 'Fluke' | 'DENT' | 'Sentinel' | 'Manuel' | 'Autre';

// ---- Configuration avancée (matrice LEGENDE) ----
export type ModeSource = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type TransfertEnergie = 'Selecteur' | 'Inverseur' | 'Direct';
export type TypeTableau = 'TGBT' | 'TD1' | 'TD2' | 'TD3' | 'Autre';
export type ChargeId = 'CH1_TGBT' | 'CH2_TGBT' | 'CH3_TD1' | 'CH4_TD2' | 'Autre' | '';
export type ProfilMi = 'M1_SENELEC' | 'M2_SELECTEUR' | 'M3_CHARGE' | 'M4_GROUPE' | 'M5_PV';
export type ModeGrid = 'ON-GRID' | 'OFF-GRID';

export const PROFIL_MI_LABELS: Record<ProfilMi, string> = {
  M1_SENELEC:   'M1 — SENELEC',
  M2_SELECTEUR: 'M2 — Sélecteur PV/SENELEC',
  M3_CHARGE:    'M3 — Charge totale',
  M4_GROUPE:    'M4 — Groupe électrogène',
  M5_PV:        'M5 — Production PV',
};

export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  SENELEC:   '#3b82f6',
  PV:        '#eab308',
  BESS:      '#22c55e',
  GROUPE:    '#f97316',
  SECOURS:   '#f97316',
  CHARGE:    '#ef4444',
  SELECTEUR: '#a855f7',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  SENELEC:   'Réseau SENELEC',
  PV:        'Production solaire (PV)',
  BESS:      'Batterie (BESS)',
  GROUPE:    'Groupe électrogène',
  SECOURS:   'Groupe électrogène (secours)',
  CHARGE:    'Circuit de consommation',
  SELECTEUR: 'ATS / Inverseur réseau',
};

export interface Source {
  id: string;
  nom: string;
  type: SourceType;
  description: string;
  couleur: string;
  capteur: SensorType;
  actif: boolean;
  ordre: number;
  siteId?: string;
  modes?: ModeSource[];
  linkedSourceIds?: string[];
  transfert?: TransfertEnergie;
  tableau?: TypeTableau;
  chargeId?: ChargeId;
  profilMi?: ProfilMi;
  modeGrid?: ModeGrid;
}

// ---- Colonnes disponibles pour export Supabase / TCD ----
export interface ColonneProfilShelly {
  key: string;
  label: string;
  groupe: 'entree' | 'calcule' | 'classifieur';
  unite?: string;
}

export const COLONNES_PROFIL_SHELLY: ColonneProfilShelly[] = [
  // --- Données d'entrée ---
  { key: 'Temps',             label: 'Temps',                     groupe: 'entree' },
  { key: 'Wh_PhA',            label: 'Wh Phase A',                groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_PhB',            label: 'Wh Phase B',                groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_PhC',            label: 'Wh Phase C',                groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_Total',          label: 'Wh Total',                  groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_RetourA',        label: 'Wh Retour Ph. A',           groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_RetourB',        label: 'Wh Retour Ph. B',           groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_RetourC',        label: 'Wh Retour Ph. C',           groupe: 'entree', unite: 'Wh' },
  { key: 'Wh_RetourTotal',    label: 'Wh Retour Total',           groupe: 'entree', unite: 'Wh' },
  // --- Données calculées ---
  { key: 'kWh_PhA',           label: 'Cons.(kWh) Phase A',        groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_PhB',           label: 'Cons.(kWh) Phase B',        groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_PhC',           label: 'Cons.(kWh) Phase C',        groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_Total',         label: 'Cons.(kWh) Total',          groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_RetourA',       label: 'Cons.(kWh) Retour Ph.A',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_RetourB',       label: 'Cons.(kWh) Retour Ph.B',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_RetourC',       label: 'Cons.(kWh) Retour Ph.C',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWh_RetourTotal',   label: 'Cons.(kWh) Retour Total',   groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_PhA',        label: 'Cons.Cum.(kWh) Phase A',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_PhB',        label: 'Cons.Cum.(kWh) Phase B',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_PhC',        label: 'Cons.Cum.(kWh) Phase C',    groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_Total',      label: 'Cons.Cum.(kWh) Total',      groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_RetourA',    label: 'Cons.Cum.(kWh) Ret. Ph.A',  groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_RetourB',    label: 'Cons.Cum.(kWh) Ret. Ph.B',  groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_RetourC',    label: 'Cons.Cum.(kWh) Ret. Ph.C',  groupe: 'calcule', unite: 'kWh' },
  { key: 'kWhCum_RetourTotal',label: 'Cons.Cum.(kWh) Ret. Total', groupe: 'calcule', unite: 'kWh' },
  { key: 'kW_PhA',            label: 'Puiss.(kW) Phase A',        groupe: 'calcule', unite: 'kW' },
  { key: 'kW_PhB',            label: 'Puiss.(kW) Phase B',        groupe: 'calcule', unite: 'kW' },
  { key: 'kW_PhC',            label: 'Puiss.(kW) Phase C',        groupe: 'calcule', unite: 'kW' },
  { key: 'kW_Total',          label: 'Puiss.(kW) Total',          groupe: 'calcule', unite: 'kW' },
  { key: 'kW_RetourA',        label: 'Puiss.(kW) Retour Ph.A',    groupe: 'calcule', unite: 'kW' },
  { key: 'kW_RetourB',        label: 'Puiss.(kW) Retour Ph.B',    groupe: 'calcule', unite: 'kW' },
  { key: 'kW_RetourC',        label: 'Puiss.(kW) Retour Ph.C',    groupe: 'calcule', unite: 'kW' },
  { key: 'kW_RetourTotal',    label: 'Puiss.(kW) Retour Total',   groupe: 'calcule', unite: 'kW' },
  // --- Classifieurs (jours d'activité + dates uniquement) ---
  { key: 'Date',              label: 'Date',                      groupe: 'classifieur' },
  { key: 'Date_longue',       label: 'Date longue',               groupe: 'classifieur' },
  { key: 'Jour',              label: 'Jour',                      groupe: 'classifieur' },
  { key: 'Mois',              label: 'Mois',                      groupe: 'classifieur' },
  { key: 'Annee',             label: 'Année',                     groupe: 'classifieur' },
  { key: 'Heure_complete',    label: 'Heure complète',            groupe: 'classifieur' },
  { key: 'Heure',             label: 'Heure',                     groupe: 'classifieur' },
  { key: 'Jour_activites',    label: "Jour d'activités",          groupe: 'classifieur' },
  { key: 'Heures_ensol',      label: "Heures d'ensoleillement",   groupe: 'classifieur' },
  { key: 'Heures_travail',    label: 'Heures travail',            groupe: 'classifieur' },
  { key: 'Periode_clim',      label: 'Période climatique',        groupe: 'classifieur' },
  { key: 'Saison',            label: 'Saison',                    groupe: 'classifieur' },
  { key: 'Periode',           label: 'Période',                   groupe: 'classifieur' },
  { key: 'Nom',               label: 'Nom',                       groupe: 'classifieur' },
  { key: 'Profil',            label: 'Profil',                    groupe: 'classifieur' },
  { key: 'Jour_sem_mesure',   label: 'Jour semaine mesure',       groupe: 'classifieur' },
  { key: 'Semaine_mesures',   label: 'Semaine mesures',           groupe: 'classifieur' },
  { key: 'Appareil',          label: 'Appareil',                  groupe: 'classifieur' },
  { key: 'Emplacement',       label: 'Emplacement',               groupe: 'classifieur' },
  { key: 'Piece',             label: 'Pièce / Zone',              groupe: 'classifieur' },
];

// ============================================================
// SÉRIES TEMPORELLES — données multi-sources normalisées
// ============================================================

export interface TimeSeriesRow {
  timestamp: Date;
  sourceId: string;
  puissanceKw: number;
  energieKwh: number;
  energieCumKwh: number;
  facteurPuissance?: number;
  tensionV?: number;
  courantA?: number;
  jourActivites?: ShellyRow['jourActivites'];
  saison?: ShellyRow['saison'];
  periodeclimatique?: ShellyRow['periodeclimatique'];
}

// ============================================================
// CALENDRIER — jours d'activité, horaires, jours fériés
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
  semaine: Record<number, JourConfig>; // 0=Dim, 1=Lun, ..., 6=Sam
  exceptions: { dateDebut: Date; dateFin: Date; description: string; plages: PlageHoraire[] }[];
}

export interface JourFerie {
  date: Date;
  nom: string;
  type: 'férie' | 'fête' | 'événement';
  actif: boolean;
}

// ============================================================
// DONNÉES TECHNIQUES (paramètres généraux — non-facturation)
// ============================================================

export interface DonneesTechniques {
  nJours: number;   // longueur de la période d'analyse (utilisé pour moyennes)
}

// ============================================================
// PROFIL DE CHARGE Shelly 3EM (sans facturation)
// ============================================================

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
  // ---- Puissances moyennes (kW) ----
  puissKwA: number;
  puissKwB: number;
  puissKwC: number;
  puissKwTotal: number;
  puissKwRetourA: number;
  puissKwRetourB: number;
  puissKwRetourC: number;
  puissKwRetourTotal: number;
  // ---- Classifieurs (jours d'activité + temps) ----
  jour: string;
  mois: string;
  annee: number;
  jourActivites: 'Jour ouvré' | 'Weekend' | 'Jour férié';
  heuresEnsoleillement: 'En ensoleillement' | 'Hors ensoleillement';
  heuresTravail: "Heures d'activités" | 'Heures hors activités';
  periodeclimatique: 'Période de fraîcheur' | 'Période chaude';
  saison: 'Sèche' | 'Hivernage';
  periode: 'Nuit' | 'Matin' | 'Après-midi' | 'Soir';
  profil: 'CHARGE' | 'SOUTIRAGE';
  // ---- Identification appareil ----
  nomAppareil?: string;
  deviceLocation?: string;
  deviceRoom?: string;
  // ---- Helpers ----
  kwhNet: number; // = kwhTotal - kwhRetourTotal
  isWeekend: boolean;
  isJourFerie: boolean;
  jourSemaine: string;
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
  parMois: Record<string, { kwhTotal: number; kwhNet: number; kwhRetour: number; nbJours: number }>;
  jourOuvre: { kwhMoyen: number; nbJours: number };
  weekend: { kwhMoyen: number; nbJours: number };
  ferieOuDimanche: { kwhMoyen: number; nbJours: number };
}

// ============================================================
// FICHIERS IMPORTÉS
// ============================================================

export interface ImportedFile {
  id: string;
  name: string;
  type: 'shelly' | 'autre' | 'facture';
  sourceId?: string;
  uploadedAt: Date;
  rowCount: number;
  columns: string[];
  preview: Record<string, unknown>[];
  rawData: Record<string, unknown>[];
  statut?: 'original' | 'nettoyé' | 'analysé';
  taille?: number;
  parentId?: string;
  deviceLocation?: string;
  deviceRoom?: string;
}

// ============================================================
// CONSTANTES
// ============================================================

export const JOURS_SEMAINE_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const JOURS_SEMAINE = JOURS_SEMAINE_COURT;

export const JOURS_SEMAINE_LONG = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];

export const MOIS_FR = [
  'janv', 'févr', 'mars', 'avr', 'mai', 'juin',
  'juil', 'août', 'sept', 'oct', 'nov', 'déc',
];

export const JOURS_FERIES_FIXES: { mois: number; jour: number; nom: string }[] = [
  { mois: 1, jour: 1, nom: "Jour de l'An" },
  { mois: 4, jour: 4, nom: "Fête de l'Indépendance" },
  { mois: 5, jour: 1, nom: "Fête du Travail" },
  { mois: 8, jour: 15, nom: "Assomption" },
  { mois: 11, jour: 1, nom: "Toussaint" },
  { mois: 12, jour: 25, nom: "Noël" },
];
