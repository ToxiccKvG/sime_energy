/**
 * Définition du questionnaire d'inspection (PV de visite) — partagée entre
 * le formulaire (components/audits/AuditQuestionnaire.tsx) et le générateur
 * du contexte projet JSON (services/project-context-builder.ts).
 * Toute section / champ ajouté ici apparaît automatiquement dans les deux.
 */
// ─── Schema types (not stored) ─────────────────────────────────────

export type PVSchemaFieldType = 'text' | 'textarea';

export interface PVSchemaField {
  id: string;
  label: string;
  type: PVSchemaFieldType;
}

export interface PVSchemaTableRowDef {
  id: string;
  label: string;
  subGroup?: string;
}

export interface PVSchemaCheckboxItemDef {
  id: string;
  label: string;
}

export interface PVSectionSchema {
  id: string;
  title: string;
  fields?: PVSchemaField[];
  tableRows?: PVSchemaTableRowDef[];
  tableMode?: 'system';
  checkboxItems?: PVSchemaCheckboxItemDef[];
  checkboxLabel?: string;
  extraCheckboxItems?: PVSchemaCheckboxItemDef[];
  extraCheckboxLabel?: string;
  hasFreeText?: boolean;
  freeTextLabel?: string;
  hasWoyofal?: boolean;
}

// ─── Schema Definition ────────────────────────────────────────────────────────

