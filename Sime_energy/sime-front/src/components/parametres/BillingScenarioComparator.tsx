import React, { useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  GitCompare, TrendingDown, TrendingUp, Minus, AlertTriangle,
  BarChart3, Zap, Settings2, Activity, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import {
  getTariffGrid,
  getAvailableTariffYears,
  BT_TRANCHE_WIDTHS,
  OFF_PEAK_HOURS_PER_DAY,
  PEAK_HOURS_PER_DAY,
} from '@/constants/senelec-tariffs'
import type { TariffYear, TariffCategory, MTCategory } from '@/constants/senelec-tariffs'
import { calculateBillingKPIs } from '@/lib/billing-calculator'
import type { BillingParams, InvoiceData, BillingKPIs } from '@/types/billing'
import { BillingPieChart, type PieSegment } from '@/components/parametres/BillingPieChart'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Thresholds {
  k2_seuil_pct: number
  ps_seuil_pct: number
  cosphi_seuil: number
}

interface Props {
  currentParams: BillingParams
  invoiceData: InvoiceData
  thresholds?: Thresholds
  disabled?: boolean
}

interface ScenarioBuild {
  invoice: InvoiceData
  mttc:    number
}

// ─── Reconstruction du MTTC synthétique pour une autre grille ────────────────

const safe = (n: number | null | undefined) => (n != null && isFinite(n) ? n : 0)

function getRow(year: TariffYear, cat: TariffCategory) {
  const grid = getTariffGrid(year)
  if (!grid) return null
  if (['TCU', 'TG', 'TLU'].includes(cat)) return grid.MT[cat as MTCategory]
  if (['HTS', 'HTG'].includes(cat))       return grid.HT[cat as 'HTS' | 'HTG']
  return grid.BT[cat as keyof typeof grid.BT]
}

const BT_PP  = new Set(['DPP', 'DMP', 'PPP', 'PMP'])
const BT_ALL = new Set(['DPP', 'DMP', 'PPP', 'PMP', 'DGP', 'PGP'])

function buildSyntheticInvoice(
  orig: InvoiceData,
  params: BillingParams,
  year: TariffYear,
): ScenarioBuild | null {
  const { categorie, puissance_souscrite_kw: PS, periode_jours: NJ } = params
  const conso = orig.conso_kwh_total
  const row   = getRow(year, categorie)
  if (!row) return null

  let energie = 0
  if (BT_PP.has(categorie)) {
    const [LCT1, LCT2] = BT_TRANCHE_WIDTHS[categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP']
    const s1 = LCT1 * NJ / 60
    const s2 = (LCT1 + LCT2) * NJ / 60
    let t1 = 0, t2 = 0, t3 = 0
    if (conso <= s1)        { t1 = conso }
    else if (conso <= s2)   { t1 = s1; t2 = conso - s1 }
    else                    { t1 = s1; t2 = s2 - s1; t3 = conso - s2 }
    energie = t1 * safe((row as any).t1) + t2 * safe((row as any).t2) + t3 * safe((row as any).t3)
  } else {
    const k1 = safe(orig.conso_k1_kwh)
    const k2 = safe(orig.conso_k2_kwh)
    const prixK1 = safe((row as any).k1)
    const prixK2 = safe((row as any).k2 ?? (row as any).k1)
    if (k1 + k2 > 0) {
      energie = k1 * prixK1 + k2 * prixK2
    } else {
      const cm = (prixK1 * OFF_PEAK_HOURS_PER_DAY + prixK2 * PEAK_HOURS_PER_DAY) / 24
      energie = cm * conso
    }
  }
  if (!energie) return null

  const pf_unitaire = safe((row as any).pf)
  const pf = pf_unitaire > 0 ? pf_unitaire * PS * (NJ / 30) : 0

  const cosphi    = safe(orig.montant_cosphi)
  const pdp       = safe(orig.montant_pdp)
  const redevance = safe(orig.montant_redevance)

  const taxBase = energie + pf
  const tva     = params.tva_applicable !== false ? taxBase * 0.18 : 0
  const tco     = (params.tco_applicable !== false && BT_ALL.has(categorie)) ? taxBase * 0.025 : 0

  const mttc = energie + pf + cosphi + pdp + redevance + tva + tco

  return {
    invoice: {
      ...orig,
      montant_energie:    energie,
      montant_prime_fixe: pf,
      montant_tva:        tva,
      montant_tco:        tco,
      montant_ttc:        mttc,
    },
    mttc,
  }
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

const YEAR_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  2017: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300'   },
  2019: { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-300'    },
  2023: { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-300'  },
  2026: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300' },
}
const yearStyle = (y: number) =>
  YEAR_COLORS[y] ?? { bg: 'bg-slate-800/40', border: 'border-slate-700', text: 'text-slate-300' }

function DeltaChip({ curr, baseline, alertOnIncrease = true }: {
  curr: number; baseline: number; alertOnIncrease?: boolean
}) {
  if (!baseline || !isFinite(baseline) || !isFinite(curr)) return null
  const pct = ((curr - baseline) / Math.abs(baseline)) * 100
  if (Math.abs(pct) < 0.1) {
    return <span className="text-[9px] text-slate-600 font-mono">≈</span>
  }
  const up = pct > 0
  const isAlert = alertOnIncrease ? up : !up
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums',
      isAlert ? 'text-red-400' : 'text-emerald-400',
    )}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

interface SimMetric {
  label:    string
  value:    string
  unit?:    string
  refValue?: number       // current grid's value for delta computation
  currValue?: number      // simulated value (raw number for delta)
  alertOnIncrease?: boolean
  alert?:   boolean
  good?:    boolean
  missing?: boolean
}

function SimMetricBlock({ title, accent, icon, metrics }: {
  title:   string
  accent:  'blue' | 'amber' | 'violet' | 'emerald'
  icon:    React.ReactNode
  metrics: SimMetric[]
}) {
  const accentMap = {
    blue:    { border: 'border-blue-500/20',    title: 'text-blue-300'    },
    amber:   { border: 'border-amber-500/20',   title: 'text-amber-300'   },
    violet:  { border: 'border-violet-500/20',  title: 'text-violet-300'  },
    emerald: { border: 'border-emerald-500/20', title: 'text-emerald-300' },
  }[accent]

  return (
    <div className={cn('rounded-xl border bg-[#0d1018] p-4', accentMap.border)}>
      <div className="flex items-center gap-2 mb-3">
        <span className="opacity-60">{icon}</span>
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider', accentMap.title)}>{title}</h4>
      </div>
      <div className="space-y-0">
        {metrics.map((m, i) => {
          let valCls = 'text-slate-100 font-semibold tabular-nums'
          if (m.missing)     valCls = 'text-slate-600 italic text-sm font-normal'
          else if (m.alert)  valCls = 'text-red-400 font-semibold tabular-nums'
          else if (m.good)   valCls = 'text-emerald-400 font-semibold tabular-nums'

          return (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
              <span className="text-xs text-slate-400 leading-tight">{m.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                {m.refValue !== undefined && m.currValue !== undefined && !m.missing && (
                  <DeltaChip curr={m.currValue} baseline={m.refValue} alertOnIncrease={m.alertOnIncrease ?? true} />
                )}
                <span className={cn('text-sm text-right', valCls)}>
                  {m.missing ? 'donnée manquante' : m.value}
                  {!m.missing && m.unit && <span className="text-xs text-slate-500 ml-1">{m.unit}</span>}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 4 Piliers (read-only) ────────────────────────────────────────────────────

function ProgressBar({ value, seuil, max = 100 }: {
  value: number; seuil: number; max?: number
}) {
  const pct = Math.min((value / max) * 100, 100)
  const seuilPct = Math.min((seuil / max) * 100, 100)
  const color = value > seuil * 1.6 ? 'bg-red-500' : value > seuil ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-white/30" style={{ left: `${seuilPct}%` }} />
    </div>
  )
}

function FourPillarsReadOnly({
  kpis, invoiceData, params, thresholds,
}: {
  kpis: BillingKPIs
  invoiceData: InvoiceData
  params: BillingParams
  thresholds: Thresholds
}) {
  const k2 = safe(invoiceData.conso_k2_kwh)
  const k1 = safe(invoiceData.conso_k1_kwh)
  const total = invoiceData.conso_kwh_total || (k1 + k2)
  const k2Pct = total > 0 && k2 > 0 ? (k2 / total) * 100 : null

  const ps   = params.puissance_souscrite_kw || null
  const pmax = invoiceData.puissance_max_kw ?? null
  const psEcartPct = ps && pmax ? ((ps - pmax) / ps) * 100 : null

  const cosphi = invoiceData.cosphi_mesure ?? null
  const nbHeures = kpis.nb_heures_utilisation
  const tarif    = kpis.choix_tarif_optimal
  const isMT     = ['TCU', 'TG', 'TLU'].includes(params.categorie)

  return (
    <div className="rounded-xl border border-blue-500/15 bg-[#0d1018] p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-3.5 h-3.5 text-blue-400" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-300">4 Piliers d'Analyse</h4>
        <span className="ml-auto text-[9px] text-slate-600 italic">seuils en lecture seule</span>
      </div>

      {/* Pilier 1 — K2 */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 1 — Heures de Pointe (K2)</p>
          <span className="text-[10px] text-slate-500">Seuil : {thresholds.k2_seuil_pct}%</span>
        </div>
        {k2Pct !== null ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">K2 (pointe 19h-23h)</span>
              <span className={cn('font-semibold tabular-nums', k2Pct > thresholds.k2_seuil_pct ? 'text-red-400' : 'text-emerald-400')}>
                {k2Pct.toFixed(1)}%
              </span>
            </div>
            <ProgressBar value={k2Pct} seuil={thresholds.k2_seuil_pct} max={50} />
            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
              <span>K1 : {formatNumber(k1, 0)} kWh</span>
              <span>K2 : {formatNumber(k2, 0)} kWh</span>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-slate-600">K1/K2 non disponibles (catégories BT Petite Puissance)</p>
        )}
      </div>

      {/* Pilier 2 — PS */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 2 — Puissance Souscrite (PS)</p>
          <span className="text-[10px] text-slate-500">Seuil écart : {thresholds.ps_seuil_pct}%</span>
        </div>
        {ps && pmax ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">PS contractuelle</p>
              <p className="text-sm font-bold text-slate-100 tabular-nums">{ps} <span className="text-xs text-slate-500">kW</span></p>
            </div>
            <div className={cn(
              'rounded-lg border px-3 py-2 text-center',
              psEcartPct !== null && psEcartPct < -thresholds.ps_seuil_pct ? 'border-red-500/25 bg-red-500/8'
                : psEcartPct !== null && psEcartPct > thresholds.ps_seuil_pct ? 'border-amber-500/25 bg-amber-500/8'
                : 'border-emerald-500/20 bg-emerald-500/5',
            )}>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Pmax relevée</p>
              <p className={cn(
                'text-sm font-bold tabular-nums',
                psEcartPct !== null && psEcartPct < -thresholds.ps_seuil_pct ? 'text-red-400'
                  : psEcartPct !== null && psEcartPct > thresholds.ps_seuil_pct ? 'text-amber-400'
                  : 'text-emerald-400',
              )}>{pmax} <span className="text-xs text-slate-500">kW</span></p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-600">Pmax non disponible (catégories PP/MP) ou PS non renseignée</p>
        )}
      </div>

      {/* Pilier 3 — cosφ */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 3 — Facteur de Puissance (cosφ)</p>
          <span className="text-[10px] text-slate-500">Seuil min : {thresholds.cosphi_seuil}</span>
        </div>
        {cosphi ? (
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center justify-center w-14 h-14 rounded-full border-4 text-sm font-bold tabular-nums',
              cosphi >= 0.92 ? 'border-emerald-500 text-emerald-400' :
              cosphi >= thresholds.cosphi_seuil ? 'border-amber-500 text-amber-400' :
              'border-red-500 text-red-400',
            )}>{cosphi.toFixed(2)}</div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>0.70</span><span className="text-red-400/60">seuil {thresholds.cosphi_seuil}</span><span>0.92</span><span>1.00</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', cosphi >= 0.92 ? 'bg-emerald-500' : cosphi >= thresholds.cosphi_seuil ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.max(0, Math.min(100, ((cosphi - 0.7) / 0.3) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-600">cosφ non disponible dans l'OCR</p>
        )}
      </div>

      {/* Pilier 4 — Option tarifaire */}
      {isMT ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 4 — Option Tarifaire MT</p>
          <div className="relative h-6">
            <div className="absolute inset-0 flex">
              <div className="flex-1 border-r border-slate-600 flex items-center justify-center">
                <span className="text-[9px] text-slate-500 font-mono">TCU</span>
              </div>
              <div className="flex-1 border-r border-slate-600 flex items-center justify-center">
                <span className="text-[9px] text-slate-500 font-mono">TG</span>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[9px] text-slate-500 font-mono">TLU</span>
              </div>
            </div>
          </div>
          <div className="relative h-3 bg-slate-800 rounded-full">
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-600" style={{ left: '33.3%' }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-600" style={{ left: '66.6%' }} />
            {nbHeures > 0 && (
              <div
                className="absolute top-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-[#0d1018] shadow"
                style={{ left: `${Math.min(98, (nbHeures / 6000) * 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}
              />
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400">{formatNumber(nbHeures, 0)} h/an</span>
            {tarif && (
              <span className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded-md',
                tarif === params.categorie ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
              )}>
                {tarif === params.categorie ? 'Tarif optimal' : `Recommandé : ${tarif}`}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 4 — Option Tarifaire</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            TCU / TG / TLU s'applique uniquement à la Moyenne Tension. Catégorie actuelle : <strong className="text-slate-300">{params.categorie}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Potentiel d'optimisation (read-only) ────────────────────────────────────

function PotentielOptimisationBlock({
  kpis, invoiceData, params, thresholds,
}: {
  kpis: BillingKPIs
  invoiceData: InvoiceData
  params: BillingParams
  thresholds: Thresholds
}) {
  const ps      = params.puissance_souscrite_kw || null
  const pmax    = invoiceData.puissance_max_kw ?? null
  const cosphiMes = invoiceData.cosphi_mesure ?? null
  const k2kwh   = invoiceData.conso_k2_kwh ?? 0
  const totalKwh = invoiceData.conso_kwh_total ?? 0
  const k2Pct   = totalKwh > 0 && k2kwh > 0 ? (k2kwh / totalKwh) * 100 : null
  const isMT    = ['TCU', 'TG', 'TLU'].includes(params.categorie)

  const hasPsReduction   = kpis.economie_ps_fcfa > 0
  const hasPdp           = kpis.montant_pdp_fcfa > 0
  const hasCosphiPenalty = kpis.economie_cosphi_fcfa > 0
  const hasCosphiRisk    = cosphiMes !== null && cosphiMes < thresholds.cosphi_seuil && !hasCosphiPenalty
  const hasK2High        = k2Pct !== null && k2Pct > thresholds.k2_seuil_pct
  const hasTarifChange   = isMT && kpis.choix_tarif_optimal !== null && kpis.choix_tarif_optimal !== params.categorie

  const hasQuantifiedSavings = hasPsReduction || hasCosphiPenalty
  const hasAny = hasQuantifiedSavings || hasPdp || hasCosphiRisk || hasK2High || hasTarifChange

  const borderColor = hasQuantifiedSavings ? 'border-emerald-500/20'
    : hasAny ? 'border-amber-500/15' : 'border-white/[0.07]'
  const iconColor  = hasQuantifiedSavings ? 'text-emerald-400'
    : hasAny ? 'text-amber-400' : 'text-slate-500'
  const titleColor = hasQuantifiedSavings ? 'text-emerald-300'
    : hasAny ? 'text-amber-300' : 'text-slate-500'

  const Badge = ({ label, value, positive }: { label: string; value: string; positive?: boolean }) => (
    <div className={cn(
      'flex items-center justify-between px-3 py-2 rounded-lg border text-xs',
      positive ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.07]',
    )}>
      <span className="text-slate-400">{label}</span>
      <span className={cn('font-semibold tabular-nums', positive ? 'text-emerald-300' : 'text-slate-200')}>{value}</span>
    </div>
  )

  return (
    <div className={cn('rounded-xl border bg-[#0d1018] p-4', borderColor)}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className={cn('w-3.5 h-3.5', iconColor)} />
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider', titleColor)}>Potentiel d'optimisation</h4>
      </div>

      {!hasAny ? (
        <p className="text-[11px] text-slate-600 leading-relaxed">Aucune optimisation identifiée avec cette grille.</p>
      ) : (
        <div className="space-y-2">
          {hasK2High && k2Pct !== null && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
              <Zap className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 mb-0.5">K2 — Heures de Pointe élevées</p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  {k2Pct.toFixed(1)}% en pointe (19h-23h) — seuil {thresholds.k2_seuil_pct}%
                </p>
              </div>
            </div>
          )}
          {hasTarifChange && kpis.choix_tarif_optimal && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-2">
              <Activity className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80 mb-0.5">Option tarifaire non optimale</p>
                <p className="text-[11px] text-blue-300/70 leading-relaxed">
                  Actuel : <strong className="text-blue-200">{params.categorie}</strong> · Recommandé : <strong className="text-blue-200">{kpis.choix_tarif_optimal}</strong>
                </p>
              </div>
            </div>
          )}
          {hasPdp && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2">
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80 mb-0.5">Dépassement PS — Pénalité PDP</p>
                <p className="text-[11px] text-red-300/70 leading-relaxed">
                  PDP : {formatNumber(kpis.montant_pdp_fcfa, 0)} FCFA
                  {pmax && ps ? ` · Pmax (${pmax} kW) > PS (${ps} kW)` : ''}
                </p>
              </div>
            </div>
          )}
          {hasPsReduction && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 px-1">Réduction PS</p>
              <Badge label="Strict (PS = Pmax)" value={`${formatNumber(kpis.economie_ps_fcfa, 0)} FCFA/mois`} positive />
              {kpis.economie_ps_prudent_fcfa > 0 && (
                <Badge label="Prudent (PS = Pmax × 1,1)" value={`${formatNumber(kpis.economie_ps_prudent_fcfa, 0)} FCFA/mois`} positive />
              )}
            </div>
          )}
          {hasCosphiPenalty && (
            <Badge label="Correction cosφ" value={`${formatNumber(kpis.economie_cosphi_fcfa, 0)} FCFA/mois`} positive />
          )}
          {hasCosphiRisk && cosphiMes !== null && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
              <Activity className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 mb-0.5">cosφ — Risque pénalité</p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  cosφ {cosphiMes.toFixed(3)} {'<'} seuil {thresholds.cosphi_seuil}
                </p>
              </div>
            </div>
          )}
          {hasQuantifiedSavings && (
            <>
              <div className="border-t border-emerald-500/10 my-1" />
              <Badge label="Économie mensuelle" value={`${formatNumber(kpis.economie_totale_fcfa, 0)} FCFA/mois`} positive />
              <Badge label="Économie annuelle" value={`${formatNumber(kpis.economie_annuelle_fcfa, 0)} FCFA/an`} positive />
              <Badge label="Nouveau MTTC estimé" value={`${formatNumber(kpis.nouveau_mttc_fcfa, 0)} FCFA`} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: Thresholds = { k2_seuil_pct: 10, ps_seuil_pct: 10, cosphi_seuil: 0.80 }

export default function BillingScenarioComparator({
  currentParams, invoiceData, thresholds, disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const allYears = useMemo<TariffYear[]>(() => getAvailableTariffYears() as TariffYear[], [open])
  const [targetYear, setTargetYear] = useState<TariffYear>(() => {
    const years = getAvailableTariffYears() as TariffYear[]
    const next = years.find(y => y !== currentParams.grille_annee)
    return next ?? years[years.length - 1] ?? 2026
  })

  const th = thresholds ?? DEFAULT_THRESHOLDS

  // Scénario "actuel" — sert de référence pour les deltas
  const currentScenario = useMemo(() => {
    const built = buildSyntheticInvoice(invoiceData, currentParams, currentParams.grille_annee)
    if (!built) return null
    const kpis = calculateBillingKPIs(currentParams, built.invoice)
    return { invoice: built.invoice, kpis, mttc: built.mttc }
  }, [currentParams, invoiceData])

  // Scénario "simulé"
  const simScenario = useMemo(() => {
    const params: BillingParams = { ...currentParams, grille_annee: targetYear }
    const built = buildSyntheticInvoice(invoiceData, params, targetYear)
    if (!built) return { params, invoice: null, kpis: null, mttc: 0, unavailable: true }
    const kpis = calculateBillingKPIs(params, built.invoice)
    return {
      params,
      invoice: built.invoice,
      kpis: kpis.mt_tarif_indisponible ? null : kpis,
      mttc:  built.mttc,
      unavailable: !!kpis.mt_tarif_indisponible,
    }
  }, [currentParams, invoiceData, targetYear])

  const isSameYear = targetYear === currentParams.grille_annee
  const sim = simScenario.kpis
  const ref = currentScenario?.kpis ?? null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 hover:text-slate-100 gap-1.5 h-8 px-3 text-xs"
        >
          <GitCompare className="w-3.5 h-3.5" />
          Simuler autre grille
        </Button>
      </DialogTrigger>

      <DialogContent className={cn(
        'bg-[#0a0c14] border-slate-800 text-slate-100',
        'max-w-4xl w-full max-h-[92vh] overflow-y-auto p-0',
      )}>
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-800/60 sticky top-0 z-10 bg-[#0a0c14]">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/15 shrink-0 mt-0.5">
              <GitCompare className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-semibold text-slate-100">
                Simulation — application d'une autre grille tarifaire
              </DialogTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Même facture · {formatNumber(invoiceData.conso_kwh_total, 0)} kWh ·
                catégorie <strong className="text-slate-300">{currentParams.categorie}</strong> ·
                PS <strong className="text-slate-300">{currentParams.puissance_souscrite_kw} kW</strong>
              </p>
            </div>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Grille tarifaire :</span>
            {allYears.map(y => {
              const isCurrent = y === currentParams.grille_annee
              const isSelected = y === targetYear
              const style = yearStyle(y)
              return (
                <button
                  key={y}
                  onClick={() => setTargetYear(y)}
                  className={cn(
                    'px-3 py-1 rounded-md border text-xs font-semibold transition-colors',
                    isSelected
                      ? cn(style.bg, style.border, style.text, 'ring-1 ring-white/10')
                      : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:text-slate-300 hover:border-slate-600',
                  )}
                >
                  {y}
                  {isCurrent && (
                    <span className="ml-1.5 text-[8px] uppercase tracking-wider opacity-70">actuelle</span>
                  )}
                </button>
              )
            })}
          </div>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="p-5 space-y-4">
          {simScenario.unavailable && (
            <div className="flex items-center gap-2 text-[11px] text-orange-400/80 bg-orange-500/8 border border-orange-500/15 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Données MT/HT non disponibles pour la grille {targetYear}
            </div>
          )}

          {sim && (
            <>
              {/* MTTC simulé en bandeau */}
              <div className={cn(
                'rounded-xl border p-4 flex items-center justify-between',
                yearStyle(targetYear).bg, yearStyle(targetYear).border,
              )}>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">MTTC simulé · grille {targetYear}</p>
                  <p className={cn('text-2xl font-bold font-mono mt-1', yearStyle(targetYear).text)}>
                    {formatNumber(simScenario.mttc, 0)}
                    <span className="text-sm font-normal text-slate-500 ml-1.5">FCFA</span>
                  </p>
                </div>
                {currentScenario && !isSameYear && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Variation</p>
                    <div className="mt-1">
                      <DeltaChip curr={simScenario.mttc} baseline={currentScenario.mttc} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      vs grille {currentParams.grille_annee} ({formatNumber(currentScenario.mttc, 0)} FCFA)
                    </p>
                  </div>
                )}
              </div>

              {/* Bloc 1 — Normalisation */}
              <SimMetricBlock
                title="Normalisation temporelle"
                accent="blue"
                icon={<BarChart3 className="w-3.5 h-3.5 text-blue-400" />}
                metrics={[
                  { label: 'Conso journalière',  value: formatNumber(sim.conso_journaliere_kwh, 1),     unit: 'kWh/j' },
                  { label: 'Conso annuelle',     value: formatNumber(sim.conso_annuelle_kwh / 1000, 1), unit: 'MWh/an' },
                  { label: 'Coût journalier',    value: formatNumber(sim.cout_journalier_fcfa, 0),      unit: 'FCFA/j',
                    refValue: ref?.cout_journalier_fcfa, currValue: sim.cout_journalier_fcfa },
                  { label: 'Coût annuel estimé', value: formatNumber(sim.cout_annuel_fcfa, 0),          unit: 'FCFA/an',
                    refValue: ref?.cout_annuel_fcfa,    currValue: sim.cout_annuel_fcfa },
                ]}
              />

              {/* Bloc 2 — Coûts unitaires */}
              <SimMetricBlock
                title="Coûts unitaires"
                accent="amber"
                icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
                metrics={[
                  { label: 'Cm SENELEC (pondéré)',    value: formatNumber(sim.cm_fcfa_kwh, 2),  unit: 'FCFA/kWh',
                    refValue: ref?.cm_fcfa_kwh,  currValue: sim.cm_fcfa_kwh },
                  { label: 'IPR client (tout incl.)', value: formatNumber(sim.ipr_fcfa_kwh, 2), unit: 'FCFA/kWh',
                    refValue: ref?.ipr_fcfa_kwh, currValue: sim.ipr_fcfa_kwh },
                  { label: 'Surcoût / kWh',           value: formatNumber(sim.surcout_kwh_fcfa, 2),       unit: 'FCFA/kWh',
                    alert: sim.surcout_kwh_fcfa > 0,
                    refValue: ref?.surcout_kwh_fcfa,    currValue: sim.surcout_kwh_fcfa },
                  { label: 'Surcoût mensuel',         value: formatNumber(sim.surcout_monetaire_fcfa, 0), unit: 'FCFA',
                    alert: sim.surcout_monetaire_fcfa > 0,
                    refValue: ref?.surcout_monetaire_fcfa, currValue: sim.surcout_monetaire_fcfa },
                ]}
              />

              {/* Bloc 3 — Indicateurs puissance */}
              <SimMetricBlock
                title="Indicateurs puissance"
                accent="violet"
                icon={<Settings2 className="w-3.5 h-3.5 text-violet-400" />}
                metrics={[
                  {
                    label: 'Facteur d\'utilisation',
                    value: formatNumber(sim.facteur_utilisation_pct, 1),
                    unit: '%',
                    missing: !invoiceData.puissance_max_kw,
                  },
                  { label: 'Heures d\'utilisation', value: formatNumber(sim.nb_heures_utilisation, 0), unit: 'h/an' },
                  ...(sim.taux_charge_transfo_pct != null
                    ? [{
                        label: 'Taux de charge transfo',
                        value: formatNumber(sim.taux_charge_transfo_pct, 1),
                        unit: '%',
                        alert: sim.taux_charge_transfo_pct > 90,
                      } as SimMetric]
                    : []),
                  ...(sim.choix_tarif_optimal
                    ? [{
                        label: 'Tarif optimal recommandé',
                        value: sim.choix_tarif_optimal,
                        good: sim.choix_tarif_optimal === currentParams.categorie,
                        alert: sim.choix_tarif_optimal !== currentParams.categorie,
                      } as SimMetric]
                    : []),
                ]}
              />

              {/* Bloc 4 — Répartition */}
              {simScenario.invoice && (
                <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Répartition de la facture</h4>
                    {sim.pct_residuel > 2 && (
                      <span className="text-[10px] text-amber-500/70 font-mono">
                        {formatNumber(sim.pct_residuel, 0)}% non identifié
                      </span>
                    )}
                  </div>
                  <BillingPieChart
                    segments={[
                      { name: 'Énergie (consommée)',  value: sim.pct_energie,    color: '#f59e0b', fcfa: sim.montant_energie_calc, estimated: sim.energie_reconstructed },
                      { name: 'Prime fixe (PS)',      value: sim.pct_prime_fixe, color: '#3b82f6', fcfa: sim.montant_pf_calc,      estimated: sim.pf_reconstructed },
                      { name: 'Dépassement PS (PDP)', value: sim.pct_pdp,        color: '#ef4444', fcfa: sim.montant_pdp_fcfa },
                      { name: 'Pénalité cosφ',        value: sim.pct_cosphi,     color: '#f97316', fcfa: invoiceData.montant_cosphi },
                      { name: 'Redevance (compteur)', value: sim.pct_redevance,  color: '#94a3b8', fcfa: sim.montant_redevance_fcfa },
                      { name: 'TVA + TCO',            value: sim.pct_taxes,      color: '#475569', fcfa: sim.montant_taxes_fcfa },
                      { name: 'Non identifié (OCR)',  value: sim.pct_residuel,   color: '#334155', fcfa: sim.montant_residuel_fcfa, residual: true, estimated: true },
                    ] satisfies PieSegment[]}
                  />
                </div>
              )}

              {/* Bloc 5 — Potentiel d'optimisation */}
              {simScenario.invoice && (
                <PotentielOptimisationBlock
                  kpis={sim}
                  invoiceData={simScenario.invoice}
                  params={simScenario.params}
                  thresholds={th}
                />
              )}

              {/* Bloc 6 — 4 Piliers */}
              {simScenario.invoice && (
                <FourPillarsReadOnly
                  kpis={sim}
                  invoiceData={simScenario.invoice}
                  params={simScenario.params}
                  thresholds={th}
                />
              )}
            </>
          )}

          {/* Footer note */}
          <div className="flex items-start gap-2 text-[10px] text-slate-600 pt-2">
            <Minus className="w-3 h-3 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              Énergie et prime fixe recalculées avec les tarifs de la grille {targetYear}.
              TVA 18% et TCO 2,5% (BT) reconstruits sur la nouvelle base.
              Pénalités cosφ, PDP et redevance conservées (issues de la facture réelle).
              Les seuils des 4 Piliers reflètent ceux configurés dans la page principale.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
