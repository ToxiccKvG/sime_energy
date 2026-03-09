import { useState, useEffect } from 'react';
import { Invoice, OCRField, InvoiceLabel } from '@/types/invoice';
import { invoiceApi } from '@/services/invoiceApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageViewer } from './ImageViewer';
import { FieldEditor } from './FieldEditor';
import { AnnotationHistory } from './AnnotationHistory';
import { InvoiceLabelSelector } from './InvoiceLabelSelector';
import { ArrowLeft, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InvoiceEditorProps {
  invoiceId: string;
  onClose: () => void;
}

export function InvoiceEditor({ invoiceId, onClose }: InvoiceEditorProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hoveredBBox, setHoveredBBox] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const data = await invoiceApi.getInvoice(invoiceId);
      setInvoice(data);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger la facture',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFieldUpdate = async (fieldName: string, newValue: string) => {
    if (!invoice) return;

    try {
      await invoiceApi.updateInvoiceFields(invoiceId, { [fieldName]: newValue });
      
      setInvoice(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ocrResult: {
            ...prev.ocrResult,
            fields: prev.ocrResult.fields.map(field =>
              field.name === fieldName ? { ...field, value: newValue, modified: true } : field
            ),
          },
        };
      });

      toast({
        title: 'Champ modifié',
        description: 'La modification a été enregistrée',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de sauvegarder la modification',
        variant: 'destructive',
      });
    }
  };

  const handleCommentUpdate = async (fieldName: string, comment: string) => {
    if (!invoice) return;

    try {
      await invoiceApi.updateInvoiceFields(invoiceId, { [`${fieldName}_comment`]: comment });
      
      setInvoice(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ocrResult: {
            ...prev.ocrResult,
            fields: prev.ocrResult.fields.map(field =>
              field.name === fieldName ? { ...field, comment } : field
            ),
          },
        };
      });

      toast({
        title: 'Commentaire ajouté',
        description: 'Le commentaire a été enregistré',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de sauvegarder le commentaire',
        variant: 'destructive',
      });
    }
  };

  const handleMarkAsVerified = async () => {
    try {
      await invoiceApi.updateInvoiceStatus(invoiceId, 'verified');
      toast({
        title: 'Facture vérifiée',
        description: 'La facture a été marquée comme vérifiée',
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le statut',
        variant: 'destructive',
      });
    }
  };

  const handleFieldClick = (fieldName: string) => {
    setSelectedField(fieldName);
    const field = invoice?.ocrResult.fields.find(f => f.name === fieldName);
    if (field) {
      setCurrentPage(field.boundingBox.page);
    }
  };

  const handleBBoxClick = (fieldName: string) => {
    setSelectedField(fieldName);
  };

  const handleLabelChange = async (label: InvoiceLabel | undefined) => {
    if (!invoice) return;

    try {
      await invoiceApi.updateInvoiceFields(invoiceId, { label: label || null });
      setInvoice(prev => prev ? { ...prev, label } : prev);
      toast({
        title: 'Type de facture modifié',
        description: 'Le type de facture a été mis à jour',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le type',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  if (!invoice) {
    return <div className="flex h-screen items-center justify-center">Facture introuvable</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{invoice.fileName}</h1>
            <p className="text-sm text-muted-foreground">{invoice.auditName}</p>
          </div>
          <Badge variant={invoice.status === 'verified' ? 'default' : 'outline'}>
            {invoice.status === 'to_verify' && 'À vérifier'}
            {invoice.status === 'in_progress' && 'En cours'}
            {invoice.status === 'verified' && 'Vérifié'}
            {invoice.status === 'validated' && 'Validé'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Save className="mr-2 h-4 w-4" />
            Sauvegarder
          </Button>
          <Button size="sm" onClick={handleMarkAsVerified}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Marquer comme vérifié
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Image viewer */}
        <div className="flex-1 border-r bg-muted/20 p-6">
          <ImageViewer
            pages={invoice.pngPages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            boundingBoxes={invoice.ocrResult.fields}
            selectedField={selectedField}
            hoveredField={hoveredBBox}
            onBBoxClick={handleBBoxClick}
            onBBoxHover={setHoveredBBox}
          />
        </div>

        {/* Right: Fields editor */}
        <div className="w-[400px] overflow-y-auto bg-card">
          <Tabs defaultValue="fields" className="h-full">
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="fields" className="flex-1">Champs</TabsTrigger>
              <TabsTrigger value="history" className="flex-1">Historique</TabsTrigger>
            </TabsList>
            
            <TabsContent value="fields" className="p-6 space-y-4">
              <InvoiceLabelSelector 
                value={invoice.label} 
                onChange={handleLabelChange} 
              />
              <FieldEditor
                fields={invoice.ocrResult.fields}
                selectedField={selectedField}
                onFieldClick={handleFieldClick}
                onFieldUpdate={handleFieldUpdate}
                onCommentUpdate={handleCommentUpdate}
                onFieldHover={setHoveredBBox}
              />
            </TabsContent>
            
            <TabsContent value="history" className="p-6">
              <AnnotationHistory invoiceId={invoiceId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
