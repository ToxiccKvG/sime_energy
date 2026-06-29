/**
 * Workflow complet de gestion des mesures énergétiques
 * Intègre l'upload, l'analyse et la visualisation
 */

import { useState } from 'react';
import { MeasurementData, HierarchyData } from '@/services/measurementService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MeasurementUploadStep } from './MeasurementUploadStep';
import { MeasurementCharts } from './MeasurementCharts';
import { Upload, Activity, BarChart3, TrendingUp } from 'lucide-react';

type WorkflowStep = 'upload' | 'analysis' | 'visualization';

interface MeasurementWorkflowProps {
  auditId?: string;
}

export function MeasurementWorkflow({ auditId }: MeasurementWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [measurementData, setMeasurementData] = useState<MeasurementData[]>([]);
  const [currentDataIndex, setCurrentDataIndex] = useState(0);

  const handleMeasurementsReceived = (data: MeasurementData[]) => {
    setMeasurementData(data);
    if (data.length > 0) {
      setCurrentStep('analysis');
    }
  };

  const currentData = measurementData[currentDataIndex];

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Gestion des mesures</h1>
        <p className="mt-1 text-muted-foreground">
          Upload, analyse et visualisation de vos données de consommation énergétique
        </p>
      </div>

      {/* Statut */}
      {measurementData.length > 0 && (
        <Card className="p-4 bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">
                {measurementData.length} fichier(s) de mesure traité(s)
              </p>
              <p className="text-sm text-blue-700">
                {measurementData.reduce((acc, data) => {
                  return acc + (data.measurements?.length || 0);
                }, 0)} mesure(s) totale(s)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Contenu principal */}
      <Tabs value={currentStep} onValueChange={(v: any) => setCurrentStep(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
            {measurementData.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {measurementData.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Analyse
          </TabsTrigger>
          <TabsTrigger value="visualization" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visualisation
          </TabsTrigger>
        </TabsList>

        {/* Onglet Upload */}
        <TabsContent value="upload" className="space-y-4">
          <Card className="p-6">
            <MeasurementUploadStep onFilesUploaded={handleMeasurementsReceived} />
          </Card>
        </TabsContent>

        {/* Onglet Analyse */}
        <TabsContent value="analysis" className="space-y-4">
          {measurementData.length > 0 && (
            <Card className="p-6">
              <div className="space-y-6">
                {/* Navigation entre fichiers */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Analyse des mesures</h3>
                    <p className="text-sm text-muted-foreground">
                      Fichier {currentDataIndex + 1} sur {measurementData.length}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDataIndex(Math.max(0, currentDataIndex - 1))}
                      disabled={currentDataIndex === 0}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDataIndex(Math.min(measurementData.length - 1, currentDataIndex + 1))}
                      disabled={currentDataIndex === measurementData.length - 1}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>

                {/* Affichage des KPIs */}
                {currentData?.kpis && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(currentData.kpis).map(([key, value]) => (
                      <div key={key} className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground uppercase">{key.replace(/_/g, ' ')}</p>
                        <p className="text-xl font-semibold text-foreground mt-1">
                          {typeof value === 'number' ? value.toFixed(2) : value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Affichage des mesures */}
                {currentData?.measurements && currentData.measurements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Détail des mesures ({currentData.measurements.length})</h4>
                    <div className="max-h-96 overflow-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted border-b">
                          <tr>
                            {Object.keys(currentData.measurements[0] || {}).map((key) => (
                              <th key={key} className="text-left p-3 font-medium">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentData.measurements.map((measurement, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/50">
                              {Object.values(measurement).map((value, colIdx) => (
                                <td key={colIdx} className="p-3">
                                  {typeof value === 'number' ? value.toFixed(2) : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!currentData?.kpis && !currentData?.measurements && (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucune donnée d'analyse disponible pour ce fichier
                  </div>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Onglet Visualisation */}
        <TabsContent value="visualization" className="space-y-4">
          {measurementData.length > 1 && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Visualisation</h3>
                  <p className="text-sm text-muted-foreground">
                    Fichier {currentDataIndex + 1} sur {measurementData.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDataIndex(Math.max(0, currentDataIndex - 1))}
                    disabled={currentDataIndex === 0}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDataIndex(Math.min(measurementData.length - 1, currentDataIndex + 1))}
                    disabled={currentDataIndex === measurementData.length - 1}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <Card className="p-6">
            <MeasurementCharts
              measurements={currentData?.measurements ?? []}
              unit={currentData?.unit ?? currentData?.kpis?.unit ?? 'W'}
              label={currentData?.metric_label ?? 'Valeur'}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
