import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TypeFerie = 'fixe' | 'variable' | 'evenement';
export type ClassificationJour = 'Jour ouvré' | 'Weekend' | 'Jour férié';

export interface IotFerie {
  id: string;
  organization_id: string;
  iot_site_id: string | null;
  date_ferie: string;   // 'YYYY-MM-DD'
  nom: string;
  pays: string;
  type_ferie: TypeFerie;
  recurrent: boolean;
  created_at: string;
}

// Fériés fixes sénégalais — insérés à la création du premier site
export const FERIES_SENEGAL_FIXES: Array<{ mois: number; jour: number; nom: string }> = [
  { mois: 1,  jour: 1,  nom: 'Jour de l\'An' },
  { mois: 4,  jour: 4,  nom: 'Fête de l\'Indépendance' },
  { mois: 5,  jour: 1,  nom: 'Fête du Travail' },
  { mois: 8,  jour: 15, nom: 'Assomption' },
  { mois: 11, jour: 1,  nom: 'Toussaint' },
  { mois: 12, jour: 25, nom: 'Noël' },
];

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function getFeries(
  organizationId: string,
  siteId?: string,
): Promise<IotFerie[]> {
  let query = supabase
    .from('iot_calendrier')
    .select('*')
    .eq('organization_id', organizationId)
    .order('date_ferie', { ascending: true });

  // Retourne les fériés du site + les fériés globaux (iot_site_id IS NULL)
  if (siteId) {
    query = query.or(`iot_site_id.eq.${siteId},iot_site_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function addFerie(
  organizationId: string,
  input: {
    date_ferie: string;
    nom: string;
    pays?: string;
    type_ferie?: TypeFerie;
    recurrent?: boolean;
    iot_site_id?: string;
  },
): Promise<IotFerie> {
  const { data, error } = await supabase
    .from('iot_calendrier')
    .insert({
      organization_id: organizationId,
      iot_site_id:    input.iot_site_id ?? null,
      date_ferie:     input.date_ferie,
      nom:            input.nom,
      pays:           input.pays ?? 'Sénégal',
      type_ferie:     input.type_ferie ?? 'fixe',
      recurrent:      input.recurrent ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFerie(ferieId: string): Promise<void> {
  const { error } = await supabase
    .from('iot_calendrier')
    .delete()
    .eq('id', ferieId);

  if (error) throw error;
}

/**
 * Initialise les fériés fixes sénégalais pour une organisation.
 * À appeler à la création du premier site IoT.
 */
export async function initFeriesSenegal(
  organizationId: string,
  annee: number = new Date().getFullYear(),
): Promise<void> {
  const rows = FERIES_SENEGAL_FIXES.map(f => ({
    organization_id: organizationId,
    iot_site_id:    null,
    date_ferie:     `${annee}-${String(f.mois).padStart(2, '0')}-${String(f.jour).padStart(2, '0')}`,
    nom:            f.nom,
    pays:           'Sénégal',
    type_ferie:     'fixe' as TypeFerie,
    recurrent:      true,
  }));

  const { error } = await supabase
    .from('iot_calendrier')
    .upsert(rows, { onConflict: 'organization_id,iot_site_id,date_ferie', ignoreDuplicates: true });

  if (error) throw error;
}

// ─── Classification des jours ────────────────────────────────────────────────

/**
 * Classifie une date en Jour ouvré / Weekend / Jour férié.
 * Utilise la liste des fériés chargée depuis la base.
 */
export function classifierJour(
  date: Date,
  feries: IotFerie[],
): ClassificationJour {
  const dateStr = date.toISOString().split('T')[0];
  const jourSemaine = date.getDay(); // 0=dim, 6=sam

  // Vérifier fériés (fixes recurrents : comparer mois+jour, variables : date exacte)
  const estFerie = feries.some(f => {
    if (f.recurrent) {
      const [, mm, dd] = f.date_ferie.split('-');
      const moisJour   = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return `${mm}-${dd}` === moisJour;
    }
    return f.date_ferie === dateStr;
  });

  if (estFerie) return 'Jour férié';
  if (jourSemaine === 0 || jourSemaine === 6) return 'Weekend';
  return 'Jour ouvré';
}
