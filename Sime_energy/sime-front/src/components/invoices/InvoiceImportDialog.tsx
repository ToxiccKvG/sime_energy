import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, AlertCircle, CheckCircle2, X, Sparkles, Cpu, FileSearch, Zap, ClipboardEdit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/context/OrganizationContext';
import { useAuth } from '@/context/AuthContext';
import { getAudits } from '@/lib/audit-service';
import { createInvoice } from '@/lib/invoice-service';
import type { AuditDB } from '@/lib/audit-service';
import { ManualInvoiceForm } from '@/components/invoices/ManualInvoiceForm';

interface InvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type FileStatus = 'pending' | 'loading' | 'success' | 'error';

const OCR_STEPS = [
  { id: 'upload',    label: 'Envoi du fichier',      icon: Upload },
  { id: 'textract',  label: 'Extraction Textract',   icon: FileSearch },
  { id: 'mistral',   label: 'Correction IA',         icon: Cpu },
  { id: 'save',      label: 'Enregistrement',        icon: Sparkles },
];

function ProcessingAnimation({ fileName }: { fileName: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s < OCR_STEPS.length - 1 ? s + 1 : s));
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rounded-xl bg-[#0d0f1a] border border-amber-500/20 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Traitement OCR en cours</span>
      </div>
      <p className="text-xs text-slate-400 font-mono truncate">{fileName}</p>
      <div className="flex items-center gap-1">
        {OCR_STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div className={`
                flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-500 shrink-0
                ${done ? 'bg-emerald-500/20 border border-emerald-500/40' : active ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-white/5 border border-white/10'}
              `}>
                <Icon className={`w-3.5 h-3.5 transition-colors ${done ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-slate-600'}`} />
              </div>
              {i < OCR_STEPS.length - 1 && (
                <div className={`h-px flex-1 transition-all duration-700 ${done ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between">
        {OCR_STEPS.map((s, i) => (
          <span key={s.id} className={`text-[9px] transition-colors ${i <= step ? 'text-slate-300' : 'text-slate-600'}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InvoiceImportDialog({ open, onOpenChange, onImportComplete }: InvoiceImportDialogProps) {
  const [selectedAudit, setSelectedAudit] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [audits, setAudits] = useState<AuditDB[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, FileStatus>>({});
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && organization?.id) loadAudits();
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
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les audits', variant: 'destructive' });
    } finally {
      setLoadingAudits(false);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const valid = newFiles.filter((f) =>
      f.name.endsWith('.pdf') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    setFiles((prev) => [...prev, ...valid]);
    valid.forEach((f) => setUploadProgress((prev) => ({ ...prev, [f.name]: 'pending' })));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleRemoveFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
    setUploadProgress((prev) => { const n = { ...prev }; delete n[fileName]; return n; });
  };

  const handleImport = async () => {
    if (!selectedAudit || files.length === 0 || !user?.id || !organization?.id) return;
    setUploading(true);

    try {
      const storedInvoiceIds: string[] = [];
      for (const file of files) {
        try {
          const invoice = await createInvoice(
            selectedAudit, organization.id,
            { file_name: file.name, status: 'pending', confidence_score: 0, ocr_data: {} },
            user.id
          );
          storedInvoiceIds.push(invoice.id);
        } catch {
          console.error(`Error storing ${file.name}`);
        }
      }

      toast({ title: 'Fichiers importés', description: `${storedInvoiceIds.length} fichier(s) en cours de traitement…` });
      onImportComplete();
      setFiles([]);
      setUploadProgress({});
      processFilesInBackground(files, storedInvoiceIds);
    } catch {
      toast({ title: 'Erreur', description: 'Une erreur est survenue lors du stockage', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const processFilesInBackground = async (filesToProcess: File[], invoiceIds: string[]) => {
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const invoiceId = invoiceIds[i];
      setProcessingFile(file.name);

      let endpoint = '';
      if (file.name.endsWith('.pdf')) endpoint = '/processing/process-file/pdf-invoices';
      else if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) endpoint = '/process-file/excel-invoices';
      else continue;

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('invoice_id', invoiceId);
        formData.append('file_name', file.name);

        const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) console.error(`Server error processing ${file.name}`);
        else await response.json();
      } catch (error) {
        console.error(`Background processing error for ${file.name}:`, error);
      }
    }
    setProcessingFile(null);
  };

  const fileStatusIcon = (status: FileStatus) => {
    if (status === 'loading') return <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />;
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-400" />;
    return <FileText className="h-4 w-4 text-slate-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 bg-[#0d0f1a] border border-white/10 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.07] bg-[#0a0c14]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-slate-100">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Upload className="w-4 h-4 text-amber-400" />
              </div>
              Importer des factures
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1">
              OCR automatique via AWS Textract + correction IA
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Audit select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-300 uppercase tracking-wider">Projet associé</Label>
            <Select value={selectedAudit} onValueChange={setSelectedAudit} disabled={uploading || loadingAudits}>
              <SelectTrigger className="bg-[#14161f] border-white/10 text-slate-100 focus:ring-amber-500/30">
                <SelectValue placeholder={loadingAudits ? 'Chargement…' : audits.length === 0 ? 'Aucun projet' : 'Choisir un projet'} />
              </SelectTrigger>
              <SelectContent className="bg-[#14161f] border-white/10 text-slate-100">
                {audits.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-300 uppercase tracking-wider">Fichiers PDF / Excel</Label>
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`
                relative flex flex-col items-center justify-center w-full h-28 rounded-xl cursor-pointer
                border-2 border-dashed transition-all duration-200
                ${isDragging
                  ? 'border-amber-400/60 bg-amber-500/10'
                  : 'border-white/15 bg-white/[0.03] hover:border-amber-500/30 hover:bg-amber-500/5'
                }
              `}
            >
              <label htmlFor="file-upload" className="absolute inset-0 cursor-pointer" />
              <Upload className={`w-6 h-6 mb-2 transition-colors ${isDragging ? 'text-amber-400' : 'text-slate-500'}`} />
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Cliquez</span> ou glissez-déposez
              </p>
              <p className="text-xs text-slate-600 mt-0.5">PDF, XLS, XLSX</p>
              <Input id="file-upload" type="file" className="hidden" accept=".pdf,.xls,.xlsx" multiple onChange={handleFileChange} disabled={uploading} />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto mt-2">
                {files.map((file) => {
                  const status = uploadProgress[file.name] ?? 'pending';
                  return (
                    <div key={file.name} className="flex items-center gap-2.5 bg-[#14161f] border border-white/[0.07] px-3 py-2 rounded-lg">
                      {fileStatusIcon(status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      {!uploading && (
                        <button onClick={() => handleRemoveFile(file.name)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Processing animation */}
          {processingFile && <ProcessingAnimation fileName={processingFile} />}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 justify-between border-t border-white/[0.07] pt-4">
          <Button
            variant="ghost"
            onClick={() => { onOpenChange(false); setManualOpen(true); }}
            disabled={uploading}
            className="text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
          >
            <ClipboardEdit className="w-4 h-4 mr-2" />
            Saisie manuelle
          </Button>
          <div className="flex gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}
            className="text-slate-400 hover:text-slate-100 border border-white/10">
            Annuler
          </Button>
          <Button
            onClick={handleImport}
            disabled={uploading || files.length === 0 || !selectedAudit}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold min-w-[120px]"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Envoi…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Traiter {files.length > 0 && `(${files.length})`}
              </span>
            )}
          </Button>
          </div>
        </div>
      </DialogContent>
      <ManualInvoiceForm
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSaved={onImportComplete}
      />
    </Dialog>
  );
}
