// ============================================================
// Service — Coupures d'électricité et leurs causes
// Tables : coupures, coupure_causes (migration 20261005)
//
// Les coupures sont détectées par scripts/detect_coupures.py (--save) ;
// ce service sert à les LIRE et à en qualifier la cause. Une cause
// proposée par le système reste « proposee » tant qu'un humain ne l'a
// pas confirmée (même principe que les rôles d'appareils).
// ============================================================

import { supabase } from '@/lib/supabase';

export type CauseOrigin = 'externe' | 'interne' | 'a_qualifier' | 'non_retenue';

export interface CoupureCause {
  code: string;
  origine: CauseOrigin;
  libelle: string;
  ordre: number;
}

export interface Coupure {
  id: string;
  site: string;
  debut_at: string;
  fin_at: string;
  duree_min: number;
  end_kwh: number | null;
  cause_declencheur: string;
  cause_aggravante: string | null;
  statut_cause: 'proposee' | 'confirmee';
  cause_indice: string | null;
  commentaire: string | null;
  confirme_at: string | null;
}

// Externe = le courant manque côté réseau (coupure) ; interne = le site
// coupe lui-même, volontairement ou non (mise hors tension). Remarque du manager, 12/10.
export const ORIGIN_LABELS: Record<CauseOrigin, string> = {
  externe: 'Coupure réseau', interne: 'Mise hors tension (site)', a_qualifier: 'À qualifier', non_retenue: 'Pas une coupure',
};

export async function fetchCauses(): Promise<CoupureCause[]> {
  const { data, error } = await supabase
    .from('coupure_causes')
    .select('code,origine,libelle,ordre')
    .eq('actif', true)
    .order('ordre');
  if (error) throw error;
  return (data ?? []) as CoupureCause[];
}

/** Coupures depuis `sinceIso` (ou toutes), les plus récentes d'abord. */
export async function fetchCoupures(sinceIso?: string): Promise<Coupure[]> {
  let q = supabase
    .from('coupures')
    .select('id,site,debut_at,fin_at,duree_min,end_kwh,cause_declencheur,cause_aggravante,statut_cause,cause_indice,commentaire,confirme_at')
    .order('debut_at', { ascending: false })
    .limit(2000);
  if (sinceIso) q = q.gte('debut_at', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, duree_min: Number(r.duree_min), end_kwh: r.end_kwh === null ? null : Number(r.end_kwh) })) as Coupure[];
}

export interface CoupurePatch {
  cause_declencheur: string;
  cause_aggravante: string | null;
  commentaire: string | null;
}

/** Enregistre les causes et les CONFIRME (qui, quand). */
export async function confirmCoupure(id: string, patch: CoupurePatch, userId: string | null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('coupures')
    .update({ ...patch, statut_cause: 'confirmee', confirme_par: userId, confirme_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}
