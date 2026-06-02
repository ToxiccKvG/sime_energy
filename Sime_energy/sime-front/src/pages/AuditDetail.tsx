import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuditHeader } from '@/components/audits/AuditHeader';
import { AuditKPISection } from '@/components/audits/AuditKPISection';
import { AuditQuickActions } from '@/components/audits/AuditQuickActions';
import { AuditDetailTabs } from '@/components/audits/AuditDetailTabs';
import { AuditActivityTimeline } from '@/components/audits/AuditActivityTimeline';
import { AddActivityDialog } from '@/components/audits/AddActivityDialog';
import { Audit } from '@/types/audit';
import { AuditInvoiceStats, AuditInventoryStats } from '@/types/auditActivity';
import { getAudit, getAuditSites, getAuditBuildings, updateAudit, computeAuditCompletion } from '@/lib/audit-service';
import { getInventoryCountsByAudit } from '@/lib/inventory-service';
import { getInvoiceStats } from '@/lib/invoice-service';
import { getAuditActivity, logActivity, deleteActivity } from '@/lib/activity-service';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import type { AuditActivityLog } from '@/lib/activity-service';

const AuditDetail = () => {
  const { auditId } = useParams();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [activities, setActivities] = useState<AuditActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [inventoryStats, setInventoryStats] = useState<AuditInventoryStats>({
    totalSites: 0,
    totalBuildings: 0,
    totalFloors: 0,
    totalRooms: 0,
    totalEquipment: 0,
  });
  const [invoiceStats, setInvoiceStats] = useState<AuditInvoiceStats>({
    total: 0,
    uploaded: 0,
    processed: 0,
    verified: 0,
    totalAmount: 0,
    averageConfidence: 0,
  });
  // Fetch real audit data based on auditId
  useEffect(() => {
    const loadAuditData = async () => {
      if (!auditId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch audit details
        const auditData = await getAudit(auditId);
        if (!auditData) {
          toast.error('Audit non trouvé');
          setLoading(false);
          return;
        }

        // Transform database format to Audit type
        const transformedAudit: Audit = {
          id: auditData.id,
          name: auditData.name,
          color: auditData.color,
          status: auditData.status,
          startDate: auditData.start_date,
          endDate: auditData.end_date,
          completionPercentage: auditData.completion_percentage,
          responsable: auditData.responsable,
          generalInfo: auditData.general_info || {},
          personnel: auditData.personnel || {},
          capacites: { usines: [] },
          createdAt: auditData.created_at,
          updatedAt: auditData.updated_at,
          createdBy: auditData.created_by,
        };

        // Fetch sites and buildings for inventory stats
        const sites = await getAuditSites(auditId);
        const totalSites = sites?.length || 0;
        let totalBuildings = 0;

        if (sites && sites.length > 0) {
          for (const site of sites) {
            const buildings = await getAuditBuildings(site.id);
            totalBuildings += buildings?.length || 0;
          }
        }

        let totalEquipment = 0;
        let totalLevels = 0;
        let totalRooms = 0;
        try {
          const counts = await getInventoryCountsByAudit(auditId);
          totalEquipment = counts.equipment;
          totalLevels = counts.levels;
          totalRooms = counts.rooms;
        } catch (e) {
          console.error('[AuditDetail] Inventory counts fetch error:', e);
        }

        setInventoryStats({
          totalSites,
          totalBuildings,
          totalFloors: totalLevels,
          totalRooms,
          totalEquipment,
        });

        // Compute and persist completion percentage
        const completion = computeAuditCompletion(auditData, {
          totalSites,
          totalBuildings,
          totalEquipment,
        });
        if (completion !== auditData.completion_percentage) {
          transformedAudit.completionPercentage = completion;
          updateAudit(auditId, { completionPercentage: completion }).catch(() => {});
        }
        setAudit(transformedAudit);

        // Fetch invoices and get stats
        try {
          const invoiceStatsData = await getInvoiceStats(auditId);
          setInvoiceStats(invoiceStatsData);
        } catch (e) {
          console.warn('Error loading invoice stats:', e);
        }

        // Fetch activity log
        try {
          const activitiesData = await getAuditActivity(auditId);
          setActivities(activitiesData);
        } catch (e) {
          console.warn('Error loading activities:', e);
        }
      } catch (error) {
        console.error('Error loading audit:', error);
        toast.error("Impossible de charger les détails de l'audit");
      } finally {
        setLoading(false);
      }
    };

    loadAuditData();
  }, [auditId]);

  const handleAddActivity = () => {
    setIsActivityDialogOpen(true);
  };

  const handleActivitySubmit = async (data: { title: string; description: string; date: string }) => {
    if (!audit || !user || !organization) {
      toast.error('Informations manquantes pour créer une activité');
      return;
    }

    try {
      setSaving(true);

      const result = await logActivity(
        audit.id,
        organization.id,
        user.id,
        'custom',
        data.title,
        data.description,
        { recorded_date: data.date }
      );

      if (!result) {
        throw new Error('Impossible de créer l\'activité');
      }

      // Reload activities
      const activitiesData = await getAuditActivity(audit.id);
      setActivities(activitiesData);
      toast.success('Activité ajoutée avec succès');
    } catch (error) {
      console.error('Error adding activity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error(`Impossible d'ajouter l'activité: ${errorMessage}`);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await deleteActivity(activityId);
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
      toast.success('Activité supprimée');
    } catch (error) {
      toast.error('Impossible de supprimer l\'activité');
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c14] text-slate-200">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-700/50 bg-[#0f111a] px-6 py-8">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-400">Chargement de l'audit...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c14] text-slate-200">
        <div className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0f111a] px-8 py-10 text-center">
          <p className="text-base font-medium text-white">Audit non trouvé</p>
          <p className="text-sm text-slate-400">
            L'audit que vous recherchez n'existe pas ou a été supprimé
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#0a0c14] px-4 py-4 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-4 md:space-y-6 text-slate-100"
      style={{
        backgroundImage: `radial-gradient(circle, rgba(148,163,184,0.04) 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }}
    >
      <AuditHeader audit={audit} />

      {/* KPIs full width */}
      <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
        <AuditKPISection
          invoiceStats={invoiceStats}
          inventoryStats={inventoryStats}
          completionPercentage={audit.completionPercentage}
        />
      </div>

      {/* Modules — section principale, prioritaire */}
      <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
        <AuditDetailTabs
          auditId={audit.id}
          invoiceCount={invoiceStats.total}
          equipmentCount={inventoryStats.totalEquipment}
          inventoryStarted={
            inventoryStats.totalSites > 0 ||
            inventoryStats.totalBuildings > 0 ||
            inventoryStats.totalFloors > 0 ||
            inventoryStats.totalRooms > 0 ||
            inventoryStats.totalEquipment > 0
          }
        />
      </div>

      {/* Actions rapides */}
      <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
        <AuditQuickActions
          onCreateAction={handleAddActivity}
          auditId={audit.id}
        />
      </div>

      {/* Historique d'activité — tout en bas */}
      <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Historique d'activité
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAddActivity}
            className="h-7 text-xs text-slate-400 hover:text-slate-200 gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </Button>
        </div>
        <AuditActivityTimeline
          activities={activities}
          onAddActivity={handleAddActivity}
          onDeleteActivity={handleDeleteActivity}
          loading={loading}
        />
      </div>

      <AddActivityDialog
        isOpen={isActivityDialogOpen}
        onClose={() => setIsActivityDialogOpen(false)}
        onSubmit={handleActivitySubmit}
        isLoading={saving}
      />
    </div>
  );
};

export default AuditDetail;
