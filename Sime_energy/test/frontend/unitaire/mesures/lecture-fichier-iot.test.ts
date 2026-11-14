// Lecture d'un fichier quelconque dans l'IOT (lib/iot-lecture-fichier.ts) :
// en-tête, ligne d'unités, rôle de chaque colonne, conversion en lignes ShellyRow.
// Tests de caractérisation : ils figent les résultats actuels avant le nettoyage du code.
import { describe, it, expect } from 'vitest'
import { appliquerLecture, lireTableau, proposerLecture } from '@/lib/iot-lecture-fichier'

function lire(brut: unknown[][], nom = 'compteur.csv') {
  const t = lireTableau(brut)
  return { t, lecture: proposerLecture(t.columns, t.rows, t.unites, t.preambule, nom) }
}

describe('Tableau : préambule, en-tête, unités', () => {
  it('en-tête juste au-dessus des données, préambule conservé', () => {
    const t = lireTableau([
      ['Analyseur CA 8335'],
      ['N° série', 'X123'],
      [],
      ['Date', 'P total', 'Fréquence'],
      ['01/03/2026 08:00', '1200', '50'],
      ['01/03/2026 08:10', '1300', '50,1'],
      ['01/03/2026 08:20', '1250', '49,9'],
    ])
    expect(t.columns).toEqual(['Date', 'P total', 'Fréquence'])
    expect(t.rows).toHaveLength(3)
    expect(t.preambule).toEqual(['Analyseur CA 8335', 'N° série X123'])
    expect(t.unites).toEqual({})
  })

  it('ligne d\'unités sous l\'en-tête', () => {
    const t = lireTableau([
      ['Appareil'],
      ['Date', 'P', 'F'],
      ['', 'kW', 'Hz'],
      ['01/03/2026 08:00', '1,2', '50'],
      ['01/03/2026 08:10', '1,3', '50'],
      ['01/03/2026 08:20', '1,4', '50'],
    ])
    expect(t.unites).toEqual({ P: 'kW', F: 'Hz' })
    expect(t.rows[0]).toEqual({ Date: '01/03/2026 08:00', P: '1,2', F: '50' })
  })

  it('colonnes en double numérotées, pas d\'en-tête → col_n', () => {
    expect(lireTableau([['Date', 'V', 'V'], ['01/03/2026', '1', '2'], ['02/03/2026', '1', '2'], ['03/03/2026', '1', '2']]).columns)
      .toEqual(['Date', 'V', 'V (2)'])
    expect(lireTableau([['01/03/2026', '1'], ['02/03/2026', '2'], ['03/03/2026', '3']]).columns)
      .toEqual(['col_1', 'col_2'])
  })

  it('tableau vide', () => {
    expect(lireTableau([[], ['', null]])).toEqual({ columns: [], rows: [], unites: {}, preambule: [] })
  })
})

describe('Proposition de lecture', () => {
  it('énergie par phase et total, puissance, grandeur, colonnes ignorées', () => {
    const { lecture } = lire([
      ['N°', 'Temps', 'Phase A (Wh)', 'Total (Wh)', 'Retour Total (Wh)', 'P (kW)', 'T (°C)', 'Etat', 'Vide'],
      ['1', '01/03/2026 08:00', '10', '30', '0', '1,5', '25', 'on', ''],
      ['2', '01/03/2026 09:00', '12', '36', '1', '1,6', '26', 'on', ''],
      ['3', '01/03/2026 10:00', '11', '33', '0', '1,4', '27', 'off', ''],
    ])
    expect(lecture.colDate).toBe('Temps')
    expect(lecture.sens).toBe('consommation')
    expect(lecture.ordreDates).toBe('jma')
    const role = Object.fromEntries(lecture.colonnes.map(c => [c.col, [c.role, c.unite, c.phase ?? null, c.motif ?? null]]))
    expect(role).toEqual({
      'N°': ['ignorer', '', null, 'numéro de ligne'],
      'Phase A (Wh)': ['energie', 'Wh', 'A', null],
      'Total (Wh)': ['energie', 'Wh', null, null],
      'Retour Total (Wh)': ['retour', 'Wh', null, null],
      'P (kW)': ['puissance', 'kW', null, null],
      'T (°C)': ['grandeur', '°C', null, null],
      Etat: ['ignorer', '', null, 'texte'],
      Vide: ['ignorer', '', null, 'vide'],
    })
  })

  it('fichier de production PV reconnu à son nom', () => {
    const { lecture } = lire([
      ['Date', 'Puissance (kW)'], ['01/03/2026 10:00', '2'], ['01/03/2026 10:15', '3'], ['01/03/2026 10:30', '4'],
    ], 'sunny-portal-onduleur.csv')
    expect(lecture.sens).toBe('production')
  })

  it('dates mois/jour reconnues', () => {
    const { lecture } = lire([
      ['Date', 'E (kWh)'], ['03/13/2026', '1'], ['03/14/2026', '2'], ['03/15/2026', '3'],
    ])
    expect(lecture.ordreDates).toBe('mja')
  })
})

describe('Application de la lecture', () => {
  it('énergie en Wh → kWh, puissance déduite du pas horaire', () => {
    const { t, lecture } = lire([
      ['Temps', 'Total (Wh)', 'T (°C)'],
      ['01/03/2026 08:00', '1000', '25'],
      ['01/03/2026 09:00', '2000', '26'],
      ['01/03/2026 10:00', '1500', '27'],
    ])
    const r = appliquerLecture(t.rows, lecture, [])
    expect(r.pasSecondes).toBe(3600)
    expect(r.energieDeduite).toBe(false)
    expect(r.dateIllisibles).toBe(0)
    expect(r.rows.map(x => x.kwhTotal)).toEqual([1, 2, 1.5])
    expect(r.rows.map(x => x.puissKwTotal)).toEqual([1, 2, 1.5])
    expect(r.rows[0].date).toEqual(new Date(2026, 2, 1, 8, 0, 0))
    expect(r.rows[1].grandeurs).toEqual({ 'T (°C)': 26 })
  })

  it('puissance seule → énergie = P × pas', () => {
    const { t, lecture } = lire([
      ['Date', 'Puissance (kW)'],
      ['01/03/2026 10:00', '2'], ['01/03/2026 10:15', '4'], ['01/03/2026 10:30', '-1'],
    ])
    const r = appliquerLecture(t.rows, lecture, [])
    expect(r.energieDeduite).toBe(true)
    expect(r.pasSecondes).toBe(900)
    expect(r.rows.map(x => x.kwhTotal)).toEqual([0.5, 1, 0])
  })

  it('compteur cumulatif : écarts entre index successifs', () => {
    const { t, lecture } = lire([
      ['Date', 'Index (kWh)'],
      ...[1000, 1001, 1003, 1006, 1010, 1015].map((v, i) => [`01/03/2026 0${i}:00`, String(v)]),
    ])
    expect(lecture.colonnes[0]).toMatchObject({ role: 'energie', cumul: true, unite: 'kWh' })
    const r = appliquerLecture(t.rows, lecture, [])
    expect(r.rows.map(x => x.kwhTotal)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('lignes sans date comptées comme illisibles, marqueurs de section non', () => {
    const { t, lecture } = lire([
      ['Temps', 'Total (Wh)'],
      ['01/03/2026 08:00', '1000'], ['01/03/2026 09:00', '1000'], ['01/03/2026 10:00', '1000'],
      ['Temps', 'Wh'], ['???', '5'],
    ])
    expect(appliquerLecture(t.rows, lecture, []).dateIllisibles).toBe(1)
  })
})
