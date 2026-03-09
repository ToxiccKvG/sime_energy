/**
 * Composant pour la vérification et correction des données extraites des factures
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StructuredExtractedData, getPdfSections, getPdfCustomFields } from "@/services/invoiceService";

interface InvoiceVerificationStepProps {
  extractedData: StructuredExtractedData[];
  onDataUpdated: (data: StructuredExtractedData[]) => void;
  onReady: () => void;
}

export function InvoiceVerificationStep({
  extractedData,
  onDataUpdated,
  onReady,
}: InvoiceVerificationStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [localData, setLocalData] = useState<StructuredExtractedData[]>(extractedData);
  const { toast } = useToast();

  const currentData = localData[currentIndex];
  if (!currentData) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Aucune donnée à vérifier</p>
      </Card>
    );
  }

  const sections = getPdfSections(currentData);
  const customFields = getPdfCustomFields(currentData);

  const handleEditField = (fieldKey: string, value: string) => {
    setEditingField(fieldKey);
    setEditValue(value);
  };

  const handleSaveField = () => {
    if (!editingField) return;

    const updatedData = [...localData];
    const data = updatedData[currentIndex];

    // Chercher le champ dans les sections ou customFields
    let found = false;

    for (const sectionName of Object.keys(sections)) {
      if (sections[sectionName][editingField]) {
        sections[sectionName][editingField].value = editValue;
        found = true;
        break;
      }
    }

    if (!found && customFields[editingField]) {
      customFields[editingField].value = editValue;
    }

    updatedData[currentIndex] = data;
    setLocalData(updatedData);
    setEditingField(null);
    setEditValue("");

    toast({
      title: "Champ mis à jour",
      description: `${editingField} a été mis à jour`,
    });
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleNext = () => {
    if (currentIndex < localData.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setEditingField(null);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setEditingField(null);
    }
  };

  const handleDeleteField = (fieldKey: string) => {
    const updatedData = [...localData];
    const data = updatedData[currentIndex];

    for (const sectionName of Object.keys(sections)) {
      if (sections[sectionName][fieldKey]) {
        delete sections[sectionName][fieldKey];
        break;
      }
    }

    if (customFields[fieldKey]) {
      delete customFields[fieldKey];
    }

    updatedData[currentIndex] = data;
    setLocalData(updatedData);

    toast({
      title: "Champ supprimé",
      description: `${fieldKey} a été supprimé`,
    });
  };

  const allFields = new Map<string, { value: string; section?: string }>();

  for (const sectionName of Object.keys(sections)) {
    for (const [fieldKey, metadata] of Object.entries(sections[sectionName])) {
      allFields.set(fieldKey, { value: metadata.value, section: sectionName });
    }
  }

  for (const [fieldKey, metadata] of Object.entries(customFields)) {
    allFields.set(fieldKey, { value: metadata.value, section: "Personnalisés" });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">{currentData.fileName}</h3>
            {currentData.pageNumber && (
              <p className="text-sm text-muted-foreground">Page {currentData.pageNumber}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {localData.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={currentIndex === localData.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="forms" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="forms">Formulaires ({allFields.size})</TabsTrigger>
          {currentData.tables && currentData.tables.length > 0 && (
            <TabsTrigger value="tables">Tableaux ({currentData.tables.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="forms" className="space-y-3">
          {allFields.size === 0 ? (
            <Card className="p-4">
              <p className="text-center text-muted-foreground">Aucun champ détecté</p>
            </Card>
          ) : (
            allFields.entries().map(([fieldKey, fieldData]) => (
              <Card key={fieldKey} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{fieldKey}</p>
                    {fieldData.section && (
                      <p className="text-xs text-muted-foreground/70">{fieldData.section}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteField(fieldKey)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {editingField === fieldKey ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveField} className="flex-1">
                        <Check className="h-4 w-4 mr-1" />
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancel}
                        className="flex-1"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-mono break-words">{fieldData.value || "-"}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditField(fieldKey, fieldData.value)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        {currentData.tables && currentData.tables.length > 0 && (
          <TabsContent value="tables" className="space-y-3">
            {currentData.tables.map((table, tableIndex) => (
              <Card key={tableIndex} className="p-4">
                <h4 className="font-medium mb-3">Tableau {tableIndex + 1}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse border border-border">
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="border border-border p-2 text-muted-foreground"
                            >
                              {cell.text}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </TabsContent>
        )}
      </Tabs>

      <div className="flex gap-2">
        <Button
          onClick={() => {
            onDataUpdated(localData);
            onReady();
          }}
          className="flex-1"
        >
          Vérification terminée
        </Button>
      </div>
    </div>
  );
}
