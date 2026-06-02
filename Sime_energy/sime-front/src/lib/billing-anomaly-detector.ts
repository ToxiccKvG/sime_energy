/**
 * billing-anomaly-detector.ts
 * Détecte automatiquement les anomalies administratives et techniques sur un ensemble de factures.
 * Aucune dépendance React — safe en dehors des hooks.
 */

import { mapOcrToInvoiceData } from '@/lib/invoice-mapper'
import type { AuditInvoice } from '@/lib/invoice-service'
import type { BillingParams } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnomalyType =
  | 'estimation'      // index "E" — relevé estimé par SENELEC (pas réel)
  | 'rappel'          // SOLDE DES IMPAYES > 0 (arriérés)
  | 'index_suspect'   // consommation > 3× moyenne des 6 dernières factures
  | 'depassement_ps'  // Pmax > Puissance Souscrite
  | 'cosphi_faible'   // cosφ mesuré < seuil
  | 'k2_excessif'     // ratio K2/total > seuil (trop de conso en heures de pointe)

export interface BillingAnomaly {
  type:       AnomalyType
  severity:   'info' | 'warning' | 'error'
  invoiceId:  string
  fileName:   string
  invoiceDate: string | null
  message:    string
  valeur?:    number
  seuil?:     number
}

export interface AnomalyThresholds {
  k2_pct:        number   // % — alerte si K2/total dépasse ce seuil (défaut : 10)
  cosphi_min:    number   // alerte si cosφ < ce seuil (défaut : 0.80)
  ps_ecart_pct:  number   // % — alerte si (Pmax-PS)/PS dépasse ce seuil (défaut : 10)
  index_factor:  number   // facteur multiplicateur pour détection index suspect (défaut : 3)
}

export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  k2_pct:       10,
  cosphi_min:   0.80,
  ps_ecart_pct: 10,
  index_factor: 3,
}

// ─── Helpers OCR ─────────────────────────────────────────────────────────────

function extractOcrText(ocr_data: unknown): string {
  if (!ocr_data || typeof ocr_data !== 'object') return ''
  const d = ocr_data as Record<string, unknown>
  const pageArr = Array.isArray(d.pages) ? d.pages : Array.isArray(d.page) ? d.page : null
  if (pageArr && pageArr.length > 0) {
    const forms = (pageArr[0] as Record<string, unknown>).forms
    if (Array.isArray(forms)) {
      return forms.map((f: Record<string, unknown>) => `${f.Key ?? ''} ${f.Value ?? ''}`).join(' ').toLowerCase()
    }
  }
  const forms = d.forms
  if (Array.isArray(forms)) {
    return forms.map((f: Record<string, unknown>) => `${f.Key ?? ''} ${f.Value ?? ''}`).join(' ').toLowerCase()
  }
  return ''
}

function getOcrValue(ocr_data: unknown, aliases: string[]): string | null {
  if (!ocr_data || typeof ocr_data !== 'object') return null
  const d = ocr_data as Record<string, unknown>
  const pageArr = Array.isArray(d.pages) ? d.pages : Array.isArray(d.page) ? d.page : null
  let forms: Array<{ Key: string; Value: string }> = []
  if (pageArr && pageArr.length > 0) {
    forms = ((pageArr[0] as Record<string, unknown>).forms as typeof forms) ?? []
  } else if (Array.isArray(d.forms)) {
    forms = d.forms as typeof forms
  }
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s*:\s*$/, '').replace(/[^\w]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const alias of aliases) {
    const hit = forms.find(f => norm(f.Key) === norm(alias))
    if (hit?.Value) return hit.Value
  }
  return null
}

// ─── Détection principale ─────────────────────────────────────────────────────

