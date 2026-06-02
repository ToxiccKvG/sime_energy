import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  MapPin,
  Zap,
  Hash,
  Calendar,
  CalendarCheck,
  Gauge,
  Activity,
  Receipt,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AuditInvoice } from '@/lib/invoice-service';

interface InvoiceViewDialogProps {
  invoice: AuditInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OCRField {
  key: string;
  value: string;
}

// ─── OCR extraction helpers ────────────────────────────────────────────────

function extractForms(ocrData: unknown): OCRField[] {
  const fields: OCRField[] = [];
  let formsArray: unknown[] = [];

  if (Array.isArray(ocrData)) {
    formsArray = ocrData;
  } else if (ocrData && typeof ocrData === 'object') {
    const data = ocrData as Record<string, unknown>;
    if ('page' in data && Array.isArray(data.page) && data.page.length > 0) {
      const firstPage = data.page[0] as Record<string, unknown>;
      if ('forms' in firstPage && Array.isArray(firstPage.forms)) {
        formsArray = firstPage.forms;
      }
    } else if ('forms' in data && Array.isArray(data.forms)) {
      formsArray = data.forms;
    }
  }

  for (const item of formsArray) {
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      if (row.Key && row.Value) {
        fields.push({ key: String(row.Key), value: String(row.Value) });
      }
    }
  }
  return fields;
}

/** Find first matching value from an ordered list of candidate keys */
function findValue(fields: OCRField[], ...candidates: string[]): string {
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/\s*:\s*$/, '').trim();
    const hit = fields.find(
      (f) => f.key.toLowerCase().replace(/\s*:\s*$/, '').trim() === norm
    );
    if (hit?.value) return hit.value;
  }
  return '';
}

// ─── Formatting ────────────────────────────────────────────────────────────

function formatXOF(amount?: number | null): string {
  if (!amount) return '0';
  return amount.toLocaleString('fr-FR');
}

