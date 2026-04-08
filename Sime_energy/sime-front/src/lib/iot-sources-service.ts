import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceCode = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
export type SourceType = 'reseau' | 'ats' | 'charge' | 'generateur' | 'pv_batterie';

export const SOURCE_DEFAULTS: Record<SourceCode, { nom: string; type: SourceType; couleur: string; ordre: number }> = {
  M1: { nom: 'Réseau public',       type: 'reseau',      couleur: '#378ADD', ordre: 1 },
  M2: { nom: 'Sélecteur / ATS',     type: 'ats',         couleur: '#D85A30', ordre: 2 },
  M3: { nom: 'Charge (TGBD)',        type: 'charge',      couleur: '#7F77DD', ordre: 3 },
  M4: { nom: 'Groupe électrogène',   type: 'generateur',  couleur: '#BA7517', ordre: 4 },
  M5: { nom: 'PV + Batterie',        type: 'pv_batterie', couleur: '#1D9E75', ordre: 5 },
};

export interface IotSource {
  id: string;
  iot_site_id: string;
  organization_id: string;
  code: SourceCode;
  device_id: string | null;
  nom: string;
  type: SourceType;
  capteur: string | null;
  couleur: string;
  actif: boolean;
  ordre: number;
  est_deduit: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIotSourceInput {
  iot_site_id: string;
  organization_id: string;
  code: SourceCode;
  device_id?: string;
  nom?: string;
  type?: SourceType;
  capteur?: string;
  couleur?: string;
  est_deduit?: boolean;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getIotSources(siteId: string): Promise<IotSource[]> {
  const { data, error } = await supabase
    .from('iot_sources')
    .select('*')
    .eq('iot_site_id', siteId)
    .order('ordre', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createIotSource(input: CreateIotSourceInput): Promise<IotSource> {
  const defaults = SOURCE_DEFAULTS[input.code];

  const { data, error } = await supabase
    .from('iot_sources')
    .insert({
      iot_site_id:    input.iot_site_id,
      organization_id: input.organization_id,
      code:           input.code,
      device_id:      input.device_id ?? null,
      nom:            input.nom ?? defaults.nom,
      type:           input.type ?? defaults.type,
      capteur:        input.capteur ?? null,
      couleur:        input.couleur ?? defaults.couleur,
      ordre:          defaults.ordre,
      est_deduit:     input.est_deduit ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateIotSource(
  sourceId: string,
  updates: Partial<Pick<IotSource, 'device_id' | 'nom' | 'capteur' | 'couleur' | 'actif' | 'ordre' | 'est_deduit'>>,
): Promise<IotSource> {
  const { data, error } = await supabase
    .from('iot_sources')
    .update(updates)
    .eq('id', sourceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteIotSource(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_sources')
    .delete()
    .eq('id', sourceId);

  if (error) throw error;
}

export async function toggleIotSource(sourceId: string, actif: boolean): Promise<void> {
  const { error } = await supabase
    .from('iot_sources')
    .update({ actif })
    .eq('id', sourceId);

  if (error) throw error;
}

/** Réordonne les sources par drag & drop */
export async function reorderIotSources(
  updates: Array<{ id: string; ordre: number }>,
): Promise<void> {
  const { error } = await supabase
    .from('iot_sources')
    .upsert(updates, { onConflict: 'id' });

  if (error) throw error;
}
