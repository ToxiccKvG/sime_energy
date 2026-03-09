import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, DollarSign, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AuditInvoice } from '@/lib/invoice-service';

interface InvoiceViewDialogProps {
  invoice: AuditInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OCRField {
  key: string;
  value: string;
}

export function InvoiceViewDialog({ invoice, open, onOpenChange }: InvoiceViewDialogProps) {
  if (!invoice) return null;

  const ocrData = invoice.ocr_data || {};

  // Helper to extract ALL values from OCR data (without box, without image)
  const getAllOCRFields = (): OCRField[] => {
    const fields: OCRField[] = [];

    // Handle different possible structures
    let formsArray: any[] = [];

    // Structure 1: ocr_data is an array (direct forms)
    if (Array.isArray(ocrData)) {
      formsArray = ocrData;
    }
    // Structure 2: ocr_data has pages array
    else if (typeof ocrData === 'object' && ocrData !== null && 'page' in ocrData) {
      const page = (ocrData as any).page;
      if (Array.isArray(page) && page.length > 0) {
        const firstPage = page[0];
        if (firstPage && 'forms' in firstPage) {
          formsArray = firstPage.forms;
        }
      }
    }
    // Structure 3: ocr_data has forms directly
    else if (typeof ocrData === 'object' && ocrData !== null && 'forms' in ocrData) {
      formsArray = (ocrData as any).forms;
    }

    // Extract Key-Value pairs from forms
    for (const item of formsArray) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'Key' in item &&
        'Value' in item &&
        (item as any).Key && // Filter out empty keys
        (item as any).Value // Filter out empty values
      ) {
        fields.push({
          key: (item as any).Key,
          value: (item as any).Value
        });
      }
    }

    return fields;
  };

  const ocrFields = getAllOCRFields();

  // Helper to extract specific value for display
  const getOCRValue = (key: string): string => {
    const field = ocrFields.find(f => f.key === key);
    return field ? field.value : '-';
  };

  const formatXOF = (amount?: number) => {
    if (!amount) return '0 XOF';
    return amount.toLocaleString('fr-FR') + ' XOF';
  };

  // Extract key OCR fields
  const factureNo = getOCRValue("FACTUREN°") || invoice.id?.slice(0, 8) || '-';
  const dateFacture = invoice.invoice_date
    ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy')
    : getOCRValue('DATE') || '-';
  const dateLimite = getOCRValue('DATE LIMITE DE PAIEMENT') || '-';
  const fournisseur = invoice.supplier || getOCRValue('NOM OU RAISON SOCIALE') || '-';
  const adresse = getOCRValue('ADRESSE PRESENTATION') || '-';

  const statusColor = {
    verified: 'bg-green-100 text-green-800',
    processing: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
  }[invoice.status] || 'bg-gray-100 text-gray-800';

  const statusIcon = {
    verified: <CheckCircle2 className="w-4 h-4 text-green-600" />,
    processing: <FileText className="w-4 h-4 text-blue-600" />,
    rejected: <AlertCircle className="w-4 h-4 text-red-600" />,
    pending: <FileText className="w-4 h-4 text-gray-600" />,
  }[invoice.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="h-5 w-5" />
            Détails de la facture
          </DialogTitle>
          <DialogDescription>
            {fournisseur} • Facture #{factureNo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status et confiance */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">Statut du traitement</p>
                <div className="flex items-center gap-2">
                  {statusIcon}
                  <Badge className={statusColor} variant="secondary">
                    {invoice.status === 'verified'
                      ? 'Vérifiée'
                      : invoice.status === 'processing'
                        ? 'En traitement'
                        : invoice.status === 'rejected'
                          ? 'Rejetée'
                          : 'En attente'}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-2">Score de confiance OCR</p>
                <p className="text-3xl font-bold text-blue-600">{invoice.confidence_score}%</p>
              </div>
            </div>
          </div>

          {/* Infos principales */}
          <div className="border-l-4 border-blue-500 bg-blue-50 p-6 rounded-r-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations Fournisseur</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Fournisseur
                </p>
                <p className="text-gray-900 font-medium mt-1">{fournisseur}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Adresse</p>
                <p className="text-gray-700 mt-1">{adresse}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Nom du fichier</p>
                <p className="text-gray-700 mt-1 text-xs font-mono">{invoice.file_name}</p>
              </div>
            </div>
          </div>

          {/* Dates importantes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4" />
                Date facture
              </p>
              <p className="text-lg font-bold text-gray-900">{dateFacture}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4" />
                Date limite
              </p>
              <p className="text-lg font-bold text-red-600">{dateLimite}</p>
            </div>
          </div>

          {/* Montant */}
          <div className="border-l-4 border-green-500 bg-green-50 p-6 rounded-r-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Montant total
            </h3>
            <div className="text-3xl font-bold text-green-600">{formatXOF(invoice.amount)}</div>
          </div>

          {/* TOUTES LES DONNÉES EXTRAITES */}
          <div className="border border-gray-300 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Toutes les données extraites par OCR</h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              {ocrFields.length > 0 ? (
                <div className="space-y-3">
                  {ocrFields.map((field, idx) => (
                    <div key={idx} className="border-b border-gray-200 pb-3 last:border-b-0">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm font-semibold text-gray-700 min-w-max flex-shrink-0">
                          {field.key}
                        </span>
                        <span className="text-sm text-gray-900 text-right break-words flex-grow">
                          {field.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">Aucune donnée OCR disponible</p>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Total: {ocrFields.length} champ(s) extraits
            </p>
          </div>

          {/* Notes si présentes */}
          {invoice.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-yellow-900 mb-2">Notes</p>
              <p className="text-sm text-yellow-800">{invoice.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
