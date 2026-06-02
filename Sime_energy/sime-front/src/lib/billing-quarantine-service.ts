import { supabase } from '@/lib/supabase';
import type { SimulateurResult } from '@/lib/senelec-simulator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuarantineItemOCR {
  source: 'ocr';
  id: string;
  audit_id: string;
  label: string;
  montant_senelec: number;
  montant_calcule: number | null;
  delta_pct: number | null;
  quarantine_reason: string | null;
  quarantined_at: string;
  quarantine_comment: string | null;
  quarantine_action_plan: string | null;
}

export interface QuarantineItemSenelec {
  source: 'senelec';
  id: string;
  audit_id: string | null;
  label: string;
  montant_senelec: number;
  montant_calcule: number | null;
  delta_pct: number | null;
  quarantine_reason: string | null;
  quarantined_at: string | null;
  quarantine_comment: string | null;
  quarantine_action_plan: string | null;
}

export interface QuarantineItemManual {
  source: 'manual';
  id: string;
  audit_id: string | null;
  label: string;
  montant_senelec: number;
  montant_calcule: number;
  delta_pct: number;
  delta_fcfa: number;
  quarantine_reason: string | null;
  quarantined_at: string;
  is_resolved: boolean;
  resolution_note: string | null;
  quarantine_comment: string | null;
  quarantine_action_plan: string | null;
}

export type QuarantineItem = QuarantineItemOCR | QuarantineItemSenelec | QuarantineItemManual;

// ─── OCR quarantine (already in invoice-service.ts, re-exported for unified view) ────

export async function getQuarantinedOCR(organizationId: string): Promise<QuarantineItemOCR[]> {
  const { data, error } = await supabase
    .from('audit_invoices')
    .select('id,audit_id,file_name,amount,quarantine_reason,quarantine_delta_pct,updated_at,quarantine_comment,quarantine_action_plan')
    .eq('organization_id', organizationId)
    .eq('is_quarantined', true)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(r => ({
    source: 'ocr' as const,
    id: r.id,
    audit_id: r.audit_id,
    label: r.file_name,
    montant_senelec: r.amount ?? 0,
    montant_calcule: null,
    delta_pct: r.quarantine_delta_pct ?? null,
    quarantine_reason: r.quarantine_reason ?? null,
    quarantined_at: r.updated_at,
    quarantine_comment: r.quarantine_comment ?? null,
    quarantine_action_plan: r.quarantine_action_plan ?? null,
  }));
}

// ─── SENELEC quarantine ────────────────────────────────────────────────────────

