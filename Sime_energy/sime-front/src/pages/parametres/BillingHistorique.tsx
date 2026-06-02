/**
 * BillingHistorique.tsx
 * Dashboard analyse historique des factures d'un audit.
 * Graphiques + tableau récap + KPI strip + anomalies + vérification moulinette.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, ReferenceLine, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { getVerifiedInvoicesForAudit } from '@/lib/billing-params-service'
import { mapOcrToInvoiceData, mapSenelecToInvoiceData } from '@/lib/invoice-mapper'
import { getFacturesSenelecForSelector } from '@/lib/factures-senelec-service'
import { calculateBillingKPIs } from '@/lib/billing-calculator'
import { verifyInvoice } from '@/lib/billing-verifier'
import { detectAnomalies, type BillingAnomaly } from '@/lib/billing-anomaly-detector'
import type { AuditBillingParamsDB } from '@/types/billing'
import type { BillingParams } from '@/types/billing'
import type { TariffCategory, TariffYear } from '@/constants/senelec-tariffs'
import { AlertTriangle, CheckCircle2, AlertCircle, Info, TrendingDown, Zap, Receipt, Activity, Plus, X, FileSpreadsheet, FileText, ChevronLeft, ChevronRight, MapPin, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

// ─── Types internes ────────────────────────────────────────────────────────────

interface ManualAnomaly {
  label: string
  severity: 'info' | 'warning' | 'error'
}

interface ChartRow {
  label:     string          // "Jan 24" etc.
  kwh:       number
  mttc:      number
  ipr:       number
  k2_pct:    number | null
  pmax:      number | null
  cosphi:    number | null
  nj:        number | null
  // Tranches BT (null si non disponibles — GP/MT)
  t1_kwh:     number | null
  t1_tarif:   number | null
  t1_montant: number | null
  t2_kwh:     number | null
  t2_tarif:   number | null
  t2_montant: number | null
  t3_kwh:     number | null
  t3_tarif:   number | null
  t3_montant: number | null
  verifStatus: 'ok' | 'warning' | 'error' | 'nodata'
  anomalies: BillingAnomaly[]
  invoiceId: string
  invoiceDate: string | null
  source: 'ocr' | 'senelec'
}

// ─── Group analysis types ─────────────────────────────────────────────────────

type SiteAssignmentMap = Record<string, string | null>  // invoiceId → siteId | null
type SiteNameMap       = Record<string, string>          // siteId    → name

interface SiteGroup {
  siteId:   string | null
  siteName: string
  rows:     ChartRow[]
}

interface GroupKPIs {
  nb:          number
  totalKwh:    number
  avgKwh:      number
  totalMttc:   number
  avgMttc:     number
  avgIpr:      number
  avgK2:       number | null
  anomalyCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFcfa(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k`
  return n.toFixed(0)
}

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function dbToParams(db: AuditBillingParamsDB): BillingParams {
  return {
    categorie:              db.categorie_tarifaire as TariffCategory,
    grille_annee:           db.grille_annee as TariffYear,
    puissance_souscrite_kw: db.puissance_souscrite_kw ?? 0,
    periode_jours:          db.periode_reference_jours ?? 30,
    has_transformateur:     db.has_transformateur,
    puissance_transfo_kva:  db.puissance_transfo_kva,
    comptage_position:      db.comptage_position as 'primaire' | 'secondaire' | undefined,
    tco_applicable:         db.tco_applicable,
    tva_applicable:         db.tva_applicable,
  }
}

function monthLabel(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

// ─── Tooltip custom ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d0f1a] border border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-200">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-mono">{typeof p.value === 'number' ? fmtNum(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Statut badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'error' | 'nodata' }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
  if (status === 'warning') return <AlertCircle className="w-4 h-4 text-amber-400" />
  if (status === 'error') return <AlertTriangle className="w-4 h-4 text-red-400" />
  return <Info className="w-4 h-4 text-slate-600" />
}

function AnomalyBadge({ a }: { a: BillingAnomaly }) {
  const colors: Record<BillingAnomaly['severity'], string> = {
    info:    'bg-blue-500/15 text-blue-300 border-blue-500/20',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    error:   'bg-red-500/15 text-red-300 border-red-500/20',
  }
  const labels: Record<BillingAnomaly['type'], string> = {
    estimation:    'Estimé',
    rappel:        'Arriérés',
    index_suspect: 'Index?',
    depassement_ps:'PDP',
    cosphi_faible: 'cosφ',
    k2_excessif:   'K2↑',
  }
  return (
    <span
      title={a.message}
      className={cn('inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border', colors[a.severity])}
    >
      {labels[a.type]}
    </span>
  )
}

// ─── Manual anomaly badge ────────────────────────────────────────────────────

function ManualAnomalyBadge({ a, onRemove }: { a: ManualAnomaly; onRemove: () => void }) {
  const colors: Record<ManualAnomaly['severity'], string> = {
    info:    'bg-blue-500/15 text-blue-300 border-blue-500/20',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    error:   'bg-red-500/15 text-red-300 border-red-500/20',
  }
  return (
    <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border', colors[a.severity])}>
      {a.label}
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
        title="Supprimer"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}

function AddAnomalyPopover({ onAdd }: { onAdd: (a: ManualAnomaly) => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [severity, setSeverity] = useState<ManualAnomaly['severity']>('warning')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    onAdd({ label: trimmed, severity })
    setLabel('')
    setSeverity('warning')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Ajouter une anomalie manuelle"
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-dashed border-slate-600 text-slate-600 hover:border-slate-400 hover:text-slate-400 transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="center"
        className="w-52 p-3 bg-[#0d0f1a] border border-white/10 shadow-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Anomalie manuelle</p>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Libellé (ex: Contrat KW↑)"
            className="w-full bg-[#0f111a] border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
            maxLength={20}
          />
          <Select value={severity} onValueChange={(v) => setSeverity(v as ManualAnomaly['severity'])}>
            <SelectTrigger className="h-7 text-xs bg-[#0f111a] border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d0f1a] border-white/10 text-xs">
              <SelectItem value="info" className="text-blue-300">Info</SelectItem>
              <SelectItem value="warning" className="text-amber-300">Avertissement</SelectItem>
              <SelectItem value="error" className="text-red-300">Erreur</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="submit"
            disabled={!label.trim()}
            className="w-full py-1.5 rounded text-[11px] font-medium bg-slate-700/60 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Ajouter
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, color, label, value, sub,
}: {
  icon: React.ElementType; color: string; label: string; value: string; sub?: string
}) {
  return (
    <div className="bg-[#0f111a] border border-white/[0.07] rounded-xl p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg shrink-0', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-lg font-bold text-slate-100 leading-none">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Group KPI computation ────────────────────────────────────────────────────

function computeGroupKPIs(group: SiteGroup): GroupKPIs {
  const n        = group.rows.length
  const totalKwh = group.rows.reduce((s, r) => s + r.kwh,  0)
  const totalMttc= group.rows.reduce((s, r) => s + r.mttc, 0)
  const avgIpr   = totalKwh > 0
    ? group.rows.reduce((s, r) => s + r.ipr * r.kwh, 0) / totalKwh
    : 0
  const k2Rows   = group.rows.filter(r => r.k2_pct !== null)
  const avgK2    = k2Rows.length > 0
    ? k2Rows.reduce((s, r) => s + (r.k2_pct ?? 0), 0) / k2Rows.length
    : null
  const anomalyCount = group.rows.reduce((s, r) => s + r.anomalies.length, 0)
  return {
    nb: n,
    totalKwh,
    avgKwh:  n > 0 ? totalKwh  / n : 0,
    totalMttc,
    avgMttc: n > 0 ? totalMttc / n : 0,
    avgIpr,
    avgK2,
    anomalyCount,
  }
}

// ─── Site group KPI card ──────────────────────────────────────────────────────

function SiteGroupCard({ group }: { group: SiteGroup }) {
  const kpis = computeGroupKPIs(group)
  const isUnclassified = group.siteId === null

  return (
    <div className={cn(
      'flex-1 min-w-[220px] rounded-xl border bg-[#0f111a] p-4 space-y-3',
      isUnclassified ? 'border-amber-500/20' : 'border-blue-500/20',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
          isUnclassified ? 'bg-amber-500/15' : 'bg-blue-500/15',
        )}>
          {isUnclassified
            ? <Layers className="w-3.5 h-3.5 text-amber-400" />
            : <MapPin  className="w-3.5 h-3.5 text-blue-400" />}
        </div>
        <p className={cn(
          'text-xs font-semibold truncate',
          isUnclassified ? 'text-amber-300' : 'text-blue-300',
        )}>
          {group.siteName}
        </p>
        <span className="ml-auto shrink-0 text-[10px] font-mono text-slate-500 tabular-nums">
          {kpis.nb} facture{kpis.nb > 1 ? 's' : ''}
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5">
        <MetricLine label="kWh moy / facture" value={`${fmtNum(kpis.avgKwh)} kWh`}   color="text-blue-300" />
        <MetricLine label="kWh total"          value={`${fmtNum(kpis.totalKwh)} kWh`} color="text-blue-200/60" />
        <div className="h-px bg-white/[0.04]" />
        <MetricLine label="MTTC moy / facture" value={`${fmtFcfa(kpis.avgMttc)} FCFA`}   color="text-amber-300" />
        <MetricLine label="MTTC total"          value={`${fmtFcfa(kpis.totalMttc)} FCFA`} color="text-amber-200/60" />
        <div className="h-px bg-white/[0.04]" />
        <MetricLine label="IPR moyen"    value={`${fmtNum(kpis.avgIpr, 1)} FCFA/kWh`} color="text-violet-300" />
        {kpis.avgK2 !== null && (
          <MetricLine label="K2 moyen"   value={`${fmtNum(kpis.avgK2, 1)} %`} color={kpis.avgK2 > 10 ? 'text-red-400' : 'text-slate-300'} />
        )}
        {kpis.anomalyCount > 0 && (
          <MetricLine label="Anomalies"  value={String(kpis.anomalyCount)} color="text-red-400" />
        )}
      </div>
    </div>
  )
}

function MetricLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-slate-500 truncate">{label}</span>
      <span className={cn('text-xs font-mono font-semibold shrink-0', color)}>{value}</span>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface BillingHistoriqueProps {
  auditId: string
}

export function BillingHistorique({ auditId }: BillingHistoriqueProps) {
  const [rows, setRows] = useState<ChartRow[]>([])
  const [cm, setCm] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasParams, setHasParams] = useState(false)
  const [manualAnomalies, setManualAnomalies] = useState<Record<string, ManualAnomaly[]>>({})
  const [tablePage, setTablePage] = useState(1)

  // ── Group-by-site state ──
  const [groupBySite,       setGroupBySite]       = useState(false)
  const [siteAssignments,   setSiteAssignments]   = useState<SiteAssignmentMap | null>(null)
  const [siteNames,         setSiteNames]         = useState<SiteNameMap>({})
  const [siteDataLoading,   setSiteDataLoading]   = useState(false)

  const TABLE_PAGE_SIZE = 50

  function addManualAnomaly(invoiceId: string, anomaly: ManualAnomaly) {
    setManualAnomalies(prev => ({
      ...prev,
      [invoiceId]: [...(prev[invoiceId] ?? []), anomaly],
    }))
  }

  function removeManualAnomaly(invoiceId: string, idx: number) {
    setManualAnomalies(prev => ({
      ...prev,
      [invoiceId]: (prev[invoiceId] ?? []).filter((_, i) => i !== idx),
    }))
  }

  useEffect(() => {
    load()
  }, [auditId])

  // Lazy-load site assignments when group mode is turned ON for the first time
  useEffect(() => {
    if (groupBySite && siteAssignments === null && !siteDataLoading) {
      loadSiteData()
    }
  }, [groupBySite])

  async function loadSiteData() {
    setSiteDataLoading(true)
    try {
      const [ocrRes, senRes, sitesRes] = await Promise.all([
        supabase.from('audit_invoices')
          .select('id, classeur_site_id')
          .eq('audit_id', auditId),
        supabase.from('factures_senelec')
          .select('id, classeur_site_id')
          .eq('audit_id', auditId),
        supabase.from('audit_sites')
          .select('id, name')
          .eq('audit_id', auditId),
      ])

      const assignments: SiteAssignmentMap = {}
      for (const inv of ocrRes.data ?? []) {
        assignments[(inv as any).id] = (inv as any).classeur_site_id ?? null
      }
      for (const inv of senRes.data ?? []) {
        assignments[(inv as any).id] = (inv as any).classeur_site_id ?? null
      }

      const names: SiteNameMap = {}
      for (const site of sitesRes.data ?? []) {
        names[(site as any).id] = (site as any).name
      }

      setSiteAssignments(assignments)
      setSiteNames(names)
    } catch (e) {
      console.error('loadSiteData:', e)
    } finally {
      setSiteDataLoading(false)
    }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // 1. Load params + SENELEC rows in parallel
      const [paramsResult, senelecRows] = await Promise.all([
        supabase.from('audit_billing_params').select('*').eq('audit_id', auditId).limit(1),
        getFacturesSenelecForSelector(auditId).catch(() => []),
      ])

      const paramsDb: AuditBillingParamsDB | null = paramsResult.data?.[0] ?? null
      const params: BillingParams | null = paramsDb ? dbToParams(paramsDb) : null
      setHasParams(!!params)

      // 2. Load verified OCR invoices
      const invoicesRaw = await getVerifiedInvoicesForAudit(auditId)

      if (invoicesRaw.length === 0 && senelecRows.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      let cmFirst: number | null = null
      const built: ChartRow[] = []

      // 3. Build OCR rows if any
      if (invoicesRaw.length > 0) {
        const { data: invoicesFull } = await supabase
          .from('audit_invoices')
          .select('*')
          .eq('audit_id', auditId)
          .eq('status', 'verified')
          .order('invoice_date', { ascending: true })

        const invoices = invoicesFull ?? []

        const anomalies = detectAnomalies(invoices as Parameters<typeof detectAnomalies>[0], params)
        const anomalyMap = new Map<string, BillingAnomaly[]>()
        for (const a of anomalies) {
          if (!anomalyMap.has(a.invoiceId)) anomalyMap.set(a.invoiceId, [])
          anomalyMap.get(a.invoiceId)!.push(a)
        }

        for (const inv of invoices) {
          const ocrData = (inv as Record<string, unknown>).ocr_data_verified ?? (inv as Record<string, unknown>).ocr_data
          const invData = mapOcrToInvoiceData(ocrData, inv.amount ?? undefined)

          const kwh  = invData.conso_kwh_total ?? 0
          const mttc = invData.montant_ttc ?? inv.amount ?? 0

          let ipr: number = kwh > 0 && mttc > 0 ? mttc / kwh : 0
          let verifStatus: ChartRow['verifStatus'] = 'nodata'

          if (params && kwh > 0 && mttc > 0) {
            const verif = verifyInvoice(inv as Parameters<typeof verifyInvoice>[0], params)
            if (!verif.no_data) verifStatus = verif.status
            const kpis = calculateBillingKPIs(params, {
              conso_kwh_total:    kwh,
              conso_k1_kwh:       invData.conso_k1_kwh,
              conso_k2_kwh:       invData.conso_k2_kwh,
              montant_energie:    invData.montant_energie,
              montant_prime_fixe: invData.montant_prime_fixe,
              montant_pdp:        invData.montant_pdp,
              montant_cosphi:     invData.montant_cosphi,
              montant_tva:        invData.montant_tva,
              montant_tco:        invData.montant_tco,
              montant_redevance:  invData.montant_redevance,
              montant_ttc:        mttc,
              puissance_max_kw:   invData.puissance_max_kw,
              cosphi_mesure:      invData.cosphi_mesure,
            })
            if (cmFirst === null && kpis.cm_fcfa_kwh > 0) cmFirst = kpis.cm_fcfa_kwh
            ipr = kpis.ipr_fcfa_kwh || ipr
          }

          const k2_pct = invData.conso_k2_kwh && kwh > 0
            ? (invData.conso_k2_kwh / kwh) * 100
            : null

          built.push({
            label:       monthLabel(inv.invoice_date ?? null),
            kwh, mttc, ipr, k2_pct,
            pmax:        invData.puissance_max_kw  ?? null,
            cosphi:      invData.cosphi_mesure     ?? null,
            nj:          invData.periode_jours_ocr ?? null,
            t1_kwh:      invData.tranche1_kwh      ?? null,
            t1_tarif:    invData.tranche1_tarif    ?? null,
            t1_montant:  invData.tranche1_montant  ?? null,
            t2_kwh:      invData.tranche2_kwh      ?? null,
            t2_tarif:    invData.tranche2_tarif    ?? null,
            t2_montant:  invData.tranche2_montant  ?? null,
            t3_kwh:      invData.tranche3_kwh      ?? null,
            t3_tarif:    invData.tranche3_tarif    ?? null,
            t3_montant:  invData.tranche3_montant  ?? null,
            verifStatus,
            anomalies:   anomalyMap.get(inv.id) ?? [],
            invoiceId:   inv.id,
            invoiceDate: inv.invoice_date ?? null,
            source:      'ocr',
          })
        }
      }

      // 4. Build SENELEC rows
      for (const sen of senelecRows) {
        const invData = mapSenelecToInvoiceData(sen)
        const kwh  = invData.conso_kwh_total ?? 0
        const mttc = invData.montant_ttc ?? 0

        let ipr: number = kwh > 0 && mttc > 0 ? mttc / kwh : 0

        if (params && kwh > 0) {
          const kpis = calculateBillingKPIs(params, {
            conso_kwh_total:    kwh,
            conso_k1_kwh:       invData.conso_k1_kwh,
            conso_k2_kwh:       invData.conso_k2_kwh,
            montant_energie:    invData.montant_energie,
            montant_prime_fixe: invData.montant_prime_fixe,
            montant_pdp:        undefined,
            montant_cosphi:     invData.montant_cosphi,
            montant_tva:        invData.montant_tva,
            montant_tco:        invData.montant_tco,
            montant_redevance:  invData.montant_redevance,
            montant_ttc:        mttc,
            puissance_max_kw:   invData.puissance_max_kw,
            cosphi_mesure:      invData.cosphi_mesure,
          })
          if (cmFirst === null && kpis.cm_fcfa_kwh > 0) cmFirst = kpis.cm_fcfa_kwh
          ipr = kpis.ipr_fcfa_kwh || ipr
        }

        const k2_pct = invData.conso_k2_kwh && kwh > 0
          ? (invData.conso_k2_kwh / kwh) * 100
          : null

        built.push({
          label:       monthLabel(sen.date_debut_periode),
          kwh, mttc, ipr, k2_pct,
          pmax:        invData.puissance_max_kw  ?? null,
          cosphi:      invData.cosphi_mesure     ?? null,
          nj:          invData.periode_jours_ocr ?? null,
          t1_kwh: null, t1_tarif: null, t1_montant: null,
          t2_kwh: null, t2_tarif: null, t2_montant: null,
          t3_kwh: null, t3_tarif: null, t3_montant: null,
          verifStatus: 'nodata',
          anomalies:   [],
          invoiceId:   sen.id,
          invoiceDate: sen.date_debut_periode,
          source:      'senelec',
        })
      }

      // 5. Sort chronologically (nulls last)
      built.sort((a, b) => {
        if (!a.invoiceDate && !b.invoiceDate) return 0
        if (!a.invoiceDate) return 1
        if (!b.invoiceDate) return -1
        return a.invoiceDate.localeCompare(b.invoiceDate)
      })

      setCm(cmFirst)
      setRows(built)
      setTablePage(1)
    } catch (e) {
      console.error(e)
      setError('Impossible de charger les données de facturation')
    } finally {
      setLoading(false)
    }
  }

  // ── KPI strip calculations ──
  const kpiTotal = useMemo(() => rows.reduce((s, r) => s + r.mttc, 0), [rows])
  const kpiKwh   = useMemo(() => rows.reduce((s, r) => s + r.kwh, 0), [rows])
  const kpiIpr   = useMemo(() => {
    const weighted = rows.reduce((s, r) => s + r.ipr * r.kwh, 0)
    return kpiKwh > 0 ? weighted / kpiKwh : 0
  }, [rows, kpiKwh])
  const kpiAnomalies = useMemo(
    () => rows.reduce((s, r) => s + r.anomalies.length + (manualAnomalies[r.invoiceId]?.length ?? 0), 0),
    [rows, manualAnomalies],
  )

  // ── Site groups (for group mode) ──
  const siteGroups = useMemo<SiteGroup[] | null>(() => {
    if (!groupBySite || !siteAssignments) return null

    const groupMap = new Map<string, SiteGroup>()
    for (const row of rows) {
      const siteId = siteAssignments[row.invoiceId] ?? null
      const key    = siteId ?? '__unclassified__'
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          siteId,
          siteName: siteId ? (siteNames[siteId] ?? 'Site inconnu') : 'Non classées',
          rows: [],
        })
      }
      groupMap.get(key)!.rows.push(row)
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.siteId === null) return 1
      if (b.siteId === null) return -1
      return a.siteName.localeCompare(b.siteName)
    })
  }, [rows, groupBySite, siteAssignments, siteNames])

  // ─── Loading / error / empty ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        <span className="ml-3 text-sm text-slate-500">Chargement de l'analyse…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-20">
        <Activity className="w-10 h-10 text-slate-600 mx-auto mb-4" />
        <h3 className="text-base font-semibold text-slate-400 mb-2">Aucune donnée de facturation</h3>
        <p className="text-sm text-slate-600 max-w-xs mx-auto">
          Importez des factures OCR vérifiées ou des données SENELEC (Excel) pour voir l'analyse historique ici.
        </p>
      </div>
    )
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── KPI strip header + toggle ── */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Indicateurs clés
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-slate-400">Analyse par site</span>
          <Switch
            checked={groupBySite}
            onCheckedChange={setGroupBySite}
            className="data-[state=checked]:bg-blue-500"
          />
        </label>
      </div>

      {/* ── KPI content — individual or grouped ── */}
      {groupBySite ? (
        siteDataLoading || !siteGroups ? (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
            <div className="w-4 h-4 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin shrink-0" />
            Chargement des données de classement…
          </div>
        ) : siteGroups.length === 0 ? (
          <div className="rounded-xl bg-[#0f111a] border border-white/[0.07] py-8 text-center">
            <MapPin className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Aucune facture classée par site.</p>
            <p className="text-[10px] text-slate-600 mt-1">Utilisez le Classeur pour affecter les factures à vos sites.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {siteGroups.map(group => (
              <SiteGroupCard key={group.siteId ?? '__unclassified__'} group={group} />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={Receipt}
            color="bg-amber-500/10 text-amber-400"
            label="Total période"
            value={`${fmtFcfa(kpiTotal)} FCFA`}
            sub={`${rows.length} facture${rows.length > 1 ? 's' : ''}`}
          />
          <KpiCard
            icon={Zap}
            color="bg-blue-500/10 text-blue-400"
            label="Énergie totale"
            value={`${fmtNum(kpiKwh)} kWh`}
            sub={kpiKwh > 0 ? `${fmtNum(kpiKwh / rows.length)} kWh/mois moy.` : undefined}
          />
          <KpiCard
            icon={TrendingDown}
            color="bg-violet-500/10 text-violet-400"
            label="IPR moyen"
            value={`${fmtNum(kpiIpr, 1)} FCFA/kWh`}
            sub={cm ? `Cm SENELEC : ${fmtNum(cm, 1)} FCFA/kWh` : undefined}
          />
          <KpiCard
            icon={AlertTriangle}
            color={kpiAnomalies > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}
            label="Anomalies détectées"
            value={String(kpiAnomalies)}
            sub={kpiAnomalies === 0 ? 'Aucune anomalie' : `Sur ${rows.length} facture${rows.length > 1 ? 's' : ''}`}
          />
        </div>
      )}

      {/* ── Graphique 1 : kWh (barres) + MTTC FCFA (ligne) ── */}
      <div className="bg-[#0f111a] border border-white/[0.07] rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Consommation kWh &amp; Coût FCFA
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="kwh" orientation="left" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis yAxisId="mttc" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtFcfa(v)} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
            <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
            <Bar yAxisId="kwh" dataKey="kwh" name="kWh" fill="#3b82f680" radius={[3, 3, 0, 0]} />
            <Line yAxisId="mttc" type="monotone" dataKey="mttc" name="MTTC FCFA" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Graphique 2 : IPR vs Cm ── */}
      {cm && (
        <div className="bg-[#0f111a] border border-white/[0.07] rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Indice de Prix Réel (IPR) vs Coût moyen tarifaire (Cm)
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={cm} stroke="#10b981" strokeDasharray="4 2" label={{ value: `Cm ${cm.toFixed(0)}`, fill: '#10b981', fontSize: 9, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="ipr" name="IPR FCFA/kWh" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: '#a78bfa' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tableau récap ── */}
      <div className="bg-[#0f111a] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Récapitulatif par facture</p>
          <span className="text-[11px] text-slate-600 tabular-nums">
            {rows.length} ligne{rows.length > 1 ? 's' : ''}
            {rows.length > TABLE_PAGE_SIZE && ` · page ${tablePage}/${Math.ceil(rows.length / TABLE_PAGE_SIZE)}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          {(() => {
            const hasTranches = rows.some(r => r.t1_kwh !== null || r.t1_montant !== null)
            const hasNj       = rows.some(r => r.nj !== null)
            const pageRows    = rows.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE)
            const totalPages  = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))
            return (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
                    <th className="px-4 py-2 text-left font-medium">Période</th>
                    <th className="px-3 py-2 text-right font-medium">kWh</th>
                    <th className="px-3 py-2 text-right font-medium">MTTC FCFA</th>
                    <th className="px-3 py-2 text-right font-medium">FCFA/kWh</th>
                    <th className="px-3 py-2 text-right font-medium">K2 %</th>
                    <th className="px-3 py-2 text-right font-medium">Pmax kW</th>
                    <th className="px-3 py-2 text-right font-medium">cosφ</th>
                    {hasNj && (
                      <th className="px-3 py-2 text-right font-medium text-slate-500/70">Nj</th>
                    )}
                    {hasTranches && <>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/60">T1 kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/60">T2 kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/60">T3 kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/50">T1 FCFA/kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/50">T2 FCFA/kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-500/50">T3 FCFA/kWh</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-400/40">T1 FCFA</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-400/40">T2 FCFA</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-400/40">T3 FCFA</th>
                    </>}
                    <th className="px-3 py-2 text-center font-medium">Vérif</th>
                    <th className="px-4 py-2 text-left font-medium">Anomalies</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr
                      key={row.invoiceId}
                      className={cn(
                        'border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]',
                        i % 2 === 0 ? '' : 'bg-white/[0.015]',
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {row.source === 'senelec'
                            ? <FileSpreadsheet className="w-3 h-3 text-blue-400 shrink-0" title="Données SENELEC (Excel)" />
                            : <FileText className="w-3 h-3 text-emerald-400 shrink-0" title="Facture OCR vérifiée" />
                          }
                          <span className="text-slate-300 capitalize">
                            {row.invoiceDate
                              ? new Date(row.invoiceDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                              : row.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                        {row.kwh > 0 ? fmtNum(row.kwh) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-300">
                        {row.mttc > 0 ? fmtNum(row.mttc) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-violet-300">
                        {row.ipr > 0 ? fmtNum(row.ipr, 1) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {row.k2_pct !== null
                          ? <span className={row.k2_pct > 10 ? 'text-red-400' : 'text-slate-300'}>{fmtNum(row.k2_pct, 1)}%</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        {row.pmax !== null ? fmtNum(row.pmax, 1) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {row.cosphi !== null
                          ? <span className={row.cosphi < 0.80 ? 'text-red-400' : 'text-slate-300'}>{row.cosphi.toFixed(3)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      {hasNj && (
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                          {row.nj !== null ? row.nj : <span className="text-slate-700">—</span>}
                        </td>
                      )}
                      {hasTranches && <>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-300/70">
                          {row.t1_kwh !== null ? fmtNum(row.t1_kwh) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-300/70">
                          {row.t2_kwh !== null ? fmtNum(row.t2_kwh) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-300/70">
                          {row.t3_kwh !== null ? fmtNum(row.t3_kwh) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-200/50">
                          {row.t1_tarif !== null ? row.t1_tarif.toFixed(2) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-200/50">
                          {row.t2_tarif !== null ? row.t2_tarif.toFixed(2) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-200/50">
                          {row.t3_tarif !== null ? row.t3_tarif.toFixed(2) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-100/35">
                          {row.t1_montant !== null ? fmtNum(row.t1_montant) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-100/35">
                          {row.t2_montant !== null ? fmtNum(row.t2_montant) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-100/35">
                          {row.t3_montant !== null ? fmtNum(row.t3_montant) : <span className="text-slate-700">—</span>}
                        </td>
                      </>}
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={row.verifStatus} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {row.anomalies.map((a, j) => <AnomalyBadge key={j} a={a} />)}
                          {(manualAnomalies[row.invoiceId] ?? []).map((a, j) => (
                            <ManualAnomalyBadge
                              key={`m${j}`}
                              a={a}
                              onRemove={() => removeManualAnomaly(row.invoiceId, j)}
                            />
                          ))}
                          {row.anomalies.length === 0 && !(manualAnomalies[row.invoiceId]?.length) && (
                            <span className="text-slate-700 text-[10px]">Aucune</span>
                          )}
                          <AddAnomalyPopover onAdd={(a) => addManualAnomaly(row.invoiceId, a)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </div>

        {/* Pagination */}
        {rows.length > TABLE_PAGE_SIZE && (() => {
          const totalPages = Math.ceil(rows.length / TABLE_PAGE_SIZE)
          return (
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/[0.06] bg-[#0d0f18]">
              <span className="text-[11px] text-slate-600 tabular-nums">
                {(tablePage - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(tablePage * TABLE_PAGE_SIZE, rows.length)} sur {rows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTablePage(p => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - tablePage) <= 1)
                  .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, idx) =>
                    p === '…'
                      ? <span key={`e${idx}`} className="px-1 text-[11px] text-slate-600">…</span>
                      : <button
                          key={p}
                          onClick={() => setTablePage(p as number)}
                          className={cn(
                            'h-6 min-w-[24px] px-1.5 rounded text-[11px] tabular-nums transition-colors',
                            tablePage === p
                              ? 'bg-amber-500/20 text-amber-400 font-semibold'
                              : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]',
                          )}
                        >
                          {p}
                        </button>
                  )
                }
                <button
                  onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                  disabled={tablePage === totalPages}
                  className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
