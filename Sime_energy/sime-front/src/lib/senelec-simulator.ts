/**
 * senelec-simulator.ts
 * Full SENELEC billing recalculation from first principles.
 * Input: ~15 fields read from a physical invoice + contract.
 * Output: complete cost cascade + delta vs declared SENELEC amount.
 *
 * Independent from billing-calculator.ts (different input model — manual vs OCR).
 */

import { calculateBTTranches } from '@/lib/billing-calculator'
import { getTariffGrid } from '@/constants/senelec-tariffs'
import type { TariffCategory, TariffYear, MTCategory } from '@/constants/senelec-tariffs'

// ─── Input ─────────────────────────────────────────────────────────────────────

export interface SimulateurInput {
  // Paramètres généraux (copied from physical invoice / contract)
  nbre_jours_cons: number           // NJ — duration of billed period
  nbre_jours_depassement?: number   // override — auto-computed as: Pmaxr > Ps ? NJ : 0
  ps_kw: number                     // Puissance souscrite (contracted)
  pmaxr_kw: number                  // Puissance max relevée (meter reading)
  taux_tco_pct: number              // default 2.5 (BT only; MT/HT = 0)
  redevance_fcfa: number            // fixed metering fee
  taux_tva_pct: number              // default 18
  montant_reel_senelec: number      // actual TTC on the paper invoice

  // Alimentation / contrat
  domaine: 'BT' | 'MT' | 'HT'
  categorie: TariffCategory
  grille_annee: TariffYear
  puissance_transfo_kva?: number
  zone_comptage?: 1 | 2

  // Consommations GP / MT / HT (Grande Puissance)
  k1_kwh?: number       // énergie HC (hors-pointe)
  k2_kwh?: number       // énergie HP (pointe)
  wr_kvarh?: number     // énergie réactive Wr
  wa_kwh?: number       // énergie active totale = K1 + K2 + MaHP + MaP
  h1_h?: number         // durée H1 (heures hors pointe + totales)
  h2_h?: number         // durée H2 (heures de pointe)

  // Consommations BT Petite / Moyenne Puissance
  conso_totale_kwh?: number

  // WOYOFAL (prepaid meter — optional)
  is_woyofal?: boolean
  montant_recharge_woyofal?: number

  // Index fields — for display / verification only (not used in energy calculation)
  ancien_index_k1?: number
  nouvel_index_k1?: number
  ancien_index_k2?: number
  nouvel_index_k2?: number
  ancien_index_reactif?: number
  nouvel_index_reactif?: number

  // Cosφ declared on bill (used as fallback when Wa/Wr not available)
  valeur_cosphi_declare?: number

  // Rappels / majorations — informational, NOT part of base-TTC recalculation
  rappel_et_majoration?: number
  rappel_k1?: number
  rappel_k2?: number
  majoration_k1?: number
  majoration_k2?: number
}

// ─── Output ────────────────────────────────────────────────────────────────────

export interface SimulateurResult {
  // BT tranches
  t1_kwh: number
  t2_kwh: number
  t3_kwh: number
  prix_t1: number
  prix_t2: number
  prix_t3: number
  montant_t1: number
  montant_t2: number
  montant_t3: number
  // GP/MT/HT K1-K2
  montant_k1: number
  montant_k2: number
  prix_k1: number
  prix_k2: number
  part_conso_k2?: number              // K2 / (K1+K2)
  part_cout_k2?: number               // Coût_K2 / (Coût_K1+Coût_K2)
  cout_moyen_pondere_ttc?: number     // 1.18×1.025×(Prix_HC×20+Prix_HP×4)/24
  // MT/HT pertes transformateur (populated only when transfo table has entry)
  ma_k1_kwh?: number                  // MaHP_K1 — pertes actives côté K1
  ma_k2_kwh?: number                  // MaP_K2 — pertes actives côté K2
  mr_kvarh?: number                   // Mr — pertes réactives
  // Énergie
  montant_energie: number
  // CosPhi
  cosphi_calcule?: number             // computed from Wa/Wr; falls back to input.valeur_cosphi_declare
  cosphi_is_bonus: boolean            // true when cosphi > 0.95 → negative (rabais)
  taux_penalite_cosphi_pct: number    // >0 = pénalité, <0 = bonus
  montant_penalite_cosphi: number     // >0 = surcoût, <0 = rabais
  // Prime fixe
  nbre_jours_depassement: number      // auto-computed: Pmaxr > Ps ? NJ : 0
  prime_fixe_base: number             // Tpf × Ps × NJ/30
  majo_depassement_ps: number         // 1.5 × Tpf × (Pmaxr-Ps) × NJ_dep/30
  prime_fixe_totale: number
  // Taxes
  base_tco: number
  montant_tco: number
  montant_ht: number
  base_tva: number
  montant_tva: number
  montant_ttc_calcule: number
  // KPIs finaux
  conso_journaliere_kwh: number       // a / NJ
  ipr_fcfa_kwh: number                // TTC_calculé / a
  // Comparison
  delta_fcfa: number                  // TTC_calculé − montant_réel (base, excl. rappels)
  delta_pct: number                   // signed delta %
  is_anomaly: boolean
  // Breakdown %
  pct_energie: number
  pct_prime_fixe: number
  pct_penalite_cosphi: number
  pct_taxes: number
}

