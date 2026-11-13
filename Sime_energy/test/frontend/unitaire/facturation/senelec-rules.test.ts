import { describe, it, expect } from 'vitest'
import { calcNJ, cosphiPenaltyPct, penaliteDepassement, primeFixe } from '@/lib/senelec-rules'

// Règles de référence SENELEC, partagées par le simulateur, la saisie manuelle, l'import Excel et le mapper OCR.

describe('calcNJ — fin − début + 1', () => {
  it('accepte dates et chaînes', () => {
    expect(calcNJ('2023-03-01', '2023-03-31')).toBe(31)
    expect(calcNJ(new Date(2023, 0, 1), new Date(2023, 2, 1))).toBe(60)
  })
  it('même jour = 1', () => {
    expect(calcNJ('2023-03-01', '2023-03-01')).toBe(1)
  })
  it('null si date absente, invalide, inversée ou période > 95 j', () => {
    expect(calcNJ(null, '2023-03-01')).toBeNull()
    expect(calcNJ('n/a', '2023-03-01')).toBeNull()
    expect(calcNJ('2023-03-10', '2023-03-01')).toBeNull()
    expect(calcNJ('2023-01-01', '2023-06-30')).toBeNull()
  })
})

describe('primeFixe — Tpf × PS × NJ/30', () => {
  it('DGP 2023, 36 kW, 31 j', () => {
    expect(primeFixe(956.13, 36, 31)).toBeCloseTo(956.13 * 36 * 31 / 30, 6)
  })
  it('0 si une donnée manque', () => {
    expect(primeFixe(0, 36, 31)).toBe(0)
    expect(primeFixe(956.13, 0, 31)).toBe(0)
    expect(primeFixe(956.13, 36, 0)).toBe(0)
  })
})

describe('penaliteDepassement — 1,5 × Tpf × (Pmax − PS) × NJ/30', () => {
  it('avec dépassement', () => {
    expect(penaliteDepassement(956.13, 36, 40, 31)).toBeCloseTo(1.5 * 956.13 * 4 * 31 / 30, 6)
  })
  it('sans dépassement ou Pmax égale à PS → 0', () => {
    expect(penaliteDepassement(956.13, 36, 30, 31)).toBe(0)
    expect(penaliteDepassement(956.13, 36, 36, 31)).toBe(0)
  })
})

describe('cosphiPenaltyPct — barème CER2E', () => {
  it.each([
    [0.80, 0], [0.95, 0], [0.79, 5], [0.62, 20], [0.30, 80],
    [0.96, -0.75], [1.0, -3.75], [0, 0], [NaN, 0],
  ])('cos φ = %s → %s %%', (cosphi, attendu) => {
    expect(cosphiPenaltyPct(cosphi)).toBeCloseTo(attendu, 6)
  })
})
