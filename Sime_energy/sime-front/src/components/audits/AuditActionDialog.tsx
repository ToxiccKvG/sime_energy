import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AuditAction } from '@/types/auditActivity';
import { cn } from '@/lib/utils';

interface AuditActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: AuditAction;
  auditId: string;
  onSave: (action: Partial<AuditAction>) => void;
}

export function AuditActionDialog({ 
  open, 
  onOpenChange, 
  action, 
  auditId,
  onSave 
}: AuditActionDialogProps) {
  const [formData, setFormData] = useState<Partial<AuditAction>>({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assignedTo: '',
    assignedToName: '',
    dueDate: undefined,
  });

  useEffect(() => {
    if (action) {
      setFormData(action);
    } else {
      setFormData({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        assignedTo: '',
        assignedToName: '',
        dueDate: undefined,
      });
    }
  }, [action, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      auditId,
      createdAt: action?.createdAt || new Date().toISOString(),
      createdBy: 'current-user-id', // À remplacer par l'ID de l'utilisateur actuel
      createdByName: 'Utilisateur actuel', // À remplacer par le nom de l'utilisateur actuel
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {action ? 'Modifier l\'action' : 'Créer une action terrain'}
          </DialogTitle>
          <DialogDescription>
            {action ? 'Modifiez les détails de l\'action' : 'Ajoutez une nouvelle action au carnet d\'actions de l\'audit'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ex: Inspection des équipements"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Décrivez l'action effectuée ou à effectuer..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Statut</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: 'todo' | 'in_progress' | 'done') => 
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">À faire</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="done">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priorité</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value: 'low' | 'medium' | 'high') => 
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignedToName">Assigné à</Label>
              <Input
                id="assignedToName"
                value={formData.assignedToName}
                onChange={(e) => setFormData({ ...formData, assignedToName: e.target.value })}
                placeholder="Nom de la personne"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Date d'échéance</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dueDate ? (
                      format(new Date(formData.dueDate), "dd MMM yyyy", { locale: fr })
                    ) : (
                      <span>Sélectionner une date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate ? new Date(formData.dueDate) : undefined}
                    onSelect={(date) => setFormData({ ...formData, dueDate: date?.toISOString() })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachments">Pièces jointes</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="w-full" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Ajouter des photos ou documents
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Photos terrain, rapports, notes...
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">
              {action ? 'Enregistrer' : 'Créer l\'action'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
