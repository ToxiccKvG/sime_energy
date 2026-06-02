// Inventory module types
// Hierarchy: SITE (audit_sites) → BÂTIMENT (audit_buildings) → ÉTAGE (audit_levels) → PIÈCE (audit_rooms) → ÉQUIPEMENTS (audit_equipment)

export type ClientType = 'INDUSTRIE' | 'SERVICES';
export type ServicesSousType = 'HÔTEL' | 'HÔPITAL' | 'ÉCOLE' | 'BUREAUX';
export type EquipmentStatus = 'EN service' | 'Hors Service';

// ---- SPATIAL HIERARCHY ----

export interface InventoryZone {
  id: string;
  auditId: string;
  siteId: string;
  name: string;
  description?: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLevel {
  id: string;
  auditId: string;
  buildingId: string;
  name: string; // RDC, R+1, R-1, R+2...
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRoom {
  id: string;
  auditId: string;
  levelId: string;
  code: string; // ex: A1P1
  service?: string;
  surfaceM2?: number;
  typeFonctionnel?: string; // drives building_type_params prefill for heuresAn
  createdAt: string;
  updatedAt: string;
}

// ---- EQUIPMENT CATEGORIES ----

export interface EquipmentCategory {
  id: string;
  organizationId: string;
  parentId?: string;
  name: string;
  color: string;
  icon?: string;
  children?: EquipmentCategory[];
  createdAt: string;
  updatedAt: string;
}

// ---- EQUIPMENT ----

export interface InventoryEquipment {
  id: string;
  auditId: string;
  roomId: string;
  categoryId?: string;
  categoryName?: string; // joined
  name: string;
  brand?: string;
  status: EquipmentStatus;
  powerW?: number;
  quantity: number;
  utilizationFactor: number; // 0–1, default 1.0 — corrects nameplate power to real usage pattern
  metadata: EclairageMetadata | AppareillsDiversMetadata | ClimMetadata | Record<string, any>;
  createdAt: string;
  updatedAt: string;
  // Computed (client-side)
  totalPowerW?: number;
  kwhPerYear?: number;
}

// ---- EQUIPMENT METADATA SCHEMAS (stored in metadata JSONB) ----

export interface EclairageMetadata {
  typeLuminaire?: string;  // description libre du type de luminaire
  typeReflecteur?: string; // type de réflecteur
  technologie?: 'LED' | 'Fluo' | 'Économique' | 'Halogène';
  nbLuminaires?: number;
  lampesParLuminaire?: number;
  // computed: nbLampesTotal = nbLuminaires * lampesParLuminaire
  hauteurFixation?: number; // m
  eclairement?: number;    // lux
  surfaceLocale?: number;  // m²
  heuresAn?: number;
}

export interface AppareillsDiversMetadata {
  categorie?: 'Bureautique' | 'Informatique' | 'Réseau' | 'Multimédia' | 'Téléphonie' | 'Autres';
  surfaceM2?: number;
  volumeM3?: number;
  heuresAn?: number;
  joursSem?: number;
  weekend?: boolean;
  feries?: boolean;
}

export interface ClimMetadata {
  technologie?: 'Inverter' | 'Classique';
  btu?: number;
  puissanceElecW?: number;
  puissanceFrigoW?: number; // auto-calculated: btu × qty × 0.29307
  cop?: number;             // auto-calculated: puissanceFrigoW / puissanceElecTotaleW
  modePose?: string;
  reglageConsigne?: string; // température de consigne
  surfaceClim?: number;     // m² climatisée
  volumeM3?: number;        // volume climatisé m³
  heuresAn?: number;
}

export interface ForceMotriceMetadata {
  typeMoteur?: string;
  rendementMoteur?: number;   // η %
  facteurPuissance?: number;  // cos φ
  tauxCharge?: number;        // % de la puissance nominale
  heuresAn?: number;
  kwhPreCalculated?: number;  // calculé à la sauvegarde
}

export interface VentilationMetadata {
  debitAir?: number;     // m³/h
  pressionPa?: number;   // Pa
  typeVentil?: string;   // Axial, Centrifuge, CTA, VMC...
  heuresAn?: number;
}

export interface PedagogiqueMetadata {
  story?: string;
  heuresAn?: number;
}

export interface AlimentationsMetadata {
  typeSource?: 'Onduleur' | 'Groupe électrogène' | 'Convertisseur' | 'Autre';
  tableauElectrique?: string; // tableau de rattachement
  heuresAn?: number;
}

// ---- AGGREGATION STATS ----

export interface RoomStats {
  roomId: string;
  nbEquipements: number;
  puissanceTotaleW: number;
  kwhAn: number;
  repartition: { categoryName: string; color: string; percent: number }[];
}

export interface LevelStats {
  levelId: string;
  nbEquipements: number;
  puissanceTotaleKw: number;
  kwhAn: number;
}

export interface BuildingStats {
  buildingId: string;
  nbEquipements: number;
  puissanceTotaleKw: number;
  kwhAn: number;
}

// ---- SITE STRUCTURE (stored in audit_sites JSONB columns) ----

export interface StructureBati {
  surfaceTerrain?: number;
  surfaceBatie?: number;
  niveaux?: { label: string; surface?: number; hauteur?: number }[];
  technologies?: ('LED' | 'Fluo' | 'Économique')[];
  montantM1?: number;
  montantM2?: number;
  montantM3?: number;
  etat?: 'EN service' | 'Hors Service';
}

export interface EnveloppeBatiment {
  orientation?: string;
  typeToit?: string;
  revetementToit?: string;
  couleurToit?: string;
  couleurFenetres?: string;
  couleurMursExt?: string;
  typeVitrage?: string;
  compositionToit?: string;
  compositionMurs?: string;
}

export interface AmenagementBatiment {
  secteur?: string;
  fonction?: string;
  usage?: string;
  systemeCVC?: (
    | '1. Chauffage'
    | '2. Clim'
    | '3. Ventilation'
    | '4. Froid adiabat'
    | '5. Refroid. évap.'
    | '6. Sans cond.'
    | '7. Chauffe + refroid'
  )[];
  tauxFrequence?: number; // %
}

// ---- FORM HELPERS ----

export const DEFAULT_CATEGORIES = [
  { name: 'ÉCLAIRAGE', color: '#f59e0b', icon: 'Lightbulb' },
  { name: 'CLIM', color: '#3b82f6', icon: 'Wind' },
  { name: 'VENTILATION', color: '#06b6d4', icon: 'Wind2' },
  { name: 'FORCE MOTRICE', color: '#ef4444', icon: 'Cog' },
  { name: 'APPAREILS DIVERS', color: '#8b5cf6', icon: 'Plug' },
  { name: 'PÉDAGOGIQUE', color: '#10b981', icon: 'BookOpen' },
  { name: 'ALIMENTATIONS', color: '#f97316', icon: 'Battery' },
  { name: 'AUTRE', color: '#64748b', icon: 'Package' },
] as const;

// Fixed system types — drive which technical fields appear in the equipment form
export const EQUIPMENT_TYPES = [
  'ÉCLAIRAGE',
  'CLIM',
  'VENTILATION',
  'FORCE MOTRICE',
  'APPAREILS DIVERS',
  'PÉDAGOGIQUE',
  'ALIMENTATIONS',
  'AUTRE',
] as const;
export type EquipmentType = typeof EQUIPMENT_TYPES[number];

export const NIVEAU_OPTIONS = [
  'R-2', 'R-1', 'RDC', 'Mezzanine', 'R+1', 'R+2', 'R+3', 'R+4', 'R+5',
  'R+6', 'R+7', 'R+8', 'R+9', 'R+10', 'R+11', 'R+12', 'R+13', 'R+14', 'R+15',
  'Terrasse',
] as const;


// ---- HEURES DE FONCTIONNEMENT — Modèle Paramétrique ----

export const FUNCTIONAL_TYPES = [
  'Bureau',
  'Salle de cours',
  'Laboratoire',
  'Couloir / Hall',
  'Cafétéria',
  'Atelier',
  'Salle de réunion',
  'Sanitaires',
  'Autre',
] as const;
export type FunctionalType = typeof FUNCTIONAL_TYPES[number];

// 5 hour categories used in the parametric model
export type HourCategory = 'Eclairage' | 'Climatisation' | 'Informatique' | 'Electromenager' | 'Serveur';

export interface BuildingTypeParams {
  id: string;
  buildingId: string;
  auditId: string;
  typeFonctionnel: string;
  // Calendar
  joursNonTravailles: number;  // weekends + congés (default 104)
  joursFeries: number;         // jours fériés  (default 5)
  joursFraicheur: number;      // days A/C not needed (default 60)
  // Correction coefficients (0–1)
  correctionFraicheur: number; // default 0.9
  correctionWeekend: number;   // default 1.0
  correctionFerie: number;     // default 1.0
  correctionOuvres: number;    // effective occupation rate (default 0.8)
  // Daily hours per equipment category (h/day)
  tpsEcl: number;      // default 8
  tpsClim: number;     // default 8
  tpsInform: number;   // default 8
  tpsElectrom: number; // default 24 (continuous)
  tpsServeur: number;  // default 24 (continuous)
  createdAt: string;
  updatedAt: string;
}

/**
 * Compute annual operating hours from parametric params.
 *
 * Formulas:
 *   joursOuvres = 365 - joursNonTravailles - joursFeries
 *   ECL:       joursOuvres × corrOuvres × tpsEcl × corrWeekend × corrFerie
 *   CLIM:      (joursOuvres × corrOuvres - joursFraicheur × corrFraicheur) × tpsClim
 *   INFORM:    (joursOuvres × corrOuvres - joursFraicheur × corrFraicheur) × tpsInform
 *   ELECTROM:  365 × tpsElectrom  (continuous)
 *   SERVEUR:   365 × tpsServeur   (continuous)
 */
export function calculateHoursParametric(params: BuildingTypeParams, category: HourCategory): number {
  const joursOuvres = 365 - params.joursNonTravailles - params.joursFeries;
  const joursOuvresCorr = joursOuvres * params.correctionOuvres;
  const joursFraicheurCorr = params.joursFraicheur * params.correctionFraicheur;

  switch (category) {
    case 'Eclairage':
      return joursOuvresCorr * params.tpsEcl * params.correctionWeekend * params.correctionFerie;
    case 'Climatisation':
      return Math.max(0, joursOuvresCorr - joursFraicheurCorr) * params.tpsClim;
    case 'Informatique':
      return Math.max(0, joursOuvresCorr - joursFraicheurCorr) * params.tpsInform;
    case 'Electromenager':
      return 365 * params.tpsElectrom;
    case 'Serveur':
      return 365 * params.tpsServeur;
  }
}

/**
 * Map an equipment group name (and optional sub-category) to the HourCategory
 * used for parametric prefill.
 */
export function getHourCategoryForEquipment(
  groupeNom: string,
  categorieMeta?: string
): HourCategory | null {
  const g = groupeNom.toUpperCase();
  if (g.includes('CLAIRAGE')) return 'Eclairage';
  if (g.includes('CLIM') || g.includes('VENTIL')) return 'Climatisation';
  if (g.includes('FORCE') || g.includes('MOTRICE')) return 'Electromenager';
  if (g.includes('ALIM')) return 'Electromenager';
  if (g.includes('DIVERS') || g.includes('APPAREILS')) {
    const sub = (categorieMeta ?? '').toLowerCase();
    if (sub.includes('info') || sub.includes('réseau') || sub.includes('reseau')) return 'Informatique';
    if (sub.includes('serveur')) return 'Serveur';
    return 'Electromenager';
  }
  return null;
}

// ---- CALCULS ----

export function computeKwhAn(powerW: number, quantity: number, heuresAn: number, utilizationFactor = 1.0): number {
  return (powerW * quantity * utilizationFactor / 1000) * heuresAn;
}

export function computeEclairageTotaux(meta: EclairageMetadata, powerW: number) {
  const nbLampesTotal = (meta.nbLuminaires ?? 0) * (meta.lampesParLuminaire ?? 1);
  const puissanceTotaleW = powerW * nbLampesTotal;
  const kwhAn = meta.heuresAn ? puissanceTotaleW / 1000 * meta.heuresAn : 0;
  return { nbLampesTotal, puissanceTotaleW, kwhAn };
}
