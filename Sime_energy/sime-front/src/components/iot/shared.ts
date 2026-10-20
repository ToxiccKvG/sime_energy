// ============================================================
// IOT MODULE — Shared Types
// Pas de facturation ni de coûts dans le module IOT (module Facturation).
// Conservé ici : mesures énergie, capteurs, calendrier, jours d'activité.
//
// Les « sources » ne sont plus un modèle local : une source est un rôle
// électrique rattaché à un appareil (table shelly_device_roles, voir
// lib/shelly-device-role-service.ts et SourcesTab.tsx). L'ancien modèle
// riche (types SENELEC/PV…, modes A–F, transfert, tableaux, profils Mi)
// a été retiré le 2026-09-16 : aucun calcul ne le lisait.
// ============================================================

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
  // --- Données d'entrée — capteurs environnementaux (CAPTEUR_ENV / ETAT) ---
  { key: 'Temperature',       label: 'Température',               groupe: 'entree', unite: '°C' },
  { key: 'Humidite',          label: 'Humidité',                  groupe: 'entree', unite: '%' },
  { key: 'Ressenti',          label: 'Température ressentie',     groupe: 'entree', unite: '°C' },
  { key: 'Point_Rosee',       label: 'Point de rosée',             groupe: 'entree', unite: '°C' },
  { key: 'UV_Index',          label: 'Indice UV',                 groupe: 'entree' },
  { key: 'Luminosite',        label: 'Luminosité',                groupe: 'entree', unite: 'lux' },
  { key: 'Pression',          label: 'Pression atmosphérique',    groupe: 'entree', unite: 'hPa' },
  { key: 'Tendance_Pression', label: 'Tendance de pression',      groupe: 'entree' },
  { key: 'Precipitation',     label: 'Précipitations (cumul)',    groupe: 'entree', unite: 'mm' },
  { key: 'Precipitation_Incr', label: 'Pluie par intervalle',     groupe: 'calcule', unite: 'mm' },
  { key: 'Mesure_Le',         label: 'Heure réelle de mesure',    groupe: 'entree' },
  { key: 'Alarme_Humidite',   label: 'Alarme pluie/humidité',     groupe: 'entree' },
  { key: 'Vent_Vitesse',      label: 'Vitesse du vent',           groupe: 'entree', unite: 'm/s' },
  { key: 'Vent_Rafale',       label: 'Rafale de vent',            groupe: 'entree', unite: 'm/s' },
  { key: 'Vent_Direction',    label: 'Direction du vent',         groupe: 'entree', unite: '°' },
  { key: 'Etat_Capteur',      label: 'État',                      groupe: 'entree' },
  { key: 'Angle_Inclinaison', label: 'Angle inclinaison',         groupe: 'entree', unite: '°' },
  { key: 'Concentration_Gaz', label: 'Concentration gaz',         groupe: 'entree', unite: 'ppm' },
  { key: 'Temp_Interne',      label: 'Température interne appareil', groupe: 'entree', unite: '°C' },
  { key: 'Batterie',          label: 'Batterie',                  groupe: 'entree', unite: '%' },
  { key: 'Batterie_V',        label: 'Tension batterie',          groupe: 'entree', unite: 'V' },
  { key: 'Signal',            label: 'Signal (RSSI)',             groupe: 'entree', unite: 'dBm' },
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
  // 'Journée' : ligne journalière (Courbe de charge), qui couvre les deux tranches
  heuresEnsoleillement: 'En ensoleillement' | 'Hors ensoleillement' | 'Journée';
  heuresTravail: "Heures d'activités" | 'Heures hors activités' | 'Journée';
  periodeclimatique: 'Période de fraîcheur' | 'Période chaude';
  saison: 'Sèche' | 'Hivernage';
  // 'Journée' : ligne journalière (Courbe de charge), pas une tranche horaire
  periode: 'Nuit' | 'Matin' | 'Après-midi' | 'Soir' | 'Journée';
  profil: 'CHARGE' | 'SOUTIRAGE';
  // ---- Identification appareil ----
  nomAppareil?: string;
  deviceLocation?: string;
  deviceRoom?: string;
  // ---- Capteurs environnementaux (CAPTEUR_ENV / ETAT) ----
  temperature?: number;
  humidite?: number;
  ressenti?: number;
  pointRosee?: number;
  uvIndex?: number;
  luminosite?: number;
  pression?: number;
  tendancePression?: string;
  precipitation?: number;           // CUMUL du pluviomètre depuis son installation (jamais filtré)
  precipitationIncr?: number;       // pluie tombée depuis la mesure précédente du même appareil (calculée)
  mesureAt?: Date;                  // heure RÉELLE de la mesure (measured_at) : distingue une mesure d'une relecture
  alarmeHumidite?: boolean;
  ventVitesse?: number;
  ventRafale?: number;
  ventDirection?: number;
  etatCapteur?: string;
  angleInclinaison?: number;
  concentrationGaz?: number;
  tempInterne?: number;
  batterie?: number;
  batterieV?: number;
  signal?: number;
  // Grandeurs d'un fichier importé quelconque (PM2.5, tension, CO₂…),
  // clé = « libellé (unité) » — voir lib/iot-lecture-fichier.ts
  grandeurs?: Record<string, number>;
  // ---- Qualité (source fn_profil_charge ; absents pour un fichier importé) ----
  deviceId?: string;
  deviceFamily?: string;            // ENERGIE_1PH, LUMIERE…
  role?: string | null;             // shelly_device_roles : M1_RESEAU, DEPART…
  nbHeures?: number;                // heures présentes ce jour dans la plage
  // Part de la journée en quarantaine (fn_qualite, règles d'action « quarantaine »).
  // Les champs kWh ci-dessus restent BRUTS ; le nettoyage soustrait s'il est activé.
  quarantaine?: {
    kwh: number; kwhRetour: number; kwhA: number; kwhB: number; kwhC: number;
    heures: number; regles: string[];
  };
  // ---- Helpers ----
  kwhNet: number; // = kwhTotal - kwhRetourTotal
  // Flux par rôle (ligne synthétique « site », bilanParRole) : kWh
  flux?: FluxRoles;
  isWeekend: boolean;
  isJourFerie: boolean;
  jourSemaine: string;
}

