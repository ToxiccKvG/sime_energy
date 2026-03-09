/**
 * Workflow complet de gestion des factures
 * Intègre l'import, la vérification et l'annotation
 */

import { useState } from 'react';
import { StructuredExtractedData } from '@/services/invoiceService';
import { generateCSV, downloadCSV, exportToExcel } from '@/services/exportService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { InvoiceImportDialog } from './InvoiceImportDialog';
import { PDFAnnotationViewer } from './PDFAnnotationViewer';
import { Upload, CheckCircle2, FileText, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type WorkflowStep = 'import' | 'verification' | 'export';

interface InvoiceWorkflowProps {
  auditId?: string;
}

export function InvoiceWorkflow({ auditId }: InvoiceWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('import');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [extractedData, setExtractedData] = useState<StructuredExtractedData[]>([]);
  const [currentDataIndex, setCurrentDataIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExtractedDataReceived = (data: StructuredExtractedData[], selectedAuditId: string) => {
    setExtractedData(data);
    if (data.length > 0) {
      setCurrentStep('verification');
    }
  };

  const handleFieldUpdate = (pageIndex: number, fieldKey: string, newValue: string) => {
    const newData = [...extractedData];
    const data = newData[pageIndex];

    // Mettre à jour dans les sections
    const sections = data.sections || {};
    for (const sectionName of Object.keys(sections)) {
      if (sections[sectionName][fieldKey]) {
        sections[sectionName][fieldKey].value = newValue;
        break;
      }
    }

    // Mettre à jour dans les champs personnalisés
    const customFields = data.customFields || {};
    if (customFields[fieldKey]) {
      customFields[fieldKey].value = newValue;
    }

    // Mettre à jour dans les formulaires PDF
    if (data.forms) {
      const formIndex = data.forms.findIndex(f => f.Key === fieldKey);
      if (formIndex !== -1) {
        data.forms[formIndex].Value = newValue;
      }
    }

    newData[pageIndex] = data;
    setExtractedData(newData);
  };

  const handleFieldDelete = (pageIndex: number, fieldKey: string) => {
    const newData = [...extractedData];
    const data = newData[pageIndex];

    // Supprimer des sections
    const sections = data.sections || {};
    for (const sectionName of Object.keys(sections)) {
      if (sections[sectionName][fieldKey]) {
        delete sections[sectionName][fieldKey];
        break;
      }
    }

    // Supprimer des champs personnalisés
    const customFields = data.customFields || {};
    if (customFields[fieldKey]) {
      delete customFields[fieldKey];
    }

    // Supprimer des formulaires PDF
    if (data.forms) {
      data.forms = data.forms.filter(f => f.Key !== fieldKey);
    }

    newData[pageIndex] = data;
    setExtractedData(newData);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Convertir les données extraites en format CSV
      const csvData = extractedData.map((data, idx) => ({
        'Document': data.fileName,
        'Page': data.pageNumber || 1,
        ...Object.entries(data.customFields || {}).reduce((acc, [key, field]) => {
          acc[key] = field.value || '';
          return acc;
        }, {} as Record<string, string>),
      }));

      const csv = generateCSV(csvData);
      const filename = `factures_extraites_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csv, filename);

      toast({
        title: 'Export réussi',
        description: `Les données ont été exportées en CSV (${extractedData.length} document(s))`,
      });
    } catch (error) {
      toast({
        title: 'Erreur lors de l\'export',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Convertir les données extraites en format Excel
      const excelData = extractedData.map((data, idx) => ({
        'Document': data.fileName,
        'Page': data.pageNumber || 1,
        ...Object.entries(data.customFields || {}).reduce((acc, [key, field]) => {
          acc[key] = field.value || '';
          return acc;
        }, {} as Record<string, string>),
      }));

      await exportToExcel(
        excelData,
        `factures_extraites_${new Date().toISOString().split('T')[0]}`
      );

      toast({
        title: 'Export réussi',
        description: `Les données ont été exportées en Excel (${extractedData.length} document(s))`,
      });
    } catch (error) {
      toast({
        title: 'Erreur lors de l\'export',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Gestion des factures</h1>
        <p className="mt-1 text-muted-foreground">
          Import, vérification et annotation des données extraites
        </p>
      </div>

      {/* Statut */}
      {extractedData.length > 0 && (
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">
                {extractedData.length} facture(s) extraite(s)
              </p>
              <p className="text-sm text-green-700">
                {extractedData.reduce((acc, data) => {
                  const sections = data.sections || {};
                  const customFields = data.customFields || {};
                  const count =
                    Object.values(sections).reduce((s, fields) => s + Object.keys(fields).length, 0) +
                    Object.keys(customFields).length;
                  return acc + count;
                }, 0)}{' '}
                champ(s) extrait(s)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Contenu principal */}
      <Tabs value={currentStep} onValueChange={(v: any) => setCurrentStep(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import
            {extractedData.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {extractedData.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="verification" disabled={extractedData.length === 0} className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Vérification
          </TabsTrigger>
          <TabsTrigger value="export" disabled={extractedData.length === 0} className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Onglet Import */}
        <TabsContent value="import" className="space-y-4">
          <Card className="p-6">
            {extractedData.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-8">
                <div className="rounded-full bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Importer vos factures</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Commencez par sélectionner et uploader vos fichiers PDF ou Excel
                  </p>
                </div>
                <Button onClick={() => setImportDialogOpen(true)} className="mt-4">
                  <Upload className="mr-2 h-4 w-4" />
                  Importer des factures
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{extractedData.length} facture(s) importée(s)</p>
                    <p className="text-sm text-muted-foreground">
                      Cliquez sur "Importer plus" pour ajouter d'autres factures
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importer plus
                  </Button>
                </div>

                <div className="space-y-2">
                  {extractedData.map((data, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <FileText className="h-4 w-4 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{data.fileName}</p>
                        {data.pageNumber && (
                          <p className="text-xs text-muted-foreground">Page {data.pageNumber}</p>
                        )}
                      </div>
                      <Badge variant="secondary">
                        {Object.keys(data.customFields || {}).length +
                          Object.values(data.sections || {}).reduce((s, fields) => s + Object.keys(fields).length, 0)}{' '}
                        champs
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Onglet Vérification */}
        <TabsContent value="verification" className="space-y-4">
          {extractedData.length > 0 && (
            <PDFAnnotationViewer
              extractedData={extractedData}
              currentIndex={currentDataIndex}
              onIndexChange={setCurrentDataIndex}
              onFieldUpdate={handleFieldUpdate}
              onFieldDelete={handleFieldDelete}
            />
          )}
        </TabsContent>

        {/* Onglet Export */}
        <TabsContent value="export" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">Export des données extraites</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Téléchargez les données extraites dans le format de votre choix
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={handleExportCSV}
                    disabled={isExporting || extractedData.length === 0}
                    className="h-24 flex flex-col items-center justify-center gap-2"
                    variant="outline"
                  >
                    {isExporting ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-6 w-6" />
                        <span>Exporter en CSV</span>
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleExportExcel}
                    disabled={isExporting || extractedData.length === 0}
                    className="h-24 flex flex-col items-center justify-center gap-2"
                    variant="outline"
                  >
                    {isExporting ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-6 w-6" />
                        <span>Exporter en Excel</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Résumé de l'export</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">Documents</p>
                    <p className="text-2xl font-bold text-foreground">{extractedData.length}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">Champs</p>
                    <p className="text-2xl font-bold text-foreground">
                      {extractedData.reduce((acc, data) => {
                        return acc + Object.keys(data.customFields || {}).length;
                      }, 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">Format</p>
                    <p className="text-sm font-medium text-foreground">CSV/Excel</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog d'import */}
      <InvoiceImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => setImportDialogOpen(false)}
        onExtractedDataReceived={handleExtractedDataReceived}
      />
    </div>
  );
}
