import { describe, it, expect, afterEach } from 'vitest'
import { formatEnergy, formatNumber, formatPercent, formatPower } from '@/lib/format'
import {
  getAvailableTariffYears,
  getTariffGrid,
  getTransfoCoefficients,
  isCustomTariffYear,
  setCustomTariffGrids,
  suggestTensionFromPS,
  TARIFF_2023,
} from '@/constants/senelec-tariffs'
import { computeDJU, computeStats } from '@/services/meteo-service'

// Intl fr-FR utilise une espace fine insécable comme séparateur de milliers
const sp = (s: string) => s.replace(/[  ]/g, ' ')

describe('Formatage', () => {
  it('nombres', () => {
    expect(sp(formatNumber(1_234_567))).toBe('1 234 567')
    expect(sp(formatNumber(12.345, 2))).toBe('12,35')
  })
  it('puissance', () => {
    expect(formatPower(450)).toBe('450 W')
    expect(sp(formatPower(1_500))).toBe('1,5 kW')
    expect(formatPower(12_500)).toBe('13 kW')
    expect(sp(formatPower(1_200_000))).toBe('1,2 MW')
  })
  it('énergie', () => {
    expect(formatEnergy(0)).toBe('0 kWh')
    expect(sp(formatEnergy(3_450))).toBe('3 450 kWh')
    expect(sp(formatEnergy(12_300))).toBe('12,3 MWh')
    expect(sp(formatEnergy(1_200_000))).toBe('1,2 GWh')
  })
  it('pourcentage', () => {
    expect(formatPercent(34.56)).toBe('34,6 %')
  })
})

describe('Grilles tarifaires', () => {
  afterEach(() => setCustomTariffGrids(null))

  it('années standard', () => {
    expect(getAvailableTariffYears()).toEqual([2017, 2019, 2023, 2026])
  })

  it('une grille custom s’ajoute sans écraser une grille standard', () => {
    setCustomTariffGrids({ 2024: TARIFF_2023, 2023: { ...TARIFF_2023, BT: { ...TARIFF_2023.BT, DPP: { ...TARIFF_2023.BT.DPP, t1: 1 } } } })
    expect(getAvailableTariffYears()).toEqual([2017, 2019, 2023, 2024, 2026])
    expect(isCustomTariffYear(2024)).toBe(true)
    expect(getTariffGrid(2023)?.BT.DPP.t1).toBe(91.17)
  })

  it('suggestion de tension selon la PS', () => {
    expect(suggestTensionFromPS(6)).toMatchObject({ domaine: 'BT', band: 'PP' })
    expect(suggestTensionFromPS(17)).toMatchObject({ domaine: 'BT', band: 'MP' })
    expect(suggestTensionFromPS(36)).toMatchObject({ domaine: 'BT', band: 'GP' })
    expect(suggestTensionFromPS(500)).toMatchObject({ domaine: 'MT' })
    expect(suggestTensionFromPS(2000)).toMatchObject({ domaine: 'HT' })
    expect(suggestTensionFromPS(0)).toBeNull()
  })

  it('coefficients transfo : valeur exacte, interpolation, hors plage', () => {
    expect(getTransfoCoefficients(100)).toEqual({ alphaA: 0.0175, betaA: 0.32, alphaR: 0.04, betaR: 2.5 })
    const c = getTransfoCoefficients(112.5)!
    expect(c.betaA).toBeCloseTo((0.32 + 0.3783) / 2, 6)
    expect(getTransfoCoefficients(10)).toBeNull()
    expect(getTransfoCoefficients(1000)).toBeNull()
  })
})

describe('Météo', () => {
  const jours = [20, 27, 30, null, 15].map(t => ({ temperature_2m_mean: t }) as never)

  it('degrés-jours chauffage (base 18) et climatisation (base 26)', () => {
    expect(computeDJU(jours)).toEqual({ djc: 3, djf: 5 })
  })

  it('degrés-jours avec la base clim Sénégal (24 °C)', () => {
    expect(computeDJU(jours, 18, 24).djf).toBe(9)
  })

  it('statistiques en ignorant les valeurs vides', () => {
    expect(computeStats(jours, 'temperature_2m_mean')).toEqual({ min: 15, max: 30, mean: 23, sum: 92, count: 4 })
    expect(computeStats([], 'temperature_2m_mean')).toBeNull()
  })
})
