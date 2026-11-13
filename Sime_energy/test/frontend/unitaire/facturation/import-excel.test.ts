// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import * as XLSX from 'xlsx'
import { BILLING_TEMPLATE_COLUMNS, type BillingRow } from '@/components/invoices/billing-import.types'
import { parseExcelDate, coerceCell } from '@/components/invoices/billing-column-mapping'
import {
  analyzeDuplicates,
  detectAnomalies,
  useBillingImport,
} from '@/components/invoices/useBillingImport'

// ─── Fabrication d'un classeur au format du template SENELEC ─────────────────

type Ligne = Partial<Record<string, string | number>>

const LIGNE_DGP: Ligne = {
  numeroCompteContrat: 'CC-001', partenaire: 'MAIRIE DE DAKAR', appartenance: 'Ville de Dakar',
  numeroFacture: 1001, dateComptableFacture: '05/04/2023',
  dateDebutPeriode: '01/03/2023', dateFinPeriode: '31/03/2023',
  typeTarifNumero: 'DGP', puissanceSouscrite: 36, puissanceMaxRelevee: 40,
  consommationFacturee: 6000,
  montantTotalEnergie: 700_000, montantHorsTVA: 800_000, montantTVA: 144_000, montantFactureTTC: 944_000,
}

function classeur(lignes: Ligne[]): File {
  const entetes = BILLING_TEMPLATE_COLUMNS.map(c => c.label)
  const donnees = lignes.map(l => BILLING_TEMPLATE_COLUMNS.map(c => l[c.key] ?? null))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([entetes, ...donnees]), 'Feuil1')
  const buffer: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return { name: 'factures.xlsx', arrayBuffer: async () => buffer } as unknown as File
}

async function importer(lignes: Ligne[], reparer = true): Promise<BillingRow[]> {
  const { result } = renderHook(() => useBillingImport())
  await act(() => result.current.loadFile(classeur(lignes)))
  expect(result.current.parseError).toBeNull()
  expect(result.current.mappingState?.isStandard).toBe(true)
  await act(() => result.current.applyMapping())
  await waitFor(() => expect(result.current.result).not.toBeNull())
  if (reparer) act(() => result.current.autoRepair())
  return result.current.result!.rows
}

// Grille 2023 DGP : Tpf = 956,13 FCFA/kW/mois
const TPF = 956.13

describe('Import Excel — lecture', () => {
  it('reconnaît le template standard et calcule les colonnes dérivées', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 31 }], false)
    expect(row.rowErrors).toEqual([])
    expect(row.categorieTarifaire).toBe('Grande Puissance BT')
    expect(row.anneeFacturation).toBe(2023)
    expect(row.moisFacturation).toBe('mars')
    expect(row.puissanceSouscriteKW).toBe(36)
  })

  it('convertit une puissance en W (≥ 900) en kW', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 31, puissanceSouscrite: 36000 }], false)
    expect(row.puissanceSouscriteKW).toBe(36)
  })

  it('« - » dans un champ requis = non applicable, pas une erreur', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 31, appartenance: '-' }], false)
    expect(row.rowErrors).toEqual([])
  })

  it('signale les champs requis manquants', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 31, partenaire: undefined }], false)
    expect(row.rowErrors).toContain('Partenaire (Texte)')
  })
})

