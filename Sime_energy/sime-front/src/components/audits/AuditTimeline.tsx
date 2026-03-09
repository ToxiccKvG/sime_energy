import { AuditActivity } from '@/types/auditActivity';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FileText, Activity, Package, CheckCircle, MessageSquare, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface AuditTimelineProps {
  activities: AuditActivity[];
}

const activityIcons = {
  invoice: FileText,
  measure: Activity,
  inventory: Package,
  action: CheckCircle,
  annotation: MessageSquare,
  validation: CheckCircle,
  system: Settings,
};

const activityColors = {
  invoice: 'text-primary',
  measure: 'text-chart-3',
  inventory: 'text-chart-4',
  action: 'text-chart-2',
  annotation: 'text-muted-foreground',
  validation: 'text-success',
  system: 'text-muted-foreground',
};

export function AuditTimeline({ activities }: AuditTimelineProps) {
  if (activities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Aucune activité enregistrée</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Carnet d'actions & Timeline</h3>
      
      <div className="space-y-4">
        {activities.map((activity, index) => {
          const Icon = activityIcons[activity.type];
          const isLast = index === activities.length - 1;
          
          return (
            <div key={activity.id} className="relative">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-5 top-12 bottom-0 w-px bg-border" />
              )}
              
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex gap-4">
                  {/* Icon */}
                  <div className={`shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center ${activityColors[activity.type]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-foreground">{activity.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {activity.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                      </div>
                      
                      <time className="text-xs text-muted-foreground shrink-0">
                        {format(new Date(activity.timestamp), 'dd MMM, HH:mm', { locale: fr })}
                      </time>
                    </div>
                    
                    {/* User info */}
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {activity.userName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{activity.userName}</span>
                    </div>
                    
                    {/* Metadata */}
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {activity.metadata.invoiceCount !== undefined && (
                          <span>{activity.metadata.invoiceCount} facture(s)</span>
                        )}
                        {activity.metadata.equipmentCount !== undefined && (
                          <span>{activity.metadata.equipmentCount} équipement(s)</span>
                        )}
                        {activity.metadata.attachments && activity.metadata.attachments.length > 0 && (
                          <span>{activity.metadata.attachments.length} pièce(s) jointe(s)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
