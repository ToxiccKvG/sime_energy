import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Calculator, FileText, Database, ChevronDown, CheckCircle2,
  AlertTriangle, AlertCircle, Info, RotateCcw, ShieldAlert, TrendingDown,
  Search, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { runSimulateur } from '@/lib/senelec-simulator'
import { quarantineInvoice, unquarantineInvoice } from '@/lib/invoice-service'
import { mapOcrToInvoiceData } from '@/lib/invoice-mapper'
import {
  CATEGORY_LABELS, CATEGORIES_BY_TENSION, getAvailableTariffYears, suggestTensionFromPS,
} from '@/constants/senelec-tariffs'
import type { SimulateurInput, SimulateurResult } from '@/lib/senelec-simulator'
import type { AuditInvoice } from '@/lib/invoice-service'
import type { TariffCategory } from '@/constants/senelec-tariffs'
import { getFacturesSenelecForSelector } from '@/lib/factures-senelec-service'
import type { FactureSenelecForSelector } from '@/lib/factures-senelec-service'
import { supabase } from '@/lib/supabase'
import {
  quarantineFactureSenelec,
  unquarantineFactureSenelec,
  createManualQuarantine,
} from '@/lib/billing-quarantine-service'
import { useAuth } from '@/context/AuthContext'
import { useOrganization } from '@/context/OrganizationContext'

// ─── Recherche cross-source par numéro de facture ────────────────────────────

interface InvoiceSearchResult {
  source: 'ocr' | 'senelec'
  id: string
  label: string
  numero: string
  amount?: number
  auditId?: string | null
}

// ─── Valeurs déclarées SENELEC (source OCR ou Excel) ─────────────────────────
// Structure unifiée alimentée depuis mapOcrToInvoiceData (mode OCR)
// ou depuis FactureSenelecForSelector (mode SENELEC).

interface DeclaredValues {
  // BT tranches
  tranche1_montant?: number
  tranche2_montant?: number
  tranche3_montant?: number
  // GP/MT K1-K2
  montant_k1?: number
  montant_k2?: number
  montant_energie?: number
  // Prime fixe + PDP
  montant_prime_fixe?: number
  montant_pdp?: number
  // CosPhi (peut être négatif = bonification)
  montant_cosphi?: number
  // Taxes
  montant_tco?: number
  montant_redevance?: number
  montant_ht?: number
  montant_tva?: number
  montant_ttc?: number
}

function declaredFromOcr(inv: AuditInvoice): DeclaredValues {
  const d = mapOcrToInvoiceData(inv.ocr_data_verified ?? inv.ocr_data, inv.amount ?? undefined)
  return {
    tranche1_montant: d.tranche1_montant ?? undefined,
    tranche2_montant: d.tranche2_montant ?? undefined,
    tranche3_montant: d.tranche3_montant ?? undefined,
    montant_k1:       d.k1_montant       ?? undefined,
    montant_k2:       d.k2_montant       ?? undefined,
    montant_energie:  d.montant_energie  ?? undefined,
    montant_prime_fixe: d.montant_prime_fixe ?? undefined,
    montant_pdp:      d.montant_pdp      ?? undefined,
    montant_cosphi:   d.montant_cosphi   ?? undefined,
    montant_tco:      d.montant_tco      ?? undefined,
    montant_redevance:d.montant_redevance?? undefined,
    montant_ht:       d.montant_ht       ?? undefined,
    montant_tva:      d.montant_tva      ?? undefined,
    montant_ttc:      d.montant_ttc      || undefined,
  }
}

