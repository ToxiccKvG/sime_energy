// ============================================================
// IOT — Recettes de nettoyage (table analyse_recettes)
//
// Une recette n'est PAS une copie des données : c'est ce qu'on a chargé,
// selon quelles règles, et ce qu'on a exclu. La rouvrir rejoue exactement
// la même analyse sur les données brutes, qui ne sont jamais réécrites
// (migration 20261016_analyse_recettes). Visible par toute l'organisation ;
// seul l'auteur la modifie ou la supprime.
// ============================================================

import { supabase } from '@/lib/supabase';
import type { SupabaseExportOptions } from '@/lib/iot-supabase-service';

export interface ExclusionManuelle {
  device_id: string;
  debut: string;
  fin: string;
  motif: string;
}

export interface Recette {
  id: string;
  organization_id: string;
  nom: string;
  description: string | null;
  chargement: SupabaseExportOptions;
  regles_exclues: string[];
  exclusions: ExclusionManuelle[];
  regles_au: string | null;
  cree_par: string | null;
  cree_le: string;
}

export async function fetchRecettes(organizationId: string): Promise<Recette[]> {
  const { data, error } = await supabase
    .from('analyse_recettes')
    .select('*')
    .eq('organization_id', organizationId)
    .order('cree_le', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Recette[];
}

export async function creerRecette(r: {
  organizationId: string;
  nom: string;
  description?: string;
  chargement: SupabaseExportOptions;
  reglesExclues: string[];
  reglesAu: string | null;
}): Promise<Recette> {
  const { data, error } = await supabase
    .from('analyse_recettes')
    .insert({
      organization_id: r.organizationId,
      nom: r.nom,
      description: r.description ?? null,
      chargement: r.chargement,
      regles_exclues: r.reglesExclues,
      regles_au: r.reglesAu,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Recette;
}

export async function supprimerRecette(id: string): Promise<void> {
  const { error } = await supabase.from('analyse_recettes').delete().eq('id', id);
  if (error) throw error;
}
