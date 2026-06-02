import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ShieldAlert, ShieldCheck, FileText, Database, Calculator,
  Trash2, CheckCircle2, RefreshCw, AlertTriangle, Filter, Eye,
  Zap, Hash, Receipt, MessageSquarePlus, ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  getAllQuarantineItems,
  unquarantineFactureSenelec,
  deleteManualQuarantine,
  resolveManualQuarantine,
  getFactureSenelecDetail,
  saveQuarantineComment,
  type QuarantineItem,
  type FactureSenelecDetail,
} from '@/lib/billing-quarantine-service'
import { unquarantineInvoice } from '@/lib/invoice-service'
import { useOrganization } from '@/context/OrganizationContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtXOF  = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtPct  = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)} %`
const fmtNum  = (n: number | null | undefined, unit = 'FCFA') =>
  n != null ? `${fmtXOF(n)} ${unit}` : '—'

const SOURCE_CONFIG = {
  ocr:     { label: 'OCR',     Icon: FileText,   color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25' },
  senelec: { label: 'SENELEC', Icon: Database,   color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25' },
  manual:  { label: 'Manuel',  Icon: Calculator, color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/25' },
} as const

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#12141e] p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: QuarantineItem['source'] }) {
  const cfg = SOURCE_CONFIG[source]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider
      px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <cfg.Icon className="w-2.5 h-2.5 shrink-0" />
      {cfg.label}
    </span>
  )
}

// ─── Detail dialog ─────────────────────────────────────────────────────────────

function DetailDialog({ item, onClose }: { item: QuarantineItem | null; onClose: () => void }) {
  const [detail, setDetail]   = useState<FactureSenelecDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!item || item.source !== 'senelec') { setDetail(null); return }
    setLoading(true)
    getFactureSenelecDetail(item.id).then(setDetail).finally(() => setLoading(false))
  }, [item])

  if (!item) return null

  const absDelta    = Math.abs(item.delta_pct ?? 0)
  const deltaColor  = absDelta >= 10 ? 'text-red-400' : absDelta >= 5 ? 'text-orange-400' : 'text-yellow-400'
  const deltaFcfa   = item.montant_calcule != null ? item.montant_calcule - item.montant_senelec : null
  const sim         = detail?.quarantine_sim_result ?? null
  const ourTTC      = sim?.montant_ttc_calcule ?? detail?.quarantine_ttc_calcule ?? 1
  const pct         = (v: number | null) =>
    v != null && ourTTC > 0 ? `${((v / ourTTC) * 100).toFixed(1)} %` : null
  const deltaOf     = (ours: number | null, declared: number | null): string | null => {
    if (ours == null || declared == null) return null
    const d = ours - declared
    return `Δ ${d >= 0 ? '+' : ''}${fmtXOF(d)}`
  }

  // ─── Row component ─────────────────────────────────────────────────────────
  const Row = ({
    label, sub, ours, senelec, isSub = false, isTotal = false,
  }: {
    label: string; sub?: string
    ours: number | null; senelec: number | null
    isSub?: boolean; isTotal?: boolean
  }) => {
    const d   = deltaOf(ours, senelec)
    const pctVal = pct(ours ?? senelec)
    return (
      <div className={`grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 items-start gap-x-2
        ${isTotal ? 'py-3 border-t-2 border-white/[0.10] bg-white/[0.03]'
                  : isSub ? 'py-1.5 bg-white/[0.01]'
                  : 'py-2.5 border-t border-white/[0.04]'}
        hover:bg-white/[0.025] transition-colors`}>
        {/* Poste */}
        <div className="min-w-0">
          <p className={`text-xs leading-snug ${isTotal ? 'font-bold text-slate-200' : isSub ? 'text-slate-600 pl-3 text-[10px]' : 'text-slate-400'}`}>
            {label}
          </p>
          {sub && <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">{sub}</p>}
        </div>
        {/* Recalculé */}
        <div className="text-right pt-0.5">
          <p className={`text-xs tabular-nums font-mono leading-snug
            ${isTotal ? 'text-sm font-bold text-violet-300'
                      : ours != null ? 'text-violet-300' : 'text-slate-700'}`}>
            {ours != null ? fmtXOF(ours) : '—'}
          </p>
        </div>
        {/* SENELEC */}
        <div className="text-right pt-0.5">
          <p className={`text-xs tabular-nums font-mono leading-snug
            ${isTotal ? 'text-sm font-bold text-amber-300'
                      : senelec != null ? 'text-amber-300/80' : 'text-slate-700'}`}>
            {senelec != null ? fmtXOF(senelec) : '—'}
          </p>
          {d && <p className={`text-[9px] font-mono mt-0.5 ${d.includes('+') ? 'text-emerald-500/70' : 'text-red-400/60'}`}>{d}</p>}
        </div>
        {/* % TTC */}
        <div className="text-right pt-0.5">
          <p className="text-[10px] tabular-nums text-slate-600">{pctVal ?? '—'}</p>
        </div>
      </div>
    )
  }

  const hasK1   = (detail?.cons_k1 ?? 0) > 0
  const hasK2   = (detail?.cons_k2 ?? 0) > 0
  const hasWr   = (detail?.cons_wr ?? 0) > 0
  const hasIdx  = hasK1 || hasK2 || hasWr
  const hasSim  = sim != null

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="bg-[#0b0d18] border-white/[0.08] text-white max-w-2xl p-0 gap-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/15 shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-slate-100 leading-tight">{item.label}</DialogTitle>
              <DialogDescription className="sr-only">Détail de l'anomalie en quarantaine</DialogDescription>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <SourceBadge source={item.source} />
                {detail?.numero_facture && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold
                    px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-400">
                    <Receipt className="w-2.5 h-2.5" />{detail.numero_facture}
                  </span>
                )}
                {detail?.numero_compte_contrat && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold
                    px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-400">
                    <Hash className="w-2.5 h-2.5" />{detail.numero_compte_contrat}
                  </span>
                )}
                {item.quarantined_at && (
                  <span className="text-[10px] text-slate-600">
                    {format(new Date(item.quarantined_at), 'dd MMM yyyy à HH:mm', { locale: fr })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* ── 3 KPI cards ── */}
          <div className="grid grid-cols-3 gap-3">
            {/* SENELEC déclaré */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 mb-2">SENELEC déclaré</p>
              <p className="text-xl font-bold tabular-nums font-mono text-amber-200 leading-none">
                {fmtXOF(item.montant_senelec)}
              </p>
              <p className="text-[10px] text-amber-400/50 mt-1">FCFA</p>
            </div>
            {/* TTC recalculé */}
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400/80 mb-2">TTC recalculé</p>
              {item.montant_calcule != null ? (
                <>
                  <p className="text-xl font-bold tabular-nums font-mono text-violet-200 leading-none">
                    {fmtXOF(item.montant_calcule)}
                  </p>
                  <p className="text-[10px] text-violet-400/50 mt-1">FCFA</p>
                </>
              ) : <p className="text-xl font-bold text-violet-400/30">—</p>}
            </div>
            {/* Delta */}
            <div className={`rounded-2xl border p-4 ${absDelta >= 10 ? 'border-red-500/20 bg-red-500/[0.07]' : 'border-orange-500/20 bg-orange-500/[0.07]'}`}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Delta (base)</p>
              {deltaFcfa != null && (
                <p className={`text-lg font-bold tabular-nums font-mono leading-none ${deltaColor}`}>
                  {deltaFcfa >= 0 ? '+' : ''}{fmtXOF(deltaFcfa)}
                </p>
              )}
              {item.delta_pct != null && (
                <p className={`text-sm font-bold tabular-nums font-mono mt-1 ${deltaColor}`}>
                  {fmtPct(item.delta_pct)}
                </p>
              )}
            </div>
          </div>

          {/* ── Loading / source body ── */}
          {item.source === 'senelec' && loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Chargement…</span>
            </div>
          )}

          {item.source === 'senelec' && !loading && detail && (
            <>
              {/* ── Index de comptage ── */}
              {hasIdx && (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0f111a] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Index de comptage</p>
                  </div>
                  <div className="grid grid-cols-[1fr_80px_80px_90px] px-4 py-2 border-b border-white/[0.04]">
                    <p className="text-[9px] text-slate-600 uppercase tracking-wider">Poste</p>
                    <p className="text-[9px] text-slate-600 uppercase tracking-wider text-right">Ancien</p>
                    <p className="text-[9px] text-slate-600 uppercase tracking-wider text-right">Nouvel</p>
                    <p className="text-[9px] text-slate-600 uppercase tracking-wider text-right">Consommation</p>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {hasK1 && (
                      <div className="grid grid-cols-[1fr_80px_80px_90px] px-4 py-2 items-center">
                        <p className="text-xs text-slate-400">K1 <span className="text-slate-600">(HC)</span></p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.ancien_index_k1 ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.nouvel_index_k1 ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-300 font-semibold">{fmtXOF(detail.cons_k1 ?? 0)} <span className="text-slate-600 font-normal">kWh</span></p>
                      </div>
                    )}
                    {hasK2 && (
                      <div className="grid grid-cols-[1fr_80px_80px_90px] px-4 py-2 items-center">
                        <p className="text-xs text-slate-400">K2 <span className="text-slate-600">(HP)</span></p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.ancien_index_k2 ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.nouvel_index_k2 ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-300 font-semibold">{fmtXOF(detail.cons_k2 ?? 0)} <span className="text-slate-600 font-normal">kWh</span></p>
                      </div>
                    )}
                    {hasWr && (
                      <div className="grid grid-cols-[1fr_80px_80px_90px] px-4 py-2 items-center">
                        <p className="text-xs text-slate-400">Réactif <span className="text-slate-600">(Wr)</span></p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.ancien_index_reactif ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-400">{fmtXOF(detail.nouvel_index_reactif ?? 0)}</p>
                        <p className="text-right text-xs tabular-nums font-mono text-slate-300 font-semibold">{fmtXOF(detail.cons_wr ?? 0)} <span className="text-slate-600 font-normal">kVARh</span></p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Décomposition ligne par ligne ── */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#0f111a] overflow-hidden">
                {/* Section label */}
                <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Décomposition ligne par ligne
                    {!hasSim && <span className="ml-2 normal-case font-normal text-slate-700">— données simulateur non disponibles</span>}
                  </p>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider">Poste</p>
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-violet-400">Recalculé</p>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400">SENELEC Excel</p>
                  </div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider text-right">% TTC</p>
                </div>

                {/* Energy rows */}
                {hasK1 && (
                  <Row
                    label="Énergie K1 (HC)"
                    sub={hasSim && detail.cons_k1 ? `${fmtXOF(detail.cons_k1)} kWh × ${sim!.prix_k1.toFixed(2)} F/kWh` : undefined}
                    ours={hasSim ? sim!.montant_k1 : null}
                    senelec={detail.montant_energie_k1}
                  />
                )}
                {hasK2 && (
                  <Row
                    label="Énergie K2 (HP)"
                    sub={hasSim && detail.cons_k2 ? `${fmtXOF(detail.cons_k2)} kWh × ${sim!.prix_k2.toFixed(2)} F/kWh` : undefined}
                    ours={hasSim ? sim!.montant_k2 : null}
                    senelec={detail.montant_energie_k2}
                  />
                )}
                {(detail.majoration_k1 ?? 0) > 0 && (
                  <Row label="Majoration K1 (facture)" ours={detail.majoration_k1} senelec={null} isSub />
                )}
                {(detail.majoration_k2 ?? 0) > 0 && (
                  <Row label="Majoration K2 (facture)" ours={detail.majoration_k2} senelec={null} isSub />
                )}
                {(hasK1 || hasK2) && (
                  <Row
                    label="Montant énergie total"
                    ours={hasSim ? sim!.montant_energie : null}
                    senelec={detail.montant_total_energie}
                  />
                )}

                {/* Prime fixe */}
                {((sim?.prime_fixe_totale ?? 0) > 0 || (detail.montant_prime_fixe ?? 0) > 0) && (
                  <Row
                    label="Prime fixe"
                    sub={detail.puissance_souscrite_kw && detail.nb_jour_facturation
                      ? `Tpf × ${detail.puissance_souscrite_kw} kW × ${detail.nb_jour_facturation}/30`
                      : undefined}
                    ours={hasSim ? sim!.prime_fixe_totale : null}
                    senelec={detail.montant_prime_fixe}
                  />
                )}

                {/* Majo dépassement PS */}
                {((sim?.majo_depassement_ps ?? 0) > 0 || (detail.penalites_depassement ?? 0) > 0) && (
                  <Row
                    label="Majo. dépassement PS"
                    sub={hasSim && detail.puissance_souscrite_kw && detail.puissance_max_kw
                      ? `1.5 × Tpf × (${detail.puissance_max_kw} − ${detail.puissance_souscrite_kw}) kW`
                      : undefined}
                    ours={hasSim ? sim!.majo_depassement_ps : null}
                    senelec={detail.penalites_depassement}
                  />
                )}

                {/* Cos φ */}
                {hasSim && sim!.montant_penalite_cosphi !== 0 && (
                  <Row
                    label={`Cosφ = ${(sim!.cosphi_calcule ?? detail.valeur_cosinus_phi ?? 0).toFixed(4)} → ${sim!.cosphi_is_bonus ? 'bonus' : 'pénalité'} ${Math.abs(sim!.taux_penalite_cosphi_pct).toFixed(2)}%`}
                    sub={detail.cons_k1 && detail.cons_k2 && detail.cons_wr
                      ? `Wa = ${fmtXOF((detail.cons_k1 ?? 0) + (detail.cons_k2 ?? 0))} kWh · Wr = ${fmtXOF(detail.cons_wr ?? 0)} kVARh`
                      : undefined}
                    ours={sim!.montant_penalite_cosphi}
                    senelec={detail.montant_cosinus_phi && detail.montant_cosinus_phi !== 0 ? detail.montant_cosinus_phi : null}
                  />
                )}

                {/* Redevance */}
                {(detail.montant_redevance ?? 0) > 0 && (
                  <Row
                    label="Redevance (fixe)"
                    ours={detail.montant_redevance}
                    senelec={detail.montant_redevance}
                  />
                )}

                {/* Montant HT */}
                {(detail.montant_hors_tva ?? 0) > 0 && (
                  <Row
                    label="Montant HT"
                    ours={hasSim ? sim!.montant_ht : null}
                    senelec={detail.montant_hors_tva}
                  />
                )}

                {/* TVA */}
                {(detail.montant_tva ?? 0) > 0 && (
                  <Row
                    label="TVA (18% × base)"
                    sub={hasSim ? `Base TVA = ${fmtXOF(sim!.base_tva)} FCFA` : undefined}
                    ours={hasSim ? sim!.montant_tva : null}
                    senelec={detail.montant_tva}
                  />
                )}

                {/* TTC total — highlighted */}
                <Row
                  label="TTC recalculé (base)"
                  ours={sim?.montant_ttc_calcule ?? detail.quarantine_ttc_calcule}
                  senelec={detail.montant_facture_ttc}
                  isTotal
                />

                {/* Post-table KPIs */}
                {hasSim && (
                  <div className="border-t border-white/[0.06] bg-[#0b0d18]">
                    {sim!.ipr_fcfa_kwh > 0 && (
                      <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 border-b border-white/[0.03] items-start">
                        <div>
                          <p className="text-xs text-slate-500">IPR (coût moyen TTC réel)</p>
                          <p className="text-[10px] text-slate-700">Montant TTC ÷ énergie active totale</p>
                        </div>
                        <p className="text-right text-xs tabular-nums font-mono text-violet-300/70 pt-0.5">{sim!.ipr_fcfa_kwh.toFixed(2)} F/kWh</p>
                        <p className="text-right text-xs text-slate-700 pt-0.5">—</p>
                        <p className="text-right text-[10px] text-slate-700 pt-0.5">—</p>
                      </div>
                    )}
                    {sim!.conso_journaliere_kwh > 0 && detail.nb_jour_facturation && (
                      <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 border-b border-white/[0.03] items-start">
                        <div>
                          <p className="text-xs text-slate-500">Consommation journalière</p>
                          <p className="text-[10px] text-slate-700">÷ {detail.nb_jour_facturation} jours</p>
                        </div>
                        <p className="text-right text-xs tabular-nums font-mono text-violet-300/70 pt-0.5">{sim!.conso_journaliere_kwh.toFixed(1)} kWh/j</p>
                        <p className="text-right text-xs text-slate-700 pt-0.5">—</p>
                        <p className="text-right text-[10px] text-slate-700 pt-0.5">—</p>
                      </div>
                    )}
                    {sim!.nbre_jours_depassement > 0 && detail.puissance_max_kw && detail.puissance_souscrite_kw && (
                      <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 border-b border-white/[0.03] items-start">
                        <div>
                          <p className="text-xs text-slate-500">Jours de dépassement PS (calculé)</p>
                          <p className="text-[10px] text-slate-700">Pmaxr ({detail.puissance_max_kw} kW) &gt; Ps ({detail.puissance_souscrite_kw} kW)</p>
                        </div>
                        <p className="text-right text-xs tabular-nums font-mono text-violet-300/70 pt-0.5">{sim!.nbre_jours_depassement} j</p>
                        <p className="text-right text-xs text-slate-700 pt-0.5">—</p>
                        <p className="text-right text-[10px] text-slate-700 pt-0.5">—</p>
                      </div>
                    )}
                    {sim!.part_conso_k2 != null && hasK2 && (
                      <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 border-b border-white/[0.03] items-start">
                        <div>
                          <p className="text-xs text-slate-500">Part conso K2 (HP)</p>
                          {sim!.part_cout_k2 != null && <p className="text-[10px] text-slate-700">Part coût K2 = {((sim!.part_cout_k2 ?? 0) * 100).toFixed(1)} %</p>}
                        </div>
                        <p className="text-right text-xs tabular-nums font-mono text-violet-300/70 pt-0.5">{((sim!.part_conso_k2 ?? 0) * 100).toFixed(1)} %</p>
                        <p className="text-right text-xs text-slate-700 pt-0.5">—</p>
                        <p className="text-right text-[10px] text-slate-700 pt-0.5">—</p>
                      </div>
                    )}
                    {sim!.cout_moyen_pondere_ttc != null && (
                      <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2 items-start">
                        <div>
                          <p className="text-xs text-slate-500">Coût moyen pondéré (TTC)</p>
                          <p className="text-[10px] text-slate-700">1.18 × 1.025 × (Prix_HC×20 + Prix_HP×4) / 24</p>
                        </div>
                        <p className="text-right text-xs tabular-nums font-mono text-violet-300/70 pt-0.5">{sim!.cout_moyen_pondere_ttc!.toFixed(2)} F/kWh</p>
                        <p className="text-right text-xs text-slate-700 pt-0.5">—</p>
                        <p className="text-right text-[10px] text-slate-700 pt-0.5">—</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── OCR / Manual fallback ── */}
          {(item.source === 'ocr' || item.source === 'manual') && (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0f111a] overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider">Poste</p>
                <div className="flex items-center justify-end gap-1">
                  <div className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                  <p className="text-[9px] font-bold uppercase tracking-wider text-violet-400">Recalculé</p>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400">SENELEC</p>
                </div>
                <p className="text-[9px] text-slate-700 uppercase tracking-wider text-right">%</p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_52px] px-4 py-3 items-center">
                <p className="text-xs font-bold text-slate-200">Montant TTC</p>
                <p className={`text-right text-sm font-bold tabular-nums font-mono ${item.montant_calcule != null ? 'text-violet-300' : 'text-slate-700'}`}>
                  {item.montant_calcule != null ? fmtXOF(item.montant_calcule) : '—'}
                </p>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums font-mono text-amber-300">{fmtXOF(item.montant_senelec)}</p>
                  {deltaFcfa != null && <p className={`text-[9px] font-mono mt-0.5 ${deltaFcfa >= 0 ? 'text-emerald-500/70' : 'text-red-400/60'}`}>
                    Δ {deltaFcfa >= 0 ? '+' : ''}{fmtXOF(deltaFcfa)}
                  </p>}
                </div>
                <p className={`text-right text-[10px] tabular-nums ${deltaColor}`}>
                  {item.delta_pct != null ? `${item.delta_pct.toFixed(1)} %` : '—'}
                </p>
              </div>
            </div>
          )}

          {/* ── Reason ── */}
          {item.quarantine_reason && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-orange-500/[0.05] border border-orange-500/[0.12]">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400/70 shrink-0 mt-0.5" />
              <p className="text-[11px] text-orange-300/70 leading-relaxed">{item.quarantine_reason}</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 border border-white/10 hover:text-slate-200 hover:bg-white/5"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Comment dialog ───────────────────────────────────────────────────────────

function CommentDialog({ item, onClose, onSaved }: {
  item: QuarantineItem | null;
  onClose: () => void;
  onSaved: (id: string, comment: string, actionPlan: string) => void;
}) {
  const [comment, setComment]         = useState(item?.quarantine_comment ?? '')
  const [actionPlan, setActionPlan]   = useState(item?.quarantine_action_plan ?? '')
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (item) {
      setComment(item.quarantine_comment ?? '')
      setActionPlan(item.quarantine_action_plan ?? '')
    }
  }, [item])

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      await saveQuarantineComment(item, comment, actionPlan)
      onSaved(item.id, comment, actionPlan)
      onClose()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const hasContent = comment.trim() || actionPlan.trim()

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="bg-[#0c0e1a] border-white/10 text-white max-w-lg p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/15 shrink-0">
              <MessageSquarePlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-slate-100 leading-tight">
                Commentaire &amp; Plan d'action
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[320px]">
                {item?.label}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Commentaire */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <MessageSquarePlus className="w-3 h-3 text-slate-500" />
              Commentaire
            </Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Observations, contexte, hypothèses sur l'anomalie…"
              className="bg-white/[0.03] border-white/[0.08] text-slate-100 placeholder:text-slate-600
                resize-none h-24 text-sm focus:border-violet-500/40 focus:ring-0"
            />
          </div>

          {/* Plan d'action */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3 text-slate-500" />
              Plan d'action proposé
            </Label>
            <Textarea
              value={actionPlan}
              onChange={e => setActionPlan(e.target.value)}
              placeholder="1. Contacter SENELEC pour vérification…&#10;2. Demander relevé de compteur…&#10;3. …"
              className="bg-white/[0.03] border-white/[0.08] text-slate-100 placeholder:text-slate-600
                resize-none h-28 text-sm focus:border-violet-500/40 focus:ring-0"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 border border-white/10 hover:text-slate-200 hover:bg-white/5"
          >
            Annuler
          </Button>
          <Button
            disabled={saving || !hasContent}
            onClick={handleSave}
            className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
          >
            {saving
              ? <><div className="w-3 h-3 rounded-full border border-violet-300/30 border-t-violet-300 animate-spin mr-1.5" />Sauvegarde…</>
              : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Enregistrer</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Resolve dialog ───────────────────────────────────────────────────────────

function ResolveDialog({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('')
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#0c0e1a] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Résoudre l'anomalie</DialogTitle>
          <DialogDescription className="text-slate-400">
            Ajoutez une note de résolution (optionnel) avant de marquer comme traitée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Note de résolution</Label>
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: Erreur de saisie corrigée, facture validée…"
            className="bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder:text-slate-600 resize-none h-20 text-sm"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}
            className="text-slate-400 border border-white/10 hover:text-slate-200">
            Annuler
          </Button>
          <Button onClick={() => { onConfirm(note); setNote('') }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Résoudre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterSource = 'all' | 'ocr' | 'senelec' | 'manual'

interface Props {
  onCountChange?: (count: number) => void
}

export function QuarantinePanel({ onCountChange }: Props) {
  const { organization } = useOrganization()
  const [items, setItems]           = useState<QuarantineItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [filterSource, setFilterSource] = useState<FilterSource>('all')
  const [actionId, setActionId]     = useState<string | null>(null)
  const [resolveTarget, setResolveTarget] = useState<QuarantineItem | null>(null)
  const [detailItem, setDetailItem] = useState<QuarantineItem | null>(null)
  const [commentTarget, setCommentTarget] = useState<QuarantineItem | null>(null)

  const load = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)
    try {
      const data = await getAllQuarantineItems(organization.id)
      setItems(data)
      onCountChange?.(data.length)
    } catch {
      toast.error('Impossible de charger la quarantaine')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, onCountChange])

  useEffect(() => { load() }, [load])

  const filtered = filterSource === 'all'
    ? items
    : items.filter(i => i.source === filterSource)

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const countOcr     = items.filter(i => i.source === 'ocr').length
  const countSenelec = items.filter(i => i.source === 'senelec').length
  const avgDelta = items.length > 0
    ? items.reduce((s, i) => s + Math.abs(i.delta_pct ?? 0), 0) / items.length
    : 0

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleUnquarantine = async (item: QuarantineItem) => {
    setActionId(item.id)
    try {
      if (item.source === 'ocr') await unquarantineInvoice(item.id)
      else if (item.source === 'senelec') await unquarantineFactureSenelec(item.id)
      toast.success('Retiré de la quarantaine')
      await load()
    } catch {
      toast.error('Erreur')
    } finally {
      setActionId(null)
    }
  }

  const handleResolveManual = async (item: QuarantineItem, note: string) => {
    setResolveTarget(null)
    setActionId(item.id)
    try {
      await resolveManualQuarantine(item.id, note)
      toast.success('Anomalie résolue')
      await load()
    } catch {
      toast.error('Erreur')
    } finally {
      setActionId(null)
    }
  }

  const handleCommentSaved = (id: string, comment: string, actionPlan: string) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, quarantine_comment: comment || null, quarantine_action_plan: actionPlan || null } : i
    ))
  }

  const handleDelete = async (item: QuarantineItem) => {
    setActionId(item.id)
    try {
      if (item.source === 'manual') await deleteManualQuarantine(item.id)
      toast.success('Entrée supprimée')
      await load()
    } catch {
      toast.error('Erreur')
    } finally {
      setActionId(null)
    }
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
        <div className="p-5 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/[0.15]">
          <ShieldCheck className="w-10 h-10 text-emerald-400/60" />
        </div>
        <div>
          <p className="text-slate-200 font-semibold text-sm">Aucune anomalie en quarantaine</p>
          <p className="text-xs text-slate-600 mt-1.5 max-w-xs leading-relaxed">
            Les factures dont le delta dépasse le seuil configuré dans le simulateur
            seront automatiquement listées ici.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <ResolveDialog
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        onConfirm={note => resolveTarget && handleResolveManual(resolveTarget, note)}
      />
      <DetailDialog item={detailItem} onClose={() => setDetailItem(null)} />
      <CommentDialog
        item={commentTarget}
        onClose={() => setCommentTarget(null)}
        onSaved={handleCommentSaved}
      />

      <div className="space-y-5">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total"       value={String(items.length)} sub="toutes sources"  color="text-orange-400" />
          <KpiCard label="OCR"         value={String(countOcr)}     sub="PDF importés"    color="text-amber-400" />
          <KpiCard label="SENELEC"     value={String(countSenelec)} sub="données Excel"   color="text-emerald-400" />
          <KpiCard label="Delta moyen" value={`${avgDelta.toFixed(1)} %`} sub="écart absolu" color="text-red-400" />
        </div>

        {/* ── Source filter + refresh ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] rounded-xl border border-white/[0.05]">
            {(['all', 'ocr', 'senelec', 'manual'] as FilterSource[]).map(s => {
              const active = filterSource === s
              const count = s === 'all' ? items.length : items.filter(i => i.source === s).length
              const cfg = s !== 'all' ? SOURCE_CONFIG[s] : null
              return (
                <button
                  key={s}
                  onClick={() => setFilterSource(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${active
                      ? cfg ? `${cfg.bg} ${cfg.color} border ${cfg.border}`
                              : 'bg-white/[0.08] text-slate-200 border border-white/[0.12]'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                    }`}
                >
                  {cfg && <cfg.Icon className="w-3 h-3 shrink-0" />}
                  {s === 'all' ? 'Tous' : SOURCE_CONFIG[s].label}
                  {count > 0 && (
                    <span className="text-[10px] tabular-nums font-bold opacity-70">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            disabled={loading}
            className="h-8 w-8 border border-white/[0.07] text-slate-500 hover:text-slate-200 hover:bg-white/5"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* ── Items list ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="w-6 h-6 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Aucune entrée pour ce filtre</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(item => {
              const busy = actionId === item.id
              const absDelta = Math.abs(item.delta_pct ?? 0)
              const deltaColor = absDelta >= 10 ? 'text-red-400' : absDelta >= 5 ? 'text-orange-400' : 'text-amber-400'

              return (
                <div
                  key={`${item.source}-${item.id}`}
                  className="rounded-2xl border border-white/[0.07] bg-[#0f111a] overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/15 shrink-0 mt-0.5">
                        <ShieldAlert className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SourceBadge source={item.source} />
                          <p className="text-sm font-semibold text-slate-100 truncate">{item.label}</p>
                        </div>
                        {item.quarantined_at && (
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {format(new Date(item.quarantined_at), 'dd MMM yyyy à HH:mm', { locale: fr })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Delta badge */}
                    {item.delta_pct != null && (
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold tabular-nums font-mono ${deltaColor}`}>
                          {fmtPct(item.delta_pct)}
                        </p>
                        <p className="text-[10px] text-slate-600">delta</p>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider">SENELEC déclaré</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-300 font-mono">
                        {fmtXOF(item.montant_senelec)} FCFA
                      </p>
                    </div>
                    {item.montant_calcule != null && (
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wider">TTC recalculé</p>
                        <p className="text-sm font-semibold tabular-nums text-violet-300 font-mono">
                          {fmtXOF(item.montant_calcule)} FCFA
                        </p>
                      </div>
                    )}
                    {item.source === 'manual' && (item as any).delta_fcfa != null && (
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wider">Écart</p>
                        <p className={`text-sm font-semibold tabular-nums font-mono ${deltaColor}`}>
                          {(item as any).delta_fcfa >= 0 ? '+' : ''}{fmtXOF((item as any).delta_fcfa)} FCFA
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  {item.quarantine_reason && (
                    <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-orange-500/[0.05] border border-orange-500/[0.10]">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3 h-3 text-orange-400/70 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-orange-300/70 leading-relaxed">{item.quarantine_reason}</p>
                      </div>
                    </div>
                  )}

                  {/* Comment preview strip */}
                  {(item.quarantine_comment || item.quarantine_action_plan) && (
                    <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-violet-500/[0.05] border border-violet-500/[0.12] space-y-1.5">
                      {item.quarantine_comment && (
                        <div className="flex items-start gap-2">
                          <MessageSquarePlus className="w-3 h-3 text-violet-400/60 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-violet-200/60 leading-relaxed line-clamp-2">{item.quarantine_comment}</p>
                        </div>
                      )}
                      {item.quarantine_action_plan && (
                        <div className="flex items-start gap-2">
                          <ClipboardList className="w-3 h-3 text-violet-400/60 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-violet-200/60 leading-relaxed line-clamp-2">{item.quarantine_action_plan}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
                    {/* Eye — detail view */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetailItem(item)}
                      className="h-7 text-xs border border-white/[0.08] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                      title="Voir le détail"
                    >
                      <Eye className="w-3 h-3 mr-1.5" />
                      Détail
                    </Button>

                    {/* Comment */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCommentTarget(item)}
                      className={`h-7 text-xs border hover:bg-violet-500/10 hover:text-violet-300
                        ${item.quarantine_comment || item.quarantine_action_plan
                          ? 'border-violet-500/30 text-violet-400'
                          : 'border-white/[0.08] text-slate-400'}`}
                      title="Ajouter un commentaire / plan d'action"
                    >
                      <MessageSquarePlus className="w-3 h-3 mr-1.5" />
                      {item.quarantine_comment || item.quarantine_action_plan ? 'Modifier note' : 'Commenter'}
                    </Button>

                    {/* OCR / SENELEC: can un-quarantine */}
                    {(item.source === 'ocr' || item.source === 'senelec') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleUnquarantine(item)}
                        className="h-7 text-xs border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        {busy
                          ? <><div className="w-3 h-3 rounded-full border border-emerald-400/30 border-t-emerald-400 animate-spin mr-1.5" />…</>
                          : <><CheckCircle2 className="w-3 h-3 mr-1.5" />Lever la quarantaine</>}
                      </Button>
                    )}

                    {/* Manual: resolve */}
                    {item.source === 'manual' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setResolveTarget(item)}
                        className="h-7 text-xs border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1.5" />
                        Résoudre
                      </Button>
                    )}

                    {/* Manual: delete */}
                    {item.source === 'manual' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleDelete(item)}
                        className="h-7 text-xs border border-red-500/20 text-red-400/70 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3 mr-1.5" />
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
