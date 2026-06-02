import { supabase } from './supabase';
import type { BillingRow } from '@/components/invoices/billing-import.types';

const BATCH_SIZE = 500;

function rowToDbRecord(
  row: BillingRow,
  organizationId: string,
  auditId: string,
): Record<string, unknown> {
  return {
    organization_id:           organizationId,
    audit_id:                  auditId,
    numero_compte_contrat:     row.numeroCompteContrat,
    partenaire:                row.partenaire,
    localite:                  row.localite,
    arrondissement:            row.arrondissement,
    rue:                       row.rue,
    numero_facture:            row.numeroFacture,
    date_comptable_facture:    row.dateComptableFacture?.toISOString().split('T')[0] ?? null,
    montant_total_energie:     row.montantTotalEnergie,
    montant_redevance:         row.montantRedevance,
    montant_tco:               row.montantTCO,
    montant_hors_tva:          row.montantHorsTVA,
    montant_tva:               row.montantTVA,
    montant_facture_ttc:       row.montantFactureTTC,
    date_debut_periode:        row.dateDebutPeriode?.toISOString().split('T')[0] ?? null,
    date_fin_periode:          row.dateFinPeriode?.toISOString().split('T')[0] ?? null,
    ai_cg:                     row.aiCG,
    ni_cg:                     row.niCG,
    ancien_index_k1:           row.ancienIndexK1,
    ancien_index_k2:           row.ancienIndexK2,
    nouvel_index_k1:           row.nouvelIndexK1,
    nouvel_index_k2:           row.nouvelIndexK2,
    montant_energie_k1:        row.montantEnergieK1,
    montant_energie_k2:        row.montantEnergieK2,
    consommation_facturee:     row.consommationFacturee,
    rappel_et_majoration:      row.rappelEtMajoration,
    rappel_k1:                 row.rappelK1,
    rappel_k2:                 row.rappelK2,
    majoration_k1:             row.majorationK1,
    majoration_k2:             row.majorationK2,
    nb_jour_facturation:       row.nbJourFacturation,
    puissance_souscrite:       row.puissanceSouscrite,
    puissance_max_relevee:     row.puissanceMaxRelevee,
    montant_prime_fixe:        row.montantPrimeFixe,
    montant_cosinus_phi:       row.montantCosinusPhi,
    valeur_cosinus_phi:        row.valeurCosinusPhi,
    type_tarif_numero:         row.typeTarifNumero,
    type_tarif_texte:          row.typeTarifTexte,
    type_client_texte:         row.typeClientTexte,
    ccg:                       row.ccg,
    type_compte_contrat:       row.typeCompteContrat,
    anc_cote:                  row.ancCote,
    unite_releve:              row.uniteReleve,
    ancien_index_reactif:      row.ancienIndexReactif,
    nouvel_index_reactif:      row.nouvelIndexReactif,
    majo_reactif:              row.majoReactif,
    ancien_index_h1:           row.ancienIndexH1,
    nouvel_index_h1:           row.nouvelIndexH1,
    agence:                    row.agence,
    numero_compteur:           row.numeroCompteur,
    appartenance:              row.appartenance,
    puissance_souscrite_kw:    row.puissanceSouscriteKW,
    categorie_tarifaire:       row.categorieTarifaire,
    cons_k1:                   row.consK1,
    cons_k2:                   row.consK2,
    cons_t:                    row.consT,
    cons_wr:                   row.consWr,
    heure_h1:                  row.heureH1,
    heure_h2:                  row.heureH2,
    puissance_transfo:         row.puissanceTransfo,
    puissance_max_kw:          row.puissanceMaxKW,
    penalites_depassement:     row.penalitesDepassement,
    annee_facturation:         row.anneeFacturation,
    mois_facturation:          row.moisFacturation,
  };
}

export async function upsertFacturesSenelec(
  rows: BillingRow[],
  organizationId: string,
  auditId: string,
): Promise<{ inserted: number }> {
  const records = rows.map(r => rowToDbRecord(r, organizationId, auditId));
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('factures_senelec')
      .upsert(batch, { onConflict: 'numero_compte_contrat,numero_facture', count: 'exact' });
    if (error) throw error;
    inserted += count ?? batch.length;
  }

  return { inserted };
}

