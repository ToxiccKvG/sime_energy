import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IotSite {
  id: string;
  organization_id: string;
  audit_id: string | null;
  shelly_site_name: string;
  nom: string;
  adresse: string | null;
  pays: string;
  fournisseur_reseau: string;
  tarif_actif_id: string | null;
  actif: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations jointes
  iot_tarifs?: IotTarifRef | null;
}

export interface IotTarifRef {
  id: string;
  fournisseur: string;
  tarif_k2_hc: number | null;
  tarif_k2_hp: number | null;
  cout_unitaire_reel: number | null;
  symbole_devise: string;
}

export interface CreateIotSiteInput {
  organization_id: string;
  audit_id?: string;
  shelly_site_name: string;
  nom: string;
  adresse?: string;
  pays?: string;
  fournisseur_reseau?: string;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getIotSites(organizationId: string): Promise<IotSite[]> {
  const { data, error } = await supabase
    .from('iot_sites')
    .select(`
      *,
      iot_tarifs (
        id, fournisseur, tarif_k2_hc, tarif_k2_hp, cout_unitaire_reel, symbole_devise
      )
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getIotSiteById(siteId: string): Promise<IotSite> {
  const { data, error } = await supabase
    .from('iot_sites')
    .select(`
      *,
      iot_tarifs (
        id, fournisseur, tarif_k2_hc, tarif_k2_hp, cout_unitaire_reel, symbole_devise
      )
    `)
    .eq('id', siteId)
    .single();

  if (error) throw error;
  return data;
}

export async function createIotSite(
  input: CreateIotSiteInput,
  userId: string,
): Promise<IotSite> {
  const { data, error } = await supabase
    .from('iot_sites')
    .insert({
      organization_id:   input.organization_id,
      audit_id:          input.audit_id ?? null,
      shelly_site_name:  input.shelly_site_name,
      nom:               input.nom,
      adresse:           input.adresse ?? null,
      pays:              input.pays ?? 'Sénégal',
      fournisseur_reseau: input.fournisseur_reseau ?? 'Senelec',
      created_by:        userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateIotSite(
  siteId: string,
  updates: Partial<Pick<IotSite, 'nom' | 'adresse' | 'pays' | 'fournisseur_reseau' | 'tarif_actif_id' | 'actif'>>,
): Promise<IotSite> {
  const { data, error } = await supabase
    .from('iot_sites')
    .update(updates)
    .eq('id', siteId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteIotSite(siteId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_sites')
    .delete()
    .eq('id', siteId);

  if (error) throw error;
}

export async function setTarifActif(siteId: string, tarifId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_sites')
    .update({ tarif_actif_id: tarifId })
    .eq('id', siteId);

  if (error) throw error;
}
