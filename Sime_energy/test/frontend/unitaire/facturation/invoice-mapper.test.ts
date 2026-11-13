import { describe, it, expect } from 'vitest'
import { extractPuissanceSouscrite, mapOcrToInvoiceData, mapSenelecToInvoiceData } from '@/lib/invoice-mapper'

const cellules = (...lignes: string[][]) => ({ rows: lignes.map(l => l.map(text => ({ text }))) })

// Facture BT (DPP) — format OCR stocké en base : { page: [{ forms, tables }] }
const OCR_BT = {
  page: [{
    forms: [
      { Key: 'CONSOMMATION (KWH)', Value: '300' },
      { Key: 'TOTAL FACTURE', Value: '38 759' },
      { Key: 'TVA (18%)', Value: '1 640' },
      { Key: 'REDEVANCE', Value: '944' },
      { Key: 'TCO (2,5%)', Value: '882' },
      { Key: 'PERIODE_DU', Value: '01/01/2023' },
      { Key: 'PERIODE_AU', Value: '01/03/2023' },
      { Key: 'PUISSANCE SOUSCRITE', Value: '6' },
    ],
    tables: [cellules(
      ['Tranches', 'Conso (kWh)', 'Tarif (FCFA/kWh)', 'Montant (FCFA)'],
      ['1ère tranche', '150', '91,17', '13 676'],
      ['2èᵐᵉ tranche', '100', '136,49', '13 649'],
      ['3ème tranche', '50', '159,36', '7 968'],
    )],
  }],
}

// Facture GP/MT — tableau de facturation 4 colonnes + matrice énergie
const OCR_MT = {
  page: [{
    forms: [
      { Key: 'Pmax relevée', Value: '120' },
      { Key: 'Cosinus phi', Value: '0,87' },
      { Key: 'Nombre de jours', Value: '30' },
    ],
    tables: [
      cellules(
        ['DESIGNATION', 'QUANTITE', 'TARIF/TAUX', 'MONTANT'],
        ['Montant Energie K1', '20 000 kWh', '111,91', '2 238 200'],
        ['Montant Energie K2', '4 000 kWh', '184,65', '738 600'],
        ['Prime Fixe Mensuelle', '', '4 093,6', '409 360'],
        ['Pénalité sur dépassement', '', '4 093,6', '122 808'],
        ['Application Cos phi', '3 370 968', '2,25 %', '-75 847'],
        ['Redevance', '', '16 378', '16 378'],
        ['Montant Total HT', '', '', '3 449 499'],
        ['Montant TVA', '3 449 499', '18 %', '620 910'],
        ['Total Facture', '', '', '4 070 409'],
      ),
      cellules(
        ['', 'K1', 'K2', 'Total', 'Réactive', 'H1'],
        ['Consommation', '19 800', '3 950', '23 750', '12 000', '720'],
        ['Majoration', '200', '50', '250', '', ''],
        ['Total à facturer', '20 000', '4 000', '24 000', '12 000', ''],
      ),
    ],
  }],
}

describe('mapOcrToInvoiceData — facture BT', () => {
  const d = mapOcrToInvoiceData(OCR_BT)

  it('consommation, tranches (y compris exposants OCR « ᵐᵉ »)', () => {
    expect(d.conso_kwh_total).toBe(300)
    expect(d.tranche1_kwh).toBe(150)
    expect(d.tranche2_kwh).toBe(100)
    expect(d.tranche3_montant).toBe(7968)
    expect(d.montant_energie).toBe(13_676 + 13_649 + 7_968)
  })

  it('montants BT lus dans les formulaires', () => {
    expect(d.montant_ttc).toBe(38_759)
    expect(d.montant_tva).toBe(1640)
    expect(d.montant_redevance).toBe(944)
    expect(d.montant_tco).toBe(882)
    expect(d.puissance_souscrite_kw).toBe(6)
  })

  it('période et NJ = fin − début + 1 (1er janv. → 1er mars 2023 = 60 j)', () => {
    expect(d.periode_debut_iso).toBe('2023-01-01')
    expect(d.periode_fin_iso).toBe('2023-03-01')
    expect(d.periode_jours_ocr).toBe(60)
  })
})

describe('mapOcrToInvoiceData — facture MT', () => {
  const d = mapOcrToInvoiceData(OCR_MT)

  it('K1/K2 et montants du tableau 4 colonnes', () => {
    expect(d.conso_k1_kwh).toBe(20_000)
    expect(d.conso_k2_kwh).toBe(4_000)
    expect(d.k1_tarif).toBe(111.91)
    expect(d.montant_energie).toBe(2_238_200 + 738_600)
    expect(d.montant_prime_fixe).toBe(409_360)
    expect(d.montant_pdp).toBe(122_808)
    expect(d.montant_ht).toBe(3_449_499)
    expect(d.montant_tva).toBe(620_910)
    expect(d.montant_ttc).toBe(4_070_409)
  })

  it('bonification cos φ négative conservée', () => {
    expect(d.montant_cosphi).toBe(-75_847)
  })

  it('matrice énergie : total à facturer, réactive, H1, majorations', () => {
    expect(d.conso_kwh_total).toBe(24_000)
    expect(d.energie_reactive_kvarh).toBe(12_000)
    expect(d.heures_transfo_h1).toBe(720)
    expect(d.majoration_k1_kwh).toBe(200)
  })

  it('entête technique : Pmax, cos φ, NJ', () => {
    expect(d.puissance_max_kw).toBe(120)
    expect(d.cosphi_mesure).toBe(0.87)
    expect(d.periode_jours_ocr).toBe(30)
  })
})

describe('mapOcrToInvoiceData — cas limites', () => {
  it('données absentes → montant de la base en dernier recours', () => {
    expect(mapOcrToInvoiceData(null, 12_345).montant_ttc).toBe(12_345)
    expect(mapOcrToInvoiceData({}).montant_ttc).toBe(0)
  })

  it('format multi-pages « pages »', () => {
    expect(mapOcrToInvoiceData({ pages: OCR_BT.page }).conso_kwh_total).toBe(300)
  })

  it('cos φ exprimé en % (87) ramené à 0,87', () => {
    expect(mapOcrToInvoiceData({ forms: [{ Key: 'COSPHI', Value: '87' }] }).cosphi_mesure).toBe(0.87)
  })
})

describe('Puissance souscrite', () => {
  it('lit la PS et convertit les W en kW', () => {
    expect(extractPuissanceSouscrite({ forms: [{ Key: 'PUISSANCE SOUSCRITE', Value: '36' }] })).toBe(36)
    expect(extractPuissanceSouscrite({ forms: [{ Key: 'PS', Value: '36000' }] })).toBe(36)
    expect(extractPuissanceSouscrite({ forms: [] })).toBeNull()
  })
})

describe('mapSenelecToInvoiceData (ligne du classeur)', () => {
  it('Pmax en W ≥ 900 convertie en kW', () => {
    const d = mapSenelecToInvoiceData({ puissance_max_relevee: 40_000, consommation_facturee: 6000, montant_facture_ttc: 944_000 } as never)
    expect(d.puissance_max_kw).toBe(40)
    expect(d.conso_kwh_total).toBe(6000)
  })
})
