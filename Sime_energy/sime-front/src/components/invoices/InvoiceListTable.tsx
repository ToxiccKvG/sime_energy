import { Invoice } from '@/types/invoice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface InvoiceListTableProps {
  invoices: Invoice[];
  selectedIds: string[];
  onSelectInvoice: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onOpenInvoice: (id: string) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  to_verify: { 
    label: 'À vérifier', 
    className: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
  },
  in_progress: { 
    label: 'En cours', 
    className: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
  },
  verified: { 
    label: 'Vérifié', 
    className: 'bg-success/10 text-success border-success/20 hover:bg-success/20'
  },
  validated: { 
    label: 'Validé', 
    className: 'bg-success/20 text-success border-success/30 hover:bg-success/30'
  },
};

export function InvoiceListTable({ 
  invoices, 
  selectedIds, 
  onSelectInvoice, 
  onSelectAll,
  onOpenInvoice 
}: InvoiceListTableProps) {
  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-4 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onSelectAll}
                  aria-label="Sélectionner tout"
                />
              </th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Aperçu</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Nom du fichier</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Audit</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Montant</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Date facture</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Statut</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Assigné à</th>
              <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="p-4">
                  <Checkbox
                    checked={selectedIds.includes(invoice.id)}
                    onCheckedChange={(checked) => onSelectInvoice(invoice.id, checked as boolean)}
                    aria-label={`Sélectionner ${invoice.fileName}`}
                  />
                </td>
                <td className="p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded border bg-muted">
                    {(["xls", "xlsx"].includes(invoice.type)) ? (
                      <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                      ) : (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      )}
                    
                  </div>
                </td>
                <td className="p-4">
                  <div className="font-medium text-foreground">{invoice.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(invoice.updatedAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </div>
                </td>
                <td className="p-4 text-sm text-foreground">{invoice.auditName}</td>
                <td className="p-4">
                  <div className="font-medium text-foreground">
                    {invoice.amount ? `${invoice.amount.toFixed(2)} €` : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    OCR: {Math.round(invoice.ocrResult.fields.find(f => f.name === 'amountTTC')?.confidence || 0) * 100}%
                  </div>
                </td>
                <td className="p-4 text-sm text-foreground">
                  {invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd/MM/yyyy') : '—'}
                </td>
                <td className="p-4">
                  <Badge 
                    variant="outline" 
                    className={statusConfig[invoice.status]?.className}
                  >
                    {statusConfig[invoice.status]?.label}
                  </Badge>
                </td>
                <td className="p-4 text-sm text-foreground">{invoice.assignedTo || '—'}</td>
                <td className="p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenInvoice(invoice.id)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
