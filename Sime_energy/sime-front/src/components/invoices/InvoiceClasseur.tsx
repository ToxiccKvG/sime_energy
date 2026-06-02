import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MapPin, Building2, Layers, ChevronRight, ChevronDown,
  X, FolderOpen, BarChart3, AlertCircle, CheckCircle2,
  FileText, FileSpreadsheet, Zap, Banknote, Inbox, Search, TriangleAlert,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer, Cell } from 'recharts'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getAuditSpatialHierarchy,
  getClasseurInvoices,
  classifyInvoice,
  unclassifyInvoice,
  computeNodeMetrics,
  computeSiteMetricsDeep,
  type ClasseurInvoice,
  type ClasseurSite,
  type NodeType,
  type SpatialHierarchy,
} from '@/lib/classeur-service'

const MIGRATION_SQL = `ALTER TABLE audit_invoices
  ADD COLUMN IF NOT EXISTS classeur_site_id     UUID REFERENCES audit_sites(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classeur_zone_id     UUID REFERENCES audit_zones(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classeur_building_id UUID REFERENCES audit_buildings(id) ON DELETE SET NULL;`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFcfa(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M FCFA`
  if (n >= 1_000)     return `${Math.round(n / 1_000)} k FCFA`
  return `${Math.round(n)} FCFA`
}

function fmtKwh(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} MWh`
  return `${Math.round(n)} kWh`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

function invoiceLabel(inv: ClasseurInvoice, hierarchy: SpatialHierarchy): string | null {
  if (!inv.classeur_site_id) return null
  const site = hierarchy.sites.find(s => s.id === inv.classeur_site_id)
  if (!site) return null

  if (inv.classeur_building_id) {
    for (const zone of site.zones) {
      const b = zone.buildings.find(b => b.id === inv.classeur_building_id)
      if (b) return `${zone.name} › ${b.name}`
    }
    const b = site.buildings.find(b => b.id === inv.classeur_building_id)
    if (b) return `${site.name} › ${b.name}`
  }
  if (inv.classeur_zone_id) {
    const zone = site.zones.find(z => z.id === inv.classeur_zone_id)
    if (zone) return `${site.name} › ${zone.name}`
  }
  return site.name
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-[#12141e] border border-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-100 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tree node types ───────────────────────────────────────────────────────────

interface SelectedNode {
  type: NodeType
  id: string
  label: string
  siteId: string
  zoneId: string | null
  buildingId: string | null
}

// ─── Node row in tree ─────────────────────────────────────────────────────────

function NodeRow({
  icon: Icon, label, count, kwh, selected, onClick, depth, expandable, expanded, onToggle,
}: {
  icon: React.ElementType; label: string; count: number; kwh: number
  selected: boolean; onClick: () => void; depth: number
  expandable?: boolean; expanded?: boolean; onToggle?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150 group',
        selected
          ? 'bg-blue-500/15 border border-blue-500/30 text-slate-100'
          : 'hover:bg-white/[0.04] border border-transparent text-slate-400',
        depth === 0 && 'font-medium',
      )}
      style={{ paddingLeft: `${depth * 16 + 10}px` }}
    >
      {expandable && (
        <span
          onClick={e => { e.stopPropagation(); onToggle?.() }}
          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />}
        </span>
      )}
      {!expandable && <span className="w-3 h-3 shrink-0" />}

      <Icon className={cn('w-3.5 h-3.5 shrink-0', selected ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400')} />

      <span className="flex-1 text-xs truncate">{label}</span>

      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        {count > 0 && (
          <span className={cn(
            'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full',
            selected ? 'bg-blue-500/30 text-blue-200' : 'bg-white/[0.06] text-slate-400'
          )}>
            {count}
          </span>
        )}
        {kwh > 0 && (
          <span className="text-[9px] text-slate-600 font-mono hidden group-hover:block">
            {fmtKwh(kwh)}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Tooltip recharts ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d0f1a] border border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 font-medium mb-1.5 truncate max-w-[160px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-200">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-mono">{p.name === 'kWh' ? fmtKwh(p.value) : fmtFcfa(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, sub }: {
  icon: React.ElementType; title: string; sub: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p className="text-xs text-slate-600 mt-1 max-w-52 leading-relaxed">{sub}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InvoiceClasseur({ auditId }: { auditId: string }) {
  const [hierarchy, setHierarchy] = useState<SpatialHierarchy | null>(null)
  const [invoices,  setInvoices]  = useState<ClasseurInvoice[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState<'all' | 'classified' | 'unclassified'>('all')
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({})
  const [assigning,       setAssigning]       = useState<string | null>(null)
  const [assignError,     setAssignError]     = useState<string | null>(null)
  const [loadError,       setLoadError]       = useState<string | null>(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  // ── Load data ──
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setAssignError(null)

    Promise.all([
      getAuditSpatialHierarchy(auditId),
      getClasseurInvoices(auditId),
    ])
      .then(([h, result]) => {
        if (cancelled) return
        setHierarchy(h)
        setInvoices(result.invoices)
        setMigrationNeeded(result.migrationNeeded)
        const init: Record<string, boolean> = {}
        h.sites.forEach(s => { init[s.id] = true })
        setExpanded(init)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? 'Erreur inconnue')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [auditId])

  // ── Metrics ──
  const metrics = useMemo(() => {
    const total       = invoices.length
    const classified  = invoices.filter(i => i.classeur_site_id).length
    const kwh         = invoices.reduce((s, i) => s + i.kwh, 0)
    const fcfa        = invoices.reduce((s, i) => s + (i.amount ?? 0), 0)
    return { total, classified, unclassified: total - classified, kwh, fcfa }
  }, [invoices])

  // ── Filtered invoice list ──
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(i => {
        if (filter === 'classified')   return !!i.classeur_site_id
        if (filter === 'unclassified') return !i.classeur_site_id
        return true
      })
      .filter(i => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          i.file_name.toLowerCase().includes(q) ||
          (i.partenaire?.toLowerCase().includes(q) ?? false) ||
          (i.appartenance?.toLowerCase().includes(q) ?? false) ||
          (i.numero_compte_contrat?.toLowerCase().includes(q) ?? false)
        )
      })
  }, [invoices, filter, search])

  // ── Chart data (per site, aggregated) ──
  const chartData = useMemo(() => {
    if (!hierarchy) return []
    return hierarchy.sites.map(site => {
      const m = computeSiteMetricsDeep(invoices, site.id)
      return {
        name:  site.name.length > 14 ? site.name.slice(0, 14) + '…' : site.name,
        kWh:   Math.round(m.kwh),
        FCFA:  Math.round(m.fcfa / 1000), // in k
        count: m.invoiceCount,
      }
    }).filter(d => d.kWh > 0 || d.FCFA > 0)
  }, [hierarchy, invoices])

  // ── Assign invoice to selected node ──
  const assign = useCallback(async (invoiceId: string) => {
    if (!selectedNode) return
    setAssigning(invoiceId)
    setAssignError(null)
    const inv = invoices.find(i => i.id === invoiceId)
    try {
      await classifyInvoice(invoiceId, {
        site_id:     selectedNode.siteId === '__no_site__' ? null : selectedNode.siteId,
        zone_id:     selectedNode.zoneId,
        building_id: selectedNode.buildingId,
      }, inv?.source ?? 'ocr')
      setInvoices(prev => prev.map(i =>
        i.id === invoiceId
          ? { ...i,
              classeur_site_id:     selectedNode.siteId === '__no_site__' ? null : selectedNode.siteId,
              classeur_zone_id:     selectedNode.zoneId,
              classeur_building_id: selectedNode.buildingId,
            }
          : i
      ))
    } catch (err: any) {
      const msg: string = err?.message ?? ''
      if (msg.includes('column') || msg.includes('does not exist') || msg.includes('42703')) {
        setMigrationNeeded(true)
        setAssignError('migration')
      } else {
        setAssignError(msg || 'Erreur lors de la sauvegarde')
      }
    } finally {
      setAssigning(null)
    }
  }, [selectedNode, invoices])

  // ── Unassign ──
  const unassign = useCallback(async (invoiceId: string) => {
    setAssigning(invoiceId)
    const inv = invoices.find(i => i.id === invoiceId)
    try {
      await unclassifyInvoice(invoiceId, inv?.source ?? 'ocr')
      setInvoices(prev => prev.map(i =>
        i.id === invoiceId
          ? { ...i, classeur_site_id: null, classeur_zone_id: null, classeur_building_id: null }
          : i
      ))
    } catch {
      toast.error('Erreur lors du retrait')
    } finally {
      setAssigning(null)
    }
  }, [invoices])

  const toggleExpand = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  // ── Node selection helpers ──
  function selectSite(site: ClasseurSite) {
    setSelectedNode({ type: 'site', id: site.id, label: site.name, siteId: site.id, zoneId: null, buildingId: null })
  }
  function selectZone(site: ClasseurSite, zoneId: string, zoneName: string) {
    setSelectedNode({ type: 'zone', id: zoneId, label: zoneName, siteId: site.id, zoneId, buildingId: null })
  }
  function selectBuilding(site: ClasseurSite, zoneId: string | null, bId: string, bName: string) {
    setSelectedNode({ type: 'building', id: bId, label: bName, siteId: site.id, zoneId, buildingId: bId })
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    )
  }

  const anyError = loadError ?? hierarchy?.loadError ?? null

  if (anyError) {
    return (
      <div className="rounded-2xl bg-[#12141e] border border-red-500/20 p-10 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-2">Erreur de chargement</h3>
        <p className="text-xs text-slate-500 font-mono mt-1 max-w-sm break-all">{anyError}</p>
      </div>
    )
  }

  if (!hierarchy || hierarchy.isEmpty) {
    return (
      <div className="rounded-2xl bg-[#12141e] border border-white/[0.06] p-10 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
          <MapPin className="w-7 h-7 text-amber-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-2">Aucun site configuré</h3>
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
          Le classeur spatial nécessite que des sites soient définis pour ce projet.
          Rendez-vous dans le module <span className="text-blue-400">Inventaire</span> pour créer vos sites et bâtiments.
        </p>
      </div>
    )
  }

  const hasChart = chartData.length > 0

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI strip ── */}
      <div className="flex gap-3">
        <KpiCard icon={FileText}     label="Total factures"   value={String(metrics.total)}        color="bg-slate-600/60" />
        <KpiCard icon={CheckCircle2} label="Classées"         value={String(metrics.classified)}   sub={metrics.total ? `${Math.round(metrics.classified / metrics.total * 100)}%` : '—'} color="bg-emerald-600/50" />
        <KpiCard icon={Inbox}        label="Non classées"     value={String(metrics.unclassified)} color="bg-amber-600/40" />
        <KpiCard icon={Zap}          label="kWh total"        value={fmtKwh(metrics.kwh)}          color="bg-blue-600/40" />
        <KpiCard icon={Banknote}     label="FCFA total"       value={fmtFcfa(metrics.fcfa)}        color="bg-violet-600/40" />
      </div>

      {/* ── Migration warning ── */}
      {migrationNeeded && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
          <div className="flex items-start gap-3">
            <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-300">Migration SQL requise</p>
              <p className="text-[10px] text-amber-500/80 mt-0.5 mb-2">
                Les colonnes de classement n'existent pas encore. Exécutez ce SQL dans Supabase → SQL Editor :
              </p>
              <pre className="text-[9px] font-mono bg-black/40 text-amber-200/70 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                {MIGRATION_SQL}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign error ── */}
      {assignError && assignError !== 'migration' && (
        <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300 flex-1">{assignError}</p>
          <button onClick={() => setAssignError(null)} className="text-red-500 hover:text-red-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Hint banner when node selected ── */}
      {selectedNode && !migrationNeeded && (
        <div className="flex items-center gap-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <p className="text-xs text-blue-300">
            Cible : <span className="font-semibold text-blue-200">{selectedNode.label}</span> — cliquez <strong>Affecter</strong> sur une facture
          </p>
          <button onClick={() => setSelectedNode(null)} className="ml-auto text-blue-500 hover:text-blue-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Main 2-col layout ── */}
      <div className="grid grid-cols-[320px_1fr] gap-4 min-h-[480px]">

        {/* ── Left: Spatial tree ── */}
        <div className="rounded-2xl bg-[#0a0c14] border border-white/[0.06] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Arborescence</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Sélectionnez un nœud cible</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">

              {/* Unclassified bucket */}
              <button
                onClick={() => setSelectedNode(null)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150',
                  !selectedNode
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                    : 'hover:bg-white/[0.04] border border-transparent text-slate-400'
                )}
              >
                <Inbox className={cn('w-3.5 h-3.5 shrink-0', !selectedNode ? 'text-amber-400' : 'text-slate-500')} />
                <span className="flex-1 text-xs font-medium">Non classées</span>
                {metrics.unclassified > 0 && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    {metrics.unclassified}
                  </span>
                )}
              </button>

              <div className="h-px bg-white/[0.04] my-1.5" />

              {/* Sites */}
              {hierarchy.sites.map(site => {
                const siteMetrics = computeSiteMetricsDeep(invoices, site.id)
                const isOpen      = expanded[site.id]
                const isSelected  = selectedNode?.type === 'site' && selectedNode.id === site.id
                const hasChildren = site.zones.length > 0 || site.buildings.length > 0

                return (
                  <div key={site.id}>
                    <NodeRow
                      icon={MapPin}
                      label={site.name}
                      count={siteMetrics.invoiceCount}
                      kwh={siteMetrics.kwh}
                      selected={isSelected}
                      onClick={() => selectSite(site)}
                      depth={0}
                      expandable={hasChildren}
                      expanded={isOpen}
                      onToggle={() => toggleExpand(site.id)}
                    />

                    {isOpen && (
                      <div className="mt-0.5 space-y-0.5">
                        {/* Zones */}
                        {site.zones.map(zone => {
                          const zm       = computeNodeMetrics(invoices, 'zone', zone.id)
                          const zOpen    = expanded[zone.id]
                          const zSel     = selectedNode?.type === 'zone' && selectedNode.id === zone.id
                          const hasBldgs = zone.buildings.length > 0

                          return (
                            <div key={zone.id}>
                              <NodeRow
                                icon={Layers}
                                label={zone.name}
                                count={zm.invoiceCount}
                                kwh={zm.kwh}
                                selected={zSel}
                                onClick={() => selectZone(site, zone.id, zone.name)}
                                depth={1}
                                expandable={hasBldgs}
                                expanded={zOpen}
                                onToggle={() => toggleExpand(zone.id)}
                              />
                              {zOpen && zone.buildings.map(b => {
                                const bm   = computeNodeMetrics(invoices, 'building', b.id)
                                const bSel = selectedNode?.type === 'building' && selectedNode.id === b.id
                                return (
                                  <NodeRow
                                    key={b.id}
                                    icon={Building2}
                                    label={b.name}
                                    count={bm.invoiceCount}
                                    kwh={bm.kwh}
                                    selected={bSel}
                                    onClick={() => selectBuilding(site, zone.id, b.id, b.name)}
                                    depth={2}
                                  />
                                )
                              })}
                            </div>
                          )
                        })}

                        {/* Buildings without zone */}
                        {site.buildings.map(b => {
                          const bm   = computeNodeMetrics(invoices, 'building', b.id)
                          const bSel = selectedNode?.type === 'building' && selectedNode.id === b.id
                          return (
                            <NodeRow
                              key={b.id}
                              icon={Building2}
                              label={b.name}
                              count={bm.invoiceCount}
                              kwh={bm.kwh}
                              selected={bSel}
                              onClick={() => selectBuilding(site, null, b.id, b.name)}
                              depth={1}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right: Invoice list ── */}
        <div className="rounded-2xl bg-[#0a0c14] border border-white/[0.06] flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une facture…"
                className="pl-8 h-8 text-xs bg-white/[0.04] border-white/[0.08] text-slate-300 placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-blue-500/50"
              />
            </div>
            <div className="flex items-center gap-1 p-0.5 bg-[#12141e] rounded-lg border border-white/[0.05]">
              {(['all', 'unclassified', 'classified'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150',
                    filter === f
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  {{ all: 'Toutes', unclassified: 'Non classées', classified: 'Classées' }[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Invoice rows */}
          <ScrollArea className="flex-1">
            {filteredInvoices.length === 0 ? (
              <EmptyState icon={FileText} title="Aucune facture" sub="Importez des factures depuis le module Facturation." />
            ) : (
              <div className="p-2 space-y-1">
                {filteredInvoices.map(inv => {
                  const isClassified = !!inv.classeur_site_id
                  const label        = hierarchy ? invoiceLabel(inv, hierarchy) : null
                  const isBusy       = assigning === inv.id

                  return (
                    <div
                      key={inv.id}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl border transition-all duration-150 overflow-hidden',
                        // When node selected + unclassified: clickable row
                        selectedNode && !isClassified && !isBusy
                          ? 'cursor-pointer bg-[#12141e] border-white/[0.06] hover:border-blue-500/40 hover:bg-blue-500/[0.06]'
                          : 'bg-[#12141e] border-white/[0.06]',
                        isBusy && 'opacity-60'
                      )}
                    >
                      {/* Blue left accent bar when node selected and unclassified */}
                      {selectedNode && !isClassified && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500/40 group-hover:bg-blue-400 transition-colors" />
                      )}

                      <div className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5">
                        {/* Source icon + status dot */}
                        <div className="flex items-center gap-1 shrink-0">
                          {inv.source === 'senelec'
                            ? <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" title="SENELEC Excel" />
                            : <FileText className="w-3.5 h-3.5 text-emerald-400" title="Facture OCR" />
                          }
                          <div className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            inv.status === 'verified'   ? 'bg-emerald-400' :
                            inv.status === 'processing' ? 'bg-amber-400 animate-pulse' :
                            inv.status === 'rejected'   ? 'bg-red-400' :
                            inv.status === 'senelec'    ? 'bg-blue-400' :
                                                          'bg-slate-600'
                          )} />
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{inv.file_name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-slate-500">{fmtDate(inv.invoice_date)}</span>
                            {inv.kwh > 0 && (
                              <span className="text-[10px] text-blue-400 font-mono">{fmtKwh(inv.kwh)}</span>
                            )}
                            {inv.amount != null && inv.amount > 0 && (
                              <span className="text-[10px] text-violet-400 font-mono">{fmtFcfa(inv.amount)}</span>
                            )}
                          </div>
                        </div>

                        {/* Classification badge */}
                        {isClassified && label && (
                          <span className="flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 max-w-[130px] shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{label}</span>
                          </span>
                        )}

                        {/* Unassign X */}
                        {isClassified && !isBusy && (
                          <button
                            onClick={e => { e.stopPropagation(); unassign(inv.id) }}
                            className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-red-500/20 hover:text-red-400 text-slate-500 transition-all duration-150 shrink-0"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {/* Spinner while saving */}
                        {isBusy && (
                          <div className="w-3.5 h-3.5 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin shrink-0" />
                        )}
                      </div>

                      {/* Assign button — explicit, shown when node is selected */}
                      {selectedNode && !isBusy && (
                        <button
                          onClick={() => { if (!migrationNeeded) assign(inv.id) }}
                          disabled={migrationNeeded}
                          title={migrationNeeded ? 'Migration SQL requise — voir bandeau ci-dessus' : undefined}
                          className={cn(
                            'shrink-0 flex items-center gap-1.5 mr-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-150',
                            migrationNeeded
                              ? 'bg-slate-800/60 text-slate-600 border border-slate-700/30 cursor-not-allowed'
                              : isClassified
                                ? 'bg-slate-700/40 hover:bg-blue-500/20 text-slate-500 hover:text-blue-300 border border-transparent hover:border-blue-500/20'
                                : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/20 hover:border-blue-400/40'
                          )}
                        >
                          {migrationNeeded ? 'SQL requis' : isClassified ? 'Déplacer' : 'Affecter'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Comparison chart ── */}
      {hasChart && (
        <div className="rounded-2xl bg-[#0a0c14] border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Comparaison par site</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barGap={4} barCategoryGap="32%">
              <CartesianGrid vertical={false} stroke="#ffffff08" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="kwh"
                orientation="left"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}M` : String(v)}
              />
              <YAxis
                yAxisId="fcfa"
                orientation="right"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}k`}
              />
              <RechartTooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff06' }} />
              <Bar yAxisId="kwh" dataKey="kWh" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${210 + i * 30}, 70%, 55%)`} />
                ))}
              </Bar>
              <Bar yAxisId="fcfa" dataKey="FCFA" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${270 + i * 25}, 55%, 55%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: 'hsl(210, 70%, 55%)' }} />
              <span className="text-[10px] text-slate-500">kWh (axe gauche)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: 'hsl(270, 55%, 55%)' }} />
              <span className="text-[10px] text-slate-500">FCFA en k (axe droit)</span>
            </div>
          </div>
        </div>
      )}

      {!hasChart && invoices.length > 0 && (
        <div className="rounded-2xl bg-[#0a0c14] border border-white/[0.06] p-8">
          <EmptyState
            icon={BarChart3}
            title="Aucune donnée à comparer"
            sub="La comparaison sera disponible une fois des factures affectées à vos sites."
          />
        </div>
      )}
    </div>
  )
}