// ─── CosPhi penalty / bonus bands ────────────────────────────────────────────
// Source: SENELEC barème facteur de puissance (CER2E)
// Zone neutre : 0.80 ≤ cosφ ≤ 0.95 → 0%
// Bonus       : cosφ ≥ 0.96 → rabais = −n × 0.75% (n = steps au-dessus de 0.95, max 5)
// Pénalité    : cosφ < 0.80 → surcoût progressif

export const COSPHI_PENALTY_BANDS: Array<{ min: number; max: number; pct: number }> = [
  { min: 0.80, max: Infinity, pct: 0  },  // zone neutre (0.80–0.95) + bonus (>0.95) géré séparément
  { min: 0.75, max: 0.80,    pct: 5  },
  { min: 0.70, max: 0.75,    pct: 10 },
  { min: 0.65, max: 0.70,    pct: 15 },
  { min: 0.60, max: 0.65,    pct: 20 },
  { min: 0.55, max: 0.60,    pct: 30 },
  { min: 0.50, max: 0.55,    pct: 40 },
  { min: 0.45, max: 0.50,    pct: 50 },
  { min: 0.40, max: 0.45,    pct: 65 },
  { min: 0,    max: 0.40,    pct: 80 },
]

// Returns signed %: positive = pénalité, negative = bonus, 0 = zone neutre
function getCosphiPenaltyPct(cosphi: number): number {
  if (!isFinite(cosphi) || cosphi <= 0) return 0
  if (cosphi >= 0.80 && cosphi <= 0.95) return 0
  if (cosphi > 0.95) {
    // Bonus: −n × 0.75% où n = steps au-dessus de 0.95, plafonné à 5
    const n = Math.min(5, Math.round((cosphi - 0.95) / 0.01))
    return -(n * 0.75)
  }
  const band = COSPHI_PENALTY_BANDS.find(b => cosphi >= b.min && cosphi < b.max)
  return band?.pct ?? 0
}

// ─── Transformer loss table (aa, ba, ar, br by transformer kVA) ──────────────
// Placeholder — values to be filled from CER2E "Données Pertes Transfo" table.
// MT calculation works without it (falls back to direct K1/K2).

export interface TransfoLossEntry {
  kva: number
  aa: number   // alpha actif
  ba: number   // bêta actif (×H1)
  ar: number   // alpha réactif
  br: number   // bêta réactif (×(H1−H2))
}

export const TRANSFO_LOSS_TABLE: TransfoLossEntry[] = [
  // { kva: 100, aa: 1.0027, ba: 0.0012, ar: 1.0250, br: 0.0250 },
  // Fill from CER2E Excel "Données Pertes transfo" sheet
]

