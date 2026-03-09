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
  building: Partial<AuditBuildingDB>
) {
  const { data, error } = await supabase
    .from('audit_buildings')
    .insert([
      {
        site_id: siteId,
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
