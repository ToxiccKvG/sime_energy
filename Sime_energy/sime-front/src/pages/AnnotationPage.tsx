import { useState, useEffect, useMemo, useRef } from 'react';
import { PDFAnnotationViewer } from '@/components/invoices/PDFAnnotationViewer';
import { AnnotationDictionaryDialog } from '@/components/invoices/AnnotationDictionaryDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Tag,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { updateInvoice, getAuditInvoices } from '@/lib/invoice-service';
import type { AuditInvoice } from '@/lib/invoice-service';
import type { StructuredExtractedData } from '@/services/invoiceService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAnnotationDictionary } from '@/hooks/useAnnotationDictionary';
import type { ValidationResult } from '@/types/annotation-dictionary';
import { transformInvoiceTablesToJsonWithRetry } from '@/services/invoiceService';

interface FormField {
  Key: string;
  Value: string;
  box: [number, number, number, number] | undefined;
}

export function AnnotationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<AuditInvoice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [extractedData, setExtractedData] = useState<StructuredExtractedData[]>([]);
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [verifyWarningOpen, setVerifyWarningOpen] = useState(false);
  const pendingSaves = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const auditId = searchParams.get('auditId');

  /**
   * Planifie une sauvegarde avec debounce pour éviter un appel backend à chaque frappe.
   */
  const scheduleOcrSave = (
    key: string,
    saveFn: () => Promise<void>,
    delay = 400
  ) => {
    const current = pendingSaves.current[key];
    if (current) clearTimeout(current);

    pendingSaves.current[key] = setTimeout(async () => {
      try {
        await saveFn();
      } catch (error) {
        console.error('Erreur lors de la sauvegarde OCR:', error);
        toast.error('Erreur lors de la sauvegarde');
      }
    }, delay);
  };

  // Hook pour les dictionnaires d'annotation
  const {
    dictionaries,
    currentDictionary,
    displaySettings,
    isLoading: isDictionaryLoading,
    isSaving: isDictionarySaving,
    selectDictionary,
    createNewDictionary,
    updateDictionaryById,
    deleteDictionaryById,
    addField,
    updateField,
    removeField,
    addTableTemplate,
    updateTableTemplate,
    removeTableTemplate,
    toggleShowLabels,
    resetToDefault,
    validateFields,
  } = useAnnotationDictionary();

  // Load invoices when page opens
  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      try {
        let data: AuditInvoice[] = [];

        if (auditId) {
          data = await getAuditInvoices(auditId);
        } else {
          const { supabase } = await import('@/lib/supabase');
          const { data: allInvoices, error } = await supabase
            .from('audit_invoices')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;
          data = allInvoices || [];
        }

        setInvoices(data);
      } catch (error) {
        console.error('Error loading invoices:', error);
        toast.error('Erreur lors du chargement des factures');
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [auditId]);

  // Convert invoices to StructuredExtractedData on load
  useEffect(() => {
    const structured = invoices.map((invoice) => {
      let formsArray: FormField[] = [];
      let tablesArray: Array<{
        box?: [number, number, number, number];
        rows?: Array<Array<{ text: string; box?: [number, number, number, number] }>>;
      }> = [];
      let pageImage: string | undefined;

      // Handle backend structure
      const ocrData = invoice.ocr_data as {
        page?: Array<{
          page_number: number;
          forms?: FormField[];
          tables?: typeof tablesArray;
          image?: string;
        }>;
        pages?: Array<{
          page_number: number;
          forms?: FormField[];
          tables?: typeof tablesArray;
          image?: string;
        }>;
        forms?: FormField[];
        tables?: typeof tablesArray;
      };

      if (ocrData?.page && Array.isArray(ocrData.page) && ocrData.page.length > 0) {
        const firstPage = ocrData.page[0];
        formsArray = firstPage.forms || [];
        tablesArray = firstPage.tables || [];
        pageImage = firstPage.image;
      } else if (ocrData?.pages && Array.isArray(ocrData.pages) && ocrData.pages.length > 0) {
        const firstPage = ocrData.pages[0];
        formsArray = firstPage.forms || [];
        tablesArray = firstPage.tables || [];
        pageImage = firstPage.image;
      } else if (Array.isArray(ocrData)) {
        formsArray = ocrData as FormField[];
      } else if (ocrData?.forms) {
        formsArray = ocrData.forms;
        tablesArray = ocrData.tables || [];
      }

      return {
        isPdf: invoice.file_name?.endsWith('.pdf') ?? false,
        fileName: invoice.file_name || 'facture',
        pageNumber: 1,
        sections: {},
        customFields: {},
        forms: formsArray,
        tables: tablesArray,
        pageImage,
      } as StructuredExtractedData;
    });
    setExtractedData(structured);
  }, [invoices]);

  // Calculer la validation pour la facture courante (forms + tables)
  const currentValidation = useMemo((): ValidationResult | undefined => {
    if (!extractedData[currentIndex]) return undefined;
    const forms = extractedData[currentIndex].forms as FormField[] | undefined;
    const tables = extractedData[currentIndex].tables as Array<{
      box?: [number, number, number, number];
      rows?: Array<Array<{ text: string; box?: [number, number, number, number] }>>;
    }> | undefined;
    if (!forms) return undefined;
    return validateFields(forms, tables);
  }, [extractedData, currentIndex, validateFields]);

  const handleFieldUpdate = async (pageIndex: number, fieldKey: string, newValue: string) => {
    if (!invoices[pageIndex]) return;

    try {
      const invoice = invoices[pageIndex];
      const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

      const ocrWithPages = updatedOcrData as {
        page?: Array<{ forms?: FormField[] }>;
        pages?: Array<{ forms?: FormField[] }>;
        forms?: FormField[];
      };

      if (ocrWithPages.pages?.[0]?.forms) {
        ocrWithPages.pages[0].forms = ocrWithPages.pages[0].forms.map((form) =>
          form.Key === fieldKey ? { ...form, Value: newValue } : form
        );
      } else if (ocrWithPages.page?.[0]?.forms) {
        ocrWithPages.page[0].forms = ocrWithPages.page[0].forms.map((form) =>
          form.Key === fieldKey ? { ...form, Value: newValue } : form
        );
      } else if (ocrWithPages.forms) {
        ocrWithPages.forms = ocrWithPages.forms.map((form) =>
          form.Key === fieldKey ? { ...form, Value: newValue } : form
        );
      } else if (Array.isArray(updatedOcrData)) {
        const forms = updatedOcrData as FormField[];
        forms.forEach((form) => {
          if (form.Key === fieldKey) form.Value = newValue;
        });
      }

      // Mise à jour optimiste
      const newInvoices = [...invoices];
      newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
      setInvoices(newInvoices);

      const newExtractedData = [...extractedData];
      const forms = newExtractedData[pageIndex]?.forms as FormField[] | undefined;
      if (forms) {
        newExtractedData[pageIndex] = {
          ...newExtractedData[pageIndex],
          forms: forms.map((f) => (f.Key === fieldKey ? { ...f, Value: newValue } : f)),
        };
      }
      setExtractedData(newExtractedData);

      // Sauvegarde backend debouncée
      scheduleOcrSave(
        `form-value-${pageIndex}-${fieldKey}`,
        () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
      );

      toast.success('Valeur modifiée');
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Erreur lors de la modification');
    } finally {
      // Pas de blocage UI global pendant la sauvegarde inline
    }
  };

  const handleAddField = (pageIndex: number) => {
    const invoice = invoices[pageIndex];
    if (!invoice) return;

    const newKey = `nouveau_champ_${Date.now()}`;
    const newForm: FormField = { Key: newKey, Value: '', box: undefined };
    const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

    const ocrWithPages = updatedOcrData as {
      page?: Array<{ forms?: FormField[] }>;
      pages?: Array<{ forms?: FormField[] }>;
      forms?: FormField[];
    };

    if (ocrWithPages.pages?.[0]) {
      ocrWithPages.pages[0].forms = [...(ocrWithPages.pages[0].forms || []), newForm];
    } else if (ocrWithPages.page?.[0]) {
      ocrWithPages.page[0].forms = [...(ocrWithPages.page[0].forms || []), newForm];
    } else if (ocrWithPages.forms) {
      ocrWithPages.forms = [...ocrWithPages.forms, newForm];
    } else if (Array.isArray(updatedOcrData)) {
      (updatedOcrData as FormField[]).push(newForm);
    } else {
      updatedOcrData.forms = [newForm] as unknown as FormField[];
    }

    const newInvoices = [...invoices];
    newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
    setInvoices(newInvoices);

    const newExtractedData = [...extractedData];
    const forms = (newExtractedData[pageIndex]?.forms as FormField[] | undefined) || [];
    newExtractedData[pageIndex] = {
      ...(newExtractedData[pageIndex] || {}),
      forms: [...forms, newForm],
    } as StructuredExtractedData;
    setExtractedData(newExtractedData);

    scheduleOcrSave(
      `form-add-${pageIndex}-${newKey}`,
      () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
    );
  };

  const handleFieldKeyUpdate = async (pageIndex: number, oldKey: string, newKey: string) => {
    if (!invoices[pageIndex] || oldKey === newKey) return;

    try {
      const invoice = invoices[pageIndex];
      const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

      const ocrWithPages = updatedOcrData as {
        page?: Array<{ forms?: FormField[] }>;
        pages?: Array<{ forms?: FormField[] }>;
        forms?: FormField[];
      };

      if (ocrWithPages.pages?.[0]?.forms) {
        ocrWithPages.pages[0].forms = ocrWithPages.pages[0].forms.map((form) =>
          form.Key === oldKey ? { ...form, Key: newKey } : form
        );
      } else if (ocrWithPages.page?.[0]?.forms) {
        ocrWithPages.page[0].forms = ocrWithPages.page[0].forms.map((form) =>
          form.Key === oldKey ? { ...form, Key: newKey } : form
        );
      } else if (ocrWithPages.forms) {
        ocrWithPages.forms = ocrWithPages.forms.map((form) =>
          form.Key === oldKey ? { ...form, Key: newKey } : form
        );
      } else if (Array.isArray(updatedOcrData)) {
        const forms = updatedOcrData as FormField[];
        forms.forEach((form) => {
          if (form.Key === oldKey) form.Key = newKey;
        });
      }

      // Mise à jour optimiste
      const newInvoices = [...invoices];
      newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
      setInvoices(newInvoices);

      const newExtractedData = [...extractedData];
      const forms = newExtractedData[pageIndex]?.forms as FormField[] | undefined;
      if (forms) {
        newExtractedData[pageIndex] = {
          ...newExtractedData[pageIndex],
          forms: forms.map((f) => (f.Key === oldKey ? { ...f, Key: newKey } : f)),
        };
      }
      setExtractedData(newExtractedData);

      // Sauvegarde backend debouncée
      scheduleOcrSave(
        `form-key-${pageIndex}-${oldKey}`,
        () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
      );

      toast.success('Clé modifiée');
    } catch (error) {
      console.error('Error updating field key:', error);
      toast.error('Erreur lors de la modification de la clé');
    } finally {
      // Pas de blocage UI global pendant la sauvegarde inline
    }
  };

  const handleTableCellUpdate = async (
    pageIndex: number,
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    newValue: string
  ) => {
    if (!invoices[pageIndex]) return;

    try {
      const invoice = invoices[pageIndex];
      const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

      type TableCell = { text: string; box?: [number, number, number, number] };
      type TableStructure = { rows?: TableCell[][] };
      const ocrWithTables = updatedOcrData as {
        pages?: Array<{ tables?: TableStructure[] }>;
        tables?: TableStructure[];
      };

      if (ocrWithTables.pages?.[0]?.tables?.[tableIndex]?.rows?.[rowIndex]?.[cellIndex]) {
        ocrWithTables.pages[0].tables[tableIndex].rows[rowIndex][cellIndex] = {
          ...ocrWithTables.pages[0].tables[tableIndex].rows[rowIndex][cellIndex],
          text: newValue,
        };
      } else if (ocrWithTables.tables?.[tableIndex]?.rows?.[rowIndex]?.[cellIndex]) {
        ocrWithTables.tables[tableIndex].rows[rowIndex][cellIndex] = {
          ...ocrWithTables.tables[tableIndex].rows[rowIndex][cellIndex],
          text: newValue,
        };
      }

      // Mise à jour optimiste
      const newInvoices = [...invoices];
      newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
      setInvoices(newInvoices);

      const newExtractedData = [...extractedData];
      const tables = newExtractedData[pageIndex]?.tables;
      if (tables?.[tableIndex]?.rows?.[rowIndex]?.[cellIndex]) {
        tables[tableIndex].rows[rowIndex][cellIndex] = {
          ...tables[tableIndex].rows[rowIndex][cellIndex],
          text: newValue,
        };
      }
      setExtractedData(newExtractedData);

      // Sauvegarde backend debouncée
      scheduleOcrSave(
        `table-cell-${pageIndex}-${tableIndex}-${rowIndex}-${cellIndex}`,
        () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
      );

      toast.success('Cellule modifiée');
    } catch (error) {
      console.error('Error updating table cell:', error);
      toast.error('Erreur lors de la modification');
    } finally {
      // Pas de blocage UI global pendant la sauvegarde inline
    }
  };

  const handleAddTable = (pageIndex: number) => {
    const invoice = invoices[pageIndex];
    if (!invoice) return;

    const newTable = {
      box: undefined,
      rows: [[{ text: '', box: undefined }]],
    };
    const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

    const ocrWithTables = updatedOcrData as {
      page?: Array<{ tables?: any[] }>;
      pages?: Array<{ tables?: any[] }>;
      tables?: any[];
    };

    if (ocrWithTables.pages?.[0]) {
      ocrWithTables.pages[0].tables = [...(ocrWithTables.pages[0].tables || []), newTable];
    } else if (ocrWithTables.page?.[0]) {
      ocrWithTables.page[0].tables = [...(ocrWithTables.page[0].tables || []), newTable];
    } else if (ocrWithTables.tables) {
      ocrWithTables.tables = [...ocrWithTables.tables, newTable];
    } else if (Array.isArray(updatedOcrData)) {
      (updatedOcrData as any[]).push({ tables: [newTable] });
    } else {
      updatedOcrData.tables = [newTable] as any;
    }

    const newInvoices = [...invoices];
    newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
    setInvoices(newInvoices);

    const newExtractedData = [...extractedData];
    const tables = (newExtractedData[pageIndex]?.tables as any[] | undefined) || [];
    newExtractedData[pageIndex] = {
      ...(newExtractedData[pageIndex] || {}),
      tables: [...tables, newTable],
    } as StructuredExtractedData;
    setExtractedData(newExtractedData);

    scheduleOcrSave(
      `table-add-${pageIndex}-${Date.now()}`,
      () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
    );
  };

  const handleDeleteTable = async (pageIndex: number, tableIndex: number) => {
    const invoice = invoices[pageIndex];
    if (!invoice) return;

    const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };
    const ocrWithTables = updatedOcrData as {
      page?: Array<{ tables?: any[] }>;
      pages?: Array<{ tables?: any[] }>;
      tables?: any[];
    };

    const removeAt = (tables?: any[]) => tables?.filter((_, idx) => idx !== tableIndex) || [];

    if (ocrWithTables.pages?.[0]?.tables) {
      ocrWithTables.pages[0].tables = removeAt(ocrWithTables.pages[0].tables);
    } else if (ocrWithTables.page?.[0]?.tables) {
      ocrWithTables.page[0].tables = removeAt(ocrWithTables.page[0].tables);
    } else if (ocrWithTables.tables) {
      ocrWithTables.tables = removeAt(ocrWithTables.tables);
    }

    const newInvoices = [...invoices];
    newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
    setInvoices(newInvoices);

    const newExtractedData = [...extractedData];
    const tables = (newExtractedData[pageIndex]?.tables as any[] | undefined) || [];
    newExtractedData[pageIndex] = {
      ...(newExtractedData[pageIndex] || {}),
      tables: removeAt(tables),
    } as StructuredExtractedData;
    setExtractedData(newExtractedData);

    scheduleOcrSave(
      `table-del-${pageIndex}-${tableIndex}`,
      () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
    );
  };

  const handleFieldDelete = async (pageIndex: number, fieldKey: string) => {
    if (!invoices[pageIndex]) return;

    if (fieldKey.toLowerCase() === 'image') {
      toast.error('Impossible de supprimer le champ image');
      return;
    }

    try {
      const invoice = invoices[pageIndex];
      const updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

      const ocrWithPages = updatedOcrData as {
        page?: Array<{ forms?: FormField[] }>;
        pages?: Array<{ forms?: FormField[] }>;
        forms?: FormField[];
      };

      if (ocrWithPages.pages?.[0]?.forms) {
        ocrWithPages.pages[0].forms = ocrWithPages.pages[0].forms.filter(
          (f) => f.Key !== fieldKey
        );
      } else if (ocrWithPages.page?.[0]?.forms) {
        ocrWithPages.page[0].forms = ocrWithPages.page[0].forms.filter(
          (f) => f.Key !== fieldKey
        );
      } else if (ocrWithPages.forms) {
        ocrWithPages.forms = ocrWithPages.forms.filter((f) => f.Key !== fieldKey);
      } else if (Array.isArray(updatedOcrData)) {
        const forms = updatedOcrData as FormField[];
        const idx = forms.findIndex((f) => f.Key === fieldKey);
        if (idx !== -1) forms.splice(idx, 1);
      }

      // Mise à jour optimiste
      const newInvoices = [...invoices];
      newInvoices[pageIndex] = { ...invoice, ocr_data: updatedOcrData };
      setInvoices(newInvoices);

      const newExtractedData = [...extractedData];
      const forms = newExtractedData[pageIndex]?.forms as FormField[] | undefined;
      if (forms) {
        newExtractedData[pageIndex] = {
          ...newExtractedData[pageIndex],
          forms: forms.filter((f) => f.Key !== fieldKey),
        };
      }
      setExtractedData(newExtractedData);

      // Sauvegarde backend debouncée
      scheduleOcrSave(
        `form-delete-${pageIndex}-${fieldKey}`,
        () => updateInvoice(invoice.id, { ocr_data: updatedOcrData })
      );

      toast.success('Champ supprimé');
    } catch (error) {
      console.error('Error deleting field:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      // Pas de blocage UI global pendant la sauvegarde inline
    }
  };

  const handleAttemptMarkAsVerified = () => {
    if (!currentValidation) {
      handleMarkAsVerified();
      return;
    }

    if (!currentValidation.isValid) {
      toast.error(
        `Impossible de vérifier: ${currentValidation.missingRequiredFields.length} champ(s) obligatoire(s) manquant(s)`,
        {
          description: currentValidation.missingRequiredFields.map((f) => f.key).join(', '),
        }
      );
      return;
    }

    if (currentValidation.extraFields.length > 0) {
      setVerifyWarningOpen(true);
      return;
    }

    handleMarkAsVerified();
  };

  const handleMarkAsVerified = async () => {
    if (!invoices[currentIndex]) return;

    const invoice = invoices[currentIndex];
    setVerifying(true);
    try {
      // Préparer les mappings de templates de tableaux (pour nommer les sections côté backend)
      const tableMappings =
        currentValidation?.tableRecognition
          .filter((t) => t.isRecognized && t.matchedTemplate?.name)
          .map((t) => ({
            tableIndex: t.tableIndex,
            tableName: t.matchedTemplate!.name,
          })) || [];

      // Appeler la transformation backend (avec retry/backoff) avant de marquer comme vérifiée
      // On continue même en cas d'échec, mais on notifie l'utilisateur.
      let transformOk = false;
      let transformResult = null;
      try {
        console.log('Envoi transformation backend:', {
          extractedData: extractedData[currentIndex],
          tableMappings,
          dictionaryName: currentDictionary?.name,
          dictionaryId: currentDictionary?.id
        });

        transformResult = await transformInvoiceTablesToJsonWithRetry(
          [extractedData[currentIndex]],
          tableMappings,
          currentDictionary?.name,
          currentDictionary?.id
        );

        console.log('Résultat transformation reçu:', transformResult);
        console.log('UnifiedData (paires clé-valeur):', transformResult?.unifiedData);
        console.log('Tables détaillées:', transformResult?.tables);
        console.log('Processing info:', transformResult?.processingInfo);
        transformOk = true;
      } catch (err) {
        console.error('Erreur transformation tables -> JSON :', err);

        // Différencier les types d'erreur pour un meilleur feedback utilisateur
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        if (errorMessage.includes('Timeout')) {
          toast.error("Transformation annulée : délai dépassé. Réessayez plus tard.");
        } else if (errorMessage.includes('non-retryable')) {
          toast.error("Erreur de configuration. Vérifiez les données et réessayez.");
        } else {
          toast.error("Transformation des tableaux échouée après plusieurs tentatives.");
        }
      }

      let updatedOcrData = { ...(invoice.ocr_data as Record<string, unknown>) };

      const ocrWithPages = updatedOcrData as {
        pages?: Array<{ forms?: FormField[] }>;
        forms?: FormField[];
      };
      const currentForms = extractedData[currentIndex].forms as FormField[] | undefined;

      if (ocrWithPages.pages?.[0]) {
        ocrWithPages.pages[0].forms = currentForms || [];
      } else if (ocrWithPages.forms) {
        ocrWithPages.forms = currentForms || [];
      } else if (Array.isArray(updatedOcrData)) {
        updatedOcrData = (currentForms || []) as unknown as Record<string, unknown>;
      }

      // Préparer les données vérifiées avec le résultat de transformation
      let verifiedData = null;

      // Toujours créer verifiedData, même sans transformation backend réussie
      // Car on veut au minimum sauvegarder les forms
      const createVerifiedData = (backendResult?: any) => {
        // Fusionner les forms (paires clé-valeur OCR) avec unifiedData (tableaux transformés)
        const mergedUnifiedData: Record<string, any> = {
          ...(backendResult?.unifiedData || {})
        };

        // Ajouter les forms au unifiedData si elles ne sont pas déjà présentes
        if (currentForms && currentForms.length > 0) {
          currentForms.forEach(form => {
            // Ne pas écraser si la clé existe déjà dans unifiedData (priorité aux tableaux)
            if (form.Key && form.Value && !mergedUnifiedData.hasOwnProperty(form.Key)) {
              mergedUnifiedData[form.Key] = form.Value;
            }
          });
        }

        console.log('Fusion des données:');
        console.log('  - unifiedData (tableaux):', backendResult?.unifiedData);
        console.log('  - forms (OCR) count:', currentForms?.length || 0);
        console.log('  - mergedUnifiedData keys:', Object.keys(mergedUnifiedData));
        console.log('  - mergedUnifiedData (final):', mergedUnifiedData);

        return {
          fileName: backendResult?.fileName || extractedData[currentIndex].fileName,
          pageNumber: backendResult?.pageNumber || extractedData[currentIndex].pageNumber || 1,
          dictionary: backendResult?.dictionary,
          unifiedData: mergedUnifiedData,  //  Données fusionnées (forms + tableaux)
          processingInfo: backendResult?.processingInfo || {
            tableCount: 0,
            totalConsumption: null,
            totalAmount: null,
            hasTemplates: false
          },
          transformedAt: new Date().toISOString()
        };
      };

      if (transformOk && transformResult) {
        console.log('Préparation ocr_data_verified avec transformation backend');
        verifiedData = createVerifiedData(transformResult);
      } else if (currentForms && currentForms.length > 0) {
        // Même sans transformation backend, sauvegarder les forms
        console.log('Préparation ocr_data_verified sans transformation backend (forms uniquement)');
        verifiedData = createVerifiedData();
      }

      if (verifiedData) {
        console.log('Vérification du contenu final:');
        console.log('  - unifiedData keys:', Object.keys(verifiedData.unifiedData));
        console.log('  - tables count:', verifiedData.tables?.length);
        console.log('Contenu détaillé de ocr_data_verified:', JSON.stringify(verifiedData, null, 2));
      }

      await updateInvoice(invoice.id, {
        status: 'verified',
        ocr_data: updatedOcrData,
        ocr_data_verified: verifiedData,
      });

      const newInvoices = [...invoices];
      newInvoices[currentIndex] = {
        ...invoice,
        status: 'verified',
        ocr_data: updatedOcrData,
        ocr_data_verified: verifiedData,
      };
      setInvoices(newInvoices);

      if (verifiedData) {
        const tableCount = verifiedData.tables?.length || 0;
        const totalFields = Object.keys(verifiedData.unifiedData || {}).length;
        const formsCount = currentForms?.length || 0;

        if (transformOk) {
          toast.success(
            `Facture vérifiée et transformée (${totalFields} champ${totalFields > 1 ? 's' : ''} extraits: ${formsCount} form${formsCount > 1 ? 's' : ''} + ${tableCount} tableau${tableCount > 1 ? 'x' : ''})`
          );
        } else {
          toast.success(
            `Facture vérifiée (${totalFields} champ${totalFields > 1 ? 's' : ''} extraits)`
          );
        }
      } else if (!transformOk) {
        toast.warning("Facture vérifiée, mais aucune donnée n'a pu être extraite");
      } else {
        toast.success('Facture marquée comme vérifiée');
      }
      setVerifyWarningOpen(false);
    } catch (error) {
      console.error('Error marking as verified:', error);
      toast.error('Erreur lors de la vérification');
    } finally {
      setVerifying(false);
    }
  };

  const currentInvoice = invoices[currentIndex];

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-[#0b0d14] p-6 text-slate-50 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Annotation des factures</h1>
          <p className="mt-1 text-slate-400">Modifiez et vérifiez les champs extraits par OCR</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sélecteur de dictionnaire */}
          <div className="flex items-center gap-2">
            <Select
              value={currentDictionary?.id || ''}
              onValueChange={selectDictionary}
            >
              <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white h-9">
                <div className="flex items-center gap-2">
                  <SelectValue placeholder="Dictionnaire" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-[#0b0d14] border-white/10">
                {dictionaries.map((dict) => (
                  <SelectItem
                    key={dict.id}
                    value={dict.id}
                    className="text-white hover:bg-white/10 focus:bg-white/10"
                  >
                    <div className="flex items-center gap-2">
                      {dict.color && (
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: dict.color }}
                        />
                      )}
                      <span>{dict.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggle Labels */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleShowLabels}
                  className={`h-9 px-3 border ${
                    displaySettings.showLabels
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/10 bg-white/5 text-slate-400'
                  } hover:bg-white/10`}
                >
                  {displaySettings.showLabels ? (
                    <Tag className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-slate-800 border-white/10">
                <p className="text-xs">
                  {displaySettings.showLabels ? 'Masquer les labels' : 'Afficher les labels'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Bouton Paramètres */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDictionaryOpen(true)}
            className="h-9 border border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/facturation')}
            className="h-9 border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <X className="mr-2 h-4 w-4" />
            Retour
          </Button>
        </div>
      </div>

      {loading || isDictionaryLoading ? (
        <Card className="p-12 flex items-center justify-center border-white/10 bg-white/5">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-slate-400">Chargement des factures...</p>
          </div>
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="p-12 flex items-center justify-center border-white/10 bg-white/5">
          <div className="text-center space-y-4">
            <p className="text-slate-300 text-lg">Aucune facture à annoter</p>
            <Button onClick={() => navigate('/facturation')}>Retour à la facturation</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Navigation et Info */}
          <Card className="p-4 border-white/10 bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Dictionnaire</p>
                  <div className="flex items-center gap-2">
                    {currentDictionary?.color && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: currentDictionary.color }}
                      />
                    )}
                    <p className="font-semibold text-sm text-white">
                      {currentDictionary?.name || 'Aucun'}
                    </p>
                  </div>
                </div>
                <div className="border-l border-white/10 h-8" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">
                    Facture actuelle
                  </p>
                  <p className="font-semibold text-white">
                    {currentInvoice?.file_name}
                    <span className="text-sm text-slate-400 ml-2">
                      ({currentIndex + 1} / {invoices.length})
                    </span>
                  </p>
                </div>
                <div className="border-l border-white/10 h-8" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Statut</p>
                  <p
                    className={`font-semibold text-sm ${
                      currentInvoice?.status === 'verified'
                        ? 'text-emerald-400'
                        : 'text-orange-400'
                    }`}
                  >
                    {currentInvoice?.status === 'verified'
                      ? '✓ Vérifiée'
                      : currentInvoice?.status === 'processing'
                        ? '⏳ En cours'
                        : currentInvoice?.status}
                  </p>
                </div>

                {/* Indicateurs de validation */}
                {currentValidation && (
                  <>
                    <div className="border-l border-white/10 h-8" />
                    <div className="flex items-center gap-2">
                      {currentValidation.isValid ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Champs OK
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {currentValidation.missingRequiredFields.length} manquant(s)
                        </Badge>
                      )}
                      {currentValidation.extraFields.length > 0 && (
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {currentValidation.extraFields.length} extra
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0 || verifying}
                  title="Facture précédente"
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentIndex(Math.min(invoices.length - 1, currentIndex + 1))}
                  disabled={currentIndex === invoices.length - 1 || verifying}
                  title="Facture suivante"
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="border-l border-white/10 mx-1" />
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleAttemptMarkAsVerified}
                  disabled={verifying || currentInvoice?.status === 'verified'}
                  className={
                    currentInvoice?.status === 'verified'
                      ? 'bg-emerald-600/50 text-white cursor-not-allowed'
                      : currentValidation?.isValid === false
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                  }
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : currentInvoice?.status === 'verified' ? (
                    '✓ Vérifiée'
                  ) : currentValidation?.isValid === false ? (
                    'Champs manquants'
                  ) : (
                    'Marquer comme vérifiée'
                  )}
                </Button>
              </div>
            </div>
          </Card>

          {/* Champs manquants (si applicable) */}
          {currentValidation && currentValidation.missingRequiredFields.length > 0 && (
            <Card className="p-4 border-red-500/30 bg-red-500/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-300">Champs obligatoires manquants</p>
                  <p className="text-sm text-red-400 mt-1">
                    {currentValidation.missingRequiredFields.map((f) => f.key).join(', ')}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Annotation Viewer */}
          <Card className="p-6 overflow-hidden border-white/10 bg-white/5">
            <PDFAnnotationViewer
              extractedData={extractedData}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
              onFieldUpdate={handleFieldUpdate}
              onFieldKeyUpdate={handleFieldKeyUpdate}
              onFieldDelete={handleFieldDelete}
              onFieldAdd={handleAddField}
              onTableCellUpdate={handleTableCellUpdate}
              onTableAdd={handleAddTable}
              onTableDelete={handleDeleteTable}
              validationResult={currentValidation}
              showLabels={displaySettings.showLabels}
            />
          </Card>
        </>
      )}

      {/* Dialog des dictionnaires */}
      <AnnotationDictionaryDialog
        open={isDictionaryOpen}
        onOpenChange={setIsDictionaryOpen}
        dictionaries={dictionaries}
        currentDictionary={currentDictionary}
        onSelectDictionary={selectDictionary}
        onCreateDictionary={createNewDictionary}
        onUpdateDictionary={updateDictionaryById}
        onDeleteDictionary={deleteDictionaryById}
        onAddField={addField}
        onUpdateField={updateField}
        onRemoveField={removeField}
        onAddTableTemplate={addTableTemplate}
        onUpdateTableTemplate={updateTableTemplate}
        onRemoveTableTemplate={removeTableTemplate}
        onResetToDefault={resetToDefault}
        isSaving={isDictionarySaving}
      />

      {/* Dialog d'avertissement pour les champs supplémentaires */}
      <AlertDialog open={verifyWarningOpen} onOpenChange={setVerifyWarningOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0b0d14] text-slate-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-50">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Champs supplémentaires détectés
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-slate-400">
              <p>
                {currentValidation?.extraFields.length} champ(s) ne correspondent pas au
                dictionnaire "{currentDictionary?.name}" :
              </p>
              <ul className="list-disc list-inside text-sm text-orange-400">
                {currentValidation?.extraFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <p className="text-sm">Voulez-vous quand même marquer cette facture comme vérifiée ?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkAsVerified}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Vérifier quand même
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
