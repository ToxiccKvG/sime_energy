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
  /**
   * Variantes alternatives acceptées pour ce champ.
   * Permet de matcher les clés brutes Textract (ex: "FACTURE N°") ET les clés
   * normalisées Mistral (ex: "NUMERO_FACTURE") sur un même champ du dictionnaire.
   */
  aliases?: string[];
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
      // Textract brut + Mistral UPPER_SNAKE_CASE
      aliases: ['NUMERO_FACTURE', 'FACTURE N°', 'FACTURE N', 'N° FACTURE', 'FACTURE NO', 'NUMERO FACTURE', 'INVOICE NUMBER', 'FACTURE_NO'],
    },
    {
      id: 'invoice_date',
      key: 'Date de facturation',
      description: 'Date d\'émission de la facture',
      required: true,
      category: 'forms',
      aliases: ['DATE_COMPTABLE_FACTURE', 'DATE', 'DATE FACTURE', 'DATE FACTURATION', 'INVOICE DATE', 'DATE_FACTURE'],
    },
    {
      id: 'due_date',
      key: 'Date d\'échéance',
      description: 'Date limite de paiement',
      required: false,
      category: 'forms',
      aliases: ['DATE_LIMITE_PAIEMENT', 'DATE LIMITE DE PAIEMENT', 'DATE LIMITE', 'DUE DATE', 'ECHEANCE'],
    },
    {
      id: 'supplier',
      key: 'Fournisseur',
      description: 'Nom du fournisseur / client',
      required: true,
      category: 'forms',
      aliases: ['NOM_OU_RAISON_SOCIALE', 'NOM OU RAISON SOCIALE', 'FOURNISSEUR', 'SUPPLIER', 'NOM RAISON SOCIALE', 'RAISON SOCIALE', 'NOM_RAISON_SOCIALE'],
    },
    {
      id: 'customer',
      key: 'Client',
      description: 'Nom du client',
      required: false,
      category: 'forms',
      aliases: ['CLIENT', 'CUSTOMER', 'NOM CLIENT'],
    },
    {
      id: 'total_amount',
      key: 'Montant TTC',
      description: 'Montant total toutes taxes comprises',
      required: true,
      category: 'forms',
      // Inclut l'artefact apostrophe Textract + toutes les variantes SENELEC
      aliases: ['MONTANT_TTC', 'MONTANT TOTAL', "MONTANT TOTAL':", "MONTANT TOTAL :", 'MONTANT TOTAL:', 'TOTAL TTC', 'MONTANT FACTURE', 'TOTAL FACTURE', 'AMOUNT', 'MONTANT TTC'],
    },
    {
      id: 'amount_ht',
      key: 'Montant HT',
      description: 'Montant hors taxes',
      required: false,
      category: 'forms',
      aliases: ['MONTANT_HTVA', 'MONTANT HTVA', 'MONTANT HT', 'MONTANT HORS TVA', 'AMOUNT_HT'],
    },
    {
      id: 'consumption',
      key: 'Consommation',
      description: 'Consommation d\'énergie (kWh, m³, etc.)',
      required: false,
      category: 'forms',
      aliases: ['CONSOMMATION_KWH', 'CONSOMMATION', 'CONSUMPTION', 'CONSOMMATION KWH', 'CONSO'],
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

/**
 * Dictionnaire SENELEC — couvre 100% des champs d'une facture SENELEC (BT + MT/MTG).
 * Chaque champ a sa clé normalisée Mistral ET les variantes brutes Textract
 * (avec artefacts colon, parenthèses, espaces, etc.).
 */
export const SENELEC_DICTIONARY: AnnotationDictionary = {
  id: 'senelec',
  name: 'SENELEC',
  description: 'Tous les champs factures SENELEC (BT + MT/MTG)',
  color: '#f97316',
  fields: [
    // ─── CHAMPS REQUIS ─────────────────────────────────────────────────────────
    {
      id: 'sn_facture_no',
      key: 'Numéro de facture',
      description: 'Numéro de la facture',
      required: true,
      category: 'forms',
      aliases: ['NUMERO_FACTURE', 'FACTURE N°', 'FACTURE N', 'N° FACTURE', 'FACTURE NO'],
    },
    {
      id: 'sn_date',
      key: 'Date de facturation',
      description: 'Date comptable de la facture',
      required: true,
      category: 'forms',
      aliases: ['DATE_COMPTABLE_FACTURE', 'DATE', 'DATE FACTURE', 'DATE_FACTURE'],
    },
    {
      id: 'sn_client',
      key: 'Nom / Raison sociale',
      description: 'Nom ou raison sociale du client',
      required: true,
      category: 'forms',
      aliases: [
        'NOM_OU_RAISON_SOCIALE', 'NOM OU RAISON SOCIALE', 'NOM OU RAISON SOCIALE :',
        'NOM RAISON SOCIALE', 'RAISON SOCIALE', 'CLIENT',
      ],
    },
    {
      id: 'sn_montant_ttc',
      key: 'Montant TTC',
      description: 'Montant total de la facture (TOTAL FACTURE)',
      required: true,
      category: 'forms',
      aliases: [
        'MONTANT_TTC', 'MONTANT TOTAL', "MONTANT TOTAL':", 'MONTANT TOTAL :',
        'MONTANT TOTAL(1)', 'MONTANT_TTC_TOTAL', 'TOTAL TTC', 'MONTANT FACTURE',
        // MTG tariff label
        'Montant Total TTC', 'MONTANT TOTAL TTC', 'MONTANT_TOTAL_TTC',
      ],
    },
    // ─── IDENTIFICATION ────────────────────────────────────────────────────────
    {
      id: 'sn_n_client',
      key: 'N° client',
      description: 'Numéro de client SENELEC',
      required: false,
      category: 'forms',
      aliases: ['N°CLIENT', 'N° CLIENT', 'N°CLIENT :', 'NUMERO CLIENT', 'CLIENT_ID'],
    },
    {
      id: 'sn_compte_contrat',
      key: 'Numéro compte contrat',
      description: 'Référence du compte contrat',
      required: false,
      category: 'forms',
      aliases: [
        'NUMERO_COMPTE_CONTRAT', 'N° COMPTE DE CONTRAT', 'N°COMPTE DE CONTRAT',
        'N° COMPTE CONTRAT', 'COMPTE CONTRAT', 'NUMERO COMPTE', 'N°COMPTE DE', 'N°COMPTE',
      ],
    },
    {
      id: 'sn_compteur',
      key: 'Numéro compteur',
      description: 'Numéro de série du compteur',
      required: false,
      category: 'forms',
      aliases: ['NUMERO_COMPTEUR', 'COMPTEUR', 'N° COMPTEUR', 'NUMERO COMPTEUR'],
    },
    {
      id: 'sn_bordereau',
      key: 'Bordereau / Rang',
      description: 'Référence bordereau et rang',
      required: false,
      category: 'forms',
      aliases: ['BORDEREAU_RANG', 'BORDEREAU / RANG', 'BORDEREAU', 'BORDEREAU/RANG'],
    },
    {
      id: 'sn_type_facture',
      key: 'Type de facturation',
      description: 'Type de facturation (CYCLIQUE, etc.)',
      required: false,
      category: 'forms',
      aliases: [
        'TYPE_TARIF_TEXTE', 'TYPE DE FACTURE', 'TYPE DE FACTURE :', 'TYPE FACTURE',
        'TYPE_FACTURE',
      ],
    },
    // ─── ADRESSE ──────────────────────────────────────────────────────────────
    {
      id: 'sn_adresse',
      key: 'Adresse de présentation',
      description: 'Adresse postale du client',
      required: false,
      category: 'forms',
      aliases: [
        'ADRESSE_PRESENTATION', 'ADRESSE PRESENTATION', 'ADRESSE',
        'RUE',
      ],
    },
    {
      id: 'sn_adresse_livraison',
      key: 'Adresse du point de livraison',
      description: 'Adresse physique du site de consommation',
      required: false,
      category: 'forms',
      aliases: [
        'ADRESSE DU POINT DE LIVRAISON', 'ADRESSE POINT DE LIVRAISON',
        'ADRESSE_LIVRAISON', 'POINT DE LIVRAISON',
      ],
    },
    // ─── PÉRIODE ──────────────────────────────────────────────────────────────
    {
      id: 'sn_periode_du',
      key: 'Période du',
      description: 'Date de début de la période de facturation',
      required: false,
      category: 'forms',
      aliases: ['PERIODE_DU', 'PERIODE DU', 'DU', 'DATE DEBUT PERIODE'],
    },
    {
      id: 'sn_periode_au',
      key: 'Période au',
      description: 'Date de fin de la période de facturation',
      required: false,
      category: 'forms',
      aliases: ['PERIODE_AU', 'AU', 'PERIODE AU', 'DATE FIN PERIODE'],
    },
    {
      id: 'sn_nbr_jours',
      key: 'Nombre de jours',
      description: 'Nombre de jours de la période',
      required: false,
      category: 'forms',
      aliases: ['NBR_JOURS', 'NOMBRE DE JOURS', 'NOMBRE DE JOURS (N)', 'NB JOUR', 'JOURS',
        'NOMBRE DE OURS (N)',   // OCR artifact: Textract sometimes drops "J" from "JOURS"
      ],
    },
    // ─── TECHNIQUE ────────────────────────────────────────────────────────────
    {
      id: 'sn_puissance',
      key: 'Puissance souscrite',
      description: 'Puissance souscrite (W ou kW selon tarif)',
      required: false,
      category: 'forms',
      aliases: [
        'PUISSANCE_SOUSCRITE', 'PUISSANCE SOUSCRITE', 'PUISSANCE SOUSCRITE (W)',
        'PUISSANCE SOUSCRITE(W)', 'PUISSANCE_SOUSCRITE_W',
        // MTG uses kW
        'PUISSANCE SOUSCRITE (kW)', 'PUISSANCE SOUSCRITE (KW)',
        'PUISSANCE SOUSCRITE (kW) :', 'PUISSANCE SOUSCRITE (KW) :', 'PUISSANCE_SOUSCRITE_KW',
      ],
    },
    {
      id: 'sn_consommation',
      key: 'Consommation (kWh)',
      description: 'Consommation en kWh',
      required: false,
      category: 'forms',
      aliases: [
        'CONSOMMATION_KWH', 'CONSOMMATION (KWH)', 'CONSOMMATION KWH',
        'CONSOMMATION(KWH)', 'CONSOMMATION',
      ],
    },
    // ─── MONTANTS ─────────────────────────────────────────────────────────────
    {
      id: 'sn_montant_conso',
      key: 'Montant consommation',
      description: 'Montant de la consommation hors taxes',
      required: false,
      category: 'forms',
      aliases: [
        'MONTANT_CONSOMMATION', 'MONTANT CONSOMMATION', 'MONTANT CONSOMMATION :',
        'MONTANT_TOTAL_ENERGIE',
      ],
    },
    {
      id: 'sn_tco',
      key: 'TCO (2,5%)',
      description: 'Taxe communale sur l\'occupation (2,5%)',
      required: false,
      category: 'forms',
      aliases: [
        'TAXE_COMMUNALE', 'TCO (2,5%)', 'TCO (2,5%) :', 'TCO (2.5%) :', 'TCO',
        'TCO 2,5%', 'TCO2.5', 'TAXE COMMUNALE',
      ],
    },
    {
      id: 'sn_redevance',
      key: 'Redevance',
      description: 'Montant de la redevance',
      required: false,
      category: 'forms',
      aliases: ['MONTANT_REDEVANCE', 'REDEVANCE', 'REDEVANCE :', 'REDEVANCE_MONTANT'],
    },
    {
      id: 'sn_base_tva',
      key: 'Base calcul TVA',
      description: 'Base de calcul de la TVA',
      required: false,
      category: 'forms',
      aliases: [
        'BASE_CALCUL_TVA', 'BASE CALCUL TVA', 'BASE CALCUL TVA :', 'BASE TVA',
        'MONTANT_HTVA',
        // MTG label
        'Montant Total HT', 'MONTANT TOTAL HT', 'MONTANT_TOTAL_HT',
      ],
    },
    {
      id: 'sn_tva',
      key: 'TVA (18%)',
      description: 'Montant de la TVA à 18%',
      required: false,
      category: 'forms',
      aliases: [
        'MONTANT_TVA', 'TVA (18%)', 'TVA (18%) :', 'TVA 18%', 'TVA (18)',
        'TVA18', 'TVA',
      ],
    },
    {
      id: 'sn_total_facture',
      key: 'Total facture',
      description: 'Sous-total facture avant arrondi',
      required: false,
      category: 'forms',
      aliases: ['TOTAL FACTURE', 'TOTAL FACTURE :'],
    },
    {
      id: 'sn_reprise_arrondi',
      key: 'Reprise arrondi',
      description: 'Montant de reprise sur arrondi',
      required: false,
      category: 'forms',
      aliases: [
        'REPRISE_ARRONDI', 'REPRISE ARRONDI', 'REPRISE ARRONDI :',
        // MTG label with apostrophe — normalizeString strips ' → space
        "Reprise d'arrondi", "REPRISE D'ARRONDI", 'REPRISE D ARRONDI',
      ],
    },
    {
      id: 'sn_arrondi',
      key: 'Arrondi',
      description: 'Arrondi appliqué',
      required: false,
      category: 'forms',
      aliases: [
        'ARRONDI', 'ARRONDI :',
        // MTG label (à = accented, also cover plain a for OCR artifacts)
        'Arrondi à reporter', 'Arrondi a reporter',
        'ARRONDI A REPORTER', 'ARRONDI À REPORTER',
      ],
    },
    {
      id: 'sn_timbre',
      key: 'Timbre en espèces',
      description: 'Timbre en sus si règlement en espèces',
      required: false,
      category: 'forms',
      aliases: [
        'TIMBRE EN SUS SI REGLEMENT EN ESPECES', 'Timbre en sus si règlement en espèces',
        'TIMBRE', 'TIMBRE_ESPECES',
        // MTG full Textract key (includes authorization ref + trailing colon)
        'Timbre en sus si règlement en espèces (Aut. 2644 du 10/12/1996) :',
        'TIMBRE EN SUS SI REGLEMENT EN ESPECES (AUT. 2644 DU 10/12/1996) :',
      ],
    },
    {
      id: 'sn_prime_fixe',
      key: 'Prime fixe',
      description: 'Montant de la prime fixe mensuelle',
      required: false,
      category: 'forms',
      aliases: [
        'MONTANT_PRIME_FIXE', 'PRIME FIXE', 'TAUX_PRIME_FIXE', 'PRIME FIXE MENSUELLE',
      ],
    },
    // ─── SOLDES / HISTORIQUE ──────────────────────────────────────────────────
    {
      id: 'sn_solde_global',
      key: 'Solde global',
      description: 'Solde global des factures impayées',
      required: false,
      category: 'forms',
      aliases: ['SOLDE_GLOBAL', 'SOLDE GLOBAL', 'SOLDE GLOBAL ²', 'SOLDE GLOBAL(2)', 'SOLDE GLOBAL (2)'],
    },
    {
      id: 'sn_total_sommes_dues',
      key: 'Total des sommes dues',
      description: 'Total des sommes dues (facture + soldes)',
      required: false,
      category: 'forms',
      aliases: [
        'TOTAL_SOMMES_DUES', 'TOTAL DES SOMMES DUES (1)+(2)',
        'TOTAL DES SOMMES DUES', 'TOTAL SOMMES DUES',
      ],
    },
    // ─── TARIF / TECHNIQUE AVANCÉ ─────────────────────────────────────────────
    {
      id: 'sn_tarif',
      key: 'Tarif',
      description: 'Type de tarif SENELEC',
      required: false,
      category: 'forms',
      aliases: ['TYPE_TARIF_NUMERO', 'TARIF', 'TYPE DE TARIF', 'TARIF (TRANSCRIPTION)'],
    },
    {
      id: 'sn_agence',
      key: 'Agence',
      description: 'Agence SENELEC rattachée',
      required: false,
      category: 'forms',
      aliases: ['AGENCE', 'AGENCE :'],
    },
    {
      id: 'sn_date_limite',
      key: "Date limite de paiement",
      description: 'Date limite de règlement',
      required: false,
      category: 'forms',
      aliases: [
        'DATE_LIMITE_PAIEMENT', 'DATE LIMITE DE PAIEMENT', 'DATE LIMITE',
        'DATE LIMITE PAIEMENT',
      ],
    },
    {
      id: 'sn_ai',
      key: 'Ancien index',
      description: 'Ancien index de consommation',
      required: false,
      category: 'forms',
      aliases: ['AI_CG', 'ANCIEN INDEX', 'ANCIEN INDEX (AI)', 'AI'],
    },
    {
      id: 'sn_ni',
      key: 'Nouvel index',
      description: 'Nouvel index de consommation',
      required: false,
      category: 'forms',
      aliases: ['NI_CG', 'NOUVEL INDEX', 'NOUVEL INDEX (NI)', 'NI'],
    },
    // ─── MTG / MOYENNE TENSION ────────────────────────────────────────────────
    // Champs spécifiques au tarif MTG (industriels, grands comptes)
    {
      id: 'sn_tel',
      key: 'Tel. Centre d\'Appel',
      description: 'Numéro de téléphone du centre d\'appel SENELEC',
      required: false,
      category: 'forms',
      aliases: ["Tel. Centre d'Appel", "TEL CENTRE D'APPEL", 'TEL CENTRE APPEL', 'TELEPHONE'],
    },
    {
      id: 'sn_type_comptage',
      key: 'Type comptage',
      description: 'Type de comptage (MT/BT, BT, etc.)',
      required: false,
      category: 'forms',
      aliases: ['Type comptage :', 'TYPE COMPTAGE', 'TYPE DE COMPTAGE', 'TYPE_COMPTAGE'],
    },
    {
      id: 'sn_rapport_tc',
      key: 'Rapport TC',
      description: 'Rapport de transformation courant (TC)',
      required: false,
      category: 'forms',
      aliases: ['Rapport TC', 'Rapport TC :', 'RAPPORT TC', 'RAPPORT_TC'],
    },
    {
      id: 'sn_rapport_tp',
      key: 'Rapport TP',
      description: 'Rapport de transformation tension (TP)',
      required: false,
      category: 'forms',
      aliases: ['Rapport TP', 'Rapport TP :', 'RAPPORT TP', 'RAPPORT_TP'],
    },
    {
      id: 'sn_ps',
      key: 'PS (kW)',
      description: 'Puissance souscrite dans la grille technique MTG',
      required: false,
      category: 'forms',
      aliases: ['PS', 'P.S.', 'P.S'],
    },
    {
      id: 'sn_puissance_transfo',
      key: 'Puissance transfo (kVA)',
      description: 'Puissance du transformateur en kVA',
      required: false,
      category: 'forms',
      aliases: ['Puissance : transfo', 'PUISSANCE TRANSFO', 'PUISSANCE : TRANSFO', 'PUISSANCE_TRANSFO'],
    },
    {
      id: 'sn_pmax',
      key: 'Pmax relevée (kW)',
      description: 'Puissance maximale relevée sur la période',
      required: false,
      category: 'forms',
      aliases: ['Pmax relevée', 'Pmax relevee', 'PMAX RELEVEE', 'PMAX', 'PUISSANCE MAX RELEVEE'],
    },
    {
      id: 'sn_depassement',
      key: 'Dépassement',
      description: 'Dépassement de puissance souscrite',
      required: false,
      category: 'forms',
      aliases: ['Dépassement', 'DEPASSEMENT', 'Depassement', 'DEPASSEMENT :'],
    },
    {
      id: 'sn_cosinus_phi',
      key: 'Cosinus phi',
      description: 'Facteur de puissance (cos φ)',
      required: false,
      category: 'forms',
      aliases: ['Cosinus phi', 'COSINUS PHI', 'COS PHI', 'COSINUS_PHI', 'COSPHI'],
    },
    // Coefficients MTG (lettres grecques — Textract peut les transcrire différemment)
    {
      id: 'sn_alpha',
      key: 'Coefficient α',
      description: 'Coefficient alpha (MTG)',
      required: false,
      category: 'forms',
      // "a :" trailing colon stripped → "a"; "α" stays as Greek char
      aliases: ['a :', 'a:', 'α', 'ALPHA', 'COEF ALPHA'],
    },
    {
      id: 'sn_beta',
      key: 'Coefficient β',
      description: 'Coefficient bêta (MTG)',
      required: false,
      category: 'forms',
      // "ß" is a common Textract OCR artifact for "β"
      aliases: ['β', 'ß', 'BETA', 'b :', 'b:', 'COEF BETA'],
    },
    {
      id: 'sn_gamma',
      key: 'Coefficient γ',
      description: 'Coefficient gamma (MTG)',
      required: false,
      category: 'forms',
      // Textract often reads γ as "Y"; "Y :" trailing colon stripped → "y"
      aliases: ['γ', 'Y :', 'Y:', 'GAMMA', 'COEF GAMMA'],
    },
    {
      id: 'sn_delta',
      key: 'Coefficient δ',
      description: 'Coefficient delta (MTG)',
      required: false,
      category: 'forms',
      aliases: ['δ', 'DELTA', 'd :', 'd:', 'COEF DELTA'],
    },
    // Energies K1 / K2 (tarif à double composante)
    {
      id: 'sn_montant_k1',
      key: 'Montant Energie K1',
      description: 'Montant de l\'énergie composante K1',
      required: false,
      category: 'forms',
      aliases: ['Montant Energie K1', 'MONTANT ENERGIE K1', 'MONTANT_ENERGIE_K1', 'ENERGIE K1'],
    },
    {
      id: 'sn_montant_k2',
      key: 'Montant Energie K2',
      description: 'Montant de l\'énergie composante K2',
      required: false,
      category: 'forms',
      aliases: ['Montant Energie K2', 'MONTANT ENERGIE K2', 'MONTANT_ENERGIE_K2', 'ENERGIE K2'],
    },
    {
      id: 'sn_application_cos_phi',
      key: 'Application Cos phi',
      description: 'Pénalité ou correction facteur de puissance',
      required: false,
      category: 'forms',
      aliases: ['Application Cos phi', 'APPLICATION COS PHI', 'APPLICATION_COS_PHI', 'PENALITE COS PHI'],
    },
    // Rappel factures non soldées
    {
      id: 'sn_solde_rappel',
      key: 'Solde rappel',
      description: 'Solde de la section rappel factures non soldées',
      required: false,
      category: 'forms',
      aliases: ['SOLDE', 'SOLDE AUTRES FACTURES', 'SOLDE_AUTRES_FACTURES', 'SOLDE AUTRES'],
    },
    // ─── EN-TÊTE SENELEC (Textract extrait ces labels du papier à en-tête) ────
    {
      id: 'sn_siege_social',
      key: 'Siège social',
      description: 'Adresse du siège social SENELEC',
      required: false,
      category: 'forms',
      aliases: ['Siège Social', 'SIEGE SOCIAL', 'SIÈGE SOCIAL'],
    },
    {
      id: 'sn_ninea',
      key: 'NINEA',
      description: 'Numéro d\'identification national des entreprises et associations',
      required: false,
      category: 'forms',
      aliases: ['NINEA', 'N.I.N.E.A', 'NINEA :'],
    },
    {
      id: 'sn_rc',
      key: 'R.C.',
      description: 'Registre de commerce',
      required: false,
      category: 'forms',
      // normalizeString strips "." → "r c" for all variants
      aliases: ['R.C', 'R.C.', 'RC', 'REGISTRE DE COMMERCE'],
    },
    {
      id: 'sn_bp',
      key: 'B.P.',
      description: 'Boîte postale',
      required: false,
      category: 'forms',
      // normalizeString strips "." → "b p" for all variants
      aliases: ['B.P', 'BP', 'BOITE POSTALE', 'B.P.'],
    },
    {
      id: 'sn_email',
      key: 'E-mail',
      description: 'Adresse e-mail',
      required: false,
      category: 'forms',
      // "E-mail . :" → strip trailing colon + "." → "e-mail"
      aliases: ['E-mail . :', 'E-mail :', 'E-MAIL', 'E-mail', 'EMAIL'],
    },
    {
      id: 'sn_imprimee_le',
      key: 'Imprimée le',
      description: 'Date d\'impression de la facture',
      required: false,
      category: 'forms',
      aliases: ['Imprimée le', 'IMPRIMEE LE', 'IMPRIMÉ LE', 'Imprimé le'],
    },
    {
      id: 'sn_aut',
      key: 'Autorisation',
      description: 'Référence d\'autorisation timbre',
      required: false,
      category: 'forms',
      // "(Aut." → strip "(" and "." → "aut"
      aliases: ['(Aut.', 'AUT', 'AUTORISATION', 'Aut.'],
    },
    {
      id: 'sn_total_conso',
      key: 'Total consommation',
      description: 'Total de la ligne consommation dans le tableau des tranches',
      required: false,
      category: 'forms',
      aliases: ['Total', 'TOTAL', 'TOTAL CONSOMMATION'],
    },
  ],
  tableTemplates: [
    // ── Tableau identification client (grille en-tête BT) ──────────────────
    {
      id: 'sn_tbl_identification',
      name: 'Identification client',
      description: 'Grille en-tête : N°CLIENT, PUISSANCE SOUSCRITE, TARIF, COMPTEUR, AGENCE, BORDEREAU',
      headerLayout: 'column' as const,
      columnCount: 2,
      rowCount: 0,
      columnHeaders: [],
      rowHeaders: [
        'N°CLIENT', 'PUISSANCE SOUSCRITE (W)', 'PUISSANCE SOUSCRITE (kW)',
        'COMPTEUR', 'BORDEREAU / RANG', 'N°COMPTE DE CONTRAT', 'TARIF', 'AGENCE',
      ],
      required: false,
      excelMappings: [],
    },
    // ── Éléments de facturation (billing breakdown BT) ─────────────────────
    {
      id: 'sn_tbl_facturation',
      name: 'Éléments de facturation',
      description: 'Détail des montants : consommation, TCO, redevance, TVA, total',
      headerLayout: 'column' as const,
      columnCount: 2,
      rowCount: 0,
      columnHeaders: [],
      rowHeaders: [
        'MONTANT CONSOMMATION', 'TCO (2,5%)', 'TAXE COMMUNALE',
        'REDEVANCE', 'BASE CALCUL TVA', 'TVA (18%)', 'TOTAL FACTURE',
        'MONTANT TTC', 'SOLDE GLOBAL', 'TOTAL DES SOMMES DUES (1)+(2)',
      ],
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

/** Collection par défaut — SENELEC en premier (sélectionné par défaut) */
export const DEFAULT_DICTIONARY_COLLECTION: AnnotationDictionaryCollection = {
  dictionaries: [SENELEC_DICTIONARY, DEFAULT_ANNOTATION_DICTIONARY],
  displaySettings: DEFAULT_DISPLAY_SETTINGS,
};