function declaredFromSenelec(row: FactureSenelecForSelector): DeclaredValues {
  const baseTTC = (row.montant_hors_tva != null && row.montant_tva != null)
    ? row.montant_hors_tva + row.montant_tva
    : row.montant_facture_ttc ?? undefined
  return {
    montant_k1:        row.montant_energie_k1  ?? undefined,
    montant_k2:        row.montant_energie_k2  ?? undefined,
    montant_energie:   row.montant_total_energie ?? undefined,
    montant_prime_fixe:row.montant_prime_fixe  ?? undefined,
    montant_pdp:       row.penalites_depassement ?? undefined,
    montant_cosphi:    row.montant_cosinus_phi ?? undefined,
    montant_tco:       row.montant_tco         ?? undefined,
    montant_redevance: row.montant_redevance   ?? undefined,
    montant_ht:        row.montant_hors_tva    ?? undefined,
    montant_tva:       row.montant_tva         ?? undefined,
    montant_ttc:       baseTTC,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtXOF = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)} %`
const fmtNum = (n?: number) => (n != null ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—')
const pctOf  = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) : '0.0'

// Compute nbre_jours from OCR form data: date_fin - date_debut + 1
function computeJoursFromOcr(ocrData: unknown): number | undefined {
  if (!ocrData || typeof ocrData !== 'object') return undefined
  const d = ocrData as Record<string, unknown>
  let forms: Array<{ Key: string; Value: string }> = []
  const pageArr = Array.isArray(d.pages) ? d.pages : Array.isArray(d.page) ? d.page : null
  if (pageArr?.length) {
    const p = pageArr[0] as Record<string, unknown>
    if (Array.isArray(p.forms)) forms = p.forms as Array<{ Key: string; Value: string }>
  } else if (Array.isArray(d.forms)) {
    forms = d.forms as Array<{ Key: string; Value: string }>
  }
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[_]/g, ' ')
  const get = (aliases: string[]) => {
    for (const alias of aliases) {
      const match = forms.find(f => norm(f.Key) === norm(alias))
      if (match?.Value?.trim()) return match.Value.trim()
    }
    return null
  }
  const debutStr = get(['PERIODE DU', 'PERIODE_DU', 'DATE DEBUT', 'DU'])
  const finStr   = get(['PERIODE AU', 'PERIODE_AU', 'DATE FIN', 'AU'])
  if (!debutStr || !finStr) return undefined
  const parseD = (raw: string): Date | null => {
    const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const d = new Date(raw.trim())
    return isNaN(d.getTime()) ? null : d
  }
  const d1 = parseD(debutStr), d2 = parseD(finStr)
  if (!d1 || !d2) return undefined
  const jours = Math.round(Math.abs(d2.getTime() - d1.getTime()) / 86_400_000) + 1
  return jours > 0 && jours <= 100 ? jours : undefined
}

const THRESHOLD_KEY = 'simulateur_quarantine_threshold'

const DEFAULT_INPUT: SimulateurInput = {
  nbre_jours_cons: 30,
  ps_kw: 0,
  pmaxr_kw: 0,
  taux_tco_pct: 2.5,
  redevance_fcfa: 0,
  taux_tva_pct: 18,
  montant_reel_senelec: 0,
  domaine: 'BT',
  categorie: 'DPP',
  grille_annee: 2023,
  k1_kwh: 0,
  k2_kwh: 0,
  wr_kvarh: 0,
  wa_kwh: 0,
  h1_h: 0,
  h2_h: 0,
  conso_totale_kwh: 0,
  is_woyofal: false,
}

function deriveGrilleAnnee(dateStr?: string | null): number {
  if (!dateStr) return 2023
  const y = new Date(dateStr).getFullYear()
  if (y >= 2026) return 2026
  if (y >= 2023) return 2023
  if (y >= 2019) return 2019
  return 2017
}

function prefillFromOcr(invoice: AuditInvoice): Partial<SimulateurInput> {
  const ocrData = invoice.ocr_data_verified ?? invoice.ocr_data
  const d = mapOcrToInvoiceData(ocrData, invoice.amount ?? undefined)

  const categorie = mapSenelecCategorie(d.type_abonnement_raw ?? null, d.domaine_tension_raw ?? null)
  const domaine: 'BT' | 'MT' | 'HT' =
    d.domaine_tension_raw?.toUpperCase().includes('MT') ? 'MT'
    : d.domaine_tension_raw?.toUpperCase().includes('HT') ? 'HT'
    : CATEGORIES_BY_TENSION['BT'].includes(categorie as any) ? 'BT'
    : CATEGORIES_BY_TENSION['MT'].includes(categorie as any) ? 'MT' : 'HT'

  const grille_annee = deriveGrilleAnnee(invoice.invoice_date)

  const k1 = d.conso_k1_kwh ?? 0
  const k2 = d.conso_k2_kwh ?? 0

  return {
    conso_totale_kwh:      d.conso_kwh_total        ?? undefined,
    k1_kwh:                k1 || undefined,
    k2_kwh:                k2 || undefined,
    wa_kwh:                (k1 + k2) > 0 ? (k1 + k2) : undefined,
    wr_kvarh:              d.energie_reactive_kvarh  ?? undefined,
    h1_h:                  d.heures_transfo_h1       ?? undefined,
    pmaxr_kw:              d.puissance_max_kw        ?? undefined,
    ps_kw:                 d.puissance_souscrite_kw  ?? undefined,
    montant_reel_senelec:  invoice.amount            ?? 0,
    nbre_jours_cons:       computeJoursFromOcr(ocrData) ?? d.periode_jours_ocr ?? 30,
    redevance_fcfa:        d.montant_redevance       ?? undefined,
    valeur_cosphi_declare: d.cosphi_mesure           ?? undefined,
    categorie,
    domaine,
    grille_annee,
  }
}

function mapSenelecCategorie(
  categorieText: string | null,
  typeTarifNumero: string | null,
): TariffCategory {
  const text = (categorieText ?? '').toUpperCase().trim()
  const num  = (typeTarifNumero ?? '').toUpperCase().trim()
  const ALL_CATS: TariffCategory[] = ['DPP','DMP','PPP','PMP','DGP','PGP','TCU','TG','TLU','HTS','HTG']
  for (const cat of ALL_CATS) {
    if (text.includes(cat) || num === cat) return cat
  }
  if (text.includes('DOMESTIQUE') && text.includes('PETITE'))       return 'DPP'
  if (text.includes('DOMESTIQUE') && text.includes('MOYENNE'))      return 'DMP'
  if (text.includes('PROFESSIONNEL') && text.includes('PETITE'))    return 'PPP'
  if (text.includes('PROFESSIONNEL') && text.includes('MOYENNE'))   return 'PMP'
  if (text.includes('DOMESTIQUE') && text.includes('GRANDE'))       return 'DGP'
  if (text.includes('PROFESSIONNEL') && text.includes('GRANDE'))    return 'PGP'
  if (text.includes('COURTE'))                                       return 'TCU'
  if (text.includes('LONGUE'))                                       return 'TLU'
  if (text.includes('HAUTE') && text.includes('TENSION'))           return 'HTS'
  return 'DPP'
}

function prefillFromSenelec(row: FactureSenelecForSelector): Partial<SimulateurInput> {
  let nbre_jours_cons = row.nb_jour_facturation ?? 30
  if (row.date_debut_periode && row.date_fin_periode) {
    // date_fin - date_debut + 1 (both endpoints included)
    const diff = Math.abs(
      new Date(row.date_fin_periode).getTime() - new Date(row.date_debut_periode).getTime()
    )
    const days = Math.round(diff / 86_400_000) + 1
    if (days > 0 && days <= 100) nbre_jours_cons = days
  }

  const categorie = mapSenelecCategorie(row.categorie_tarifaire, row.type_tarif_numero)
  const domaine: 'BT' | 'MT' | 'HT' = CATEGORIES_BY_TENSION['BT'].includes(categorie as any) ? 'BT'
    : CATEGORIES_BY_TENSION['MT'].includes(categorie as any) ? 'MT' : 'HT'

  // Use base TTC (HT+TVA) excluding rappels for comparison — montant_facture_ttc includes rappels
  const baseTTC = (row.montant_hors_tva != null && row.montant_tva != null)
    ? row.montant_hors_tva + row.montant_tva
    : (row.montant_facture_ttc ?? 0)

  const k1 = row.cons_k1 ?? 0
  const k2 = row.cons_k2 ?? 0

  return {
    nbre_jours_cons,
    ps_kw:                 row.puissance_souscrite_kw ?? undefined,
    pmaxr_kw:              row.puissance_max_kw       ?? undefined,
    montant_reel_senelec:  baseTTC,
    redevance_fcfa:        row.montant_redevance      ?? undefined,
    k1_kwh:                k1 || undefined,
    k2_kwh:                k2 || undefined,
    wa_kwh:                (k1 + k2) > 0 ? (k1 + k2) : undefined,
    wr_kvarh:              row.cons_wr                ?? undefined,
    h1_h:                  row.heure_h1               ?? undefined,
    h2_h:                  row.heure_h2               ?? undefined,
    conso_totale_kwh:      row.consommation_facturee  ?? undefined,
    grille_annee:          row.annee_facturation       ?? deriveGrilleAnnee(row.date_debut_periode),
    categorie,
    domaine,
    // Declared cosφ (fallback when Wa/Wr absent)
    valeur_cosphi_declare: row.valeur_cosinus_phi     ?? undefined,
    // Index de comptage (display/verification)
    ancien_index_k1:       row.ancien_index_k1        ?? undefined,
    nouvel_index_k1:       row.nouvel_index_k1        ?? undefined,
    ancien_index_k2:       row.ancien_index_k2        ?? undefined,
    nouvel_index_k2:       row.nouvel_index_k2        ?? undefined,
    ancien_index_reactif:  row.ancien_index_reactif   ?? undefined,
    nouvel_index_reactif:  row.nouvel_index_reactif   ?? undefined,
    // Rappels (informational)
    rappel_et_majoration:  row.rappel_et_majoration   ?? undefined,
    rappel_k1:             row.rappel_k1              ?? undefined,
    rappel_k2:             row.rappel_k2              ?? undefined,
    majoration_k1:         row.majoration_k1          ?? undefined,
    majoration_k2:         row.majoration_k2          ?? undefined,
  }
}

// ─── Form field ───────────────────────────────────────────────────────────────

function Field({
  label, unit, value, onChange, min = 0, step = 1, placeholder,
}: {
  label: string; unit?: string; value: number | undefined; onChange: (v: number) => void;
  min?: number; step?: number; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
        {label}{unit && <span className="text-slate-600 ml-1 normal-case">({unit})</span>}
      </Label>
      <Input
        type="number"
        min={min}
        step={step}
        value={value ?? ''}
        placeholder={placeholder ?? '0'}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 text-sm bg-white/[0.04] border-white/[0.08] text-slate-100
          placeholder:text-slate-600 focus-visible:ring-violet-500/30 tabular-nums"
      />
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function Section({ title, accent = 'violet', children }: {
  title: string; accent?: 'violet' | 'amber' | 'emerald'; children: React.ReactNode;
}) {
  const colors = {
    violet: 'text-violet-400/80',
    amber:  'text-amber-400/80',
    emerald:'text-emerald-400/80',
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${colors[accent]}`}>{title}</span>
        <div className="flex-1 h-px bg-white/[0.05]" />
      </div>
      {children}
    </div>
  )
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ label, value, senelecValue, pct, accent = false, bold = false, sub, showSenelec = false }: {
  label: string; value: string; senelecValue?: string | null; pct?: string;
  accent?: boolean; bold?: boolean; sub?: string; showSenelec?: boolean;
}) {
  // Détection écart entre valeur calculée et déclarée (sur les montants FCFA numériques)
  const calcNum = parseFloat(value.replace(/\s/g, '').replace(',', '.'))
  const declNum = senelecValue ? parseFloat(senelecValue.replace(/\s/g, '').replace(',', '.')) : null
  const hasMatch  = declNum != null && Math.abs(calcNum - declNum) < 1
  const hasDiff   = declNum != null && Math.abs(calcNum - declNum) >= 1
  const hasDeclared = showSenelec && senelecValue != null

  return (
    <tr className={`border-b border-white/[0.04] ${bold ? 'bg-white/[0.02]' : ''}`}>
      <td className={`px-4 py-2.5 text-sm ${bold ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>
        {label}
        {sub && <span className="block text-[10px] text-slate-600 font-normal">{sub}</span>}
      </td>
      <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-mono
        ${accent ? 'text-violet-300 font-semibold' : bold ? 'text-slate-50 font-bold' : 'text-slate-300'}`}>
        {value}
      </td>
      {showSenelec && (
        <td className={`px-4 py-2.5 text-xs text-right tabular-nums font-mono
          ${!hasDeclared ? 'text-slate-700'
            : hasMatch  ? 'text-emerald-400/80'
            : hasDiff   ? 'text-amber-400/90'
            : 'text-slate-500'
          }`}>
          {senelecValue ?? '—'}
          {hasDiff && declNum != null && (
            <span className="block text-[9px] text-amber-500/60 leading-tight">
              Δ {calcNum - declNum > 0 ? '+' : ''}{Math.round(calcNum - declNum).toLocaleString('fr-FR')}
            </span>
          )}
        </td>
      )}
      {pct !== undefined && (
        <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-500 font-mono">
          {pct}
        </td>
      )}
    </tr>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  invoices: AuditInvoice[]
  audits: { id: string; name: string }[]
  onQuarantineChange?: () => void
  organizationId?: string
}

// ═══════════════════════════════ MAIN COMPONENT ═══════════════════════════════

export function SimulateurPanel({ invoices, audits, onQuarantineChange, organizationId }: Props) {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const orgId = organizationId ?? organization?.id ?? ''
  const userId = user?.id ?? ''

  const verifiedInvoices = invoices.filter(i => i.status === 'verified')

  const [inputMode, setInputMode]           = useState<'manual' | 'ocr' | 'senelec'>('manual')
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [form, setForm]                     = useState<SimulateurInput>(DEFAULT_INPUT)
  const [result, setResult]                 = useState<SimulateurResult | null>(null)
  const [threshold, setThreshold]           = useState<number>(() => {
    const saved = localStorage.getItem(THRESHOLD_KEY)
    return saved ? parseFloat(saved) : 5
  })
  const [isCalculating, setIsCalculating]   = useState(false)
  const [isQuarantining, setIsQuarantining] = useState(false)
  const [tranchesOpen, setTranchesOpen]     = useState(false)

  // Valeurs déclarées SENELEC pour la colonne de comparaison (OCR ou Excel)
  const [declaredValues, setDeclaredValues]           = useState<DeclaredValues | null>(null)

  // SENELEC source mode
  const [senelecAuditId, setSenelecAuditId]           = useState<string | null>(null)
  const [senelecRows, setSenelecRows]                 = useState<FactureSenelecForSelector[]>([])
  const [senelecLoading, setSenelecLoading]           = useState(false)
  const [selectedSenelecRowId, setSelectedSenelecRowId] = useState<string | null>(null)
  // Reference row kept for index display only
  const [senelecRefRow, setSenelecRefRow]             = useState<FactureSenelecForSelector | null>(null)

  // Cross-source invoice search
  const [searchQuery, setSearchQuery]               = useState('')
  const [searchResults, setSearchResults]           = useState<InvoiceSearchResult[]>([])
  const [isSearching, setIsSearching]               = useState(false)
  const [searchOpen, setSearchOpen]                 = useState(false)
  const [pendingSenelecRowId, setPendingSenelecRowId] = useState<string | null>(null)
  const searchRef                                   = useRef<HTMLDivElement>(null)
  const searchTimer                                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync threshold to localStorage
  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEY, String(threshold))
  }, [threshold])

  // Pre-fill from OCR when invoice selected
  useEffect(() => {
    if (inputMode !== 'ocr' || !selectedId) return
    const inv = invoices.find(i => i.id === selectedId)
    if (!inv) return
    const partial = prefillFromOcr(inv)
    setForm(prev => ({ ...prev, ...partial }))
    setDeclaredValues(declaredFromOcr(inv))
    setResult(null)
  }, [selectedId, inputMode, invoices])

  // Fetch SENELEC rows when audit selected in senelec mode
  useEffect(() => {
    if (inputMode !== 'senelec' || !senelecAuditId) return
    setSenelecLoading(true)
    setSenelecRows([])
    setSelectedSenelecRowId(null)
    getFacturesSenelecForSelector(senelecAuditId)
      .then(rows => setSenelecRows(rows))
      .catch(() => setSenelecRows([]))
      .finally(() => setSenelecLoading(false))
  }, [senelecAuditId, inputMode])

  // Pre-fill from SENELEC row when row selected
  useEffect(() => {
    if (inputMode !== 'senelec' || !selectedSenelecRowId) return
    const row = senelecRows.find(r => r.id === selectedSenelecRowId)
    if (!row) return
    const partial = prefillFromSenelec(row)
    setForm(prev => ({ ...prev, ...partial }))
    setSenelecRefRow(row)
    setDeclaredValues(declaredFromSenelec(row))
    setResult(null)
  }, [selectedSenelecRowId, inputMode, senelecRows])

  // Apply pending SENELEC row once rows are loaded
  useEffect(() => {
    if (!pendingSenelecRowId || senelecRows.length === 0) return
    const row = senelecRows.find(r => r.id === pendingSenelecRowId)
    if (row) {
      setSelectedSenelecRowId(pendingSenelecRowId)
      setPendingSenelecRowId(null)
    }
  }, [senelecRows, pendingSenelecRowId])

  // Close search panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search across OCR invoices + SENELEC DB
  const handleSearchInput = useCallback((q: string) => {
    setSearchQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true)
      const results: InvoiceSearchResult[] = []
      const lq = q.toLowerCase()

      // OCR — search file_name
      for (const inv of verifiedInvoices) {
        if (inv.file_name.toLowerCase().includes(lq)) {
          results.push({
            source: 'ocr',
            id: inv.id,
            label: inv.file_name,
            numero: inv.file_name,
            amount: inv.amount,
          })
        }
      }

      // SENELEC — search numero_facture + partenaire
      try {
        const isNum = /^\d+$/.test(q.trim())
        let query = supabase
          .from('factures_senelec')
          .select('id,audit_id,numero_facture,partenaire,montant_facture_ttc,mois_facturation,annee_facturation')
          .eq('organization_id', orgId)
          .limit(8)

        if (isNum) {
          query = query.eq('numero_facture', parseInt(q.trim()))
        } else {
          query = query.ilike('partenaire', `%${q}%`)
        }

        const { data } = await query
        for (const row of (data ?? [])) {
          const label = [
            row.numero_facture ? `N°${row.numero_facture}` : null,
            row.partenaire,
            row.mois_facturation,
            row.annee_facturation,
          ].filter(Boolean).join(' — ')
          results.push({
            source: 'senelec',
            id: row.id,
            label,
            numero: String(row.numero_facture ?? ''),
            amount: row.montant_facture_ttc,
            auditId: row.audit_id,
          })
        }
      } catch { /* silently ignore search errors */ }

      setSearchResults(results)
      setSearchOpen(results.length > 0)
      setIsSearching(false)
    }, 300)
  }, [verifiedInvoices, orgId])

  const handleSelectSearchResult = useCallback((result: InvoiceSearchResult) => {
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
    setResult(null)
    setDeclaredValues(null)

    if (result.source === 'ocr') {
      setInputMode('ocr')
      setSelectedId(result.id)
    } else {
      setInputMode('senelec')
      if (result.auditId) {
        setSenelecAuditId(result.auditId)
        setPendingSenelecRowId(result.id)
      }
    }
  }, [])

  const set = useCallback(<K extends keyof SimulateurInput>(k: K, v: SimulateurInput[K]) => {
    setForm(prev => ({ ...prev, [k]: v }))
    setResult(null)
  }, [])

  const handleCalculate = () => {
    setIsCalculating(true)
    try {
      const r = runSimulateur(form, threshold)
      setResult(r)
    } catch (e) {
      toast.error('Erreur de calcul — vérifiez les valeurs saisies')
    } finally {
      setIsCalculating(false)
    }
  }

  const handleReset = () => {
    setForm(DEFAULT_INPUT)
    setResult(null)
    setSelectedId(null)
    setSelectedSenelecRowId(null)
    setSenelecRefRow(null)
    setDeclaredValues(null)
  }

  const buildReason = (r: SimulateurResult) =>
    `Delta simulateur: ${r.delta_pct >= 0 ? '+' : ''}${r.delta_pct.toFixed(2)}% — TTC calculé: ${fmtXOF(r.montant_ttc_calcule)} vs SENELEC: ${fmtXOF(form.montant_reel_senelec)} FCFA`

  const handleQuarantine = async () => {
    if (!result) return
    setIsQuarantining(true)
    try {
      if (inputMode === 'ocr' && selectedId) {
        await quarantineInvoice(selectedId, buildReason(result), result.delta_pct)
        toast.success('Facture OCR mise en quarantaine')
      } else if (inputMode === 'senelec' && selectedSenelecRowId) {
        await quarantineFactureSenelec(
          selectedSenelecRowId,
          buildReason(result),
          result.delta_pct,
          result.montant_ttc_calcule,
          userId,
          result,
        )
        toast.success('Facture SENELEC mise en quarantaine')
      } else if (inputMode === 'manual') {
        const label = `Simulation manuelle — ${form.montant_reel_senelec.toLocaleString('fr-FR')} FCFA (${new Date().toLocaleDateString('fr-FR')})`
        await createManualQuarantine({
          organization_id: orgId,
          label,
          montant_senelec: form.montant_reel_senelec,
          montant_calcule: result.montant_ttc_calcule,
          delta_pct: result.delta_pct,
          delta_fcfa: result.delta_fcfa,
          quarantine_reason: buildReason(result),
          sim_input: form,
          quarantined_by: userId,
        })
        toast.success('Simulation mise en quarantaine')
      }
      onQuarantineChange?.()
    } catch {
      toast.error('Erreur lors de la mise en quarantaine')
    } finally {
      setIsQuarantining(false)
    }
  }

  const handleUnquarantine = async () => {
    setIsQuarantining(true)
    try {
      if (inputMode === 'ocr' && selectedId) {
        await unquarantineInvoice(selectedId)
      } else if (inputMode === 'senelec' && selectedSenelecRowId) {
        await unquarantineFactureSenelec(selectedSenelecRowId)
      }
      toast.success('Retiré de la quarantaine')
      onQuarantineChange?.()
    } catch {
      toast.error('Erreur')
    } finally {
      setIsQuarantining(false)
    }
  }

  const selectedInvoice = selectedId ? invoices.find(i => i.id === selectedId) : null
  const selectedSenelecRow = selectedSenelecRowId ? senelecRows.find(r => r.id === selectedSenelecRowId) : null
  const isAlreadyQuarantined =
    (inputMode === 'ocr'     && !!selectedInvoice?.is_quarantined) ||
    (inputMode === 'senelec' && !!selectedSenelecRow?.is_quarantined) ||
    false

  const isBTPP  = ['DPP', 'DMP', 'PPP', 'PMP'].includes(form.categorie)
  const isGPMT  = ['DGP', 'PGP', 'TCU', 'TG', 'TLU', 'HTS', 'HTG'].includes(form.categorie)
  const isWOYO  = form.is_woyofal === true

  const tariffYears = getAvailableTariffYears()

  // Delta display helpers
  const senelecAmount  = form.montant_reel_senelec
  const calculatedTTC  = result?.montant_ttc_calcule ?? 0
  const absDeltaPct    = result ? Math.abs(result.delta_pct) : 0
  const isAnomaly      = result?.is_anomaly ?? false
  const statusCls      = !result ? '' : absDeltaPct < 1 ? 'emerald' : isAnomaly ? 'red' : 'amber'

  // Colonne de comparaison active dès qu'une source est chargée (OCR ou SENELEC)
  const showDeclared = declaredValues != null

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

      {/* ═══ LEFT PANEL — Inputs ═══════════════════════════════════════════ */}
      <div className="xl:col-span-2 space-y-4">

        {/* Cross-source invoice number search */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03]
            px-3 h-9 focus-within:border-violet-500/30 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              placeholder="Rechercher par n° de facture…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600
                outline-none min-w-0"
            />
            {isSearching && (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin shrink-0" />
            )}
            {searchQuery && !isSearching && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false) }}
                className="text-slate-600 hover:text-slate-400 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchOpen && searchResults.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border border-white/[0.08]
              bg-[#0d1018] shadow-2xl shadow-black/50 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-white/[0.05]">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
                  {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                </span>
              </div>
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleSelectSearchResult(r)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.04]
                    transition-colors text-left border-b border-white/[0.03] last:border-0"
                >
                  <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md
                    ${r.source === 'ocr'
                      ? 'bg-amber-500/15 text-amber-400/90'
                      : 'bg-emerald-500/15 text-emerald-400/90'
                    }`}>
                    {r.source === 'ocr' ? 'OCR' : 'SENELEC'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{r.label}</p>
                    {r.amount != null && (
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {fmtXOF(r.amount)} FCFA
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Source toggle — premium cards */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-white/[0.03] rounded-xl border border-white/[0.05]">
          {([
            { key: 'manual',  label: 'Manuel',   Icon: Calculator, color: 'violet' },
            { key: 'ocr',     label: 'OCR',      Icon: FileText,   color: 'amber'  },
            { key: 'senelec', label: 'SENELEC',  Icon: Database,   color: 'emerald' },
          ] as const).map(({ key, label, Icon, color }) => {
            const active = inputMode === key
            const cls = active
              ? color === 'violet'  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25'
              : color === 'amber'   ? 'bg-amber-500/15  text-amber-300  border border-amber-500/25'
              :                       'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            return (
              <button key={key} onClick={() => { setInputMode(key); setResult(null); setSenelecRefRow(null); setDeclaredValues(null) }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${cls}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* OCR invoice selector */}
        {inputMode === 'ocr' && (
          <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3 space-y-2">
            <Label className="text-[11px] text-violet-400 font-semibold uppercase tracking-wider">
              Facture OCR vérifiée
            </Label>
            {verifiedInvoices.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Aucune facture vérifiée disponible</p>
            ) : (
              <Select value={selectedId ?? ''} onValueChange={v => { setSelectedId(v); setResult(null) }}>
                <SelectTrigger className="h-9 text-sm bg-white/[0.05] border-violet-500/20 text-slate-200">
                  <SelectValue placeholder="Sélectionner une facture…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                  {verifiedInvoices.map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      <span className="truncate">{inv.file_name}</span>
                      {inv.amount && (
                        <span className="ml-2 text-slate-500 text-xs tabular-nums">
                          {fmtXOF(inv.amount)} FCFA
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedInvoice && (
              <p className="text-[11px] text-slate-500">
                Champs disponibles pré-remplis — compléter les données manquantes
              </p>
            )}
          </div>
        )}

        {/* SENELEC Excel source selector */}
        {inputMode === 'senelec' && (
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3 space-y-3">
            <Label className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">
              Données SENELEC importées
            </Label>

            {/* Audit selector */}
            {audits.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Aucun projet disponible</p>
            ) : (
              <Select
                value={senelecAuditId ?? ''}
                onValueChange={v => { setSenelecAuditId(v); setResult(null) }}
              >
                <SelectTrigger className="h-9 text-sm bg-white/[0.05] border-emerald-500/20 text-slate-200">
                  <SelectValue placeholder="Sélectionner un projet…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                  {audits.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Row selector */}
            {senelecAuditId && (
              senelecLoading ? (
                <p className="text-xs text-slate-500 italic">Chargement…</p>
              ) : senelecRows.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucune facture SENELEC dans ce projet</p>
              ) : (
                <Select
                  value={selectedSenelecRowId ?? ''}
                  onValueChange={v => { setSelectedSenelecRowId(v); setResult(null) }}
                >
                  <SelectTrigger className="h-9 text-sm bg-white/[0.05] border-emerald-500/20 text-slate-200">
                    <SelectValue placeholder="Sélectionner une facture…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0b0d14] border-white/10 text-white max-h-60">
                    {senelecRows.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="truncate">
                          {r.partenaire ?? r.numero_compte_contrat}
                        </span>
                        {(r.mois_facturation || r.annee_facturation) && (
                          <span className="ml-2 text-slate-500 text-xs">
                            {r.mois_facturation} {r.annee_facturation}
                          </span>
                        )}
                        {r.montant_facture_ttc != null && (
                          <span className="ml-2 text-emerald-400/80 text-xs tabular-nums">
                            {fmtXOF(r.montant_facture_ttc)} FCFA
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            )}
            {selectedSenelecRowId && (
              <p className="text-[11px] text-slate-500">
                Champs disponibles pré-remplis — compléter les données manquantes
              </p>
            )}
          </div>
        )}

        {/* ── Paramètres Généraux ── */}
        <Section title="Paramètres généraux">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nbre jours conso" unit="j"   value={form.nbre_jours_cons}       onChange={v => set('nbre_jours_cons', v)} min={1} />
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Puissance souscrite <span className="text-slate-600 ml-1 normal-case">(kW)</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={form.ps_kw || ''}
                  placeholder="0"
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0
                    set('ps_kw', v)
                    // Auto-suggest domaine when in manual mode
                    if (inputMode === 'manual' && v > 0) {
                      const suggestion = suggestTensionFromPS(v)
                      if (suggestion) set('domaine', suggestion.domaine)
                    }
                  }}
                  className="h-8 text-sm bg-white/[0.04] border-white/[0.08] text-slate-100
                    placeholder:text-slate-600 focus-visible:ring-violet-500/30 tabular-nums"
                />
                {inputMode === 'manual' && form.ps_kw > 0 && (() => {
                  const s = suggestTensionFromPS(form.ps_kw)
                  return s ? (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold
                      text-violet-400/70 pointer-events-none">{s.domaine}</span>
                  ) : null
                })()}
              </div>
            </div>
            <Field label="Puissance max relevée (Pmaxr)" unit="kW" value={form.pmaxr_kw}   onChange={v => set('pmaxr_kw', v)} step={0.1} />
            <Field label="Taux TCO" unit="%"           value={form.taux_tco_pct}            onChange={v => set('taux_tco_pct', v)} step={0.1} />
            <Field label="Redevance" unit="FCFA"       value={form.redevance_fcfa}          onChange={v => set('redevance_fcfa', v)} />
            <Field label="Taux TVA" unit="%"           value={form.taux_tva_pct}            onChange={v => set('taux_tva_pct', v)} step={0.1} />
            <Field label="Montant réel SENELEC" unit="FCFA" value={form.montant_reel_senelec} onChange={v => set('montant_reel_senelec', v)} />
          </div>
        </Section>

        {/* ── Alimentation ── */}
        <Section title="Alimentation & Tarif">
          <div className="grid grid-cols-2 gap-3">
            {/* Catégorie */}
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Catégorie tarifaire</Label>
              <Select
                value={form.categorie}
                onValueChange={v => {
                  const cat = v as TariffCategory
                  const dom = CATEGORIES_BY_TENSION['BT'].includes(cat as any) ? 'BT'
                    : CATEGORIES_BY_TENSION['MT'].includes(cat as any) ? 'MT' : 'HT'
                  set('categorie', cat)
                  set('domaine', dom)
                  setResult(null)
                }}
              >
                <SelectTrigger className="h-8 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white max-h-60">
                  <div className="px-2 py-1 text-[10px] text-slate-500 font-semibold uppercase">BT</div>
                  {CATEGORIES_BY_TENSION['BT'].map(c => (
                    <SelectItem key={c} value={c} className="text-sm">{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-[10px] text-slate-500 font-semibold uppercase mt-1">MT</div>
                  {CATEGORIES_BY_TENSION['MT'].map(c => (
                    <SelectItem key={c} value={c} className="text-sm">{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-[10px] text-slate-500 font-semibold uppercase mt-1">HT</div>
                  {CATEGORIES_BY_TENSION['HT'].map(c => (
                    <SelectItem key={c} value={c} className="text-sm">{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Grille tarifaire */}
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Grille tarifaire</Label>
              <Select value={String(form.grille_annee)} onValueChange={v => set('grille_annee', Number(v))}>
                <SelectTrigger className="h-8 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                  {tariffYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Transfo kVA */}
            <Field label="Transfo" unit="kVA" value={form.puissance_transfo_kva} onChange={v => set('puissance_transfo_kva', v)} />
          </div>

          {/* WOYOFAL toggle */}
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={form.is_woyofal}
              onChange={e => { set('is_woyofal', e.target.checked); setResult(null) }}
              className="rounded border-white/20 bg-white/5 accent-violet-500"
            />
            <span className="text-xs text-slate-400">Compteur WOYOFAL (prépayé)</span>
          </label>
        </Section>

        {/* ── Consommations ── */}
        {!isWOYO && (
          <Section title="Consommations">
            {isBTPP ? (
              <Field
                label="Consommation totale"
                unit="kWh"
                value={form.conso_totale_kwh}
                onChange={v => set('conso_totale_kwh', v)}
                step={0.1}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="K1 (HC)" unit="kWh" value={form.k1_kwh} onChange={v => set('k1_kwh', v)} step={0.1} />
                <Field label="K2 (HP)" unit="kWh" value={form.k2_kwh} onChange={v => set('k2_kwh', v)} step={0.1} />
                <Field label="Wa (actif total)" unit="kWh"   value={form.wa_kwh}   onChange={v => set('wa_kwh', v)} step={0.1} />
                <Field label="Wr (réactif)"     unit="kVARh" value={form.wr_kvarh} onChange={v => set('wr_kvarh', v)} step={0.1} />
                <Field label="H1 (durée total)" unit="h"     value={form.h1_h}     onChange={v => set('h1_h', v)} step={0.1} />
                <Field label="H2 (durée pointe)" unit="h"    value={form.h2_h}     onChange={v => set('h2_h', v)} step={0.1} />
              </div>
            )}
          </Section>
        )}

        {isWOYO && (
          <Section title="WOYOFAL (Prépayé)">
            <Field label="Montant recharge" unit="FCFA" value={form.montant_recharge_woyofal} onChange={v => set('montant_recharge_woyofal', v)} />
          </Section>
        )}

        {/* ── Seuil quarantaine ── */}
        <div className="rounded-xl border border-orange-500/[0.12] bg-orange-500/[0.04] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-orange-400/80" />
              <span className="text-xs font-medium text-slate-400">Seuil de quarantaine</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-orange-400">{threshold} %</span>
          </div>
          <Slider
            value={[threshold]}
            onValueChange={([v]) => setThreshold(v)}
            min={1} max={20} step={0.5}
            className="[&_[role=slider]]:bg-orange-400 [&_[role=slider]]:border-orange-500"
          />
          <p className="text-[10px] text-slate-600">
            Quarantaine automatique si |Δ| &gt; {threshold}%
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2">
          <Button
            onClick={handleCalculate}
            disabled={isCalculating || form.montant_reel_senelec <= 0}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold h-10
              shadow-lg shadow-violet-900/30 disabled:opacity-40 transition-all"
          >
            {isCalculating
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin mr-2" />Calcul en cours…</>
              : <><Calculator className="w-4 h-4 mr-2" />Lancer le calcul</>}
          </Button>
          <Button
            variant="ghost"
            onClick={handleReset}
            title="Réinitialiser"
            className="h-10 w-10 p-0 border border-white/[0.08] text-slate-500 hover:text-slate-200 hover:bg-white/5 shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ═══ RIGHT PANEL — Results ══════════════════════════════════════════ */}
      <div className="xl:col-span-3">
        {!result ? (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-5
            rounded-2xl border border-dashed border-white/[0.07] text-center p-8">
            <div className="relative">
              <div className="p-5 rounded-2xl bg-violet-500/[0.08] border border-violet-500/[0.12]">
                <Calculator className="w-9 h-9 text-violet-400/50" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500/30 border border-violet-500/50" />
            </div>
            <div>
              <p className="text-slate-300 font-semibold text-sm">Résultats du simulateur</p>
              <p className="text-xs text-slate-600 mt-1.5 max-w-xs leading-relaxed">
                Sélectionnez une source, renseignez les données
                et lancez le calcul pour comparer avec le montant SENELEC
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-700">
              <span className="flex items-center gap-1"><Calculator className="w-3 h-3" />Saisie manuelle</span>
              <span className="text-white/[0.08]">·</span>
              <span className="flex items-center gap-1"><FileText className="w-3 h-3" />Facture OCR</span>
              <span className="text-white/[0.08]">·</span>
              <span className="flex items-center gap-1"><Database className="w-3 h-3" />SENELEC Excel</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Status banner */}
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3.5
              ${absDeltaPct < 1
                ? 'bg-emerald-500/[0.07] border-emerald-500/20'
                : isAnomaly
                ? 'bg-red-500/[0.07] border-red-500/20'
                : 'bg-amber-500/[0.07] border-amber-500/20'
              }`}>
              <div className={`p-2 rounded-lg shrink-0
                ${absDeltaPct < 1 ? 'bg-emerald-500/15' : isAnomaly ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
                {absDeltaPct < 1
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : isAnomaly
                  ? <AlertTriangle className="w-4 h-4 text-red-400" />
                  : <AlertCircle className="w-4 h-4 text-amber-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold
                  ${absDeltaPct < 1 ? 'text-emerald-300' : isAnomaly ? 'text-red-300' : 'text-amber-300'}`}>
                  {absDeltaPct < 1
                    ? 'Facture conforme — aucune anomalie'
                    : isAnomaly
                    ? `Anomalie détectée — ${fmtPct(result.delta_pct)} dépasse le seuil (${threshold}%)`
                    : `Écart mineur — ${fmtPct(result.delta_pct)} (sous le seuil ${threshold}%)`
                  }
                </p>
                <p className={`text-[11px] mt-0.5
                  ${absDeltaPct < 1 ? 'text-emerald-500/60' : isAnomaly ? 'text-red-500/60' : 'text-amber-500/60'}`}>
                  Grille {form.grille_annee} · {CATEGORY_LABELS[form.categorie]} · {form.nbre_jours_cons} j
                </p>
              </div>
            </div>

            {/* Delta comparison strip */}
            {(() => {
              const rappels = form.rappel_et_majoration ?? 0
              const hasRappels = rappels > 0
              const deltaColor = absDeltaPct < 1 ? 'text-emerald-400' : isAnomaly ? 'text-red-400' : 'text-amber-400'
              const deltaBg    = absDeltaPct < 1 ? 'bg-emerald-500/[0.06] border-emerald-500/15' : isAnomaly ? 'bg-red-500/[0.06] border-red-500/15' : 'bg-amber-500/[0.06] border-amber-500/15'
              return (
                <div className={`grid gap-2.5 ${hasRappels ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                  {/* SENELEC déclaré */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">
                      {hasRappels ? 'Base HT+TVA SENELEC' : 'SENELEC déclaré'}
                    </p>
                    <p className="text-base font-bold tabular-nums font-mono mt-1.5 text-slate-200">
                      {fmtXOF(senelecAmount)}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">FCFA</p>
                  </div>
                  {/* TTC recalculé */}
                  <div className="rounded-xl bg-violet-500/[0.06] border border-violet-500/15 px-3 py-3 text-center">
                    <p className="text-[10px] text-violet-400/70 uppercase tracking-wider leading-tight">TTC recalculé</p>
                    <p className="text-base font-bold tabular-nums font-mono mt-1.5 text-violet-300">
                      {fmtXOF(calculatedTTC)}
                    </p>
                    <p className="text-[10px] text-violet-500/50 mt-0.5">FCFA</p>
                  </div>
                  {/* Delta */}
                  <div className={`rounded-xl border px-3 py-3 text-center ${deltaBg}`}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">Delta (base)</p>
                    <p className={`text-base font-bold tabular-nums font-mono mt-1.5 ${deltaColor}`}>
                      {result.delta_fcfa >= 0 ? '+' : ''}{fmtXOF(result.delta_fcfa)}
                    </p>
                    <p className={`text-[10px] mt-0.5 font-semibold ${deltaColor}`}>{fmtPct(result.delta_pct)}</p>
                  </div>
                  {/* Rappels */}
                  {hasRappels && (
                    <div className="rounded-xl bg-orange-500/[0.05] border border-orange-500/15 px-3 py-3 text-center">
                      <p className="text-[10px] text-orange-400/60 uppercase tracking-wider leading-tight">Rappels / Majorations</p>
                      <p className="text-base font-bold tabular-nums font-mono mt-1.5 text-orange-400">
                        +{fmtXOF(rappels)}
                      </p>
                      <p className="text-[10px] text-orange-500/50 mt-0.5">Non recalculés</p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Index de comptage (senelec mode only, when indexes are present) */}
            {(form.ancien_index_k1 != null || form.ancien_index_k2 != null) && (
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Index de comptage</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      {['Poste', 'Ancien index', 'Nouvel index', 'Consommation'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isGPMT ? (
                      <>
                        {form.ancien_index_k1 != null && (
                          <tr className="border-b border-white/[0.03]">
                            <td className="px-3 py-2 text-slate-400 font-medium">K1 (HC)</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.ancien_index_k1)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.nouvel_index_k1)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-200 font-medium">
                              {form.nouvel_index_k1 != null ? fmtNum(form.nouvel_index_k1 - form.ancien_index_k1) : '—'} kWh
                            </td>
                          </tr>
                        )}
                        {form.ancien_index_k2 != null && (
                          <tr className="border-b border-white/[0.03]">
                            <td className="px-3 py-2 text-slate-400 font-medium">K2 (HP)</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.ancien_index_k2)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.nouvel_index_k2)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-200 font-medium">
                              {form.nouvel_index_k2 != null ? fmtNum(form.nouvel_index_k2 - form.ancien_index_k2) : '—'} kWh
                            </td>
                          </tr>
                        )}
                        {form.ancien_index_reactif != null && (
                          <tr className="border-b border-white/[0.03]">
                            <td className="px-3 py-2 text-slate-400 font-medium">Réactif (Wr)</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.ancien_index_reactif)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.nouvel_index_reactif)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-200 font-medium">
                              {form.nouvel_index_reactif != null ? fmtNum(form.nouvel_index_reactif - form.ancien_index_reactif) : '—'} kVARh
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <tr className="border-b border-white/[0.03]">
                        <td className="px-3 py-2 text-slate-400 font-medium">Index conso</td>
                        <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.ancien_index_k1)}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-400">{fmtNum(form.nouvel_index_k1)}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-200 font-medium">
                          {(form.nouvel_index_k1 != null && form.ancien_index_k1 != null)
                            ? fmtNum(form.nouvel_index_k1 - form.ancien_index_k1) : '—'} kWh
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Full breakdown table */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015] flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Décomposition ligne par ligne</p>
                {showDeclared && (
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0" />
                    {inputMode === 'ocr' ? 'Facture OCR déclarée' : 'SENELEC Excel déclaré'}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="px-4 py-2 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Poste</th>
                    <th className="px-4 py-2 text-right text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Recalculé (FCFA)</th>
                    {showDeclared && (
                      <th className="px-4 py-2 text-right text-[10px] text-emerald-500/60 font-semibold uppercase tracking-wider whitespace-nowrap">
                        SENELEC déclaré
                      </th>
                    )}
                    <th className="px-4 py-2 text-right text-[10px] text-slate-500 font-semibold uppercase tracking-wider">% TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ── BT PP: tranches ── */}
                  {isBTPP && (
                    <>
                      {[
                        { label: '1ère tranche', kwh: result.t1_kwh, prix: result.prix_t1, montant: result.montant_t1, declared: declaredValues?.tranche1_montant },
                        { label: '2ème tranche', kwh: result.t2_kwh, prix: result.prix_t2, montant: result.montant_t2, declared: declaredValues?.tranche2_montant },
                        { label: '3ème tranche', kwh: result.t3_kwh, prix: result.prix_t3, montant: result.montant_t3, declared: declaredValues?.tranche3_montant },
                      ].filter(r => r.kwh > 0).map(r => (
                        <ResultRow
                          key={r.label}
                          label={r.label}
                          value={`${fmtXOF(r.montant)} FCFA`}
                          pct={`${pctOf(r.montant, calculatedTTC)} %`}
                          sub={`${fmtNum(r.kwh)} kWh × ${fmtNum(r.prix)} F/kWh`}
                          showSenelec={showDeclared}
                          senelecValue={r.declared != null ? `${fmtXOF(r.declared)} FCFA` : null}
                        />
                      ))}
                    </>
                  )}

                  {/* ── GP / MT: K1 + K2 ── */}
                  {isGPMT && (
                    <>
                      {result.montant_k1 > 0 && (
                        <ResultRow
                          label="Énergie K1 (HC)"
                          value={`${fmtXOF(result.montant_k1)} FCFA`}
                          pct={`${pctOf(result.montant_k1, calculatedTTC)} %`}
                          sub={`${fmtNum(form.k1_kwh)} kWh × ${fmtNum(result.prix_k1)} F/kWh`}
                          showSenelec={showDeclared}
                          senelecValue={declaredValues?.montant_k1 != null
                            ? `${fmtXOF(declaredValues.montant_k1)} FCFA` : null}
                        />
                      )}
                      {result.montant_k2 > 0 && (
                        <ResultRow
                          label="Énergie K2 (HP)"
                          value={`${fmtXOF(result.montant_k2)} FCFA`}
                          pct={`${pctOf(result.montant_k2, calculatedTTC)} %`}
                          sub={`${fmtNum(form.k2_kwh)} kWh × ${fmtNum(result.prix_k2)} F/kWh`}
                          showSenelec={showDeclared}
                          senelecValue={declaredValues?.montant_k2 != null
                            ? `${fmtXOF(declaredValues.montant_k2)} FCFA` : null}
                        />
                      )}
                      {(form.rappel_k1 ?? 0) > 0 && (
                        <ResultRow label="Rappel K1 (facture)" value={`${fmtXOF(form.rappel_k1!)} FCFA`} pct="—" showSenelec={showDeclared} />
                      )}
                      {(form.rappel_k2 ?? 0) > 0 && (
                        <ResultRow label="Rappel K2 (facture)" value={`${fmtXOF(form.rappel_k2!)} FCFA`} pct="—" showSenelec={showDeclared} />
                      )}
                      {(form.majoration_k1 ?? 0) > 0 && (
                        <ResultRow label="Majoration K1 (facture)" value={`${fmtXOF(form.majoration_k1!)} FCFA`} pct="—" showSenelec={showDeclared} />
                      )}
                      {(form.majoration_k2 ?? 0) > 0 && (
                        <ResultRow label="Majoration K2 (facture)" value={`${fmtXOF(form.majoration_k2!)} FCFA`} pct="—" showSenelec={showDeclared} />
                      )}
                    </>
                  )}

                  {/* Énergie total sub-total */}
                  <ResultRow
                    label="Montant énergie total"
                    value={`${fmtXOF(result.montant_energie)} FCFA`}
                    pct={`${result.pct_energie.toFixed(1)} %`}
                    bold
                    showSenelec={showDeclared}
                    senelecValue={declaredValues?.montant_energie != null
                      ? `${fmtXOF(declaredValues.montant_energie)} FCFA` : null}
                  />

                  {/* Prime fixe */}
                  {result.prime_fixe_base > 0 && (
                    <ResultRow
                      label="Prime fixe"
                      value={`${fmtXOF(result.prime_fixe_base)} FCFA`}
                      pct={`${pctOf(result.prime_fixe_base, calculatedTTC)} %`}
                      sub={`Tpf × ${fmtNum(form.ps_kw)} kW × ${form.nbre_jours_cons}/30`}
                      showSenelec={showDeclared}
                      senelecValue={declaredValues?.montant_prime_fixe != null
                        ? `${fmtXOF(declaredValues.montant_prime_fixe)} FCFA` : null}
                    />
                  )}
                  {result.majo_depassement_ps > 0 && (
                    <ResultRow
                      label="Majo. dépassement PS"
                      value={`${fmtXOF(result.majo_depassement_ps)} FCFA`}
                      pct={`${pctOf(result.majo_depassement_ps, calculatedTTC)} %`}
                      sub={`1.5 × Tpf × (${fmtNum(form.pmaxr_kw)} − ${fmtNum(form.ps_kw)}) kW`}
                      showSenelec={showDeclared}
                      senelecValue={declaredValues?.montant_pdp != null
                        ? `${fmtXOF(declaredValues.montant_pdp)} FCFA` : null}
                    />
                  )}

                  {/* Cosinus phi — pénalité ou bonus */}
                  {result.cosphi_calcule != null && (
                    <ResultRow
                      label={result.cosphi_is_bonus
                        ? `Cosφ = ${result.cosphi_calcule.toFixed(4)} → bonus ${Math.abs(result.taux_penalite_cosphi_pct).toFixed(2)}%`
                        : result.taux_penalite_cosphi_pct === 0
                        ? `Cosφ = ${result.cosphi_calcule.toFixed(4)} → zone neutre`
                        : `Cosφ = ${result.cosphi_calcule.toFixed(4)} → pénalité ${result.taux_penalite_cosphi_pct}%`
                      }
                      value={result.montant_penalite_cosphi !== 0
                        ? `${result.montant_penalite_cosphi > 0 ? '' : '−'}${fmtXOF(Math.abs(result.montant_penalite_cosphi))} FCFA`
                        : '0 FCFA'
                      }
                      pct={result.montant_penalite_cosphi !== 0 ? `${result.pct_penalite_cosphi.toFixed(1)} %` : '—'}
                      accent={result.montant_penalite_cosphi > 0}
                      sub={form.wa_kwh && form.wr_kvarh
                        ? `Wa = ${fmtNum(form.wa_kwh)} kWh · Wr = ${fmtNum(form.wr_kvarh)} kVARh`
                        : form.valeur_cosphi_declare
                        ? `Valeur déclarée sur facture`
                        : undefined}
                      showSenelec={showDeclared}
                      senelecValue={declaredValues?.montant_cosphi != null
                        ? `${declaredValues.montant_cosphi < 0 ? '−' : ''}${fmtXOF(Math.abs(declaredValues.montant_cosphi))} FCFA` : null}
                    />
                  )}

                  {/* TCO */}
                  {result.montant_tco > 0 && (
                    <ResultRow
                      label={`TCO (${form.taux_tco_pct}%)`}
                      value={`${fmtXOF(result.montant_tco)} FCFA`}
                      pct={`${pctOf(result.montant_tco, calculatedTTC)} %`}
                      sub={`${form.taux_tco_pct}% × ${fmtXOF(result.base_tco)} FCFA`}
                      showSenelec={showDeclared}
                      senelecValue={declaredValues?.montant_tco != null
                        ? `${fmtXOF(declaredValues.montant_tco)} FCFA` : null}
                    />
                  )}

                  {/* Redevance */}
                  {form.redevance_fcfa > 0 && (
                    <ResultRow
                      label="Redevance (fixe)"
                      value={`${fmtXOF(form.redevance_fcfa)} FCFA`}
                      pct={`${pctOf(form.redevance_fcfa, calculatedTTC)} %`}
                      showSenelec={showDeclared}
                      senelecValue={declaredValues?.montant_redevance != null
                        ? `${fmtXOF(declaredValues.montant_redevance)} FCFA` : null}
                    />
                  )}

                  {/* Montant HT */}
                  <ResultRow
                    label="Montant HT"
                    value={`${fmtXOF(result.montant_ht)} FCFA`}
                    pct={`${pctOf(result.montant_ht, calculatedTTC)} %`}
                    bold
                    showSenelec={showDeclared}
                    senelecValue={declaredValues?.montant_ht != null
                      ? `${fmtXOF(declaredValues.montant_ht)} FCFA` : null}
                  />

                  {/* TVA */}
                  <ResultRow
                    label={`TVA (${form.taux_tva_pct}% × base)`}
                    value={`${fmtXOF(result.montant_tva)} FCFA`}
                    pct={`${pctOf(result.montant_tva, calculatedTTC)} %`}
                    sub={`Base TVA = ${fmtXOF(result.base_tva)} FCFA`}
                    showSenelec={showDeclared}
                    senelecValue={declaredValues?.montant_tva != null
                      ? `${fmtXOF(declaredValues.montant_tva)} FCFA` : null}
                  />

                  {/* TTC calculé */}
                  <ResultRow
                    label="TTC recalculé (base)"
                    value={`${fmtXOF(calculatedTTC)} FCFA`}
                    pct="100 %"
                    bold
                    showSenelec={showDeclared}
                    senelecValue={declaredValues?.montant_ttc != null
                      ? `${fmtXOF(declaredValues.montant_ttc)} FCFA` : null}
                  />

                  {/* KPIs finaux */}
                  {result.ipr_fcfa_kwh > 0 && (
                    <ResultRow
                      label="IPR (coût moyen TTC réel)"
                      value={`${result.ipr_fcfa_kwh.toFixed(2)} F/kWh`}
                      sub={`Montant TTC ÷ énergie active totale`}
                      showSenelec={showDeclared}
                    />
                  )}
                  {result.conso_journaliere_kwh > 0 && (
                    <ResultRow
                      label="Consommation journalière"
                      value={`${result.conso_journaliere_kwh.toFixed(1)} kWh/j`}
                      sub={`÷ ${form.nbre_jours_cons} jours`}
                      showSenelec={showDeclared}
                    />
                  )}
                  {result.nbre_jours_depassement > 0 && (
                    <ResultRow
                      label="Jours de dépassement PS (calculé)"
                      value={`${result.nbre_jours_depassement} j`}
                      sub={`Pmaxr (${fmtNum(form.pmaxr_kw)} kW) > Ps (${fmtNum(form.ps_kw)} kW)`}
                      accent
                      showSenelec={showDeclared}
                    />
                  )}
                  {isGPMT && result.part_conso_k2 != null && (
                    <ResultRow
                      label="Part conso K2 (HP)"
                      value={`${(result.part_conso_k2 * 100).toFixed(1)} %`}
                      sub={result.part_cout_k2 != null ? `Part coût K2 = ${(result.part_cout_k2 * 100).toFixed(1)} %` : undefined}
                      showSenelec={showDeclared}
                    />
                  )}
                  {isGPMT && result.cout_moyen_pondere_ttc != null && (
                    <ResultRow
                      label="Coût moyen pondéré (TTC)"
                      value={`${result.cout_moyen_pondere_ttc.toFixed(2)} F/kWh`}
                      sub="1.18 × 1.025 × (Prix_HC×20 + Prix_HP×4) / 24"
                      showSenelec={showDeclared}
                    />
                  )}

                  {/* Rappels (informational separator) */}
                  {(form.rappel_et_majoration ?? 0) > 0 && (
                    <>
                      <ResultRow
                        label="Rappels & majorations (facture)"
                        value={`+${fmtXOF(form.rappel_et_majoration!)} FCFA`}
                        pct="non recalculé"
                        showSenelec={showDeclared}
                        senelecValue={form.rappel_et_majoration != null
                          ? `+${fmtXOF(form.rappel_et_majoration)} FCFA` : null}
                      />
                      <ResultRow
                        label="TTC total SENELEC (avec rappels)"
                        value={`${fmtXOF(calculatedTTC + form.rappel_et_majoration!)} FCFA`}
                        pct=""
                        bold
                        showSenelec={showDeclared}
                        senelecValue={declaredValues?.montant_ttc != null
                          ? `${fmtXOF(declaredValues.montant_ttc)} FCFA` : null}
                      />
                    </>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Quarantine actions — tous les modes */}
            {(() => {
              const canQuarantine =
                (inputMode === 'ocr'     && !!selectedId) ||
                (inputMode === 'senelec' && !!selectedSenelecRowId) ||
                inputMode === 'manual'
              if (!canQuarantine) return null

              if (isAlreadyQuarantined) {
                return (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUnquarantine}
                      disabled={isQuarantining}
                      variant="ghost"
                      className="flex-1 h-9 text-sm border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                      Retirer de la quarantaine
                    </Button>
                  </div>
                )
              }

              const sourceLabel =
                inputMode === 'ocr'     ? 'Facture OCR'
                : inputMode === 'senelec' ? 'Facture SENELEC'
                : 'Simulation'

              return (
                <div className="flex gap-2">
                  <Button
                    onClick={handleQuarantine}
                    disabled={isQuarantining || !isAnomaly}
                    variant="ghost"
                    className={`flex-1 h-9 text-sm border transition-all
                      ${isAnomaly
                        ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/50'
                        : 'border-white/[0.06] text-slate-600 cursor-not-allowed'
                      }`}
                  >
                    {isQuarantining
                      ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-orange-400/30 border-t-orange-400 animate-spin mr-2" />En cours…</>
                      : <><ShieldAlert className="w-3.5 h-3.5 mr-2" />
                        {isAnomaly
                          ? `Mettre en quarantaine (${sourceLabel})`
                          : `Quarantaine (delta < ${threshold}%)`
                        }</>
                    }
                  </Button>
                </div>
              )
            })()}

          </div>
        )}
      </div>
    </div>
  )
}
