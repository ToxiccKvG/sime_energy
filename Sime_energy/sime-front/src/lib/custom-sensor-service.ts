import { supabase } from './supabase';

export interface ExtraCol {
  label: string;
  col: string;
}

export type QuantityKind = 'power' | 'energy' | 'other';

const POWER_UNITS = new Set(['w', 'kw', 'mw', 'va', 'kva', 'var', 'kvar']);
const ENERGY_UNITS = new Set(['wh', 'kwh', 'mwh', 'vah', 'kvah', 'varh', 'kvarh']);

/**
 * Devine le type de grandeur à partir de l'unité tapée par l'utilisateur — sert
 * de valeur par défaut intelligente dans le formulaire de capteur personnalisé,
 * pour éviter qu'une puissance (W/kW…) reste sur "energy" par défaut et soit
 * sommée au lieu d'être intégrée dans le temps (calcul physiquement faux).
 * Reste un simple point de départ : l'utilisateur peut toujours corriger via le
 * sélecteur "Type de grandeur".
 */
export function guessQuantityKind(unit: string): QuantityKind {
  const u = unit.trim().toLowerCase();
  if (!u) return 'other';
  if (POWER_UNITS.has(u)) return 'power';
  if (ENERGY_UNITS.has(u)) return 'energy';
  return 'other';
}

export interface CustomSensor {
  id: string;
  organization_id: string;
  name: string;
  timestamp_col: string;
  timestamp_format?: string;
  value_col: string;
  unit: string;
  metric_label: string;
  extra_cols: ExtraCol[];
  keep_negative: boolean;
  /** Puissance instantanée (intégrée en énergie) / Énergie déjà cumulable (sommée) / Autre (pas de cumul). */
  quantity_kind?: QuantityKind;
  created_at: string;
}

export type CustomSensorInput = Omit<CustomSensor, 'id' | 'created_at'>;

export async function getCustomSensors(organizationId: string): Promise<CustomSensor[]> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomSensor[];
}

export async function saveCustomSensor(sensor: CustomSensorInput): Promise<CustomSensor> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .insert(sensor)
    .select()
    .single();
  if (error) throw error;
  return data as CustomSensor;
}

export async function deleteCustomSensor(id: string): Promise<void> {
  const { error } = await supabase.from('custom_sensors').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCustomSensor(id: string, patch: Partial<CustomSensorInput>): Promise<CustomSensor> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomSensor;
}