function applyTransfoLosses(
  kva: number,
  wa_kwh: number,
  wr_kvarh: number,
  h1_h: number,
  h2_h: number,
): { wa_corr: number; wr_corr: number } {
  const entry = TRANSFO_LOSS_TABLE.find(e => e.kva === kva)
    ?? TRANSFO_LOSS_TABLE.reduce<TransfoLossEntry | null>((closest, e) =>
      !closest || Math.abs(e.kva - kva) < Math.abs(closest.kva - kva) ? e : closest,
    null)

  if (!entry) return { wa_corr: wa_kwh, wr_corr: wr_kvarh }

  return {
    wa_corr: entry.aa * wa_kwh + entry.ba * h1_h,
    wr_corr: entry.ar * wr_kvarh + entry.br * Math.max(0, h1_h - h2_h),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(n: number | null | undefined): number {
  return n != null && isFinite(n) ? n : 0
}

function pct(part: number, total: number): number {
  if (!total || !isFinite(part) || !isFinite(total)) return 0
  const v = (part / total) * 100
  return isFinite(v) ? Math.max(0, Math.min(v, 100)) : 0
}

function getCatRow(grille_annee: TariffYear, categorie: TariffCategory) {
  const tariff = getTariffGrid(grille_annee)
  if (!tariff) return undefined
  if (['TCU', 'TG', 'TLU'].includes(categorie)) return tariff.MT[categorie as MTCategory]
  if (['HTS', 'HTG'].includes(categorie)) return tariff.HT[categorie as 'HTS' | 'HTG']
  return tariff.BT[categorie as keyof typeof tariff.BT]
}

function zeroResult(montant_reel: number, threshold: number): SimulateurResult {
  return {
    t1_kwh: 0, t2_kwh: 0, t3_kwh: 0,
    prix_t1: 0, prix_t2: 0, prix_t3: 0,
    montant_t1: 0, montant_t2: 0, montant_t3: 0,
    montant_k1: 0, montant_k2: 0, prix_k1: 0, prix_k2: 0,
    montant_energie: 0,
    cosphi_is_bonus: false,
    taux_penalite_cosphi_pct: 0, montant_penalite_cosphi: 0,
    nbre_jours_depassement: 0,
    prime_fixe_base: 0, majo_depassement_ps: 0, prime_fixe_totale: 0,
    base_tco: 0, montant_tco: 0, montant_ht: 0,
    base_tva: 0, montant_tva: 0,
    montant_ttc_calcule: 0,
    conso_journaliere_kwh: 0,
    ipr_fcfa_kwh: 0,
    delta_fcfa: -montant_reel,
    delta_pct: montant_reel > 0 ? -100 : 0,
    is_anomaly: Math.abs(montant_reel) > 0,
    pct_energie: 0, pct_prime_fixe: 0, pct_penalite_cosphi: 0, pct_taxes: 0,
  }
}

// ─── Main calculator ─────────────────────────────────────────────────────────

export function runSimulateur(
  input: SimulateurInput,
  quarantine_threshold_pct = 5,
): SimulateurResult {
  const {
    nbre_jours_cons: NJ,
    ps_kw: PS,
    pmaxr_kw: Pmaxr,
    taux_tco_pct,
    redevance_fcfa: redevance,
    taux_tva_pct,
    montant_reel_senelec: montant_reel,
    domaine,
    categorie,
    grille_annee,
    puissance_transfo_kva,
  } = input

  // Auto-compute nbre_jours_depassement (override possible via input field)
  const NJ_dep = (input.nbre_jours_depassement != null && input.nbre_jours_depassement > 0)
    ? input.nbre_jours_depassement
    : (Pmaxr > PS ? NJ : 0)

  // WOYOFAL — prepaid meter: simple deduction
  if (input.is_woyofal) {
    const recharge = safe(input.montant_recharge_woyofal)
    const ttc = recharge - safe(redevance)
    const delta_fcfa = ttc - montant_reel
    const delta_pct = montant_reel > 0 ? (delta_fcfa / montant_reel) * 100 : 0
    return {
      t1_kwh: 0, t2_kwh: 0, t3_kwh: 0,
      prix_t1: 0, prix_t2: 0, prix_t3: 0,
      montant_t1: 0, montant_t2: 0, montant_t3: 0,
      montant_k1: 0, montant_k2: 0, prix_k1: 0, prix_k2: 0,
      montant_energie: recharge,
      cosphi_is_bonus: false,
      taux_penalite_cosphi_pct: 0, montant_penalite_cosphi: 0,
      nbre_jours_depassement: NJ_dep,
      prime_fixe_base: 0, majo_depassement_ps: 0, prime_fixe_totale: 0,
      base_tco: 0, montant_tco: 0, montant_ht: ttc,
      base_tva: 0, montant_tva: 0,
      montant_ttc_calcule: ttc,
      conso_journaliere_kwh: 0,
      ipr_fcfa_kwh: ttc > 0 ? ttc / (recharge || 1) : 0,
      delta_fcfa,
      delta_pct,
      is_anomaly: Math.abs(delta_pct) > quarantine_threshold_pct,
      pct_energie: 100, pct_prime_fixe: 0, pct_penalite_cosphi: 0, pct_taxes: 0,
    }
  }

  if (!NJ || !PS) return zeroResult(montant_reel, quarantine_threshold_pct)

  const cat = getCatRow(grille_annee, categorie)
  const tco_rate = domaine === 'BT' ? safe(taux_tco_pct) / 100 : 0
  const tva_rate = safe(taux_tva_pct) / 100
  const Tpf = safe(cat?.pf)

  // ── 1. Énergie ────────────────────────────────────────────────────────────

  let montant_energie = 0
  let t1_kwh = 0, t2_kwh = 0, t3_kwh = 0
  let prix_t1 = 0, prix_t2 = 0, prix_t3 = 0
  let montant_t1 = 0, montant_t2 = 0, montant_t3 = 0
  let montant_k1 = 0, montant_k2 = 0, prix_k1_ = 0, prix_k2_ = 0
  let k1_final = 0, k2_final = 0
  // Pertes transfo (exposed in result for MT/HT with table entry)
  let ma_k1: number | undefined, ma_k2: number | undefined, mr: number | undefined
  // GP/MT ratios
  let part_conso_k2: number | undefined, part_cout_k2: number | undefined
  let cout_moyen_pondere_ttc: number | undefined

  const isBTPP = ['DPP', 'DMP', 'PPP', 'PMP'].includes(categorie)
  const isGP   = ['DGP', 'PGP'].includes(categorie)
  const isMTHT = ['TCU', 'TG', 'TLU', 'HTS', 'HTG'].includes(categorie)

  if (isBTPP) {
    const conso = safe(input.conso_totale_kwh)
    if (conso > 0) {
      const tranches = calculateBTTranches(
        categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP',
        conso,
        NJ,
        grille_annee,
      )
      t1_kwh = tranches.t1_kwh
      t2_kwh = tranches.t2_kwh
      t3_kwh = tranches.t3_kwh
      montant_energie = tranches.montant_fcfa
      prix_t1 = safe(cat?.t1)
      prix_t2 = safe(cat?.t2)
      prix_t3 = safe(cat?.t3)
      montant_t1 = t1_kwh * prix_t1
      montant_t2 = t2_kwh * prix_t2
      montant_t3 = t3_kwh * prix_t3
    }
  } else if (isGP || isMTHT) {
    let k1 = safe(input.k1_kwh)
    let k2 = safe(input.k2_kwh)
    let wr = safe(input.wr_kvarh)
    let wa = safe(input.wa_kwh) || k1 + k2
    const h1 = safe(input.h1_h)
    const h2 = safe(input.h2_h)

    // Apply transformer losses if table has an entry for this kVA
    if (puissance_transfo_kva && TRANSFO_LOSS_TABLE.length > 0) {
      const { wa_corr, wr_corr } = applyTransfoLosses(puissance_transfo_kva, wa, wr, h1, h2)
      const ma_total = wa_corr - wa  // total pertes actives
      // Split Ma proportionally between K1 and K2
      if (k1 + k2 > 0) {
        ma_k1 = ma_total * k1 / (k1 + k2)
        ma_k2 = ma_total * k2 / (k1 + k2)
        k1 = k1 + ma_k1
        k2 = k2 + ma_k2
      }
      mr = wr_corr - wr
      wa = wa_corr
      wr = wr_corr
    }

    prix_k1_ = safe(cat?.k1)
    prix_k2_ = safe(cat?.k2 ?? cat?.k1)
    montant_k1 = k1 * prix_k1_
    montant_k2 = k2 * prix_k2_
    montant_energie = montant_k1 + montant_k2
    k1_final = k1
    k2_final = k2

    // GP/MT ratios
    if (k1 + k2 > 0) {
      part_conso_k2 = k2 / (k1 + k2)
      if (montant_k1 + montant_k2 > 0) {
        part_cout_k2 = montant_k2 / (montant_k1 + montant_k2)
      }
    }

    // Coût moyen pondéré TTC = 1.18 × 1.025 × (Prix_HC×20 + Prix_HP×4) / 24
    if (prix_k1_ > 0 && prix_k2_ > 0) {
      cout_moyen_pondere_ttc = 1.18 * 1.025 * (prix_k1_ * 20 + prix_k2_ * 4) / 24
    }

    // Store corrected values for cosφ calculation
    input = { ...input, wr_kvarh: wr, wa_kwh: wa }
  }

  // Active energy total for IPR / conso journalière
  const a = isBTPP
    ? safe(input.conso_totale_kwh)
    : k1_final + k2_final || safe(input.wa_kwh)

  // ── 2. CosPhi ─────────────────────────────────────────────────────────────

  let cosphi_calcule: number | undefined
  if (input.wa_kwh != null && input.wr_kvarh != null && safe(input.wa_kwh) > 0) {
    const wa = safe(input.wa_kwh)
    const wr = safe(input.wr_kvarh)
    const apparent = Math.sqrt(wa * wa + wr * wr)
    cosphi_calcule = apparent > 0 ? wa / apparent : undefined
  } else if (input.valeur_cosphi_declare != null && input.valeur_cosphi_declare > 0) {
    cosphi_calcule = input.valeur_cosphi_declare
  }

  const cosphi = cosphi_calcule
  // Signed: >0 = pénalité, <0 = bonus, 0 = zone neutre or BT/WOYOFAL
  const taux_penalite_pct = (cosphi != null && (isGP || isMTHT))
    ? getCosphiPenaltyPct(cosphi)
    : 0
  const cosphi_is_bonus = taux_penalite_pct < 0

  // ── 3. Prime fixe + Majoration dépassement PS ─────────────────────────────

  const prime_fixe_base = Tpf > 0 ? Tpf * PS * (NJ / 30) : 0

  const majo_depassement_ps = (Tpf > 0 && Pmaxr > PS && NJ_dep > 0)
    ? 1.5 * Tpf * (Pmaxr - PS) * (NJ_dep / 30)
    : 0

  const prime_fixe_totale = prime_fixe_base + majo_depassement_ps

  // ── 4. Pénalité / Bonus cosφ (énergie + prime fixe) ─────────────────────
  // Positive = surcoût (pénalité), Negative = rabais (bonus)

  const base_penalite = montant_energie + prime_fixe_totale
  const montant_penalite_cosphi = taux_penalite_pct !== 0
    ? (taux_penalite_pct / 100) * base_penalite
    : 0

  // ── 5. TCO (BT only) ──────────────────────────────────────────────────────

  const base_tco = montant_energie + prime_fixe_totale + montant_penalite_cosphi
  const montant_tco = base_tco * tco_rate

  // ── 6. Montant HT ─────────────────────────────────────────────────────────

  const montant_ht = base_tco + montant_tco + redevance

  // ── 7. TVA — base differs by type ─────────────────────────────────────────

  let base_tva: number
  if (categorie === 'DPP' || categorie === 'DMP') {
    // BT 1/2: only T3 portion drives TVA
    base_tva = prix_t3 * t3_kwh * (1 + tco_rate) + redevance
  } else if (categorie === 'PPP' || categorie === 'PMP') {
    // BT 3/4: full base_tco
    base_tva = base_tco * (1 + tco_rate) + redevance
  } else {
    // GP / MT / HT: TVA base = montant HT
    base_tva = montant_ht
  }
  const montant_tva = base_tva * tva_rate

  // ── 8. TTC + KPIs finaux ─────────────────────────────────────────────────

  const montant_ttc_calcule = montant_ht + montant_tva
  const delta_fcfa = montant_ttc_calcule - montant_reel
  const delta_pct = montant_reel > 0
    ? (delta_fcfa / montant_reel) * 100
    : 0
  const is_anomaly = Math.abs(delta_pct) > quarantine_threshold_pct

  const conso_journaliere_kwh = a > 0 && NJ > 0 ? a / NJ : 0
  const ipr_fcfa_kwh = montant_ttc_calcule > 0 && a > 0 ? montant_ttc_calcule / a : 0

  return {
    t1_kwh, t2_kwh, t3_kwh,
    prix_t1, prix_t2, prix_t3,
    montant_t1, montant_t2, montant_t3,
    montant_k1, montant_k2,
    prix_k1: prix_k1_, prix_k2: prix_k2_,
    part_conso_k2,
    part_cout_k2,
    cout_moyen_pondere_ttc,
    ma_k1_kwh: ma_k1,
    ma_k2_kwh: ma_k2,
    mr_kvarh: mr,
    montant_energie,
    cosphi_calcule,
    cosphi_is_bonus,
    taux_penalite_cosphi_pct: taux_penalite_pct,
    montant_penalite_cosphi,
    nbre_jours_depassement: NJ_dep,
    prime_fixe_base,
    majo_depassement_ps,
    prime_fixe_totale,
    base_tco,
    montant_tco,
    montant_ht,
    base_tva,
    montant_tva,
    montant_ttc_calcule,
    conso_journaliere_kwh,
    ipr_fcfa_kwh,
    delta_fcfa,
    delta_pct,
    is_anomaly,
    pct_energie:          pct(montant_energie,          montant_ttc_calcule),
    pct_prime_fixe:       pct(prime_fixe_totale,        montant_ttc_calcule),
    pct_penalite_cosphi:  pct(Math.abs(montant_penalite_cosphi), montant_ttc_calcule),
    pct_taxes:            pct(montant_tco + montant_tva + redevance, montant_ttc_calcule),
  }
}
