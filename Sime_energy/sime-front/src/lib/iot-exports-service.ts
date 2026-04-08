import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TypeExport = 'xlsx' | 'csv' | 'pdf' | 'png' | 'svg';

export interface IotExportLog {
  id: string;
  organization_id: string;
  iot_site_id: string | null;
  type_export: TypeExport;
  nom_fichier: string;
  lien_storage: string | null;
  taille_octets: number | null;
  parametres: Record<string, unknown>;
  generated_by: string;
  generated_at: string;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getExportsLog(
  organizationId: string,
  siteId?: string,
  limit: number = 50,
): Promise<IotExportLog[]> {
  let query = supabase
    .from('iot_exports_log')
    .select('*')
    .eq('organization_id', organizationId)
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (siteId) {
    query = query.eq('iot_site_id', siteId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as IotExportLog[];
}

export async function logExport(
  organizationId: string,
  userId: string,
  input: {
    iot_site_id?: string;
    type_export: TypeExport;
    nom_fichier: string;
    lien_storage?: string;
    taille_octets?: number;
    parametres?: Record<string, unknown>;
  },
): Promise<IotExportLog> {
  const { data, error } = await supabase
    .from('iot_exports_log')
    .insert({
      organization_id: organizationId,
      iot_site_id:    input.iot_site_id ?? null,
      type_export:    input.type_export,
      nom_fichier:    input.nom_fichier,
      lien_storage:   input.lien_storage ?? null,
      taille_octets:  input.taille_octets ?? null,
      parametres:     input.parametres ?? {},
      generated_by:   userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as IotExportLog;
}
