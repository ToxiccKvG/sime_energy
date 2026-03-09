import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Calendar, MoreVertical, UserCircle, Plus, Filter } from 'lucide-react';
import { AuditAction } from '@/types/auditActivity';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditActionsPanelProps {
  actions: AuditAction[];
  onCreateAction: () => void;
  onEditAction: (action: AuditAction) => void;
  onDeleteAction: (actionId: string) => void;
  onOpenAction: (action: AuditAction) => void;
}

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done';

export function AuditActionsPanel({ 
  actions, 
  onCreateAction, 
  onEditAction, 
  onDeleteAction,
  onOpenAction 
}: AuditActionsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredActions = actions.filter(action => {
    if (statusFilter === 'all') return true;
    return action.status === statusFilter;
  });

  const getStatusBadge = (status: AuditAction['status']) => {
    switch (status) {
      case 'todo':
        return <Badge variant="outline" className="bg-background">À faire</Badge>;
      case 'in_progress':
        return <Badge className="bg-primary/10 text-primary border-primary/20">En cours</Badge>;
      case 'done':
        return <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Terminé</Badge>;
    }
  };

  const getPriorityBadge = (priority: AuditAction['priority']) => {
    switch (priority) {
      case 'low':
        return <Badge variant="outline" className="text-xs">Basse</Badge>;
      case 'medium':
        return <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/20">Moyenne</Badge>;
      case 'high':
        return <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-500/20">Haute</Badge>;
    }
  };

  const statusCounts = {
    todo: actions.filter(a => a.status === 'todo').length,
    in_progress: actions.filter(a => a.status === 'in_progress').length,
    done: actions.filter(a => a.status === 'done').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Carnet d'actions</h2>
        <Button onClick={onCreateAction} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle action
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          Toutes ({actions.length})
        </Button>
        <Button
          variant={statusFilter === 'todo' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('todo')}
        >
          À faire ({statusCounts.todo})
        </Button>
        <Button
          variant={statusFilter === 'in_progress' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('in_progress')}
        >
          En cours ({statusCounts.in_progress})
        </Button>
        <Button
          variant={statusFilter === 'done' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('done')}
        >
          Terminées ({statusCounts.done})
        </Button>
      </div>

      {/* Liste des actions */}
      <div className="space-y-3">
        {filteredActions.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            Aucune action {statusFilter !== 'all' ? 'dans cette catégorie' : ''}
          </Card>
        ) : (
          filteredActions.map((action) => (
            <Card
              key={action.id}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onOpenAction(action)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(action.status)}
                      {getPriorityBadge(action.priority)}
                    </div>
                    <h3 className="font-medium">{action.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onEditAction(action);
                      }}>
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAction(action.id);
                        }}
                        className="text-destructive"
                      >
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {action.assignedToName && (
                    <div className="flex items-center gap-1">
                      <UserCircle className="h-3 w-3" />
                      {action.assignedToName}
                    </div>
                  )}
                  {action.dueDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(action.dueDate), 'dd MMM yyyy', { locale: fr })}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
