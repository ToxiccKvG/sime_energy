import { useEffect, useState } from 'react';
import { Annotation } from '@/types/invoice';
import { invoiceApi } from '@/services/invoiceApi';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { User, Clock } from 'lucide-react';

interface AnnotationHistoryProps {
  invoiceId: string;
}

export function AnnotationHistory({ invoiceId }: AnnotationHistoryProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnnotations();
  }, [invoiceId]);

  const loadAnnotations = async () => {
    setLoading(true);
    try {
      const data = await invoiceApi.getAnnotations(invoiceId);
      setAnnotations(data);
    } catch (error) {
      console.error('Failed to load annotations', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground">Chargement...</div>;
  }

  if (annotations.length === 0) {
    return (
      <div className="text-center text-muted-foreground">
        Aucune modification enregistrée
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {annotations.map((annotation) => (
        <div key={annotation.id} className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{annotation.userName}</span>
            <Clock className="ml-auto h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {format(new Date(annotation.timestamp), 'dd MMM yyyy HH:mm', { locale: fr })}
            </span>
          </div>
          
          <div className="mb-2 text-sm text-muted-foreground">
            Champ: <span className="font-medium text-foreground">{annotation.fieldName}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Ancienne valeur</div>
              <div className="rounded bg-destructive/10 p-2 text-destructive line-through">
                {annotation.oldValue}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Nouvelle valeur</div>
              <div className="rounded bg-primary/10 p-2 text-primary font-medium">
                {annotation.newValue}
              </div>
            </div>
          </div>
          
          {annotation.comment && (
            <div className="mt-2 rounded bg-muted p-2 text-sm text-muted-foreground">
              {annotation.comment}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
