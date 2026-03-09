import { useState } from 'react';
import { OCRField } from '@/types/invoice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';

interface FieldEditorProps {
  fields: OCRField[];
  selectedField: string | null;
  onFieldClick: (fieldName: string) => void;
  onFieldUpdate: (fieldName: string, value: string) => void;
  onCommentUpdate: (fieldName: string, comment: string) => void;
  onFieldHover: (fieldName: string | null) => void;
}

const fieldLabels: Record<string, string> = {
  invoiceNumber: 'Numéro de facture',
  invoiceDate: 'Date',
  amountTTC: 'Montant TTC',
  amountHT: 'Montant HT',
  tva: 'TVA',
  supplier: 'Fournisseur',
  reference: 'Référence commande',
  siret: 'SIRET',
  address: 'Adresse',
  iban: 'IBAN',
  category: 'Catégorie',
};

export function FieldEditor({
  fields,
  selectedField,
  onFieldClick,
  onFieldUpdate,
  onCommentUpdate,
  onFieldHover,
}: FieldEditorProps) {
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});

  const handleChange = (fieldName: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleBlur = (fieldName: string) => {
    const newValue = editedValues[fieldName];
    if (newValue !== undefined) {
      onFieldUpdate(fieldName, newValue);
      setEditedValues(prev => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const handleCommentChange = (fieldName: string, comment: string) => {
    setEditedComments(prev => ({ ...prev, [fieldName]: comment }));
  };

  const handleCommentBlur = (fieldName: string) => {
    const newComment = editedComments[fieldName];
    if (newComment !== undefined) {
      onCommentUpdate(fieldName, newComment);
      setEditedComments(prev => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const isSelected = selectedField === field.name;
        const currentValue = editedValues[field.name] ?? field.value;
        const currentComment = editedComments[field.name] ?? field.comment ?? '';
        const confidence = Math.round(field.confidence * 100);

        return (
          <div
            key={field.name}
            className={cn(
              'rounded-lg border p-4 transition-all cursor-pointer',
              isSelected && 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2',
              !isSelected && 'hover:border-primary/50 hover:bg-muted/50'
            )}
            onClick={() => onFieldClick(field.name)}
            onMouseEnter={() => onFieldHover(field.name)}
            onMouseLeave={() => onFieldHover(null)}
          >
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor={field.name} className="text-sm font-medium">
                {fieldLabels[field.name] || field.name}
              </Label>
              <div className="flex gap-2">
                {field.comment && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Commentaire
                  </Badge>
                )}
                {field.modified && (
                  <Badge variant="outline" className="text-xs">
                    Modifié
                  </Badge>
                )}
                <Badge
                  variant={confidence >= 90 ? 'default' : confidence >= 70 ? 'secondary' : 'destructive'}
                  className="text-xs"
                >
                  {confidence}%
                </Badge>
              </div>
            </div>
            <Input
              id={field.name}
              value={currentValue}
              onChange={(e) => handleChange(field.name, e.target.value)}
              onBlur={() => handleBlur(field.name)}
              className={cn(
                'transition-all',
                isSelected && 'ring-2 ring-primary'
              )}
            />
            {confidence < 70 && (
              <p className="mt-1 text-xs text-destructive">
                Bounding box détectée — confiance {confidence}%
              </p>
            )}
            
            {isSelected && (
              <div className="mt-3 space-y-2">
                <Label htmlFor={`comment-${field.name}`} className="text-xs flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Commentaire
                </Label>
                <Textarea
                  id={`comment-${field.name}`}
                  value={currentComment}
                  onChange={(e) => handleCommentChange(field.name, e.target.value)}
                  onBlur={() => handleCommentBlur(field.name)}
                  placeholder="Ajouter un commentaire sur ce champ..."
                  className="min-h-[60px] text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