export async function quarantineFactureSenelec(
  id: string,
  reason: string,
  delta_pct: number,
  ttc_calcule: number,
  userId: string,
  simResult?: SimulateurResult,
): Promise<void> {
  const { error } = await supabase
    .from('factures_senelec')
    .update({
      is_quarantined: true,
      quarantine_reason: reason,
      quarantine_delta_pct: delta_pct,
      quarantine_ttc_calcule: ttc_calcule,
      quarantined_at: new Date().toISOString(),
      quarantined_by: userId,
      quarantine_sim_result: simResult ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function unquarantineFactureSenelec(id: string): Promise<void> {
  const { error } = await supabase
    .from('factures_senelec')
    .update({
      is_quarantined: false,
      quarantine_reason: null,
      quarantine_delta_pct: null,
      quarantine_ttc_calcule: null,
      quarantined_at: null,
      quarantined_by: null,
      quarantine_sim_result: null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getQuarantinedSenelec(organizationId: string): Promise<QuarantineItemSenelec[]> {
  const { data, error } = await supabase
    .from('factures_senelec')
    .select('id,audit_id,partenaire,numero_compte_contrat,mois_facturation,annee_facturation,montant_facture_ttc,quarantine_reason,quarantine_delta_pct,quarantine_ttc_calcule,quarantined_at,quarantine_comment,quarantine_action_plan')
    .eq('organization_id', organizationId)
    .eq('is_quarantined', true)
    .order('quarantined_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(r => ({
    source: 'senelec' as const,
    id: r.id,
    audit_id: r.audit_id ?? null,
    label: [r.partenaire ?? r.numero_compte_contrat, r.mois_facturation, r.annee_facturation]
      .filter(Boolean).join(' · '),
    montant_senelec: r.montant_facture_ttc ?? 0,
    montant_calcule: r.quarantine_ttc_calcule ?? null,
    delta_pct: r.quarantine_delta_pct ?? null,
    quarantine_reason: r.quarantine_reason ?? null,
    quarantined_at: r.quarantined_at ?? null,
    quarantine_comment: r.quarantine_comment ?? null,
    quarantine_action_plan: r.quarantine_action_plan ?? null,
  }));
}

// ─── Manual quarantine ─────────────────────────────────────────────────────────

export interface ManualQuarantineInput {
  organization_id: string;
  audit_id?: string | null;
  label: string;
  montant_senelec: number;
  montant_calcule: number;
  delta_pct: number;
  delta_fcfa: number;
  quarantine_reason: string;
  sim_input?: unknown;
  quarantined_by: string;
}

export async function createManualQuarantine(input: ManualQuarantineInput): Promise<void> {
  const { error } = await supabase
    .from('billing_quarantine_manual')
    .insert({
      organization_id: input.organization_id,
      audit_id: input.audit_id ?? null,
      label: input.label,
      montant_senelec: input.montant_senelec,
      montant_calcule: input.montant_calcule,
      delta_pct: input.delta_pct,
      delta_fcfa: input.delta_fcfa,
      quarantine_reason: input.quarantine_reason,
      sim_input: input.sim_input ?? null,
      quarantined_by: input.quarantined_by,
    });
  if (error) throw error;
}

export async function resolveManualQuarantine(id: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('billing_quarantine_manual')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_note: note || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteManualQuarantine(id: string): Promise<void> {
  const { error } = await supabase
    .from('billing_quarantine_manual')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getManualQuarantineItems(organizationId: string): Promise<QuarantineItemManual[]> {
  const { data, error } = await supabase
    .from('billing_quarantine_manual')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_resolved', false)
    .order('quarantined_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(r => ({
    source: 'manual' as const,
    id: r.id,
    audit_id: r.audit_id ?? null,
    label: r.label,
    montant_senelec: r.montant_senelec,
    montant_calcule: r.montant_calcule,
    delta_pct: r.delta_pct,
    delta_fcfa: r.delta_fcfa,
    quarantine_reason: r.quarantine_reason ?? null,
    quarantined_at: r.quarantined_at,
    is_resolved: r.is_resolved,
    resolution_note: r.resolution_note ?? null,
    quarantine_comment: r.quarantine_comment ?? null,
    quarantine_action_plan: r.quarantine_action_plan ?? null,
  }));
}

// ─── Save comment + action plan ───────────────────────────────────────────────

export async function saveQuarantineComment(
  item: QuarantineItem,
  comment: string,
  actionPlan: string,
): Promise<void> {
  const payload = {
    quarantine_comment: comment || null,
    quarantine_action_plan: actionPlan || null,
  };

  if (item.source === 'ocr') {
    const { error } = await supabase.from('audit_invoices').update(payload).eq('id', item.id);
    if (error) throw error;
  } else if (item.source === 'senelec') {
    const { error } = await supabase.from('factures_senelec').update(payload).eq('id', item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('billing_quarantine_manual').update(payload).eq('id', item.id);
    if (error) throw error;
  }
}

// ─── SENELEC row detail (for the eye dialog) ──────────────────────────────────

export interface FactureSenelecDetail {
  id: string;
  partenaire: string | null;
  numero_compte_contrat: string;
  numero_facture: number;
  mois_facturation: string | null;
  annee_facturation: number | null;
  categorie_tarifaire: string | null;
  // Indexes
  ancien_index_k1: number | null;
  nouvel_index_k1: number | null;
  cons_k1: number | null;
  ancien_index_k2: number | null;
  nouvel_index_k2: number | null;
  cons_k2: number | null;
  ancien_index_reactif: number | null;
  nouvel_index_reactif: number | null;
  cons_wr: number | null;
  // Declared SENELEC amounts
  montant_energie_k1: number | null;
  montant_energie_k2: number | null;
  majoration_k1: number | null;
  majoration_k2: number | null;
  montant_total_energie: number | null;
  montant_prime_fixe: number | null;
  penalites_depassement: number | null;
  valeur_cosinus_phi: number | null;
  montant_cosinus_phi: number | null;
  montant_redevance: number | null;
  montant_tco: number | null;
  montant_hors_tva: number | null;
  montant_tva: number | null;
  montant_facture_ttc: number | null;
  // Power
  puissance_souscrite_kw: number | null;
  puissance_max_kw: number | null;
  nb_jour_facturation: number | null;
  consommation_facturee: number | null;
  // Quarantine computed
  quarantine_ttc_calcule: number | null;
  quarantine_delta_pct: number | null;
  quarantine_sim_result: SimulateurResult | null;
}

export async function getFactureSenelecDetail(id: string): Promise<FactureSenelecDetail | null> {
  const { data, error } = await supabase
    .from('factures_senelec')
    .select(`id,partenaire,numero_compte_contrat,numero_facture,mois_facturation,annee_facturation,
      categorie_tarifaire,consommation_facturee,nb_jour_facturation,
      ancien_index_k1,nouvel_index_k1,cons_k1,
      ancien_index_k2,nouvel_index_k2,cons_k2,
      ancien_index_reactif,nouvel_index_reactif,cons_wr,
      montant_energie_k1,montant_energie_k2,majoration_k1,majoration_k2,
      montant_total_energie,montant_prime_fixe,penalites_depassement,
      valeur_cosinus_phi,montant_cosinus_phi,montant_redevance,montant_tco,
      montant_hors_tva,montant_tva,montant_facture_ttc,
      puissance_souscrite_kw,puissance_max_kw,
      quarantine_ttc_calcule,quarantine_delta_pct,quarantine_sim_result`)
    .eq('id', id)
    .single();
  if (error) return null;
  return data as FactureSenelecDetail;
}

// ─── Unified view ──────────────────────────────────────────────────────────────

export async function getAllQuarantineItems(organizationId: string): Promise<QuarantineItem[]> {
  const [ocr, senelec, manual] = await Promise.all([
    getQuarantinedOCR(organizationId),
    getQuarantinedSenelec(organizationId),
    getManualQuarantineItems(organizationId),
  ]);
  return [...ocr, ...senelec, ...manual];
}