// Interface étendue pour le sélecteur de facture de référence (inclut tous les champs KPI)
export interface FactureSenelecForSelector {
  id: string;
  numero_compte_contrat: string;
  numero_facture: number | null;
  partenaire: string | null;
  appartenance: string | null;
  date_debut_periode: string | null;
  date_fin_periode: string | null;
  montant_facture_ttc: number | null;
  consommation_facturee: number | null;
  nb_jour_facturation: number | null;
  puissance_souscrite: number | null;
  puissance_souscrite_kw: number | null;
  puissance_max_relevee: number | null;
  puissance_max_kw: number | null;
  categorie_tarifaire: string | null;
  type_tarif_numero: string | null;
  annee_facturation: number | null;
  mois_facturation: string | null;
  montant_total_energie: number | null;
  montant_prime_fixe: number | null;
  montant_cosinus_phi: number | null;
  valeur_cosinus_phi: number | null;
  montant_tva: number | null;
  montant_tco: number | null;
  montant_redevance: number | null;
  montant_hors_tva: number | null;
  cons_k1: number | null;
  cons_k2: number | null;
  cons_wr: number | null;
  montant_energie_k1: number | null;
  montant_energie_k2: number | null;
  heure_h1: number | null;
  heure_h2: number | null;
  ancien_index_k1: number | null;
  nouvel_index_k1: number | null;
  ancien_index_k2: number | null;
  nouvel_index_k2: number | null;
  ancien_index_reactif: number | null;
  nouvel_index_reactif: number | null;
  rappel_et_majoration: number | null;
  rappel_k1: number | null;
  rappel_k2: number | null;
  majoration_k1: number | null;
  majoration_k2: number | null;
  penalites_depassement: number | null;
  is_quarantined: boolean | null;
}

export async function getFacturesSenelecForSelector(auditId: string): Promise<FactureSenelecForSelector[]> {
  const { data, error } = await supabase
    .from('factures_senelec')
    .select([
      'id', 'numero_compte_contrat', 'numero_facture', 'partenaire', 'appartenance',
      'date_debut_periode', 'date_fin_periode',
      'montant_facture_ttc', 'consommation_facturee', 'nb_jour_facturation',
      'puissance_souscrite', 'puissance_souscrite_kw',
      'puissance_max_relevee', 'puissance_max_kw',
      'categorie_tarifaire', 'type_tarif_numero',
      'annee_facturation', 'mois_facturation',
      'montant_total_energie', 'montant_prime_fixe',
      'montant_cosinus_phi', 'valeur_cosinus_phi',
      'montant_tva', 'montant_tco', 'montant_redevance', 'montant_hors_tva',
      'cons_k1', 'cons_k2', 'cons_wr',
      'montant_energie_k1', 'montant_energie_k2',
      'heure_h1', 'heure_h2',
      'ancien_index_k1', 'nouvel_index_k1',
      'ancien_index_k2', 'nouvel_index_k2',
      'ancien_index_reactif', 'nouvel_index_reactif',
      'rappel_et_majoration', 'rappel_k1', 'rappel_k2',
      'majoration_k1', 'majoration_k2',
      'penalites_depassement',
      'is_quarantined',
    ].join(','))
    .eq('audit_id', auditId)
    .order('date_debut_periode', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FactureSenelecForSelector[];
}

export interface FactureSenelec {
  id: string;
  organization_id: string;
  audit_id: string | null;
  numero_compte_contrat: string;
  partenaire: string | null;
  appartenance: string | null;
  numero_facture: number;
  date_debut_periode: string | null;
  date_fin_periode: string | null;
  montant_facture_ttc: number | null;
  consommation_facturee: number | null;
  categorie_tarifaire: string | null;
  type_tarif_numero: string | null;
  annee_facturation: number | null;
  mois_facturation: string | null;
  agence: string | null;
  created_at: string;
}

export async function getFacturesSenelec(
  organizationId: string,
  filters?: { auditId?: string; annee?: number; mois?: string },
): Promise<FactureSenelec[]> {
  let query = supabase
    .from('factures_senelec')
    .select('id,organization_id,audit_id,numero_compte_contrat,partenaire,appartenance,numero_facture,date_debut_periode,date_fin_periode,montant_facture_ttc,consommation_facturee,categorie_tarifaire,type_tarif_numero,annee_facturation,mois_facturation,agence,created_at')
    .eq('organization_id', organizationId)
    .order('date_debut_periode', { ascending: false });

  if (filters?.auditId) query = query.eq('audit_id', filters.auditId);
  if (filters?.annee) query = query.eq('annee_facturation', filters.annee);
  if (filters?.mois) query = query.eq('mois_facturation', filters.mois);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
