import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/context/OrganizationContext';
import { useAuth } from '@/context/AuthContext';
import { getAudits } from '@/lib/audit-service';
import { createInvoice } from '@/lib/invoice-service';
import type { AuditDB } from '@/lib/audit-service';

interface InvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function InvoiceImportDialog({ open, onOpenChange, onImportComplete }: InvoiceImportDialogProps) {
  const [selectedAudit, setSelectedAudit] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [audits, setAudits] = useState<AuditDB[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'pending' | 'loading' | 'success' | 'error' }>({});
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { user } = useAuth();

  // Load audits when dialog opens or organization changes
  useEffect(() => {
    if (open && organization?.id) {
      loadAudits();
    }
  }, [open, organization?.id]);

  const loadAudits = async () => {
    if (!organization?.id) return;

    setLoadingAudits(true);
    try {
      const auditsList = await getAudits(organization.id);
      setAudits(auditsList || []);
      if (auditsList && auditsList.length > 0 && !selectedAudit) {
        setSelectedAudit(auditsList[0].id);
      }
    } catch (error) {
      console.error('Failed to load audits:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les audits',
        variant: 'destructive',
      });
    } finally {
      setLoadingAudits(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(f => f.name.endsWith('.pdf') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
      setFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => {
        setUploadProgress(prev => ({ ...prev, [f.name]: 'pending' }));
      });
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };

  const handleImport = async () => {
    if (!selectedAudit) {
      toast({
        title: 'Audit requis',
        description: 'Veuillez sélectionner un audit',
        variant: 'destructive',
      });
      return;
    }

    if (files.length === 0) {
      toast({
        title: 'Fichiers requis',
        description: 'Veuillez sélectionner au moins un fichier',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id || !organization?.id) {
      toast({
        title: 'Erreur',
        description: 'Utilisateur ou organisation non disponible',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Step 1: Store files in database immediately with 'pending' status
      const storedInvoiceIds: string[] = [];
      for (const file of files) {
        try {
          const invoice = await createInvoice(
            selectedAudit,
            organization.id,
            {
              file_name: file.name,
              status: 'pending',
              confidence_score: 0,
              ocr_data: {},
            },
            user.id
          );
          storedInvoiceIds.push(invoice.id);
        } catch (error) {
          console.error(`Error storing ${file.name}:`, error);
        }
      }

      // Step 2: Close dialog immediately (non-blocking)
      const fileCount = storedInvoiceIds.length;
      toast({
        title: 'Fichiers importés',
        description: `${fileCount} fichier(s) en cours de traitement...`,
      });

      onImportComplete();
      setFiles([]);
      setUploadProgress({});

      // Step 3: Process files in background (fire and forget)
      // Pass both files and their IDs so backend can identify which invoice to update
      processFilesInBackground(files, storedInvoiceIds);
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors du stockage des fichiers',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  // Background processing: uploads files to backend for OCR without blocking UI
  const processFilesInBackground = async (filesToProcess: File[], invoiceIds: string[]) => {
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const invoiceId = invoiceIds[i];

      try {
        // Determine correct backend endpoint based on file type
        let endpoint = '';
        if (file.name.endsWith('.pdf')) {
          endpoint = '/processing/process-file/pdf-invoices';
        } else if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
          endpoint = '/process-file/excel-invoices';
        } else {
          continue;
        }

        // Upload file to backend for OCR processing
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        // Pass invoice ID (unique identifier) so backend can update the correct invoice record
        formDataUpload.append('invoice_id', invoiceId);
        // Also include file_name for logging purposes
        formDataUpload.append('file_name', file.name);

        const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          body: formDataUpload,
        });

        if (!response.ok) {
          console.error(`Server error processing ${file.name}`);
          continue;
        }

        const responseData = await response.json();
        console.log('OCR Response for', file.name, ':', responseData);

        // Backend handles updating the database with OCR results and extracted data
        // Supabase Realtime will notify the frontend of changes
      } catch (error) {
        console.error(`Background processing error for ${file.name}:`, error);
      }
    }
  };

  const successFiles = Object.entries(uploadProgress).filter(([, status]) => status === 'success').length;
  const pendingFiles = files.filter(f => uploadProgress[f.name] && uploadProgress[f.name] !== 'success');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Importer des factures</DialogTitle>
          <DialogDescription>
            Sélectionnez l'audit associé et uploadez vos fichiers PDF/Excel. L'extraction des données se fera automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="audit-select">Audit associé *</Label>
            <Select value={selectedAudit} onValueChange={setSelectedAudit} disabled={uploading || loadingAudits || audits.length === 0}>
              <SelectTrigger id="audit-select">
                <SelectValue placeholder={loadingAudits ? "Chargement..." : audits.length === 0 ? "Aucun audit disponible" : "Choisir un audit"} />
              </SelectTrigger>
              <SelectContent>
                {audits.map(audit => (
                  <SelectItem key={audit.id} value={audit.id}>{audit.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">Fichiers PDF/Excel *</Label>
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors border-border"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Cliquez pour uploader</span> ou glissez-déposez
                  </p>
                  <p className="text-xs text-muted-foreground">PDF, XLS ou XLSX</p>
                </div>
                <Input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.xls,.xlsx"
                  multiple
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {files.map((file) => {
                  const status = uploadProgress[file.name];
                  return (
                    <div key={file.name} className="flex items-center gap-2 text-sm text-foreground bg-muted/30 px-3 py-2 rounded">
                      {status === 'loading' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                      {status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {status === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                      {(!status || status === 'pending') && <FileText className="h-4 w-4 text-primary" />}
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      {!uploading && (
                        <button
                          onClick={() => handleRemoveFile(file.name)}
                          className="p-0 h-4 w-4 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {successFiles > 0 && (
              <div className="mt-2 p-2 bg-green-50 text-green-700 text-sm rounded border border-green-200">
                ✓ {successFiles} fichier(s) traité(s) avec succès
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={uploading || files.length === 0 || !selectedAudit}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Traitement en cours...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Traiter {files.length > 0 && `(${files.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
