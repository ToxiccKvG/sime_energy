import { supabase } from '@/lib/supabase';
import { Audit } from '@/types/audit';

// Types pour Supabase
export interface AuditDB {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  color: string;
  status: 'planned' | 'in_progress' | 'completed';
  start_date: string;
  end_date?: string;
  completion_percentage: number;
  responsable?: string;
  general_info: Record<string, any>;
  personnel: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AuditSiteDB {
  id: string;
  audit_id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  status: 'planned' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface AuditBuildingDB {
  id: string;
  site_id: string;
  audit_id: string;
  building_name: string;
  building_type: string;
  surface_terrain?: number;
  surface_batie?: number;
  surface_toiture?: number;
  created_at: string;
  updated_at: string;
}

// Créer un audit
export async function createAudit(audit: Partial<Audit>, organizationId: string, userId: string) {
  const { data, error } = await supabase
    .from('audits')
    .insert([
      {
        organization_id: organizationId,
        created_by: userId,
        name: audit.name,
        color: audit.color,
        status: audit.status || 'planned',
        start_date: audit.startDate,
        end_date: audit.endDate,
        completion_percentage: audit.completionPercentage || 0,
        responsable: audit.responsable,
        client_type: audit.clientType,
        general_info: audit.generalInfo || {},
        personnel: audit.personnel || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0];
}

// Récupérer les audits de l'organisation
export async function getAudits(organizationId: string) {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Récupérer un audit spécifique
export async function getAudit(auditId: string) {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (error) throw error;
  return data;
}

// Mettre à jour un audit
export async function updateAudit(auditId: string, updates: Partial<Audit>) {
  const { data, error } = await supabase
    .from('audits')
    .update({
      name: updates.name,
      color: updates.color,
      status: updates.status,
      start_date: updates.startDate,
      end_date: updates.endDate,
      completion_percentage: updates.completionPercentage,
      responsable: updates.responsable,
      client_type: updates.clientType,
      general_info: updates.generalInfo,
      personnel: updates.personnel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auditId)
    .select();

  if (error) throw error;
  return data?.[0];
}

// Créer un site d'audit
export async function createAuditSite(
  auditId: string,
  site: Partial<AuditSiteDB>
) {
  const { data, error } = await supabase
    .from('audit_sites')
    .insert([
      {
        audit_id: auditId,
        name: site.name,
        address: site.address,
        latitude: site.latitude,
        longitude: site.longitude,
        status: site.status || 'planned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0];
}

// Récupérer les sites d'un audit
export async function getAuditSites(auditId: string) {
  const { data, error } = await supabase
    .from('audit_sites')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Créer un bâtiment
export async function createAuditBuilding(
  siteId: string,
  auditId: string,
  building: Partial<AuditBuildingDB> & { zone_id?: string }
) {
  const { data, error } = await supabase
    .from('audit_buildings')
    .insert([
      {
        site_id: siteId,
        zone_id: building.zone_id ?? null,
        audit_id: auditId,
        building_name: building.building_name,
        building_type: building.building_type,
        surface_terrain: building.surface_terrain,
        surface_batie: building.surface_batie,
        surface_toiture: building.surface_toiture,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0];
}

// Mettre à jour un bâtiment
export async function updateAuditBuilding(buildingId: string, updates: Partial<AuditBuildingDB>) {
  const { data, error } = await supabase
    .from('audit_buildings')
    .update({
      building_name: updates.building_name,
      building_type: updates.building_type,
      surface_terrain: updates.surface_terrain,
      surface_batie: updates.surface_batie,
      surface_toiture: updates.surface_toiture,
      updated_at: new Date().toISOString(),
    })
    .eq('id', buildingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Supprimer un bâtiment
export async function deleteAuditBuilding(buildingId: string) {
  const { error } = await supabase.from('audit_buildings').delete().eq('id', buildingId);
  if (error) throw error;
}

// Récupérer les bâtiments d'un site
export async function getAuditBuildings(siteId: string) {
  const { data, error } = await supabase
    .from('audit_buildings')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Supprimer un audit (cascade sur les données liées)
export async function deleteAudit(auditId: string) {
  // Delete buildings first (audit_buildings may not have cascade from audits)
  const sites = await getAuditSites(auditId);
  if (sites && sites.length > 0) {
    for (const site of sites) {
      const buildings = await getAuditBuildings(site.id);
      if (buildings && buildings.length > 0) {
        for (const b of buildings) {
          await deleteAuditBuilding(b.id);
        }
      }
    }
    // Delete sites
    const { error: sitesErr } = await supabase
      .from('audit_sites')
      .delete()
      .eq('audit_id', auditId);
    if (sitesErr) throw sitesErr;
  }
  const { error } = await supabase.from('audits').delete().eq('id', auditId);
  if (error) throw error;
}

// Mettre à jour un site
export async function updateAuditSite(siteId: string, updates: Partial<AuditSiteDB>) {
  const { data, error } = await supabase
    .from('audit_sites')
    .update({
      name: updates.name,
      address: updates.address,
      latitude: updates.latitude,
      longitude: updates.longitude,
      status: updates.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Supprimer un site et ses bâtiments
export async function deleteAuditSite(siteId: string) {
  const buildings = await getAuditBuildings(siteId);
  if (buildings && buildings.length > 0) {
    for (const b of buildings) {
      await deleteAuditBuilding(b.id);
    }
  }
  const { error } = await supabase.from('audit_sites').delete().eq('id', siteId);
  if (error) throw error;
}

// ─── Dashboard helpers ──────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  action?: string;
  description?: string;
  entity_type?: string;
  created_at: string;
}

export async function getDashboardSiteCount(auditIds: string[]): Promise<number> {
  const { data, error } = await supabase.from('audit_sites').select('id').in('audit_id', auditIds);
  if (error) throw error;
  return data?.length ?? 0;
}

export async function getDashboardInvoiceCount(auditIds: string[]): Promise<number> {
  const { data, error } = await supabase.from('audit_invoices').select('id').in('audit_id', auditIds);
  if (error) throw error;
  return data?.length ?? 0;
}

export async function getDashboardActivity(auditIds: string[]): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('audit_activity')
    .select('id, action, description, entity_type, created_at')
    .in('audit_id', auditIds)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) throw error;
  return data ?? [];
}

// Calculer le taux de complétion d'un audit
export function computeAuditCompletion(
  audit: any,
  opts?: { totalSites?: number; totalBuildings?: number; totalEquipment?: number }
): number {
  const gi = audit.general_info || {};
  const pers = audit.personnel || {};
  const hasPersonnel = Object.values(pers).some((v: any) => v && typeof v === 'object' && (v as any).nom?.trim());

  const checks = [
    // Infos de base (4 × 5 = 20%)
    !!audit.name?.trim(),
    !!audit.responsable?.trim(),
    !!audit.start_date,
    !!audit.end_date,
    // Infos générales (4 × 5 = 20%)
    !!gi.nomEtablissement?.trim(),
    !!(gi.secteur?.trim() || gi.typeClient?.trim()),
    !!(gi.ville?.trim() || gi.adresseSiege?.trim()),
    !!(gi.effectifs || gi.macs),
    // Personnel (2 × 5 = 10%)
    hasPersonnel,
    Object.keys(pers).length > 1,
    // Statut (2 × 5 = 10%)
    audit.status === 'in_progress' || audit.status === 'completed',
    audit.status === 'completed',
    // Données structurelles (4 × 10 = 40%)
    (opts?.totalSites ?? 0) > 0,
    (opts?.totalBuildings ?? 0) > 0,
    (opts?.totalEquipment ?? 0) > 0,
    (opts?.totalEquipment ?? 0) > 5,
  ];

  const score = checks.filter(Boolean).length;
  return Math.round((score / checks.length) * 100);
}
