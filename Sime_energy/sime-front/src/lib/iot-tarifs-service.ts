import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModeTarif = 'GP_MT' | 'BT';

export interface IotTarif {
  id: string;
  organization_id: string;
  fournisseur: string;
  pays: string;
  devise: string;
  symbole_devise: string;
  mode_tarif: ModeTarif;
  niveau_gp_mt: number | null;   // 1=K1 | 2=K2 | 3=HC/HP diff. | 4=pondéré
  niveau_bt: number | null;      // 1=Tr1 | 2=Tr2 | 3=Tr3 | 4=moyen
  tarif_k1: number | null;
  tarif_k2_hc: number | null;
  tarif_k2_hp: number | null;
  tarif_k2_hn: number | null;
  tarif_k2_pondere: number | null;
  heure_debut_hp: string;
  heure_fin_hp: string;
  heure_debut_hn: string | null;
  heure_fin_hn: string | null;
  tarif_bt_tranche1: number | null;
  tarif_bt_tranche2: number | null;
  tarif_bt_tranche3: number | null;
  tarif_bt_moyen: number | null;
  prime_fixe_mensuelle: number | null;
  puissance_souscrite_kva: number | null;
  tva_pct: number;
  taxe_communale_pct: number;
  cos_phi_seuil: number;
  cout_unitaire_reel: number | null;
  cout_reel_calcule_at: string | null;
  actif: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Tarifs pré-configurés utilisés à la création d'un premier site
export type FournisseurPreset = 'Senelec_K2' | 'Senelec_K1' | 'CIE' | 'SONABEL';

export const TARIFS_PRESETS: Record<FournisseurPreset, Partial<IotTarif>> = {
  Senelec_K2: {
    fournisseur:      'Senelec',
    pays:             'Sénégal',
    devise:           'XOF',
    symbole_devise:   'FCFA',
    mode_tarif:       'GP_MT',
    niveau_gp_mt:     3,         // HP/HC différenciés
    tarif_k2_hc:      140,
    tarif_k2_hp:      232,
    tarif_k2_pondere: 155,
    heure_debut_hp:   '19:00:00',
    heure_fin_hp:     '23:00:00',
    tva_pct:          18,
    cos_phi_seuil:    0.85,
  },
  Senelec_K1: {
    fournisseur:    'Senelec',
    pays:           'Sénégal',
    devise:         'XOF',
    symbole_devise: 'FCFA',
    mode_tarif:     'BT',
    niveau_bt:      1,
    tarif_bt_tranche1: 82,
    tva_pct:        18,
  },
  CIE: {
    fournisseur:    'CIE',
    pays:           'Côte d\'Ivoire',
    devise:         'XOF',
    symbole_devise: 'FCFA',
    mode_tarif:     'GP_MT',
    niveau_gp_mt:   3,
    tarif_k2_hc:    62,
    tarif_k2_hp:    107,
    tarif_k2_hn:    79,
    heure_debut_hp: '17:30:00',
    heure_fin_hp:   '22:00:00',
    heure_debut_hn: '06:00:00',
    heure_fin_hn:   '17:30:00',
    tva_pct:        18,
  },
  SONABEL: {
    fournisseur:    'SONABEL',
    pays:           'Burkina Faso',
    devise:         'XOF',
    symbole_devise: 'FCFA',
    mode_tarif:     'GP_MT',
    niveau_gp_mt:   3,
    tarif_k2_hc:    70,
    tarif_k2_hp:    105,
    heure_debut_hp: '06:00:00',
    heure_fin_hp:   '22:00:00',
    tva_pct:        18,
  },
};

// ─── Calculs ──────────────────────────────────────────────────────────────────

/**
 * Calcule le montant énergie selon les 9 conditions tarifaires du modèle XLSX.
 * GP_MT : niveaux 1–4 | BT : niveaux 1–4
 */
export function calculerMontantEnergie(
  kwh: number,
  heure: number,      // heure décimale (ex: 19.5 = 19h30)
  tarif: IotTarif,
): number {
  if (!tarif) return 0;

  if (tarif.mode_tarif === 'GP_MT') {
    const heureDebutHp = parseHeure(tarif.heure_debut_hp ?? '19:00:00');
    const heureFinHp   = parseHeure(tarif.heure_fin_hp   ?? '23:00:00');
    const estHP = heure >= heureDebutHp && heure < heureFinHp;

    switch (tarif.niveau_gp_mt) {
      case 1: return kwh * (tarif.tarif_k1 ?? 0);
      case 2: return kwh * (tarif.tarif_k2_hp ?? 0);  // tarif unique K2
      case 3: return kwh * (estHP ? (tarif.tarif_k2_hp ?? 0) : (tarif.tarif_k2_hc ?? 0));
      case 4: return kwh * (tarif.tarif_k2_pondere ?? 0);
      default: return 0;
    }
  }

  if (tarif.mode_tarif === 'BT') {
    switch (tarif.niveau_bt) {
      case 1: return kwh * (tarif.tarif_bt_tranche1 ?? 0);
      case 2: return kwh * (tarif.tarif_bt_tranche2 ?? 0);
      case 3: return kwh * (tarif.tarif_bt_tranche3 ?? 0);
      case 4: return kwh * (tarif.tarif_bt_moyen    ?? 0);
      default: return 0;
    }
  }

  return 0;
}

/** Détermine si une heure est en Heure de Pointe selon le tarif actif */
export function estHeureDePointe(heure: number, tarif: IotTarif): boolean {
  const debut = parseHeure(tarif.heure_debut_hp ?? '19:00:00');
  const fin   = parseHeure(tarif.heure_fin_hp   ?? '23:00:00');
  return heure >= debut && heure < fin;
}

/** Calcule le coût moyen pondéré HP/HC sur 24h */
export function calculerCoutPondere(tarif: IotTarif): number {
  const debut  = parseHeure(tarif.heure_debut_hp ?? '19:00:00');
  const fin    = parseHeure(tarif.heure_fin_hp   ?? '23:00:00');
  const heuresHp = fin - debut;
  const heuresHc = 24 - heuresHp;
  const hp = tarif.tarif_k2_hp ?? 0;
  const hc = tarif.tarif_k2_hc ?? 0;
  return (hc * heuresHc + hp * heuresHp) / 24;
}

function parseHeure(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m ?? 0) / 60;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getIotTarifs(organizationId: string): Promise<IotTarif[]> {
  const { data, error } = await supabase
    .from('iot_tarifs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getIotTarifById(tarifId: string): Promise<IotTarif> {
  const { data, error } = await supabase
    .from('iot_tarifs')
    .select('*')
    .eq('id', tarifId)
    .single();

  if (error) throw error;
  return data;
}

export async function createIotTarif(
  organizationId: string,
  input: Partial<IotTarif>,
  userId: string,
): Promise<IotTarif> {
  const { data, error } = await supabase
    .from('iot_tarifs')
    .insert({
      organization_id: organizationId,
      created_by:      userId,
      ...input,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createIotTarifFromPreset(
  organizationId: string,
  preset: FournisseurPreset,
  userId: string,
): Promise<IotTarif> {
  return createIotTarif(organizationId, TARIFS_PRESETS[preset], userId);
}

export async function updateIotTarif(
  tarifId: string,
  updates: Partial<IotTarif>,
): Promise<IotTarif> {
  const { data, error } = await supabase
    .from('iot_tarifs')
    .update(updates)
    .eq('id', tarifId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Met à jour le coût unitaire réel depuis une facture importée */
export async function updateCoutReel(
  tarifId: string,
  coutUnitaireReel: number,
): Promise<void> {
  const { error } = await supabase
    .from('iot_tarifs')
    .update({
      cout_unitaire_reel:   coutUnitaireReel,
      cout_reel_calcule_at: new Date().toISOString(),
    })
    .eq('id', tarifId);

  if (error) throw error;
}

export async function deleteIotTarif(tarifId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_tarifs')
    .delete()
    .eq('id', tarifId);

  if (error) throw error;
}
