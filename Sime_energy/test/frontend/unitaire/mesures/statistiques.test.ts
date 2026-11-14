// Statistiques des relevés de mesures (services/measurementStats.ts) et utilitaires des
// modèles d'analyse (services/analysisModels/types.ts).
// Tests de caractérisation : ils figent les résultats actuels avant le nettoyage du code.
import { describe, it, expect } from 'vitest'
import {
  computeMeasurementKpis,
  groupMeasurementsByDay,
  integrateEnergy,
  toDate,
} from '@/services/measurementStats'
import {
  dailyUnit,
  detectStepMs,
  fmtDay,
  groupDays,
  hourlyUnit,
  mad,
  mean,
  quantile,
  std,
  totalOf,
  type SeriesContext,
} from '@/services/analysisModels/types'
import { desempilerSections } from '@/lib/tableau-sections'

const H = 3_600_000

describe('Intégration de la puissance', () => {
  it('méthode des trapèzes : 1 kW constant pendant 2 h = 2 kWh', () => {
    expect(integrateEnergy([{ t: 0, v: 1 }, { t: H, v: 1 }, { t: 2 * H, v: 1 }])).toBe(2)
  })
  it('rampe 0 → 2 kW sur 1 h = 1 kWh, points dans le désordre', () => {
    expect(integrateEnergy([{ t: H, v: 2 }, { t: 0, v: 0 }])).toBe(1)
  })
  it('horodatages en double ignorés', () => {
    expect(integrateEnergy([{ t: 0, v: 5 }, { t: 0, v: 7 }])).toBe(0)
  })
})

describe('Regroupement par jour', () => {
  const mesures = [
    { timestamp: '2026-03-01 00:00:00', consumption: 1, temp: 20 },
    { timestamp: '2026-03-01 01:00:00', consumption: 3, temp: 22 },
    { timestamp: '2026-03-02 00:00:00', consumption: 5, temp: 'n/a' },
    { timestamp: 'pas une date', consumption: 9 },
  ]

  it('énergie : cumul = somme du jour', () => {
    expect(groupMeasurementsByDay(mesures, 'energy')).toEqual([
      { day: '2026-03-01', count: 2, mean: 2, min: 1, max: 3, total: 4 },
      { day: '2026-03-02', count: 1, mean: 5, min: 5, max: 5, total: 5 },
    ])
  })
  it('puissance : cumul intégré, grandeur sans cumul : null', () => {
    expect(groupMeasurementsByDay(mesures, 'power')[0].total).toBe(2)
    expect(groupMeasurementsByDay(mesures, 'other')[0].total).toBeNull()
  })
  it('colonne additionnelle : jamais de cumul, valeurs non numériques ignorées', () => {
    expect(groupMeasurementsByDay(mesures, 'energy', 'temp')).toEqual([
      { day: '2026-03-01', count: 2, mean: 21, min: 20, max: 22, total: null },
    ])
  })
})

describe('KPIs d\'un relevé', () => {
  const releve = [0, 10, 20, 30, 40, 0].map((v, i) => ({
    timestamp: `2026-03-01 0${i}:00:00`,
    consumption: v,
    'Cos φ': 0.7,
  }))

  it('puissance : moyenne hors zéros, pic, cumul en kWh, percentiles', () => {
    const k = computeMeasurementKpis(releve, { unit: 'kW', metricLabel: 'Puissance active', quantityKind: 'power' })
    expect(k.duration).toBe('0j 5h 0min')
    expect(k.avgConsumption).toBe(25)
    expect(k.peakConsumption).toBe(40)
    expect(k.minConsumption).toBe(0)
    expect(k.totalConsumption).toBe(100)
    expect(k.totalUnit).toBe('kWh')
    expect(k.medianConsumption).toBe(15)
    expect(k.p10Consumption).toBe(0)
    expect(k.p90Consumption).toBe(35)
    expect(k.stdConsumption).toBe(16.33)
    expect(k.measurementCount).toBe(6)
    expect(k.columnStats['Cos φ']).toMatchObject({ mean: 0.7, count: 6 })
  })

  it('interprétation : seuil cos φ détecté sur la colonne additionnelle', () => {
    const k = computeMeasurementKpis(releve, { unit: 'kW', metricLabel: 'Puissance active', quantityKind: 'power' })
    expect(k.interpretation.insights).toEqual([
      'Cos φ moyen de 0.7 : en dessous de 0,8, risque de pénalité pour énergie réactive.',
    ])
    expect(k.interpretation.summary).toContain('Cumul estimé : 100 kWh.')
    expect(k.interpretation.summary).toContain('1 point(s) d\'attention détecté(s) au total.')
    expect(k.interpretation.perColumn['Cos φ']).toContain('signal stable')
  })

  it('énergie : cumul = somme ; autre grandeur : pas de cumul', () => {
    const e = computeMeasurementKpis(releve, { unit: 'Wh', metricLabel: 'Énergie', quantityKind: 'energy' })
    expect([e.totalConsumption, e.totalUnit]).toEqual([100, 'Wh'])
    const o = computeMeasurementKpis(releve, { unit: 'ppm', metricLabel: 'CO₂', quantityKind: 'other' })
    expect([o.totalConsumption, o.totalUnit]).toEqual([null, null])
  })

  it('petit échantillon : tendance non évaluée', () => {
    const k = computeMeasurementKpis(releve.slice(0, 3), { unit: 'kW', metricLabel: 'P', quantityKind: 'power' })
    expect(k.interpretation.summary).toContain('Échantillon restreint (3 point(s))')
  })

  it('aucune valeur numérique : erreur explicite', () => {
    expect(() => computeMeasurementKpis([{ timestamp: '2026-03-01 00:00:00', consumption: null }],
      { unit: 'W', metricLabel: 'P', quantityKind: 'power' })).toThrow('Aucune valeur numérique exploitable')
  })

  it('horodatage backend lu en heure locale', () => {
    const d = toDate('2026-03-01 08:30:00')
    expect([d.getHours(), d.getMinutes()]).toEqual([8, 30])
  })
})

