export interface PVCheckboxItem {
  id: string;
  label: string;
  checked: boolean;
  comment?: string;
}

// One timestamped reading for a senelec meter row
export interface PVTableRowReading {
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

// One Woyofal prepaid meter entry: code on meter display → value read
export interface WoyofalEntry {
  id: string;
  code: string;
  valeur: string;
  dateTime?: string;
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
}

export interface PVQuestionnaire {
  id: string;
  name: string;
  sections: PVSectionData[];
  customFields: { id: string; key: string; value: string }[];
  createdAt: string;
}

export interface AuditSite {
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

export interface Responsable {
  nom: string;
  position: string;
  telephone: string;
  email: string;
}

export interface Employes {
  type: string;
  hommesNombre: number;
  femmesNombre: number;
  cadresHommes: number;
  cadresFemmes: number;
}

export interface CapaciteHotel {
  type: string;
  standing: number;
  chambresStandard: number;
  chambresMoyenStanding: number;
  suites: number;
  totalLits: number;
}

export interface CapaciteHopital {
  specialite: string;
  chambresHospitalisation: number;
  litsHospitalisation: number;
}

export interface CapaciteAdministration {
  bureauxIndividuels: number;
  bureaux2Pers: number;
  bureaux3Pers: number;
  bureaux4Pers: number;
  bureauxPaysagers: number;
}

export interface ProgrammeOperations {
  quartsJour: number;
  heuresQuart: number;
  horaires: string;
  activiteSaisonniere: boolean;
  saisonsActivites?: string;
  maintenance: boolean;
  frequenceMaintenance?: string;
  dureeMaintenance?: string;
}

export interface AuditGeneralInfo {
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
}

export interface AuditPersonnel {
  dg: string;
  dt: string;
  responsableEnergie: Responsable[];
  pointFocal: Responsable[];
  employes: Employes[];
  programmeOperations: ProgrammeOperations;
}

export interface AuditCapacites {
  usines: AuditSite[];
  hotel?: CapaciteHotel[];
  hopital?: CapaciteHopital[];
  administration?: CapaciteAdministration;
}

export interface AuditActivity {
  id: string;
  auditId: string;
  date: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
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