export const QUESTIONNAIRE_SCHEMA: PVSectionSchema[] = [
  {
    id: 's1',
    title: 'Informations Générales',
    fields: [
      { id: 'nomSite', label: 'Nom du site', type: 'text' },
      { id: 'activiteSite', label: 'Activité du site', type: 'text' },
      { id: 'localisation', label: 'Localisation (adresse précise)', type: 'text' },
      { id: 'dateVisite', label: 'Date et heure de la visite', type: 'text' },
      { id: 'responsableInspection', label: "Responsable de l'inspection (nom et fonction)", type: 'text' },
      { id: 'equipePresente', label: 'Équipe présente sur site', type: 'text' },
      { id: 'telephoneContact', label: 'Téléphone de contact sur site', type: 'text' },
      { id: 'objectifVisite', label: 'Objectif principal de la visite', type: 'text' },
      { id: 'conditionsMeteo', label: 'Conditions météorologiques détaillées', type: 'text' },
      { id: 'statutInitialPV', label: 'Statut initial du système photovoltaïque', type: 'text' },
      { id: 'observationsPreliminaires', label: 'Observations générales préliminaires', type: 'textarea' },
    ],
  },
  {
    id: 's2',
    title: 'Relevé Compteur SENELEC',
    hasWoyofal: true,
    checkboxLabel: 'Défaut réseau constaté',
    checkboxItems: [
      { id: 'tensionTropHaute', label: 'Tension trop haute' },
      { id: 'tensionTropBasse', label: 'Tension trop basse' },
      { id: 'frequenceTropHaute', label: 'Fréquence trop haute' },
      { id: 'frequenceTropBasse', label: 'Fréquence trop basse' },
      { id: 'coupureIntempestive', label: 'Coupure intempestive' },
    ],
  },
  {
    id: 's3',
    title: 'Caractéristiques Techniques de la Centrale PV',
    fields: [
      { id: 'puissanceInstalleeKwc', label: 'Puissance installée (kWc)', type: 'text' },
      { id: 'architecture', label: 'Architecture (centralisée, décentralisée)', type: 'text' },
      { id: 'systemeFixation', label: 'Système de fixation/intégration', type: 'text' },
      { id: 'dateMiseEnService', label: 'Date de mise en service', type: 'text' },
      { id: 'installateur', label: 'Installateur', type: 'text' },
      { id: 'exploitant', label: 'Exploitant', type: 'text' },
    ],
  },
  {
    id: 's4',
    title: 'Modules Photovoltaïques (PV)',
    fields: [
      { id: 'fabricantModeleType', label: 'Fabricant, modèle, type', type: 'text' },
      { id: 'numeroSerie', label: 'Numéro de série', type: 'text' },
      { id: 'puissanceCrete', label: 'Puissance crête (Pmax en Wc)', type: 'text' },
      { id: 'tensionPuissanceMax', label: 'Tension à puissance max. (Vmp)', type: 'text' },
      { id: 'courantPuissanceMax', label: 'Courant à puissance max. (Imp)', type: 'text' },
      { id: 'tensionCircuitOuvert', label: 'Tension circuit ouvert (Voc)', type: 'text' },
      { id: 'courantCourtCircuit', label: 'Courant court-circuit (Isc)', type: 'text' },
      { id: 'calibreFusible', label: 'Calibre du fusible maximal (IRM)', type: 'text' },
      { id: 'rendement', label: 'Rendement (%) sous conditions standard (STC)', type: 'text' },
      { id: 'dimensionsPoids', label: 'Dimensions, poids, nombre de cellules', type: 'text' },
      { id: 'garantie', label: 'Garantie produit et performance', type: 'text' },
    ],
  },
  {
    id: 's5',
    title: 'Onduleur',
    fields: [
      { id: 'marqueModeleSerieAnnee', label: 'Marque, modèle, numéro de série, année fabrication', type: 'text' },
      { id: 'typeOnduleur', label: "Type d'onduleur", type: 'text' },
      { id: 'puissanceNominale', label: 'Puissance nominale (kW)', type: 'text' },
      { id: 'plageTensionFrequence', label: 'Plage tension entrée (DC), tension et fréquence sortie (AC)', type: 'text' },
      { id: 'efficaciteMaximale', label: 'Efficacité maximale (%)', type: 'text' },
      { id: 'refroidissementCompatibilite', label: 'Méthode de refroidissement, compatibilité structure PV', type: 'text' },
      { id: 'dispositifsProtection', label: 'Dispositifs de protection, conformité normes', type: 'text' },
      { id: 'communicationMonitoring', label: "Communication et intégration à un système de monitoring", type: 'text' },
      { id: 'etatPhysiqueHistorique', label: 'État physique, température de fonctionnement, historique maintenance', type: 'textarea' },
      { id: 'zoneImplantation', label: "Zone d'implantation de l'onduleur", type: 'text' },
    ],
  },
  {
    id: 's6',
    title: 'Batterie',
    fields: [
      { id: 'marqueModeleSerieAnnee', label: 'Marque, modèle, numéro de série, année fabrication', type: 'text' },
      { id: 'typeBatterie', label: 'Type de batterie (lithium-ion, plomb-acide, etc.)', type: 'text' },
      { id: 'capaciteNominale', label: 'Capacité nominale (Ah ou kWh)', type: 'text' },
      { id: 'energieUtilisable', label: 'Énergie utilisable (kWh, %)', type: 'text' },
      { id: 'tensionNominale', label: 'Tension nominale (V)', type: 'text' },
      { id: 'dureeVieEstimee', label: 'Durée de vie estimée (cycles ou années)', type: 'text' },
      { id: 'plagesTension', label: "Plage de tension d'entrée et de sortie", type: 'text' },
      { id: 'courantMaxChargeDecharge', label: 'Courant maximal de charge/décharge', type: 'text' },
      { id: 'rendement', label: 'Rendement (%)', type: 'text' },
      { id: 'profondeurDecharge', label: 'Profondeur de décharge (DoD, %) / Compatibilité avec l\'installation existante', type: 'text' },
      { id: 'temperatureFonctionnement', label: 'Température de fonctionnement (plage en °C)', type: 'text' },
      { id: 'systemeBMS', label: "Présence d'un système de gestion (BMS) et ses fonctions", type: 'text' },
      { id: 'indiceProtection', label: 'Indice de protection (IP)', type: 'text' },
      { id: 'zoneInstallation', label: 'Zone d\'installation des batteries', type: 'text' },
    ],
  },
  {
    id: 's7',
    title: 'Câble DC & AC',
    fields: [
      { id: 'type', label: 'Type (isolé, résistant UV, monophasé/triphasé)', type: 'text' },
      { id: 'tensionNominaleSupportee', label: 'Tension nominale supportée (DC et AC)', type: 'text' },
      { id: 'sectionCables', label: 'Section câbles (en mm²)', type: 'text' },
      { id: 'materiauxIsolation', label: 'Matériaux conducteur (cuivre/aluminium) et isolation (PVC/XLPE)', type: 'text' },
      { id: 'normesCertifications', label: 'Normes et certifications appliquées', type: 'text' },
    ],
  },
  {
    id: 's8',
    title: 'Système Solaire Photovoltaïque',
    tableMode: 'system',
    tableRows: [
      { id: 'nombreLignes', label: 'Nombre de lignes', subGroup: 'Générateur PV' },
      { id: 'caracteristiquesLignes', label: 'Caractéristiques des lignes', subGroup: 'Générateur PV' },
      { id: 'dispositifsProtectionDC', label: 'Dispositifs de protection DC', subGroup: 'Générateur PV' },
      { id: 'parafoudre', label: 'Parafoudre', subGroup: 'Générateur PV' },
      { id: 'miseATerre', label: 'Mise à la terre', subGroup: 'Générateur PV' },
      { id: 'fusibles', label: 'Fusibles', subGroup: 'Générateur PV' },
      { id: 'sectionneursDS', label: 'Sectionneurs DC', subGroup: 'Générateur PV' },
      { id: 'typeStructurePorteuse', label: 'Type de structure porteuse', subGroup: 'Structure porteuse' },
      { id: 'materiaux', label: 'Matériaux', subGroup: 'Structure porteuse' },
      { id: 'nombreOnduleurs', label: "Nombre d'onduleurs", subGroup: 'Onduleurs' },
      { id: 'couplages', label: 'Couplages', subGroup: 'Onduleurs' },
      { id: 'chainesParTracker', label: 'Nombre de chaînes par tracker (MPP trackers)', subGroup: 'Onduleurs' },
      { id: 'courantCharge', label: 'Courant de charge', subGroup: 'Système de stockage' },
      { id: 'batteriesEnSerie', label: 'Nombre de batteries en série', subGroup: 'Système de stockage' },
      { id: 'chainesParallele', label: 'Nombre de chaînes en parallèle', subGroup: 'Système de stockage' },
      { id: 'batteriesParChaine', label: 'Nombre de batteries par chaîne', subGroup: 'Système de stockage' },
    ],
  },
  {
    id: 's9',
    title: 'Suivi Production à Distance (Monitoring)',
    checkboxLabel: 'Type de connexion',
    checkboxItems: [
      { id: 'adsl', label: 'ADSL' },
      { id: 'fibreOptique', label: 'Fibre optique' },
      { id: 'gprsMobile', label: 'GPRS mobile' },
      { id: 'sigfox', label: 'SIGFOX (onde radio)' },
      { id: 'm2mMobile', label: 'M2M mobile' },
      { id: 'ethernetLocal', label: 'Ethernet / Local' },
      { id: 'autre', label: 'Autre (préciser)' },
    ],
    fields: [
      { id: 'logicielMonitoring', label: 'Logiciel/plateforme de monitoring utilisée', type: 'text' },
      { id: 'accesDistant', label: 'Accès distant disponible (oui/non)', type: 'text' },
      { id: 'donneesEnregistrees', label: 'Données enregistrées (types de mesures)', type: 'textarea' },
    ],
  },
  {
    id: 's10',
    title: 'Exploitation & Sécurité',
    fields: [
      { id: 'planMaintenance', label: 'Plan de maintenance', type: 'text' },
      { id: 'documentMaintenance', label: 'Document de maintenance', type: 'text' },
      { id: 'chargeMaintenance', label: 'Chargé de la maintenance', type: 'text' },
      { id: 'chargeExploitation', label: "Chargé de l'exploitation (si maintenance externalisée)", type: 'text' },
      { id: 'extincteur', label: "Existence d'extincteur d'incendie aux lieux adéquats", type: 'text' },
      { id: 'pictogrammes', label: 'Pictogrammes de sensibilisation', type: 'text' },
    ],
  },
  {
    id: 's11',
    title: 'Inspection Visuelle Détaillée — Identification Anomalies',
    checkboxLabel: 'Anomalies constatées',
    checkboxItems: [
      { id: 'etatGeneral', label: "État général panneaux (hotspots, traces d'escargots, corrosion, encrassement, délamination, bris de verre, fissures)" },
      { id: 'etatCables', label: 'État câbles (pincement, frottements, présence de rongeurs, dégradations visibles)' },
      { id: 'etatConnecteurs', label: 'État connecteurs (brûlés, corrodés ou dégradés)' },
      { id: 'ombrages', label: 'Ombrage éventuel (végétation, obstacles physiques, accumulation de saletés)' },
      { id: 'propreteFiltres', label: "Propreté filtres onduleurs, espace ventilation (filtres obstrués, circulation d'air réduite)" },
      { id: 'zonesCirculation', label: "Zones de circulation autour champ PV (chemins libres, obstacles dangereux, marquage non clair)" },
      { id: 'prisesDeTerre', label: 'Présence et état des prises de terre (connexions visibles et en bon état)' },
      { id: 'onduleursEmplacement', label: "Emplacement et accessibilité des onduleurs (poussière, local non ventilé, accès non sécurisé)" },
      { id: 'fixationsStructures', label: 'Fixations et structures (état des supports — vis, rails, structures rouillées ou instables)' },
      { id: 'boitiersElectriques', label: "Boîtiers électriques (état des boîtes de jonction, serrage des connexions, étanchéité)" },
      { id: 'protectionSurtensions', label: 'Système de protection contre les surtensions (parafoudre)' },
      { id: 'alignementModules', label: 'Alignement des modules (décalages ou mouvements structurels)' },
    ],
    extraCheckboxLabel: 'Usages extérieurs',
    extraCheckboxItems: [
      { id: 'pompageStockage', label: "Pompage et stockage d'eau" },
      { id: 'arrosageAutomatique', label: 'Arrosage automatique des espaces verts' },
      { id: 'parkingService', label: 'Parking service ou privé (Véhicule)' },
      { id: 'eclairageExterieur', label: 'Éclairage extérieur' },
      { id: 'cameraSecurite', label: 'Caméras et systèmes de sécurité' },
      { id: 'barrieresPortails', label: 'Barrières automatiques et portails électriques' },
      { id: 'posteGardinage', label: 'Poste ou local de gardinage' },
    ],
    hasFreeText: true,
    freeTextLabel: 'Remarques et recommandations complémentaires',
  },
];

