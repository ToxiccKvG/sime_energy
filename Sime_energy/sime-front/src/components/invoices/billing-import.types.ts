export const MOIS_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'] as const;

export const TARIF_CODES = {
  PETITE_PUISSANCE_BT: ['PPP', 'DPP', 'PMP', 'DMP'],
  GRANDE_PUISSANCE_BT: ['PGP', 'DGP', 'PFP', 'UP1', 'UP2'],
  GRANDE_PUISSANCE_MT: ['MTG', 'MTCU', 'MT', 'TG', 'TCU', 'TLU'],
} as const;

export type CategorieTarifaire = 'Petite Puissance BT' | 'Grande Puissance BT' | 'Grande Puissance MT' | null;

export interface BillingColumnDef {
  key: BillingColumnKey;
  label: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
  group: ColumnGroup;
  computed?: boolean;
}

export type ColumnGroup =
  | 'Identité'
  | 'Facture'
  | 'Index'
  | 'Énergie'
  | 'Puissance'
  | 'Tarif'
  | 'Réactif'
  | 'Site'
  | 'Calculé';

export const BILLING_TEMPLATE_COLUMNS: BillingColumnDef[] = [
  // --- IDENTITÉ CONTRAT (0-4) ---
  { key: 'numeroCompteContrat',      label: 'Numero Compte Contrat',          type: 'string',  required: true,  group: 'Identité' },
  { key: 'partenaire',               label: 'Partenaire (Texte)',             type: 'string',  required: true,  group: 'Identité' },
  { key: 'localite',                 label: 'Localite',                       type: 'string',  required: false, group: 'Identité' },
  { key: 'arrondissement',           label: 'Arrondissement',                 type: 'string',  required: false, group: 'Identité' },
  { key: 'rue',                      label: 'Rue',                            type: 'string',  required: false, group: 'Identité' },
  // --- FACTURE (5-14) ---
  { key: 'numeroFacture',            label: 'Numero Facture',                 type: 'number',  required: true,  group: 'Facture' },
  { key: 'dateComptableFacture',     label: 'Date comptable Facture',         type: 'date',    required: true,  group: 'Facture' },
  { key: 'montantTotalEnergie',      label: 'Montant Total Energie',          type: 'number',  required: true,  group: 'Facture' },
  { key: 'montantRedevance',         label: 'Montant Redevance',              type: 'number',  required: false, group: 'Facture' },
  { key: 'montantTCO',               label: 'Montant TCO',                    type: 'number',  required: false, group: 'Facture' },
  { key: 'montantHorsTVA',           label: 'Montant Hors TVA',               type: 'number',  required: true,  group: 'Facture' },
  { key: 'montantTVA',               label: 'Montant TVA',                    type: 'number',  required: true,  group: 'Facture' },
  { key: 'montantFactureTTC',        label: 'Montant Facture TTC',            type: 'number',  required: true,  group: 'Facture' },
  { key: 'dateDebutPeriode',         label: 'Date Debut Periode Facturation', type: 'date',    required: true,  group: 'Facture' },
  { key: 'dateFinPeriode',           label: 'Date Fin Periode Facturation',   type: 'date',    required: true,  group: 'Facture' },
  // --- INDEX COMPTEUR (15-20) ---
  { key: 'aiCG',                     label: 'AI_CG',                          type: 'number',  required: false, group: 'Index' },
  { key: 'niCG',                     label: 'NI_CG',                          type: 'number',  required: false, group: 'Index' },
  { key: 'ancienIndexK1',            label: 'Ancien index K1',                type: 'number',  required: false, group: 'Index' },
  { key: 'ancienIndexK2',            label: 'Ancien Index K2',                type: 'number',  required: false, group: 'Index' },
  { key: 'nouvelIndexK1',            label: 'Nouvel index K1',                type: 'number',  required: false, group: 'Index' },
  { key: 'nouvelIndexK2',            label: 'Nouvel Index K2',                type: 'number',  required: false, group: 'Index' },
  // --- ÉNERGIE K1/K2 (21-28) ---
  { key: 'montantEnergieK1',         label: 'Montant Energie K1',             type: 'number',  required: false, group: 'Énergie' },
  { key: 'montantEnergieK2',         label: 'Montant Energie K2',             type: 'number',  required: false, group: 'Énergie' },
  { key: 'consommationFacturee',     label: 'Consommation Facturée',          type: 'number',  required: true,  group: 'Énergie' },
  { key: 'rappelEtMajoration',       label: 'Rappel Et Majoration',           type: 'number',  required: false, group: 'Énergie' },
  { key: 'rappelK1',                 label: 'Rappel K1',                      type: 'number',  required: false, group: 'Énergie' },
  { key: 'rappelK2',                 label: 'Rappel K2',                      type: 'number',  required: false, group: 'Énergie' },
  { key: 'majorationK1',             label: 'Majoration K1',                  type: 'number',  required: false, group: 'Énergie' },
  { key: 'majorationK2',             label: 'Majoration K2',                  type: 'number',  required: false, group: 'Énergie' },
  // --- PUISSANCE (29-34) ---
  { key: 'nbJourFacturation',        label: 'Nb Jour Facturation',            type: 'number',  required: true,  group: 'Puissance' },
  { key: 'puissanceSouscrite',       label: 'Puissance Souscrite',            type: 'number',  required: true,  group: 'Puissance' },
  { key: 'puissanceMaxRelevee',      label: 'Puissance MAX Relevee',          type: 'number',  required: false, group: 'Puissance' },
  { key: 'montantPrimeFixe',         label: 'Montant Prime Fixe',             type: 'number',  required: false, group: 'Puissance' },
  { key: 'montantCosinusPhi',        label: 'Montant cosinus phi',            type: 'number',  required: false, group: 'Puissance' },
  { key: 'valeurCosinusPhi',         label: 'Valeur cosinus phi',             type: 'number',  required: false, group: 'Puissance' },
  // --- TARIF (35-41) ---
  { key: 'typeTarifNumero',          label: 'Type de Tarif (Numero)',         type: 'string',  required: true,  group: 'Tarif' },
  { key: 'typeTarifTexte',           label: 'Type de Tarif (Texte)',          type: 'string',  required: false, group: 'Tarif' },
  { key: 'typeClientTexte',          label: 'Type de Client (Texte)',         type: 'string',  required: false, group: 'Tarif' },
  { key: 'ccg',                      label: 'CCG',                            type: 'string',  required: false, group: 'Tarif' },
  { key: 'typeCompteContrat',        label: 'Type Compte de Contrat',         type: 'string',  required: false, group: 'Tarif' },
  { key: 'ancCote',                  label: 'Anc Cote',                       type: 'number',  required: false, group: 'Tarif' },
  { key: 'uniteReleve',              label: 'Unite de releve (Code)',         type: 'string',  required: false, group: 'Tarif' },
  // --- ÉNERGIE RÉACTIVE (42-46) ---
  { key: 'ancienIndexReactif',       label: 'Ancien index réactif',           type: 'number',  required: false, group: 'Réactif' },
  { key: 'nouvelIndexReactif',       label: 'Nouvel index réactif',           type: 'number',  required: false, group: 'Réactif' },
  { key: 'majoReactif',              label: 'Majo réactif',                   type: 'number',  required: false, group: 'Réactif' },
  { key: 'ancienIndexH1',            label: 'Ancien index H1',                type: 'number',  required: false, group: 'Réactif' },
  { key: 'nouvelIndexH1',            label: 'Nouvel index H1',                type: 'number',  required: false, group: 'Réactif' },
  // --- SITE (47-49) ---
  { key: 'agence',                   label: 'AGENCE',                         type: 'string',  required: false, group: 'Site' },
  { key: 'numeroCompteur',           label: 'N° Compteur',                    type: 'string',  required: false, group: 'Site' },
  { key: 'appartenance',             label: 'Appartenance',                   type: 'string',  required: true,  group: 'Site' },
  // --- COLONNES CALCULÉES (50-62) ---
  { key: 'puissanceSouscriteKW',     label: 'Puissance Souscrite normalisé_kW', type: 'number', required: false, group: 'Calculé', computed: true },
  { key: 'categorieTarifaire',       label: 'Catégorie Tarifaire',            type: 'string',  required: false, group: 'Calculé', computed: true },
  { key: 'consK1',                   label: 'Cons. K1',                       type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'consK2',                   label: 'Cons. K2',                       type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'consT',                    label: 'Cons T.',                        type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'consWr',                   label: 'Cons. Wr',                       type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'heureH1',                  label: 'Heure H1',                       type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'heureH2',                  label: 'Heure H2',                       type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'puissanceTransfo',         label: 'Puissance transfo',              type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'puissanceMaxKW',           label: 'Puissance Max normalisée_kW',    type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'penalitesDepassement',     label: 'Pénalités dépassement Ps',      type: 'number',  required: false, group: 'Calculé', computed: true },
  { key: 'anneeFacturation',         label: 'Année facturation',              type: 'number',  required: true,  group: 'Calculé', computed: true },
  { key: 'moisFacturation',          label: 'Mois facturation',               type: 'string',  required: true,  group: 'Calculé', computed: true },
];

