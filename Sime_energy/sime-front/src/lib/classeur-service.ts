import { supabase } from '@/lib/supabase'
import { mapOcrToInvoiceData, mapSenelecToInvoiceData } from '@/lib/invoice-mapper'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClasseurBuilding {
  id: string
  name: string
}

export interface ClasseurZone {
  id: string
  name: string
  buildings: ClasseurBuilding[]
}

export interface ClasseurSite {
  id: string
  name: string
  address: string
  zones: ClasseurZone[]
  buildings: ClasseurBuilding[] // bâtiments sans zone
}

export interface SpatialHierarchy {
  sites: ClasseurSite[]
  isEmpty: boolean
  loadError?: string
}

export interface ClasseurInvoice {
  id: string
  file_name: string
  invoice_date: string | null
  amount: number | null
  status: string
  kwh: number
  classeur_site_id: string | null
  classeur_zone_id: string | null
  classeur_building_id: string | null
  source: 'ocr' | 'senelec'
  // SENELEC-specific display fields
  partenaire?: string | null
  appartenance?: string | null
  numero_compte_contrat?: string
}

export type NodeType = 'site' | 'zone' | 'building'

export interface NodeMetrics {
  invoiceCount: number
  kwh: number
  fcfa: number
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAuditSpatialHierarchy(auditId: string): Promise<SpatialHierarchy> {
  // Fetch all three levels in parallel — all are optional, degrade gracefully
  const [sitesRes, zonesRes, buildingsRes] = await Promise.all([
    supabase
      .from('audit_sites')
      .select('id, name, address')
      .eq('audit_id', auditId)
      .order('created_at', { ascending: true }),
    supabase
      .from('audit_zones')
      .select('id, name, site_id')
      .eq('audit_id', auditId)
      .order('order_index', { ascending: true }),
    supabase
      .from('audit_buildings')
      .select('id, building_name, site_id, zone_id')
      .eq('audit_id', auditId)
      .order('created_at', { ascending: true }),
  ])

  // Fatal only if sites query itself errors (not just empty)
  if (sitesRes.error) {
    return { sites: [], isEmpty: true, loadError: sitesRes.error.message }
  }

  const sites     = sitesRes.data     ?? []
  const zones     = zonesRes.error     ? [] : (zonesRes.data     ?? [])
  const buildings = buildingsRes.error ? [] : (buildingsRes.data ?? [])

  // If no sites but buildings exist — surface them under a synthetic site
  if (sites.length === 0 && buildings.length > 0) {
    const syntheticSite: ClasseurSite = {
      id:       '__no_site__',
      name:     'Bâtiments du projet',
      address:  '',
      zones:    [],
      buildings: buildings.map(b => ({ id: b.id, name: b.building_name })),
    }
    return { sites: [syntheticSite], isEmpty: false }
  }

  const structured: ClasseurSite[] = sites.map(site => {
    const siteZones     = zones.filter(z => z.site_id === site.id)
    const siteBuildings = buildings.filter(b => b.site_id === site.id)

    return {
      id:      site.id,
      name:    site.name,
      address: site.address ?? '',
      zones: siteZones.map(zone => ({
        id:   zone.id,
        name: zone.name,
        buildings: siteBuildings
          .filter(b => b.zone_id === zone.id)
          .map(b => ({ id: b.id, name: b.building_name })),
      })),
      buildings: siteBuildings
        .filter(b => !b.zone_id)
        .map(b => ({ id: b.id, name: b.building_name })),
    }
  })

  return {
    sites:   structured,
    isEmpty: structured.length === 0,
  }
}

export interface ClasseurInvoicesResult {
  invoices: ClasseurInvoice[]
  migrationNeeded: boolean
}

export async function getClasseurInvoices(auditId: string): Promise<ClasseurInvoicesResult> {
  // Try with classeur columns first to detect if migration was applied
  const withCols = await supabase
    .from('audit_invoices')
    .select('id, file_name, invoice_date, amount, status, ocr_data, classeur_site_id, classeur_zone_id, classeur_building_id')
    .eq('audit_id', auditId)
    .order('invoice_date', { ascending: false })

  const migrationNeeded = !!withCols.error

  const { data: ocrData, error: ocrError } = migrationNeeded
    ? await supabase
        .from('audit_invoices')
        .select('id, file_name, invoice_date, amount, status, ocr_data')
        .eq('audit_id', auditId)
        .order('invoice_date', { ascending: false })
    : withCols

  if (ocrError) throw ocrError

  const ocrInvoices: ClasseurInvoice[] = (ocrData ?? []).map((inv: any) => {
    const mapped = mapOcrToInvoiceData(inv.ocr_data)
    return {
      id:                   inv.id,
      file_name:            inv.file_name,
      invoice_date:         inv.invoice_date ?? null,
      amount:               inv.amount ?? null,
      status:               inv.status,
      kwh:                  mapped.conso_kwh_total ?? 0,
      classeur_site_id:     inv.classeur_site_id ?? null,
      classeur_zone_id:     inv.classeur_zone_id ?? null,
      classeur_building_id: inv.classeur_building_id ?? null,
      source:               'ocr' as const,
    }
  })

  // Also fetch SENELEC invoices (only when classeur columns exist)
  let senelecInvoices: ClasseurInvoice[] = []
  if (!migrationNeeded) {
    const { data: senData } = await supabase
      .from('factures_senelec')
      .select('id, numero_compte_contrat, partenaire, appartenance, date_debut_periode, montant_facture_ttc, consommation_facturee, classeur_site_id, classeur_zone_id, classeur_building_id')
      .eq('audit_id', auditId)
      .order('date_debut_periode', { ascending: false })

    senelecInvoices = (senData ?? []).map((row: any) => {
      const mapped = mapSenelecToInvoiceData(row)
      return {
        id:                    row.id,
        file_name:             row.partenaire || row.appartenance || row.numero_compte_contrat,
        invoice_date:          row.date_debut_periode ?? null,
        amount:                row.montant_facture_ttc ?? null,
        status:                'senelec',
        kwh:                   mapped.conso_kwh_total ?? 0,
        classeur_site_id:      row.classeur_site_id ?? null,
        classeur_zone_id:      row.classeur_zone_id ?? null,
        classeur_building_id:  row.classeur_building_id ?? null,
        source:                'senelec' as const,
        partenaire:            row.partenaire ?? null,
        appartenance:          row.appartenance ?? null,
        numero_compte_contrat: row.numero_compte_contrat,
      }
    })
  }

  return { invoices: [...ocrInvoices, ...senelecInvoices], migrationNeeded }
}

export async function classifyInvoice(
  invoiceId: string,
  assignment: { site_id: string | null; zone_id: string | null; building_id: string | null },
  source: 'ocr' | 'senelec' = 'ocr'
) {
  const table = source === 'senelec' ? 'factures_senelec' : 'audit_invoices'
  const payload: Record<string, unknown> = {
    classeur_site_id:     assignment.site_id,
    classeur_zone_id:     assignment.zone_id,
    classeur_building_id: assignment.building_id,
  }
  if (source === 'ocr') payload.updated_at = new Date().toISOString()

  const { error } = await supabase.from(table).update(payload).eq('id', invoiceId)
  if (error) throw error
}

export async function unclassifyInvoice(invoiceId: string, source: 'ocr' | 'senelec' = 'ocr') {
  return classifyInvoice(invoiceId, { site_id: null, zone_id: null, building_id: null }, source)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computeNodeMetrics(
  invoices: ClasseurInvoice[],
  nodeType: NodeType,
  nodeId: string
): NodeMetrics {
  let filtered: ClasseurInvoice[]

  if (nodeType === 'building') {
    filtered = invoices.filter(i => i.classeur_building_id === nodeId)
  } else if (nodeType === 'zone') {
    filtered = invoices.filter(i => i.classeur_zone_id === nodeId && !i.classeur_building_id)
  } else {
    filtered = invoices.filter(i => i.classeur_site_id === nodeId)
  }

  return {
    invoiceCount: filtered.length,
    kwh:          filtered.reduce((s, i) => s + i.kwh, 0),
    fcfa:         filtered.reduce((s, i) => s + (i.amount ?? 0), 0),
  }
}

export function computeSiteMetricsDeep(
  invoices: ClasseurInvoice[],
  siteId: string
): NodeMetrics {
  const filtered = invoices.filter(i => i.classeur_site_id === siteId)
  return {
    invoiceCount: filtered.length,
    kwh:          filtered.reduce((s, i) => s + i.kwh, 0),
    fcfa:         filtered.reduce((s, i) => s + (i.amount ?? 0), 0),
  }
}
