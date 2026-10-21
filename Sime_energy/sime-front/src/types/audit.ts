export interface PVCheckboxItem {
  id: string;
  label: string;
  checked: boolean;
  comment?: string;
}

// One timestamped reading for a senelec meter row
interface PVTableRowReading {
  id: string;
  dateTime: string;
  value: string;
}

export interface PVTableRow {
  id: string;
  label: string;
  // kept for SystemTableEditor (single-value mode) and backward compat
  dateTime: string;
  value: string;
  subGroup?: string;
  // multi-reading support (used by SenelecTableEditor)
  readings?: PVTableRowReading[];
}

// Legacy — kept for backward compat, superseded by MesureSession
interface WoyofalEntry {
  id: string;
  code: string;
  valeur: string;
  dateTime?: string;
}

// Sub-value within a multi-value index row.
// code = clé OBIS sélectionnée (ex. "1.8.0", "DATE_1.6.0") ; la signification et
// le libellé affichés sont dérivés de la table OBIS. valeur = valeur numérique.
export interface IndexSubValue {
  id: string;
  code: string;
  valeur: string;
}

// One reading within a MesureSession
export type MesureReading =
  | { kind: 'woyofal'; id: string; code: string; valeur: string }
  | { kind: 'index'; id: string; key: string; valeur: string; date?: string; subValues?: IndexSubValue[]; fixed?: boolean };

// A dated measurement session (factorized date for all readings inside)
export interface MesureSession {
  id: string;
  label: string;
  dateTime: string;
  type: 'WOYOFAL' | 'INDEX';
  readings: MesureReading[];
}

export interface PVSectionData {
  id: string;
  fields: Record<string, string>;
  tableRows?: PVTableRow[];
  checkboxItems?: PVCheckboxItem[];
  extraCheckboxItems?: PVCheckboxItem[];
  freeText?: string;
  customFields?: { id: string; key: string; value: string }[];
  woyofalEntries?: WoyofalEntry[];
  mesureSessions?: MesureSession[];
}

export interface PVQuestionnaire {
  id: string;
  name: string;
  sections: PVSectionData[];
  customFields: { id: string; key: string; value: string }[];
  createdAt: string;
}

interface AuditSite {
  id: string;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  auditId: string;
  auditName: string;
  auditColor: string;
  status: "planned" | "in_progress" | "completed";
  surfaceTerrain?: number;
  surfaceBatie?: number;
  surfaceToiture?: number;
}

// Valeur saisie dans un formulaire : texte, ou nombre pour les champs numériques (InputField type="number").
type Saisie = string | number;

// Responsable énergie ou point focal (onglet Personnel du formulaire de projet).
interface Responsable {
  nom: string;
  position: string;
  tel: string;
  email: string;
  /** Ancienne forme, encore présente dans des projets enregistrés avant le renommage en `tel` */
  telephone?: string;
}

// Ligne du tableau des effectifs. Les champs en commentaire « ancienne forme » viennent de projets plus anciens.
interface Employes {
  categorie: string;
  hommes: Saisie;
  femmes: Saisie;
  cadres: Saisie;
  /** Ancienne forme */ type?: string;
  /** Ancienne forme */ hommesNombre?: number;
  /** Ancienne forme */ femmesNombre?: number;
  /** Ancienne forme */ cadresHommes?: number;
  /** Ancienne forme */ cadresFemmes?: number;
}

// Tableaux dynamiques des informations générales (toutes les cellules sont saisies en texte).
export interface LigneConsommationEnergie {
  type: string; unite: string;
  a1Qte: string; a1Cout: string; a2Qte: string; a2Cout: string; a3Qte: string; a3Cout: string;
}

export interface LigneProblemeEfficacite {
  designation: string; frequence: string; duree: string;
}

export interface LigneProduction {
  produit: string; capaciteNominale: string; unite: string; annee1: string; annee2: string; annee3: string;
}

export interface LigneProcedeEquipement {
  procede: string; equipement: string; anneeFab: string; anneeService: string; typeEnergie: string;
  puissanceElec: string; puissanceTherm: string; capaciteNominale: string; autresInfos: string;
}

export interface LigneDechet {
  type: string; quantiteMensuelle: string; destination: string;
}

