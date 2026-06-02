/**
 * ManualInvoiceForm.tsx
 * Sheet plein-écran — saisie manuelle matricielle de factures SENELEC.
 * Templates A (BT PP — tranches), B (GP+MT — K1/K2), C (HT — B + transfo).
 * Produit ocr_data compatible mapOcrToInvoiceData().
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useOrganization } from '@/context/OrganizationContext'
import { useAuth } from '@/context/AuthContext'
import { getAudits } from '@/lib/audit-service'
import { createInvoice } from '@/lib/invoice-service'
import type { AuditDB } from '@/lib/audit-service'
import {
  SENELEC_TARIFFS, CATEGORIES_BY_TENSION, CATEGORY_LABELS, TVA_RATE, TCO_RATE_BT,
} from '@/constants/senelec-tariffs'
import type { TariffCategory, TariffYear } from '@/constants/senelec-tariffs'
import {
  calcNJ, calcTranches, calcTVABase_BT_PP, calcMajoration, calcCosphi,
  calcPrimeFix, buildOcrData_A, buildOcrData_B, REDEVANCE_DEFAULTS,
} from './manual-invoice-calc'
import { Check, RotateCcw, PenLine, AlertTriangle, ChevronRight, Zap, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManualInvoiceFormProps {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  onSaved:         () => void
  defaultAuditId?: string
}

type Tension = 'BT' | 'MT' | 'HT'
type TemplateType = 'A' | 'B' | 'C'

const BT_PP_CATS: TariffCategory[] = ['DPP', 'DMP', 'PPP', 'PMP']
const BT_GP_CATS: TariffCategory[] = ['DGP', 'PGP']
const MT_CATS:    TariffCategory[] = ['TCU', 'TG', 'TLU']
const HT_CATS:    TariffCategory[] = ['HTS', 'HTG']

function templateFor(cat: TariffCategory | null): TemplateType | null {
  if (!cat) return null
  if (BT_PP_CATS.includes(cat)) return 'A'
  if (BT_GP_CATS.includes(cat) || MT_CATS.includes(cat)) return 'B'
  if (HT_CATS.includes(cat)) return 'C'
  return null
}

// ─── State shapes ──────────────────────────────────────────────────────────────

interface FormMeta {
  auditId:       string
  invoiceDate:   string
  reference:     string
  grilleAnnee:   TariffYear
  tension:       Tension | null
  categorie:     TariffCategory | null
  isWoyofal:     boolean
  facture_reelle: string
  seuil_tolerance: string
}

interface FormStateA {
  // Zone 1 — en-tête
  num_client: string; num_police: string; num_compteur: string
  nom: string; adresse: string; agence: string; statut: string
  // Zone 2 — consommation
  date_debut: string; date_fin: string
  ancien_index: string; nouvel_index: string
  type_facture: string; num_facture: string; date_limite: string
  // Zone 2 — overrides calculés
  nj_override: string; nj_manual: boolean
  conso_override: string; conso_manual: boolean
  // Zone 3 — tarifs overrides (par tranche)
  tarif_t1_override: string; tarif_t2_override: string; tarif_t3_override: string
  tarif_t1_manual: boolean; tarif_t2_manual: boolean; tarif_t3_manual: boolean
  // Zone 4 — taxes overrides
  tco_override: string; tco_manual: boolean
  redevance_override: string; redevance_manual: boolean
  tva_override: string; tva_manual: boolean
  total_override: string; total_manual: boolean
  reprise_arrondi: string
  reglement_especes: boolean
  // Zone 5 — rappel impayées
  rappels: Array<{ id: string; num_facture: string; date: string; debit: string; credit: string }>
}

interface FormStateB {
  // Zone 1 — en-tête contrat
  num_client: string; num_contrat: string; num_police: string
  ps_kw: string; num_compteur: string; agence: string
  nom: string; adresse: string
  // Zone 2 — paramètres techniques
  puissance_transfo_kva: string; pmax_kw: string
  cosphi: string; type_comptage: string
  rapport_tc_a: string; rapport_tc_a_prime: string
  rapport_tp_r: string; rapport_tp_r_prime: string
  // Zone 2 HT extra
  tension_primaire_kv: string; tension_secondaire_kv: string
  puissance_assignee_kva: string; pertes_vide_kw: string
  pertes_charge_kw: string; impedance_cc_pct: string
  // Zone 3 — matrice énergie
  date_debut: string; date_fin: string
  type_facture: string
  nj_override: string; nj_manual: boolean
  ni_k1: string; ai_k1: string; rappel_k1: string
  ni_k2: string; ai_k2: string; rappel_k2: string
  conso_k1_override: string; conso_k1_manual: boolean
  conso_k2_override: string; conso_k2_manual: boolean
  conso_reactive: string; h1_transfo: string; h2_cond: string
  // Zone 4 — tarif overrides
  tarif_k1_override: string; tarif_k1_manual: boolean
  tarif_k2_override: string; tarif_k2_manual: boolean
  tarif_pf_override: string; tarif_pf_manual: boolean
  // Zone 4 — lignes calculées
  pdp_montant_override: string; pdp_manual: boolean
  redevance_override: string; redevance_manual: boolean
  tco_override: string; tco_manual: boolean
  tva_override: string; tva_manual: boolean
  total_override: string; total_manual: boolean
  reprise_arrondi: string
  // Zone 5 — rappel impayées
  rappels: Array<{ id: string; num_facture: string; date: string; debit: string; credit: string }>
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

function toNum(s: string): number {
  const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

function fmt(n: number, decimals = 0): string {
  if (!n) return ''
  return decimals > 0
    ? n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(n).toLocaleString('fr-FR')
}

function Field({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-slate-400 font-medium">{label}</Label>
      {children}
    </div>
  )
}

const inp = 'bg-[#0d0f1a] border-white/[0.14] text-slate-100 h-9 text-sm placeholder:text-slate-600 focus:border-amber-500/60 focus-visible:ring-1 focus-visible:ring-amber-500/20'
const inpCalc = 'bg-white/[0.025] border-white/[0.06] text-slate-400 h-9 text-sm cursor-default'

function TF({
  value, onChange, placeholder, type = 'text', disabled, className,
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
  disabled?: boolean; className?: string
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(inp, disabled && inpCalc, className)}
    />
  )
}

function CalcField({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400 font-medium">{label}</Label>
      <div className="h-9 px-3 flex items-center bg-white/[0.025] border border-white/[0.06] rounded-md text-sm text-slate-400 tabular-nums">
        <span className="flex-1">{value || '—'}</span>
        {unit && value ? <span className="text-slate-600 text-xs ml-1">{unit}</span> : null}
      </div>
    </div>
  )
}

function OverrideField({
  label, calcValue, overrideValue, isManual,
  onOverrideChange, onToggleManual, unit,
}: {
  label: string
  calcValue: number
  overrideValue: string
  isManual: boolean
  onOverrideChange: (v: string) => void
  onToggleManual: (v: boolean) => void
  unit?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400 font-medium flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onToggleManual(!isManual)}
          className={cn(
            'flex items-center gap-1 text-[10px] transition-colors',
            isManual ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400',
          )}
        >
          {isManual ? <><PenLine className="w-3 h-3" /> Manuel</> : 'Auto'}
        </button>
      </Label>
      <div className="flex gap-1">
        <Input
          value={isManual ? overrideValue : (calcValue ? fmt(calcValue, 2) : '')}
          onChange={(e) => onOverrideChange(e.target.value)}
          disabled={!isManual}
          placeholder={isManual ? '0' : (calcValue ? fmt(calcValue, 2) : '—')}
          className={cn(inp, !isManual && inpCalc, isManual && 'border-amber-500/40')}
        />
        {isManual && calcValue > 0 && (
          <button
            type="button"
            title="Réinitialiser à l'auto"
            onClick={() => { onToggleManual(false); onOverrideChange('') }}
            className="h-8 w-8 flex items-center justify-center rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        {unit && <span className="h-8 flex items-center text-xs text-slate-600 shrink-0">{unit}</span>}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <div className="w-[3px] h-4 rounded-full bg-amber-500/70 shrink-0" />
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">{children}</p>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

// ─── Rappel impayées row ──────────────────────────────────────────────────────

function RappelRow({
  row,
  onChange,
  onDelete,
}: {
  row: { id: string; num_facture: string; date: string; debit: string; credit: string }
  onChange: (field: string, value: string) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 items-center">
      <TF value={row.num_facture} onChange={(v) => onChange('num_facture', v)} placeholder="N° facture" />
      <TF value={row.date} onChange={(v) => onChange('date', v)} placeholder="Date" type="date" className="w-32" />
      <TF value={row.debit} onChange={(v) => onChange('debit', v)} placeholder="Débit" className="w-28" />
      <TF value={row.credit} onChange={(v) => onChange('credit', v)} placeholder="Crédit" className="w-28" />
      <button
        type="button"
        onClick={onDelete}
        className="h-8 w-8 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded"
      >
        ×
      </button>
    </div>
  )
}

// ─── Défauts état ─────────────────────────────────────────────────────────────

const defaultMeta = (): FormMeta => ({
  auditId: '', invoiceDate: '', reference: '',
  grilleAnnee: 2023,
  tension: null, categorie: null, isWoyofal: false,
  facture_reelle: '',
  seuil_tolerance: '10',
})

const defaultA = (): FormStateA => ({
  num_client: '', num_police: '', num_compteur: '',
  nom: '', adresse: '', agence: '', statut: '',
  date_debut: '', date_fin: '',
  ancien_index: '', nouvel_index: '',
  type_facture: '', num_facture: '', date_limite: '',
  nj_override: '', nj_manual: false,
  conso_override: '', conso_manual: false,
  tarif_t1_override: '', tarif_t2_override: '', tarif_t3_override: '',
  tarif_t1_manual: false, tarif_t2_manual: false, tarif_t3_manual: false,
  tco_override: '', tco_manual: false,
  redevance_override: '', redevance_manual: false,
  tva_override: '', tva_manual: false,
  total_override: '', total_manual: false,
  reprise_arrondi: '',
  reglement_especes: false,
  rappels: [],
})

const defaultB = (): FormStateB => ({
  num_client: '', num_contrat: '', num_police: '',
  ps_kw: '', num_compteur: '', agence: '',
  nom: '', adresse: '',
  puissance_transfo_kva: '', pmax_kw: '',
  cosphi: '', type_comptage: '',
  rapport_tc_a: '', rapport_tc_a_prime: '',
  rapport_tp_r: '', rapport_tp_r_prime: '',
  tension_primaire_kv: '', tension_secondaire_kv: '',
  puissance_assignee_kva: '', pertes_vide_kw: '',
  pertes_charge_kw: '', impedance_cc_pct: '',
  date_debut: '', date_fin: '',
  type_facture: '',
  nj_override: '', nj_manual: false,
  ni_k1: '', ai_k1: '', rappel_k1: '',
  ni_k2: '', ai_k2: '', rappel_k2: '',
  conso_k1_override: '', conso_k1_manual: false,
  conso_k2_override: '', conso_k2_manual: false,
  conso_reactive: '', h1_transfo: '', h2_cond: '',
  tarif_k1_override: '', tarif_k1_manual: false,
  tarif_k2_override: '', tarif_k2_manual: false,
  tarif_pf_override: '', tarif_pf_manual: false,
  pdp_montant_override: '', pdp_manual: false,
  redevance_override: '', redevance_manual: false,
  tco_override: '', tco_manual: false,
  tva_override: '', tva_manual: false,
  total_override: '', total_manual: false,
  reprise_arrondi: '',
  rappels: [],
})

// ─── Composant principal ──────────────────────────────────────────────────────

export function ManualInvoiceForm({
  open, onOpenChange, onSaved, defaultAuditId,
}: ManualInvoiceFormProps) {
  const { toast } = useToast()
  const { organization } = useOrganization()
  const { user } = useAuth()

  const [saving, setSaving] = useState(false)
  const [audits, setAudits] = useState<AuditDB[]>([])
  const [loadingAudits, setLoadingAudits] = useState(false)

  const [meta, setMeta] = useState<FormMeta>(() => ({
    ...defaultMeta(),
    auditId: defaultAuditId ?? '',
  }))
  const [fA, setFa] = useState<FormStateA>(defaultA)
  const [fB, setFb] = useState<FormStateB>(defaultB)

  const [pendingTension, setPendingTension] = useState<Tension | null>(null)
  const [pendingCat, setPendingCat] = useState<TariffCategory | null>(null)
  const [showSwitchWarning, setShowSwitchWarning] = useState(false)

  const templateType = templateFor(meta.categorie)

  // ── Load audits ──
  useEffect(() => {
    if (!open || !organization?.id) return
    setLoadingAudits(true)
    getAudits(organization.id)
      .then((list) => {
        setAudits(list ?? [])
        if (!meta.auditId && list?.length) setMeta((p) => ({ ...p, auditId: list[0].id }))
      })
      .catch(() => toast({ title: 'Erreur', description: 'Impossible de charger les projets', variant: 'destructive' }))
      .finally(() => setLoadingAudits(false))
  }, [open, organization?.id])

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setMeta({ ...defaultMeta(), auditId: defaultAuditId ?? '' })
      setFa(defaultA())
      setFb(defaultB())
    }
  }, [open])

  // ── Tariff grid helper ──
  const tariffGrid = useMemo(() => {
    const grid = SENELEC_TARIFFS[meta.grilleAnnee]
    if (!meta.tension || !meta.categorie) return null
    const section = grid[meta.tension as keyof typeof grid] as Record<string, { t1: number | null; t2: number | null; t3: number | null; pf: number | null; k1: number | null; k2: number | null }>
    return section?.[meta.categorie] ?? null
  }, [meta.grilleAnnee, meta.tension, meta.categorie])

  // ── Template A — derived calculations ──
  const calcA = useMemo(() => {
    if (templateType !== 'A' || !meta.categorie) return null
    const cat = meta.categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP'
    const nj_auto = calcNJ(fA.date_debut, fA.date_fin)
    const nj = fA.nj_manual ? (toNum(fA.nj_override) || null) : nj_auto
    const ai = toNum(fA.ancien_index)
    const ni = toNum(fA.nouvel_index)
    const conso_auto = ni > ai ? ni - ai : 0
    const conso = fA.conso_manual ? toNum(fA.conso_override) : conso_auto
    const grid = tariffGrid

    const r1 = fA.tarif_t1_manual ? toNum(fA.tarif_t1_override) : (grid?.t1 ?? 0)
    const r2 = fA.tarif_t2_manual ? toNum(fA.tarif_t2_override) : (grid?.t2 ?? 0)
    const r3 = fA.tarif_t3_manual ? toNum(fA.tarif_t3_override) : (grid?.t3 ?? 0)

    const tranches = nj && conso && r1 && r2 && r3
      ? calcTranches(cat, conso, nj, [r1, r2, r3], meta.isWoyofal)
      : null

    const montant_conso = tranches
      ? tranches.t1_montant + tranches.t2_montant + tranches.t3_montant
      : 0

    const redevance_default = REDEVANCE_DEFAULTS[cat] ?? 0
    const redevance = fA.redevance_manual ? toNum(fA.redevance_override) : redevance_default

    const tco_base = montant_conso
    const tco_auto = Math.round(tco_base * TCO_RATE_BT)
    const tco = fA.tco_manual ? toNum(fA.tco_override) : tco_auto

    const tva_base = tranches
      ? calcTVABase_BT_PP(cat, tranches.t1_montant, tranches.t2_montant, tranches.t3_montant, tco, redevance)
      : 0
    const tva_auto = Math.round(tva_base * TVA_RATE)
    const tva = fA.tva_manual ? toNum(fA.tva_override) : tva_auto

    const reprise = toNum(fA.reprise_arrondi)
    const total_raw = montant_conso + tco + redevance + tva + reprise
    const total_auto = Math.round(total_raw)
    const total_facture = fA.total_manual ? toNum(fA.total_override) : total_auto
    const arrondi = total_raw - total_auto
    const timbre = fA.reglement_especes ? Math.round(total_facture * 0.01) : 0
    const total_sommes_dues = total_facture + timbre

    const rappels_total = fA.rappels.reduce((s, r) => s + toNum(r.debit) - toNum(r.credit), 0)
    const solde_global = total_sommes_dues + rappels_total

    return {
      nj_auto, nj, conso_auto, conso, r1, r2, r3, tranches,
      montant_conso, redevance_default, redevance, tco, tva_base, tva_auto, tva,
      total_auto, total_facture, arrondi, timbre, rappels_total, solde_global,
    }
  }, [templateType, meta.categorie, meta.isWoyofal, tariffGrid, fA])

  // ── Template B/C — derived calculations ──
  const calcB = useMemo(() => {
    if (templateType !== 'B' && templateType !== 'C') return null
    const nj_auto = calcNJ(fB.date_debut, fB.date_fin)
    const nj = fB.nj_manual ? (toNum(fB.nj_override) || null) : nj_auto
    const ps = toNum(fB.ps_kw)
    const pmax = toNum(fB.pmax_kw)

    const ni_k1 = toNum(fB.ni_k1); const ai_k1 = toNum(fB.ai_k1)
    const ni_k2 = toNum(fB.ni_k2); const ai_k2 = toNum(fB.ai_k2)
    const conso_k1_auto = ni_k1 > ai_k1 ? ni_k1 - ai_k1 : 0
    const conso_k2_auto = ni_k2 > ai_k2 ? ni_k2 - ai_k2 : 0
    const conso_k1 = fB.conso_k1_manual ? toNum(fB.conso_k1_override) : conso_k1_auto
    const conso_k2 = fB.conso_k2_manual ? toNum(fB.conso_k2_override) : conso_k2_auto
    const conso_reactive = toNum(fB.conso_reactive)

    const a  = toNum(fB.rapport_tc_a)
    const ap = toNum(fB.rapport_tc_a_prime)
    const r  = toNum(fB.rapport_tp_r)
    const rp = toNum(fB.rapport_tp_r_prime)
    const majo = (a || r) ? calcMajoration(conso_k1, conso_k2, conso_reactive, a, ap, r, rp) : null

    const total_fact_k1 = conso_k1 + (toNum(fB.rappel_k1)) + (majo?.ma_k1 ?? 0)
    const total_fact_k2 = conso_k2 + (toNum(fB.rappel_k2)) + (majo?.ma_k2 ?? 0)
    const total_fact_total = total_fact_k1 + total_fact_k2

    const grid = tariffGrid
    const k1_tarif = fB.tarif_k1_manual ? toNum(fB.tarif_k1_override) : (grid?.k1 ?? 0)
    const k2_tarif = fB.tarif_k2_manual ? toNum(fB.tarif_k2_override) : (grid?.k2 ?? 0)
    const pf_tarif = fB.tarif_pf_manual ? toNum(fB.tarif_pf_override) : (grid?.pf ?? 0)

    const k1_montant = Math.round(total_fact_k1 * k1_tarif)
    const k2_montant = Math.round(total_fact_k2 * k2_tarif)
    const prime_fixe = nj ? calcPrimeFix(ps, pf_tarif, nj) : 0

    const depassement = ps > 0 && pmax > ps ? pmax - ps : 0
    const pdp_auto = depassement > 0 ? Math.round(depassement * k2_tarif * 1.5) : 0
    const pdp = fB.pdp_manual ? toNum(fB.pdp_montant_override) : pdp_auto

    const cosphi = toNum(fB.cosphi)
    const base_cosphi = k1_montant + k2_montant + prime_fixe
    const cosphi_montant = cosphi > 0 ? calcCosphi(cosphi, base_cosphi) : 0

    const is_bt_gp = meta.tension === 'BT'
    const tco_base = k1_montant + k2_montant + prime_fixe + pdp + cosphi_montant
    const tco_auto_val = is_bt_gp ? Math.round(tco_base * TCO_RATE_BT) : 0
    const tco = fB.tco_manual ? toNum(fB.tco_override) : tco_auto_val

    const redevance_default = REDEVANCE_DEFAULTS[meta.categorie as TariffCategory] ?? 0
    const redevance = fB.redevance_manual ? toNum(fB.redevance_override) : redevance_default

    const montant_ht = k1_montant + k2_montant + prime_fixe + pdp + cosphi_montant + tco + redevance
    const tva_auto = Math.round(montant_ht * TVA_RATE)
    const tva = fB.tva_manual ? toNum(fB.tva_override) : tva_auto

    const reprise = toNum(fB.reprise_arrondi)
    const total_raw = montant_ht + tva + reprise
    const total_auto = Math.round(total_raw)
    const total_facture = fB.total_manual ? toNum(fB.total_override) : total_auto
    const arrondi = total_raw - total_auto

    const rappels_total = fB.rappels.reduce((s, r) => s + toNum(r.debit) - toNum(r.credit), 0)
    const solde_global = total_facture + rappels_total

    return {
      nj_auto, nj, ps, pmax, depassement,
      conso_k1_auto, conso_k2_auto, conso_k1, conso_k2, conso_reactive, majo,
      total_fact_k1, total_fact_k2, total_fact_total,
      k1_tarif, k2_tarif, pf_tarif,
      k1_montant, k2_montant, prime_fixe,
      pdp_auto, pdp, cosphi, cosphi_montant,
      tco_auto: tco_auto_val, tco, redevance_default, redevance,
      montant_ht, tva_auto, tva, total_auto, total_facture, arrondi,
      rappels_total, solde_global,
    }
  }, [templateType, meta.tension, meta.categorie, tariffGrid, fB])

  // ── Template switch guard ──
  const hasDataA = fA.ancien_index || fA.nouvel_index || fA.date_debut
  const hasDataB = fB.ni_k1 || fB.ai_k1 || fB.date_debut

  const requestTension = useCallback((t: Tension) => {
    if (meta.tension === t) return
    const hasData = (templateType === 'A' && hasDataA) || ((templateType === 'B' || templateType === 'C') && hasDataB)
    const newTemplate = templateFor(CATEGORIES_BY_TENSION[t][0])
    if (hasData && newTemplate !== templateType) {
      setPendingTension(t)
      setPendingCat(null)
      setShowSwitchWarning(true)
    } else {
      applyTension(t)
    }
  }, [meta.tension, templateType, hasDataA, hasDataB])

  const requestCategorie = useCallback((cat: TariffCategory) => {
    if (meta.categorie === cat) return
    const newTpl = templateFor(cat)
    const hasData = (templateType === 'A' && hasDataA) || ((templateType === 'B' || templateType === 'C') && hasDataB)
    if (hasData && newTpl !== templateType) {
      setPendingCat(cat)
      setPendingTension(null)
      setShowSwitchWarning(true)
    } else {
      applyCategorie(cat)
    }
  }, [meta.categorie, templateType, hasDataA, hasDataB])

  const applyTension = (t: Tension) => {
    const defaultCat = CATEGORIES_BY_TENSION[t][0]
    setMeta((p) => ({ ...p, tension: t, categorie: defaultCat, isWoyofal: false }))
    setFa(defaultA())
    setFb(defaultB())
  }

  const applyCategorie = (cat: TariffCategory) => {
    setMeta((p) => ({ ...p, categorie: cat, isWoyofal: false }))
    const newTpl = templateFor(cat)
    if (newTpl !== templateType) {
      setFa(defaultA())
      setFb(defaultB())
    }
  }

  const confirmSwitch = () => {
    if (pendingTension) applyTension(pendingTension)
    else if (pendingCat) applyCategorie(pendingCat)
    setPendingTension(null)
    setPendingCat(null)
    setShowSwitchWarning(false)
  }

  // ── Save ──
  const handleSave = async () => {
    if (!user?.id || !organization?.id || !meta.auditId) return
    if (!templateType) return toast({ title: 'Erreur', description: 'Sélectionner une catégorie tarifaire', variant: 'destructive' })

    const mttc = templateType === 'A' ? calcA?.total_facture : calcB?.total_facture
    if (!mttc || mttc <= 0) return toast({ title: 'Erreur', description: 'Le total facture est nul', variant: 'destructive' })

    setSaving(true)
    try {
      let ocr_data
      if (templateType === 'A' && calcA) {
        const cat = meta.categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP'
        const { tranches, nj, conso, montant_conso, tco, redevance, tva, total_facture } = calcA
        const trancheRows = tranches ? [
          { label: 'Tranche 1', kwh: tranches.t1_kwh, tarif: calcA.r1, montant: tranches.t1_montant },
          { label: 'Tranche 2', kwh: tranches.t2_kwh, tarif: calcA.r2, montant: tranches.t2_montant },
          { label: 'Tranche 3', kwh: tranches.t3_kwh, tarif: calcA.r3, montant: tranches.t3_montant },
        ] : []
        ocr_data = buildOcrData_A({
          conso_total: conso ?? 0,
          date_debut: fA.date_debut, date_fin: fA.date_fin, nj: nj ?? 0,
          tranches: trancheRows,
          tco, redevance, tva,
          montant_conso, montant_ht: montant_conso + tco + redevance,
          total_facture,
        })
      } else if ((templateType === 'B' || templateType === 'C') && calcB) {
        const {
          nj, conso_k1, conso_k2, total_fact_k1, total_fact_k2, total_fact_total,
          conso_reactive, k1_tarif, k1_montant, k2_tarif, k2_montant,
          prime_fixe, pf_tarif, pdp, cosphi_montant, tco, redevance,
          montant_ht, tva, total_facture,
        } = calcB
        ocr_data = buildOcrData_B({
          date_debut: fB.date_debut, date_fin: fB.date_fin, nj: nj ?? 0,
          conso_k1, conso_k2, conso_total: conso_k1 + conso_k2,
          total_fact_k1, total_fact_k2, total_fact_total,
          conso_reactive: conso_reactive || undefined,
          h1: toNum(fB.h1_transfo) || undefined,
          ni_k1: toNum(fB.ni_k1) || undefined,
          ai_k1: toNum(fB.ai_k1) || undefined,
          ni_k2: toNum(fB.ni_k2) || undefined,
          ai_k2: toNum(fB.ai_k2) || undefined,
          pmax: toNum(fB.pmax_kw) || undefined,
          cosphi: calcB.cosphi || undefined,
          k1_tarif, k1_montant, k2_tarif, k2_montant,
          ps_kw: toNum(fB.ps_kw), tarif_pf: pf_tarif, prime_fixe,
          pdp, cosphi_montant, tco, redevance,
          montant_ht, tva, total_facture,
        })
      }

      const fileName = [
        'Saisie manuelle',
        meta.categorie,
        meta.reference || null,
        meta.invoiceDate ? new Date(meta.invoiceDate).toLocaleDateString('fr-FR', { month: '2-digit', year: 'numeric' }) : null,
      ].filter(Boolean).join(' — ')

      await createInvoice(
        meta.auditId,
        organization.id,
        {
          file_name:        fileName,
          invoice_date:     meta.invoiceDate || undefined,
          amount:           mttc,
          supplier:         'SENELEC',
          notes:            meta.reference ? `Réf: ${meta.reference}` : undefined,
          status:           'verified',
          confidence_score: 100,
          ocr_data,
        },
        user.id,
      )

      toast({ title: 'Facture enregistrée', description: `${fileName} — ${mttc.toLocaleString('fr-FR')} FCFA` })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer la facture', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderTemplatePicker = () => (
    <div className="shrink-0 bg-[#0a0c14] border-b border-white/[0.07] px-8 py-5 space-y-5">
      {/* Row 1: Meta — 4 colonnes bien dimensionnées */}
      <div className="grid grid-cols-4 gap-5 items-end">
        <Field label="Projet *">
          <Select
            value={meta.auditId}
            onValueChange={(v) => setMeta((p) => ({ ...p, auditId: v }))}
            disabled={loadingAudits}
          >
            <SelectTrigger className={cn(inp, 'h-10 text-sm')}>
              <SelectValue placeholder={loadingAudits ? 'Chargement…' : 'Choisir un projet'} />
            </SelectTrigger>
            <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
              {audits.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date facture *">
          <TF type="date" value={meta.invoiceDate} onChange={(v) => setMeta((p) => ({ ...p, invoiceDate: v }))} className="h-10" />
        </Field>
        <Field label="Référence">
          <TF value={meta.reference} onChange={(v) => setMeta((p) => ({ ...p, reference: v }))} placeholder="FAC-001" className="h-10" />
        </Field>
        <Field label="Grille tarifaire">
          <Select
            value={String(meta.grilleAnnee)}
            onValueChange={(v) => setMeta((p) => ({ ...p, grilleAnnee: Number(v) as TariffYear }))}
          >
            <SelectTrigger className={cn(inp, 'h-10 text-sm')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
              {([2017, 2019, 2023, 2026] as TariffYear[]).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Row 2: Tension segment + category pills */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tension segment control */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-xl p-1 border border-white/[0.08]">
          {(['BT', 'MT', 'HT'] as Tension[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => requestTension(t)}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-bold transition-all',
                meta.tension === t
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-900/40'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Chevron separator */}
        {meta.tension && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}

        {/* Category pills */}
        {meta.tension && CATEGORIES_BY_TENSION[meta.tension].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => requestCategorie(cat)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              meta.categorie === cat
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 shadow-sm shadow-emerald-900/30'
                : 'bg-white/[0.03] border-white/[0.09] text-slate-500 hover:text-slate-200 hover:border-white/20 hover:bg-white/[0.06]',
            )}
          >
            {cat}
          </button>
        ))}

        {/* WOYOFAL toggle — BT PP only */}
        {meta.tension === 'BT' && meta.categorie && BT_PP_CATS.includes(meta.categorie) && (
          <>
            <div className="h-5 w-px bg-white/10" />
            <button
              type="button"
              onClick={() => setMeta((p) => ({ ...p, isWoyofal: !p.isWoyofal }))}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                meta.isWoyofal
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-200 shadow-sm shadow-blue-900/30'
                  : 'bg-white/[0.03] border-white/[0.09] text-slate-500 hover:text-slate-200 hover:border-white/20',
              )}
            >
              WOYOFAL
            </button>
          </>
        )}
      </div>

      {/* Template badge */}
      {templateType && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <div className="w-7 h-7 rounded-lg bg-amber-500/25 border border-amber-500/30 flex items-center justify-center text-xs font-black text-amber-300 shrink-0">
              {templateType}
            </div>
            <span className="text-sm font-medium text-amber-300/90">
              {templateType === 'A' && 'BT Petite/Moyenne Puissance — Tranches progressives'}
              {templateType === 'B' && 'Grande Puissance / Moyenne Tension — Bi-horaire K1/K2'}
              {templateType === 'C' && 'Haute Tension — Bi-horaire + Transformateur'}
            </span>
          </div>
          {meta.isWoyofal && (
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/25">
              <span className="text-sm font-medium text-blue-300">WOYOFAL — T3 facturé au tarif T2</span>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Template A ──────────────────────────────────────────────────────────────

  const renderTemplateA = () => {
    if (!calcA) return null
    const { nj_auto, nj, conso_auto, conso, tranches, montant_conso, redevance, tco, tva_auto, tva, total_auto, total_facture, arrondi, timbre, solde_global } = calcA
    const cat = meta.categorie as 'DPP' | 'DMP' | 'PPP' | 'PMP'

    return (
      <div className="space-y-2 pb-8">

        {/* Zone 1 — Identité */}
        <SectionTitle>Zone 1 — Identité client</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          <Field label="N° Client"><TF value={fA.num_client} onChange={(v) => setFa(p => ({ ...p, num_client: v }))} /></Field>
          <Field label="N° Police"><TF value={fA.num_police} onChange={(v) => setFa(p => ({ ...p, num_police: v }))} /></Field>
          <Field label="N° Compteur"><TF value={fA.num_compteur} onChange={(v) => setFa(p => ({ ...p, num_compteur: v }))} /></Field>
          <Field label="Agence"><TF value={fA.agence} onChange={(v) => setFa(p => ({ ...p, agence: v }))} /></Field>
          <Field label="Nom / Raison sociale" className="col-span-2"><TF value={fA.nom} onChange={(v) => setFa(p => ({ ...p, nom: v }))} /></Field>
          <Field label="Adresse livraison" className="col-span-1"><TF value={fA.adresse} onChange={(v) => setFa(p => ({ ...p, adresse: v }))} /></Field>
          <Field label="Statut">
            <Select value={fA.statut} onValueChange={(v) => setFa(p => ({ ...p, statut: v }))}>
              <SelectTrigger className={cn(inp)}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
                {['Ordinaire', 'Industriel', 'Agricole', 'Administration'].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Zone 2 — Consommation */}
        <SectionTitle>Zone 2 — Période & relevé</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Date début">
            <TF type="date" value={fA.date_debut} onChange={(v) => setFa(p => ({ ...p, date_debut: v }))} />
          </Field>
          <Field label="Date fin">
            <TF type="date" value={fA.date_fin} onChange={(v) => setFa(p => ({ ...p, date_fin: v }))} />
          </Field>
          <OverrideField
            label="Nb jours (NJ)"
            calcValue={nj_auto ?? 0}
            overrideValue={fA.nj_override}
            isManual={fA.nj_manual}
            onOverrideChange={(v) => setFa(p => ({ ...p, nj_override: v }))}
            onToggleManual={(v) => setFa(p => ({ ...p, nj_manual: v }))}
            unit="j"
          />
          <Field label="Type facture">
            <Select value={fA.type_facture} onValueChange={(v) => setFa(p => ({ ...p, type_facture: v }))}>
              <SelectTrigger className={cn(inp)}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
                {['Ordinaire', 'Estimée', 'Rectificative', 'Résiliation'].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ancien Index (kWh)">
            <TF value={fA.ancien_index} onChange={(v) => setFa(p => ({ ...p, ancien_index: v }))} placeholder="AI" />
          </Field>
          <Field label="Nouvel Index (kWh)">
            <TF value={fA.nouvel_index} onChange={(v) => setFa(p => ({ ...p, nouvel_index: v }))} placeholder="NI" />
          </Field>
          <OverrideField
            label="Consommation (kWh)"
            calcValue={conso_auto}
            overrideValue={fA.conso_override}
            isManual={fA.conso_manual}
            onOverrideChange={(v) => setFa(p => ({ ...p, conso_override: v }))}
            onToggleManual={(v) => setFa(p => ({ ...p, conso_manual: v }))}
            unit="kWh"
          />
          <Field label="N° Facture"><TF value={fA.num_facture} onChange={(v) => setFa(p => ({ ...p, num_facture: v }))} /></Field>
          <Field label="Date limite paiement" className="col-span-1">
            <TF type="date" value={fA.date_limite} onChange={(v) => setFa(p => ({ ...p, date_limite: v }))} />
          </Field>
        </div>

        {/* Zone 3 — Tranches */}
        <SectionTitle>Zone 3 — Tableau des tranches</SectionTitle>
        {!conso || !nj ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/[0.025] border border-dashed border-white/[0.08] text-slate-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Renseigner les index (AI/NI) et les dates pour calculer les tranches.
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Tranche</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">kWh</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Tarif FCFA/kWh</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Montant FCFA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {[
                  { label: `T1 — Tranche 1`, kwh: tranches?.t1_kwh ?? 0, montant: tranches?.t1_montant ?? 0, tarif: calcA.r1, override: fA.tarif_t1_override, manual: fA.tarif_t1_manual, fieldT: 'tarif_t1_override' as const, fieldM: 'tarif_t1_manual' as const },
                  { label: `T2 — Tranche 2`, kwh: tranches?.t2_kwh ?? 0, montant: tranches?.t2_montant ?? 0, tarif: calcA.r2, override: fA.tarif_t2_override, manual: fA.tarif_t2_manual, fieldT: 'tarif_t2_override' as const, fieldM: 'tarif_t2_manual' as const },
                  { label: `T3${meta.isWoyofal ? ' (WOYOFAL→T2)' : ''}`, kwh: tranches?.t3_kwh ?? 0, montant: tranches?.t3_montant ?? 0, tarif: calcA.r3, override: fA.tarif_t3_override, manual: fA.tarif_t3_manual, fieldT: 'tarif_t3_override' as const, fieldM: 'tarif_t3_manual' as const },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-slate-400">{row.label}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmt(row.kwh)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.manual && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1 py-0">M</Badge>}
                        <Input
                          value={row.manual ? row.override : (row.tarif ? String(row.tarif) : '')}
                          onChange={(e) => setFa(p => ({ ...p, [row.fieldT]: e.target.value }))}
                          onFocus={() => setFa(p => ({ ...p, [row.fieldM]: true }))}
                          className={cn('h-7 w-28 text-right text-sm', row.manual ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : inpCalc)}
                        />
                        {row.manual && (
                          <button type="button" onClick={() => setFa(p => ({ ...p, [row.fieldT]: '', [row.fieldM]: false }))}
                            className="text-slate-600 hover:text-slate-400"><RotateCcw className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 font-medium tabular-nums">{fmt(row.montant)}</td>
                  </tr>
                ))}
                <tr className="bg-white/[0.04] font-semibold">
                  <td className="px-4 py-3 text-slate-300" colSpan={3}>Montant consommation</td>
                  <td className="px-4 py-3 text-right text-slate-100 tabular-nums">{fmt(montant_conso)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Zone 4 — Taxes & totaux */}
        <SectionTitle>Zone 4 — Taxes et totaux</SectionTitle>
        <div className="rounded-lg border border-white/[0.07] overflow-hidden">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-white/[0.05]">
              {/* TCO */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-400 w-[55%]">TCO — Taxe Communale (2,5%)</td>
                <td className="px-3 py-2 text-right">
                  <OverrideField
                    label=""
                    calcValue={calcA.tco}
                    overrideValue={fA.tco_override}
                    isManual={fA.tco_manual}
                    onOverrideChange={(v) => setFa(p => ({ ...p, tco_override: v }))}
                    onToggleManual={(v) => setFa(p => ({ ...p, tco_manual: v }))}
                  />
                </td>
              </tr>
              {/* Redevance */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-400">Redevance compteur (FCFA)</td>
                <td className="px-3 py-2 text-right">
                  <OverrideField
                    label=""
                    calcValue={calcA.redevance_default}
                    overrideValue={fA.redevance_override}
                    isManual={fA.redevance_manual}
                    onOverrideChange={(v) => setFa(p => ({ ...p, redevance_override: v }))}
                    onToggleManual={(v) => setFa(p => ({ ...p, redevance_manual: v }))}
                  />
                </td>
              </tr>
              {/* TVA */}
              <tr>
                <td className="px-3 py-2 text-slate-400">
                  Base TVA
                  {(cat === 'DPP' || cat === 'DMP') && (
                    <span className="ml-1 text-slate-600 text-[10px]">(T3+TCO+Redevance — T1/T2 exonérés)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{fmt(calcA.tva_base)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-400">TVA 18%</td>
                <td className="px-3 py-2">
                  <OverrideField
                    label=""
                    calcValue={tva_auto}
                    overrideValue={fA.tva_override}
                    isManual={fA.tva_manual}
                    onOverrideChange={(v) => setFa(p => ({ ...p, tva_override: v }))}
                    onToggleManual={(v) => setFa(p => ({ ...p, tva_manual: v }))}
                  />
                </td>
              </tr>
              {/* Reprise arrondi */}
              <tr>
                <td className="px-3 py-2 text-slate-400">Reprise d'arrondi</td>
                <td className="px-3 py-2">
                  <TF value={fA.reprise_arrondi} onChange={(v) => setFa(p => ({ ...p, reprise_arrondi: v }))} placeholder="0" className="text-right h-7 text-xs w-full" />
                </td>
              </tr>
              <tr className="bg-amber-500/[0.06] font-semibold">
                <td className="px-3 py-2 text-amber-300">Total Facture</td>
                <td className="px-3 py-2">
                  <OverrideField
                    label=""
                    calcValue={total_auto}
                    overrideValue={fA.total_override}
                    isManual={fA.total_manual}
                    onOverrideChange={(v) => setFa(p => ({ ...p, total_override: v }))}
                    onToggleManual={(v) => setFa(p => ({ ...p, total_manual: v }))}
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500">Arrondi à reporter</td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{arrondi !== 0 ? fmt(arrondi, 2) : '—'}</td>
              </tr>
              {/* Règlement espèces / timbre */}
              <tr>
                <td className="px-3 py-2 text-slate-400">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fA.reglement_especes}
                      onChange={(e) => setFa(p => ({ ...p, reglement_especes: e.target.checked }))}
                      className="w-3 h-3 accent-amber-500"
                    />
                    Règlement espèces — Timbre fiscal (1%)
                  </label>
                </td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">
                  {fA.reglement_especes ? fmt(timbre) : '—'}
                </td>
              </tr>
              {fA.reglement_especes && (
                <tr className="bg-white/[0.03] font-semibold">
                  <td className="px-3 py-2 text-slate-300">Total sommes dues</td>
                  <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(solde_global)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Zone 5 — Rappel impayées */}
        {renderRappels(fA.rappels, (r) => setFa(p => ({ ...p, rappels: r })), calcA.rappels_total, calcA.solde_global)}
      </div>
    )
  }

  // ── Template B/C ──────────────────────────────────────────────────────────

  const renderTemplateBC = () => {
    if (!calcB) return null
    const {
      nj_auto, nj, conso_k1_auto, conso_k2_auto, conso_k1, conso_k2,
      total_fact_k1, total_fact_k2, total_fact_total,
      k1_tarif, k2_tarif, pf_tarif, k1_montant, k2_montant, prime_fixe,
      depassement, pdp_auto, pdp, cosphi_montant, tco, redevance,
      montant_ht, tva_auto, tva, total_auto, total_facture, arrondi, solde_global,
    } = calcB

    return (
      <div className="space-y-2 pb-8">

        {/* Zone 1 — Contrat */}
        <SectionTitle>Zone 1 — Contrat</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          <Field label="N° Client"><TF value={fB.num_client} onChange={(v) => setFb(p => ({ ...p, num_client: v }))} /></Field>
          <Field label="N° Compte Contrat"><TF value={fB.num_contrat} onChange={(v) => setFb(p => ({ ...p, num_contrat: v }))} /></Field>
          <Field label="N° Police"><TF value={fB.num_police} onChange={(v) => setFb(p => ({ ...p, num_police: v }))} /></Field>
          <Field label="N° Compteur"><TF value={fB.num_compteur} onChange={(v) => setFb(p => ({ ...p, num_compteur: v }))} /></Field>
          <Field label="Nom / Raison sociale" className="col-span-2"><TF value={fB.nom} onChange={(v) => setFb(p => ({ ...p, nom: v }))} /></Field>
          <Field label="Adresse"><TF value={fB.adresse} onChange={(v) => setFb(p => ({ ...p, adresse: v }))} /></Field>
          <Field label="Agence"><TF value={fB.agence} onChange={(v) => setFb(p => ({ ...p, agence: v }))} /></Field>
        </div>

        {/* Zone 2 — Paramètres techniques */}
        <SectionTitle>Zone 2 — Paramètres techniques</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Puissance transfo (kVA)">
            <TF value={fB.puissance_transfo_kva} onChange={(v) => setFb(p => ({ ...p, puissance_transfo_kva: v }))} placeholder="kVA" />
          </Field>
          <Field label="PS souscrite (kW)">
            <TF value={fB.ps_kw} onChange={(v) => setFb(p => ({ ...p, ps_kw: v }))} placeholder="kW" />
          </Field>
          <Field label="Pmax relevée (kW)">
            <TF value={fB.pmax_kw} onChange={(v) => setFb(p => ({ ...p, pmax_kw: v }))} placeholder="kW" />
          </Field>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 font-medium">Dépassement PS</Label>
            <div className={cn('h-9 px-3 flex items-center rounded-md text-sm border', depassement > 0 ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/[0.025] border-white/[0.06] text-slate-500')}>
              {depassement > 0 ? `+${fmt(depassement)} kW` : '—'}
            </div>
          </div>
          <Field label="Cosinus phi (cosφ)">
            <TF value={fB.cosphi} onChange={(v) => setFb(p => ({ ...p, cosphi: v }))} placeholder="0.85" />
          </Field>
          <Field label="Type comptage">
            <Select value={fB.type_comptage} onValueChange={(v) => setFb(p => ({ ...p, type_comptage: v }))}>
              <SelectTrigger className={cn(inp)}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
                {['MT/BT', 'MT Direct', 'BT/BT'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rapport TC — a">
            <TF value={fB.rapport_tc_a} onChange={(v) => setFb(p => ({ ...p, rapport_tc_a: v }))} placeholder="0" />
          </Field>
          <Field label="a' (correction TC)">
            <TF value={fB.rapport_tc_a_prime} onChange={(v) => setFb(p => ({ ...p, rapport_tc_a_prime: v }))} placeholder="0" />
          </Field>
          <Field label="Rapport TP — r">
            <TF value={fB.rapport_tp_r} onChange={(v) => setFb(p => ({ ...p, rapport_tp_r: v }))} placeholder="0" />
          </Field>
          <Field label="r' (correction TP)">
            <TF value={fB.rapport_tp_r_prime} onChange={(v) => setFb(p => ({ ...p, rapport_tp_r_prime: v }))} placeholder="0" />
          </Field>
        </div>

        {/* Zone 2 HT — champs transformateur */}
        {templateType === 'C' && (
          <>
            <SectionTitle>Transformateur HT</SectionTitle>
            <div className="grid grid-cols-4 gap-4">
              <Field label="Tension primaire (kV)">
                <TF value={fB.tension_primaire_kv} onChange={(v) => setFb(p => ({ ...p, tension_primaire_kv: v }))} placeholder="kV" />
              </Field>
              <Field label="Tension secondaire (kV)">
                <TF value={fB.tension_secondaire_kv} onChange={(v) => setFb(p => ({ ...p, tension_secondaire_kv: v }))} placeholder="kV" />
              </Field>
              <Field label="Puissance assignée (kVA)">
                <TF value={fB.puissance_assignee_kva} onChange={(v) => setFb(p => ({ ...p, puissance_assignee_kva: v }))} placeholder="kVA" />
              </Field>
              <Field label="Pertes à vide (kW)">
                <TF value={fB.pertes_vide_kw} onChange={(v) => setFb(p => ({ ...p, pertes_vide_kw: v }))} placeholder="kW" />
              </Field>
              <Field label="Pertes en charge (kW)">
                <TF value={fB.pertes_charge_kw} onChange={(v) => setFb(p => ({ ...p, pertes_charge_kw: v }))} placeholder="kW" />
              </Field>
              <Field label="Impédance cc (%)">
                <TF value={fB.impedance_cc_pct} onChange={(v) => setFb(p => ({ ...p, impedance_cc_pct: v }))} placeholder="%" />
              </Field>
            </div>
          </>
        )}

        {/* Zone 3 — Matrice énergie */}
        <SectionTitle>Zone 3 — Matrice énergie bi-horaire</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Date début">
            <TF type="date" value={fB.date_debut} onChange={(v) => setFb(p => ({ ...p, date_debut: v }))} />
          </Field>
          <Field label="Date fin">
            <TF type="date" value={fB.date_fin} onChange={(v) => setFb(p => ({ ...p, date_fin: v }))} />
          </Field>
          <OverrideField
            label="Nb jours (NJ)"
            calcValue={nj_auto ?? 0}
            overrideValue={fB.nj_override}
            isManual={fB.nj_manual}
            onOverrideChange={(v) => setFb(p => ({ ...p, nj_override: v }))}
            onToggleManual={(v) => setFb(p => ({ ...p, nj_manual: v }))}
            unit="j"
          />
          <Field label="Type facture">
            <Select value={fB.type_facture} onValueChange={(v) => setFb(p => ({ ...p, type_facture: v }))}>
              <SelectTrigger className={cn(inp)}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
                {['Ordinaire', 'Estimée', 'Rectificative', 'Résiliation'].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="rounded-lg border border-white/[0.07] overflow-hidden mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-40">—</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">K1 (HHP)</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">K2 (HP)</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">Total</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">Réactif kVARh</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">H1 Transfo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-500">Nouvel Index</td>
                <td className="px-2 py-1"><TF value={fB.ni_k1} onChange={(v) => setFb(p => ({ ...p, ni_k1: v }))} placeholder="—" className="text-right" /></td>
                <td className="px-2 py-1"><TF value={fB.ni_k2} onChange={(v) => setFb(p => ({ ...p, ni_k2: v }))} placeholder="—" className="text-right" /></td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-500">Ancien Index</td>
                <td className="px-2 py-1"><TF value={fB.ai_k1} onChange={(v) => setFb(p => ({ ...p, ai_k1: v }))} placeholder="—" className="text-right" /></td>
                <td className="px-2 py-1"><TF value={fB.ai_k2} onChange={(v) => setFb(p => ({ ...p, ai_k2: v }))} placeholder="—" className="text-right" /></td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Consommation</td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-end gap-1">
                    {fB.conso_k1_manual && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1 py-0">M</Badge>}
                    <Input
                      value={fB.conso_k1_manual ? fB.conso_k1_override : (conso_k1_auto > 0 ? String(conso_k1_auto) : '')}
                      onChange={(e) => setFb(p => ({ ...p, conso_k1_override: e.target.value }))}
                      onFocus={() => setFb(p => ({ ...p, conso_k1_manual: true, conso_k1_override: p.conso_k1_manual ? p.conso_k1_override : (conso_k1_auto > 0 ? String(conso_k1_auto) : '') }))}
                      placeholder="—"
                      className={cn('h-7 w-24 text-right text-sm', fB.conso_k1_manual ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : inpCalc)}
                    />
                    {fB.conso_k1_manual && (
                      <button type="button" onClick={() => setFb(p => ({ ...p, conso_k1_override: '', conso_k1_manual: false }))}
                        className="text-slate-600 hover:text-slate-400"><RotateCcw className="w-3 h-3" /></button>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-end gap-1">
                    {fB.conso_k2_manual && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1 py-0">M</Badge>}
                    <Input
                      value={fB.conso_k2_manual ? fB.conso_k2_override : (conso_k2_auto > 0 ? String(conso_k2_auto) : '')}
                      onChange={(e) => setFb(p => ({ ...p, conso_k2_override: e.target.value }))}
                      onFocus={() => setFb(p => ({ ...p, conso_k2_manual: true, conso_k2_override: p.conso_k2_manual ? p.conso_k2_override : (conso_k2_auto > 0 ? String(conso_k2_auto) : '') }))}
                      placeholder="—"
                      className={cn('h-7 w-24 text-right text-sm', fB.conso_k2_manual ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : inpCalc)}
                    />
                    {fB.conso_k2_manual && (
                      <button type="button" onClick={() => setFb(p => ({ ...p, conso_k2_override: '', conso_k2_manual: false }))}
                        className="text-slate-600 hover:text-slate-400"><RotateCcw className="w-3 h-3" /></button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(conso_k1 + conso_k2)}</td>
                <td className="px-2 py-1"><TF value={fB.conso_reactive} onChange={(v) => setFb(p => ({ ...p, conso_reactive: v }))} placeholder="0" className="text-right" /></td>
                <td className="px-2 py-1"><TF value={fB.h1_transfo} onChange={(v) => setFb(p => ({ ...p, h1_transfo: v }))} placeholder="0" className="text-right" /></td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Rappels</td>
                <td className="px-2 py-1"><TF value={fB.rappel_k1} onChange={(v) => setFb(p => ({ ...p, rappel_k1: v }))} placeholder="0" className="text-right" /></td>
                <td className="px-2 py-1"><TF value={fB.rappel_k2} onChange={(v) => setFb(p => ({ ...p, rappel_k2: v }))} placeholder="0" className="text-right" /></td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                <td className="px-3 py-1.5 text-right text-slate-500">—</td>
              </tr>
              <tr className="bg-white/[0.04] font-semibold">
                <td className="px-3 py-2 text-slate-300">Total à facturer</td>
                <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(total_fact_k1)}</td>
                <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(total_fact_k2)}</td>
                <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(total_fact_total)}</td>
                <td className="px-3 py-2 text-right text-slate-500">—</td>
                <td className="px-3 py-2 text-right text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Zone 4 — Lignes de calcul */}
        <SectionTitle>Zone 4 — Facturation</SectionTitle>
        <div className="rounded-lg border border-white/[0.07] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-[45%]">Désignation</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium">Qté</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium">Tarif</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium">Montant FCFA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {/* K1 */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Montant Énergie K1 (HHP)</td>
                <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{fmt(total_fact_k1)}</td>
                <td className="px-3 py-1.5">
                  <OverrideField label="" calcValue={tariffGrid?.k1 ?? 0} overrideValue={fB.tarif_k1_override} isManual={fB.tarif_k1_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, tarif_k1_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, tarif_k1_manual: v }))} />
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(k1_montant)}</td>
              </tr>
              {/* K2 */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Montant Énergie K2 (HP)</td>
                <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{fmt(total_fact_k2)}</td>
                <td className="px-3 py-1.5">
                  <OverrideField label="" calcValue={tariffGrid?.k2 ?? 0} overrideValue={fB.tarif_k2_override} isManual={fB.tarif_k2_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, tarif_k2_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, tarif_k2_manual: v }))} />
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(k2_montant)}</td>
              </tr>
              {/* Prime fixe */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Prime Fixe Mensuelle</td>
                <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{nj ? `${toNum(fB.ps_kw)} kW × NJ/30` : '—'}</td>
                <td className="px-3 py-1.5">
                  <OverrideField label="" calcValue={tariffGrid?.pf ?? 0} overrideValue={fB.tarif_pf_override} isManual={fB.tarif_pf_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, tarif_pf_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, tarif_pf_manual: v }))} />
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(prime_fixe)}</td>
              </tr>
              {/* PDP — always shown, click-to-edit (parfois PS sans Pmax ou valeur directe) */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">
                  Pénalité dépassement PS
                  {depassement > 0 && <span className="ml-1 text-red-400 text-[10px]">(+{fmt(depassement)} kW)</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-500">K2×1.5</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {fB.pdp_manual && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1 py-0">M</Badge>}
                    <Input
                      value={fB.pdp_manual ? fB.pdp_montant_override : (pdp_auto > 0 ? String(pdp_auto) : '')}
                      onChange={(e) => setFb(p => ({ ...p, pdp_montant_override: e.target.value }))}
                      onFocus={() => setFb(p => ({ ...p, pdp_manual: true, pdp_montant_override: p.pdp_manual ? p.pdp_montant_override : (pdp_auto > 0 ? String(pdp_auto) : '') }))}
                      placeholder={fB.pdp_manual ? '0' : 'Cliquer pour saisir'}
                      className={cn('h-7 w-36 text-right text-sm', fB.pdp_manual ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : cn(inpCalc, 'cursor-text'))}
                    />
                    {fB.pdp_manual && (
                      <button type="button" onClick={() => setFb(p => ({ ...p, pdp_montant_override: '', pdp_manual: false }))}
                        className="text-slate-600 hover:text-slate-400 shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {/* Cos phi */}
              {calcB.cosphi > 0 && (
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 text-slate-400">
                    Application Cosφ ({calcB.cosphi})
                    {cosphi_montant < 0 && <span className="ml-1 text-emerald-400 text-[10px]">BONUS</span>}
                    {cosphi_montant > 0 && <span className="ml-1 text-red-400 text-[10px]">MALUS</span>}
                  </td>
                  <td className="px-3 py-1.5" colSpan={2} />
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', cosphi_montant < 0 ? 'text-emerald-300' : cosphi_montant > 0 ? 'text-red-300' : 'text-slate-500')}>
                    {cosphi_montant !== 0 ? fmt(cosphi_montant) : '—'}
                  </td>
                </tr>
              )}
              {/* TCO */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">
                  TCO — Taxe Communale
                  {meta.tension !== 'BT' && <span className="ml-1 text-slate-600 text-[10px]">(0 — MT/HT)</span>}
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right text-slate-500">{meta.tension === 'BT' ? '2.5%' : '0%'}</td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(tco) || '—'}</td>
              </tr>
              {/* Redevance */}
              <tr className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-slate-400">Redevance (FCFA)</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5">
                  <OverrideField label="" calcValue={calcB.redevance_default} overrideValue={fB.redevance_override} isManual={fB.redevance_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, redevance_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, redevance_manual: v }))} />
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{fmt(redevance)}</td>
              </tr>
              <tr className="bg-white/[0.04] font-semibold">
                <td className="px-3 py-2 text-slate-300" colSpan={3}>Montant Total HT</td>
                <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(montant_ht)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-400">TVA 18%</td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{fmt(montant_ht)}</td>
                <td className="px-3 py-2 text-right text-slate-500">18%</td>
                <td className="px-3 py-2">
                  <OverrideField
                    label=""
                    calcValue={tva_auto}
                    overrideValue={fB.tva_override}
                    isManual={fB.tva_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, tva_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, tva_manual: v }))}
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-400">Reprise d'arrondi</td>
                <td className="px-3 py-2" colSpan={2} />
                <td className="px-2 py-1">
                  <TF value={fB.reprise_arrondi} onChange={(v) => setFb(p => ({ ...p, reprise_arrondi: v }))} placeholder="0" className="text-right h-7 text-xs" />
                </td>
              </tr>
              <tr className="bg-amber-500/[0.06] font-semibold">
                <td className="px-3 py-2 text-amber-300" colSpan={3}>Total Facture</td>
                <td className="px-3 py-2">
                  <OverrideField
                    label=""
                    calcValue={total_auto}
                    overrideValue={fB.total_override}
                    isManual={fB.total_manual}
                    onOverrideChange={(v) => setFb(p => ({ ...p, total_override: v }))}
                    onToggleManual={(v) => setFb(p => ({ ...p, total_manual: v }))}
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500" colSpan={3}>Arrondi à reporter</td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{arrondi !== 0 ? fmt(arrondi, 2) : '—'}</td>
              </tr>
              <tr className="bg-white/[0.03] font-semibold">
                <td className="px-3 py-2 text-slate-300" colSpan={3}>Montant Total TTC</td>
                <td className="px-3 py-2 text-right text-slate-100 tabular-nums">{fmt(total_facture)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Zone 5 — Rappel impayées */}
        {renderRappels(fB.rappels, (r) => setFb(p => ({ ...p, rappels: r })), calcB.rappels_total, solde_global)}
      </div>
    )
  }

  // ── Zone 5 — shared rappel renderer ──────────────────────────────────────

  type Rappel = { id: string; num_facture: string; date: string; debit: string; credit: string }

  const renderRappels = (
    rappels: Rappel[],
    setRappels: (r: Rappel[]) => void,
    rappels_total: number,
    solde_global: number,
  ) => {
    const addRappel = () => setRappels([...rappels, { id: crypto.randomUUID(), num_facture: '', date: '', debit: '', credit: '' }])
    const updateRappel = (id: string, field: string, value: string) =>
      setRappels(rappels.map(r => r.id === id ? { ...r, [field]: value } : r))
    const deleteRappel = (id: string) => setRappels(rappels.filter(r => r.id !== id))

    return (
      <>
        <SectionTitle>Zone 5 — Rappel impayées</SectionTitle>
        {rappels.length > 0 && (
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 px-1 mb-1">
              <p className="text-[10px] text-slate-600">N° Facture</p>
              <p className="text-[10px] text-slate-600 w-32">Date</p>
              <p className="text-[10px] text-slate-600 w-28">Débit</p>
              <p className="text-[10px] text-slate-600 w-28">Crédit</p>
              <p className="w-8" />
            </div>
            {rappels.map((r) => (
              <RappelRow
                key={r.id}
                row={r}
                onChange={(field, value) => updateRappel(r.id, field, value)}
                onDelete={() => deleteRappel(r.id)}
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRappel}
          className="text-slate-500 hover:text-slate-300 border border-dashed border-white/[0.12] hover:border-white/25 hover:bg-white/[0.03] w-full text-xs h-9"
        >
          + Ajouter une ligne impayée
        </Button>
        {rappels.length > 0 && (
          <div className="flex justify-between text-xs px-1 mt-2">
            <span className="text-slate-500">Solde autres factures</span>
            <span className="text-slate-300 tabular-nums">{fmt(rappels_total)} FCFA</span>
          </div>
        )}
        {rappels.length > 0 && (
          <div className="flex justify-between text-sm font-semibold px-1 mt-1 pt-2 border-t border-white/[0.07]">
            <span className="text-slate-200">Total sommes dues</span>
            <span className="text-amber-300 tabular-nums">{fmt(solde_global)} FCFA</span>
          </div>
        )}
      </>
    )
  }

  // ─── Root render ───────────────────────────────────────────────────────────

  const canSave = !!(meta.auditId && meta.invoiceDate && templateType && (
    templateType === 'A' ? (calcA?.total_facture ?? 0) > 0 : (calcB?.total_facture ?? 0) > 0
  ))

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="!w-[65vw] !max-w-none min-w-[820px] p-0 bg-[#0d0f1a] border-l border-white/[0.09] flex flex-col shadow-[-24px_0_80px_rgba(0,0,0,0.6)]"
        >
          {/* Header sticky */}
          <SheetHeader className="shrink-0 px-8 pt-6 pb-5 border-b border-white/[0.07] bg-[#09091280] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.05] to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-amber-500/50 via-amber-500/20 to-transparent" />
            <SheetTitle className="text-slate-100 flex items-center gap-4 relative">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-100 font-semibold text-base leading-tight">Saisie manuelle</span>
                <span className="text-slate-500 text-sm font-normal">Facture SENELEC</span>
              </div>
            </SheetTitle>
          </SheetHeader>

          {/* Template picker sticky */}
          {renderTemplatePicker()}

          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto px-8 pt-2">
            {!templateType && (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <Zap className="w-6 h-6 text-slate-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-slate-400 font-medium">Choisir le domaine de tension</p>
                  <p className="text-xs text-slate-600">Sélectionner BT, MT ou HT puis une catégorie tarifaire pour commencer la saisie.</p>
                </div>
              </div>
            )}
            {templateType === 'A' && renderTemplateA()}
            {(templateType === 'B' || templateType === 'C') && renderTemplateBC()}
          </div>

          {/* Footer sticky */}
          <div className="shrink-0 px-8 py-5 border-t border-white/[0.07] bg-[#09091280] flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-slate-100 border border-white/[0.12] hover:border-white/25 h-10 px-5"
            >
              Annuler
            </Button>

            {/* Calculatrice comparaison — visible dès que type = Estimée */}
            {templateType && ((templateType === 'A' && fA.type_facture === 'Estimée') || ((templateType === 'B' || templateType === 'C') && fB.type_facture === 'Estimée')) && (
              <div className="flex items-center gap-3 flex-1 mx-2 px-4 py-2.5 rounded-xl bg-blue-500/[0.07] border border-blue-500/20">
                <Calculator className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex items-center gap-5 flex-1">
                  <div>
                    <p className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1">Montant SENELEC réel</p>
                    <Input
                      type="number"
                      value={meta.facture_reelle}
                      onChange={(e) => setMeta(p => ({ ...p, facture_reelle: e.target.value }))}
                      placeholder="Saisir montant facture…"
                      className={cn(inp, 'h-8 text-sm w-44')}
                    />
                  </div>
                  <div className="h-8 w-px bg-white/10 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notre estimation</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-300">
                      {(templateType === 'A' ? calcA?.total_facture : calcB?.total_facture ?? 0)?.toLocaleString('fr-FR')} FCFA
                    </p>
                  </div>
                  <div className="h-8 w-px bg-white/10 shrink-0" />
                  <div>
                    <p className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1">Seuil tolérance</p>
                    <div className="relative w-24">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={meta.seuil_tolerance}
                        onChange={(e) => setMeta(p => ({ ...p, seuil_tolerance: e.target.value }))}
                        placeholder="10"
                        className={cn(inp, 'h-8 text-sm pr-6')}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">%</span>
                    </div>
                  </div>
                  {meta.facture_reelle && (() => {
                    const notre = templateType === 'A' ? (calcA?.total_facture ?? 0) : (calcB?.total_facture ?? 0)
                    const reel = toNum(meta.facture_reelle)
                    const ecart = notre - reel
                    const seuil = toNum(meta.seuil_tolerance)
                    const pctEcart = reel > 0 ? Math.abs(ecart) / reel * 100 : 0
                    const depasse = reel > 0 && pctEcart > seuil
                    return (
                      <>
                        <div className="h-8 w-px bg-white/10 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Écart (estimé − réel)</p>
                          <div className="flex items-baseline gap-2">
                            <p className={cn('text-sm font-bold tabular-nums', depasse ? 'text-red-400' : 'text-emerald-400')}>
                              {ecart > 0 ? '+' : ''}{Math.round(ecart).toLocaleString('fr-FR')} FCFA
                            </p>
                            <span className={cn('text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded', depasse ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400')}>
                              {pctEcart.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            <div className="flex items-center gap-5">
              {/* Total preview */}
              {canSave && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Total facture</p>
                  <p className="text-xl font-bold text-amber-300 tabular-nums leading-none">
                    {(templateType === 'A' ? calcA?.total_facture : calcB?.total_facture ?? 0)?.toLocaleString('fr-FR')}
                    <span className="text-sm text-amber-500/60 font-normal ml-1.5">FCFA</span>
                  </p>
                </div>
              )}
              <Button
                onClick={handleSave}
                disabled={saving || !canSave}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold min-w-[160px] h-11 text-base"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Enregistrement…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Enregistrer
                  </span>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation changement template */}
      <AlertDialog open={showSwitchWarning} onOpenChange={setShowSwitchWarning}>
        <AlertDialogContent className="bg-[#0d0f1a] border border-white/10 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Changer de template
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Ce changement va passer vers un template différent (A ↔ B/C).
              Toutes les données saisies dans la zone consommation seront effacées.
              Les informations de projet et date seront conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { setPendingTension(null); setPendingCat(null) }}
              className="bg-transparent border-white/10 text-slate-400 hover:text-slate-100 hover:bg-white/5"
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSwitch}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            >
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
