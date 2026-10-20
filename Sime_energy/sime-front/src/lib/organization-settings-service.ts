import { supabase } from '@/lib/supabase';
import type { MeteoSettings } from '@/services/meteo-service';

// Réglages partagés par l'organisation — colonne organizations.settings (JSONB)
export interface OrganizationSettings {
  version?: number;
  meteo?: MeteoSettings;
  updated_at?: string;
  updated_by?: string;
  migrated_from?: string;
}

export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single();
  if (error) throw error;
  return (data?.settings ?? {}) as OrganizationSettings;
}

export async function updateOrganizationSettings(
  organizationId: string,
  patch: Partial<OrganizationSettings>,
  userId: string,
): Promise<OrganizationSettings> {
  const current = await getOrganizationSettings(organizationId);
  const next: OrganizationSettings = {
    ...current,
    ...patch,
    version: 1,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  const { data, error } = await supabase
    .from('organizations')
    .update({ settings: next })
    .eq('id', organizationId)
    .select('settings')
    .single();
  if (error) throw error;
  return data.settings as OrganizationSettings;
}
