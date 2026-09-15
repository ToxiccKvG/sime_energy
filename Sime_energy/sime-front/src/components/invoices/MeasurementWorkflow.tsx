import { useState } from 'react';
import { MeasurementData, measurementLabel } from '@/services/measurementService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MeasurementUploadStep } from './MeasurementUploadStep';
import { MeasurementCharts } from './MeasurementCharts';
import { MeasurementAnalysis } from './MeasurementAnalysis';
import { SensorComparisonPanel } from './SensorComparisonPanel';
import { ModelComparisonPanel } from './ModelComparisonPanel';
import type { DateRange } from './MeasurementPeriodFilter';
import { Upload, Activity, BarChart3, TrendingUp, ChevronLeft, ChevronRight, GitCompare, Columns2, Network } from 'lucide-react';

type WorkflowStep = 'upload' | 'analysis' | 'visualization' | 'comparison';
type ComparisonMode = 'models' | 'master';

interface MeasurementWorkflowProps {
  auditId?: string;
}

export function MeasurementWorkflow({ auditId: _auditId }: MeasurementWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [measurementData, setMeasurementData] = useState<MeasurementData[]>([]);
  const [currentDataIndex, setCurrentDataIndex] = useState(0);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('models');
  // Période choisie, par fichier — partagée entre les onglets Analyse et Visualisation.
  const [ranges, setRanges] = useState<Record<number, DateRange>>({});
  const currentRange: DateRange = ranges[currentDataIndex] ?? null;
  const setCurrentRange = (range: DateRange) => setRanges((prev) => ({ ...prev, [currentDataIndex]: range }));

  const handleMeasurementsReceived = (data: MeasurementData[]) => {
    setMeasurementData((prev) => {
      const merged = [...prev, ...data];
      return merged;
    });
    setCurrentDataIndex(0);
    if (data.length > 0) setCurrentStep('analysis');
  };

  const renameMeasurement = (index: number, alias: string) =>
    setMeasurementData((prev) => prev.map((d, i) => (i === index ? { ...d, alias: alias.trim() || undefined } : d)));

  const removeMeasurement = (index: number) => {
    setMeasurementData((prev) => prev.filter((_, i) => i !== index));
    setRanges((prev) => {
      const next: Record<number, DateRange> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v; else if (i > index) next[i - 1] = v;
      });
      return next;
    });
    setCurrentDataIndex((i) => Math.max(0, Math.min(i, measurementData.length - 2)));
  };

  const currentData = measurementData[currentDataIndex];
  const hasData = measurementData.length > 0;
  const effectiveStep: WorkflowStep = hasData ? currentStep : 'upload';

  const tabs: { id: WorkflowStep; label: string; icon: React.ReactNode }[] = [
    { id: 'upload',        label: 'Upload',        icon: <Upload className="h-4 w-4" /> },
    { id: 'analysis',      label: 'Analyse',       icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'visualization', label: 'Visualisation', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'comparison',    label: 'Comparaison',   icon: <GitCompare className="h-4 w-4" /> },
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
          const isActive = effectiveStep === tab.id;
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
        {effectiveStep === 'upload' && (
          <Card className="p-6 bg-white/5 border-white/10">
            <MeasurementUploadStep
              onFilesUploaded={handleMeasurementsReceived}
              loaded={measurementData}
              onRename={renameMeasurement}
              onRemove={removeMeasurement}
            />
          </Card>
        )}

        {/* Analyse */}
        {currentStep === 'analysis' && hasData && (
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="space-y-6">
              <FileNav
                index={currentDataIndex}
                total={measurementData.length}
                label={currentData ? measurementLabel(currentData, currentDataIndex) : `Fichier ${currentDataIndex + 1}`}
                onPrev={() => setCurrentDataIndex((i) => Math.max(0, i - 1))}
                onNext={() => setCurrentDataIndex((i) => Math.min(measurementData.length - 1, i + 1))}
                onUploadMore={() => setCurrentStep('upload')}
              />
              {currentData ? (
                <MeasurementAnalysis data={currentData} dateRange={currentRange} onDateRangeChange={setCurrentRange} />
              ) : (
                <p className="text-center py-8 text-slate-500">Aucune donnée pour ce fichier</p>
              )}
            </div>
          </Card>
        )}

        {/* Comparaison */}
        {currentStep === 'comparison' && hasData && (
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                  <button onClick={() => setComparisonMode('models')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${comparisonMode === 'models' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <Columns2 className="h-3.5 w-3.5" /> Deux modèles côte à côte
                  </button>
                  <button onClick={() => setComparisonMode('master')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${comparisonMode === 'master' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <Network className="h-3.5 w-3.5" /> Compteur général / sous-compteurs
                  </button>
                </div>
                <p className="text-xs text-slate-500 max-w-md">
                  {comparisonMode === 'models'
                    ? 'Deux relevés (ex. C.A 8335 et Shelly sur le même départ, ou deux campagnes) alignés sur la même échelle de temps, avec l\'écart et les indicateurs face à face.'
                    : 'Un compteur de référence comparé à la somme des sous-compteurs censés l\'expliquer.'}
                </p>
              </div>
              {comparisonMode === 'models'
                ? <ModelComparisonPanel measurementData={measurementData} onRename={renameMeasurement} />
                : <SensorComparisonPanel measurementData={measurementData} />}
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
                  label={currentData ? measurementLabel(currentData, currentDataIndex) : `Fichier ${currentDataIndex + 1}`}
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
                title={currentData ? measurementLabel(currentData, currentDataIndex) : undefined}
                dateRange={currentRange}
                onDateRangeChange={setCurrentRange}
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
