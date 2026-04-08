import { supabase } from '@/lib/supabase';
import type { SourceCode } from './iot-sources-service';
import type { TrancheHoraire } from './iot-mesures-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulationConditions {
  plage_horaire?: { debut: string; fin: string };   // ex: '08:00' / '18:00'
  separer_hp_hc?: boolean;
  jours?: Array<'ouvre' | 'weekend' | 'all'>;
  exclure_feries?: boolean;
  coefficient?: number;                              // ex: 3 (triphasé), 0.001 (W→kW)
  seuil_puissance_kw?: number;
  exclure_aberrants?: boolean;
  tarif_id?: string;
  sources?: SourceCode[];
  periode?: { debut: string; fin: string };          // 'YYYY-MM-DD'
}

export interface SimulationResultatDetail {
  par_mois?: Array<{ mois: string; kwh: number; devise: number }>;
  par_source?: Array<{ source: SourceCode; kwh: number; devise: number }>;
  par_tranche?: Array<{ tranche: TrancheHoraire; kwh: number; devise: number }>;
}

export interface IotSimulation {
  id: string;
  organization_id: string;
  iot_site_id: string;
  nom: string;
  description: string | null;
  actif: boolean;
  conditions: SimulationConditions;
  kwh_economises: number | null;
  pct_reduction: number | null;
  gain_devise: number | null;
  resultats_detail: SimulationResultatDetail | null;
  calcule_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getIotSimulations(
  siteId: string,
): Promise<IotSimulation[]> {
  const { data, error } = await supabase
    .from('iot_simulations')
    .select('*')
    .eq('iot_site_id', siteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as IotSimulation[];
}

export async function createIotSimulation(
  organizationId: string,
  siteId: string,
  input: {
    nom: string;
    description?: string;
    conditions: SimulationConditions;
  },
  userId: string,
): Promise<IotSimulation> {
  const { data, error } = await supabase
    .from('iot_simulations')
    .insert({
      organization_id: organizationId,
      iot_site_id:    siteId,
      nom:            input.nom,
      description:    input.description ?? null,
      conditions:     input.conditions,
      created_by:     userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as IotSimulation;
}

export async function updateIotSimulation(
  simulationId: string,
  updates: Partial<Pick<IotSimulation, 'nom' | 'description' | 'conditions' | 'actif'>>,
): Promise<IotSimulation> {
  const { data, error } = await supabase
    .from('iot_simulations')
    .update(updates)
    .eq('id', simulationId)
    .select()
    .single();

  if (error) throw error;
  return data as IotSimulation;
}

/** Sauvegarde les résultats calculés en cache */
export async function sauvegarderResultats(
  simulationId: string,
  resultats: {
    kwh_economises: number;
    pct_reduction: number;
    gain_devise: number;
    resultats_detail: SimulationResultatDetail;
  },
): Promise<void> {
  const { error } = await supabase
    .from('iot_simulations')
    .update({
      kwh_economises:   resultats.kwh_economises,
      pct_reduction:    resultats.pct_reduction,
      gain_devise:      resultats.gain_devise,
      resultats_detail: resultats.resultats_detail,
      calcule_at:       new Date().toISOString(),
    })
    .eq('id', simulationId);

  if (error) throw error;
}

export async function deleteIotSimulation(simulationId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_simulations')
    .delete()
    .eq('id', simulationId);

  if (error) throw error;
}

export async function toggleIotSimulation(
  simulationId: string,
  actif: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('iot_simulations')
    .update({ actif })
    .eq('id', simulationId);

  if (error) throw error;
}
