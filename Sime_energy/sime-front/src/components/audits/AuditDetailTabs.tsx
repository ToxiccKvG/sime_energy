import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Package,
  FileArchive,
  Zap,
  ArrowRight,
  SlidersHorizontal,
  BarChart2,
  FolderOpen,
  ScanLine,
  Sheet,
  PencilLine,
} from 'lucide-react';
import { SchemaDesignerStep } from '@/components/invoices/SchemaDesignerStep';
import { AuditBillingParams } from '@/pages/parametres/AuditBillingParams';
import { BillingHistorique } from '@/pages/parametres/BillingHistorique';
import { InvoiceClasseur } from '@/components/invoices/InvoiceClasseur';
import { DocumentsTab } from '@/components/audits/DocumentsTab';
import { getAuditInvoices, type AuditInvoice } from '@/lib/invoice-service';
import { getFacturesSenelec, type FactureSenelec } from '@/lib/factures-senelec-service';
import { useOrganization } from '@/context/OrganizationContext';
import { cn } from '@/lib/utils';

interface AuditDetailTabsProps {
  auditId: string;
  invoiceCount: number;
  equipmentCount: number;
  /** true si au moins 1 site/bâtiment/niveau/pièce/équipement existe pour cet audit */
  inventoryStarted: boolean;
}

// ─── Shared empty state ───────────────────────────────────────────────────────

function EmptyModule({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  actions,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-5',
          iconBg
        )}
        style={{ boxShadow: `0 0 32px ${iconColor}20` }}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-200 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-6">{subtitle}</p>
      <div className="flex items-center gap-3">{actions}</div>
    </div>
  );
}

// ─── Tab trigger style ────────────────────────────────────────────────────────

const triggerCls =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ' +
  'data-[state=active]:bg-[#151825] data-[state=active]:text-slate-100 data-[state=active]:shadow-sm ' +
  'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-300 ' +
  'border-0 h-auto';

// ─── Factures: source classification (UI-only, déduit du file_name) ───────────

type InvoiceSource = 'ocr' | 'excel' | 'manual' | 'other';

function deduceInvoiceSource(fileName?: string): InvoiceSource {
  const n = (fileName ?? '').trim().toLowerCase();
  if (n.startsWith('saisie manuelle')) return 'manual';
  if (n.endsWith('.pdf')) return 'ocr';
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return 'excel';
  return 'other';
}

