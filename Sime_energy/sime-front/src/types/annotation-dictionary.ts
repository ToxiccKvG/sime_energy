/**
 * Types pour le dictionnaire d'annotation
 * Définit les champs obligatoires à extraire des factures
 */

export interface AnnotationField {
  /** Identifiant unique du champ */
  id: string;
  /** Nom/clé du champ - doit être unique (sera utilisé comme nom de colonne Excel) */
  key: string;
  /** Description optionnelle du champ */
  description?: string;
  /** Indique si le champ est obligatoire pour valider une facture */
  required: boolean;
  /** Catégorie du champ (forms uniquement maintenant) */
  category: 'forms';
}

/**
 * Type de disposition des en-têtes dans un tableau
 */
export type TableHeaderLayout = 'row' | 'column' | 'both';

/**
 * Définition d'une en-tête dans un template de tableau
 */
export interface TableHeaderDefinition {
  /** Nom de l'en-tête (ce qu'on cherche dans le tableau) */
  name: string;
  /** Position : 'row' = en-tête de colonne (1ère ligne), 'column' = en-tête de ligne (1ère colonne) */
  position: 'row' | 'column';
  /** Index dans la structure (0 = première colonne/ligne) */
  index: number;
}

/**
 * Modèle de tableau attendu avec structure visuelle
 */
export interface TableTemplate {
  /** Identifiant unique du modèle */
  id: string;
  /** Nom du modèle (ex: "Détail consommation", "Récapitulatif") */
  name: string;
  /** Description optionnelle */
  description?: string;
  /** Disposition des en-têtes */
  headerLayout: TableHeaderLayout;
  /** Nombre de colonnes attendues (approximatif) */
  columnCount: number;
  /** Nombre de lignes de données attendues (0 = variable) */
  rowCount: number;
  /** En-têtes de colonnes (première ligne) */
  columnHeaders: string[];
  /** En-têtes de lignes (première colonne) - pour les tableaux à double entrée */
  rowHeaders: string[];
  /** Indique si ce modèle de tableau est obligatoire */
  required: boolean;
  /** Mappings pour l'export Excel */
  excelMappings?: ExcelMapping[];
}

export interface ExcelMappingSource {
  /** Nom de colonne (en-tête) */
  column?: string;
  /** Nom d'en-tête de ligne */
  rowHeader?: string;
  /** Index de ligne (fallback si pas d'en-tête) */
  rowIndex?: number;
  /** Index de colonne (fallback si pas d'en-tête) */
  colIndex?: number;
  /** Intersection explicite colonne + en-tête de ligne */
  combine?: {
    column: string;
    rowHeader?: string;
  };
}

export type ExcelMappingTransform = 'number' | 'date' | 'string';

export interface ExcelMapping {
  /** Nom de colonne cible dans l'export Excel */
  target: string;
  /** Source à extraire depuis le tableau */
  source: ExcelMappingSource;
  /** Transformation optionnelle */
  transform?: ExcelMappingTransform;
  /** Valeur par défaut si non trouvée */
  default?: string | number | null;
}

export interface AnnotationDictionary {
  /** Identifiant unique du dictionnaire */
  id: string;
  /** Nom du dictionnaire (ex: "Moyenne Tension", "Basse Tension") */
  name: string;
  /** Description optionnelle */
  description?: string;
  /** Couleur du dictionnaire pour identification visuelle */
  color?: string;
  /** Liste des champs du dictionnaire (key-value) */
  fields: AnnotationField[];
  /** Modèles de tableaux attendus */
  tableTemplates: TableTemplate[];
  /** Date de création */
  createdAt: string;
  /** Date de dernière modification */
  updatedAt: string;
}

/**
 * Paramètres d'affichage pour l'annotation
 */
export interface AnnotationDisplaySettings {
  /** Afficher les labels sur les bounding boxes */
  showLabels: boolean;
  /** ID du dictionnaire actuellement sélectionné */
  selectedDictionaryId: string | null;
}

/**
 * Collection de dictionnaires pour une organisation
 */
export interface AnnotationDictionaryCollection {
  /** Liste des dictionnaires disponibles */
  dictionaries: AnnotationDictionary[];
  /** Paramètres d'affichage */
  displaySettings: AnnotationDisplaySettings;
}

export interface FieldValidationResult {
  /** Clé du champ */
  fieldKey: string;
  /** Statut de validation */
  status: 'valid' | 'missing' | 'extra';
  /** Champ du dictionnaire correspondant (si trouvé) */
  matchedDictionaryField?: AnnotationField;
  /** Message d'information */
  message?: string;
}

/**
 * Résultat de reconnaissance d'un tableau
 */
export interface TableRecognitionResult {
  /** Index du tableau dans la liste */
  tableIndex: number;
  /** Indique si le tableau a été reconnu (match >= seuil) */
  isRecognized: boolean;
  /** Modèle correspondant (si reconnu) */
  matchedTemplate?: TableTemplate;
  /** Pourcentage de correspondance (0-100) */
  matchPercentage: number;
  /** En-têtes de colonnes trouvées */
  foundColumnHeaders: string[];
  /** En-têtes de colonnes manquantes */
  missingColumnHeaders: string[];
  /** En-têtes de lignes trouvées */
  foundRowHeaders: string[];
  /** En-têtes de lignes manquantes */
  missingRowHeaders: string[];
  /** Toutes les cellules textuelles du tableau */
  allCellTexts: string[];
}

