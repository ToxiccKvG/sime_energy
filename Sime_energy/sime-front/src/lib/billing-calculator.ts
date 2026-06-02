import {
  getTariffGrid,
  PEAK_HOURS,
  PEAK_HOURS_PER_DAY,
  OFF_PEAK_HOURS_PER_DAY,
  COSPHI_DEFAULT_TRANSFO,
  MT_TARIFF_THRESHOLDS,
  BT_TRANCHE_WIDTHS,
} from '@/constants/senelec-tariffs'
import type { TariffCategory, TariffYear, MTCategory } from '@/constants/senelec-tariffs'
import type { BillingParams, InvoiceData, BillingKPIs } from '@/types/billing'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(n: number | null | undefined): number {
  return (n != null && isFinite(n)) ? n : 0
}

function pct(part: number, total: number): number {
  if (!total || !isFinite(part) || !isFinite(total)) return 0
  const v = (part / total) * 100
  return isFinite(v) && v >= 0 && v <= 10000 ? v : 0
}

/** Récupère la ligne tarifaire pour une catégorie et une grille données */
function getCatRow(grille_annee: TariffYear, categorie: TariffCategory) {
  const tariff = getTariffGrid(grille_annee)
  if (!tariff) return undefined
  if (['TCU', 'TG', 'TLU'].includes(categorie)) {
    return tariff.MT[categorie as MTCategory]
  }
  if (['HTS', 'HTG'].includes(categorie)) {
    return tariff.HT[categorie as 'HTS' | 'HTG']
  }
  return tariff.BT[categorie as keyof typeof tariff.BT]
}

/** Vérifie si les données tarifaires sont disponibles pour une catégorie MT/HT */
function isTariffAvailable(grille_annee: TariffYear, categorie: TariffCategory): boolean {
  if (['DPP', 'DMP', 'PPP', 'PMP', 'DGP', 'PGP'].includes(categorie)) return true
  const cat = getCatRow(grille_annee, categorie)
  if (!cat) return false
  return cat.k1 != null || (cat as { t1?: number | null }).t1 != null
}

// ─── Calcul des tranches BT (Petite Puissance) ───────────────────────────────

export function calculateBTTranches(
  categorie: 'DPP' | 'DMP' | 'PPP' | 'PMP',
  conso_total_kwh: number,
  periode_jours: number,
  grille_annee: TariffYear,
): { t1_kwh: number; t2_kwh: number; t3_kwh: number; montant_fcfa: number } {
  const [LCT1, LCT2] = BT_TRANCHE_WIDTHS[categorie]
  const NJ = periode_jours

  const seuil1 = LCT1 * NJ / 60
  const seuil2 = (LCT1 + LCT2) * NJ / 60

  let t1 = 0, t2 = 0, t3 = 0
  if (conso_total_kwh <= seuil1) {
    t1 = conso_total_kwh
  } else if (conso_total_kwh <= seuil2) {
    t1 = seuil1
    t2 = conso_total_kwh - seuil1
  } else {
    t1 = seuil1
    t2 = seuil2 - seuil1
    t3 = conso_total_kwh - seuil2
  }

  const cat = getCatRow(grille_annee, categorie)
  const montant = t1 * safe(cat?.t1) + t2 * safe(cat?.t2) + t3 * safe(cat?.t3)

  return { t1_kwh: t1, t2_kwh: t2, t3_kwh: t3, montant_fcfa: montant }
}

// ─── Conversion mesures → énergie (MODULE 3) ─────────────────────────────────

export function convertPowerToEnergy(
  power_watts: number,
  intervalle_minutes: 1 | 5 | 10 | 15 | 30,
): number {
  return (power_watts * (intervalle_minutes / 60)) / 1000
}

export function sumMeasurements(
  measures: Array<{ power_w: number; timestamp: Date }>,
  intervalle_minutes: number,
): { total_kwh: number; peak_kw: number; k1_kwh: number; k2_kwh: number } {
  let total = 0, peak = 0, k1 = 0, k2 = 0

  for (const m of measures) {
    const kwh = convertPowerToEnergy(m.power_w, intervalle_minutes as 1 | 5 | 10 | 15 | 30)
    total += kwh
    if (m.power_w / 1000 > peak) peak = m.power_w / 1000

    const hour = m.timestamp.getHours()
    if (hour >= PEAK_HOURS.start && hour < PEAK_HOURS.end) {
      k2 += kwh
    } else {
      k1 += kwh
    }
  }

  return { total_kwh: total, peak_kw: peak, k1_kwh: k1, k2_kwh: k2 }
}

