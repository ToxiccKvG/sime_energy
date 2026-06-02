import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Save, Zap, TrendingDown, BarChart3, Settings2, Loader2, AlertCircle, CheckCircle2, XCircle, Activity, Wand2, Search, X, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { getAuditSites } from '@/lib/audit-service'
import { getBillingParams, saveBillingParams, getVerifiedInvoicesForAudit } from '@/lib/billing-params-service'
import { mapOcrToInvoiceData, extractPuissanceSouscrite, mapSenelecToInvoiceData } from '@/lib/invoice-mapper'
import { getFacturesSenelecForSelector } from '@/lib/factures-senelec-service'
import type { FactureSenelecForSelector } from '@/lib/factures-senelec-service'
import { calculateBillingKPIs } from '@/lib/billing-calculator'
import { KPIBlock } from '@/components/parametres/KPIBlock'
import { BillingPieChart, type PieSegment } from '@/components/parametres/BillingPieChart'
import { InvoiceSelector } from '@/components/parametres/InvoiceSelector'
import {
  CATEGORIES_BY_TENSION,
  CATEGORY_LABELS,
  BT_BAND_CATEGORIES,
  BT_BAND_LABELS,
  suggestTensionFromPS,
  getAvailableTariffYears,
  isCustomTariffYear,
} from '@/constants/senelec-tariffs'
import type { TariffCategory, TariffYear, BTPowerBand } from '@/constants/senelec-tariffs'
import type { AuditBillingParamsDB, BillingParams, InvoiceData } from '@/types/billing'
import { useOrganization } from '@/context/OrganizationContext'
import { useAuth } from '@/context/AuthContext'
import BillingScenarioComparator from '@/components/parametres/BillingScenarioComparator'
import type { InvoiceForSelector } from '@/lib/billing-params-service'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  numero_contrat:          string
  domaine_tension:         'BT' | 'MT' | 'HT'
  categorie_tarifaire:     TariffCategory
  grille_annee:            TariffYear
  puissance_souscrite_kw:  string
  puissance_transfo_kva:   string
  comptage_position:       'primaire' | 'secondaire'
  has_transformateur:      boolean
  reference_invoice_id:    string
  reference_senelec_id:    string
  reference_source:        'ocr' | 'senelec' | ''
  periode_reference_jours: string
  montant_ttc_override:    string   // override MTTC quand la facture contient des arriérés
  intervalle_mesure_min:   1 | 5 | 10 | 15 | 30
  source_mesure:           string
  tco_applicable:          boolean
  tva_applicable:          boolean
  // ── Seuils 4 piliers (stockés localStorage) ──
  k2_seuil_pct:   number   // % pointe — alerte si K2/total > seuil (défaut 10)
  ps_seuil_pct:   number   // % écart PS/Pmax — alerte si dépassé (défaut 10)
  cosphi_seuil:   number   // alerte si cosφ < seuil (défaut 0.80)
}

const EMPTY_FORM: FormState = {
  numero_contrat:          '',
  domaine_tension:         'BT',
  categorie_tarifaire:     'DPP',
  grille_annee:            2023,
  puissance_souscrite_kw:  '',
  puissance_transfo_kva:   '',
  comptage_position:       'secondaire',
  has_transformateur:      false,
  reference_invoice_id:    '',
  reference_senelec_id:    '',
  reference_source:        '',
  periode_reference_jours: '30',
  montant_ttc_override:    '',
  intervalle_mesure_min:   1,
  source_mesure:           'shelly',
  tco_applicable:          true,
  tva_applicable:          true,
  k2_seuil_pct:   10,
  ps_seuil_pct:   10,
  cosphi_seuil:   0.80,
}

function dbToForm(db: AuditBillingParamsDB, savedThresholds?: Partial<FormState>): FormState {
  return {
    numero_contrat:          db.numero_contrat ?? '',
    domaine_tension:         (db.domaine_tension as 'BT' | 'MT' | 'HT') ?? 'BT',
    categorie_tarifaire:     (db.categorie_tarifaire as TariffCategory) ?? 'DPP',
    grille_annee:            (db.grille_annee as TariffYear) ?? 2023,
    puissance_souscrite_kw:  db.puissance_souscrite_kw != null ? String(db.puissance_souscrite_kw) : '',
    puissance_transfo_kva:   db.puissance_transfo_kva  != null ? String(db.puissance_transfo_kva)  : '',
    comptage_position:       (db.comptage_position as 'primaire' | 'secondaire') ?? 'secondaire',
    has_transformateur:      db.has_transformateur ?? false,
    reference_invoice_id:    db.reference_invoice_id ?? '',
    reference_senelec_id:    db.reference_senelec_id ?? '',
    reference_source:        db.reference_senelec_id ? 'senelec' : db.reference_invoice_id ? 'ocr' : '',
    periode_reference_jours: String(db.periode_reference_jours ?? 30),
    montant_ttc_override:    '',
    intervalle_mesure_min:   (db.intervalle_mesure_min as 1|5|10|15|30) ?? 1,
    source_mesure:           db.source_mesure ?? 'shelly',
    tco_applicable:          db.tco_applicable ?? true,
    tva_applicable:          db.tva_applicable ?? true,
    k2_seuil_pct:  savedThresholds?.k2_seuil_pct  ?? 10,
    ps_seuil_pct:  savedThresholds?.ps_seuil_pct  ?? 10,
    cosphi_seuil:  savedThresholds?.cosphi_seuil  ?? 0.80,
  }
}

function loadThresholds(auditId: string): Partial<FormState> {
  try {
    const raw = localStorage.getItem(`billing-thresholds-${auditId}`)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveThresholds(auditId: string, form: FormState) {
  try {
    localStorage.setItem(`billing-thresholds-${auditId}`, JSON.stringify({
      k2_seuil_pct:  form.k2_seuil_pct,
      ps_seuil_pct:  form.ps_seuil_pct,
      cosphi_seuil:  form.cosphi_seuil,
    }))
  } catch { /* ignore */ }
}

// ─── Small presentational pieces ─────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function FormRow({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={cn('grid gap-3', cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-3' : cols === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
      {children}
    </div>
  )
}

function FieldWrap({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-slate-400 font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
  )
}

function inputCls(extra = '') {
  return cn('h-9 bg-white/5 border-white/10 text-slate-100 text-sm placeholder:text-slate-600 focus-visible:ring-blue-500/30', extra)
}

function selectCls() {
  return 'h-9 bg-white/5 border-white/10 text-slate-200 text-sm focus:ring-blue-500/30'
}

