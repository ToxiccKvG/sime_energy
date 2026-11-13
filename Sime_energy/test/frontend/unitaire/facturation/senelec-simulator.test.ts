import { describe, it, expect } from 'vitest'
import { runSimulateur, type SimulateurInput } from '@/lib/senelec-simulator'

// Règles de référence validées (2026-10-19) :
//   prime fixe = Tpf × PS × NJ/30
//   PDP        = 1,5 × Tpf × (Pmax − PS) × NJ/30
//   cos φ      : neutre 0,80–0,95, pénalité par paliers, bonus −0,75 % par centième au-dessus de 0,95 (max 5)

const BASE: SimulateurInput = {
  nbre_jours_cons: 30,
  ps_kw: 100,
  pmaxr_kw: 120,
  taux_tco_pct: 2.5,
  redevance_fcfa: 16_378,
  taux_tva_pct: 18,
  montant_reel_senelec: 0,
  domaine: 'MT',
  categorie: 'TG',
  grille_annee: 2023,
  k1_kwh: 20_000,
  k2_kwh: 4_000,
  wr_kvarh: 11_000,   // cos φ ≈ 0,91 → zone neutre
}

/** Énergie réactive donnant le cos φ voulu pour Wa = K1 + K2 = 24 000 kWh */
const wrPour = (cosphi: number) => 24_000 * Math.tan(Math.acos(cosphi))

// TG 2023 : pf 4 093,60 / k1 111,91 / k2 184,65
const TPF = 4093.6

describe('Simulateur — MT (TG 2023)', () => {
  const r = runSimulateur(BASE)

  it('énergie = K1 × prix K1 + K2 × prix K2', () => {
    expect(r.montant_energie).toBeCloseTo(20_000 * 111.91 + 4_000 * 184.65, 6)
  })

  it('prime fixe = Tpf × PS × NJ/30', () => {
    expect(r.prime_fixe_base).toBeCloseTo(TPF * 100 * 30 / 30, 6)
  })

  it('PDP = 1,5 × Tpf × (Pmax − PS) × NJ/30', () => {
    expect(r.nbre_jours_depassement).toBe(30)
    expect(r.majo_depassement_ps).toBeCloseTo(1.5 * TPF * 20 * 30 / 30, 6)
  })

  it('pas de TCO en MT, TVA sur le HT', () => {
    expect(r.montant_tco).toBe(0)
    const ht = r.montant_energie + r.prime_fixe_totale + 16_378
    expect(r.montant_ht).toBeCloseTo(ht, 6)
    expect(r.montant_tva).toBeCloseTo(ht * 0.18, 6)
    expect(r.montant_ttc_calcule).toBeCloseTo(ht * 1.18, 6)
  })

  it('aucun dépassement → pas de PDP', () => {
    const s = runSimulateur({ ...BASE, pmaxr_kw: 90 })
    expect(s.nbre_jours_depassement).toBe(0)
    expect(s.majo_depassement_ps).toBe(0)
  })
})

describe('Simulateur — barème cos φ', () => {
  const base = { ...BASE, pmaxr_kw: 100 }
  const taux = (cosphi: number) => runSimulateur({ ...base, wr_kvarh: wrPour(cosphi) }).taux_penalite_cosphi_pct

  it.each([
    [0.81, 0], [0.90, 0], [0.94, 0],
    [0.78, 5], [0.72, 10], [0.66, 15], [0.62, 20], [0.57, 30], [0.52, 40], [0.47, 50], [0.42, 65], [0.30, 80],
    [0.96, -0.75], [0.97, -1.5], [0.99, -3], [1.0, -3.75],
  ])('cos φ = %s → %s %%', (cosphi, attendu) => {
    expect(taux(cosphi)).toBeCloseTo(attendu, 6)
  })

  it('la pénalité s’applique à (énergie + prime fixe)', () => {
    const s = runSimulateur({ ...base, wr_kvarh: wrPour(0.78) })
    expect(s.montant_penalite_cosphi).toBeCloseTo(0.05 * (s.montant_energie + s.prime_fixe_totale), 6)
  })

  it('sans énergie réactive sur la facture, le cos φ déclaré est utilisé', () => {
    const s = runSimulateur({ ...base, wr_kvarh: undefined, valeur_cosphi_declare: 0.78 })
    expect(s.cosphi_calcule).toBe(0.78)
    expect(s.taux_penalite_cosphi_pct).toBe(5)
  })

  it('sans énergie réactive ni cos φ déclaré, aucun bonus n’est inventé', () => {
    const s = runSimulateur({ ...base, wr_kvarh: undefined })
    expect(s.taux_penalite_cosphi_pct).toBe(0)
  })

  it('pas de cos φ en BT petite puissance', () => {
    const s = runSimulateur({ ...base, domaine: 'BT', categorie: 'DPP', conso_totale_kwh: 300, valeur_cosphi_declare: 0.5 })
    expect(s.taux_penalite_cosphi_pct).toBe(0)
  })
})

describe('Simulateur — BT DPP 2023 (300 kWh / 60 j)', () => {
  const r = runSimulateur({
    nbre_jours_cons: 60, ps_kw: 6, pmaxr_kw: 4, taux_tco_pct: 2.5, redevance_fcfa: 944, taux_tva_pct: 18,
    montant_reel_senelec: 0, domaine: 'BT', categorie: 'DPP', grille_annee: 2023, conso_totale_kwh: 300,
  })
  const energie = 150 * 91.17 + 100 * 136.49 + 50 * 159.36

  it('tranches et énergie', () => {
    expect([r.t1_kwh, r.t2_kwh, r.t3_kwh]).toEqual([150, 100, 50])
    expect(r.montant_energie).toBeCloseTo(energie, 6)
  })

  it('TCO 2,5 % sur l’énergie', () => {
    expect(r.montant_tco).toBeCloseTo(energie * 0.025, 6)
  })

  it('TVA DPP : seule la tranche 3 (+ TCO) et la redevance entrent dans la base', () => {
    expect(r.base_tva).toBeCloseTo(159.36 * 50 * 1.025 + 944, 6)
    expect(r.montant_ttc_calcule).toBeCloseTo(energie * 1.025 + 944 + (159.36 * 50 * 1.025 + 944) * 0.18, 6)
  })
})

describe('Simulateur — comparaison au montant réel', () => {
  it('écart > seuil → anomalie (quarantaine)', () => {
    const ttc = runSimulateur(BASE).montant_ttc_calcule
    const s = runSimulateur({ ...BASE, montant_reel_senelec: ttc * 0.9 })
    expect(s.delta_pct).toBeCloseTo((ttc - ttc * 0.9) / (ttc * 0.9) * 100, 6)
    expect(s.is_anomaly).toBe(true)
    expect(runSimulateur({ ...BASE, montant_reel_senelec: ttc * 0.99 }).is_anomaly).toBe(false)
  })

  it('WOYOFAL : TTC = recharge − redevance', () => {
    const s = runSimulateur({ ...BASE, is_woyofal: true, montant_recharge_woyofal: 20_000, redevance_fcfa: 944, montant_reel_senelec: 19_056 })
    expect(s.montant_ttc_calcule).toBe(19_056)
    expect(s.is_anomaly).toBe(false)
  })

  it('NJ ou PS nul → résultat vide', () => {
    expect(runSimulateur({ ...BASE, nbre_jours_cons: 0, montant_reel_senelec: 1000 }).montant_ttc_calcule).toBe(0)
  })
})
