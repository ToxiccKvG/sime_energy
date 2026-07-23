import { useState } from 'react';
import { MeasurementData } from '@/services/measurementService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MeasurementUploadStep } from './MeasurementUploadStep';
import { MeasurementCharts } from './MeasurementCharts';
import { MeasurementAnalysis } from './MeasurementAnalysis';
import { SensorComparisonPanel } from './SensorComparisonPanel';
import { Upload, Activity, BarChart3, TrendingUp, ChevronLeft, ChevronRight, FileText, GitCompare } from 'lucide-react';

type WorkflowStep = 'upload' | 'analysis' | 'visualization';

interface MeasurementWorkflowProps {
  auditId?: string;
}

export function MeasurementWorkflow({ auditId: _auditId }: MeasurementWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [measurementData, setMeasurementData] = useState<MeasurementData[]>([]);
  const [currentDataIndex, setCurrentDataIndex] = useState(0);
  const [analysisMode, setAnalysisMode] = useState<'single' | 'comparison'>('single');

  const handleMeasurementsReceived = (data: MeasurementData[]) => {
    setMeasurementData((prev) => {
      const merged = [...prev, ...data];
      return merged;
    });
    setCurrentDataIndex(0);
    if (data.length > 0) setCurrentStep('analysis');
  };

  const currentData = measurementData[currentDataIndex];
  const hasData = measurementData.length > 0;

  const tabs: { id: WorkflowStep; label: string; icon: React.ReactNode }[] = [
    { id: 'upload',        label: 'Upload',        icon: <Upload className="h-4 w-4" /> },
    { id: 'analysis',      label: 'Analyse',       icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'visualization', label: 'Visualisation', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des mesures</h1>
          <p className="text-slate-400 text-sm mt-1">Upload · Analyse · Visualisation des données de consommation</p>
        </div>

        {hasData && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2">
            <Activity className="h-4 w-4 text-blue-400 shrink-0" />
            <div className="text-sm">
              <span className="text-white font-medium">{measurementData.length}</span>
              <span className="text-slate-400"> fichier(s) · </span>
              <span className="text-white font-medium">
                {measurementData.reduce((acc, d) => acc + (d.measurements?.length ?? 0), 0).toLocaleString('fr-FR')}
              </span>
              <span className="text-slate-400"> mesures</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation onglets */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
        {tabs.map((tab) => {
          const isActive = currentStep === tab.id;
          const isLocked = tab.id !== 'upload' && !hasData;
          return (
            <button
              key={tab.id}
              onClick={() => !isLocked && setCurrentStep(tab.id)}
              disabled={isLocked}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' :
                  isLocked ? 'text-slate-600 cursor-not-allowed' :
                  'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'upload' && measurementData.length > 0 && (
                <Badge className="ml-1 h-5 min-w-5 text-xs px-1 bg-blue-600/50 text-blue-300 border-0">
                  {measurementData.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      <div className="min-h-[400px]">
        {/* Upload */}
        {currentStep === 'upload' && (
          <Card className="p-6 bg-white/5 border-white/10">
            <MeasurementUploadStep onFilesUploaded={handleMeasurementsReceived} />
          </Card>
        )}

        {/* Analyse */}
        {currentStep === 'analysis' && hasData && (
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="space-y-6">
              {measurementData.length > 1 && (
                <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                  <button onClick={() => setAnalysisMode('single')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${analysisMode === 'single' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <FileText className="h-3.5 w-3.5" /> Par fichier
                  </button>
                  <button onClick={() => setAnalysisMode('comparison')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${analysisMode === 'comparison' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <GitCompare className="h-3.5 w-3.5" /> Comparaison maître/esclave
                  </button>
                </div>
              )}

              {analysisMode === 'single' ? (
                <>
                  <FileNav
                    index={currentDataIndex}
                    total={measurementData.length}
                    label={currentData?.sensor_type ?? `Fichier ${currentDataIndex + 1}`}
                    onPrev={() => setCurrentDataIndex((i) => Math.max(0, i - 1))}
                    onNext={() => setCurrentDataIndex((i) => Math.min(measurementData.length - 1, i + 1))}
                    onUploadMore={() => setCurrentStep('upload')}
                  />
                  {currentData ? (
                    <MeasurementAnalysis data={currentData} />
                  ) : (
                    <p className="text-center py-8 text-slate-500">Aucune donnée pour ce fichier</p>
                  )}
                </>
              ) : (
                <SensorComparisonPanel measurementData={measurementData} />
              )}
            </div>
          </Card>
        )}

        {/* Visualisation */}
        {currentStep === 'visualization' && hasData && (
          <div className="space-y-4">
            {measurementData.length > 1 && (
              <Card className="px-4 py-3 bg-white/5 border-white/10">
                <FileNav
                  index={currentDataIndex}
                  total={measurementData.length}
                  label={currentData?.sensor_type ?? `Fichier ${currentDataIndex + 1}`}
                  onPrev={() => setCurrentDataIndex((i) => Math.max(0, i - 1))}
                  onNext={() => setCurrentDataIndex((i) => Math.min(measurementData.length - 1, i + 1))}
                  onUploadMore={() => setCurrentStep('upload')}
                />
              </Card>
            )}
            <Card className="p-6 bg-white/5 border-white/10">
              <MeasurementCharts
                measurements={currentData?.measurements ?? []}
                unit={currentData?.unit ?? currentData?.kpis?.unit ?? 'W'}
                label={currentData?.metric_label ?? 'Valeur'}
                quantityKind={currentData?.quantity_kind}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Navigation multi-fichiers ---- */
function FileNav({
  index,
  total,
  label,
  onPrev,
  onNext,
  onUploadMore,
}: {
  index: number;
  total: number;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onUploadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <p className="text-white font-medium">{label}</p>
        <p className="text-slate-500 text-xs">{index + 1} / {total}</p>
      </div>
      <div className="flex items-center gap-2">
        {total > 1 && (
          <>
            <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8"
              onClick={onPrev} disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8"
              onClick={onNext} disabled={index === total - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="border-white/20 text-slate-400 hover:text-white hover:bg-white/5 h-8 text-xs"
          onClick={onUploadMore}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Ajouter des fichiers
        </Button>
      </div>
    </div>
  );
}
