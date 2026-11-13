import { describe, it, expect } from 'vitest'
import { detectAnomalies, groupAnomaliesByInvoice } from '@/lib/billing-anomaly-detector'
import { verifyAllInvoices, verifyInvoice } from '@/lib/billing-verifier'
import type { AuditInvoice } from '@/lib/invoice-service'
import type { BillingParams } from '@/types/billing'

let n = 0
function facture(forms: Record<string, string>, extra: Partial<AuditInvoice> = {}): AuditInvoice {
  n += 1
  return {
    id: `inv-${n}`, file_name: `f${n}.pdf`, status: 'verified', invoice_date: `2023-0${(n % 9) + 1}-15`,
    ocr_data: { forms: Object.entries(forms).map(([Key, Value]) => ({ Key, Value })) },
    ...extra,
  } as unknown as AuditInvoice
}

const PARAMS: BillingParams = { categorie: 'DGP', grille_annee: 2023, puissance_souscrite_kw: 36, periode_jours: 30 }

describe('Détection d’anomalies', () => {
  it('ignore les factures non vérifiées', () => {
    const a = detectAnomalies([facture({ 'Pmax relevée': '60', 'CONSOMMATION': '100' }, { status: 'processing' } as never)], PARAMS)
    expect(a).toEqual([])
  })

  it('dépassement de PS : warning > 10 %, error > 20 %', () => {
    const a = detectAnomalies([
      facture({ 'CONSOMMATION': '100', 'Pmax relevée': '41' }),   // +13,9 %
      facture({ 'CONSOMMATION': '100', 'Pmax relevée': '45' }),   // +25 %
      facture({ 'CONSOMMATION': '100', 'Pmax relevée': '38' }),   // +5,6 % → rien
    ], PARAMS).filter(x => x.type === 'depassement_ps')
    expect(a.map(x => x.severity)).toEqual(['warning', 'error'])
  })

  it('cos φ faible', () => {
    const a = detectAnomalies([facture({ 'CONSOMMATION': '100', 'COSPHI': '0,65' })], PARAMS)
    expect(a.find(x => x.type === 'cosphi_faible')?.severity).toBe('error')
  })

  it('relevé estimé', () => {
    const a = detectAnomalies([facture({ 'CONSOMMATION': '100', 'Type relevé': 'E' })], PARAMS)
    expect(a.some(x => x.type === 'estimation')).toBe(true)
  })

  it('arriérés : montant en base > TOTAL FACTURE OCR de plus de 10 %', () => {
    // Le montant enregistré en base (150 000) inclut des arriérés absents du TOTAL FACTURE (100 000)
    const a = detectAnomalies([facture({ 'CONSOMMATION': '100', 'TOTAL FACTURE': '100 000' }, { amount: 150_000 } as never)], PARAMS)
    expect(a.some(x => x.type === 'rappel')).toBe(true)
  })

  it('index suspect : conso > 3 × moyenne des factures précédentes', () => {
    const a = detectAnomalies([
      facture({ 'CONSOMMATION': '5000' }, { invoice_date: '2023-04-15' } as never),
      facture({ 'CONSOMMATION': '1000' }, { invoice_date: '2023-01-15' } as never),
      facture({ 'CONSOMMATION': '1100' }, { invoice_date: '2023-02-15' } as never),
      facture({ 'CONSOMMATION': '900' }, { invoice_date: '2023-03-15' } as never),
    ], PARAMS)
    expect(a.filter(x => x.type === 'index_suspect')).toHaveLength(1)
  })

  it('regroupe par facture', () => {
    const f = facture({ 'CONSOMMATION': '100', 'Pmax relevée': '45', 'COSPHI': '0,65' })
    const map = groupAnomaliesByInvoice(detectAnomalies([f], PARAMS))
    expect(map.get(f.id)).toHaveLength(2)
  })
})

describe('Vérification (moulinette)', () => {
  it('données OCR insuffisantes → no_data', () => {
    expect(verifyInvoice(facture({}), PARAMS).no_data).toBe(true)
  })

  it('statut selon l’écart : < 1 % ok, 1–5 % warning, > 5 % error', () => {
    // BT DPP : énergie recalculée depuis les tranches = 35 292,5 FCFA
    const p: BillingParams = { categorie: 'DPP', grille_annee: 2023, puissance_souscrite_kw: 6, periode_jours: 60 }
    const energie = 150 * 91.17 + 100 * 136.49 + 50 * 159.36
    const ok = verifyInvoice(facture({ 'CONSOMMATION': '300', 'TOTAL FACTURE': String(Math.round(energie)) }), p)
    const warn = verifyInvoice(facture({ 'CONSOMMATION': '300', 'TOTAL FACTURE': String(Math.round(energie * 1.03)) }), p)
    const err = verifyInvoice(facture({ 'CONSOMMATION': '300', 'TOTAL FACTURE': String(Math.round(energie * 1.2)) }), p)
    expect([ok.status, warn.status, err.status]).toEqual(['ok', 'warning', 'error'])
  })

  it('verifyAllInvoices ne traite que les factures vérifiées', () => {
    const r = verifyAllInvoices([
      facture({ 'CONSOMMATION': '300', 'TOTAL FACTURE': '40000' }),
      facture({ 'CONSOMMATION': '300', 'TOTAL FACTURE': '40000' }, { status: 'processing' } as never),
    ], PARAMS)
    expect(r).toHaveLength(1)
  })
})
