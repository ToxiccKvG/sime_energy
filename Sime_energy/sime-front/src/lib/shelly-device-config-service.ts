// ============================================================
// Service — Classification des types de dispositifs Shelly
// et gestion des canaux multi-relais (tables shelly_device_types,
// shelly_device_channels). Permet de compléter la collecte IOT
// sans intervention développeur quand un nouveau type de matériel
// ou une nouvelle prise multi-relais apparaît.
// ============================================================

import { supabase } from '@/lib/supabase';

export type DeviceFamily =
  | 'ENERGIE_3PH' | 'ENERGIE_2PH' | 'ENERGIE_1PH' | 'LUMIERE' | 'CAPTEUR_ENV' | 'ETAT';

export const DEVICE_FAMILIES: { value: DeviceFamily; label: string }[] = [
  { value: 'ENERGIE_3PH', label: 'Énergie triphasée' },
  { value: 'ENERGIE_2PH', label: 'Énergie biphasée' },
  { value: 'ENERGIE_1PH', label: 'Énergie monophasée' },
  { value: 'LUMIERE',     label: 'Lumière' },
  { value: 'CAPTEUR_ENV', label: 'Capteur environnemental' },
  { value: 'ETAT',        label: 'État / capteur binaire' },
];

// ── Types de dispositifs ──────────────────────────────────────

export interface ShellyDeviceType {
  id: string;
  device_type: string;
  device_family: DeviceFamily;
  label: string | null;
  match_prefix: boolean;
  created_at: string;
  updated_at: string;
}

export type ShellyDeviceTypeInput = Omit<ShellyDeviceType, 'id' | 'created_at' | 'updated_at'>;

export async function fetchDeviceTypes(): Promise<ShellyDeviceType[]> {
  const { data, error } = await supabase
    .from('shelly_device_types')
    .select('*')
    .order('device_type', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertDeviceType(input: ShellyDeviceTypeInput): Promise<ShellyDeviceType> {
  const { data, error } = await supabase
    .from('shelly_device_types')
    .upsert(input, { onConflict: 'device_type' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDeviceType(id: string): Promise<void> {
  const { error } = await supabase.from('shelly_device_types').delete().eq('id', id);
  if (error) throw error;
}

// ── Types non classifiés (détectés dans shelly_cl) ────────────

export interface UnclassifiedDeviceType {
  device_type: string;
  example_device_id: string;
  example_name: string;
  sites: string[];
  last_seen: string;
}

export async function fetchUnclassifiedDeviceTypes(): Promise<UnclassifiedDeviceType[]> {
  const [{ data: rows, error: rowsError }, knownTypes] = await Promise.all([
    supabase
      .from('shelly_cl')
      .select('device_type,device_family,device_id,name,site,ts')
      .eq('device_family', 'INCONNU')
      .not('device_type', 'is', null)
      .order('ts', { ascending: false })
      .limit(3000),
    fetchDeviceTypes(),
  ]);
  if (rowsError) throw rowsError;

  const known = new Set(knownTypes.map(t => t.device_type));
  const byType = new Map<string, UnclassifiedDeviceType>();

  for (const r of rows ?? []) {
    if (!r.device_type || known.has(r.device_type)) continue;
    const existing = byType.get(r.device_type);
    if (!existing) {
      byType.set(r.device_type, {
        device_type: r.device_type,
        example_device_id: r.device_id,
        example_name: r.name ?? r.device_id,
        sites: r.site ? [r.site] : [],
        last_seen: r.ts,
      });
    } else if (r.site && !existing.sites.includes(r.site)) {
      existing.sites.push(r.site);
    }
  }

  return Array.from(byType.values()).sort((a, b) => a.device_type.localeCompare(b.device_type));
}

// ── Canaux multi-relais ────────────────────────────────────────

export interface ShellyDeviceChannel {
  id: string;
  parent_device_id: string;
  channel_number: number;
  channel_name: string;
  site: string;
  created_at: string;
  updated_at: string;
}

export type ShellyDeviceChannelInput = Omit<ShellyDeviceChannel, 'id' | 'created_at' | 'updated_at'>;

export async function fetchChannels(): Promise<ShellyDeviceChannel[]> {
  const { data, error } = await supabase
    .from('shelly_device_channels')
    .select('*')
    .order('parent_device_id', { ascending: true })
    .order('channel_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertChannel(input: ShellyDeviceChannelInput): Promise<ShellyDeviceChannel> {
  const { data, error } = await supabase
    .from('shelly_device_channels')
    .upsert(input, { onConflict: 'parent_device_id,channel_number' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChannel(id: string): Promise<void> {
  const { error } = await supabase.from('shelly_device_channels').delete().eq('id', id);
  if (error) throw error;
}

// ── Forcer un refresh metadata (sans attendre le cycle 10 min) ─

export async function forceMetadataRefresh(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('poll-shelly', {
      body: { forceMetaRefresh: true },
    });
    if (error) return { ok: false, error: String(error) };
    return { ok: data?.ok ?? true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
