/**
 * Composant pour l'export des données (CSV, Excel)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateCSV, downloadCSV, exportToExcel, TableRowData } from "@/services/exportService";
import { StructuredExtractedData } from "@/services/invoiceService";

interface DataExportStepProps {
  extractedData: StructuredExtractedData[];
  tableData?: TableRowData[];
  metadata?: {
    norm?: string;
    organization?: string;
    building?: string;
  };
}

export function DataExportStep({
  extractedData,
  tableData,
  metadata = {},
}: DataExportStepProps) {
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);
  const { toast } = useToast();

  const handleExportCSV = async () => {
    setExporting("csv");
    try {
      const csvContent = generateCSV(extractedData);
      downloadCSV(csvContent);

      toast({
        title: "Exportation réussie",
        description: "Fichier CSV téléchargé avec succès",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de l'export",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const dataToExport = tableData && tableData.length > 0 ? tableData : extractedData;
      exportToExcel(dataToExport as any, {
        ...metadata,
        files: [],
        isDataTransformed: tableData !== undefined,
      });

      toast({
        title: "Exportation réussie",
        description: "Fichier Excel téléchargé avec succès",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de l'export",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="font-medium mb-4">Exporter les données</h3>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {tableData && tableData.length > 0
              ? `${tableData.length} ligne(s) à exporter`
              : `${extractedData.length} facture(s) à exporter`}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleExportCSV}
              disabled={exporting !== null}
              variant="outline"
              className="flex items-center justify-center gap-2"
            >
              {exporting === "csv" && <Loader2 className="h-4 w-4 animate-spin" />}
              <Download className="h-4 w-4" />
              Exporter en CSV
            </Button>

            <Button
              onClick={handleExportExcel}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-2"
            >
              {exporting === "excel" && <Loader2 className="h-4 w-4 animate-spin" />}
              <Download className="h-4 w-4" />
              Exporter en Excel
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-medium">Conseil:</span> Le format Excel inclut des métadonnées et un onglet
              "Informations" pour faciliter le suivi de l'audit.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-medium mb-3 text-sm">Options d'export</h4>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium">CSV:</span> Format simple pour Excel ou Google Sheets
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium">Excel:</span> Plusieurs onglets avec métadonnées et formatage
          </p>
        </div>
      </Card>
    </div>
  );
}
