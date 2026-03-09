import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { Audit } from '@/types/audit';
import { AuditList } from '@/components/audits/AuditList';
import { AuditForm } from '@/components/audits/AuditForm';
import { getAudits } from '@/lib/audit-service';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Audits = () => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [editingAudit, setEditingAudit] = useState<Audit | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadAudits = async () => {
      if (!organization?.id) {
        setLoading(false);
        return;
      }

      try {
        const data = await getAudits(organization.id);
        if (data) {
          // Transform database format to Audit type
          const transformedAudits = data.map((audit: any) => ({
            id: audit.id,
            name: audit.name,
            color: audit.color,
            status: audit.status,
            startDate: audit.start_date,
            endDate: audit.end_date,
            completionPercentage: audit.completion_percentage,
            responsable: audit.responsable,
            generalInfo: audit.general_info,
            personnel: audit.personnel,
            capacites: { usines: [] },
            createdAt: audit.created_at,
            updatedAt: audit.updated_at,
            createdBy: audit.created_by,
          }));
          setAudits(transformedAudits);
        }
      } catch (error) {
        console.error('Error loading audits:', error);
        toast({
          title: 'Erreur',
          description: 'Impossible de charger les audits',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadAudits();
  }, [organization?.id, toast]);

  const handleSave = async (auditData: Partial<Audit>) => {
    // The AuditForm component handles saving to Supabase directly
    // This just refreshes the list after save
    if (organization?.id) {
      try {
        const data = await getAudits(organization.id);
        if (data) {
          const transformedAudits = data.map((audit: any) => ({
            id: audit.id,
            name: audit.name,
            color: audit.color,
            status: audit.status,
            startDate: audit.start_date,
            endDate: audit.end_date,
            completionPercentage: audit.completion_percentage,
            responsable: audit.responsable,
            generalInfo: audit.general_info,
            personnel: audit.personnel,
            capacites: { usines: [] },
            createdAt: audit.created_at,
            updatedAt: audit.updated_at,
            createdBy: audit.created_by,
          }));
          setAudits(transformedAudits);
        }
      } catch (error) {
        console.error('Error refreshing audits:', error);
      }
    }
    setEditingAudit(null);
    setIsCreating(false);
  };

  const handleDelete = (auditId: string) => {
    setAudits(prev => prev.filter(a => a.id !== auditId));
    toast({
      title: 'Audit supprimé',
      description: 'L\'audit a été supprimé avec succès',
    });
  };

  const handleView = (audit: Audit) => {
    window.location.href = `/audits/${audit.id}`;
  };

  if (isCreating || editingAudit) {
    return (
      <AuditForm
        audit={editingAudit || undefined}
        onSave={handleSave}
        onCancel={() => {
          setIsCreating(false);
          setEditingAudit(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-50">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Audits</h1>
          <p className="mt-1 text-slate-400">
            Création et suivi de vos audits énergétiques
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Créer un audit
        </Button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0d14] p-6 shadow-2xl backdrop-blur">
        <AuditList
          audits={audits}
          onEdit={setEditingAudit}
          onDelete={handleDelete}
          onView={handleView}
        />
      </div>
    </div>
  );
};

export default Audits;
