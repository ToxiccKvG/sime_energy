import { AuditInvoiceStats, AuditInventoryStats } from '@/types/auditActivity';
import { TrendingUp, FileText, Package } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AuditKPISectionProps {
  invoiceStats: AuditInvoiceStats;
  inventoryStats: AuditInventoryStats;
  completionPercentage: number;
}

interface KpiCardProps {
  borderColor: string;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function KpiCard({ borderColor, icon, label, children }: KpiCardProps) {
  return (
    <div
      className={cn(
        'bg-gradient-to-br from-[#151825] to-[#121520] border border-slate-700/40 rounded-lg p-4 space-y-2 border-l-2',
        borderColor
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export function AuditKPISection({
  invoiceStats,
  inventoryStats,
  completionPercentage,
}: AuditKPISectionProps) {
  const invoiceProcessedPct =
    invoiceStats.total > 0
      ? Math.round((invoiceStats.processed / invoiceStats.total) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        Indicateurs clés
      </p>

      {/* Progression globale */}
      <KpiCard
        borderColor="border-l-cyan-500"
        icon={<TrendingUp className="w-3.5 h-3.5 text-cyan-400" />}
        label="Progression globale"
      >
        <div className="flex items-end gap-2">
          <span className="text-2xl font-mono font-bold text-slate-100">
            {completionPercentage}
          </span>
          <span className="text-sm text-slate-400 mb-0.5">%</span>
        </div>
        <Progress
          value={completionPercentage}
          className="h-1 bg-slate-700"
        />
      </KpiCard>

      {/* Factures SENELEC */}
      <KpiCard
        borderColor="border-l-amber-500"
        icon={<FileText className="w-3.5 h-3.5 text-amber-400" />}
        label="Factures SENELEC"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-2xl font-mono font-bold text-slate-100">
              {invoiceStats.total}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Traitées</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">
              {invoiceStats.processed}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Traitement</span>
            <span className="text-xs text-slate-400 tabular-nums">{invoiceProcessedPct}%</span>
          </div>
          <Progress value={invoiceProcessedPct} className="h-1 bg-slate-700" />
        </div>
        {invoiceStats.totalAmount > 0 && (
          <div className="pt-1 border-t border-slate-700/50">
            <p className="text-xs text-slate-500">Montant total reconnu</p>
            <p className="text-sm font-mono font-semibold text-slate-200">
              {invoiceStats.totalAmount.toLocaleString('fr-FR')} FCFA
            </p>
          </div>
        )}
      </KpiCard>

      {/* Inventaire */}
      <KpiCard
        borderColor="border-l-emerald-500"
        icon={<Package className="w-3.5 h-3.5 text-emerald-400" />}
        label="Inventaire"
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <p className="text-xs text-slate-500">Sites</p>
            <p className="text-2xl font-mono font-bold text-slate-100">
              {inventoryStats.totalSites}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Bâtiments</p>
            <p className="text-2xl font-mono font-bold text-slate-100">
              {inventoryStats.totalBuildings}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Équipements</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">
              {inventoryStats.totalEquipment}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pièces</p>
            <p className="text-2xl font-mono font-bold text-slate-100">
              {inventoryStats.totalRooms}
            </p>
          </div>
        </div>
      </KpiCard>
    </div>
  );
}