describe('Utilitaires des modèles d\'analyse', () => {
  it('moyenne, écart-type, quantiles, MAD', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(mean([])).toBeNaN()
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
    expect(std([5])).toBe(0)
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5)
    expect(quantile([], 0.5)).toBeNaN()
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1)
  })

  it('pas d\'échantillonnage = médiane des intervalles', () => {
    expect(detectStepMs([{ t: 0 }, { t: 600 }, { t: 1200 }, { t: 5000 }])).toBe(600)
    expect(detectStepMs([{ t: 0 }])).toBe(86_400_000)
  })

  it('cumul : trapèzes pour une puissance, somme pour une énergie', () => {
    const pts = [{ t: 0, v: 2 }, { t: H, v: 4 }]
    expect(totalOf(pts, 'power')).toBe(3)
    expect(totalOf(pts, 'energy')).toBe(6)
    expect(totalOf(pts, 'other')).toBeNaN()
  })

  it('unités dérivées et date affichée', () => {
    expect(dailyUnit('W', 'power')).toBe('Wh')
    expect(dailyUnit('kWh', 'energy')).toBe('kWh')
    expect(hourlyUnit('kWh', 'energy')).toBe('kWh/h')
    expect(hourlyUnit('W', 'power')).toBe('W')
    expect(fmtDay('2026-03-01')).toBe('01/03/2026')
  })

  it('regroupement par jour avec profil horaire', () => {
    const ctx: SeriesContext = {
      label: 'Compteur', metricKey: 'consumption', metricLabel: 'Puissance', unit: 'kW', quantityKind: 'power',
      measurements: [
        { timestamp: '2026-03-01 00:00:00', consumption: 2 },
        { timestamp: '2026-03-01 00:30:00', consumption: 4 },
        { timestamp: '2026-03-01 01:00:00', consumption: 6 },
        { timestamp: '2026-03-02 00:00:00', consumption: 8 },
        { timestamp: '2026-03-02 00:30:00', consumption: 'x' },
      ],
    }
    const g = groupDays(ctx)
    expect(g.stepMs).toBe(H / 2)
    expect(g.subDaily).toBe(true)
    expect(g.days.map(d => d.day)).toEqual(['2026-03-01', '2026-03-02'])
    expect(g.days[0].daily).toBe(6) // (2 + 4 + 6) kW × 0,5 h
    expect(g.days[0].hourly.slice(0, 3)).toEqual([3, 6, null])
    expect(g.days[1].daily).toBe(4)
  })
})

describe('Tableaux empilés en sections (même règle que le backend)', () => {
  it('une colonne par section, une ligne par horodatage', () => {
    const d = desempilerSections([
      ['Phase A'], ['Temps', 'Wh'], ['01/01/2026', 1], ['02/01/2026', 2],
      ['Phase B'], ['Temps', 'Wh'], ['01/01/2026', 3], ['02/01/2026', 4],
    ])
    expect(d?.sections).toEqual(['Phase A', 'Phase B'])
    expect(d?.rows).toEqual([
      ['Temps', 'Phase A (Wh)', 'Phase B (Wh)'],
      ['01/01/2026', 1, 3],
      ['02/01/2026', 2, 4],
    ])
  })

  it('titre de la 1re section déduit de la suivante', () => {
    const d = desempilerSections([
      ['Temps', 'Wh'], ['01/01/2026', 1],
      ['Phase B'], ['Temps', 'Wh'], ['01/01/2026', 3],
    ])
    expect(d?.sections).toEqual(['Phase A', 'Phase B'])
  })

  it('tableau ordinaire laissé tel quel', () => {
    expect(desempilerSections([['Temps', 'Wh'], ['01/01/2026', 1], ['02/01/2026', 2]])).toBeNull()
  })
})