// Onglet « Spécifique » (selon le type de client) : champs libres + trois tableaux.
interface InfosSpecifiques {
  productions?: LigneProduction[];
  procedesEqs?: LigneProcedeEquipement[];
  dechets?: LigneDechet[];
  /** Lu par le contexte projet */
  sousType?: string;
  // Abonnement et tarif (listes déroulantes), textes longs
  typeContrat?: string;
  typeTarif?: string;
  optimisationDechets?: string;
  problemesEfficacite?: string;
  // Champs de saisie libres selon le type de client
  assemblages?: Saisie; capaciteMaxChauffe?: Saisie; capaciteMaxFroid?: Saisie; capaciteMaxVentil?: Saisie;
  capacitesUtilis?: Saisie; capacitesVerandas?: Saisie; contratsCarburant?: Saisie; contratsElec?: Saisie;
  contratsEnv?: Saisie; forges?: Saisie; montage?: Saisie; puissanceElectrique?: Saisie; puissanceSouscrite?: Saisie;
  puissanceThermique?: Saisie; surface?: Saisie; surfaceBrute?: Saisie; surfaceNette?: Saisie; surfaceTotal?: Saisie;
  systemeMgmtEnergie?: Saisie; usinage?: Saisie; volume?: Saisie;
}

interface ProgrammeExtension {
  existe?: boolean;
  echeance?: string;
  description?: string;
  impactEnergetique?: string;
}

interface SystemeManagementEnergie {
  existe?: boolean;
  norme?: string;
  ipe?: string;
  observations?: string;
}

interface CapaciteHotel {
  type: string;
  standing: number;
  chambresStandard: number;
  chambresMoyenStanding: number;
  suites: number;
  totalLits: number;
}

interface CapaciteHopital {
  specialite: string;
  chambresHospitalisation: number;
  litsHospitalisation: number;
}

interface CapaciteAdministration {
  bureauxIndividuels: number;
  bureaux2Pers: number;
  bureaux3Pers: number;
  bureaux4Pers: number;
  bureauxPaysagers: number;
}

interface ProgrammeOperations {
  quartsJour: number;
  heuresQuart: number;
  horaires: string;
  activiteSaisonniere: boolean;
  saisonsActivites?: string;
  maintenance: boolean;
  frequenceMaintenance?: string;
  dureeMaintenance?: string;
}

interface AuditGeneralInfo {
  nomEtablissement: string;
  siege: string;
  adresse: string;
  telephone: string;
  email: string;
  formeJuridique: "SARL" | "SA" | "Autres";
  capital: number;
  ninea: string;
  secteur: string;
  ca: number;
  anneeCreation: number;
  miseService: string;
  exportatrice: boolean;
  marches?: string;
  /** Synthèse rédigée dans la page Rapport, stockée dans general_info */
  synthesis?: Record<string, string>;
  // Champs du formulaire de projet (onglets Général, Facturation, Diagnostic)
  clientTypeAutre?: string;
  refZa?: string;
  siegeLibre?: string;
  province?: string;
  provinceLibre?: string;
  dateCreation?: string;
  effectifs?: Saisie;
  macs?: string;
  respEnergie?: string;
  respAchat?: string;
  montantM1?: Saisie;
  montantM2?: Saisie;
  montantM3?: Saisie;
  programmesEpargne?: string;
  contratsEnergie?: string;
  contraintesEfficacite?: string;
  diagnosticPrecedent?: string;
  tauxRealisationReco?: Saisie;
  resultatsDiagnostic?: string;
  programmeExtension?: ProgrammeExtension;
  pvQuestionnaires?: PVQuestionnaire[];
  consommationsEnergie?: LigneConsommationEnergie[];
  problemesEff?: LigneProblemeEfficacite[];
  specifique?: InfosSpecifiques;
}

interface AuditPersonnel {
  dg: string;
  dt: string;
  responsableEnergie: Responsable[];
  pointFocal: Responsable[];
  employes: Employes[];
  programmeOperations: ProgrammeOperations;
  sme?: SystemeManagementEnergie;
}

interface AuditCapacites {
  usines: AuditSite[];
  hotel?: CapaciteHotel[];
  hopital?: CapaciteHopital[];
  administration?: CapaciteAdministration;
}

export interface Audit {
  id: string;
  name: string;
  color: string;
  status: "planned" | "in_progress" | "completed";
  startDate: string;
  endDate?: string;
  completionPercentage: number;
  responsable?: string;
  clientType?: 'INDUSTRIE' | 'SERVICES' | 'AUTRE';
  generalInfo: AuditGeneralInfo;
  personnel: AuditPersonnel;
  capacites: AuditCapacites;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