function OptimBadge({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className={cn(
      'flex items-center justify-between px-3 py-2 rounded-lg border text-xs',
      positive
        ? 'bg-emerald-500/8 border-emerald-500/20'
        : 'bg-white/[0.03] border-white/[0.07]',
    )}>
      <span className="text-slate-400">{label}</span>
      <span className={cn('font-semibold tabular-nums', positive ? 'text-emerald-300' : 'text-slate-200')}>
        {value}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AuditBillingParamsProps {
  auditId: string
}

export function AuditBillingParams({ auditId }: AuditBillingParamsProps) {
  const { organization } = useOrganization()
  const { user } = useAuth()

  // Liste des grilles disponibles : standard + custom (depuis user_metadata).
  // Recalculée à chaque changement de user pour rester réactive après un save dans Paramètres.
  const availableYears = useMemo<TariffYear[]>(() => {
    // Le registre est déjà alimenté par AuthContext ; on lit user pour la réactivité.
    void user?.user_metadata?.energy_settings?.custom_tariff_grids
    return getAvailableTariffYears() as TariffYear[]
  }, [user?.user_metadata?.energy_settings?.custom_tariff_grids])

  const [siteId, setSiteId]     = useState<string | null>(null)
  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [invoices, setInvoices]               = useState<InvoiceForSelector[]>([])
  const [senelecFactures, setSenelecFactures] = useState<FactureSenelecForSelector[]>([])
  const [loading, setLoading]                 = useState(true)
  const [saving, setSaving]     = useState(false)
  const [noSite, setNoSite]     = useState(false)

  // ── OCR auto-détection puissance souscrite ──
  const [ocrPs, setOcrPs]             = useState<number | null>(null)
  const [ocrSuggestion, setOcrSuggestion] = useState<ReturnType<typeof suggestTensionFromPS> | null>(null)

  // ── Recherche par N° contrat ──
  const [contractSearch, setContractSearch] = useState('')
  const contractDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Recherche par N° facture (auto-détection contrat) ──
  const [invoiceNumSearch, setInvoiceNumSearch] = useState('')
  const [invoiceSearchStatus, setInvoiceSearchStatus] = useState<null | 'found' | 'not-found'>(null)
  const [invoiceFoundSource, setInvoiceFoundSource] = useState<null | 'OCR' | 'Excel SENELEC'>(null)
  const invoiceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Bootstrap : récupère le 1er site + params existants + factures ──
  useEffect(() => {
    if (!auditId) return
    setLoading(true)

    const thresholds = loadThresholds(auditId)

    Promise.all([
      getAuditSites(auditId),
      getVerifiedInvoicesForAudit(auditId),
      getFacturesSenelecForSelector(auditId),
    ])
      .then(async ([sites, invs, senelec]) => {
        setInvoices(invs ?? [])
        setSenelecFactures(senelec ?? [])

        const first = sites?.[0]
        if (!first) { setNoSite(true); return }
        setSiteId(first.id)

        const existing = await getBillingParams(auditId, first.id).catch(() => null)
        if (existing) setForm(dbToForm(existing, thresholds))
        else setForm(prev => ({ ...prev, ...thresholds }))
      })
      .catch(() => toast.error('Erreur chargement paramètres'))
      .finally(() => setLoading(false))
  }, [auditId])

  // ── Persistance seuils dans localStorage ──
  useEffect(() => {
    if (auditId) saveThresholds(auditId, form)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.k2_seuil_pct, form.ps_seuil_pct, form.cosphi_seuil, auditId])

  // ── Debounce N° contrat → contractSearch ──
  useEffect(() => {
    if (contractDebounceRef.current) clearTimeout(contractDebounceRef.current)
    const val = form.numero_contrat.trim()
    if (val.length < 4) {
      setContractSearch('')
      return
    }
    contractDebounceRef.current = setTimeout(() => setContractSearch(val), 600)
    return () => { if (contractDebounceRef.current) clearTimeout(contractDebounceRef.current) }
  }, [form.numero_contrat])

  // ── N° de facture → auto-détection N° de contrat ──
  useEffect(() => {
    if (invoiceDebounceRef.current) clearTimeout(invoiceDebounceRef.current)
    const val = invoiceNumSearch.trim()
    if (!val) {
      setInvoiceSearchStatus(null)
      setInvoiceFoundSource(null)
      return
    }
    invoiceDebounceRef.current = setTimeout(() => {
      const q = val.toLowerCase()

      // 1. Chercher dans les factures SENELEC Excel
      const senelecMatch = senelecFactures.find(f =>
        String(f.numero_facture ?? '').toLowerCase().includes(q)
      )
      if (senelecMatch?.numero_compte_contrat) {
        set('numero_contrat', senelecMatch.numero_compte_contrat)
        setInvoiceSearchStatus('found')
        setInvoiceFoundSource('Excel SENELEC')
        return
      }

      // 2. Chercher dans les factures OCR
      const INVOICE_KEYS = ['NUMERO_FACTURE', 'FACTURE N°', 'N° FACTURE', 'FACTURE N', 'FACTURE NO', 'N° FACTURE :']
      const CONTRACT_KEYS = ['N° COMPTE CONTRAT', 'N°COMPTE DE CONTRAT']

      for (const inv of invoices) {
        const data = inv.ocr_data as Record<string, unknown> | null
        if (!data) continue
        const pages = data['page']
        if (!Array.isArray(pages)) continue
        for (const page of pages as Record<string, unknown>[]) {
          const forms = (page['forms'] as Array<{ Key: string; Value: string }>) ?? []
          const invoiceMatch = forms.some(
            f => INVOICE_KEYS.includes(f.Key) && String(f.Value ?? '').toLowerCase().includes(q)
          )
          if (invoiceMatch) {
            const contractField = forms.find(f => CONTRACT_KEYS.includes(f.Key))
            if (contractField?.Value) {
              set('numero_contrat', contractField.Value)
              setInvoiceSearchStatus('found')
              setInvoiceFoundSource('OCR')
              return
            }
          }
        }
      }

      setInvoiceSearchStatus('not-found')
      setInvoiceFoundSource(null)
    }, 600)
    return () => { if (invoiceDebounceRef.current) clearTimeout(invoiceDebounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNumSearch, senelecFactures, invoices])

  // ── Filtrage factures par N° contrat ──
  const filteredSenelecFactures = useMemo(() => {
    if (!contractSearch) return senelecFactures
    const q = contractSearch.toLowerCase()
    return senelecFactures.filter(f =>
      f.numero_compte_contrat?.toLowerCase().includes(q)
    )
  }, [contractSearch, senelecFactures])

  const filteredInvoices = useMemo(() => {
    if (!contractSearch) return invoices
    const q = contractSearch.toLowerCase()
    return invoices.filter(inv => {
      const data = inv.ocr_data as Record<string, unknown> | null
      if (!data) return false
      const pages = data['page']
      if (!Array.isArray(pages)) return false
      return pages.some((p: Record<string, unknown>) =>
        (p['forms'] as Array<{Key: string; Value: string}> ?? []).some(f =>
          ['N° COMPTE CONTRAT', 'N°COMPTE DE CONTRAT'].includes(f.Key) &&
          String(f.Value ?? '').toLowerCase().includes(q)
        )
      )
    })
  }, [contractSearch, invoices])

  const contractMatchCount = contractSearch
    ? filteredSenelecFactures.length + filteredInvoices.length
    : null

  // ── Dérivation InvoiceData depuis la facture sélectionnée (OCR ou SENELEC) ──
  const selectedInvoice = form.reference_source === 'ocr'
    ? (invoices.find(i => i.id === form.reference_invoice_id) ?? null)
    : null

  const selectedSenelecRow = form.reference_source === 'senelec'
    ? (senelecFactures.find(r => r.id === form.reference_senelec_id) ?? null)
    : null

  const invoiceData = useMemo<Partial<InvoiceData> | null>(() => {
    if (form.reference_source === 'ocr' && selectedInvoice)
      return mapOcrToInvoiceData(selectedInvoice.ocr_data, selectedInvoice.amount ?? undefined)
    if (form.reference_source === 'senelec' && selectedSenelecRow)
      return mapSenelecToInvoiceData(selectedSenelecRow)
    return null
  }, [form.reference_source, selectedInvoice, selectedSenelecRow])

  // ── Auto-fill NJ quand l'OCR fournit la durée de la période ──
  useEffect(() => {
    if (invoiceData?.periode_jours_ocr && invoiceData.periode_jours_ocr > 0) {
      setForm(prev => ({ ...prev, periode_reference_jours: String(invoiceData.periode_jours_ocr) }))
    }
  }, [invoiceData?.periode_jours_ocr])

  // ── Réinitialiser override MTTC au changement de facture ──
  // Si l'OCR fournit un "TOTAL FACTURE" distinct du montant DB → pré-remplir l'override
  useEffect(() => {
    if (!invoiceData) {
      setForm(prev => ({ ...prev, montant_ttc_override: '' }))
      return
    }
    // Si total_facture_ocr est disponible et diffère significativement du montant_ttc DB
    // (signe possible d'arriérés) → pré-remplir l'override avec le TOTAL FACTURE OCR
    if (invoiceData.total_facture_ocr && invoiceData.montant_ttc) {
      const ratio = invoiceData.montant_ttc / invoiceData.total_facture_ocr
      const hasSuspiciousArrears = ratio > 1.15  // +15% ou plus → probable arriérés
      if (hasSuspiciousArrears) {
        setForm(prev => ({ ...prev, montant_ttc_override: String(Math.round(invoiceData.total_facture_ocr!)) }))
      } else {
        setForm(prev => ({ ...prev, montant_ttc_override: '' }))
      }
    } else {
      setForm(prev => ({ ...prev, montant_ttc_override: '' }))
    }
  }, [form.reference_invoice_id, form.reference_senelec_id])

  // ── Résolution MTTC : override manuel > montant OCR ──
  const resolvedMttc = useMemo(() => {
    const override = parseFloat(form.montant_ttc_override)
    if (!isNaN(override) && override > 0) return override
    return invoiceData?.montant_ttc ?? null
  }, [form.montant_ttc_override, invoiceData?.montant_ttc])

  // ── Params + invoice résolus (partagés KPIs + comparateur) ──
  const billingParams = useMemo((): BillingParams | null => {
    const ps = parseFloat(form.puissance_souscrite_kw)
    const nj = parseInt(form.periode_reference_jours, 10)
    if (!ps || !nj) return null
    return {
      categorie:              form.categorie_tarifaire,
      grille_annee:           form.grille_annee,
      puissance_souscrite_kw: ps,
      periode_jours:          nj,
      has_transformateur:     form.has_transformateur,
      puissance_transfo_kva:  parseFloat(form.puissance_transfo_kva) || undefined,
      comptage_position:      form.comptage_position,
      tco_applicable:         form.tco_applicable,
      tva_applicable:         form.tva_applicable,
    }
  }, [form])

  const resolvedInvoice = useMemo((): InvoiceData | null => {
    if (!invoiceData?.conso_kwh_total || !resolvedMttc) return null
    return {
      conso_kwh_total:    invoiceData.conso_kwh_total,
      conso_k1_kwh:       invoiceData.conso_k1_kwh,
      conso_k2_kwh:       invoiceData.conso_k2_kwh,
      montant_energie:    invoiceData.montant_energie,
      montant_prime_fixe: invoiceData.montant_prime_fixe,
      montant_pdp:        invoiceData.montant_pdp,
      montant_cosphi:     invoiceData.montant_cosphi,
      montant_tva:        invoiceData.montant_tva,
      montant_tco:        invoiceData.montant_tco,
      montant_redevance:  invoiceData.montant_redevance,
      montant_ttc:        resolvedMttc,
      puissance_max_kw:   invoiceData.puissance_max_kw,
      cosphi_mesure:      invoiceData.cosphi_mesure,
    }
  }, [invoiceData, resolvedMttc])

  // ── Calcul KPIs en temps réel ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kpis = useMemo(() => {
    if (!billingParams || !resolvedInvoice) return null
    return calculateBillingKPIs(billingParams, resolvedInvoice)
  }, [billingParams, resolvedInvoice])

  // ── OCR : extraction PS quand la facture OCR de référence change ──
  useEffect(() => {
    if (!selectedInvoice) {
      setOcrPs(null)
      setOcrSuggestion(null)
      return
    }
    const ps = extractPuissanceSouscrite(selectedInvoice.ocr_data)
    setOcrPs(ps)
    setOcrSuggestion(ps ? suggestTensionFromPS(ps) : null)
  }, [selectedInvoice])

  // ── Auto-fill PS et NJ depuis une facture SENELEC sélectionnée ──
  useEffect(() => {
    if (!selectedSenelecRow) return
    const psKw = selectedSenelecRow.puissance_souscrite_kw
      ?? (selectedSenelecRow.puissance_souscrite != null && selectedSenelecRow.puissance_souscrite >= 900
          ? selectedSenelecRow.puissance_souscrite / 1000
          : selectedSenelecRow.puissance_souscrite)
    const nj = selectedSenelecRow.nb_jour_facturation
    setForm(prev => ({
      ...prev,
      ...(psKw != null && !prev.puissance_souscrite_kw ? { puissance_souscrite_kw: String(psKw) } : {}),
      ...(nj != null ? { periode_reference_jours: String(nj) } : {}),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.reference_senelec_id])

  // ── Handlers ──
  const set = (k: keyof FormState, v: FormState[keyof FormState]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleReferenceChange = (compound: string) => {
    if (compound.startsWith('ocr:')) {
      const id = compound.slice(4)
      setForm(prev => ({ ...prev, reference_invoice_id: id, reference_senelec_id: '', reference_source: 'ocr' }))
    } else if (compound.startsWith('senelec:')) {
      const id = compound.slice(8)
      setForm(prev => ({ ...prev, reference_senelec_id: id, reference_invoice_id: '', reference_source: 'senelec' }))
    }
  }

  const handleTensionChange = (t: 'BT' | 'MT' | 'HT') => {
    const firstCat = CATEGORIES_BY_TENSION[t][0]
    setForm(prev => ({
      ...prev,
      domaine_tension:     t,
      categorie_tarifaire: firstCat,
      tco_applicable:      t === 'BT',
      tva_applicable:      true,
    }))
  }

  const handleApplyOcrSuggestion = () => {
    if (!ocrSuggestion) return
    const newTension = ocrSuggestion.domaine
    const newCat: TariffCategory = ocrSuggestion.band
      ? BT_BAND_CATEGORIES[ocrSuggestion.band as BTPowerBand][0]
      : CATEGORIES_BY_TENSION[newTension][0]
    setForm(prev => ({
      ...prev,
      domaine_tension:      newTension,
      categorie_tarifaire:  newCat,
      puissance_souscrite_kw: ocrPs != null ? String(ocrPs) : prev.puissance_souscrite_kw,
    }))
  }

  const handleSave = async () => {
    if (!siteId || !organization?.id) return
    setSaving(true)
    try {
      const payload: Omit<AuditBillingParamsDB, 'id' | 'created_at' | 'updated_at'> = {
        audit_id:               auditId,
        site_id:                siteId,
        organization_id:        organization.id,
        numero_contrat:         form.numero_contrat || undefined,
        domaine_tension:        form.domaine_tension,
        categorie_tarifaire:    form.categorie_tarifaire,
        grille_annee:           form.grille_annee,
        puissance_souscrite_kw: parseFloat(form.puissance_souscrite_kw) || undefined,
        puissance_transfo_kva:  parseFloat(form.puissance_transfo_kva)  || undefined,
        comptage_position:      form.comptage_position,
        has_transformateur:     form.has_transformateur,
        reference_invoice_id:   form.reference_source === 'ocr' ? form.reference_invoice_id || undefined : undefined,
        reference_senelec_id:   form.reference_source === 'senelec' ? form.reference_senelec_id || undefined : undefined,
        periode_reference_jours: parseInt(form.periode_reference_jours, 10) || 30,
        intervalle_mesure_min:  form.intervalle_mesure_min,
        source_mesure:          form.source_mesure,
        tco_applicable:         form.tco_applicable,
        tva_applicable:         form.tva_applicable,
      }
      await saveBillingParams(payload)
      toast.success('Paramètres sauvegardés')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / no site ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    )
  }

  if (noSite) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <AlertCircle className="w-7 h-7 text-blue-400" />
        </div>
        <p className="text-sm font-medium text-slate-200">Aucun site configuré</p>
        <p className="text-xs text-slate-500 max-w-xs">
          Créez au moins un site dans les informations générales avant de configurer les paramètres SENELEC.
        </p>
      </div>
    )
  }

  const isMT = form.domaine_tension === 'MT'

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Paramètres SENELEC</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configuration contractuelle et moteur de calcul facturation</p>
        </div>
        <div className="flex items-center gap-2">
          <BillingScenarioComparator
            currentParams={billingParams ?? {
              categorie: form.categorie_tarifaire,
              grille_annee: form.grille_annee,
              puissance_souscrite_kw: parseFloat(form.puissance_souscrite_kw) || 0,
              periode_jours: parseInt(form.periode_reference_jours, 10) || 30,
            }}
            invoiceData={resolvedInvoice ?? { conso_kwh_total: 0, montant_ttc: 0 }}
            thresholds={{
              k2_seuil_pct: form.k2_seuil_pct,
              ps_seuil_pct: form.ps_seuil_pct,
              cosphi_seuil: form.cosphi_seuil,
            }}
            disabled={!billingParams || !resolvedInvoice}
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium h-8 px-4 text-xs gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Sauvegarder
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ════════ Colonne gauche — Formulaire ════════ */}
        <div className="space-y-5">

          {/* ── Section A : Contrat SENELEC ── */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] p-5">
            <SectionHeader
              icon={<Zap className="w-4 h-4 text-blue-400" />}
              title="Contrat SENELEC"
              subtitle="Catégorie tarifaire et puissances contractuelles"
            />

            <div className="space-y-3">
              <FormRow cols={2}>
                <FieldWrap label="N° de contrat">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <Input
                      value={form.numero_contrat}
                      onChange={e => set('numero_contrat', e.target.value)}
                      placeholder="Ex : 22002670957"
                      className={inputCls('pl-8 pr-8')}
                    />
                    {form.numero_contrat && (
                      <button
                        type="button"
                        onClick={() => { set('numero_contrat', ''); setContractSearch('') }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {contractMatchCount !== null && (
                    <p className={cn(
                      'text-[11px] flex items-center gap-1 mt-0.5',
                      contractMatchCount > 0 ? 'text-emerald-400' : 'text-slate-500',
                    )}>
                      {contractMatchCount > 0
                        ? <><CheckCircle2 className="w-3 h-3" />{contractMatchCount} facture{contractMatchCount > 1 ? 's' : ''} trouvée{contractMatchCount > 1 ? 's' : ''} — filtre actif</>
                        : <><AlertCircle className="w-3 h-3" />Aucune facture pour ce N° contrat</>
                      }
                    </p>
                  )}
                </FieldWrap>
                <FieldWrap label="Grille tarifaire">
                  <Select
                    value={String(form.grille_annee)}
                    onValueChange={v => set('grille_annee', parseInt(v) as TariffYear)}
                  >
                    <SelectTrigger className={selectCls()}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1018] border-white/10 text-white">
                      {availableYears.map(y => (
                        <SelectItem key={y} value={String(y)} className="text-slate-200 focus:bg-slate-700/50">
                          <span className="inline-flex items-center gap-1.5">
                            Grille {y}
                            {isCustomTariffYear(y) && (
                              <span className="text-[9px] bg-violet-500/20 text-violet-300 px-1 rounded">custom</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
              </FormRow>

              {/* N° de facture — recherche avec auto-détection contrat */}
              <FormRow cols={1}>
                <FieldWrap label="N° de facture" hint="Facultatif — détecte automatiquement le N° de contrat depuis les données importées">
                  <div className="relative">
                    <Receipt className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <Input
                      value={invoiceNumSearch}
                      onChange={e => { setInvoiceNumSearch(e.target.value); setInvoiceSearchStatus(null) }}
                      placeholder="Ex : 2024001234"
                      className={inputCls('pl-8 pr-8')}
                    />
                    {invoiceNumSearch && (
                      <button
                        type="button"
                        onClick={() => { setInvoiceNumSearch(''); setInvoiceSearchStatus(null); setInvoiceFoundSource(null) }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {invoiceSearchStatus === 'found' && (
                    <p className="text-[11px] flex items-center gap-1 mt-0.5 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      N° de contrat auto-détecté depuis {invoiceFoundSource}
                    </p>
                  )}
                  {invoiceSearchStatus === 'not-found' && (
                    <p className="text-[11px] flex items-center gap-1 mt-0.5 text-slate-500">
                      <AlertCircle className="w-3 h-3" />
                      N° de facture non trouvé dans les données importées
                    </p>
                  )}
                </FieldWrap>
              </FormRow>

              {/* Domaine de tension — segmented control */}
              <FieldWrap label="Domaine de tension">
                <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5 gap-0.5">
                  {([
                    { t: 'BT', sub: '0–1 000 V' },
                    { t: 'MT', sub: '1–30 kV' },
                    { t: 'HT', sub: '> 30 kV' },
                  ] as const).map(({ t, sub }) => (
                    <button
                      key={t}
                      onClick={() => handleTensionChange(t)}
                      className={cn(
                        'flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex flex-col items-center gap-0.5',
                        form.domaine_tension === t
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <span>{t}</span>
                      <span className={cn('text-[9px] font-normal', form.domaine_tension === t ? 'text-blue-200' : 'text-slate-600')}>
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>
              </FieldWrap>

              {/* Bannière suggestion OCR */}
              {ocrSuggestion && (
                <div className={cn(
                  'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs',
                  ocrSuggestion.domaine !== form.domaine_tension
                    ? 'bg-amber-500/8 border-amber-500/20'
                    : 'bg-emerald-500/8 border-emerald-500/20',
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Wand2 className={cn('w-3.5 h-3.5 shrink-0', ocrSuggestion.domaine !== form.domaine_tension ? 'text-amber-400' : 'text-emerald-400')} />
                    <div className="min-w-0">
                      <span className="text-slate-400">OCR détecté · </span>
                      <span className="font-mono text-slate-200">{ocrPs} kW</span>
                      <span className="text-slate-500 mx-1">→</span>
                      <span className={cn('font-semibold', ocrSuggestion.domaine !== form.domaine_tension ? 'text-amber-300' : 'text-emerald-300')}>
                        {ocrSuggestion.label}
                      </span>
                    </div>
                  </div>
                  {ocrSuggestion.domaine !== form.domaine_tension && (
                    <button
                      onClick={handleApplyOcrSuggestion}
                      className="text-[10px] font-medium px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shrink-0 transition-colors"
                    >
                      Appliquer
                    </button>
                  )}
                </div>
              )}

              <FieldWrap label="Catégorie tarifaire">
                <Select
                  value={form.categorie_tarifaire}
                  onValueChange={v => set('categorie_tarifaire', v as TariffCategory)}
                >
                  <SelectTrigger className={selectCls()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1018] border-white/10 text-white">
                    {form.domaine_tension === 'BT' ? (
                      (['PP', 'MP', 'GP'] as BTPowerBand[]).map(band => (
                        <SelectGroup key={band}>
                          <SelectLabel className="text-[10px] text-slate-600 uppercase tracking-wider px-2 py-1.5 font-semibold">
                            {BT_BAND_LABELS[band]}
                          </SelectLabel>
                          {BT_BAND_CATEGORIES[band].map(cat => (
                            <SelectItem key={cat} value={cat} className="text-slate-200 focus:bg-slate-700/50 text-xs pl-5">
                              <span className="font-semibold text-slate-100">{cat}</span>
                              <span className="text-slate-400 ml-1">— {CATEGORY_LABELS[cat].split('—')[1]?.trim()}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))
                    ) : (
                      CATEGORIES_BY_TENSION[form.domaine_tension].map(cat => (
                        <SelectItem key={cat} value={cat} className="text-slate-200 focus:bg-slate-700/50 text-xs">
                          {CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </FieldWrap>

              <FieldWrap label="Puissance souscrite (PS)">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      value={form.puissance_souscrite_kw}
                      onChange={e => set('puissance_souscrite_kw', e.target.value)}
                      placeholder="Ex : 165"
                      className={inputCls('pr-10')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">kW</span>
                  </div>
                  {ocrPs != null && String(ocrPs) !== form.puissance_souscrite_kw && (
                    <button
                      onClick={() => set('puissance_souscrite_kw', String(ocrPs))}
                      title={`Utiliser la valeur OCR : ${ocrPs} kW`}
                      className="flex items-center gap-1 px-2.5 rounded-lg border border-blue-500/30 bg-blue-500/8 text-blue-300 text-[10px] hover:bg-blue-500/15 transition-colors shrink-0"
                    >
                      <Wand2 className="w-3 h-3" />
                      {ocrPs} kW
                    </button>
                  )}
                </div>
              </FieldWrap>

              {/* Champs MT uniquement */}
              {isMT && (
                <>
                  <Separator className="bg-white/[0.06]" />
                  <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Transformateur (MT)</p>
                  <FormRow cols={2}>
                    <FieldWrap label="Puissance transformateur">
                      <div className="relative">
                        <Input
                          type="number"
                          value={form.puissance_transfo_kva}
                          onChange={e => set('puissance_transfo_kva', e.target.value)}
                          placeholder="Ex : 250"
                          className={inputCls('pr-12')}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">kVA</span>
                      </div>
                    </FieldWrap>
                    <FieldWrap label="Position comptage">
                      <Select
                        value={form.comptage_position}
                        onValueChange={v => set('comptage_position', v as 'primaire' | 'secondaire')}
                      >
                        <SelectTrigger className={selectCls()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d1018] border-white/10 text-white">
                          <SelectItem value="secondaire" className="text-slate-200 focus:bg-slate-700/50">Secondaire</SelectItem>
                          <SelectItem value="primaire"   className="text-slate-200 focus:bg-slate-700/50">Primaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldWrap>
                  </FormRow>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="has-transfo"
                      checked={form.has_transformateur}
                      onCheckedChange={v => set('has_transformateur', Boolean(v))}
                      className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label htmlFor="has-transfo" className="text-xs text-slate-300 cursor-pointer">
                      Client propriétaire du transformateur
                    </Label>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Section B : Facture de référence ── */}
          <div className="rounded-xl border border-amber-500/20 bg-[#0d1018] p-5">
            <SectionHeader
              icon={<BarChart3 className="w-4 h-4 text-amber-400" />}
              title="Facture de référence"
              subtitle="Facture représentative — éviter les mois atypiques (vacances, pic)"
            />

            <div className="space-y-3">
              <FieldWrap label={
                contractSearch
                  ? `Facture de référence${contractMatchCount !== null && contractMatchCount > 0 ? ` — filtrée par N° ${contractSearch}` : ''}`
                  : 'Facture de référence'
              }>
                <InvoiceSelector
                  invoices={filteredInvoices}
                  senelecInvoices={filteredSenelecFactures}
                  value={
                    form.reference_source === 'ocr' && form.reference_invoice_id
                      ? `ocr:${form.reference_invoice_id}`
                      : form.reference_source === 'senelec' && form.reference_senelec_id
                        ? `senelec:${form.reference_senelec_id}`
                        : null
                  }
                  onChange={handleReferenceChange}
                  contractFiltered={!!contractSearch}
                />
              </FieldWrap>

              <FormRow cols={2}>
                <FieldWrap label="Durée de la période" hint="NJ — issu des dates début/fin de la facture">
                  <div className="relative">
                    <Input
                      type="number"
                      value={form.periode_reference_jours}
                      onChange={e => set('periode_reference_jours', e.target.value)}
                      placeholder="30"
                      className={inputCls('pr-12')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">jours</span>
                  </div>
                </FieldWrap>
                <FieldWrap label="Taxes applicables">
                  <div className="flex flex-col gap-2 pt-1">
                    <p className="text-xs text-slate-400">TVA 18 %</p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="tco"
                        checked={form.tco_applicable}
                        disabled={form.domaine_tension !== 'BT'}
                        onCheckedChange={v => set('tco_applicable', Boolean(v))}
                        className="border-white/20 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 disabled:opacity-40"
                      />
                      <Label
                        htmlFor="tco"
                        className={cn('text-xs cursor-pointer', form.domaine_tension !== 'BT' ? 'text-slate-500' : 'text-slate-300')}
                      >
                        Taxe communale {form.domaine_tension === 'BT' ? '2,5 %' : '0 % (MT/HT)'}
                      </Label>
                    </div>
                  </div>
                </FieldWrap>
              </FormRow>

              {/* Résumé facture sélectionnée */}
              {invoiceData && invoiceData.conso_kwh_total && (
                <>
                  {/* Avertissement arriérés SENELEC */}
                  {invoiceData.montant_ttc && invoiceData.total_facture_ocr &&
                    invoiceData.montant_ttc / invoiceData.total_facture_ocr > 1.15 && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/25">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] text-red-300 font-medium leading-relaxed">
                          Arriérés détectés — SOLDE DES IMPAYES probable
                        </p>
                        <p className="text-[11px] text-red-300/70 leading-relaxed mt-0.5">
                          Montant DB ({formatNumber(invoiceData.montant_ttc, 0)} FCFA) inclut probablement des arriérés.
                          TOTAL FACTURE OCR : {formatNumber(invoiceData.total_facture_ocr, 0)} FCFA.
                          Le champ ci-dessous a été pré-rempli — vérifiez et corrigez si nécessaire.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Override MTTC */}
                  <FieldWrap
                    label="Montant période courante (MTTC)"
                    hint="Laisser vide pour utiliser le montant OCR. Remplir si la facture contient des arriérés (SOLDE DES IMPAYES)."
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        value={form.montant_ttc_override}
                        onChange={e => set('montant_ttc_override', e.target.value)}
                        placeholder={invoiceData.montant_ttc ? formatNumber(invoiceData.montant_ttc, 0) : 'Automatique'}
                        className={inputCls('pr-14')}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">FCFA</span>
                    </div>
                  </FieldWrap>

                  {/* Avertissement Woyofal / prépayé */}
                  {!resolvedMttc && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/8 border border-orange-500/20">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-orange-300 leading-relaxed">
                        Montant TTC absent — facture prépayée (Woyofal) ou format non standard ? Les calculs nécessitent un montant TTC.
                      </p>
                    </div>
                  )}

                  {/* NJ auto-fill notice */}
                  {invoiceData.periode_jours_ocr && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/8 border border-blue-500/15">
                      <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                      <p className="text-[11px] text-blue-300">NJ auto-renseigné depuis la facture : {invoiceData.periode_jours_ocr} jours</p>
                    </div>
                  )}

                  {/* Grille de données — jusqu'à 6 cellules selon disponibilité */}
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {[
                      { label: 'Consommation',    value: formatNumber(invoiceData.conso_kwh_total, 0),  unit: 'kWh',  always: true },
                      { label: 'Montant TTC',      value: formatNumber(resolvedMttc ?? 0, 0),            unit: 'FCFA', always: true },
                      { label: 'Pmax relevée',     value: invoiceData.puissance_max_kw ? formatNumber(invoiceData.puissance_max_kw, 0) : '—', unit: invoiceData.puissance_max_kw ? 'kW' : '', always: true },
                      { label: 'Prime fixe',       value: invoiceData.montant_prime_fixe ? formatNumber(invoiceData.montant_prime_fixe, 0) : null, unit: 'FCFA', always: false },
                      { label: 'Pénalité cosφ',   value: invoiceData.montant_cosphi ? formatNumber(invoiceData.montant_cosphi, 0) : null, unit: 'FCFA', always: false, alert: true },
                      { label: 'cos φ mesuré',     value: invoiceData.cosphi_mesure ? invoiceData.cosphi_mesure.toFixed(3) : null, unit: '', always: false },
                    ]
                      .filter(m => m.always || m.value !== null)
                      .map(m => (
                        <div key={m.label} className={cn(
                          'rounded-lg border px-3 py-2 text-center',
                          m.alert && m.value !== null ? 'bg-orange-500/8 border-orange-500/20' : 'bg-white/[0.03] border-white/[0.06]',
                        )}>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</p>
                          <p className={cn('text-sm font-semibold tabular-nums mt-0.5', m.alert && m.value !== null ? 'text-orange-300' : 'text-slate-100')}>
                            {m.value ?? '—'}
                            {m.unit && m.value !== null && m.value !== '—' && (
                              <span className="text-[10px] text-slate-500 ml-1">{m.unit}</span>
                            )}
                          </p>
                        </div>
                      ))
                    }
                  </div>

                  {/* Tableau des tranches BT — affiché si l'OCR a détecté le tableau */}
                  {(invoiceData.tranche1_kwh || invoiceData.tranche2_kwh || invoiceData.tranche3_kwh) && (
                    <div className="mt-3 rounded-lg border border-blue-500/15 bg-blue-500/[0.04] overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/10">
                        <span className="text-[10px] font-semibold text-blue-400/70 uppercase tracking-wider">Tranches — Tableau OCR</span>
                      </div>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[9px] text-slate-600 uppercase tracking-wider">
                            <th className="px-3 py-1.5 text-left font-medium">Tranche</th>
                            <th className="px-3 py-1.5 text-right font-medium">kWh</th>
                            <th className="px-3 py-1.5 text-right font-medium">FCFA/kWh</th>
                            <th className="px-3 py-1.5 text-right font-medium">Montant FCFA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: '1ère tranche', kwh: invoiceData.tranche1_kwh, tarif: invoiceData.tranche1_tarif, montant: invoiceData.tranche1_montant },
                            { label: '2ème tranche', kwh: invoiceData.tranche2_kwh, tarif: invoiceData.tranche2_tarif, montant: invoiceData.tranche2_montant },
                            { label: '3ème tranche', kwh: invoiceData.tranche3_kwh, tarif: invoiceData.tranche3_tarif, montant: invoiceData.tranche3_montant },
                          ].filter(t => t.kwh || t.montant).map(t => (
                            <tr key={t.label} className="border-t border-blue-500/[0.08]">
                              <td className="px-3 py-1.5 text-slate-400">{t.label}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-300">{t.kwh ? formatNumber(t.kwh, 0) : '—'}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-400">{t.tarif ? t.tarif.toFixed(2) : '—'}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-blue-300/80">{t.montant ? formatNumber(t.montant, 0) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>

        {/* ════════ Colonne droite — KPIs ════════ */}
        <div className="space-y-4">

          {/* ── Avertissement MT grille indisponible ── */}
          {kpis?.mt_tarif_indisponible && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/8 border border-orange-500/25">
              <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-300">Données tarifaires MT non disponibles</p>
                <p className="text-[11px] text-orange-300/70 mt-0.5 leading-relaxed">
                  La grille {form.grille_annee} ne contient pas encore les données MT/HT pour {form.categorie_tarifaire}.
                  Utilisez la grille 2026 (données MT/HT disponibles) ou changez de catégorie pour calculer les KPIs.
                </p>
              </div>
            </div>
          )}

          {(!kpis || kpis.mt_tarif_indisponible) ? (
            !kpis?.mt_tarif_indisponible ? (
              <KPIChecklist
                ps={parseFloat(form.puissance_souscrite_kw)}
                nj={parseInt(form.periode_reference_jours, 10)}
                invoiceSelected={!!form.reference_invoice_id}
                invoiceHasConso={!!invoiceData?.conso_kwh_total}
                invoiceHasMontant={!!resolvedMttc}
                invoicesAvailable={invoices.length}
              />
            ) : null
          ) : (
            <>
              {/* Bloc 1 — Normalisation */}
              <KPIBlock
                title="Normalisation temporelle"
                accent="blue"
                icon={<BarChart3 className="w-3.5 h-3.5 text-blue-400" />}
                metrics={[
                  { label: 'Conso journalière',  value: formatNumber(kpis.conso_journaliere_kwh, 1),       unit: 'kWh/j' },
                  { label: 'Conso annuelle',      value: formatNumber(kpis.conso_annuelle_kwh / 1000, 1),   unit: 'MWh/an' },
                  { label: 'Coût journalier',     value: formatNumber(kpis.cout_journalier_fcfa, 0),        unit: 'FCFA/j' },
                  { label: 'Coût annuel estimé',  value: formatNumber(kpis.cout_annuel_fcfa, 0),            unit: 'FCFA/an' },
                ]}
              />

              {/* Bloc 2 — Coûts unitaires */}
              <KPIBlock
                title="Coûts unitaires"
                accent="amber"
                icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
                metrics={[
                  { label: 'Cm SENELEC (pondéré)',    value: formatNumber(kpis.cm_fcfa_kwh, 2),           unit: 'FCFA/kWh' },
                  { label: 'IPR client (tout incl.)', value: formatNumber(kpis.ipr_fcfa_kwh, 2),           unit: 'FCFA/kWh' },
                  { label: 'Surcoût / kWh',           value: formatNumber(kpis.surcout_kwh_fcfa, 2),       unit: 'FCFA/kWh', alert: kpis.surcout_kwh_fcfa > 0 },
                  { label: 'Surcoût mensuel',         value: formatNumber(kpis.surcout_monetaire_fcfa, 0), unit: 'FCFA',     alert: kpis.surcout_monetaire_fcfa > 0 },
                ]}
              />

              {/* Bloc 3 — Puissance */}
              <KPIBlock
                title="Indicateurs puissance"
                accent="violet"
                icon={<Settings2 className="w-3.5 h-3.5 text-violet-400" />}
                metrics={[
                  {
                    label: 'Facteur d\'utilisation',
                    value: formatNumber(kpis.facteur_utilisation_pct, 1),
                    unit: '%',
                    missing: !invoiceData?.puissance_max_kw,
                    tooltip: 'Nécessite Pmax — non disponible sur les factures PP/MP',
                  },
                  { label: 'Heures d\'utilisation',  value: formatNumber(kpis.nb_heures_utilisation, 0),  unit: 'h/an' },
                  ...(kpis.taux_charge_transfo_pct != null
                    ? [{ label: 'Taux de charge transfo', value: formatNumber(kpis.taux_charge_transfo_pct, 1), unit: '%', alert: kpis.taux_charge_transfo_pct > 90 }]
                    : []),
                  ...(kpis.choix_tarif_optimal
                    ? [{
                        label: 'Tarif optimal recommandé',
                        value: kpis.choix_tarif_optimal,
                        good: kpis.choix_tarif_optimal === form.categorie_tarifaire,
                        alert: kpis.choix_tarif_optimal !== form.categorie_tarifaire,
                      }]
                    : []),
                ]}
              />

              {/* Bloc 4 — Répartition (pie) */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Répartition de la facture</h4>
                  {kpis.pct_residuel > 2 && (
                    <span className="text-[10px] text-amber-500/70 font-mono">
                      {formatNumber(kpis.pct_residuel, 0)}% non identifié
                    </span>
                  )}
                </div>
                <BillingPieChart
                  segments={[
                    {
                      name: 'Énergie (consommée)',
                      value: kpis.pct_energie,
                      color: '#f59e0b',
                      fcfa: kpis.montant_energie_calc,
                      estimated: kpis.energie_reconstructed,
                    },
                    {
                      name: 'Prime fixe (PS)',
                      value: kpis.pct_prime_fixe,
                      color: '#3b82f6',
                      fcfa: kpis.montant_pf_calc,
                      estimated: kpis.pf_reconstructed,
                    },
                    {
                      name: 'Dépassement PS (PDP)',
                      value: kpis.pct_pdp,
                      color: '#ef4444',
                      fcfa: kpis.montant_pdp_fcfa,
                    },
                    {
                      name: 'Pénalité cosφ',
                      value: kpis.pct_cosphi,
                      color: '#f97316',
                      fcfa: invoiceData?.montant_cosphi,
                    },
                    {
                      name: 'Redevance (compteur)',
                      value: kpis.pct_redevance,
                      color: '#94a3b8',
                      fcfa: kpis.montant_redevance_fcfa,
                    },
                    {
                      name: 'TVA + TCO',
                      value: kpis.pct_taxes,
                      color: '#475569',
                      fcfa: kpis.montant_taxes_fcfa,
                    },
                    {
                      name: 'Non identifié (OCR)',
                      value: kpis.pct_residuel,
                      color: '#334155',
                      fcfa: kpis.montant_residuel_fcfa,
                      residual: true,
                      estimated: true,
                    },
                  ] satisfies PieSegment[]}
                />
              </div>

              {/* Bloc 5 — Potentiel d'optimisation (toujours visible) */}
              {(() => {
                const ps = parseFloat(form.puissance_souscrite_kw) || null
                const pmax = invoiceData?.puissance_max_kw ?? null
                const cosphiMes = invoiceData?.cosphi_mesure ?? null
                const k2kwh = invoiceData?.conso_k2_kwh ?? 0
                const totalKwh = invoiceData?.conso_kwh_total ?? 0
                const k2Pct = totalKwh > 0 && k2kwh > 0 ? (k2kwh / totalKwh) * 100 : null
                const isMT = ['TCU', 'TG', 'TLU'].includes(form.categorie_tarifaire)

                const hasPsReduction = kpis.economie_ps_fcfa > 0
                const hasPdp = kpis.montant_pdp_fcfa > 0
                const hasCosphiPenalty = kpis.economie_cosphi_fcfa > 0
                const hasCosphiRisk = cosphiMes !== null && cosphiMes < form.cosphi_seuil && !hasCosphiPenalty
                const hasK2High = k2Pct !== null && k2Pct > form.k2_seuil_pct
                const hasTarifChange = isMT && kpis.choix_tarif_optimal !== null && kpis.choix_tarif_optimal !== form.categorie_tarifaire

                const hasQuantifiedSavings = hasPsReduction || hasCosphiPenalty
                const hasAny = hasQuantifiedSavings || hasPdp || hasCosphiRisk || hasK2High || hasTarifChange

                const borderColor = hasQuantifiedSavings
                  ? 'border-emerald-500/20'
                  : hasAny ? 'border-amber-500/15' : 'border-white/[0.07]'
                const iconColor = hasQuantifiedSavings
                  ? 'text-emerald-400'
                  : hasAny ? 'text-amber-400' : 'text-slate-500'
                const titleColor = hasQuantifiedSavings
                  ? 'text-emerald-300'
                  : hasAny ? 'text-amber-300' : 'text-slate-500'

                return (
                  <div className={cn('rounded-xl border bg-[#0d1018] p-4', borderColor)}>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown className={cn('w-3.5 h-3.5', iconColor)} />
                      <h4 className={cn('text-xs font-semibold uppercase tracking-wider', titleColor)}>
                        Potentiel d'optimisation
                      </h4>
                    </div>

                    {!hasAny ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-600 leading-relaxed">Aucune optimisation identifiée sur cette facture.</p>
                        {!pmax && (
                          <p className="text-[11px] text-slate-600 leading-relaxed">Pmax absente — optimisation PS non calculable (catégories PP/MP).</p>
                        )}
                        {k2Pct === null && (
                          <p className="text-[11px] text-slate-600 leading-relaxed">K1/K2 absents — analyse pointe non disponible (catégories BT PP).</p>
                        )}
                        {cosphiMes === null && (
                          <p className="text-[11px] text-slate-600 leading-relaxed">cosφ absent dans l'OCR — pénalité facteur de puissance non détectée.</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* K2 élevé */}
                        {hasK2High && k2Pct !== null && (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
                            <Zap className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 mb-0.5">K2 — Heures de Pointe élevées</p>
                              <p className="text-[11px] text-amber-300/70 leading-relaxed">
                                {k2Pct.toFixed(1)}% de la conso en pointe (19h-23h) — seuil {form.k2_seuil_pct}% · Envisager décalage de charge ou stockage batterie
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Option tarifaire non optimale */}
                        {hasTarifChange && kpis.choix_tarif_optimal && (
                          <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-2">
                            <Activity className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80 mb-0.5">Option Tarifaire non optimale</p>
                              <p className="text-[11px] text-blue-300/70 leading-relaxed">
                                Actuel : <strong className="text-blue-200">{form.categorie_tarifaire}</strong> · Recommandé : <strong className="text-blue-200">{kpis.choix_tarif_optimal}</strong> ({formatNumber(kpis.nb_heures_utilisation, 0)} h/an)
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Dépassement PS — PDP */}
                        {hasPdp && (
                          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2">
                            <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80 mb-0.5">Dépassement PS — Pénalité PDP</p>
                              <p className="text-[11px] text-red-300/70 leading-relaxed">
                                PDP : {formatNumber(kpis.montant_pdp_fcfa, 0)} FCFA
                                {pmax && ps ? ` · Pmax (${pmax} kW) > PS (${ps} kW) — revoir contrat ou réduire la pointe` : ''}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Réduction PS */}
                        {hasPsReduction && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 px-1">Réduction puissance souscrite (PS)</p>
                            <OptimBadge label="Scénario strict (PS = Pmax)" value={`${formatNumber(kpis.economie_ps_fcfa, 0)} FCFA/mois`} positive />
                            {kpis.economie_ps_prudent_fcfa > 0 && (
                              <OptimBadge label="Scénario prudent (PS = Pmax × 1,1)" value={`${formatNumber(kpis.economie_ps_prudent_fcfa, 0)} FCFA/mois`} positive />
                            )}
                          </div>
                        )}

                        {/* cosφ pénalisé (OCR) */}
                        {hasCosphiPenalty && (
                          <OptimBadge label="Correction cosφ (condensateurs)" value={`${formatNumber(kpis.economie_cosphi_fcfa, 0)} FCFA/mois`} positive />
                        )}

                        {/* cosφ bas mesuré mais pas encore pénalisé */}
                        {hasCosphiRisk && cosphiMes !== null && (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
                            <Activity className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 mb-0.5">cosφ — Risque pénalité</p>
                              <p className="text-[11px] text-amber-300/70 leading-relaxed">
                                cosφ mesuré {cosphiMes.toFixed(3)} {'<'} seuil {form.cosphi_seuil} · Installer des batteries de condensateurs
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Totaux si économies FCFA quantifiées */}
                        {hasQuantifiedSavings && (
                          <>
                            <Separator className="bg-emerald-500/10 my-1" />
                            <OptimBadge label="Économie mensuelle totale" value={`${formatNumber(kpis.economie_totale_fcfa, 0)} FCFA/mois`} positive />
                            <OptimBadge label="Économie annuelle estimée" value={`${formatNumber(kpis.economie_annuelle_fcfa, 0)} FCFA/an`} positive />
                            <Separator className="bg-emerald-500/10 my-1" />
                            <OptimBadge label="Nouveau MTTC estimé" value={`${formatNumber(kpis.nouveau_mttc_fcfa, 0)} FCFA`} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Bloc 6 — 4 Piliers SENELEC ── */}
              <FourPillarsSection
                kpis={kpis}
                invoiceData={invoiceData}
                form={form}
                setForm={setForm}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 4 Piliers SENELEC ────────────────────────────────────────────────────────

function ThresholdInput({ value, onChange, step = 1, min, max, suffix }: {
  value: number; onChange: (v: number) => void
  step?: number; min?: number; max?: number; suffix?: string
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        className="w-16 h-5 text-right text-[10px] bg-slate-800/60 border border-slate-700/50 text-slate-300 rounded px-1 outline-none focus:border-amber-500/50"
      />
      {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
    </div>
  )
}

function ProgressBar({ value, seuil, max = 100, colorOk = 'bg-emerald-500', colorWarn = 'bg-amber-500', colorError = 'bg-red-500' }: {
  value: number; seuil: number; max?: number
  colorOk?: string; colorWarn?: string; colorError?: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  const seuilPct = Math.min((seuil / max) * 100, 100)
  const color = value > seuil * 1.6 ? colorError : value > seuil ? colorWarn : colorOk
  return (
    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      {/* Seuil marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-white/30"
        style={{ left: `${seuilPct}%` }}
      />
    </div>
  )
}

function FourPillarsSection({
  kpis, invoiceData, form, setForm,
}: {
  kpis: NonNullable<ReturnType<typeof import('@/lib/billing-calculator').calculateBillingKPIs>>
  invoiceData: Partial<import('@/types/billing').InvoiceData> | null
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
}) {
  const set = (k: keyof FormState, v: FormState[keyof FormState]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  // ── Pilier 1 : K2 ──
  const k2 = invoiceData?.conso_k2_kwh ?? 0
  const k1 = invoiceData?.conso_k1_kwh ?? 0
  const total = (invoiceData?.conso_kwh_total ?? 0) || (k1 + k2)
  const k2Pct = total > 0 && k2 > 0 ? (k2 / total) * 100 : null

  // ── Pilier 2 : PS ──
  const ps = parseFloat(form.puissance_souscrite_kw) || null
  const pmax = invoiceData?.puissance_max_kw ?? null
  const psEcartPct = ps && pmax ? ((ps - pmax) / ps) * 100 : null

  // ── Pilier 3 : cosφ ──
  const cosphi = invoiceData?.cosphi_mesure ?? null

  // ── Pilier 4 : Option tarifaire ──
  const nbHeures = kpis.nb_heures_utilisation
  const tarif = kpis.choix_tarif_optimal
  const isMT = ['TCU', 'TG', 'TLU'].includes(form.categorie_tarifaire)

  return (
    <div className="rounded-xl border border-blue-500/15 bg-[#0d1018] p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-3.5 h-3.5 text-blue-400" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-300">4 Piliers d'Analyse</h4>
      </div>

      {/* ── Pilier 1 — K2 ── */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 1 — Heures de Pointe (K2)</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Seuil :</span>
            <ThresholdInput value={form.k2_seuil_pct} onChange={v => set('k2_seuil_pct', v)} step={1} min={1} max={50} suffix="%" />
          </div>
        </div>
        {k2Pct !== null ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">K2 (pointe 19h-23h)</span>
              <span className={cn('font-semibold tabular-nums', k2Pct > form.k2_seuil_pct ? 'text-red-400' : 'text-emerald-400')}>
                {k2Pct.toFixed(1)}%
              </span>
            </div>
            <ProgressBar value={k2Pct} seuil={form.k2_seuil_pct} max={50} />
            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
              <span>K1 : {formatNumber(k1, 0)} kWh</span>
              <span>K2 : {formatNumber(k2, 0)} kWh</span>
            </div>
            {k2Pct > form.k2_seuil_pct && (
              <p className="text-[11px] text-amber-400/80 bg-amber-500/8 border border-amber-500/15 rounded-lg px-2 py-1.5 leading-relaxed">
                Conso en pointe élevée — envisager décalage de charge ou batteries de stockage
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-slate-600">K1/K2 non disponibles (catégories BT Petite Puissance n'ont pas de séparation pointe)</p>
        )}
      </div>

      {/* ── Pilier 2 — PS ── */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 2 — Puissance Souscrite (PS)</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Seuil écart :</span>
            <ThresholdInput value={form.ps_seuil_pct} onChange={v => set('ps_seuil_pct', v)} step={1} min={1} max={50} suffix="%" />
          </div>
        </div>
        {ps && pmax ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500">PS contractuelle</p>
                <p className="text-sm font-bold text-slate-100 tabular-nums">{ps} <span className="text-xs text-slate-500">kW</span></p>
              </div>
              <div className={cn(
                'rounded-lg border px-3 py-2 text-center',
                psEcartPct !== null && psEcartPct < -form.ps_seuil_pct ? 'border-red-500/25 bg-red-500/8'
                  : psEcartPct !== null && psEcartPct > form.ps_seuil_pct ? 'border-amber-500/25 bg-amber-500/8'
                  : 'border-emerald-500/20 bg-emerald-500/5',
              )}>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">Pmax relevée</p>
                <p className={cn(
                  'text-sm font-bold tabular-nums',
                  psEcartPct !== null && psEcartPct < -form.ps_seuil_pct ? 'text-red-400'
                    : psEcartPct !== null && psEcartPct > form.ps_seuil_pct ? 'text-amber-400'
                    : 'text-emerald-400',
                )}>{pmax} <span className="text-xs text-slate-500">kW</span></p>
              </div>
            </div>
            {/* Écart dans la tolérance → OK */}
            {psEcartPct !== null && Math.abs(psEcartPct) <= form.ps_seuil_pct && (
              <p className="text-[11px] text-emerald-400/80 bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-2 py-1.5">
                PS calibrée — écart {formatNumber(Math.abs(psEcartPct), 1)}% dans la tolérance ±{form.ps_seuil_pct}%
              </p>
            )}
            {/* Sous-utilisation : PS >> Pmax → PS surdimensionnée, prime fixe payée en excès */}
            {psEcartPct !== null && psEcartPct > form.ps_seuil_pct && (
              <p className="text-[11px] text-amber-400/80 bg-amber-500/8 border border-amber-500/15 rounded-lg px-2 py-1.5">
                PS surdimensionnée (+{formatNumber(psEcartPct, 1)}%) — prime fixe payée en excès · Réduction possible : {formatNumber(kpis.economie_ps_fcfa, 0)} FCFA/mois (strict), {formatNumber(kpis.economie_ps_prudent_fcfa, 0)} FCFA/mois (prudent)
              </p>
            )}
            {/* Dépassement : Pmax > PS de plus de seuil% → pénalité PDP */}
            {psEcartPct !== null && psEcartPct < -form.ps_seuil_pct && (
              <p className="text-[11px] text-red-400/80 bg-red-500/8 border border-red-500/15 rounded-lg px-2 py-1.5">
                Dépassement PS de {formatNumber(Math.abs(psEcartPct), 1)}% — pénalité PDP probable sur cette facture
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-slate-600">Pmax non disponible dans l'OCR (catégories PP/MP) ou PS non renseignée</p>
        )}
      </div>

      {/* ── Pilier 3 — cosφ ── */}
      <div className="space-y-1.5 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 3 — Facteur de Puissance (cosφ)</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Seuil min :</span>
            <ThresholdInput value={form.cosphi_seuil} onChange={v => set('cosphi_seuil', v)} step={0.01} min={0.5} max={1} suffix="" />
          </div>
        </div>
        {cosphi ? (
          <>
            {/* Arc gauge simplifié */}
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex items-center justify-center w-14 h-14 rounded-full border-4 text-sm font-bold tabular-nums',
                cosphi >= 0.92 ? 'border-emerald-500 text-emerald-400' :
                cosphi >= form.cosphi_seuil ? 'border-amber-500 text-amber-400' :
                'border-red-500 text-red-400',
              )}>
                {cosphi.toFixed(2)}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>0.70</span><span className="text-red-400/60">seuil {form.cosphi_seuil}</span><span>0.92</span><span>1.00</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', cosphi >= 0.92 ? 'bg-emerald-500' : cosphi >= form.cosphi_seuil ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${Math.max(0, Math.min(100, ((cosphi - 0.7) / 0.3) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
            {cosphi < form.cosphi_seuil && (
              <p className="text-[11px] text-red-400/80 bg-red-500/8 border border-red-500/15 rounded-lg px-2 py-1.5">
                Pénalité cosφ active — installer des batteries de condensateurs
                {kpis.economie_cosphi_fcfa > 0 && ` (économie : ${formatNumber(kpis.economie_cosphi_fcfa, 0)} FCFA/mois)`}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-slate-600">cosφ non disponible dans l'OCR de cette facture</p>
        )}
      </div>

      {/* ── Pilier 4 — Option Tarifaire ── */}
      {isMT && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 4 — Option Tarifaire MT</p>
          <div className="space-y-1">
            {/* Axe gradué TCU / TG / TLU */}
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
              {/* Curseur position */}
              {nbHeures > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-[#0d1018] shadow"
                  style={{ left: `${Math.min(98, (nbHeures / 6000) * 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                />
              )}
            </div>
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>0</span><span>1 000h</span><span>4 000h</span><span>6 000h+</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-slate-400">{formatNumber(nbHeures, 0)} h/an</span>
              {tarif && (
                <span className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-md',
                  tarif === form.categorie_tarifaire ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
                )}>
                  {tarif === form.categorie_tarifaire ? 'Tarif optimal' : `Recommandé : ${tarif}`}
                </span>
              )}
            </div>
            {k1 > 0 && k2 > 0 && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                <span>Ratio K1/K2 : {(k1 / k2).toFixed(1)}</span>
                <span>K1 = {formatNumber(k1, 0)} kWh · K2 = {formatNumber(k2, 0)} kWh</span>
              </div>
            )}
          </div>
        </div>
      )}
      {!isMT && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pilier 4 — Option Tarifaire</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Le choix TCU / TG / TLU s'applique uniquement aux clients Moyenne Tension.
            Votre catégorie actuelle ({form.categorie_tarifaire}) est en Basse Tension.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── KPI prerequisites checklist ─────────────────────────────────────────────

function KPIChecklist({
  ps, nj, invoiceSelected, invoiceHasConso, invoiceHasMontant, invoicesAvailable,
}: {
  ps: number; nj: number;
  invoiceSelected: boolean; invoiceHasConso: boolean; invoiceHasMontant: boolean;
  invoicesAvailable: number;
}) {
  const checks: { label: string; ok: boolean; detail?: string }[] = [
    {
      label: 'Puissance souscrite (PS)',
      ok: !!ps && !isNaN(ps),
      detail: ps && !isNaN(ps) ? `${ps} kW` : 'Renseigner le champ PS',
    },
    {
      label: 'Durée de la période',
      ok: !!nj && !isNaN(nj),
      detail: nj && !isNaN(nj) ? `${nj} jours` : 'Renseigner la durée (ex: 30)',
    },
    {
      label: 'Facture de référence sélectionnée',
      ok: invoiceSelected,
      detail: !invoiceSelected
        ? invoicesAvailable === 0
          ? 'Aucune facture vérifiée — importez et vérifiez une facture d\'abord'
          : 'Sélectionner une facture dans le champ "Facture de référence"'
        : undefined,
    },
    {
      label: 'Consommation kWh dans l\'OCR',
      ok: invoiceHasConso,
      detail: invoiceSelected && !invoiceHasConso
        ? 'Champ CONSOMMATION absent — vérifier le résultat OCR de cette facture'
        : undefined,
    },
    {
      label: 'Montant TTC dans l\'OCR',
      ok: invoiceHasMontant,
      detail: invoiceSelected && !invoiceHasMontant
        ? invoiceHasConso
          ? 'Montant TTC absent — facture prépayée (Woyofal) ? Format incompatible avec les calculs standard.'
          : 'Champ MONTANT TOTAL TTC absent — vérifier le résultat OCR de cette facture'
        : undefined,
    },
  ]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d1018] p-5 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Conditions requises pour les 17 KPIs
      </p>
      {checks.map((c, i) => (
        <div key={i} className="flex items-start gap-2.5">
          {c.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            : <XCircle className="w-3.5 h-3.5 text-red-400/60 shrink-0 mt-0.5" />
          }
          <div className="min-w-0">
            <p className={cn('text-xs', c.ok ? 'text-slate-400' : 'text-slate-300 font-medium')}>
              {c.label}
              {c.ok && c.detail && (
                <span className="ml-1.5 text-[10px] text-emerald-500 font-mono">{c.detail}</span>
              )}
            </p>
            {!c.ok && c.detail && (
              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{c.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
