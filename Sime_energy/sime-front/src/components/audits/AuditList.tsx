import { Audit } from '@/types/audit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Eye, Calendar, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AuditListProps {
  audits: Audit[];
  onEdit: (audit: Audit) => void;
  onDelete: (auditId: string) => void;
  onView: (audit: Audit) => void;
}

const statusConfig = {
  planned: {
    label: 'Planifié',
    badgeClass: 'bg-white/10 text-white border-white/10',
  },
  in_progress: {
    label: 'En cours',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  },
  completed: {
    label: 'Terminé',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  },
};

export function AuditList({ audits, onEdit, onDelete, onView }: AuditListProps) {
  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
        <div className="space-y-2">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-lg font-medium text-muted-foreground">Aucun audit trouvé</p>
          <p className="text-sm text-muted-foreground/70">Créez votre premier audit pour commencer</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {audits.map((audit) => (
        <div
          key={audit.id}
          className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-0 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl"
          onClick={() => onView(audit)}
        >
          {/* Header color bar */}
          <div className="h-1.5 w-full" style={{ backgroundColor: audit.color }} />

          <div className="space-y-5 p-6">
            {/* Title and Status */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 flex-1 text-lg font-semibold text-white">{audit.name}</h3>
                <Badge
                  variant="outline"
                  className={`flex-shrink-0 border ${statusConfig[audit.status].badgeClass}`}
                >
                  {statusConfig[audit.status].label}
                </Badge>
              </div>

              {/* Establishment */}
              {audit.generalInfo?.nomEtablissement && (
                <p className="line-clamp-1 text-sm text-slate-400">
                  {audit.generalInfo.nomEtablissement}
                </p>
              )}
            </div>

            {/* Info Grid */}
            <div className="space-y-3">
              {/* Sector & Responsible */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {audit.generalInfo?.secteur && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    <span className="truncate text-slate-300">{audit.generalInfo.secteur}</span>
                  </div>
                )}
                {audit.responsable && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    <span className="truncate text-slate-300">{audit.responsable}</span>
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>{format(new Date(audit.startDate), 'dd MMM yyyy', { locale: fr })}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">Progression</span>
                <span className="font-semibold text-primary">{audit.completionPercentage}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                  style={{ width: `${audit.completionPercentage}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-slate-200 hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onView(audit);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Consulter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-200 hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(audit);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-300 hover:bg-red-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(audit.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
