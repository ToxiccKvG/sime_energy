/**
 * Composant pour la transformation des données en format unifié
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transformInvoiceTablesToJson, StructuredExtractedData, InvoiceResult, ProcessingInfo } from "@/services/invoiceService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTransformationStepProps {
  extractedData: StructuredExtractedData[];
  onTransformationComplete: (invoices: InvoiceResult[], processingInfo: ProcessingInfo) => void;
  isLoading?: boolean;
}

export function DataTransformationStep({
  extractedData,
  onTransformationComplete,
  isLoading = false,
}: DataTransformationStepProps) {
  const [transforming, setTransforming] = useState(false);
  const [result, setResult] = useState<{
    invoices: InvoiceResult[];
    processingInfo: ProcessingInfo;
  } | null>(null);
  const { toast } = useToast();

  const handleTransform = async () => {
    setTransforming(true);
    try {
      const response = await transformInvoiceTablesToJson(extractedData);
      setResult(response);

      toast({
        title: "Transformation réussie",
        description: `${response.invoices.length} facture(s) transformée(s)`,
      });

      onTransformationComplete(response.invoices, response.processingInfo);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la transformation",
        variant: "destructive",
      });
    } finally {
      setTransforming(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Transformation réussie</p>
              <p className="text-sm text-green-700">
                {result.invoices.length} facture(s) transformée(s) avec succès
              </p>
            </div>
          </div>
        </Card>

        {result.processingInfo && (
          <Card className="p-4">
            <h3 className="font-medium mb-3">Statistiques de traitement</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total factures</p>
                <p className="text-2xl font-bold">{result.processingInfo.totalInvoices}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total tableaux</p>
                <p className="text-2xl font-bold">{result.processingInfo.totalTables}</p>
              </div>

              {result.processingInfo.consumption && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Consommation moyenne</p>
                    <p className="text-2xl font-bold">
                      {result.processingInfo.consumption.average.toFixed(2)} kWh
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Consommation totale</p>
                    <p className="text-2xl font-bold">
                      {result.processingInfo.consumption.total.toFixed(2)} kWh
                    </p>
                  </div>
                </>
              )}

              {result.processingInfo.amount && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Montant moyen</p>
                    <p className="text-2xl font-bold">
                      {result.processingInfo.amount.average.toFixed(2)} FCFA
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Montant total</p>
                    <p className="text-2xl font-bold">
                      {result.processingInfo.amount.total.toFixed(2)} FCFA
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {result.invoices.length > 0 && (
          <Card className="p-4">
            <h3 className="font-medium mb-3">Factures transformées</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Colonnes</TableHead>
                    <TableHead>Tableaux</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.invoices.map((invoice, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{invoice.fileName}</TableCell>
                      <TableCell>{invoice.pageNumber}</TableCell>
                      <TableCell>{invoice.columnCount}</TableCell>
                      <TableCell>{invoice.tableCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-medium">Transformation des données</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Les tableaux extraits des factures vont être transformés en format unifié pour faciliter
            l'analyse.
          </p>
        </div>

        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm">
            <span className="font-medium">{extractedData.length}</span> facture(s) à traiter
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Les données seront consolidées et structurées en colonnes standardisées
          </p>
        </div>

        <Button
          onClick={handleTransform}
          disabled={transforming || isLoading || extractedData.length === 0}
          className="w-full"
        >
          {transforming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {transforming ? "Transformation en cours..." : "Lancer la transformation"}
        </Button>
      </div>
    </Card>
  );
}
