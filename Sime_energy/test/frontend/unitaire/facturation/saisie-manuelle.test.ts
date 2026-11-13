import { describe, it, expect } from 'vitest'
import {
  calcCosphi,
  calcNJ,
  calcPrimeFix,
  calcTranches,
  calcTVABase_BT_PP,
  calcMajoration,
} from '@/components/invoices/manual-invoice-calc'

describe('Saisie manuelle — NJ = fin − début + 1', () => {
  it('mars complet = 31 jours', () => {
    expect(calcNJ('2023-03-01', '2023-03-31')).toBe(31)
  })
  it('même jour = 1 jour', () => {
    expect(calcNJ('2023-03-01', '2023-03-01')).toBe(1)
  })
  it('fin avant début, période > 95 j ou date invalide → null', () => {
    expect(calcNJ('2023-03-10', '2023-03-01')).toBeNull()
    expect(calcNJ('2023-01-01', '2023-06-30')).toBeNull()
    expect(calcNJ('', '2023-03-01')).toBeNull()
    expect(calcNJ('pas une date', '2023-03-01')).toBeNull()
  })
})

describe('Saisie manuelle — prime fixe = Tpf × PS × NJ/30', () => {
  it('DGP 2023, 36 kW, 31 j', () => {
    expect(calcPrimeFix(36, 956.13, 31)).toBe(Math.round(36 * 956.13 * 31 / 30))
  })
  it('donnée manquante → 0', () => {
    expect(calcPrimeFix(0, 956.13, 30)).toBe(0)
  })
})

describe('Saisie manuelle — tranches BT', () => {
  it('DPP 300 kWh sur 60 j', () => {
    const r = calcTranches('DPP', 300, 60, [91.17, 136.49, 159.36], false)
    expect([r.t1_kwh, r.t2_kwh, r.t3_kwh]).toEqual([150, 100, 50])
    expect(r.t3_montant).toBe(Math.round(50 * 159.36))
  })
  it('WOYOFAL : la tranche 3 est facturée au prix de la tranche 2', () => {
    const r = calcTranches('DPP', 300, 60, [91.17, 136.49, 159.36], true)
    expect(r.t3_montant).toBe(Math.round(50 * 136.49))
  })
  it('base TVA : DPP/DMP = T3 + TCO + redevance ; PPP/PMP = tout', () => {
    expect(calcTVABase_BT_PP('DPP', 100, 200, 300, 10, 944)).toBe(300 + 10 + 944)
    expect(calcTVABase_BT_PP('PPP', 100, 200, 300, 10, 944)).toBe(100 + 200 + 300 + 10 + 944)
  })
})

describe('Saisie manuelle — majorations transformateur', () => {
  it('Ma K1 = K1 × a × (1 + a′), Ma K2 = K2 × a × (1 + 2a′)', () => {
    expect(calcMajoration(1000, 200, 500, 0.02, 0.1, 0.03, 0.1)).toEqual({
      ma_k1: Math.round(1000 * 0.02 * 1.1),
      ma_k2: Math.round(200 * 0.02 * 1.2),
      ma_reactive: Math.round(500 * 0.03 * 1.1),
    })
  })
})

// Le barème de référence est celui du simulateur (voir senelec-simulator.test.ts).
describe('Saisie manuelle — cos φ aligné sur le barème du simulateur', () => {
  const BASE = 1_000_000
  it.each([
    [0.90, 0],
    [0.82, 0],          // zone neutre 0,80–0,95
    [0.94, 0],
    [0.78, 0.05 * BASE],
    [0.62, 0.20 * BASE],
    [0.97, -0.015 * BASE],
    [0.99, -0.03 * BASE],
  ])('cos φ = %s → %s FCFA', (cosphi, attendu) => {
    expect(calcCosphi(cosphi, BASE)).toBe(Math.round(attendu))
  })
})
