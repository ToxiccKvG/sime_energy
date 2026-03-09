import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  FileText,
  CheckCircle2,
  Activity,
  MapPin,
  Plus,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AuditActivityLog } from '@/lib/activity-service';

interface AuditActivityTimelineProps {
  activities: AuditActivityLog[];
  onAddActivity?: () => void;
  loading?: boolean;
}

const getActivityIcon = (actionType: string) => {
  switch (actionType) {
    case 'invoice_imported':
      return <FileText className="h-5 w-5 text-blue-500" />;
    case 'invoice_verified':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'measurement_recorded':
      return <Activity className="h-5 w-5 text-purple-500" />;
    case 'task_created':
    case 'task_completed':
      return <CheckCircle2 className="h-5 w-5 text-orange-500" />;
    case 'site_visited':
      return <MapPin className="h-5 w-5 text-red-500" />;
    default:
      return <Activity className="h-5 w-5 text-gray-500" />;
  }
};

const getActivityColor = (actionType: string) => {
  switch (actionType) {
    case 'invoice_imported':
      return 'bg-blue-50 border-blue-200';
    case 'invoice_verified':
      return 'bg-green-50 border-green-200';
    case 'measurement_recorded':
      return 'bg-purple-50 border-purple-200';
    case 'task_created':
    case 'task_completed':
      return 'bg-orange-50 border-orange-200';
    case 'site_visited':
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
};

export function AuditActivityTimeline({
  activities,
  onAddActivity,
  loading = false,
}: AuditActivityTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement de l'historique...</p>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <p className="text-muted-foreground">Aucune activité pour le moment</p>
          {onAddActivity && (
            <Button onClick={onAddActivity} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une activité
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />

        {/* Activities */}
        <div className="space-y-6">
          {activities.map((activity) => (
            <div key={activity.id} className="relative pl-16">
              {/* Circle icon */}
              <div className="absolute left-0 top-1 flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-primary/20">
                {getActivityIcon(activity.action_type)}
              </div>

              {/* Card */}
              <Card
                className={`p-4 cursor-pointer transition-all hover:shadow-md border ${getActivityColor(
                  activity.action_type
                )}`}
                onClick={() => setExpandedId(expandedId === activity.id ? null : activity.id)}
              >
                <div className="space-y-2">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">{activity.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {activity.description}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground flex-shrink-0 ml-4">
                      {format(new Date(activity.created_at), 'dd MMM yyyy', {
                        locale: fr,
                      })}
                      <br />
                      {format(new Date(activity.created_at), 'HH:mm', { locale: fr })}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedId === activity.id && activity.metadata && Object.keys(activity.metadata).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-current/10">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Détails:</p>
                      <div className="space-y-1 text-sm">
                        {Object.entries(activity.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/_/g, ' ')}:
                            </span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Add Activity Button */}
      {onAddActivity && (
        <div className="flex justify-center pt-4">
          <Button onClick={onAddActivity} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une activité
          </Button>
        </div>
      )}
    </div>
  );
}