export type BillingColumnKey =
  | 'numeroCompteContrat' | 'partenaire' | 'localite' | 'arrondissement' | 'rue'
  | 'numeroFacture' | 'dateComptableFacture' | 'montantTotalEnergie' | 'montantRedevance' | 'montantTCO'
  | 'montantHorsTVA' | 'montantTVA' | 'montantFactureTTC' | 'dateDebutPeriode' | 'dateFinPeriode'
  | 'aiCG' | 'niCG' | 'ancienIndexK1' | 'ancienIndexK2' | 'nouvelIndexK1' | 'nouvelIndexK2'
  | 'montantEnergieK1' | 'montantEnergieK2' | 'consommationFacturee' | 'rappelEtMajoration'
  | 'rappelK1' | 'rappelK2' | 'majorationK1' | 'majorationK2'
  | 'nbJourFacturation' | 'puissanceSouscrite' | 'puissanceMaxRelevee' | 'montantPrimeFixe'
  | 'montantCosinusPhi' | 'valeurCosinusPhi'
  | 'typeTarifNumero' | 'typeTarifTexte' | 'typeClientTexte' | 'ccg' | 'typeCompteContrat'
  | 'ancCote' | 'uniteReleve'
  | 'ancienIndexReactif' | 'nouvelIndexReactif' | 'majoReactif' | 'ancienIndexH1' | 'nouvelIndexH1'
  | 'agence' | 'numeroCompteur' | 'appartenance'
  | 'puissanceSouscriteKW' | 'categorieTarifaire' | 'consK1' | 'consK2' | 'consT' | 'consWr'
  | 'heureH1' | 'heureH2' | 'puissanceTransfo' | 'puissanceMaxKW' | 'penalitesDepassement'
  | 'anneeFacturation' | 'moisFacturation';

