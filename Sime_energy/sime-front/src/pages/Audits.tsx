import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '@/context/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import { Audit } from '@/types/audit';
import { AuditList } from '@/components/audits/AuditList';
import { AuditForm } from '@/components/audits/AuditForm';
import { AuditDB, computeAuditCompletion } from '@/lib/audit-service';
import { useAudits, useDeleteAudit } from '@/hooks/useAudits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function transformAudit(audit: AuditDB): Audit {
  return {
    id: audit.id,
    name: audit.name,
    color: audit.color,
    status: audit.status,
    startDate: audit.start_date,
    endDate: audit.end_date,
    completionPercentage: computeAuditCompletion(audit),
    responsable: audit.responsable,
    generalInfo: audit.general_info,
    personnel: audit.personnel,
    capacites: { usines: [] },
    createdAt: audit.created_at,
    updatedAt: audit.updated_at,
    createdBy: audit.created_by,
  };
}

const Audits = () => {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const [editingAudit, setEditingAudit] = useState<Audit | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: rawAudits, isPending: loading } = useAudits(organization?.id);
  const deleteMutation = useDeleteAudit();

  const audits = useMemo(() => (rawAudits ?? []).map(transformAudit), [rawAudits]);

  const handleSave = () => {
    setEditingAudit(null);
    setIsCreating(false);
    queryClient.invalidateQueries({ queryKey: ['audits'] });
  };

  const handleDeleteConfirm = () => {
    if (!pendingDeleteId) return;
    deleteMutation.mutate(pendingDeleteId, {
      onSuccess: () => {
        toast.success('Projet supprimé');
        setPendingDeleteId(null);
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
        toast.error(message);
        setPendingDeleteId(null);
      },
    });
  };

  const filteredAudits = useMemo(() => {
    if (!searchQuery.trim()) return audits;
    const q = searchQuery.toLowerCase();
    return audits.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.generalInfo?.nomEtablissement?.toLowerCase().includes(q) ||
      a.generalInfo?.secteur?.toLowerCase().includes(q) ||
      a.responsable?.toLowerCase().includes(q)
    );
  }, [audits, searchQuery]);

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-10 w-72" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Projets</h1>
          <p className="mt-1 text-muted-foreground">
            Création et suivi de vos audits énergétiques
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouveau projet
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher un projet…"
          className="pl-9 pr-8 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary/60"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchQuery('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-background p-6 shadow-2xl backdrop-blur">
        <AuditList
          audits={filteredAudits}
          onEdit={setEditingAudit}
          onDelete={setPendingDeleteId}
          onView={audit => navigate(`/audits/${audit.id}`)}
        />
        {searchQuery && filteredAudits.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Aucun résultat pour «&nbsp;{searchQuery}&nbsp;»
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={open => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce projet ?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Cette action supprimera définitivement le projet et tous ses sites et bâtiments associés.
              Les données d'inventaire liées seront également supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-secondary border-border text-secondary-foreground hover:bg-secondary/80"
              disabled={deleteMutation.isPending}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Audits;