const SOURCE_CONFIG: Record<InvoiceSource, { label: string; icon: React.ReactNode; className: string }> = {
  ocr:    { label: 'OCR',      icon: <ScanLine className="w-3 h-3" />,   className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  excel:  { label: 'Excel',    icon: <Sheet className="w-3 h-3" />,      className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  manual: { label: 'Manuelle', icon: <PencilLine className="w-3 h-3" />, className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  other:  { label: 'Autre',    icon: <FileText className="w-3 h-3" />,   className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:    { label: 'À vérifier', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  processing: { label: 'En cours',   className: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  verified:   { label: 'Vérifié',    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  rejected:   { label: 'Rejeté',     className: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const SOURCE_ORDER: InvoiceSource[] = ['ocr', 'manual', 'excel', 'other'];

const LIST_CAP = 50;

interface ClassifiedInvoice {
  id: string;
  source: InvoiceSource;
  title: string;
  subtitle: string;
  status?: string;
}

function classifyAuditInvoice(inv: AuditInvoice): ClassifiedInvoice {
  const dateStr = inv.invoice_date || inv.created_at;
  const parts = [
    inv.supplier || undefined,
    dateStr ? new Date(dateStr).toLocaleDateString('fr-FR') : undefined,
    typeof inv.amount === 'number' ? `${inv.amount.toLocaleString('fr-FR')} FCFA` : undefined,
  ].filter(Boolean);
  return {
    id: `ai-${inv.id}`,
    source: deduceInvoiceSource(inv.file_name),
    title: inv.file_name,
    subtitle: parts.join(' · '),
    status: inv.status,
  };
}

function classifySenelecInvoice(row: FactureSenelec): ClassifiedInvoice {
  const parts = [
    row.appartenance || row.agence || undefined,
    row.date_debut_periode ? new Date(row.date_debut_periode).toLocaleDateString('fr-FR') : undefined,
    typeof row.montant_facture_ttc === 'number' ? `${row.montant_facture_ttc.toLocaleString('fr-FR')} FCFA` : undefined,
  ].filter(Boolean);
  return {
    id: `fs-${row.id}`,
    source: 'excel',
    title: row.partenaire || row.numero_compte_contrat || `Facture ${row.numero_facture ?? ''}`.trim(),
    subtitle: parts.join(' · '),
  };
}

function FacturesTab({ auditId }: { auditId: string }) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [items, setItems] = useState<ClassifiedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<InvoiceSource | 'all'>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getAuditInvoices(auditId).catch((e) => { console.error('audit_invoices:', e); return [] as AuditInvoice[]; }),
      organization?.id
        ? getFacturesSenelec(organization.id, { auditId }).catch((e) => { console.error('factures_senelec:', e); return [] as FactureSenelec[]; })
        : Promise.resolve([] as FactureSenelec[]),
    ])
      .then(([ai, fs]) => {
        if (!active) return;
        setItems([
          ...(ai as AuditInvoice[]).map(classifyAuditInvoice),
          ...(fs as FactureSenelec[]).map(classifySenelecInvoice),
        ]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auditId, organization?.id]);

  const counts = useMemo(() => {
    const c: Record<InvoiceSource, number> = { ocr: 0, excel: 0, manual: 0, other: 0 };
    items.forEach((it) => { c[it.source]++; });
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (sourceFilter === 'all' ? items : items.filter((it) => it.source === sourceFilter)),
    [items, sourceFilter],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg bg-slate-800/40" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyModule
        icon={<FileText className="w-7 h-7 text-amber-400" />}
        iconBg="bg-amber-500/10"
        iconColor="#f59e0b"
        title="Aucune facture importée"
        subtitle="Importez vos factures SENELEC pour démarrer l'analyse OCR et le suivi de consommation."
        actions={
          <Button
            size="sm"
            onClick={() => navigate(`/facturation?auditId=${auditId}`)}
            className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/20 gap-1.5 text-xs"
          >
            Module Facturation
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        }
      />
    );
  }

  const availableSources = SOURCE_ORDER.filter((s) => counts[s] > 0);
  const shown = filtered.slice(0, LIST_CAP);
  const overflow = filtered.length - shown.length;

  return (
    <div className="space-y-4">
      {/* Filtres par source */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSourceFilter('all')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            sourceFilter === 'all'
              ? 'border-slate-500/50 bg-slate-700/50 text-slate-100'
              : 'border-slate-700/40 text-slate-400 hover:text-slate-200 hover:border-slate-600/50',
          )}
        >
          Toutes
          <span className="font-mono text-[10px] opacity-70">{items.length}</span>
        </button>
        {availableSources.map((src) => {
          const cfg = SOURCE_CONFIG[src];
          const active = sourceFilter === src;
          return (
            <button
              key={src}
              type="button"
              onClick={() => setSourceFilter(src)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                active ? cfg.className : 'border-slate-700/40 text-slate-400 hover:text-slate-200 hover:border-slate-600/50',
              )}
            >
              {cfg.icon}
              {cfg.label}
              <span className="font-mono text-[10px] opacity-70">{counts[src]}</span>
            </button>
          );
        })}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/facturation?auditId=${auditId}`)}
          className="ml-auto gap-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          Voir toutes
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Liste */}
      <div className="rounded-lg border border-slate-700/40 overflow-hidden divide-y divide-slate-700/30">
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">
            Aucune facture pour cette source.
          </p>
        ) : (
          shown.map((it) => {
            const srcCfg = SOURCE_CONFIG[it.source];
            const statusCfg = it.status ? STATUS_CONFIG[it.status] : undefined;
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                <FileText className="w-4 h-4 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{it.title}</p>
                  <p className="text-[11px] text-slate-500">{it.subtitle || '—'}</p>
                </div>
                <Badge variant="outline" className={cn('gap-1 text-[10px]', srcCfg.className)}>
                  {srcCfg.icon}
                  {srcCfg.label}
                </Badge>
                {statusCfg && (
                  <Badge variant="outline" className={cn('text-[10px]', statusCfg.className)}>
                    {statusCfg.label}
                  </Badge>
                )}
              </div>
            );
          })
        )}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => navigate(`/facturation?auditId=${auditId}`)}
            className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-slate-400 hover:bg-slate-800/30 hover:text-slate-200 transition-colors"
          >
            + {overflow.toLocaleString('fr-FR')} autre{overflow !== 1 ? 's' : ''} — voir toutes dans le module Facturation
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AuditDetailTabs({
  auditId,
  invoiceCount,
  equipmentCount,
  inventoryStarted,
}: AuditDetailTabsProps) {
  const navigate = useNavigate();

  return (
    <Tabs defaultValue="factures" className="w-full">
      {/* Custom pill-style tab bar */}
      <TabsList className="flex gap-1 p-1 bg-[#0a0c14] rounded-xl border border-slate-700/30 h-auto w-full justify-start overflow-x-auto">
        <TabsTrigger value="factures" className={triggerCls}>
          <FileText className="w-3.5 h-3.5" />
          Factures
          {invoiceCount > 0 && (
            <span className="ml-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
              {invoiceCount}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger value="analyse" className={triggerCls}>
          <BarChart2 className="w-3.5 h-3.5" />
          Analyse
          {invoiceCount > 0 && (
            <span className="ml-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
              {invoiceCount}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger value="classeur" className={triggerCls}>
          <FolderOpen className="w-3.5 h-3.5" />
          Classeur
          {invoiceCount > 0 && (
            <span className="ml-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
              {invoiceCount}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger value="schema" className={triggerCls}>
          <Zap className="w-3.5 h-3.5" />
          Schéma électrique
        </TabsTrigger>

        <TabsTrigger value="inventaire" className={triggerCls}>
          <Package className="w-3.5 h-3.5" />
          Inventaire
          {inventoryStarted && (
            <span className="ml-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
              {equipmentCount > 0 ? equipmentCount : '✓'}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger value="documents" className={triggerCls}>
          <FileArchive className="w-3.5 h-3.5" />
          Documents
        </TabsTrigger>

        <TabsTrigger value="parametres" className={triggerCls}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Paramètres
        </TabsTrigger>
      </TabsList>

      <div className="mt-6">
        {/* ── Factures ── */}
        <TabsContent value="factures" className="mt-0">
          <FacturesTab auditId={auditId} />
        </TabsContent>

        {/* ── Analyse historique ── */}
        <TabsContent value="analyse" className="mt-0">
          <BillingHistorique auditId={auditId} />
        </TabsContent>

        {/* ── Classeur spatial ── */}
        <TabsContent value="classeur" className="mt-0">
          <InvoiceClasseur auditId={auditId} />
        </TabsContent>

        {/* ── Schéma électrique ── */}
        <TabsContent value="schema" className="mt-0">
          <SchemaDesignerStep measureFiles={[]} onHierarchyGenerated={() => {}} />
        </TabsContent>

        {/* ── Inventaire ── */}
        <TabsContent value="inventaire" className="mt-0">
          {inventoryStarted ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                <span className="font-mono text-emerald-300 font-bold">{equipmentCount}</span> équipement{equipmentCount !== 1 ? 's' : ''} répertorié{equipmentCount !== 1 ? 's' : ''}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate(`/inventaire?auditId=${auditId}`)}
                className="gap-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Gérer l'inventaire
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <EmptyModule
              icon={<Package className="w-7 h-7 text-emerald-400" />}
              iconBg="bg-emerald-500/10"
              iconColor="#10b981"
              title="Inventaire non démarré"
              subtitle="Constituez le cadastre énergétique de vos sites — bâtiments, étages, pièces et équipements."
              actions={
                <Button
                  size="sm"
                  onClick={() => navigate(`/inventaire?auditId=${auditId}`)}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/20 gap-1.5 text-xs"
                >
                  Module Inventaire
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              }
            />
          )}
        </TabsContent>

        {/* ── Documents ── */}
        <TabsContent value="documents" className="mt-0">
          <DocumentsTab auditId={auditId} />
        </TabsContent>

        {/* ── Paramètres SENELEC ── */}
        <TabsContent value="parametres" className="mt-0">
          <AuditBillingParams auditId={auditId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