// ─── Codes courts Woyofal (SENELEC) ──────────────────────────────────────────

export const WOYOFAL_CODE_GROUPS: { group: string; codes: { code: string; label: string }[] }[] = [
  {
    group: 'Heures',
    codes: [
      { code: '803', label: "L'heure" },
      { code: '816', label: 'Heure dernier chargement' },
    ],
  },
  {
    group: 'Dates',
    codes: [
      { code: '802', label: 'La Date' },
      { code: '815', label: 'Date dernier chargement' },
    ],
  },
  {
    group: 'Consommation énergie (kWh)',
    codes: [
      { code: '800', label: "Consommation totale d'énergie (kWh)" },
      { code: '813', label: 'Consommation de la journée précédente (kWh)' },
      { code: '814', label: 'Consommation du mois en cours (kWh)' },
      { code: '820', label: 'Consommation du mois précédent M (kWh)' },
      { code: '821', label: 'Consommation du mois précédent M-1 (kWh)' },
      { code: '822', label: 'Consommation du mois précédent M-2 (kWh)' },
      { code: '823', label: 'Consommation du mois précédent M-3 (kWh)' },
      { code: '824', label: 'Consommation du mois précédent M-4 (kWh)' },
      { code: '825', label: 'Consommation du mois précédent M-5 (kWh)' },
    ],
  },
  {
    group: 'Crédits & Montants',
    codes: [
      { code: '801', label: 'Crédit restant (kWh disponibles)' },
      { code: '810', label: 'Crédit précharge' },
      { code: '811', label: 'Crédit urgence' },
      { code: '817', label: 'Montant kWh dernier recharge' },
    ],
  },
  {
    group: 'Codes de recharge (tokens)',
    codes: [
      { code: '830', label: 'Code du dernier recharge (N)' },
      { code: '831', label: 'Code recharge N-1' },
      { code: '832', label: 'Code recharge N-2' },
      { code: '833', label: 'Code recharge N-3' },
      { code: '834', label: 'Code recharge N-4' },
      { code: '835', label: 'Code recharge N-5' },
      { code: '836', label: 'Code recharge N-6' },
      { code: '837', label: 'Code recharge N-7' },
      { code: '838', label: 'Code recharge N-8' },
      { code: '839', label: 'Code recharge N-9' },
    ],
  },
  {
    group: 'Informations compteur',
    codes: [
      { code: '804', label: 'Numéro du compteur' },
      { code: '807', label: 'Statut compteur' },
      { code: '808', label: 'Puissance instantanée (W)' },
      { code: '809', label: 'Usage du compteur' },
      { code: '870', label: 'Tension (V)' },
    ],
  },
  {
    group: 'Paramètres & Configuration',
    codes: [
      { code: '805', label: 'SGC sécurité 600239' },
      { code: '806', label: 'Motif opération du relais' },
      { code: '812', label: 'Annulation alarme sonore' },
      { code: '865', label: 'Activation à la pose' },
      { code: '867', label: 'Activation après limitation puissance' },
      { code: '869', label: 'Limitation de puissance (kW)' },
    ],
  },
];

