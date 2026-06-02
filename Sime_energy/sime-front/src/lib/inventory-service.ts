import { supabase } from '@/lib/supabase';
import {
  InventoryZone,
  InventoryLevel,
  InventoryRoom,
  InventoryEquipment,
  EquipmentCategory,
  BuildingTypeParams,
  DEFAULT_CATEGORIES,
} from '@/types/inventory';

// ============================================================
// ZONES
// ============================================================

export async function getZones(siteId: string): Promise<InventoryZone[]> {
  const { data, error } = await supabase
    .from('audit_zones')
    .select('*')
    .eq('site_id', siteId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toZone);
}

export async function createZone(
  auditId: string,
  siteId: string,
  name: string,
  description?: string
): Promise<InventoryZone> {
  const { data, error } = await supabase
    .from('audit_zones')
    .insert([{
      audit_id: auditId,
      site_id: siteId,
      name,
      description: description ?? null,
      order_index: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;
  return toZone(data);
}

export async function updateZone(
  zoneId: string,
  updates: { name?: string; description?: string }
): Promise<InventoryZone> {
  const { data, error } = await supabase
    .from('audit_zones')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', zoneId)
    .select()
    .single();
  if (error) throw error;
  return toZone(data);
}

export async function deleteZone(zoneId: string): Promise<void> {
  const { error } = await supabase.from('audit_zones').delete().eq('id', zoneId);
  if (error) throw error;
}

export async function getZoneBuildings(zoneId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('audit_buildings')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// LEVELS (ÉTAGES)
// ============================================================

export async function getLevels(buildingId: string): Promise<InventoryLevel[]> {
  const { data, error } = await supabase
    .from('audit_levels')
    .select('*')
    .eq('building_id', buildingId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toLevel);
}

export async function createLevel(
  auditId: string,
  buildingId: string,
  name: string,
  orderIndex = 0
): Promise<InventoryLevel> {
  const { data, error } = await supabase
    .from('audit_levels')
    .insert([{
      audit_id: auditId,
      building_id: buildingId,
      name,
      order_index: orderIndex,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;
  return toLevel(data);
}

export async function updateLevel(
  levelId: string,
  updates: { name?: string; orderIndex?: number }
): Promise<InventoryLevel> {
  const { data, error } = await supabase
    .from('audit_levels')
    .update({ name: updates.name, order_index: updates.orderIndex, updated_at: new Date().toISOString() })
    .eq('id', levelId)
    .select()
    .single();
  if (error) throw error;
  return toLevel(data);
}

export async function deleteLevel(levelId: string): Promise<void> {
  const { error } = await supabase.from('audit_levels').delete().eq('id', levelId);
  if (error) throw error;
}

// ============================================================
// ROOMS (PIÈCES)
// ============================================================

export async function getRooms(levelId: string): Promise<InventoryRoom[]> {
  const { data, error } = await supabase
    .from('audit_rooms')
    .select('*')
    .eq('level_id', levelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toRoom);
}

export async function createRoom(
  auditId: string,
  levelId: string,
  room: { code: string; service?: string; surfaceM2?: number; typeFonctionnel?: string }
): Promise<InventoryRoom> {
  const { data, error } = await supabase
    .from('audit_rooms')
    .insert([{
      audit_id: auditId,
      level_id: levelId,
      code: room.code,
      service: room.service,
      surface_m2: room.surfaceM2,
      type_fonctionnel: room.typeFonctionnel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;
  return toRoom(data);
}

export async function updateRoom(
  roomId: string,
  updates: { code?: string; service?: string; surfaceM2?: number; typeFonctionnel?: string }
): Promise<InventoryRoom> {
  const { data, error } = await supabase
    .from('audit_rooms')
    .update({
      code: updates.code,
      service: updates.service,
      surface_m2: updates.surfaceM2,
      type_fonctionnel: updates.typeFonctionnel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw error;
  return toRoom(data);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from('audit_rooms').delete().eq('id', roomId);
  if (error) throw error;
}

// ============================================================
// EQUIPMENT (ÉQUIPEMENTS)
// ============================================================

export async function getEquipmentByRoom(roomId: string): Promise<InventoryEquipment[]> {
  const { data, error } = await supabase
    .from('audit_equipment')
    .select('*, equipment_categories(name, color)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toEquipment);
}

export async function getEquipmentByBuilding(buildingId: string): Promise<InventoryEquipment[]> {
  // Step 1: level IDs for this building
  const { data: levels, error: levErr } = await supabase
    .from('audit_levels').select('id').eq('building_id', buildingId);
  if (levErr) throw levErr;
  const levelIds = (levels ?? []).map(l => l.id);
  if (levelIds.length === 0) return [];

  // Step 2: room IDs for those levels
  const { data: rooms, error: roomErr } = await supabase
    .from('audit_rooms').select('id').in('level_id', levelIds);
  if (roomErr) throw roomErr;
  const roomIds = (rooms ?? []).map(r => r.id);
  if (roomIds.length === 0) return [];

  // Step 3: equipment for those rooms
  const { data, error } = await supabase
    .from('audit_equipment')
    .select('*, equipment_categories(name, color)')
    .in('room_id', roomIds);
  if (error) throw error;
  return (data ?? []).map(toEquipment);
}

export async function getEquipmentByAudit(auditId: string): Promise<InventoryEquipment[]> {
  const { data, error } = await supabase
    .from('audit_equipment')
    .select('*, equipment_categories(name, color)')
    .eq('audit_id', auditId);
  if (error) throw error;
  return (data ?? []).map(toEquipment);
}

export async function getInventoryCountsByAudit(auditId: string): Promise<{
  levels: number;
  rooms: number;
  equipment: number;
}> {
  const [levelsRes, roomsRes, equipmentRes] = await Promise.all([
    supabase.from('audit_levels').select('*', { count: 'exact', head: true }).eq('audit_id', auditId),
    supabase.from('audit_rooms').select('*', { count: 'exact', head: true }).eq('audit_id', auditId),
    supabase.from('audit_equipment').select('*', { count: 'exact', head: true }).eq('audit_id', auditId),
  ]);
  return {
    levels: levelsRes.count ?? 0,
    rooms: roomsRes.count ?? 0,
    equipment: equipmentRes.count ?? 0,
  };
}

export async function createEquipment(
  auditId: string,
  roomId: string,
  eq: {
    categoryId?: string;
    name: string;
    brand?: string;
    status?: 'EN service' | 'Hors Service';
    powerW?: number;
    quantity?: number;
    utilizationFactor?: number;
    metadata?: Record<string, any>;
  }
): Promise<InventoryEquipment> {
  const { data, error } = await supabase
    .from('audit_equipment')
    .insert([{
      audit_id: auditId,
      room_id: roomId,
      category_id: eq.categoryId,
      name: eq.name,
      brand: eq.brand,
      status: eq.status ?? 'EN service',
      power_w: eq.powerW,
      quantity: eq.quantity ?? 1,
      utilization_factor: eq.utilizationFactor ?? 1.0,
      metadata: eq.metadata ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select('*, equipment_categories(name, color)')
    .single();
  if (error) throw error;
  return toEquipment(data);
}

export async function updateEquipment(
  equipmentId: string,
  updates: {
    categoryId?: string;
    name?: string;
    brand?: string;
    status?: 'EN service' | 'Hors Service';
    powerW?: number;
    quantity?: number;
    utilizationFactor?: number;
    metadata?: Record<string, any>;
  }
): Promise<InventoryEquipment> {
  const { data, error } = await supabase
    .from('audit_equipment')
    .update({
      category_id: updates.categoryId,
      name: updates.name,
      brand: updates.brand,
      status: updates.status,
      power_w: updates.powerW,
      quantity: updates.quantity,
      utilization_factor: updates.utilizationFactor,
      metadata: updates.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', equipmentId)
    .select('*, equipment_categories(name, color)')
    .single();
  if (error) throw error;
  return toEquipment(data);
}

export async function deleteEquipment(equipmentId: string): Promise<void> {
  const { error } = await supabase.from('audit_equipment').delete().eq('id', equipmentId);
  if (error) throw error;
}

// ============================================================
// BUILDING TYPE PARAMS (Heures de Fonctionnement)
// ============================================================

export async function getBuildingTypeParams(buildingId: string): Promise<BuildingTypeParams[]> {
  const { data, error } = await supabase
    .from('building_type_params')
    .select('*')
    .eq('building_id', buildingId)
    .order('type_fonctionnel');
  if (error) throw error;
  return (data ?? []).map(toBuildingTypeParams);
}

export async function upsertBuildingTypeParam(
  buildingId: string,
  auditId: string,
  typeFonctionnel: string,
  params: Partial<Omit<BuildingTypeParams, 'id' | 'buildingId' | 'auditId' | 'typeFonctionnel' | 'createdAt' | 'updatedAt'>>
): Promise<BuildingTypeParams> {
  const { data, error } = await supabase
    .from('building_type_params')
    .upsert({
      building_id: buildingId,
      audit_id: auditId,
      type_fonctionnel: typeFonctionnel,
      jours_non_travailles: params.joursNonTravailles,
      jours_feries: params.joursFeries,
      jours_fraicheur: params.joursFraicheur,
      correction_fraicheur: params.correctionFraicheur,
      correction_weekend: params.correctionWeekend,
      correction_ferie: params.correctionFerie,
      correction_ouvres: params.correctionOuvres,
      tps_ecl: params.tpsEcl,
      tps_clim: params.tpsClim,
      tps_inform: params.tpsInform,
      tps_electrom: params.tpsElectrom,
      tps_serveur: params.tpsServeur,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'building_id,type_fonctionnel' })
    .select()
    .single();
  if (error) throw error;
  return toBuildingTypeParams(data);
}

export async function deleteBuildingTypeParam(id: string): Promise<void> {
  const { error } = await supabase.from('building_type_params').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// EQUIPMENT CATEGORIES
// ============================================================

export async function getCategories(organizationId: string): Promise<EquipmentCategory[]> {
  const { data, error } = await supabase
    .from('equipment_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map(toCategory);
}

export async function createCategory(
  organizationId: string,
  name: string,
  color = '#64748b',
  icon = 'Tag',
): Promise<EquipmentCategory> {
  const { data, error } = await supabase
    .from('equipment_categories')
    .insert({
      organization_id: organizationId,
      name,
      color,
      icon,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return toCategory(data);
}

export async function seedDefaultCategories(organizationId: string): Promise<EquipmentCategory[]> {
  // Fix legacy: delete "CLIM / TCD" (renamed to "CLIM")
  await supabase
    .from('equipment_categories')
    .delete()
    .eq('organization_id', organizationId)
    .eq('name', 'CLIM / TCD');

  // Get existing category names to avoid duplicates
  const { data: existing } = await supabase
    .from('equipment_categories')
    .select('name')
    .eq('organization_id', organizationId);

  const existingNames = new Set((existing ?? []).map(e => e.name as string));

  // Only insert categories that don't exist yet
  const missing = DEFAULT_CATEGORIES.filter(d => !existingNames.has(d.name));

  if (missing.length > 0) {
    const { error } = await supabase
      .from('equipment_categories')
      .insert(
        missing.map(d => ({
          organization_id: organizationId,
          name: d.name,
          color: d.color,
          icon: d.icon,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
      );
    if (error) throw error;
  }

  return getCategories(organizationId);
}

// ============================================================
// DASHBOARD HELPERS
// ============================================================

export async function getDashboardEquipmentStats(auditIds: string[]): Promise<{ count: number; powerKW: number }> {
  const { data, error } = await supabase
    .from('audit_equipment')
    .select('power_w, quantity')
    .in('audit_id', auditIds);
  if (error) throw error;
  const rows = data ?? [];
  const powerKW = rows.reduce(
    (sum, e) => sum + ((e.power_w ?? 0) * (e.quantity ?? 1)) / 1000,
    0
  );
  return { count: rows.length, powerKW };
}

// ============================================================
// INVENTORY SNAPSHOT (full audit — for visualization)
// ============================================================

export interface EquipmentSnapshot {
  id: string;
  name: string;
  brand?: string;
  status: 'EN service' | 'Hors Service';
  powerW?: number;
  quantity: number;
  utilizationFactor: number;
  totalPowerW?: number;
  kwhPerYear?: number;
  metadata: Record<string, any>;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  roomId: string;
  roomCode: string;
  roomService?: string;
  levelId: string;
  levelName: string;
  buildingId: string;
  buildingName: string;
  buildingSurface: number;  // surface_batie m² (0 if not set)
  zoneId: string;
  zoneName: string;
  siteId: string;
  siteName: string;
}

export async function getInventorySnapshot(auditId: string): Promise<EquipmentSnapshot[]> {
  // 6 parallel queries — all rows belong to this audit
  const [
    { data: equipment, error: eErr },
    { data: rooms,     error: rErr },
    { data: levels,    error: lErr },
    { data: buildings, error: bErr },
    { data: zones,     error: zErr },
    { data: sites,     error: sErr },
  ] = await Promise.all([
    supabase.from('audit_equipment').select('*, equipment_categories(name, color)').eq('audit_id', auditId),
    supabase.from('audit_rooms').select('id, code, service, level_id').eq('audit_id', auditId),
    supabase.from('audit_levels').select('id, name, building_id').eq('audit_id', auditId),
    supabase.from('audit_buildings').select('id, building_name, site_id, zone_id, surface_batie').eq('audit_id', auditId),
    supabase.from('audit_zones').select('id, name, site_id').eq('audit_id', auditId),
    supabase.from('audit_sites').select('id, name').eq('audit_id', auditId),
  ]);

  if (eErr) throw eErr;
  if (rErr) throw rErr;
  if (lErr) throw lErr;
  if (bErr) throw bErr;
  if (zErr) throw zErr;
  if (sErr) throw sErr;

  const roomMap  = new Map((rooms     ?? []).map(r => [r.id, r]));
  const levelMap = new Map((levels    ?? []).map(l => [l.id, l]));
  const bldgMap  = new Map((buildings ?? []).map(b => [b.id, b]));
  const zoneMap  = new Map((zones     ?? []).map(z => [z.id, z]));
  const siteMap  = new Map((sites     ?? []).map(s => [s.id, s]));

  return (equipment ?? []).map(e => {
    const eq       = toEquipment(e);
    const room     = roomMap.get(eq.roomId);
    const level    = room     ? levelMap.get(room.level_id)        : undefined;
    const building = level    ? bldgMap.get(level.building_id)     : undefined;
    const zone     = building ? zoneMap.get(building.zone_id)      : undefined;
    const site     = building ? siteMap.get(building.site_id)      : undefined;

    return {
      id:                eq.id,
      name:              eq.name,
      brand:             eq.brand,
      status:            eq.status,
      powerW:            eq.powerW,
      quantity:          eq.quantity,
      utilizationFactor: eq.utilizationFactor,
      totalPowerW:       eq.totalPowerW,
      kwhPerYear:        eq.kwhPerYear,
      metadata:      eq.metadata ?? {},
      categoryId:    eq.categoryId    ?? '',
      categoryName:  e.equipment_categories?.name  ?? 'Non catégorisé',
      categoryColor: e.equipment_categories?.color ?? '#64748b',
      roomId:        eq.roomId,
      roomCode:      room?.code          ?? '—',
      roomService:   room?.service,
      levelId:       level?.id           ?? '',
      levelName:     level?.name         ?? '—',
      buildingId:      building?.id            ?? '',
      buildingName:    building?.building_name ?? '—',
      buildingSurface: building?.surface_batie ?? 0,
      zoneId:          zone?.id               ?? '',
      zoneName:      zone?.name          ?? '—',
      siteId:        site?.id            ?? '',
      siteName:      site?.name          ?? '—',
    };
  });
}

// ============================================================
// TRANSFORMERS (DB snake_case → TS camelCase)
// ============================================================

function toZone(db: any): InventoryZone {
  return {
    id: db.id,
    auditId: db.audit_id,
    siteId: db.site_id,
    name: db.name,
    description: db.description ?? undefined,
    orderIndex: db.order_index ?? 0,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function toLevel(db: any): InventoryLevel {
  return {
    id: db.id,
    auditId: db.audit_id,
    buildingId: db.building_id,
    name: db.name,
    orderIndex: db.order_index,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function toRoom(db: any): InventoryRoom {
  return {
    id: db.id,
    auditId: db.audit_id,
    levelId: db.level_id,
    code: db.code,
    service: db.service,
    surfaceM2: db.surface_m2,
    typeFonctionnel: db.type_fonctionnel ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function toBuildingTypeParams(db: any): BuildingTypeParams {
  return {
    id: db.id,
    buildingId: db.building_id,
    auditId: db.audit_id,
    typeFonctionnel: db.type_fonctionnel,
    joursNonTravailles: db.jours_non_travailles,
    joursFeries: db.jours_feries,
    joursFraicheur: db.jours_fraicheur,
    correctionFraicheur: db.correction_fraicheur,
    correctionWeekend: db.correction_weekend,
    correctionFerie: db.correction_ferie,
    correctionOuvres: db.correction_ouvres,
    tpsEcl: db.tps_ecl,
    tpsClim: db.tps_clim,
    tpsInform: db.tps_inform,
    tpsElectrom: db.tps_electrom,
    tpsServeur: db.tps_serveur,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function toEquipment(db: any): InventoryEquipment {
  const powerW = db.power_w;
  const quantity = db.quantity ?? 1;
  const utilizationFactor = db.utilization_factor ?? 1.0;
  const heuresAn = db.metadata?.heuresAn;
  const installedPowerW = powerW != null ? powerW * quantity * utilizationFactor : undefined;
  // Hors Service → zero power and zero consumption (equipment is inventoried but not running)
  const totalPowerW = db.status === 'Hors Service' ? 0 : installedPowerW;
  const kwhPerYear = db.status === 'Hors Service'
    ? 0
    : db.metadata?.kwhPreCalculated != null
      ? db.metadata.kwhPreCalculated
      : (totalPowerW != null && heuresAn ? (totalPowerW / 1000) * heuresAn : undefined);

  return {
    id: db.id,
    auditId: db.audit_id,
    roomId: db.room_id,
    categoryId: db.category_id,
    categoryName: db.equipment_categories?.name,
    name: db.name,
    brand: db.brand,
    status: db.status,
    powerW,
    quantity,
    utilizationFactor,
    metadata: db.metadata ?? {},
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    totalPowerW,
    kwhPerYear,
  };
}

function toCategory(db: any): EquipmentCategory {
  return {
    id: db.id,
    organizationId: db.organization_id,
    parentId: db.parent_id,
    name: db.name,
    color: db.color ?? '#6366f1',
    icon: db.icon,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
