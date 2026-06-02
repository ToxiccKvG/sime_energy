import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckCircle2, FileText, FileSpreadsheet, Filter } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InvoiceForSelector } from '@/lib/billing-params-service'
import type { FactureSenelecForSelector } from '@/lib/factures-senelec-service'

interface InvoiceSelectorProps {
  invoices:        InvoiceForSelector[]
  senelecInvoices: FactureSenelecForSelector[]
  // compound value: 'ocr:<uuid>' | 'senelec:<uuid>' | null
  value:    string | null
  onChange: (compoundValue: string) => void
  loading?: boolean
  contractFiltered?: boolean
}

function fmtAmount(amount: number | null) {
  if (!amount) return '—'
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`
}

function fmtOcrDate(invoice_date: string | null) {
  if (!invoice_date) return null
  try { return format(new Date(invoice_date), 'MMMM yyyy', { locale: fr }) } catch { return invoice_date }
}

function fmtSenelecPeriod(row: FactureSenelecForSelector) {
  if (row.mois_facturation && row.annee_facturation) {
    return `${row.mois_facturation}. ${row.annee_facturation}`
  }
  if (row.date_debut_periode) {
    try { return format(new Date(row.date_debut_periode), 'MMM yyyy', { locale: fr }) } catch { /* fallthrough */ }
  }
  return row.numero_compte_contrat
}

export function InvoiceSelector({ invoices, senelecInvoices, value, onChange, loading, contractFiltered }: InvoiceSelectorProps) {
  if (loading) {
    return <div className="h-9 w-full rounded-lg bg-white/[0.03] border border-white/[0.07] animate-pulse" />
  }

  const hasOcr     = invoices.length > 0
  const hasSenelec = senelecInvoices.length > 0
  const hasAny     = hasOcr || hasSenelec

  if (!hasAny) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/[0.02] border border-white/[0.07] text-xs text-slate-500">
        {contractFiltered
          ? <><Filter className="w-3.5 h-3.5 shrink-0 text-amber-400" />Aucune facture ne correspond à ce N° de contrat</>
          : <><FileText className="w-3.5 h-3.5 shrink-0" />Aucune facture disponible pour cet audit</>
        }
      </div>
    )
  }

  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className={`h-9 bg-white/5 text-slate-200 text-sm focus:ring-blue-500/30 ${contractFiltered ? 'border-emerald-500/30' : 'border-white/10'}`}>
        <SelectValue placeholder="Sélectionner une facture de référence…" />
      </SelectTrigger>
      <SelectContent className="bg-[#0d1018] border-white/10 text-white max-h-72">

        {/* ── Groupe OCR ── */}
        {hasOcr && (
          <SelectGroup>
            <SelectLabel className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-2 py-1 flex items-center gap-1.5">
              Factures OCR vérifiées
              {contractFiltered && <Filter className="w-2.5 h-2.5 text-emerald-400" />}
            </SelectLabel>
            {invoices.map(inv => {
              const period = fmtOcrDate(inv.invoice_date)
              return (
                <SelectItem
                  key={`ocr:${inv.id}`}
                  value={`ocr:${inv.id}`}
                  className="text-slate-200 focus:bg-slate-700/50 focus:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-2 py-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="font-medium text-sm">
                      {period ? <span className="capitalize">{period}</span> : inv.file_name}
                    </span>
                    <span className="text-slate-500 text-xs tabular-nums ml-auto pl-4">{fmtAmount(inv.amount)}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectGroup>
        )}

        {hasOcr && hasSenelec && <SelectSeparator className="bg-white/[0.07]" />}

        {/* ── Groupe SENELEC Excel ── */}
        {hasSenelec && (
          <SelectGroup>
            <SelectLabel className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-2 py-1 flex items-center gap-1.5">
              Données SENELEC (Excel)
              {contractFiltered && <Filter className="w-2.5 h-2.5 text-emerald-400" />}
            </SelectLabel>
            {senelecInvoices.map(row => {
              const period = fmtSenelecPeriod(row)
              const conso  = row.consommation_facturee
              return (
                <SelectItem
                  key={`senelec:${row.id}`}
                  value={`senelec:${row.id}`}
                  className="text-slate-200 focus:bg-slate-700/50 focus:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-2 py-0.5">
                    <FileSpreadsheet className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="font-medium text-sm capitalize">{period}</span>
                    {conso != null && (
                      <span className="text-slate-500 text-xs tabular-nums">
                        {Math.round(conso).toLocaleString('fr-FR')} kWh
                      </span>
                    )}
                    <span className="text-slate-500 text-xs tabular-nums ml-auto pl-2">{fmtAmount(row.montant_facture_ttc)}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
