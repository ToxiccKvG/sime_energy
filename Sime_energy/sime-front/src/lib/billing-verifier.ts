/**
 * billing-verifier.ts
 * "Moulinette" — recalcule chaque poste d'une facture et compare au montant déclaré OCR.
 * Retourne un tableau d'écarts par poste + un statut global (ok / warning / error).
 *
 * Aucune dépendance React — safe en dehors des hooks.
 */

import { calculateBillingKPIs, calculateBTTranches } from '@/lib/billing-calculator'
import { mapOcrToInvoiceData } from '@/lib/invoice-mapper'
import type { AuditInvoice } from '@/lib/invoice-service'
import type { BillingParams } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PosteEcart {
  poste:      'energie' | 'prime_fixe' | 'pdp' | 'cosphi' | 'tva' | 'tco' | 'redevance'
  label:      string
  declare:    number | null   // valeur extraite de l'OCR
  recalcule:  number | null   // valeur théorique calculée
  ecart_fcfa: number
  ecart_pct:  number          // relatif au montant TTC
}

export interface InvoiceVerificationResult {
  invoiceId:          string
  fileName:           string
  invoiceDate:        string | null
  montant_declare:    number
  montant_recalcule:  number
  ecart_total_fcfa:   number
  ecart_total_pct:    number          // |écart| / MTTC
  postes:             PosteEcart[]
  status:             'ok' | 'warning' | 'error'  // <1% / 1-5% / >5%
  no_data:            boolean         // true si données OCR insuffisantes
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(n: number | null | undefined): number {
  return n != null && isFinite(n) ? n : 0
}

function posteEcart(
  poste: PosteEcart['poste'],
  label: string,
  declare: number | null,
  recalcule: number | null,
  mttc: number,
): PosteEcart {
  const d = safe(declare)
  const r = safe(recalcule)
  const ecart_fcfa = d - r
  const ecart_pct  = mttc > 0 ? (Math.abs(ecart_fcfa) / mttc) * 100 : 0
  return { poste, label, declare, recalcule, ecart_fcfa, ecart_pct }
}

// ─── Vérification principale ──────────────────────────────────────────────────

export function verifyInvoice(
  invoice: AuditInvoice,
  params: BillingParams,
): InvoiceVerificationResult {
  const base: Omit<InvoiceVerificationResult, 'postes' | 'status' | 'no_data'> = {
    invoiceId:         invoice.id,
    fileName:          invoice.file_name,
    invoiceDate:       invoice.invoice_date ?? null,
    montant_declare:   0,
    montant_recalcule: 0,
    ecart_total_fcfa:  0,
    ecart_total_pct:   0,
  }

  // ── 1. Extraire InvoiceData depuis l'OCR ──
  const invoiceData = mapOcrToInvoiceData(
    invoice.ocr_data_verified ?? invoice.ocr_data,
    invoice.amount ?? undefined,
  )

  if (!invoiceData.conso_kwh_total || !invoiceData.montant_ttc) {
    return { ...base, postes: [], status: 'ok', no_data: true }
  }

  const MTTC = invoiceData.montant_ttc

  // ── 2. Calculer les KPIs théoriques ──
  const kpis = calculateBillingKPIs(params, {
    conso_kwh_total:    invoiceData.conso_kwh_total,
    conso_k1_kwh:       invoiceData.conso_k1_kwh,
    conso_k2_kwh:       invoiceData.conso_k2_kwh,
    montant_energie:    invoiceData.montant_energie,
    montant_prime_fixe: invoiceData.montant_prime_fixe,
    montant_pdp:        invoiceData.montant_pdp,
    montant_cosphi:     invoiceData.montant_cosphi,
    montant_tva:        invoiceData.montant_tva,
    montant_tco:        invoiceData.montant_tco,
    montant_redevance:  invoiceData.montant_redevance,
    montant_ttc:        MTTC,
    puissance_max_kw:   invoiceData.puissance_max_kw,
    cosphi_mesure:      invoiceData.cosphi_mesure,
  })

  if (kpis.mt_tarif_indisponible) {
    return { ...base, montant_declare: MTTC, postes: [], status: 'ok', no_data: true }
  }

  // ── 3. Reconstruire le montant théorique total ──
  const recalc_energie  = kpis.montant_energie_calc
  const recalc_pf       = kpis.montant_pf_calc
  const recalc_pdp      = 0   // PDP = pénalité, on ne peut pas le recalculer sans Pmax contractuelle
  const recalc_cosphi   = 0   // Idem — pénalité dépend du tarif réactif exact
  const recalc_tva      = safe(invoiceData.montant_tva)     // difficile à recalculer sans base exacte
  const recalc_tco      = safe(invoiceData.montant_tco)
  const recalc_redevance = safe(invoiceData.montant_redevance)

  const montant_recalcule = recalc_energie + recalc_pf + safe(invoiceData.montant_pdp)
    + safe(invoiceData.montant_cosphi) + recalc_tva + recalc_tco + recalc_redevance

  const ecart_total_fcfa = MTTC - montant_recalcule
  const ecart_total_pct  = MTTC > 0 ? (Math.abs(ecart_total_fcfa) / MTTC) * 100 : 0

  const status: InvoiceVerificationResult['status'] =
    ecart_total_pct < 1 ? 'ok' :
    ecart_total_pct < 5 ? 'warning' : 'error'

  // ── 4. Détail par poste ──
  const postes: PosteEcart[] = [
    posteEcart('energie',   'Énergie consommée',      safe(invoiceData.montant_energie)    || null, recalc_energie,   MTTC),
    posteEcart('prime_fixe','Prime fixe (PS)',         safe(invoiceData.montant_prime_fixe) || null, recalc_pf,        MTTC),
    posteEcart('pdp',       'Dépassement PS (PDP)',    safe(invoiceData.montant_pdp)        || null, recalc_pdp || null, MTTC),
    posteEcart('cosphi',    'Pénalité cosφ',           safe(invoiceData.montant_cosphi)     || null, recalc_cosphi || null, MTTC),
    posteEcart('tva',       'TVA 18 %',                safe(invoiceData.montant_tva)        || null, recalc_tva || null,    MTTC),
    posteEcart('tco',       'Taxe communale (TCO)',    safe(invoiceData.montant_tco)        || null, recalc_tco || null,    MTTC),
    posteEcart('redevance', 'Redevance (compteur)',    safe(invoiceData.montant_redevance)  || null, recalc_redevance || null, MTTC),
  ].filter(p => p.declare !== null || p.recalcule !== null)

  return {
    invoiceId:         invoice.id,
    fileName:          invoice.file_name,
    invoiceDate:       invoice.invoice_date ?? null,
    montant_declare:   MTTC,
    montant_recalcule,
    ecart_total_fcfa,
    ecart_total_pct,
    postes,
    status,
    no_data: false,
  }
}

// ─── Vérification batch ───────────────────────────────────────────────────────

export function verifyAllInvoices(
  invoices: AuditInvoice[],
  params: BillingParams,
): InvoiceVerificationResult[] {
  return invoices
    .filter(inv => inv.status === 'verified' && inv.ocr_data != null)
    .map(inv => verifyInvoice(inv, params))
}
