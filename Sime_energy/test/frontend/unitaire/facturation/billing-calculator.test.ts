import { describe, it, expect } from 'vitest'
import {
  calculateBTTranches,
  calculateBillingKPIs,
  convertPowerToEnergy,
  sumMeasurements,
} from '@/lib/billing-calculator'
import type { BillingParams, InvoiceData } from '@/types/billing'

// Grille 2023 — DPP : t1 91,17 / t2 136,49 / t3 159,36 — seuils 150 / 250 kWh pour 60 j
// Grille 2023 — DGP : pf 956,13 / k1 118,37 / k2 170,53

describe('calculateBTTranches', () => {
  it('répartit 300 kWh DPP sur 60 j en 150 / 100 / 50', () => {
    const r = calculateBTTranches('DPP', 300, 60, 2023)
    expect(r.t1_kwh).toBe(150)
    expect(r.t2_kwh).toBe(100)
    expect(r.t3_kwh).toBe(50)
    expect(r.montant_fcfa).toBeCloseTo(150 * 91.17 + 100 * 136.49 + 50 * 159.36, 6)
  })

  it('proratise les seuils sur la durée de la période (30 j → 75 / 125 kWh)', () => {
    const r = calculateBTTranches('DPP', 100, 30, 2023)
    expect(r.t1_kwh).toBe(75)
    expect(r.t2_kwh).toBe(25)
    expect(r.t3_kwh).toBe(0)
  })

  it('reste en tranche 1 sous le premier seuil', () => {
    const r = calculateBTTranches('PPP', 40, 60, 2023)
    expect(r).toMatchObject({ t1_kwh: 40, t2_kwh: 0, t3_kwh: 0 })
    expect(r.montant_fcfa).toBeCloseTo(40 * 163.81, 6)
  })
})

describe('Mesures → énergie', () => {
  it('1 000 W pendant 15 min = 0,25 kWh', () => {
    expect(convertPowerToEnergy(1000, 15)).toBeCloseTo(0.25, 10)
  })

  it('classe en K2 les mesures entre 19 h et 23 h', () => {
    const r = sumMeasurements([
      { power_w: 2000, timestamp: new Date(2024, 0, 1, 18, 0) },
      { power_w: 4000, timestamp: new Date(2024, 0, 1, 19, 0) },
      { power_w: 4000, timestamp: new Date(2024, 0, 1, 22, 45) },
      { power_w: 1000, timestamp: new Date(2024, 0, 1, 23, 0) },
    ], 60)
    expect(r.k1_kwh).toBeCloseTo(3, 10)
    expect(r.k2_kwh).toBeCloseTo(8, 10)
    expect(r.total_kwh).toBeCloseTo(11, 10)
    expect(r.peak_kw).toBe(4)
  })
})

const PARAMS_DGP: BillingParams = { categorie: 'DGP', grille_annee: 2023, puissance_souscrite_kw: 36, periode_jours: 30 }

function facture(partial: Partial<InvoiceData>): InvoiceData {
  return { conso_kwh_total: 6000, montant_ttc: 1_000_000, ...partial }
}

describe('calculateBillingKPIs', () => {
  it('renvoie des zéros si conso, NJ ou PS manquent', () => {
    expect(calculateBillingKPIs({ ...PARAMS_DGP, periode_jours: 0 }, facture({})).ipr_fcfa_kwh).toBe(0)
    expect(calculateBillingKPIs({ ...PARAMS_DGP, puissance_souscrite_kw: 0 }, facture({})).ipr_fcfa_kwh).toBe(0)
    expect(calculateBillingKPIs(PARAMS_DGP, facture({ conso_kwh_total: 0 })).ipr_fcfa_kwh).toBe(0)
  })

  it('signale une grille HT indisponible (HTS 2023 vide)', () => {
    const k = calculateBillingKPIs({ ...PARAMS_DGP, categorie: 'HTS' }, facture({}))
    expect(k.mt_tarif_indisponible).toBe(true)
  })

  it('normalise la conso et le coût sur le jour et l’année', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({}))
    expect(k.conso_journaliere_kwh).toBe(200)
    expect(k.conso_annuelle_kwh).toBe(73_000)
    expect(k.ipr_fcfa_kwh).toBeCloseTo(1_000_000 / 6000, 6)
    expect(k.cout_annuel_fcfa).toBeCloseTo(1_000_000 * 365 / 30, 6)
  })

  it('coût moyen pondéré = (K1×20 + K2×4) / 24', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({}))
    expect(k.cm_fcfa_kwh).toBeCloseTo((118.37 * 20 + 170.53 * 4) / 24, 6)
  })

  it('reconstruit la prime fixe = Tpf × PS × NJ/30 quand l’OCR ne la donne pas', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({}))
    expect(k.pf_reconstructed).toBe(true)
    expect(k.montant_pf_calc).toBeCloseTo(956.13 * 36 * 30 / 30, 6)
  })

  it('reconstruit l’énergie GP depuis K1/K2', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({ conso_k1_kwh: 5000, conso_k2_kwh: 1000 }))
    expect(k.energie_reconstructed).toBe(true)
    expect(k.montant_energie_calc).toBeCloseTo(5000 * 118.37 + 1000 * 170.53, 6)
  })

  it('reconstruit l’énergie BT depuis les tranches', () => {
    const k = calculateBillingKPIs(
      { categorie: 'DPP', grille_annee: 2023, puissance_souscrite_kw: 6, periode_jours: 60 },
      facture({ conso_kwh_total: 300, montant_ttc: 40_000 }),
    )
    expect(k.montant_energie_calc).toBeCloseTo(150 * 91.17 + 100 * 136.49 + 50 * 159.36, 6)
  })

  it('économie PS : stricte (PS → Pmax) et prudente (PS → Pmax × 1,1)', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({ puissance_max_kw: 20 }))
    expect(k.economie_ps_fcfa).toBeCloseTo((36 - 20) * 956.13, 6)
    expect(k.economie_ps_prudent_fcfa).toBeCloseTo((36 - 22) * 956.13, 6)
  })

  it('le résiduel = TTC − postes identifiés, jamais négatif', () => {
    const k = calculateBillingKPIs(PARAMS_DGP, facture({
      montant_energie: 700_000, montant_prime_fixe: 34_000, montant_tva: 150_000, montant_redevance: 15_850,
    }))
    expect(k.montant_residuel_fcfa).toBeCloseTo(1_000_000 - 700_000 - 34_000 - 150_000 - 15_850, 6)
  })

  it('propose le tarif MT optimal selon les heures d’utilisation', () => {
    const base = { grille_annee: 2023, periode_jours: 30 } as const
    // 6 000 kWh / 30 j → 73 000 kWh/an
    expect(calculateBillingKPIs({ ...base, categorie: 'TG', puissance_souscrite_kw: 100 }, facture({})).choix_tarif_optimal).toBe('TCU') // 730 h
    expect(calculateBillingKPIs({ ...base, categorie: 'TG', puissance_souscrite_kw: 30 }, facture({})).choix_tarif_optimal).toBe('TG')   // 2 433 h
    expect(calculateBillingKPIs({ ...base, categorie: 'TG', puissance_souscrite_kw: 15 }, facture({})).choix_tarif_optimal).toBe('TLU')  // 4 867 h
  })
})