// Énergie par rôle électrique (kWh). null = rien mesuré pour ce rôle.
export interface FluxRoles {
  reseauSoutire: number | null;   // M1_RESEAU, consommation
  reseauInjecte: number | null;   // M1_RESEAU, injection
  pv: number | null;              // M5_PV, production (sens inverse appliqué)
  groupe: number | null;          // M4_GROUPE
  charge: number | null;          // M3_CHARGE
  departs: number | null;         // DEPART
}

// Une journée calendaire, toutes lignes confondues (appareils, pas horaires)
export interface JourAgrege {
  date: Date;
  mois: string;
  annee: number;
  jourActivites: ShellyRow['jourActivites'];
  isWeekend: boolean;
  isJourFerie: boolean;
  kwhA: number;
  kwhB: number;
  kwhC: number;
  kwhTotal: number;
  kwhRetourTotal: number;
  kwhNet: number;
  // Puissance moyenne du jour = kWh / 24 h
  puissKwA: number;
  puissKwB: number;
  puissKwC: number;
  puissKwTotal: number;
  nbLignes: number;
  // Flux par rôle de la journée (somme des lignes « site ») — absent pour un fichier
  flux?: FluxRoles;
  // Raison pour laquelle le jour est écarté de la moyenne, du min et du max
  // (il reste dans le total). Absent = jour retenu.
  exclu?: string;
}

export interface ShellyAnalyse {
  rows: ShellyRow[];
  parJour: JourAgrege[];
  nbJoursRetenus: number;
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
  type: 'shelly' | 'autre';
  uploadedAt: Date;
  rowCount: number;
  columns: string[];
  preview: Record<string, unknown>[];
  /**
   * Contenu complet. Vide tant que `contentLoaded` est false : les
   * fichiers viennent de la base sans leur contenu, chargé à la demande
   * via `ensureFileContent` (IOTContext). Ne pas tester `rawData.length`
   * pour savoir si un fichier est vide — tester `contentLoaded` d'abord.
   */
  rawData: Record<string, unknown>[];
  contentLoaded?: boolean;
  statut?: 'original' | 'nettoyé' | 'analysé';
  taille?: number;
  parentId?: string;
  deviceLocation?: string;
  deviceRoom?: string;
  /** Lecture d'un fichier hors formats Shelly : enregistrée à l'import, rejouée par l'Analyse. */
  lecture?: LectureFichier;
}

/** Rôle d'une colonne d'un fichier importé. */
export type RoleColonne = 'energie' | 'retour' | 'puissance' | 'grandeur' | 'ignorer';

export interface LectureColonne {
  col: string;
  libelle: string;
  unite: string;
  role: RoleColonne;
  /** Index cumulatif (compteur) : l'énergie est la différence entre deux relevés. */
  cumul?: boolean;
  /** Énergie d'une seule phase (sinon : total). Sans colonne total, le total = A + B + C. */
  phase?: 'A' | 'B' | 'C';
  /** Pourquoi la colonne est écartée par défaut (vide, texte, constante…). */
  motif?: string;
}

export interface LectureFichier {
  version: 1;
  colDate: string;
  /** Colonne heure séparée ('' si la date porte l'heure). */
  colHeure: string;
  /** jma = jour/mois/année, mja = mois/jour/année (exports US), iso = année en tête. */
  ordreDates: 'jma' | 'mja' | 'iso';
  colonnes: LectureColonne[];
  /** Ce que mesure le fichier : une production (PV) est rangée comme le PV des sites (rôle M5_PV). */
  sens?: 'consommation' | 'production';
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
