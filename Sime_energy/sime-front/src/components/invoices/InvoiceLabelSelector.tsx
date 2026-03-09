import { InvoiceLabel } from '@/types/invoice';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InvoiceLabelSelectorProps {
  value?: InvoiceLabel;
  onChange: (label: InvoiceLabel | undefined) => void;
}

const labelOptions: { value: InvoiceLabel; label: string }[] = [
  { value: 'reel', label: 'Réel' },
  { value: 'modifie', label: 'Modifié' },
  { value: 'estime', label: 'Facture estimée' },
  { value: 'errone_senelec', label: 'Erroné par Senelec' },
  { value: 'remplace_supprime_annule', label: 'Remplacé/Supprimé/Annulé' },
];

export function InvoiceLabelSelector({ value, onChange }: InvoiceLabelSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Type de facture</Label>
      <Select 
        value={value} 
        onValueChange={(v) => onChange(v as InvoiceLabel)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner un type" />
        </SelectTrigger>
        <SelectContent>
          {labelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