export const WOYOFAL_CODE_LABELS: Record<string, string> = Object.fromEntries(
  WOYOFAL_CODE_GROUPS.flatMap((g) => g.codes.map((c) => [c.code, c.label])),
);

// Input type per code for "Valeur relevée"
export const WOYOFAL_TIME_CODES = new Set(['803', '816']);
export const WOYOFAL_DATE_CODES = new Set(['802', '815']);
export const WOYOFAL_NUMBER_CODES = new Set(['800', '801', '808', '810', '811', '813', '814', '817', '820', '821', '822', '823', '824', '825', '869', '870']);
export const WOYOFAL_TOKEN_CODES = new Set(['830', '831', '832', '833', '834', '835', '836', '837', '838', '839']);

// ─── SENELEC compteur classique — table OBIS ────────────────────────────────
// key           : clé interne unique stockée (les lignes DATE/HEURE, dupliquées,
//                 ont un suffixe pour rester distinctes)
// code          : code OBIS affiché ('' pour les lignes DATE/HEURE, sans code)
// signification : mnémonique affiché dans le menu déroulant
// libelle       : description affichée (lecture seule) dans la colonne « Libellé »
export type ObisEntry = { key: string; code: string; signification: string; libelle: string };

export const OBIS_TABLE: ObisEntry[] = [
  { key: '1.8.0',        code: '1.8.0',   signification: 'Index cumulé instantané', libelle: 'Consommation du mois en cours' },
  { key: '1.8.0.1',      code: '1.8.0.1', signification: 'Index cumulé mémorisé',   libelle: 'Consommation du mois antérieur' },
  { key: '1.6.0',        code: '1.6.0',   signification: 'Max demande instantané',  libelle: 'Puissance maximale consommée du mois en cours' },
  { key: 'DATE_1.6.0',   code: 'DATE',    signification: 'Date du max demande instantané',  libelle: '' },
  { key: 'HEURE_1.6.0',  code: 'HEURE',   signification: 'Heure du max demande instantané', libelle: '' },
  { key: '1.6.0.1',      code: '1.6.0.1', signification: 'Max demande mémorisé',    libelle: 'Puissance maximale consommée du mois antérieur' },
  { key: 'DATE_1.6.0.1', code: 'DATE',    signification: 'Date du max demande mémorisé',    libelle: '' },
  { key: 'HEURE_1.6.0.1',code: 'HEURE',   signification: 'Heure du max demande mémorisé',   libelle: '' },
  { key: '1.8.1',        code: '1.8.1',   signification: 'K1 instantané', libelle: '' },
  { key: '1.8.1.1',      code: '1.8.1.1', signification: 'K1 mémorisé',   libelle: '' },
  { key: '1.8.2',        code: '1.8.2',   signification: 'K2 instantané', libelle: 'Consommation heure de pointe du mois en cours' },
  { key: '1.8.2.1',      code: '1.8.2.1', signification: 'K2 mémorisé',   libelle: 'Consommation heure de pointe du mois antérieur' },
  { key: '21.8.0',       code: '21.8.0',  signification: 'MONO1', libelle: 'Consommation phase 1' },
  { key: '41.8.0',       code: '41.8.0',  signification: 'MONO2', libelle: 'Consommation phase 2' },
  { key: '61.8.0',       code: '61.8.0',  signification: 'MONO3', libelle: 'Consommation phase 3' },
  { key: '3.8.0',        code: '3.8.0',   signification: 'Réactive instantané', libelle: '' },
  { key: '3.8.0.1',      code: '3.8.0.1', signification: 'Réactive mémorisé',   libelle: '' },
  { key: '13.7.0',       code: '13.7.0',  signification: 'Cos Phi', libelle: '' },
  { key: '0.9.2',        code: '0.9.2',   signification: 'Date réelle', libelle: '' },
  { key: '0.9.1',        code: '0.9.1',   signification: 'Heure réelle', libelle: '' },
  { key: 'C.7.30',       code: 'C.7.30',  signification: 'Durée de fonctionnement en minutes', libelle: '' },
];

export const OBIS_BY_KEY: Record<string, ObisEntry> = Object.fromEntries(OBIS_TABLE.map((e) => [e.key, e]));

// Libellé du menu déroulant : « code → signification » (ou signification seule si sans code)
export const obisOptionLabel = (e: ObisEntry) => e.code ? `${e.code} → ${e.signification}` : e.signification;
