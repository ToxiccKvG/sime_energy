/**
 * Composant pour l'upload des mesures énergétiques
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadMeasurementFile, MeasurementData } from "@/services/measurementService";

interface MeasurementUploadStepProps {
  onFilesUploaded: (data: MeasurementData[]) => void;
  isLoading?: boolean;
}

const SENSOR_TYPES = [
  "CA_8331",
  "Dent_Elite_Pro",
  "FLUKE",
  "PEL_103",
  "RHT_10",
  "8_SENTINEL",
  "Smart_Energy_Meter",
  "TH_30",
  "89_VOLTCRAFT",
];

export function MeasurementUploadStep({ onFilesUploaded, isLoading = false }: MeasurementUploadStepProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sensorType, setSensorType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: "pending" | "loading" | "success" | "error";
  }>({});
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((f) => {
      const isValid =
        f.name.endsWith(".csv") ||
        f.name.endsWith(".xls") ||
        f.name.endsWith(".xlsx");
      if (!isValid) {
        toast({
          title: "Format non supporté",
          description: `${f.name} n'est pas un CSV ou Excel valide`,
          variant: "destructive",
        });
      }
      return isValid;
    });

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    validFiles.forEach((f) => {
      setUploadProgress((prev) => ({ ...prev, [f.name]: "pending" }));
    });
  };

  const handleRemoveFile = (fileName: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== fileName));
    setUploadProgress((prev) => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner au moins un fichier",
        variant: "destructive",
      });
      return;
    }

    if (!sensorType) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner un type de capteur",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const uploadedData: MeasurementData[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of selectedFiles) {
      try {
        setUploadProgress((prev) => ({ ...prev, [file.name]: "loading" }));

        const data = await uploadMeasurementFile(file, sensorType);
        uploadedData.push(data);
        successCount++;

        setUploadProgress((prev) => ({ ...prev, [file.name]: "success" }));
      } catch (error) {
        errorCount++;
        setUploadProgress((prev) => ({ ...prev, [file.name]: "error" }));
        toast({
          title: "Erreur",
          description: `Impossible de traiter ${file.name}: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
          variant: "destructive",
        });
      }
    }

    setUploading(false);

    if (successCount > 0) {
      toast({
        title: "Mesures traitées",
        description: `${successCount} fichier(s) de mesure traité(s) avec succès`,
      });

      onFilesUploaded(uploadedData);
      setSelectedFiles([]);
      setUploadProgress({});
      setSensorType("");
    }

    if (errorCount > 0) {
      toast({
        title: "Attention",
        description: `${errorCount} fichier(s) n'ont pas pu être traité(s)`,
        variant: "destructive",
      });
    }
  };

  const pendingFiles = selectedFiles.filter((f) => uploadProgress[f.name] !== "success");
  const successFiles = selectedFiles.filter((f) => uploadProgress[f.name] === "success");

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="sensor-type">Type de capteur</Label>
            <Select value={sensorType} onValueChange={setSensorType}>
              <SelectTrigger id="sensor-type">
                <SelectValue placeholder="Sélectionnez un type de capteur" />
              </SelectTrigger>
              <SelectContent>
                {SENSOR_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Utilisé pour calibrer l'analyse des mesures
            </p>
          </div>

          <div className="border-2 border-dashed rounded-lg p-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="rounded-full bg-primary/10 p-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Déposez vos fichiers de mesure</p>
                <p className="text-sm text-muted-foreground">
                  Formats acceptés: CSV, XLS, XLSX
                </p>
              </div>
              <input
                type="file"
                multiple
                accept=".csv,.xls,.xlsx"
                onChange={handleFileSelect}
                disabled={uploading || isLoading}
                className="hidden"
                id="measurement-file-input"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("measurement-file-input")?.click()}
                disabled={uploading || isLoading || !sensorType}
              >
                Sélectionner des fichiers
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {selectedFiles.length > 0 && (
        <Card className="p-4">
          <div className="space-y-3">
            <h3 className="font-medium">Fichiers sélectionnés ({selectedFiles.length})</h3>

            {pendingFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  {uploadProgress[file.name] === "loading" && (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                  {uploadProgress[file.name] === "error" && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {(!uploadProgress[file.name] || uploadProgress[file.name] === "pending") && (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(file.name)}
                  disabled={uploading || isLoading}
                >
                  Supprimer
                </Button>
              </div>
            ))}

            {successFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
              >
                <div className="flex items-center gap-3 flex-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-900 truncate">{file.name}</p>
                    <p className="text-xs text-green-700">Traité avec succès</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(file.name)}
                >
                  Retirer
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading || isLoading || !sensorType}
              className="flex-1"
            >
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploading ? "Traitement en cours..." : "Traiter les fichiers"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFiles([]);
                setUploadProgress({});
              }}
              disabled={uploading || isLoading}
            >
              Réinitialiser
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