export interface BillingRow {
  _rowIndex: number;
  rowErrors: string[];
  /** Keys of required fields explicitly set to "-" (not applicable) — excluded from validation */
  _skippedFields: string[];
  /** Keys of fields filled in by the auto-calc engine — highlighted green in the preview */
  _repairedFields?: string[];
  numeroCompteContrat: string | null;
  partenaire: string | null;
  localite: string | null;
  arrondissement: string | null;
  rue: string | null;
  numeroFacture: number | null;
  dateComptableFacture: Date | null;
  montantTotalEnergie: number | null;
  montantRedevance: number | null;
  montantTCO: number | null;
  montantHorsTVA: number | null;
  montantTVA: number | null;
  montantFactureTTC: number | null;
  dateDebutPeriode: Date | null;
  dateFinPeriode: Date | null;
  aiCG: number | null;
  niCG: number | null;
  ancienIndexK1: number | null;
  ancienIndexK2: number | null;
  nouvelIndexK1: number | null;
  nouvelIndexK2: number | null;
  montantEnergieK1: number | null;
  montantEnergieK2: number | null;
  consommationFacturee: number | null;
  rappelEtMajoration: number | null;
  rappelK1: number | null;
  rappelK2: number | null;
  majorationK1: number | null;
  majorationK2: number | null;
  nbJourFacturation: number | null;
  puissanceSouscrite: number | null;
  puissanceMaxRelevee: number | null;
  montantPrimeFixe: number | null;
  montantCosinusPhi: number | null;
  valeurCosinusPhi: number | null;
  typeTarifNumero: string | null;
  typeTarifTexte: string | null;
  typeClientTexte: string | null;
  ccg: string | null;
  typeCompteContrat: string | null;
  ancCote: number | null;
  uniteReleve: string | null;
  ancienIndexReactif: number | null;
  nouvelIndexReactif: number | null;
  majoReactif: number | null;
  ancienIndexH1: number | null;
  nouvelIndexH1: number | null;
  agence: string | null;
  numeroCompteur: string | null;
  appartenance: string | null;
  puissanceSouscriteKW: number | null;
  categorieTarifaire: CategorieTarifaire;
  consK1: number | null;
  consK2: number | null;
  consT: number | null;
  consWr: number | null;
  heureH1: number | null;
  heureH2: number | null;
  puissanceTransfo: number | null;
  puissanceMaxKW: number | null;
  penalitesDepassement: number | null;
  anneeFacturation: number | null;
  moisFacturation: string | null;
}

export interface BillingImportResult {
  rows: BillingRow[];
  totalRows: number;
  errorRows: number;
  fileName: string;
}