describe('Import Excel — réparation automatique (règles de référence)', () => {
  it('NJ = fin − début + 1 (1er → 31 mars = 31 j)', async () => {
    const [row] = await importer([LIGNE_DGP])
    expect(row.nbJourFacturation).toBe(31)
  })

  it('prime fixe = Tpf × PS × NJ/30', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 30, montantHorsTVA: undefined }])
    expect(row.montantPrimeFixe).toBe(Math.round(TPF * 36 * 30 / 30))
  })

  it('PDP = 1,5 × Tpf × (Pmax − PS) × NJ/30', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 30, montantHorsTVA: undefined }])
    expect(row.penalitesDepassement).toBe(Math.round(1.5 * TPF * (40 - 36) * 30 / 30))
  })

  it('triangle TVA : HT = TTC − TVA', async () => {
    const [row] = await importer([{ ...LIGNE_DGP, nbJourFacturation: 30, montantHorsTVA: undefined }])
    expect(row.montantHorsTVA).toBe(944_000 - 144_000)
  })

  it('K1/K2 depuis les index', async () => {
    const [row] = await importer([{
      ...LIGNE_DGP, nbJourFacturation: undefined,
      ancienIndexK1: 1000, nouvelIndexK1: 5800, ancienIndexK2: 200, nouvelIndexK2: 1400,
    }])
    expect(row.consK1).toBe(4800)
    expect(row.consK2).toBe(1200)
    expect(row.consT).toBe(6000)
  })

  it('les champs complétés sont marqués comme réparés', async () => {
    const [row] = await importer([LIGNE_DGP])
    expect(row._repairedFields).toContain('nbJourFacturation')
    expect(row.rowErrors).toEqual([])
  })
})

// ─── Fonctions pures ─────────────────────────────────────────────────────────

function ligne(partial: Partial<BillingRow>): BillingRow {
  return { _rowIndex: 0, rowErrors: [], _skippedFields: [], ...partial } as BillingRow
}

describe('Doublons et redressements', () => {
  it('détecte TTC ≠ HT + TVA, montants négatifs, index en régression', () => {
    const a = detectAnomalies(ligne({
      montantFactureTTC: 1000, montantHorsTVA: 800, montantTVA: 100,
      nouvelIndexK1: 10, ancienIndexK1: 20, nbJourFacturation: 0,
    }))
    expect(a.reasons).toEqual(['TTC ≠ HT + TVA', 'Nb jours ≤ 0', 'Index K1 en régression'])
  })

  it('garde la version cohérente d’une facture redressée', () => {
    const fausse = ligne({ _rowIndex: 2, numeroFacture: 7, montantFactureTTC: 1000, montantHorsTVA: 800, montantTVA: 100 })
    const juste = ligne({ _rowIndex: 3, numeroFacture: 7, montantFactureTTC: 944, montantHorsTVA: 800, montantTVA: 144 })
    const r = analyzeDuplicates([fausse, juste])
    expect(r.dropped.get(2)).toBe(3)
    expect(r.redressed.has(3)).toBe(true)
    expect(r.anomalous.has(2)).toBe(true)
  })

  it('doublons identiques : garde la date comptable la plus récente', () => {
    const r = analyzeDuplicates([
      ligne({ _rowIndex: 2, numeroFacture: 9, dateComptableFacture: new Date(2023, 3, 1) }),
      ligne({ _rowIndex: 3, numeroFacture: 9, dateComptableFacture: new Date(2023, 4, 1) }),
    ])
    expect(r.dropped.get(2)).toBe(3)
    expect(r.redressed.size).toBe(0)
  })
})

describe('Lecture des cellules', () => {
  it('date JJ/MM/AAAA, date MM/JJ forcée, date ISO, numéro de série Excel', () => {
    expect(parseExcelDate('05/04/2023')).toEqual(new Date(2023, 3, 5))
    expect(parseExcelDate('04/25/2023')).toEqual(new Date(2023, 3, 25)) // 25 ne peut pas être un mois
    expect(parseExcelDate('05/04/2023', 'MDY')).toEqual(new Date(2023, 4, 4))
    expect(parseExcelDate('2023-03-31')).toEqual(new Date(2023, 2, 31))
    expect(parseExcelDate(45016)).toEqual(new Date(2023, 2, 31))
  })

  it('« - » = ignoré, formule non évaluée = vide, nombre illisible = invalide', () => {
    expect(coerceCell('-', 'number', 'auto')).toEqual({ value: null, skipped: true, invalid: false })
    expect(coerceCell('=A1*2', 'number', 'auto').value).toBeNull()
    expect(coerceCell('abc', 'number', 'auto').invalid).toBe(true)
  })
})
