import { supabase } from '@/lib/supabase';
import type { OrgCalendarEvent } from '@/lib/calendar-service';
import type { OrganizationSettings } from '@/lib/organization-settings-service';
import type { ProjectContextV1 } from '@/types/project-context';

// Lignes brutes (snake_case DB) nécessaires pour assembler le contexte d'un projet.
// Une requête par table, groupée par audit_id — pas de N+1.
export interface ProjectContextRawData {
  audit: Record<string, any>;
  organization: { id: string; name: string; settings: OrganizationSettings } | null;
  sites: Record<string, any>[];
  zones: Record<string, any>[];
  buildings: Record<string, any>[];
  levels: Record<string, any>[];
  rooms: Record<string, any>[];
  buildingParams: Record<string, any>[];
  billingParams: Record<string, any>[];
  calendarEvents: OrgCalendarEvent[];
  facturesSenelec: Record<string, any>[];
  ocrInvoices: Record<string, any>[];
}

// Colonnes de factures_senelec utiles à l'analyse (sans le résultat de simulation de quarantaine)
const FACTURES_SENELEC_COLUMNS =
  'id, classeur_site_id, classeur_building_id, numero_compte_contrat, numero_compteur, numero_facture, ' +
  'categorie_tarifaire, type_tarif_texte, puissance_souscrite_kw, puissance_transfo, ' +
  'date_debut_periode, date_fin_periode, nb_jour_facturation, annee_facturation, mois_facturation, ' +
  'cons_k1, cons_k2, cons_t, consommation_facturee, cons_wr, puissance_max_kw, valeur_cosinus_phi, ' +
  'montant_facture_ttc, montant_hors_tva, is_quarantined';
const PAGE_SIZE = 1000;

async function getFacturesSenelecByAudit(auditId: string) {
  const rows: Record<string, any>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('factures_senelec')
      .select(FACTURES_SENELEC_COLUMNS)
      .eq('audit_id', auditId)
      .order('date_debut_periode', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Record<string, any>[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function getOcrInvoicesByAudit(auditId: string) {
  const { data, error } = await supabase
    .from('audit_invoices')
    .select('id, file_name, invoice_date, amount, supplier, status, is_quarantined, quarantine_reason, classeur_site_id, classeur_building_id, ocr_data')
    .eq('audit_id', auditId)
    .order('invoice_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Record<string, any>[];
}

async function selectByAudit(table: string, auditId: string, orderBy?: string) {
  let query = supabase.from(table).select('*').eq('audit_id', auditId);
  if (orderBy) query = query.order(orderBy, { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Record<string, any>[];
}

export async function getProjectContextRawData(auditId: string): Promise<ProjectContextRawData> {
  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .select('id, organization_id, created_by, name, color, status, start_date, end_date, completion_percentage, responsable, client_type, general_info, personnel, created_at, updated_at')
    .eq('id', auditId)
    .single();
  if (auditError) throw auditError;

  const [organizationRes, sites, zones, buildings, levels, rooms, buildingParams, billingParams, eventsRes, facturesSenelec, ocrInvoices] =
    await Promise.all([
      supabase.from('organizations').select('id, name, settings').eq('id', audit.organization_id).maybeSingle(),
      selectByAudit('audit_sites', auditId, 'created_at'),
      selectByAudit('audit_zones', auditId, 'order_index'),
      selectByAudit('audit_buildings', auditId, 'created_at'),
      selectByAudit('audit_levels', auditId, 'order_index'),
      selectByAudit('audit_rooms', auditId, 'code'),
      selectByAudit('building_type_params', auditId, 'type_fonctionnel'),
      selectByAudit('audit_billing_params', auditId),
      supabase.from('org_calendar_events').select('*').eq('organization_id', audit.organization_id).order('event_date', { ascending: true }),
      getFacturesSenelecByAudit(auditId),
      getOcrInvoicesByAudit(auditId),
    ]);
  if (organizationRes.error) throw organizationRes.error;
  if (eventsRes.error) throw eventsRes.error;

  return {
    audit,
    organization: organizationRes.data as ProjectContextRawData['organization'],
    sites, zones, buildings, levels, rooms, buildingParams, billingParams,
    calendarEvents: (eventsRes.data ?? []) as OrgCalendarEvent[],
    facturesSenelec,
    ocrInvoices,
  };
}

export async function saveProjectContext(auditId: string, context: ProjectContextV1): Promise<void> {
  // updated_at volontairement non modifié : la génération du snapshot n'est pas une édition du projet
  const { error } = await supabase
    .from('audits')
    .update({ project_context: context, project_context_at: context.generated_at })
    .eq('id', auditId);
  if (error) throw error;
}

export async function getProjectContext(auditId: string): Promise<{ context: ProjectContextV1 | null; generatedAt: string | null }> {
  const { data, error } = await supabase
    .from('audits')
    .select('project_context, project_context_at')
    .eq('id', auditId)
    .single();
  if (error) throw error;
  return { context: data.project_context as ProjectContextV1 | null, generatedAt: data.project_context_at };
}

export async function listOrganizationAuditIds(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('audits')
    .select('id')
    .eq('organization_id', organizationId);
  if (error) throw error;
  return (data ?? []).map(row => row.id as string);
}
