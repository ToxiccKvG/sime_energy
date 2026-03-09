import { AuditInvoiceStats, AuditMeasureStats, AuditInventoryStats } from '@/types/auditActivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Activity, Package, TrendingUp, CheckCircle, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface AuditKPISectionProps {
  invoiceStats: AuditInvoiceStats;
  measureStats: AuditMeasureStats;
  inventoryStats: AuditInventoryStats;
  completionPercentage: number;
}

export function AuditKPISection({ 
  invoiceStats, 
  measureStats, 
  inventoryStats,
  completionPercentage 
}: AuditKPISectionProps) {
  const processedPercentage = invoiceStats.total > 0 
    ? Math.round((invoiceStats.processed / invoiceStats.total) * 100) 
    : 0;

  return (
    <div className="space-y-6 text-slate-50">
      <h3 className="text-lg font-semibold text-white">Indicateurs clés</h3>
      
      <div className="space-y-4">
        {/* Completion progress */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
              <TrendingUp className="h-4 w-4 text-primary" />
              Progression globale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Avancement</span>
              <span className="font-semibold text-white">{completionPercentage}%</span>
            </div>
            <Progress value={completionPercentage} className="h-2 bg-white/10" />
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
              <FileText className="h-4 w-4 text-primary" />
              Factures SENELEC
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-400">Total</div>
                <div className="text-2xl font-semibold text-white">{invoiceStats.total}</div>
              </div>
              <div>
                <div className="text-slate-400">Traitées</div>
                <div className="text-2xl font-semibold text-success">{invoiceStats.processed}</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Progression</span>
                <span className="font-medium text-white">{processedPercentage}%</span>
              </div>
              <Progress value={processedPercentage} className="h-1.5 bg-white/10" />
            </div>
            {invoiceStats.totalAmount > 0 && (
              <div className="border-t border-white/10 pt-2">
                <div className="text-xs text-slate-500">Montant total reconnu</div>
                <div className="text-xl font-semibold text-white">
                  {invoiceStats.totalAmount.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Measures */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
              <Activity className="h-4 w-4 text-chart-3" />
              Mesures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-400">Capteurs</div>
                <div className="text-2xl font-semibold text-white">{measureStats.totalSensors}</div>
              </div>
              <div>
                <div className="text-slate-400">Actifs</div>
                <div className="text-2xl font-semibold text-chart-3">{measureStats.activeSensors}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {measureStats.measurementCount.toLocaleString('fr-FR')} mesures collectées
            </div>
          </CardContent>
        </Card>

        {/* Inventory */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
              <Package className="h-4 w-4 text-chart-4" />
              Inventaire
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Sites</span>
                <span className="font-medium text-white">{inventoryStats.totalSites}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Bâtiments</span>
                <span className="font-medium text-white">{inventoryStats.totalBuildings}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Équipements</span>
                <span className="text-lg font-semibold text-white">{inventoryStats.totalEquipment}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status badge */}
        <Card className="border-success/20 bg-success/10 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-success">Aucune action en retard ✓</div>
                <div className="text-success/80 text-xs">Toutes les tâches sont à jour</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
