import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuditHeader } from '@/components/audits/AuditHeader';
import { AuditKPISection } from '@/components/audits/AuditKPISection';
import { AuditQuickActions } from '@/components/audits/AuditQuickActions';
import { AuditDetailTabs } from '@/components/audits/AuditDetailTabs';
import { AuditActivityTimeline } from '@/components/audits/AuditActivityTimeline';
import { AddActivityDialog } from '@/components/audits/AddActivityDialog';
import { Audit } from '@/types/audit';
import { AuditInvoiceStats, AuditMeasureStats, AuditInventoryStats } from '@/types/auditActivity';
import { getAudit, getAuditSites, getAuditBuildings } from '@/lib/audit-service';
import { getAuditInvoices, getInvoiceStats } from '@/lib/invoice-service';
import { getAuditMeasurements, getMeasurementStats } from '@/lib/measurement-service';
import { getAuditActivity, logActivity } from '@/lib/activity-service';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import type { AuditActivityLog } from '@/lib/activity-service';

let mockInvoiceStats: AuditInvoiceStats = {
  total: 0,
  uploaded: 0,
  processed: 0,
  verified: 0,
  totalAmount: 0,
  averageConfidence: 0,
};

let mockMeasureStats: AuditMeasureStats = {
  totalSensors: 0,
  activeSensors: 0,
  measurementCount: 0,
  lastMeasurementDate: new Date().toISOString(),
};

let mockInventoryStats: AuditInventoryStats = {
  totalSites: 0,
  totalBuildings: 0,
  totalFloors: 0,
  totalRooms: 0,
  totalEquipment: 0,
};

const AuditDetail = () => {
  const { auditId } = useParams();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [activities, setActivities] = useState<AuditActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [inventoryStats, setInventoryStats] = useState<AuditInventoryStats>(mockInventoryStats);
  const [invoiceStats, setInvoiceStats] = useState<AuditInvoiceStats>(mockInvoiceStats);
  const [measureStats, setMeasureStats] = useState<AuditMeasureStats>(mockMeasureStats);

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
          toast({
            title: 'Erreur',
            description: 'Audit non trouvé',
            variant: 'destructive',
          });
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

        setAudit(transformedAudit);

        // Fetch sites and buildings for inventory stats
        const sites = await getAuditSites(auditId);
        const totalSites = sites?.length || 0;
        let totalBuildings = 0;
        let totalFloors = 0;
        let totalRooms = 0;

        if (sites && sites.length > 0) {
          for (const site of sites) {
            const buildings = await getAuditBuildings(site.id);
            totalBuildings += buildings?.length || 0;
          }
        }

        setInventoryStats({
          totalSites,
          totalBuildings,
          totalFloors,
          totalRooms,
          totalEquipment: 0,
        });

        // Fetch invoices and get stats
        try {
          const invoiceStatsData = await getInvoiceStats(auditId);
          setInvoiceStats(invoiceStatsData);
        } catch (e) {
          console.warn('Error loading invoice stats:', e);
        }

        // Fetch measurements and get stats
        try {
          const measurementStatsData = await getMeasurementStats(auditId);
          setMeasureStats(measurementStatsData);
        } catch (e) {
          console.warn('Error loading measurement stats:', e);
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
        toast({
          title: 'Erreur',
          description: 'Impossible de charger les détails de l\'audit',
          variant: 'destructive',
        });
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

      // Convert date string to ISO format
      const activityDate = new Date(data.date).toISOString();

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f111a] text-slate-200">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0d14] px-6 py-8 shadow-2xl backdrop-blur">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-slate-400">Chargement de l'audit...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f111a] text-slate-200">
        <div className="space-y-2 rounded-2xl border border-white/10 bg-[#0b0d14] px-8 py-10 text-center shadow-2xl backdrop-blur">
          <p className="text-lg font-medium text-white">Audit non trouvé</p>
          <p className="text-slate-400">L'audit que vous recherchez n'existe pas ou a été supprimé</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 text-slate-50">
      <AuditHeader audit={audit} />

      {/* Main Grid: 60/40 split */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        {/* Left column - Activity Timeline */}
        <div className="space-y-8">
          {/* Map/Site selector placeholder */}
          <div className="aspect-[21/9] rounded-xl border border-white/10 bg-[#0b0d14] p-8 text-center shadow-xl backdrop-blur">
            <p className="text-slate-400">Carte des sites (à implémenter)</p>
          </div>

          {/* Activity Timeline */}
          <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0b0d14] p-6 shadow-xl backdrop-blur">
            <h2 className="text-2xl font-semibold text-white">Historique d'activité</h2>
            <AuditActivityTimeline
              activities={activities}
              onAddActivity={handleAddActivity}
              loading={loading}
            />
          </div>
        </div>

        {/* Right column - KPIs & Quick actions */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0b0d14] p-6 shadow-xl backdrop-blur">
            <AuditKPISection
              invoiceStats={invoiceStats}
              measureStats={measureStats}
              inventoryStats={inventoryStats}
              completionPercentage={audit.completionPercentage}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b0d14] p-6 shadow-xl backdrop-blur">
            <AuditQuickActions
              onCreateAction={handleAddActivity}
              auditId={audit.id}
            />
          </div>
        </div>
      </div>

      {/* Detailed sections - Tabs */}
      <div className="border-t border-white/10 pt-8">
        <div className="rounded-2xl border border-white/10 bg-[#0b0d14] p-6 shadow-xl backdrop-blur">
          <AuditDetailTabs
            invoiceCount={invoiceStats.total}
            measureCount={measureStats.measurementCount}
            equipmentCount={inventoryStats.totalEquipment}
          />
        </div>
      </div>

      {/* Activity Creation Dialog */}
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
