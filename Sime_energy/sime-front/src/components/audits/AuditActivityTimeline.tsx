import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, FileText, CheckCircle2, Activity, MapPin, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AuditActivityLog } from '@/lib/activity-service';

interface AuditActivityTimelineProps {
  activities: AuditActivityLog[];
  onAddActivity?: () => void;
  onDeleteActivity?: (id: string) => Promise<void>;
  loading?: boolean;
}

type DotColor =
  | 'bg-amber-400'
  | 'bg-emerald-400'
  | 'bg-violet-400'
  | 'bg-cyan-400'
  | 'bg-blue-400'
  | 'bg-slate-500';

function getDotColor(actionType: string): DotColor {
  switch (actionType) {
    case 'invoice_imported':
      return 'bg-amber-400';
    case 'invoice_verified':
      return 'bg-emerald-400';
    case 'measurement_recorded':
      return 'bg-violet-400';
    case 'task_created':
    case 'task_completed':
      return 'bg-cyan-400';
    case 'site_visited':
      return 'bg-blue-400';
    default:
      return 'bg-slate-500';
  }
}

function getActivityIcon(actionType: string) {
  const cls = 'w-3.5 h-3.5';
  switch (actionType) {
    case 'invoice_imported':
      return <FileText className={cn(cls, 'text-amber-400')} />;
    case 'invoice_verified':
      return <CheckCircle2 className={cn(cls, 'text-emerald-400')} />;
    case 'measurement_recorded':
      return <Activity className={cn(cls, 'text-violet-400')} />;
    case 'task_created':
    case 'task_completed':
      return <CheckCircle2 className={cn(cls, 'text-cyan-400')} />;
    case 'site_visited':
      return <MapPin className={cn(cls, 'text-blue-400')} />;
    default:
      return <Activity className={cn(cls, 'text-slate-500')} />;
  }
}

export function AuditActivityTimeline({
  activities,
  onAddActivity,
  onDeleteActivity,
  loading = false,
}: AuditActivityTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500 mx-auto" />
          <p className="text-xs text-slate-500">Chargement de l'historique...</p>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Activity className="h-10 w-10 text-slate-700 mx-auto" />
          <p className="text-sm text-slate-500">Aucune activité pour le moment</p>
          {onAddActivity && (
            <Button
              onClick={onAddActivity}
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-slate-400 hover:text-slate-200 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter une activité
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Timeline */}
      <div className="border-l-2 border-slate-700/50 ml-4 pl-5 space-y-4">
        {activities.map((activity) => {
          const dotColor = getDotColor(activity.action_type);
          const isExpanded = expandedId === activity.id;
          const hasMetadata =
            activity.metadata && Object.keys(activity.metadata).length > 0;

          return (
            <div key={activity.id} className="relative group">
              {/* Dot on the left border */}
              <span
                className={cn(
                  'absolute -left-[1.4rem] top-3.5 w-2 h-2 rounded-full',
                  dotColor
                )}
              />

              {/* Activity card */}
              <div
                className={cn(
                  'bg-[#151825] border border-slate-700/30 rounded-lg p-3 cursor-pointer',
                  'hover:border-slate-600/50 transition-colors'
                )}
                onClick={() =>
                  setExpandedId(isExpanded ? null : activity.id)
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="mt-0.5 shrink-0">
                      {getActivityIcon(activity.action_type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 leading-snug">
                        {activity.title}
                      </p>
                      {activity.description && (
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          {activity.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-500 tabular-nums">
                        {format(new Date(activity.created_at), 'dd MMM yyyy', {
                          locale: fr,
                        })}
                      </p>
                      <p className="text-xs text-slate-600 tabular-nums">
                        {format(new Date(activity.created_at), 'HH:mm', {
                          locale: fr,
                        })}
                      </p>
                    </div>
                    {onDeleteActivity && (
                      <div
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {confirmId === activity.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                setDeletingId(activity.id);
                                setConfirmId(null);
                                try {
                                  await onDeleteActivity(activity.id);
                                } finally {
                                  setDeletingId(null);
                                }
                              }}
                              className="text-xs text-red-400 hover:text-red-300 font-medium px-1"
                            >
                              Oui
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs text-slate-500 hover:text-slate-300 px-1"
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(activity.id)}
                            disabled={deletingId === activity.id}
                            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          >
                            {deletingId === activity.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded metadata */}
                {isExpanded && hasMetadata && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">
                      Détails
                    </p>
                    <div className="space-y-1">
                      {Object.entries(activity.metadata!).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-slate-500 capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-slate-300 font-mono tabular-nums">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
