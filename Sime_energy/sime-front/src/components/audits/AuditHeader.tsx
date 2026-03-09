import { Audit } from '@/types/audit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Upload, Download, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AuditHeaderProps {
  audit: Audit;
}

const statusConfig = {
  planned: { label: 'Planifié', variant: 'secondary' as const },
  in_progress: { label: 'En cours', variant: 'default' as const },
  completed: { label: 'Terminé', variant: 'outline' as const },
};

export function AuditHeader({ audit }: AuditHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 mb-8">
      {/* Back button */}
      <Button 
        variant="ghost" 
        onClick={() => navigate('/audits')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux audits
      </Button>

      {/* Main header */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-4">
            <div 
              className="w-4 h-4 rounded-full shrink-0" 
              style={{ backgroundColor: audit.color }}
            />
            <h1 className="text-4xl font-semibold text-foreground">{audit.name}</h1>
            <Badge variant={statusConfig[audit.status].variant} className="text-base px-3 py-1">
              {statusConfig[audit.status].label}
            </Badge>
          </div>

          {/* Sub-header info */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Organisation:</span>{' '}
              {audit.generalInfo.nomEtablissement}
            </div>
            <div>
              <span className="font-medium text-foreground">Secteur:</span>{' '}
              {audit.generalInfo.secteur}
            </div>
            <div>
              <span className="font-medium text-foreground">Début:</span>{' '}
              {format(new Date(audit.startDate), 'dd MMMM yyyy', { locale: fr })}
            </div>
            {audit.responsable && (
              <div>
                <span className="font-medium text-foreground">Responsable:</span>{' '}
                {audit.responsable}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Créer action
          </Button>
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Importer factures
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter rapport
          </Button>
          <Button variant="default" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Assigner
          </Button>
        </div>
      </div>
    </div>
  );
}