export function detectAnomalies(
  invoices: AuditInvoice[],
  params: BillingParams | null,
  thresholds: Partial<AnomalyThresholds> = {},
): BillingAnomaly[] {
  const t: AnomalyThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  const anomalies: BillingAnomaly[] = []

  // Trier chronologiquement pour le calcul de la moyenne glissante
  const sorted = [...invoices]
    .filter(inv => inv.status === 'verified' && inv.ocr_data != null)
    .sort((a, b) => {
      const da = a.invoice_date ? new Date(a.invoice_date).getTime() : 0
      const db = b.invoice_date ? new Date(b.invoice_date).getTime() : 0
      return da - db
    })

  // Pré-calculer la conso de chaque facture pour la détection d'index suspect
  const consoHistory: number[] = []

  for (const inv of sorted) {
    const ocrData = inv.ocr_data_verified ?? inv.ocr_data
    const ocrText = extractOcrText(ocrData)
    const invData = mapOcrToInvoiceData(ocrData, inv.amount ?? undefined)
    const conso = invData.conso_kwh_total ?? 0

    const meta = {
      invoiceId:   inv.id,
      fileName:    inv.file_name,
      invoiceDate: inv.invoice_date ?? null,
    }

    // ── 1. Estimation (index "E") ──
    // SENELEC indique "E" ou "ESTIME" dans le champ type de relevé
    const typeReleve = getOcrValue(ocrData, ['Type relevé', 'TYPE RELEVE', 'Type de relevé', 'RELEVÉ', 'RELEVE'])
    if (
      (typeReleve && /^e$/i.test(typeReleve.trim())) ||
      ocrText.includes('estimé') ||
      ocrText.includes('estime') ||
      ocrText.includes('relev') && ocrText.includes('estimé')
    ) {
      anomalies.push({
        ...meta,
        type: 'estimation',
        severity: 'warning',
        message: 'Relevé estimé (index "E") — consommation non basée sur un relevé réel',
      })
    }

    // ── 2. Rappel / Arriérés (SOLDE DES IMPAYES) ──
    if (invData.total_facture_ocr && invData.montant_ttc) {
      const ratio = invData.montant_ttc / invData.total_facture_ocr
      if (ratio > 1.10) {  // +10% → probable arriérés
        anomalies.push({
          ...meta,
          type: 'rappel',
          severity: 'warning',
          message: `Arriérés probables — montant DB (${Math.round(invData.montant_ttc).toLocaleString('fr-FR')} FCFA) dépasse TOTAL FACTURE OCR (${Math.round(invData.total_facture_ocr).toLocaleString('fr-FR')} FCFA) de ${Math.round((ratio - 1) * 100)}%`,
          valeur: invData.montant_ttc,
          seuil: invData.total_facture_ocr,
        })
      }
    }

    // ── 3. Index suspect (outlier conso) ──
    if (consoHistory.length >= 3 && conso > 0) {
      const window = consoHistory.slice(-6)
      const moyenne = window.reduce((s, v) => s + v, 0) / window.length
      if (conso > moyenne * t.index_factor) {
        anomalies.push({
          ...meta,
          type: 'index_suspect',
          severity: 'error',
          message: `Consommation anormalement élevée : ${Math.round(conso).toLocaleString('fr-FR')} kWh vs moyenne ${Math.round(moyenne).toLocaleString('fr-FR')} kWh (×${(conso / moyenne).toFixed(1)})`,
          valeur: conso,
          seuil: moyenne * t.index_factor,
        })
      } else if (conso > 0 && conso < moyenne / t.index_factor) {
        anomalies.push({
          ...meta,
          type: 'index_suspect',
          severity: 'warning',
          message: `Consommation anormalement basse : ${Math.round(conso).toLocaleString('fr-FR')} kWh vs moyenne ${Math.round(moyenne).toLocaleString('fr-FR')} kWh`,
          valeur: conso,
          seuil: moyenne / t.index_factor,
        })
      }
    }
    if (conso > 0) consoHistory.push(conso)

    // ── 4. Dépassement Puissance Souscrite ──
    if (params?.puissance_souscrite_kw && invData.puissance_max_kw) {
      const ps   = params.puissance_souscrite_kw
      const pmax = invData.puissance_max_kw
      const ecartPct = ((pmax - ps) / ps) * 100
      if (ecartPct > t.ps_ecart_pct) {
        anomalies.push({
          ...meta,
          type: 'depassement_ps',
          severity: ecartPct > 20 ? 'error' : 'warning',
          message: `Dépassement PS : Pmax = ${pmax} kW > PS = ${ps} kW (écart : +${ecartPct.toFixed(1)}%)`,
          valeur: ecartPct,
          seuil: t.ps_ecart_pct,
        })
      }
    }

    // ── 5. cosφ faible ──
    if (invData.cosphi_mesure && invData.cosphi_mesure < t.cosphi_min) {
      anomalies.push({
        ...meta,
        type: 'cosphi_faible',
        severity: invData.cosphi_mesure < 0.70 ? 'error' : 'warning',
        message: `Facteur de puissance faible : cosφ = ${invData.cosphi_mesure.toFixed(3)} < seuil ${t.cosphi_min.toFixed(2)}`,
        valeur: invData.cosphi_mesure,
        seuil: t.cosphi_min,
      })
    }

    // ── 6. K2 excessif ──
    if (invData.conso_k2_kwh && invData.conso_kwh_total && invData.conso_kwh_total > 0) {
      const k2pct = (invData.conso_k2_kwh / invData.conso_kwh_total) * 100
      if (k2pct > t.k2_pct) {
        anomalies.push({
          ...meta,
          type: 'k2_excessif',
          severity: k2pct > 16 ? 'error' : 'warning',
          message: `Consommation en heures de pointe élevée : K2 = ${k2pct.toFixed(1)}% du total (seuil : ${t.k2_pct}%)`,
          valeur: k2pct,
          seuil: t.k2_pct,
        })
      }
    }
  }

  return anomalies
}

// ─── Regroupement par facture ─────────────────────────────────────────────────

export function groupAnomaliesByInvoice(
  anomalies: BillingAnomaly[],
): Map<string, BillingAnomaly[]> {
  const map = new Map<string, BillingAnomaly[]>()
  for (const a of anomalies) {
    if (!map.has(a.invoiceId)) map.set(a.invoiceId, [])
    map.get(a.invoiceId)!.push(a)
  }
  return map
}
