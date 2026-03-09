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
  generalInfo: AuditGeneralInfo;
  personnel: AuditPersonnel;
  capacites: AuditCapacites;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