// ─── Moteur principal — 17 KPIs ──────────────────────────────────────────────

export function calculateBillingKPIs(
  params: BillingParams,
  invoice: InvoiceData,
): BillingKPIs {
  const {
    categorie,
    grille_annee,
    puissance_souscrite_kw: PS,
    periode_jours: NJ,
  } = params

  const conso     = invoice.conso_kwh_total
  const MTTC      = invoice.montant_ttc
  const Pmax      = invoice.puissance_max_kw

  // ── Garde-fou division par zéro ──
  if (!conso || !NJ || !PS) {
    return zeroKpis()
  }

  // ── Détection grille MT/HT indisponible ──
  if (!isTariffAvailable(grille_annee, categorie)) {
    return { ...zeroKpis(), mt_tarif_indisponible: true }
  }

  // ── 1. Normalisation temporelle ──
  const conso_journaliere = conso / NJ
  const conso_annuelle    = conso * 365 / NJ
  const cout_journalier   = MTTC / NJ
  const cout_annuel       = MTTC * 365 / NJ

  // ── 2. Coûts unitaires ──
  const cat = getCatRow(grille_annee, categorie)

  // Cm = coût moyen pondéré (20h hors pointe + 4h pointe)
  // Pour PP (pas de K1/K2) → moyenne des 3 tranches
  let prix_k1: number
  let prix_k2: number
  if (cat?.k1 != null) {
    prix_k1 = safe(cat.k1)
    prix_k2 = safe(cat.k2 ?? cat.k1)
  } else {
    const avg = (safe(cat?.t1) + safe(cat?.t2) + safe(cat?.t3)) / 3
    prix_k1 = avg
    prix_k2 = avg
  }
  const cm = (prix_k1 * OFF_PEAK_HOURS_PER_DAY + prix_k2 * PEAK_HOURS_PER_DAY) / 24

  const ipr              = MTTC / conso
  const surcout_kwh      = ipr - cm
  const surcout_monetaire = surcout_kwh * conso

  // ── 3. Indicateurs puissance ──
  const taux_charge_transfo = (params.has_transformateur && params.puissance_transfo_kva && Pmax)
    ? ((Pmax / COSPHI_DEFAULT_TRANSFO) / params.puissance_transfo_kva) * 100
    : undefined

  const facteur_utilisation = Pmax
    ? (conso_journaliere / (Pmax * 24)) * 100
    : 0

  const nb_heures = conso_annuelle / PS

  const choix_tarif_optimal: MTCategory | null = (['TCU', 'TG', 'TLU'] as string[]).includes(categorie)
    ? nb_heures < MT_TARIFF_THRESHOLDS.TCU_max ? 'TCU'
      : nb_heures < MT_TARIFF_THRESHOLDS.TG_max ? 'TG' : 'TLU'
    : null

  // pf_unitaire : prime fixe tarifaire par kW×mois — utilisé ici ET dans optimisation
  const pf_unitaire = safe(cat?.pf)

  // ── 4. Répartition facture ──
  // Énergie : OCR en priorité, sinon reconstruction depuis tranches (PP) ou K1+K2 (GP/MT)
  let montant_energie = safe(invoice.montant_energie)
  let energie_reconstructed = false
  if (!montant_energie && ['DPP', 'DMP', 'PPP', 'PMP'].includes(categorie)) {
    montant_energie = calculateBTTranches(
      categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP',
      conso, NJ, grille_annee,
    ).montant_fcfa
    energie_reconstructed = true
  } else if (!montant_energie && cat?.k1 != null) {
    // GP/MT : K1×prix_k1 + K2×prix_k2 si conso split disponible
    const k1 = safe(invoice.conso_k1_kwh)
    const k2 = safe(invoice.conso_k2_kwh)
    if (k1 + k2 > 0) {
      montant_energie = k1 * prix_k1 + k2 * prix_k2
      energie_reconstructed = true
    }
  }

  // Prime fixe : OCR en priorité, sinon tarif × PS × NJ/30 (si cat a un pf)
  let PF = safe(invoice.montant_prime_fixe)
  let pf_reconstructed = false
  if (!PF && pf_unitaire > 0) {
    PF = pf_unitaire * PS * (NJ / 30)
    pf_reconstructed = true
  }

  const PDP               = safe(invoice.montant_pdp)
  const penalite_cosphi   = safe(invoice.montant_cosphi)
  const TVA               = safe(invoice.montant_tva)
  const TCO               = safe(invoice.montant_tco)
  const redevance         = safe(invoice.montant_redevance)

  // Résidu : part du MTTC non attribuée (TVA/TCO/redevance absents OCR + arrondis)
  const total_identifie = montant_energie + PF + PDP + penalite_cosphi + TVA + TCO + redevance
  const residuel = Math.max(0, MTTC - total_identifie)

  // ── 5. Optimisation ──
  // Scénario strict : PS réduit à Pmax exactement
  const ps_strict   = Pmax ?? PS
  const economie_ps = PS > ps_strict
    ? (PS - ps_strict) * pf_unitaire * (NJ / 30)
    : 0

  // Scénario prudent : PS réduit à Pmax × 1.1 (marge de sécurité 10%)
  const ps_prudent         = Pmax ? Pmax * 1.1 : PS
  const economie_ps_prudent = PS > ps_prudent
    ? (PS - ps_prudent) * pf_unitaire * (NJ / 30)
    : 0

  const economie_cosphi   = penalite_cosphi > 0 ? penalite_cosphi : 0
  const economie_totale   = economie_ps + economie_cosphi
  const economie_annuelle = economie_totale * 365 / NJ
  const nouveau_mttc      = Math.max(0, MTTC - economie_totale)

  return {
    conso_journaliere_kwh:    conso_journaliere,
    conso_annuelle_kwh:       conso_annuelle,
    cout_journalier_fcfa:     cout_journalier,
    cout_annuel_fcfa:         cout_annuel,
    cm_fcfa_kwh:              cm,
    ipr_fcfa_kwh:             ipr,
    surcout_kwh_fcfa:         surcout_kwh,
    surcout_monetaire_fcfa:   surcout_monetaire,
    taux_charge_transfo_pct:  taux_charge_transfo,
    facteur_utilisation_pct:  facteur_utilisation,
    nb_heures_utilisation:    nb_heures,
    // Pourcentages répartition
    pct_energie:              pct(montant_energie, MTTC),
    pct_prime_fixe:           pct(PF, MTTC),
    pct_prime_fixe_pdp:       pct(PF + PDP, MTTC),
    pct_pdp:                  pct(PDP, MTTC),
    pct_cosphi:               pct(penalite_cosphi, MTTC),
    pct_redevance:            pct(redevance, MTTC),
    pct_taxes:                pct(TVA + TCO, MTTC),
    pct_surcouts:             pct(PF + PDP + penalite_cosphi, MTTC),
    pct_residuel:             pct(residuel, MTTC),
    // Montants absolus FCFA
    montant_energie_calc:     montant_energie,
    montant_pf_calc:          PF,
    montant_pdp_fcfa:         PDP,
    montant_redevance_fcfa:   redevance,
    montant_taxes_fcfa:       TVA + TCO,
    montant_residuel_fcfa:    residuel,
    // Sources
    energie_reconstructed,
    pf_reconstructed,
    choix_tarif_optimal,
    economie_ps_fcfa:         economie_ps,
    economie_ps_prudent_fcfa: economie_ps_prudent,
    economie_cosphi_fcfa:     economie_cosphi,
    economie_totale_fcfa:     economie_totale,
    economie_annuelle_fcfa:   economie_annuelle,
    nouveau_mttc_fcfa:        nouveau_mttc,
  }
}