function formatDate(str?: string | null): string {
  if (!str) return '—';
  try {
    return format(new Date(str), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return str;
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
  danger = false,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`
        relative flex flex-col gap-1 rounded-xl p-4 border overflow-hidden
        ${accent
          ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/10 border-amber-500/30'
          : 'bg-[#14161f] border-white/[0.07]'
        }
      `}
    >
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div
        className={`font-mono font-bold leading-tight mt-0.5
          ${accent ? 'text-amber-400 text-2xl' : danger ? 'text-red-400 text-xl' : 'text-slate-100 text-xl'}
        `}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
      {accent && (
        <div className="absolute right-3 top-3 text-amber-500/20">
          <Receipt className="w-12 h-12" />
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === '—') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 pt-px">{label}</span>
      <span className={`text-xs text-right text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function BillingLine({
  label,
  value,
  bold = false,
  accent = false,
  indent = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
  indent?: boolean;
}) {
  if (!value || value === '—') return null;
  return (
    <div
      className={`flex justify-between items-center gap-2 py-1.5
        ${bold ? 'border-t border-amber-500/20 mt-1 pt-2' : ''}
        ${indent ? 'pl-3' : ''}
      `}
    >
      <span className={`text-xs ${bold ? 'text-slate-300 font-semibold' : 'text-slate-400'}`}>
        {label}
      </span>
      <span
        className={`font-mono text-right text-xs
          ${accent ? 'text-amber-400 font-bold text-sm' : bold ? 'text-slate-100 font-semibold' : 'text-slate-300'}
        `}
      >
        {value}
      </span>
    </div>
  );
}

function ConfidenceArc({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75; // only 3/4 of circle
  const fill = arc * (score / 100);
  const color =
    score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex flex-col items-center justify-center gap-1">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-[135deg]">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1e2130" strokeWidth="6" strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-lg leading-none" style={{ color }}>{score}%</span>
      </div>
      <span className="text-[10px] text-slate-500 uppercase tracking-widest -mt-1">OCR</span>
    </div>
  );
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  verified: {
    label: 'Vérifiée',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  processing: {
    label: 'En traitement',
    icon: <Clock className="w-3.5 h-3.5" />,
    className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  },
  rejected: {
    label: 'Rejetée',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  pending: {
    label: 'En attente',
    icon: <Clock className="w-3.5 h-3.5" />,
    className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
};

// ─── Main component ────────────────────────────────────────────────────────

export function InvoiceViewDialog({ invoice, open, onOpenChange }: InvoiceViewDialogProps) {
  if (!invoice) return null;

  const fields = extractForms(invoice.ocr_data);

  // ── Key field extraction ──────────────────────────────────────────────
  const factureNo = findValue(fields,
    'NUMERO_FACTURE', 'FACTURE N°', 'FACTURE N', 'N° FACTURE', 'FACTURE NO', 'N° FACTURE :',
  ) || invoice.invoice_number || '';

  const fournisseur = invoice.supplier
    || findValue(fields, 'NOM_OU_RAISON_SOCIALE', 'NOM OU RAISON SOCIALE', 'NOM OU RAISON SOCIALE :') || '—';

  const adresse = findValue(fields,
    'ADRESSE_PRESENTATION', 'ADRESSE PRESENTATION', 'RUE',
  );

  const adresseLivraison = findValue(fields,
    'ADRESSE DU POINT DE LIVRAISON', 'ADRESSE_LIVRAISON',
  );

  const dateFacture = invoice.invoice_date
    ? formatDate(invoice.invoice_date)
    : findValue(fields, 'DATE_COMPTABLE_FACTURE', 'DATE', 'DATE FACTURE') || '—';

  const dateLimite = findValue(fields,
    'DATE_LIMITE_PAIEMENT', 'DATE LIMITE DE PAIEMENT', 'DATE LIMITE',
  );

  const periodeDu = findValue(fields, 'PERIODE_DU', 'PERIODE DU', 'DU');
  const periodeAu = findValue(fields, 'PERIODE_AU', 'PERIODE AU', 'AU');
  const nbrJours  = findValue(fields, 'NBR_JOURS', 'NOMBRE DE JOURS', 'NOMBRE DE JOURS (N)');

  const compteContrat = findValue(fields,
    'NUMERO_COMPTE_CONTRAT', 'N° COMPTE DE CONTRAT', 'N°COMPTE DE CONTRAT',
    'N° COMPTE CONTRAT', 'COMPTE CONTRAT',
  );
  const nClient   = findValue(fields, 'N°CLIENT', 'N° CLIENT', 'NUMERO CLIENT');
  const compteur  = findValue(fields, 'NUMERO_COMPTEUR', 'COMPTEUR');
  const puissance = findValue(fields, 'PUISSANCE_SOUSCRITE', 'PUISSANCE SOUSCRITE', 'PUISSANCE SOUSCRITE (W)');
  const tarif     = findValue(fields, 'TYPE_TARIF_TEXTE', 'TARIF', 'TYPE DE TARIF');
  const agence    = findValue(fields, 'AGENCE');
  const bordereau = findValue(fields, 'BORDEREAU_RANG', 'BORDEREAU / RANG', 'BORDEREAU');
  const typeFacture = findValue(fields, 'TYPE_TARIF_TEXTE', 'TYPE DE FACTURE', 'TYPE_FACTURE');

  // Indexes
  const ancienIndex = findValue(fields, 'AI_CG', 'ANCIEN INDEX', 'ANCIEN INDEX (AI)');
  const nouvelIndex = findValue(fields, 'NI_CG', 'NOUVEL INDEX', 'NOUVEL INDEX (NI)');
  const consommation = findValue(fields, 'CONSOMMATION_KWH', 'CONSOMMATION (KWH)', 'CONSOMMATION (kWh)', 'CONSOMMATION');

  // Billing breakdown
  const mntConso    = findValue(fields, 'MONTANT_CONSOMMATION', 'MONTANT CONSOMMATION');
  const tco         = findValue(fields, 'TAXE_COMMUNALE', 'TCO (2,5%)', 'TCO');
  const redevance   = findValue(fields, 'MONTANT_REDEVANCE', 'REDEVANCE');
  const baseTva     = findValue(fields, 'BASE_CALCUL_TVA', 'BASE CALCUL TVA', 'MONTANT_HTVA');
  const tva         = findValue(fields, 'MONTANT_TVA', 'TVA (18%)', 'TVA (18)');
  const repriseArr  = findValue(fields, 'REPRISE_ARRONDI', 'REPRISE ARRONDI');
  const totalFact   = findValue(fields, 'TOTAL_FACTURE', 'TOTAL FACTURE');
  const arrondi     = findValue(fields, 'ARRONDI');
  const soldeGlobal = findValue(fields, 'SOLDE_GLOBAL', 'SOLDE GLOBAL', 'SOLDE GLOBAL (2)', 'SOLDE GLOBAL(2)');
  const totalDues   = findValue(fields, 'TOTAL_SOMMES_DUES', 'TOTAL DES SOMMES DUES (1)+(2)', 'TOTAL DES SOMMES DUES');

  const hasBilling = mntConso || tco || redevance || tva || totalFact;

  const statusCfg = STATUS_CONFIG[invoice.status as keyof typeof STATUS_CONFIG]
    ?? STATUS_CONFIG.pending;

  const periode = periodeDu && periodeAu ? `${periodeDu} → ${periodeAu}` : periodeDu || periodeAu || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-3xl max-h-[90vh] bg-[#0d0f1a] border border-white/10 overflow-hidden rounded-2xl shadow-2xl shadow-black/60">

        {/* ── Header bar ── */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.07] bg-[#0a0c14]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <FileText className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-slate-100 text-base font-semibold leading-tight truncate">
                    {fournisseur}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {factureNo && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                        <Hash className="w-3 h-3" />
                        {factureNo}
                      </span>
                    )}
                    {typeFacture && (
                      <span className="text-[11px] text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                        {typeFacture}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[11px] border px-2 py-0 h-5 gap-1 ${statusCfg.className}`}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </Badge>
                  </div>
                </div>
              </div>
              <ConfidenceArc score={invoice.confidence_score ?? 0} />
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <div className="px-6 py-5 space-y-5">

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="Montant TTC"
                value={`${formatXOF(invoice.amount)} FCFA`}
                icon={<Receipt className="w-3 h-3" />}
                accent
              />
              <KpiCard
                label="Date facture"
                value={dateFacture}
                icon={<Calendar className="w-3 h-3" />}
              />
              <KpiCard
                label="Date limite"
                value={dateLimite || '—'}
                icon={<CalendarCheck className="w-3 h-3" />}
                danger={!!dateLimite}
              />
              <KpiCard
                label={nbrJours ? `${nbrJours} jours` : 'Période'}
                value={periode || '—'}
                sub={consommation ? `${consommation} kWh` : undefined}
                icon={<Activity className="w-3 h-3" />}
              />
            </div>

            {/* ── Two-column body ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Left — client + contrat */}
              <div className="space-y-4">

                {/* Client info */}
                <div className="rounded-xl bg-[#14161f] border border-white/[0.07] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Client</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-100 mb-1">{fournisseur}</p>
                  {adresse && (
                    <div className="flex items-start gap-1.5 mt-2">
                      <MapPin className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-400 leading-relaxed">{adresse}</p>
                    </div>
                  )}
                  {adresseLivraison && adresseLivraison !== adresse && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <ChevronRight className="w-3 h-3 text-slate-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-500 leading-relaxed">{adresseLivraison}</p>
                    </div>
                  )}
                  {invoice.file_name && (
                    <p className="text-[10px] font-mono text-slate-600 mt-3 truncate">
                      {invoice.file_name}
                    </p>
                  )}
                </div>

                {/* Contrat / Compteur */}
                {(compteContrat || nClient || compteur || puissance || tarif || agence || bordereau) && (
                  <div className="rounded-xl bg-[#14161f] border border-white/[0.07] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Contrat</span>
                    </div>
                    <DataRow label="N° Client"           value={nClient} mono />
                    <DataRow label="Compte contrat"      value={compteContrat} mono />
                    <DataRow label="Compteur"            value={compteur} mono />
                    <DataRow label="Bordereau / Rang"    value={bordereau} mono />
                    <DataRow label="Puissance souscrite" value={puissance ? `${puissance} W` : ''} mono />
                    <DataRow label="Tarif"               value={tarif} />
                    <DataRow label="Agence"              value={agence} />
                  </div>
                )}

                {/* Indexes / consommation */}
                {(ancienIndex || nouvelIndex || consommation) && (
                  <div className="rounded-xl bg-[#14161f] border border-white/[0.07] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Relevé</span>
                    </div>
                    <DataRow label="Période du"          value={periodeDu} />
                    <DataRow label="au"                  value={periodeAu} />
                    <DataRow label="Nombre de jours"     value={nbrJours} mono />
                    <DataRow label="Ancien index (AI)"   value={ancienIndex} mono />
                    <DataRow label="Nouvel index (NI)"   value={nouvelIndex} mono />
                    <DataRow label="Consommation (kWh)"  value={consommation} mono />
                  </div>
                )}
              </div>

              {/* Right — billing breakdown */}
              <div className="space-y-4">

                {hasBilling && (
                  <div className="rounded-xl bg-[#14161f] border border-amber-500/15 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Détail facturation</span>
                    </div>
                    <div className="space-y-0">
                      <BillingLine label="Montant consommation" value={mntConso} />
                      <BillingLine label="TCO (2,5%)"           value={tco} indent />
                      <BillingLine label="Redevance"            value={redevance} indent />
                      <BillingLine label="Base calcul TVA"      value={baseTva} />
                      <BillingLine label="TVA (18%)"            value={tva} indent />
                      {repriseArr && <BillingLine label="Reprise arrondi"    value={repriseArr} />}
                      {totalFact  && <BillingLine label="Total facture"      value={totalFact} bold />}
                      {arrondi    && <BillingLine label="Arrondi"            value={arrondi} indent />}

                      <Separator className="my-2 bg-amber-500/20" />

                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-sm font-bold text-slate-200">Montant TTC</span>
                        <span className="font-mono font-bold text-amber-400 text-base">
                          {formatXOF(invoice.amount)} FCFA
                        </span>
                      </div>

                      {soldeGlobal && (
                        <>
                          <Separator className="my-2 bg-white/5" />
                          <BillingLine label="Solde global ²"          value={soldeGlobal} />
                          <BillingLine label="Total sommes dues (1+2)" value={totalDues} bold accent />
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {invoice.notes && (
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                    <p className="text-xs font-semibold text-amber-400 mb-1.5">Notes</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{invoice.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── All OCR fields ── */}
            {fields.length > 0 && (
              <div className="rounded-xl bg-[#0d0f18] border border-white/[0.05] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Données OCR brutes
                  </span>
                  <span className="text-[10px] font-mono text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">
                    {fields.length} champs
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto px-4 py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {fields.map((f, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-[10px] text-slate-500 shrink-0 max-w-[45%] leading-snug">{f.key}</span>
                        <span className="text-[10px] font-mono text-slate-300 text-right leading-snug break-all">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
