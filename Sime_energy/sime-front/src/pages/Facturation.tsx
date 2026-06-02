import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/context/OrganizationContext';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity-service';
import { getAudits } from '@/lib/audit-service';
import { getAuditInvoices, deleteInvoice } from '@/lib/invoice-service';
import { autoVerifyProcessingInvoices } from '@/lib/invoice-auto-verify';
import {
  Upload, FileText, DollarSign, CheckCircle2, Eye, Trash2,
  AlertCircle, ArrowDown, ArrowUp, Download, Zap,
  LayoutGrid, ScanLine, FileSpreadsheet, Database, Calculator, ShieldAlert,
  ChevronLeft, ChevronRight, TrendingUp, ListFilter, ChevronDown, Search, X,
} from 'lucide-react';
import { SimulateurPanel } from '@/components/invoices/SimulateurPanel';
import { QuarantinePanel } from '@/components/invoices/QuarantinePanel';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { InvoiceImportDialog } from '@/components/invoices/InvoiceImportDialog';
import { InvoiceViewDialog } from '@/components/invoices/InvoiceViewDialog';
import { BillingImportModal } from '@/components/invoices/BillingImportModal';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { exportVerifiedInvoicesToExcel } from '@/lib/export-service';
import { ExportConfigDialog } from '@/components/invoices/ExportConfigDialog';
import type { AuditInvoice } from '@/lib/invoice-service';
import { upsertFacturesSenelec, getFacturesSenelec, FactureSenelec } from '@/lib/factures-senelec-service';
import type { BillingRow } from '@/components/invoices/billing-import.types';

