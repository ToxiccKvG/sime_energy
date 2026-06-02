/**
 * manual-invoice-calc.ts
 * Fonctions pures pour la saisie manuelle de factures SENELEC.
 * Calculs des tranches BT, cos phi, majorations transfo, TVA, et builders ocr_data.
 */

import { BT_TRANCHE_WIDTHS, TCO_RATE_BT, TVA_RATE } from '@/constants/senelec-tariffs'
import type { TariffCategory } from '@/constants/senelec-tariffs'

// ── Redevance forfaitaires par défaut (FCFA) ─────────────────────────────────
export const REDEVANCE_DEFAULTS: Partial<Record<TariffCategory, number>> = {
  DPP: 944,
  DMP: 2283,
  PPP: 944,
  PMP: 2283,
  DGP: 15850,
  PGP: 19192,
  TCU: 16378,
  TG:  16378,
  TLU: 16378,
  HTS: 19192,
  HTG: 19192,
}

// ── Calcul NJ (nombre de jours de la période) ─────────────────────────────────
export function calcNJ(dateDebut: string, dateFin: string): number | null {
  if (!dateDebut || !dateFin) return null
  const d1 = new Date(dateDebut)
  const d2 = new Date(dateFin)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
  const nj = diff + 1
  return diff >= 0 && nj <= 95 ? nj : null
}

// ── Template A — calcul tranches BT PP ────────────────────────────────────────
export interface TranchesResult {
  t1_kwh: number; t1_montant: number
  t2_kwh: number; t2_montant: number
  t3_kwh: number; t3_montant: number
}

export function calcTranches(
  categorie: 'DPP' | 'DMP' | 'PPP' | 'PMP',
  consoTotal: number,
  nj: number,
  tarifs: [number, number, number],
  isWoyofal: boolean,
): TranchesResult {
  const [lct1, lct2] = BT_TRANCHE_WIDTHS[categorie]
  const s1 = Math.round(lct1 * nj / 60)
  const s2 = Math.round((lct1 + lct2) * nj / 60)

  const t1_kwh = Math.min(consoTotal, s1)
  const t2_kwh = Math.min(Math.max(consoTotal - s1, 0), s2 - s1)
  const t3_kwh = Math.max(consoTotal - s2, 0)

  const [r1, r2, r3] = tarifs
  // WOYOFAL : T3 facturé au tarif T2
  const t3_tarif = isWoyofal ? r2 : r3

  return {
    t1_kwh,    t1_montant: Math.round(t1_kwh * r1),
    t2_kwh,    t2_montant: Math.round(t2_kwh * r2),
    t3_kwh,    t3_montant: Math.round(t3_kwh * t3_tarif),
  }
}

// ── Template A — base de calcul TVA ──────────────────────────────────────────
// DPP/DMP : T1 et T2 exonérés — seul T3 + TCO + Redevance entrent dans la base TVA
// PPP/PMP : toute la consommation + TCO + Redevance
export function calcTVABase_BT_PP(
  categorie: 'DPP' | 'DMP' | 'PPP' | 'PMP',
  t1_m: number, t2_m: number, t3_m: number,
  tco: number, redevance: number,
): number {
  if (categorie === 'DPP' || categorie === 'DMP') {
    return t3_m + tco + redevance
  }
  return t1_m + t2_m + t3_m + tco + redevance
}

// ── Template B/C — majorations transformateur ─────────────────────────────────
export interface MajorationResult {
  ma_k1: number
  ma_k2: number
  ma_reactive: number
}

export function calcMajoration(
  conso_k1: number, conso_k2: number, conso_reactive: number,
  a: number, a_prime: number, r: number, r_prime: number,
): MajorationResult {
  return {
    ma_k1:       a > 0 ? Math.round(conso_k1 * a * (1 + a_prime)) : 0,
    ma_k2:       a > 0 ? Math.round(conso_k2 * a * (1 + 2 * a_prime)) : 0,
    ma_reactive: r > 0 ? Math.round(conso_reactive * r * (1 + r_prime)) : 0,
  }
}

// ── Template B/C — application cos phi SENELEC ────────────────────────────────
// ≥ 0.93 → Bonus (résultat négatif)  : base × (0.93/cosφ − 1)
//  < 0.85 → Malus (résultat positif) : base × (0.85/cosφ − 1)
// [0.85, 0.93[ → 0
export function calcCosphi(cosphi: number, base_fcfa: number): number {
  if (!cosphi || cosphi <= 0 || !base_fcfa) return 0
  if (cosphi >= 0.93) return Math.round(base_fcfa * (0.93 / cosphi - 1))
  if (cosphi < 0.85)  return Math.round(base_fcfa * (0.85 / cosphi - 1))
  return 0
}

// ── Template B/C — prime fixe proratisée ──────────────────────────────────────
export function calcPrimeFix(ps_kw: number, tarif_pf: number, nj: number): number {
  if (!ps_kw || !tarif_pf || !nj) return 0
  return Math.round(ps_kw * tarif_pf * (nj / 30))
}

// ── OCR data builders (compatibilité mapOcrToInvoiceData) ────────────────────

type OcrCell  = { text: string }
type OcrTable = { rows: OcrCell[][] }
type OcrPage  = { tables: OcrTable[] }

export interface OcrData {
  manual_entry: true
  forms: Array<{ Key: string; Value: string }>
  page: [OcrPage]
}

function c(v: string | number): OcrCell { return { text: String(v) } }

function pushForm(forms: OcrData['forms'], key: string, val: string | number | null | undefined) {
  const s = String(val ?? '').trim()
  if (s && s !== '0') forms.push({ Key: key, Value: s })
}

