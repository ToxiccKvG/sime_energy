import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface AddActivityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; date: string }) => Promise<void>;
  isLoading?: boolean;
}

export function AddActivityDialog({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: AddActivityDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Le titre est requis');
      return;
    }

    if (!description.trim()) {
      toast.error('La description est requise');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ title, description, date });
      // Reset form
      setTitle('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);
      onClose();
    } catch (error) {
      console.error('Error submitting activity:', error);
      toast.error('Erreur lors de l\'ajout de l\'activité');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ajouter une activité</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre de l'activité</Label>
            <Input
              id="title"
              placeholder="Ex: Visite sur site et prise de mesures"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting || isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Décrivez ce qui s'est passé lors de cette activité..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting || isLoading}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date de l'activité
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting || isLoading}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting || isLoading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="bg-gradient-to-r from-purple-500 to-purple-600"
            >
              {isSubmitting || isLoading ? 'Ajout en cours...' : 'Ajouter activité'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
