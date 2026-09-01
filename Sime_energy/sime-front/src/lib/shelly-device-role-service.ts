// ============================================================
// Service — Rattachement appareil → rôle électrique
// Table : shelly_device_roles (migration 20260901)
//
// `device_family` dit quel MATÉRIEL est branché, ce service dit
// CE QU'IL MESURE (arrivée réseau, production PV, charge…). C'est
// ce qui permet au dashboard d'être multi-site sans coder en dur
// ni le nom du site ni des expressions régulières sur les noms
// d'appareils — lesquels changent côté Shelly Cloud.
// ============================================================

import { supabase } from '@/lib/supabase';

export type DeviceRole =
  | 'M1_RESEAU' | 'M2_SELECTEUR' | 'M3_CHARGE' | 'M4_GROUPE' | 'M5_PV'
  | 'BESS' | 'DEPART' | 'AMBIANCE' | 'AUTRE';

export const DEVICE_ROLES: { value: DeviceRole; label: string }[] = [
  { value: 'M1_RESEAU',    label: 'M1 — Arrivée réseau public' },
  { value: 'M2_SELECTEUR', label: 'M2 — Sélecteur / inverseur PV-réseau' },
  { value: 'M3_CHARGE',    label: 'M3 — Charge totale du site' },
  { value: 'M4_GROUPE',    label: 'M4 — Groupe électrogène' },
  { value: 'M5_PV',        label: 'M5 — Production photovoltaïque' },
  { value: 'BESS',         label: 'Batterie de stockage' },
  { value: 'DEPART',       label: 'Départ / sous-charge' },
  { value: 'AMBIANCE',     label: "Capteur d'ambiance" },
  { value: 'AUTRE',        label: 'Autre' },
];

export interface ShellyDeviceRole {
  device_id: string;
  role: DeviceRole;
  libelle: string | null;
  /** TC monté à l'envers : les compteurs soutirage/injection sont permutés. */
  sens_inverse: boolean;
  origine: 'auto' | 'manuel';
  /** null = proposition non validée par un humain, à ne pas présenter comme acquise. */
  confirme_at: string | null;
}

export async function fetchDeviceRoles(): Promise<ShellyDeviceRole[]> {
  const { data, error } = await supabase
    .from('shelly_device_roles')
    .select('device_id,role,libelle,sens_inverse,origine,confirme_at');
  if (error) throw error;
  return (data ?? []) as ShellyDeviceRole[];
}

/** Index device_id → rattachement, forme attendue par les cartes du dashboard. */
export function indexRolesByDevice(roles: ShellyDeviceRole[]): Map<string, ShellyDeviceRole> {
  return new Map(roles.map(r => [r.device_id, r]));
}

export async function upsertDeviceRole(
  role: Pick<ShellyDeviceRole, 'device_id' | 'role'> & Partial<ShellyDeviceRole>,
): Promise<void> {
  const { error } = await supabase
    .from('shelly_device_roles')
    .upsert({ ...role, origine: role.origine ?? 'manuel' }, { onConflict: 'device_id' });
  if (error) throw error;
}

/** Validation humaine d'une proposition : c'est elle qui rend le rattachement acquis. */
export async function confirmDeviceRoles(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) return;
  const { error } = await supabase
    .from('shelly_device_roles')
    .update({ confirme_at: new Date().toISOString() })
    .in('device_id', deviceIds);
  if (error) throw error;
}

export async function deleteDeviceRole(deviceId: string): Promise<void> {
  const { error } = await supabase.from('shelly_device_roles').delete().eq('device_id', deviceId);
  if (error) throw error;
}