// ── Builder Template A (BT PP — tranches) ────────────────────────────────────
export interface OcrParamsA {
  conso_total: number
  date_debut: string; date_fin: string; nj: number
  tranches: Array<{ label: string; kwh: number; tarif: number; montant: number }>
  tco: number; redevance: number; tva: number
  montant_conso: number; montant_ht: number
  total_facture: number
  pmax?: number
}

export function buildOcrData_A(p: OcrParamsA): OcrData {
  const forms: OcrData['forms'] = []
  pushForm(forms, 'CONSOMMATION (KWH)', p.conso_total)
  pushForm(forms, 'Date début période', p.date_debut)
  pushForm(forms, 'Date fin période',   p.date_fin)
  pushForm(forms, 'Nombre de jours',    p.nj)
  if (p.pmax) pushForm(forms, 'Pmax relevée', p.pmax)
  pushForm(forms, 'MONTANT TOTAL HT',  p.montant_ht)
  pushForm(forms, 'TVA (18%)',          p.tva)
  if (p.tco > 0)      pushForm(forms, 'TCO (2,5%)',  p.tco)
  if (p.redevance > 0) pushForm(forms, 'REDEVANCE', p.redevance)
  pushForm(forms, 'TOTAL FACTURE', p.total_facture)

  const trancheRows = p.tranches
    .filter(t => t.kwh > 0)
    .map(t => [c(t.label), c(t.kwh), c(t.tarif.toFixed(2)), c(t.montant)])

  return {
    manual_entry: true,
    forms,
    page: [{ tables: [{ rows: trancheRows }] }],
  }
}

// ── Builder Template B/C (GP + MT + HT — K1/K2 bi-horaire) ──────────────────
export interface OcrParamsB {
  date_debut: string; date_fin: string; nj: number
  conso_k1: number; conso_k2: number; conso_total: number
  total_fact_k1: number; total_fact_k2: number; total_fact_total: number
  conso_reactive?: number; h1?: number
  ni_k1?: number; ai_k1?: number; ni_k2?: number; ai_k2?: number
  pmax?: number; cosphi?: number
  k1_tarif: number; k1_montant: number
  k2_tarif: number; k2_montant: number
  ps_kw: number; tarif_pf: number; prime_fixe: number
  pdp: number; cosphi_montant: number
  tco: number; redevance: number
  montant_ht: number; tva: number; total_facture: number
}

export function buildOcrData_B(p: OcrParamsB): OcrData {
  const forms: OcrData['forms'] = []
  pushForm(forms, 'CONSOMMATION (KWH)', p.conso_total)
  pushForm(forms, 'Date début période', p.date_debut)
  pushForm(forms, 'Date fin période',   p.date_fin)
  pushForm(forms, 'Nombre de jours',    p.nj)
  if (p.pmax)   pushForm(forms, 'Pmax relevée', p.pmax)
  if (p.cosphi) pushForm(forms, 'Cosinus phi',  p.cosphi)
  pushForm(forms, 'TOTAL FACTURE', p.total_facture)

  // Tableau facturation 4 colonnes (extractBillingTable4Col)
  const billing: OcrCell[][] = [
    [c('Montant Energie K1'),    c(p.total_fact_k1),  c(p.k1_tarif.toFixed(2)), c(p.k1_montant)],
    [c('Montant Energie K2'),    c(p.total_fact_k2),  c(p.k2_tarif.toFixed(2)), c(p.k2_montant)],
    [c('Prime Fixe Mensuelle'),  c(p.ps_kw),          c(p.tarif_pf.toFixed(2)), c(p.prime_fixe)],
  ]
  if (p.pdp > 0)
    billing.push([c('Penalite sur depassement'), c(''), c(''), c(p.pdp)])
  if (p.cosphi_montant !== 0)
    billing.push([c('Application Cos phi'), c(''), c(''), c(p.cosphi_montant)])
  if (p.tco > 0)
    billing.push([c('Taxe Communale'), c(''), c('2.5%'), c(p.tco)])
  if (p.redevance > 0)
    billing.push([c('Redevance'), c(''), c(''), c(p.redevance)])
  billing.push([c('Montant Total HT'), c(''), c(''), c(p.montant_ht)])
  billing.push([c('Montant TVA'),      c(p.montant_ht), c('18%'), c(p.tva)])
  billing.push([c('Total Facture'),    c(''), c(''), c(p.total_facture)])
  billing.push([c('Montant Total TTC'), c(''), c(''), c(p.total_facture)])

  // Matrice énergie (extractEnergyMatrix)
  const energy: OcrCell[][] = []
  if (p.ni_k1 !== undefined || p.ni_k2 !== undefined) {
    energy.push([c('Nouvel Index'), c(p.ni_k1 ?? ''), c(p.ni_k2 ?? ''), c(''), c(''), c('')])
    energy.push([c('Ancien Index'), c(p.ai_k1 ?? ''), c(p.ai_k2 ?? ''), c(''), c(''), c('')])
    energy.push([c('Consommation'), c(p.conso_k1), c(p.conso_k2), c(p.conso_total), c(p.conso_reactive ?? ''), c(p.h1 ?? '')])
    energy.push([c('Total a facturer'), c(p.total_fact_k1), c(p.total_fact_k2), c(p.total_fact_total), c(''), c('')])
  }

  const tables: OcrTable[] = [{ rows: billing }]
  if (energy.length > 0) tables.push({ rows: energy })

  return { manual_entry: true, forms, page: [{ tables }] }
}