const MOCK_MODE = import.meta.env.VITE_MOCK_INVOICES === 'true';
const SENELEC_PAGE_SIZE = 50;

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  verified:   { label: 'Vérifiée',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  processing: { label: 'En traitement', cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30',  dot: 'bg-amber-400 animate-pulse' },
  rejected:   { label: 'Rejetée',       cls: 'bg-red-500/15    text-red-400    border-red-500/30',    dot: 'bg-red-400' },
  pending:    { label: 'En attente',    cls: 'bg-slate-500/15  text-slate-400  border-slate-500/30',  dot: 'bg-slate-400 animate-pulse' },
};

const getStatus = (s: string) => STATUS[s] ?? STATUS.pending;

// ─── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, accent = false }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl p-5 border overflow-hidden
      ${accent
        ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/10 border-amber-500/25'
        : 'bg-[#12141e] border-white/[0.07]'}
    `}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums leading-none ${accent ? 'text-amber-400' : 'text-slate-100'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      <div className={`absolute right-5 top-5 opacity-20 ${accent ? 'text-amber-400' : 'text-slate-400'}`}>
        {icon}
      </div>
    </div>
  );
}

// ─── Sortable header ───────────────────────────────────────────────────────

function SortTh({ label, sortKey, sortConfig, onSort }: {
  label: string; sortKey: string;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (k: string) => void;
}) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? sortConfig!.direction === 'desc'
            ? <ArrowDown className="w-3 h-3 text-amber-400" />
            : <ArrowUp className="w-3 h-3 text-amber-400" />
          : <ArrowDown className="w-3 h-3 opacity-20" />}
      </div>
    </th>
  );
}

// ─── Column filter popover ─────────────────────────────────────────────────

type FilterAccent = 'emerald' | 'amber' | 'purple';

const ACCENT: Record<FilterAccent, { text: string; dot: string; border: string; bg: string; radio: string }> = {
  emerald: { text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-400', bg: 'bg-emerald-500/10', radio: 'bg-emerald-400' },
  amber:   { text: 'text-amber-400',   dot: 'bg-amber-400',   border: 'border-amber-400',   bg: 'bg-amber-500/10',   radio: 'bg-amber-400'   },
  purple:  { text: 'text-purple-400',  dot: 'bg-purple-400',  border: 'border-purple-400',  bg: 'bg-purple-500/10',  radio: 'bg-purple-400'  },
};

function ColumnFilterPopover({
  label,
  value,
  onChange,
  options,
  searchable = false,
  accent = 'emerald',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label?: string; count?: number }[];
  searchable?: boolean;
  accent?: FilterAccent;
}) {
  const [localSearch, setLocalSearch] = useState('');
  const [open, setOpen] = useState(false);
  const a = ACCENT[accent];
  const active = value !== 'all';

  const displayOpts = searchable && localSearch
    ? options.filter(o => (o.label ?? o.value).toLowerCase().includes(localSearch.toLowerCase()))
    : options;

  const handleSelect = (v: string) => { onChange(v); setOpen(false); setLocalSearch(''); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`group flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-150 outline-none
          ${active ? a.text : 'text-slate-500 hover:text-slate-300'}`}>
          <ListFilter className={`w-3 h-3 shrink-0 transition-colors ${active ? a.text : 'text-slate-600 group-hover:text-slate-400'}`} />
          {label}
          {active
            ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.dot}`} />
            : <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-25 group-hover:opacity-60 transition-opacity" />}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={14}
        className="w-[260px] p-0 rounded-2xl border border-white/[0.1] bg-[#0c0e1a] shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden z-50">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <ListFilter className={`w-3.5 h-3.5 ${a.text}`} />
            <span className="text-[11px] font-semibold text-slate-200 tracking-wide">{label}</span>
          </div>
          {active && (
            <button onClick={() => handleSelect('all')}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />Effacer
            </button>
          )}
        </div>

        {/* Search */}
        {searchable && (
          <div className="px-3 py-2.5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] focus-within:border-white/[0.16] transition-colors">
              <Search className="w-3 h-3 text-slate-600 shrink-0" />
              <input value={localSearch} onChange={e => setLocalSearch(e.target.value)}
                placeholder="Rechercher…"
                className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-slate-600 outline-none" />
              {localSearch && (
                <button onClick={() => setLocalSearch('')} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Options list */}
        <div className="overflow-y-auto py-1" style={{ maxHeight: '224px' }}>
          {displayOpts.length === 0
            ? <p className="px-4 py-5 text-xs text-slate-600 text-center italic">Aucun résultat</p>
            : displayOpts.map((opt) => {
              const isSelected = opt.value === value;
              const lbl = opt.label ?? opt.value;
              return (
                <button key={opt.value} onClick={() => handleSelect(opt.value)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-all duration-100
                    ${isSelected ? `${a.bg} text-white` : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                      ${isSelected ? a.border : 'border-white/[0.18]'}`}>
                      {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${a.radio}`} />}
                    </div>
                    <span className={`text-xs truncate ${isSelected ? 'font-medium' : ''}`}>{lbl}</span>
                  </div>
                  {opt.count != null && opt.value !== 'all' && (
                    <span className={`text-[10px] tabular-nums shrink-0 ${isSelected ? 'text-white/50' : 'text-slate-600'}`}>
                      {opt.count.toLocaleString('fr-FR')}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Montant TTC range filter popover ──────────────────────────────────────

const MONTANT_RANGES = [
  { value: 'all',      label: 'Tous les montants',          test: (_: number) => true },
  { value: 'lt100k',   label: '< 100 000 FCFA',             test: (m: number) => m < 100_000 },
  { value: '100k_500k',label: '100 000 – 500 000 FCFA',     test: (m: number) => m >= 100_000 && m < 500_000 },
  { value: '500k_1m',  label: '500 000 – 1 000 000 FCFA',   test: (m: number) => m >= 500_000 && m < 1_000_000 },
  { value: 'gt1m',     label: '> 1 000 000 FCFA',           test: (m: number) => m >= 1_000_000 },
] as const;

function MontantFilterPopover({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: { montant_facture_ttc?: number | null }[];
}) {
  const [open, setOpen] = useState(false);
  const active = value !== 'all';

  const counts = MONTANT_RANGES.map(r =>
    r.value === 'all' ? rows.length : rows.filter(row => r.test(row.montant_facture_ttc ?? 0)).length
  );
  const maxCount = Math.max(...counts.slice(1), 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`group flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-150 outline-none
          ${active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <ListFilter className={`w-3 h-3 shrink-0 transition-colors ${active ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
          Montant TTC
          {active
            ? <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
            : <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-25 group-hover:opacity-60 transition-opacity" />}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={14}
        className="w-[300px] p-0 rounded-2xl border border-white/[0.1] bg-[#0c0e1a] shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden z-50">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <ListFilter className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-semibold text-slate-200 tracking-wide">Montant TTC</span>
          </div>
          {active && (
            <button onClick={() => { onChange('all'); setOpen(false); }}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />Effacer
            </button>
          )}
        </div>

        {/* Range options with mini distribution bars */}
        <div className="py-2">
          {MONTANT_RANGES.map((range, i) => {
            const count = counts[i];
            const isSelected = value === range.value;
            const barPct = range.value === 'all' ? 0 : (count / maxCount) * 100;
            return (
              <button key={range.value} onClick={() => { onChange(range.value); setOpen(false); }}
                className={`w-full px-4 py-2.5 transition-all duration-100
                  ${isSelected ? 'bg-amber-500/10 text-white' : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-100'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                      ${isSelected ? 'border-amber-400' : 'border-white/[0.18]'}`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </div>
                    <span className={`text-xs ${isSelected ? 'font-medium text-amber-300' : ''}`}>{range.label}</span>
                  </div>
                  {range.value !== 'all' && (
                    <span className={`text-[10px] tabular-nums shrink-0 ${isSelected ? 'text-amber-300/60' : 'text-slate-600'}`}>
                      {count.toLocaleString('fr-FR')}
                    </span>
                  )}
                </div>
                {/* Distribution bar */}
                {range.value !== 'all' && (
                  <div className="mt-1.5 ml-6 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ease-out ${isSelected ? 'bg-amber-400' : 'bg-white/[0.18]'}`}
                      style={{ width: `${barPct}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-white/[0.05] text-[10px] text-slate-700">
          {rows.length.toLocaleString('fr-FR')} factures au total
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

const Facturation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<AuditInvoice[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(searchParams.get('auditId') || null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<AuditInvoice | null>(null);
  const [isInvoiceViewOpen, setIsInvoiceViewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportConfigOpen, setIsExportConfigOpen] = useState(false);
  const [invoicesForExport, setInvoicesForExport] = useState<AuditInvoice[]>([]);
  const mockTimersRef = useRef<NodeJS.Timeout[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'single' | 'bulk' | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // SENELEC Excel import
  const [activeTab, setActiveTab] = useState<'ocr' | 'senelec' | 'simulateur' | 'quarantine'>('ocr');
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [senelecRows, setSenelecRows] = useState<FactureSenelec[]>([]);
  const [senelecLoading, setSenelecLoading] = useState(false);
  const [senelecSearch, setSenelecSearch] = useState('');
  const [senelecAuditFilter, setSenelecAuditFilter] = useState<string>('all');
  const [senelecAppartenanceFilter, setSenelecAppartenanceFilter] = useState<string>('all');
  const [senelecPartenaireFilter, setSenelecPartenaireFilter] = useState<string>('all');
  const [senelecCategorieFilter, setSenelecCategorieFilter] = useState<string>('all');
  const [senelecMontantRange, setSenelecMontantRange] = useState<string>('all');
  const [senelecPeriodeFilter, setSenelecPeriodeFilter] = useState<string>('all');
  const [senelecPage, setSenelecPage] = useState(1);

  useEffect(() => {
    loadData();
    return () => { mockTimersRef.current.forEach(clearTimeout); mockTimersRef.current = []; };
  }, [organization?.id]);

  useEffect(() => {
    if (!organization?.id || MOCK_MODE) return;
    const sub = supabase
      .channel(`audit_invoices:${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_invoices', filter: `organization_id=eq.${organization.id}` }, loadData)
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [organization?.id]);

  const loadData = async () => {
    if (MOCK_MODE) {
      setLoading(true);
      mockTimersRef.current.forEach(clearTimeout);
      mockTimersRef.current = [];
      const now = Date.now();
      const mock: AuditInvoice[] = [
        { id: 'mock-1', audit_id: 'audit-1', building_id: '', file_name: 'facture_HP_001.pdf', file_url: '', uploaded_by: 'user-1', invoice_date: new Date(now - 86400000).toISOString(), amount: 1200, supplier: 'EDF', status: 'processing', confidence_score: 67, ocr_data: {}, notes: '', created_at: new Date(now - 86400000).toISOString(), updated_at: new Date(now - 86400000).toISOString() },
        { id: 'mock-2', audit_id: 'audit-1', building_id: '', file_name: 'facture_HC_002.pdf', file_url: '', uploaded_by: 'user-1', invoice_date: new Date(now - 172800000).toISOString(), amount: 2400, supplier: 'ENGIE', status: 'pending', confidence_score: 0, ocr_data: {}, notes: '', created_at: new Date(now - 172800000).toISOString(), updated_at: new Date(now - 172800000).toISOString() },
      ];
      setInvoices(mock);
      setAudits([{ id: 'audit-1', name: 'Audit A', color: '#3b82f6' }, { id: 'audit-2', name: 'Audit B', color: '#10b981' }]);
      setLoading(false);
      mockTimersRef.current.push(setTimeout(() => setInvoices(p => p.map(i => i.id === 'mock-2' ? { ...i, status: 'verified', confidence_score: 92 } : i)), 6000));
      return;
    }

    if (!organization?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      const auditsList = await getAudits(organization.id);
      setAudits(auditsList || []);
      const all: AuditInvoice[] = [];
      for (const a of auditsList || []) {
        try { all.push(...await getAuditInvoices(a.id)); } catch { /* skip */ }
      }
      setInvoices(all);
      // Auto-verify any processing invoice whose OCR already captured all required fields
      autoVerifyProcessingInvoices(all, organization.id, (id) => {
        setInvoices((prev) => prev.map((inv) => inv.id === id ? { ...inv, status: 'verified' } : inv));
      }).catch(() => { /* silent — Realtime will reconcile */ });
    } catch { toast.error('Impossible de charger les factures'); }
    finally { setLoading(false); }
  };

  const loadSenelec = async () => {
    if (!organization?.id) return;
    setSenelecLoading(true);
    try {
      const rows = await getFacturesSenelec(organization.id);
      setSenelecRows(rows);
    } catch { /* silent — table may not exist yet */ }
    finally { setSenelecLoading(false); }
  };

  const handleExcelImport = async (
    rows: BillingRow[],
    auditId: string,
    summary?: { duplicatesRemoved: number; incoherentRemoved: number; redressedKept: number },
  ) => {
    if (!organization?.id) return;
    const { inserted } = await upsertFacturesSenelec(rows, organization.id, auditId);
    toast.success(`${inserted.toLocaleString('fr-FR')} facture${inserted > 1 ? 's' : ''} SENELEC importée${inserted > 1 ? 's' : ''}`);

    // Trace l'import + la déduplication / les redressements dans l'historique de l'audit.
    if (user?.id) {
      const dups = summary?.duplicatesRemoved ?? 0;
      const redressed = summary?.redressedKept ?? 0;
      const incoherent = summary?.incoherentRemoved ?? 0;
      const parts = [`${inserted} facture(s) importée(s)`];
      if (dups > 0) parts.push(`${dups} doublon(s) de n° facture supprimé(s)`);
      if (redressed > 0) parts.push(`${redressed} facture(s) redressée(s) conservée(s)`);
      if (incoherent > 0) parts.push(`${incoherent} facture(s) incohérente(s) écartée(s)`);
      logActivity(
        auditId, organization.id, user.id, 'invoice_imported',
        'Import SENELEC', parts.join(' · '),
        { inserted, duplicatesRemoved: dups, redressedKept: redressed, incoherentRemoved: incoherent, source: 'excel_senelec' },
      ).catch(() => { /* historique non bloquant */ });
    }

    await loadSenelec();
    setActiveTab('senelec');
  };

  useEffect(() => {
    if (activeTab === 'senelec' && organization?.id) loadSenelec();
  }, [activeTab, organization?.id]);

  useEffect(() => {
    setSenelecPage(1);
  }, [senelecSearch, senelecAuditFilter, senelecAppartenanceFilter, senelecPartenaireFilter, senelecCategorieFilter, senelecMontantRange, senelecPeriodeFilter]);

  const filteredInvoices = invoices.filter((inv) => {
    const matchAudit = !selectedAuditId || inv.audit_id === selectedAuditId;
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchSearch = !searchQuery ||
      inv.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchAudit && matchStatus && matchSearch;
  });

  const sortedInvoices = (() => {
    const s = [...filteredInvoices];
    if (!sortConfig) return s;
    return s.sort((a, b) => {
      let av: any, bv: any;
      if (sortConfig.key === 'amount') { av = a.amount ?? 0; bv = b.amount ?? 0; }
      else if (sortConfig.key === 'date') { av = a.invoice_date ? new Date(a.invoice_date).getTime() : 0; bv = b.invoice_date ? new Date(b.invoice_date).getTime() : 0; }
      else if (sortConfig.key === 'supplier') { av = (a.supplier ?? '').toLowerCase(); bv = (b.supplier ?? '').toLowerCase(); }
      else if (sortConfig.key === 'filename') { av = a.file_name.toLowerCase(); bv = b.file_name.toLowerCase(); }
      else if (sortConfig.key === 'status') { av = a.status; bv = b.status; }
      else return 0;
      return av < bv ? (sortConfig.direction === 'asc' ? -1 : 1) : av > bv ? (sortConfig.direction === 'asc' ? 1 : -1) : 0;
    });
  })();

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? prev.direction === 'desc' ? { key, direction: 'asc' } : null
        : { key, direction: 'desc' }
    );
  };

  const toggleSelect = (id: string) => setSelectedInvoices(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => setSelectedInvoices(
    selectedInvoices.size === sortedInvoices.length && sortedInvoices.length > 0
      ? new Set() : new Set(sortedInvoices.map(i => i.id))
  );

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteConfirmType === 'single' && pendingDeleteId) {
        await deleteInvoice(pendingDeleteId);
        toast.success('Facture supprimée');
      } else if (deleteConfirmType === 'bulk') {
        for (const id of selectedInvoices) await deleteInvoice(id);
        setSelectedInvoices(new Set());
        toast.success(`${selectedInvoices.size} facture(s) supprimée(s)`);
      }
      await loadData();
    } catch { toast.error('Erreur lors de la suppression'); }
    finally { setIsDeleting(false); setDeleteConfirmOpen(false); setDeleteConfirmType(null); setPendingDeleteId(null); }
  };

  const handleExportSelected = () => {
    if (!selectedInvoices.size) { toast.error('Sélectionnez au moins une facture'); return; }
    // Only pass verified invoices to the dialog — unverified won't be exported anyway
    const candidates = sortedInvoices.filter(
      (inv) => selectedInvoices.has(inv.id) && inv.status === 'verified',
    );
    if (candidates.length === 0) {
      toast.error('Aucune facture vérifiée dans la sélection');
      return;
    }
    setInvoicesForExport(candidates);
    setIsExportConfigOpen(true);
  };

  const handleExportWithFields = async (orderedFields: string[]) => {
    setIsExporting(true);
    try {
      await exportVerifiedInvoicesToExcel(invoicesForExport, undefined, orderedFields);
      toast.success(`${invoicesForExport.length} facture${invoicesForExport.length > 1 ? 's' : ''} exportée${invoicesForExport.length > 1 ? 's' : ''}`);
      setIsExportConfigOpen(false);
      setSelectedInvoices(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur export'); }
    finally { setIsExporting(false); }
  };

  const totalAmount = filteredInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const verifiedCount = filteredInvoices.filter(i => i.status === 'verified').length;
  const processingCount = invoices.filter(i => i.status === 'pending' || i.status === 'processing').length;
  const formatXOF = (n?: number) => {
    if (!n && n !== 0) return '0';
    return Math.round(n).toLocaleString('fr-FR');
  };
  const amountKpi = { value: Math.round(totalAmount).toLocaleString('fr-FR'), sub: 'FCFA' };

  const getAuditName = (id: string) => audits.find(a => a.id === id)?.name ?? '—';

  // Extract a value from OCR form data using the same normalization as the annotation service.
  const getOcrValue = (ocrData: unknown, aliases: string[]): string | null => {
    if (!ocrData || typeof ocrData !== 'object') return null;
    const d = ocrData as Record<string, unknown>;
    let forms: Array<{ Key: string; Value: string }> = [];
    const pages = d.pages as Array<{ forms?: Array<{ Key: string; Value: string }> }> | undefined;
    if (Array.isArray(pages) && pages[0]?.forms) forms = pages[0].forms;
    else {
      const page = d.page as Array<{ forms?: Array<{ Key: string; Value: string }> }> | undefined;
      if (Array.isArray(page) && page[0]?.forms) forms = page[0].forms;
      else if (Array.isArray(d.forms)) forms = d.forms as Array<{ Key: string; Value: string }>;
    }
    const norm = (s: string) =>
      s.toLowerCase().trim()
        .replace(/\s*:\s*$/, '')
        .replace(/[°º()[\],.%²¹³'"`/]/g, ' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    for (const alias of aliases) {
      const match = forms.find((f) => norm(f.Key) === norm(alias));
      if (match?.Value?.trim()) return match.Value.trim();
    }
    return null;
  };

  const verifiedCount_total = invoices.filter(i => i.status === 'verified').length;
  const senelecTotal = senelecRows.reduce((s, r) => s + (r.montant_facture_ttc ?? 0), 0);

  return (
    <div className="space-y-5 rounded-3xl border border-white/10 bg-[#0b0d14] p-4 sm:p-6 text-slate-50 shadow-2xl">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Facturation</h1>
          <p className="mt-0.5 text-sm text-slate-400">Gestion et suivi des factures des audits</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === 'ocr' && (
            <>
              <Button variant="ghost" onClick={() => navigate('/annotation')}
                className="border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white text-sm h-9 px-4">
                <ScanLine className="mr-2 h-4 w-4" />
                Annoter
              </Button>
              <Button onClick={() => setIsImportDialogOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm h-9 px-4">
                <Upload className="mr-2 h-4 w-4" />
                Importer
              </Button>
            </>
          )}
          {activeTab === 'senelec' && (
            <Button variant="ghost" onClick={() => setIsExcelImportOpen(true)}
              className="border border-emerald-500/30 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 text-sm h-9 px-4">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import Excel
            </Button>
          )}
        </div>
      </div>

      {/* ── Zone separator ── */}
      <div className="h-px bg-white/[0.06] -mx-4 sm:-mx-6" />

      {/* ── Navigation ── */}
      {activeTab !== 'simulateur' && activeTab !== 'quarantine' ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.018] overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-stretch lg:divide-x lg:divide-white/[0.07]">

            {/* ── Sources de données ── */}
            <div className="flex-1 p-4 lg:p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-1 h-3 rounded-full bg-slate-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Sources de données
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">

                {/* Source card — Factures OCR */}
                <button
                  onClick={() => setActiveTab('ocr')}
                  className={`flex-1 flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 group
                    ${activeTab === 'ocr'
                      ? 'bg-gradient-to-br from-amber-500/[0.13] to-amber-600/[0.05] border-amber-500/35 shadow-lg shadow-amber-900/15'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 transition-colors
                    ${activeTab === 'ocr' ? 'bg-amber-500/20' : 'bg-white/[0.05] group-hover:bg-white/[0.08]'}`}>
                    <FileText className={`h-4 w-4 ${activeTab === 'ocr' ? 'text-amber-400' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${activeTab === 'ocr' ? 'text-amber-300' : 'text-slate-300'}`}>
                        Factures OCR
                      </p>
                      {invoices.length > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 tabular-nums shrink-0
                          ${activeTab === 'ocr' ? 'bg-amber-500/25 text-amber-300' : 'bg-white/[0.08] text-slate-500'}`}>
                          {invoices.length}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 truncate
                      ${activeTab === 'ocr' ? 'text-amber-400/60' : 'text-slate-600'}`}>
                      {invoices.length === 0
                        ? 'Aucune facture importée'
                        : `${verifiedCount_total} vérifiée${verifiedCount_total !== 1 ? 's' : ''} · PDF → OCR`}
                    </p>
                  </div>
                  {activeTab === 'ocr' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 self-center" />
                  )}
                </button>

                {/* Source card — Données SENELEC */}
                <button
                  onClick={() => setActiveTab('senelec')}
                  className={`flex-1 flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 group
                    ${activeTab === 'senelec'
                      ? 'bg-gradient-to-br from-emerald-500/[0.13] to-emerald-600/[0.05] border-emerald-500/35 shadow-lg shadow-emerald-900/15'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 transition-colors
                    ${activeTab === 'senelec' ? 'bg-emerald-500/20' : 'bg-white/[0.05] group-hover:bg-white/[0.08]'}`}>
                    <Database className={`h-4 w-4 ${activeTab === 'senelec' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${activeTab === 'senelec' ? 'text-emerald-300' : 'text-slate-300'}`}>
                        Données SENELEC
                      </p>
                      {senelecRows.length > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 tabular-nums shrink-0
                          ${activeTab === 'senelec' ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/[0.08] text-slate-500'}`}>
                          {senelecRows.length.toLocaleString('fr-FR')}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 truncate
                      ${activeTab === 'senelec' ? 'text-emerald-400/60' : 'text-slate-600'}`}>
                      {senelecRows.length === 0
                        ? 'Aucune donnée importée'
                        : `${Math.round(senelecTotal).toLocaleString('fr-FR')} FCFA · Excel SENELEC`}
                    </p>
                  </div>
                  {activeTab === 'senelec' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 self-center" />
                  )}
                </button>

              </div>
            </div>

            {/* ── Mobile divider ── */}
            <div className="h-px bg-white/[0.07] mx-4 lg:hidden" />

            {/* ── Outils ── */}
            <div className="p-4 lg:p-5 lg:w-52">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-1 h-3 rounded-full bg-slate-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Outils
                </span>
              </div>
              <div className="flex sm:flex-row lg:flex-col gap-2">
                <button
                  onClick={() => setActiveTab('simulateur')}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border
                    bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] hover:border-white/[0.12]
                    flex-1 lg:flex-none justify-center"
                >
                  <Calculator className="h-4 w-4 text-slate-500" />
                  <span>Simulateur</span>
                  <TrendingUp className="h-3.5 w-3.5 text-slate-600" />
                </button>
                <button
                  onClick={() => setActiveTab('quarantine')}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border
                    justify-center flex-1 lg:flex-none
                    ${activeTab === 'quarantine'
                      ? 'bg-orange-500/[0.12] border-orange-500/30 text-orange-300'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] hover:border-white/[0.12]'
                    }`}
                >
                  <ShieldAlert className={`h-4 w-4 ${activeTab === 'quarantine' ? 'text-orange-400' : 'text-slate-500'}`} />
                  <span>Quarantaine</span>
                  {quarantineCount > 0 && (
                    <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums
                      ${activeTab === 'quarantine' ? 'bg-orange-500/30 text-orange-200' : 'bg-orange-500/20 text-orange-400'}`}>
                      {quarantineCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Simulateur / Quarantaine mode: compact back nav ── */
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('ocr')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Retour aux factures</span>
          </button>
          <span className="text-white/[0.08]">·</span>
          {activeTab === 'simulateur' ? (
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/15">
                <Calculator className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-violet-300">Simulateur de vérification</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/15">
                <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
              </div>
              <span className="text-sm font-semibold text-orange-300">Quarantaine factures</span>
              {quarantineCount > 0 && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-orange-500/20 text-orange-400">
                  {quarantineCount} anomalie{quarantineCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ TAB: OCR ══════════════════════════ */}
      {activeTab === 'ocr' && <>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Total factures" value={`${filteredInvoices.length}`}
          sub={processingCount > 0 ? `${processingCount} en traitement` : undefined}
          icon={<FileText className="w-12 h-12" />} />
        <KpiCard label="Montant total" value={amountKpi.value}
          sub={amountKpi.sub}
          icon={<DollarSign className="w-12 h-12" />} accent />
        <KpiCard label="Vérifiées" value={`${verifiedCount}`}
          sub={`sur ${filteredInvoices.length}`}
          icon={<CheckCircle2 className="w-12 h-12" />} />
      </div>

      {/* ── Processing banner ── */}
      {processingCount > 0 && (
        <div className="flex items-center gap-4 rounded-xl bg-amber-500/8 border border-amber-500/20 px-5 py-4">
          <div className="p-2 rounded-lg bg-amber-500/15">
            <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              {processingCount} facture{processingCount > 1 ? 's' : ''} en cours de traitement
            </p>
            <p className="text-xs text-amber-400/60 mt-0.5">
              Le résultat OCR apparaîtra automatiquement — rafraîchissement en temps réel
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400"
                style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col md:flex-row gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
        <Input placeholder="Rechercher par nom ou fournisseur…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-amber-500/40 h-9 text-sm" />
        <div className="flex gap-3 flex-wrap">
          <Select value={selectedAuditId ?? 'all'} onValueChange={v => setSelectedAuditId(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[200px] h-9 text-sm bg-white/5 border-white/10 text-slate-200 hover:bg-white/8">
              <SelectValue placeholder="Tous les audits" />
            </SelectTrigger>
            <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
              <SelectItem value="all">Tous les audits</SelectItem>
              {audits.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm bg-white/5 border-white/10 text-slate-200 hover:bg-white/8">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="processing">En traitement</SelectItem>
              <SelectItem value="verified">Vérifiée</SelectItem>
              <SelectItem value="rejected">Rejetée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#0d1018] overflow-hidden">

        {/* Bulk action bar */}
        {selectedInvoices.size > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07] bg-amber-500/8">
            <span className="text-sm font-medium text-amber-300">
              {selectedInvoices.size} sélectionnée{selectedInvoices.size > 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleExportSelected} disabled={isExporting}
                className="h-7 px-3 text-xs border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                {isExporting ? <><div className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin mr-1" />Export…</> : <><Download className="w-3 h-3 mr-1" />Excel</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setDeleteConfirmType('bulk'); setDeleteConfirmOpen(true); }}
                className="h-7 px-3 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3 h-3 mr-1" />Supprimer
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
            <p className="text-sm text-slate-500">Chargement des factures…</p>
          </div>
        ) : sortedInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
              <LayoutGrid className="h-10 w-10 text-slate-600" />
            </div>
            <p className="text-slate-300 font-medium">Aucune facture trouvée</p>
            <p className="text-sm text-slate-500">
              {invoices.length === 0 ? 'Importez des factures pour commencer' : 'Ajustez vos filtres'}
            </p>
            {invoices.length === 0 && (
              <Button onClick={() => setIsImportDialogOpen(true)} size="sm"
                className="mt-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold">
                <Upload className="w-4 h-4 mr-2" />Importer
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                <th className="w-10 px-5 py-3">
                  <input type="checkbox"
                    checked={selectedInvoices.size === sortedInvoices.length && sortedInvoices.length > 0}
                    onChange={toggleAll}
                    className="rounded border-white/20 bg-white/5 accent-amber-400 cursor-pointer" />
                </th>
                <SortTh label="Document" sortKey="filename" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                <SortTh label="Période" sortKey="date" sortConfig={sortConfig} onSort={handleSort} />
                <SortTh label="Montant TTC" sortKey="amount" sortConfig={sortConfig} onSort={handleSort} />
                <SortTh label="Statut" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map((invoice) => {
                const st = getStatus(invoice.status);
                const isSelected = selectedInvoices.has(invoice.id);
                const audit = audits.find(a => a.id === invoice.audit_id);
                const score = invoice.confidence_score ?? 0;
                const scoreColor = score >= 85 ? '#34d399' : score >= 65 ? '#f59e0b' : score > 0 ? '#fb923c' : 'transparent';

                // Values extracted from OCR data
                const clientName = getOcrValue(invoice.ocr_data, [
                  'NOM OU RAISON SOCIALE', 'NOM_OU_RAISON_SOCIALE', 'NOM RAISON SOCIALE', 'RAISON SOCIALE',
                ]);
                const periodeDu = getOcrValue(invoice.ocr_data, ['PERIODE DU', 'PERIODE_DU']);
                const periodeAu = getOcrValue(invoice.ocr_data, ['PERIODE AU', 'PERIODE_AU', 'AU']);
                const nbrJours = getOcrValue(invoice.ocr_data, [
                  'NOMBRE DE JOURS (N)', 'NOMBRE DE JOURS', 'NOMBRE DE OURS (N)', 'NBR_JOURS',
                ]);
                const conso = getOcrValue(invoice.ocr_data, [
                  'CONSOMMATION (KWH)', 'CONSOMMATION KWH', 'CONSOMMATION', 'CONSOMMATION_KWH',
                ]);

                return (
                  <tr key={invoice.id}
                    className={`group border-b border-white/[0.04] transition-colors duration-100
                      hover:bg-white/[0.025] ${isSelected ? 'bg-amber-500/5' : ''}`}>

                    {/* Checkbox */}
                    <td className="px-5 py-4">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(invoice.id)}
                        className="rounded border-white/20 bg-white/5 accent-amber-400 cursor-pointer" />
                    </td>

                    {/* Document — amber left-border accent on hover */}
                    <td className="px-5 py-4 border-l-2 border-transparent group-hover:border-amber-500/40 transition-colors duration-150">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 shrink-0">
                          <FileText className="h-3.5 w-3.5 text-amber-500/60" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-100 truncate max-w-[180px] leading-snug">
                              {invoice.file_name}
                            </p>
                            {invoice.is_quarantined && (
                              <ShieldAlert className="h-3.5 w-3.5 text-orange-400 shrink-0" title={`En quarantaine — delta ${invoice.quarantine_delta_pct?.toFixed(1)}%`} />
                            )}
                          </div>
                          {audit && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: audit.color ?? '#64748b' }} />
                              <span className="text-[11px] text-slate-500 truncate">{audit.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Client — extracted from OCR or fallback to supplier */}
                    <td className="px-5 py-4 max-w-[200px]">
                      {clientName ? (
                        <p className="text-sm font-medium text-slate-200 truncate">{clientName}</p>
                      ) : invoice.supplier ? (
                        <p className="text-sm text-slate-400 truncate">{invoice.supplier}</p>
                      ) : (
                        <span className="text-slate-600 text-sm">—</span>
                      )}
                      {conso && (
                        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {conso} <span className="text-slate-600">kWh</span>
                        </p>
                      )}
                    </td>

                    {/* Période — DU → AU from OCR, fallback to invoice_date */}
                    <td className="px-5 py-4">
                      {(periodeDu || periodeAu) ? (
                        <div className="font-mono text-[11px] space-y-0.5 leading-relaxed">
                          {periodeDu && <p className="text-slate-300">{periodeDu}</p>}
                          {(periodeDu && periodeAu) && (
                            <p className="text-[9px] text-slate-600 leading-none pl-0.5">↓</p>
                          )}
                          {periodeAu && <p className="text-slate-300">{periodeAu}</p>}
                          {nbrJours && (
                            <p className="text-[10px] text-amber-500/60 font-sans">{nbrJours} jours</p>
                          )}
                        </div>
                      ) : invoice.invoice_date ? (
                        <p className="text-sm text-slate-400 tabular-nums">
                          {format(new Date(invoice.invoice_date), 'dd MMM yyyy', { locale: fr })}
                        </p>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Montant TTC */}
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-50 tracking-tight">
                        {formatXOF(invoice.amount)}
                        <span className="text-[10px] font-normal text-slate-500 ml-1">FCFA</span>
                      </p>
                      {invoice.invoice_date && (
                        <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                          {format(new Date(invoice.invoice_date), 'dd/MM/yy')}
                        </p>
                      )}
                    </td>

                    {/* Statut + OCR confidence bar */}
                    <td className="px-5 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                          <Badge variant="outline"
                            className={`text-[11px] border px-2 py-0 h-5 font-medium ${st.cls}`}>
                            {st.label}
                          </Badge>
                        </div>
                        {score > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="h-[3px] w-16 rounded-full bg-white/[0.07] overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${score}%`, backgroundColor: scoreColor }} />
                            </div>
                            <span className="text-[10px] tabular-nums font-mono"
                              style={{ color: scoreColor }}>{score}%</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button size="sm" variant="ghost" title="Voir la facture"
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-100 hover:bg-white/10 rounded-lg"
                          onClick={() => { setSelectedInvoiceForView(invoice); setIsInvoiceViewOpen(true); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Annoter"
                          className="h-7 w-7 p-0 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg"
                          onClick={() => navigate(`/annotation?auditId=${invoice.audit_id}`)}>
                          <ScanLine className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Supprimer"
                          className="h-7 w-7 p-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                          onClick={() => { setPendingDeleteId(invoice.id); setDeleteConfirmType('single'); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      </> /* end TAB: OCR */}

      {/* ══════════════════════════ TAB: SENELEC ══════════════════════ */}
      {activeTab === 'senelec' && (
        <div className="space-y-4">
          {/* Search + project filter */}
          <div className="flex flex-col md:flex-row gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <Input
              placeholder="Rechercher par partenaire, appartenance…"
              value={senelecSearch}
              onChange={e => setSenelecSearch(e.target.value)}
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500/40 h-9 text-sm"
            />
            <div className="flex items-center gap-2">
              <Select value={senelecAuditFilter} onValueChange={setSenelecAuditFilter}>
                <SelectTrigger className="w-[200px] h-9 text-sm bg-white/5 border-white/10 text-slate-200 hover:bg-white/8">
                  <SelectValue placeholder="Tous les projets" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                  <SelectItem value="all">Tous les projets</SelectItem>
                  {audits.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {(senelecAppartenanceFilter !== 'all' || senelecPartenaireFilter !== 'all' || senelecCategorieFilter !== 'all' || senelecMontantRange !== 'all' || senelecPeriodeFilter !== 'all') && (
                <button
                  onClick={() => { setSenelecAppartenanceFilter('all'); setSenelecPartenaireFilter('all'); setSenelecCategorieFilter('all'); setSenelecMontantRange('all'); setSenelecPeriodeFilter('all'); }}
                  className="flex items-center gap-1.5 h-9 px-3 text-[11px] text-slate-500 hover:text-red-400 border border-white/[0.07] rounded-lg bg-white/[0.02] hover:bg-red-500/[0.06] hover:border-red-500/20 transition-all"
                >
                  <X className="w-3 h-3" />Effacer filtres
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1018] overflow-hidden">
            {senelecLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                <p className="text-sm text-slate-500">Chargement des données SENELEC…</p>
              </div>
            ) : senelecRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="p-4 rounded-2xl bg-white/[0.04]">
                  <FileSpreadsheet className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 text-sm font-medium">Aucune donnée SENELEC importée</p>
                <p className="text-slate-600 text-xs max-w-xs">
                  Utilisez le bouton <span className="text-emerald-400 font-medium">Import Excel</span> pour charger vos fichiers de facturation SENELEC
                </p>
                <Button size="sm" onClick={() => setIsExcelImportOpen(true)}
                  className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-4">
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  Importer un fichier Excel
                </Button>
              </div>
            ) : (() => {
              const filtered = senelecRows.filter(r => {
                const q = senelecSearch.toLowerCase();
                const matchSearch = !q ||
                  (r.partenaire?.toLowerCase().includes(q) ?? false) ||
                  (r.appartenance?.toLowerCase().includes(q) ?? false);
                const matchAudit = senelecAuditFilter === 'all' || r.audit_id === senelecAuditFilter;
                const matchAppartenance = senelecAppartenanceFilter === 'all' || r.appartenance === senelecAppartenanceFilter;
                const matchPartenaire = senelecPartenaireFilter === 'all' || r.partenaire === senelecPartenaireFilter;
                const matchCategorie = senelecCategorieFilter === 'all' || r.categorie_tarifaire === senelecCategorieFilter;
                const matchMontant = (() => {
                  if (senelecMontantRange === 'all') return true;
                  const m = r.montant_facture_ttc ?? 0;
                  if (senelecMontantRange === 'lt100k') return m < 100_000;
                  if (senelecMontantRange === '100k_500k') return m >= 100_000 && m < 500_000;
                  if (senelecMontantRange === '500k_1m') return m >= 500_000 && m < 1_000_000;
                  if (senelecMontantRange === 'gt1m') return m >= 1_000_000;
                  return true;
                })();
                const matchPeriode = senelecPeriodeFilter === 'all' ||
                  (r.date_debut_periode != null && new Date(r.date_debut_periode).getFullYear().toString() === senelecPeriodeFilter);
                return matchSearch && matchAudit && matchAppartenance && matchPartenaire && matchCategorie && matchMontant && matchPeriode;
              });

              const totalPages = Math.max(1, Math.ceil(filtered.length / SENELEC_PAGE_SIZE));
              const safePage = Math.min(senelecPage, totalPages);
              const paginated = filtered.slice((safePage - 1) * SENELEC_PAGE_SIZE, safePage * SENELEC_PAGE_SIZE);

              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#0d1018] border-b border-white/[0.07]">
                        <tr>
                          {/* Appartenance — filterable */}
                          <th className="px-5 py-3 text-left whitespace-nowrap">
                            <ColumnFilterPopover
                              label="Appartenance"
                              value={senelecAppartenanceFilter}
                              onChange={setSenelecAppartenanceFilter}
                              searchable
                              accent="emerald"
                              options={[
                                { value: 'all', label: 'Toutes les appartenances' },
                                ...[...new Set(senelecRows.map(r => r.appartenance).filter(Boolean) as string[])].sort()
                                  .map(v => ({ value: v, count: senelecRows.filter(r => r.appartenance === v).length })),
                              ]}
                            />
                          </th>
                          {/* Partenaire — filterable */}
                          <th className="px-5 py-3 text-left whitespace-nowrap">
                            <ColumnFilterPopover
                              label="Partenaire"
                              value={senelecPartenaireFilter}
                              onChange={setSenelecPartenaireFilter}
                              searchable
                              accent="emerald"
                              options={[
                                { value: 'all', label: 'Tous les partenaires' },
                                ...[...new Set(senelecRows.map(r => r.partenaire).filter(Boolean) as string[])].sort()
                                  .map(v => ({ value: v, count: senelecRows.filter(r => r.partenaire === v).length })),
                              ]}
                            />
                          </th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">N° Facture</th>
                          {/* Période — filterable by year */}
                          <th className="px-5 py-3 text-left whitespace-nowrap">
                            <ColumnFilterPopover
                              label="Période"
                              value={senelecPeriodeFilter}
                              onChange={setSenelecPeriodeFilter}
                              accent="emerald"
                              options={[
                                { value: 'all', label: 'Toutes les périodes' },
                                ...[...new Set(
                                  senelecRows
                                    .map(r => r.date_debut_periode ? new Date(r.date_debut_periode).getFullYear().toString() : null)
                                    .filter((y): y is string => y !== null)
                                )].sort().reverse().map(year => ({
                                  value: year,
                                  label: year,
                                  count: senelecRows.filter(r =>
                                    r.date_debut_periode != null &&
                                    new Date(r.date_debut_periode).getFullYear().toString() === year
                                  ).length,
                                })),
                              ]}
                            />
                          </th>
                          {/* Montant TTC — filterable */}
                          <th className="px-5 py-3 text-left whitespace-nowrap">
                            <MontantFilterPopover
                              value={senelecMontantRange}
                              onChange={setSenelecMontantRange}
                              rows={senelecRows}
                            />
                          </th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Consommation (kWh)</th>
                          {/* Catégorie — filterable */}
                          <th className="px-5 py-3 text-left whitespace-nowrap">
                            <ColumnFilterPopover
                              label="Catégorie"
                              value={senelecCategorieFilter}
                              onChange={setSenelecCategorieFilter}
                              accent="purple"
                              options={[
                                { value: 'all', label: 'Toutes les catégories' },
                                ...[...new Set(senelecRows.map(r => r.categorie_tarifaire).filter(Boolean) as string[])].sort()
                                  .map(v => ({ value: v, count: senelecRows.filter(r => r.categorie_tarifaire === v).length })),
                              ]}
                            />
                          </th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Agence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {paginated.length === 0 && (
                          <tr>
                            <td colSpan={8} className="text-center py-10 text-slate-600 text-sm">
                              Aucun résultat pour ces filtres
                            </td>
                          </tr>
                        )}
                        {paginated.map(r => (
                          <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-3 text-slate-300 max-w-[180px] truncate font-medium">{r.appartenance ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-400 max-w-[200px] truncate">{r.partenaire ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-400 tabular-nums">{r.numero_facture}</td>
                            <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                              {r.date_debut_periode
                                ? new Date(r.date_debut_periode).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
                                : '—'}
                              {r.date_fin_periode ? ` → ${new Date(r.date_fin_periode).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}` : ''}
                            </td>
                            <td className="px-5 py-3 tabular-nums text-amber-400 font-medium">
                              {r.montant_facture_ttc != null
                                ? Math.round(r.montant_facture_ttc).toLocaleString('fr-FR')
                                : '—'}
                              <span className="text-[10px] text-slate-600 ml-0.5">FCFA</span>
                            </td>
                            <td className="px-5 py-3 tabular-nums text-slate-300">
                              {r.consommation_facturee != null
                                ? r.consommation_facturee.toLocaleString('fr-FR')
                                : '—'}
                            </td>
                            <td className="px-5 py-3">
                              {r.categorie_tarifaire ? (
                                <Badge variant="outline"
                                  className={`text-[10px] px-1.5 py-0 h-4 border
                                    ${r.categorie_tarifaire.includes('Grande Puissance MT')
                                      ? 'border-purple-500/30 text-purple-400 bg-purple-500/8'
                                      : r.categorie_tarifaire.includes('Grande Puissance BT')
                                        ? 'border-blue-500/30 text-blue-400 bg-blue-500/8'
                                        : 'border-slate-500/30 text-slate-400'
                                    }`}>
                                  {r.categorie_tarifaire}
                                </Badge>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 text-slate-500">{r.agence ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Footer: count + pagination */}
                  <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-600">
                      {filtered.length.toLocaleString('fr-FR')} ligne{filtered.length !== 1 ? 's' : ''}
                      {filtered.length !== senelecRows.length && ` sur ${senelecRows.length.toLocaleString('fr-FR')}`}
                      {totalPages > 1 && (
                        <span className="text-slate-700 ml-1">
                          · page {safePage}/{totalPages} · {SENELEC_PAGE_SIZE} lignes/page
                        </span>
                      )}
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSenelecPage(1)}
                          disabled={safePage === 1}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-xs font-mono"
                        >
                          «
                        </button>
                        <button
                          onClick={() => setSenelecPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        {/* Page numbers */}
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                          let page: number;
                          if (totalPages <= 7) {
                            page = i + 1;
                          } else if (safePage <= 4) {
                            page = i < 6 ? i + 1 : totalPages;
                          } else if (safePage >= totalPages - 3) {
                            page = i === 0 ? 1 : totalPages - 5 + i;
                          } else {
                            const mid = [1, safePage - 1, safePage, safePage + 1, totalPages];
                            page = mid[Math.min(i, mid.length - 1)];
                          }
                          return (
                            <button
                              key={`pg-${page}-${i}`}
                              onClick={() => setSenelecPage(page)}
                              className={`h-7 min-w-[28px] px-1.5 rounded-md text-xs tabular-nums font-medium transition-colors
                                ${page === safePage
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'text-slate-500 hover:text-white hover:bg-white/[0.06]'
                                }`}
                            >
                              {page}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setSenelecPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSenelecPage(totalPages)}
                          disabled={safePage === totalPages}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-xs font-mono"
                        >
                          »
                        </button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════ TAB: SIMULATEUR ══════════════════════ */}
      {activeTab === 'simulateur' && (
        <SimulateurPanel
          invoices={invoices}
          audits={audits.map(a => ({ id: a.id, name: a.name }))}
          onQuarantineChange={() => { loadData(); setQuarantineCount(c => c + 1); }}
          organizationId={organization?.id}
        />
      )}

      {/* ══════════════════════════ TAB: QUARANTAINE ═════════════════════ */}
      {activeTab === 'quarantine' && (
        <QuarantinePanel onCountChange={setQuarantineCount} />
      )}

      {/* ── Delete dialog ── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-[#0d0f1a] border border-white/10 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmType === 'bulk' ? 'Supprimer les factures' : 'Supprimer la facture'}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {deleteConfirmType === 'bulk'
                ? `Supprimer ${selectedInvoices.size} facture(s) ? Action irréversible.`
                : 'Supprimer cette facture ? Action irréversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end mt-2">
            <AlertDialogCancel disabled={isDeleting}
              className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin mr-2" />Suppression…</> : 'Supprimer'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <ExportConfigDialog
        open={isExportConfigOpen}
        onOpenChange={setIsExportConfigOpen}
        invoices={invoicesForExport}
        onExport={handleExportWithFields}
        isExporting={isExporting}
      />
      <InvoiceImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}
        onImportComplete={() => { setIsImportDialogOpen(false); loadData(); }} />
      <InvoiceViewDialog invoice={selectedInvoiceForView} open={isInvoiceViewOpen} onOpenChange={setIsInvoiceViewOpen} />
      <BillingImportModal
        open={isExcelImportOpen}
        onOpenChange={setIsExcelImportOpen}
        onImportConfirmed={handleExcelImport}
      />
    </div>
  );
};

export default Facturation;
