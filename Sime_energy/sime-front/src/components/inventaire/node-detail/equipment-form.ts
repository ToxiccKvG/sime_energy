

// ─── EQUIPMENT FORM (dynamic per category) ──────────────────────────────────

export interface EqFormState {
  categoryId: string;   // resolved group ID (visualization + form detection)
  groupeNom: string;    // group name — also drives which technical fields appear
  name: string;
  brand: string;
  model: string;
  numSerie: string;
  anneeFab: string;
  status: 'EN service' | 'Hors Service';
  service: string;      // service/local de l'équipement (per-equipment)
  nomOccupant: string;  // occupant/responsable
  powerW: string;
  quantity: string;
  facteurUtilisation: string; // 0–1, default 1 — usage pattern coefficient
  // Heures — two modes: direct heuresAn OR heuresJour × joursEffectifs
  heuresAn: string;
  heuresJour: string;
  joursEffectifs: string;
  tauxCharge: string;    // % load factor (FORCE MOTRICE only)
  // ÉCLAIRAGE
  typeLuminaire: string;     // description libre du type
  typeReflecteur: string;    // type de réflecteur
  technologie: string;
  nbLuminaires: string;
  lampesParLuminaire: string;
  hauteurFixation: string;
  eclairement: string;
  surfaceLocale: string;
  // APPAREILS DIVERS
  categorieMeta: string;
  surfaceM2: string;
  volumeM3: string;
  weekend: boolean;
  feries: boolean;
  caracteristiquesTechniques: string;
  // CLIM
  technologieClim: string;
  btu: string;
  modePose: string;
  reglageConsigne: string;   // température de consigne
  surfaceClim: string;
  volumeM3Clim: string;      // volume climatisé m³
  // FORCE MOTRICE
  rendementMoteur: string;   // η %
  facteurPuissance: string;  // cos φ
  typeMoteur: string;
  // VENTILATION
  debitAir: string;   // m³/h
  pressionPa: string; // Pa
  typeVentil: string;
  // ALIMENTATIONS
  typeSource: string;
  tableauElectrique: string;
}

export const emptyEqForm = (): EqFormState => ({
  categoryId: '',
  groupeNom: '',
  name: '',
  brand: '',
  model: '',
  numSerie: '',
  anneeFab: '',
  status: 'EN service',
  service: '',
  nomOccupant: '',
  powerW: '',
  quantity: '1',
  facteurUtilisation: '1',
  heuresAn: '',
  heuresJour: '',
  joursEffectifs: '',
  tauxCharge: '',
  typeLuminaire: '',
  typeReflecteur: '',
  technologie: '',
  nbLuminaires: '',
  lampesParLuminaire: '1',
  hauteurFixation: '',
  eclairement: '',
  surfaceLocale: '',
  categorieMeta: '',
  surfaceM2: '',
  volumeM3: '',
  weekend: false,
  feries: false,
  caracteristiquesTechniques: '',
  technologieClim: '',
  btu: '',
  modePose: '',
  reglageConsigne: '',
  surfaceClim: '',
  volumeM3Clim: '',
  rendementMoteur: '',
  facteurPuissance: '',
  typeMoteur: '',
  debitAir: '',
  pressionPa: '',
  typeVentil: '',
  typeSource: '',
  tableauElectrique: '',
});