function zeroKpis(): BillingKPIs {
  return {
    conso_journaliere_kwh: 0, conso_annuelle_kwh: 0, cout_journalier_fcfa: 0, cout_annuel_fcfa: 0,
    cm_fcfa_kwh: 0, ipr_fcfa_kwh: 0, surcout_kwh_fcfa: 0, surcout_monetaire_fcfa: 0,
    facteur_utilisation_pct: 0, nb_heures_utilisation: 0,
    pct_energie: 0, pct_prime_fixe: 0, pct_prime_fixe_pdp: 0, pct_pdp: 0,
    pct_cosphi: 0, pct_redevance: 0, pct_taxes: 0, pct_surcouts: 0, pct_residuel: 0,
    montant_energie_calc: 0, montant_pf_calc: 0, montant_pdp_fcfa: 0,
    montant_redevance_fcfa: 0, montant_taxes_fcfa: 0, montant_residuel_fcfa: 0,
    energie_reconstructed: false, pf_reconstructed: false,
    choix_tarif_optimal: null,
    economie_ps_fcfa: 0, economie_ps_prudent_fcfa: 0, economie_cosphi_fcfa: 0,
    economie_totale_fcfa: 0, economie_annuelle_fcfa: 0, nouveau_mttc_fcfa: 0,
  }
}