export interface ValidationResult {
  /** Indique si la validation est passée (tous les champs obligatoires présents) */
  isValid: boolean;
  /** Liste des champs manquants (obligatoires) */
  missingRequiredFields: AnnotationField[];
  /** Liste des champs supplémentaires (non dans le dictionnaire) */
  extraFields: string[];
  /** Détail de validation par champ */
  fieldResults: FieldValidationResult[];
  /** Résultats de reconnaissance des tableaux */
  tableRecognition: TableRecognitionResult[];
  /** Modèles de tableaux obligatoires non trouvés */
  missingRequiredTables: TableTemplate[];
  /** Message global */
  message: string;
}

/** Seuil de reconnaissance d'un tableau (70%) */
export const TABLE_RECOGNITION_THRESHOLD = 0.7;

/** Couleurs prédéfinies pour les dictionnaires */
export const DICTIONARY_COLORS = [
  { name: 'Émeraude', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Jaune', value: '#eab308' },
  { name: 'Slate', value: '#64748b' },
];

/** Paramètres d'affichage par défaut */
export const DEFAULT_DISPLAY_SETTINGS: AnnotationDisplaySettings = {
  showLabels: true,
  selectedDictionaryId: null,
};

/** Dictionnaire par défaut avec les champs classiques d'une facture */
export const DEFAULT_ANNOTATION_DICTIONARY: AnnotationDictionary = {
  id: 'default',
  name: 'Général',
  description: 'Champs standards pour les factures d\'énergie',
  color: '#10b981',
  fields: [
    {
      id: 'invoice_number',
      key: 'Numéro de facture',
      description: 'Identifiant unique de la facture',
      required: true,
      category: 'forms',
    },
    {
      id: 'invoice_date',
      key: 'Date de facturation',
      description: 'Date d\'émission de la facture',
      required: true,
      category: 'forms',
    },
    {
      id: 'due_date',
      key: 'Date d\'échéance',
      description: 'Date limite de paiement',
      required: false,
      category: 'forms',
    },
    {
      id: 'supplier',
      key: 'Fournisseur',
      description: 'Nom du fournisseur d\'énergie',
      required: true,
      category: 'forms',
    },
    {
      id: 'customer',
      key: 'Client',
      description: 'Nom du client',
      required: false,
      category: 'forms',
    },
    {
      id: 'total_amount',
      key: 'Montant TTC',
      description: 'Montant total toutes taxes comprises',
      required: true,
      category: 'forms',
    },
    {
      id: 'amount_ht',
      key: 'Montant HT',
      description: 'Montant hors taxes',
      required: false,
      category: 'forms',
    },
    {
      id: 'consumption',
      key: 'Consommation',
      description: 'Consommation d\'énergie (kWh, m³, etc.)',
      required: false,
      category: 'forms',
    },
  ],
  tableTemplates: [
    {
      id: 'consumption_detail',
      name: 'Détail consommation',
      description: 'Tableau détaillant la consommation par période',
      headerLayout: 'row',
      columnCount: 5,
      rowCount: 0, // Variable
      columnHeaders: ['Période', 'Index début', 'Index fin', 'Consommation', 'Montant'],
      rowHeaders: [],
      required: false,
      excelMappings: [],
    },
    {
      id: 'billing_summary',
      name: 'Récapitulatif facturation',
      description: 'Résumé des montants facturés',
      headerLayout: 'row',
      columnCount: 4,
      rowCount: 0,
      columnHeaders: ['Description', 'Quantité', 'Prix unitaire', 'Montant'],
      rowHeaders: [],
      required: false,
      excelMappings: [],
    },
    {
      id: 'double_entry',
      name: 'Tarification horaire',
      description: 'Tableau à double entrée avec heures et jours',
      headerLayout: 'both',
      columnCount: 4,
      rowCount: 3,
      columnHeaders: ['Heures Pleines', 'Heures Creuses', 'Total'],
      rowHeaders: ['Consommation', 'Prix unitaire', 'Montant'],
      required: false,
      excelMappings: [],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Dictionnaire exemple pour Moyenne Tension */
export const MOYENNE_TENSION_DICTIONARY: AnnotationDictionary = {
  id: 'moyenne_tension',
  name: 'Moyenne Tension',
  description: 'Champs spécifiques aux factures moyenne tension',
  color: '#06b6d4',
  fields: [
    {
      id: 'mt_pdl',
      key: 'PDL',
      description: 'Point de livraison',
      required: true,
      category: 'forms',
    },
    {
      id: 'mt_puissance',
      key: 'Puissance souscrite',
      description: 'Puissance en kVA',
      required: true,
      category: 'forms',
    },
    {
      id: 'mt_tarif',
      key: 'Option tarifaire',
      description: 'Type de tarif (ex: TURPE)',
      required: true,
      category: 'forms',
    },
    {
      id: 'mt_conso_hp',
      key: 'Consommation HP',
      description: 'Consommation heures pleines',
      required: false,
      category: 'forms',
    },
    {
      id: 'mt_conso_hc',
      key: 'Consommation HC',
      description: 'Consommation heures creuses',
      required: false,
      category: 'forms',
    },
  ],
  tableTemplates: [
    {
      id: 'mt_detail_conso',
      name: 'Détail par poste horosaisonnier',
      description: 'Consommation par tranche horaire',
      headerLayout: 'row',
      columnCount: 4,
      rowCount: 0,
      columnHeaders: ['Poste', 'Consommation', 'Prix unitaire', 'Montant'],
      rowHeaders: [],
      required: false,
      excelMappings: [],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Collection par défaut avec dictionnaire général */
export const DEFAULT_DICTIONARY_COLLECTION: AnnotationDictionaryCollection = {
  dictionaries: [DEFAULT_ANNOTATION_DICTIONARY],
  displaySettings: DEFAULT_DISPLAY_SETTINGS,
};
