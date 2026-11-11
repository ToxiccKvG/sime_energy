import { MeasurementData, measurementLabel } from '@/services/measurementService';
import { useEffect, useMemo } from 'react';
import {
  useMeasurementSession, updateMeasurementSession, ensureMeasurementLibrary,
  addMeasurements, renameMeasurement as renameInSession, removeMeasurement as removeFromSession,
  type WorkflowStep, type ComparisonMode,
} from '@/services/measurementSession';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MeasurementUploadStep } from './MeasurementUploadStep';
import { MeasurementCharts } from './MeasurementCharts';
import { MeasurementAnalysis } from './MeasurementAnalysis';
import { QuarantineBar } from './QuarantineBar';
import { applyQuarantine, useQuarantineSettings } from '@/services/measurementQuarantine';
import { SensorComparisonPanel } from './SensorComparisonPanel';
import { ModelComparisonPanel } from './ModelComparisonPanel';
import { AnalysisModelsPanel } from './AnalysisModelsPanel';
import type { DateRange } from './MeasurementPeriodFilter';
import { Upload, Activity, BarChart3, TrendingUp, ChevronLeft, ChevronRight, GitCompare, Columns2, Network, Sparkles } from 'lucide-react';

interface MeasurementWorkflowProps {
  auditId?: string;
}

export function MeasurementWorkflow({ auditId: _auditId }: MeasurementWorkflowProps) {
  // Session au niveau du module (services/measurementSession) : les relevés
  // survivent à un passage par IOT ou un audit, contrairement à un useState.
  const { currentStep, measurementData, currentDataIndex, comparisonMode, ranges, libraryStatus } = useMeasurementSession();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const setCurrentStep = (step: WorkflowStep) => updateMeasurementSession({ currentStep: step });
  const setCurrentDataIndex = (v: number | ((i: number) => number)) =>
    updateMeasurementSession((prev) => ({ currentDataIndex: typeof v === 'function' ? v(prev.currentDataIndex) : v }));
  const setComparisonMode = (mode: ComparisonMode) => updateMeasurementSession({ comparisonMode: mode });
  const currentRange: DateRange = ranges[currentDataIndex] ?? null;
  const setCurrentRange = (range: DateRange) =>
    updateMeasurementSession((prev) => ({ ranges: { ...prev.ranges, [currentDataIndex]: range } }));

  // Bibliothèque serveur de l'utilisateur (une fois par compte)
  useEffect(() => { void ensureMeasurementLibrary(user?.id ?? null); }, [user?.id]);



  const handleMeasurementsReceived = (data: MeasurementData[]) => {
    addMeasurements(data, user?.id ?? null, organization?.id ?? null);
    setCurrentDataIndex(0);
  };
  const renameMeasurement = renameInSession;
  const removeMeasurement = removeFromSession;

  const currentData = measurementData[currentDataIndex];

  // Quarantaine : calculée une fois ici, appliquée à l'Analyse, aux graphiques
  // et aux modèles, pour qu'un même relevé donne les mêmes chiffres partout.
  const quarantineSettings = useQuarantineSettings();
  const quarantine = useMemo(
    () => applyQuarantine(currentData?.measurements ?? [], {
      label: currentData ? measurementLabel(currentData, currentDataIndex) : '',
      sensorType: currentData?.sensor_type,
      metricKey: 'consumption',
      metricLabel: currentData?.metric_label ?? 'Valeur',
      unit: currentData?.unit ?? '',
      quantityKind: currentData?.quantity_kind ?? 'other',
    }, quarantineSettings),
    [currentData, currentDataIndex, quarantineSettings],
  );
  // La note suit le relevé filtré : elle doit se retrouver dans le rapport exporté.
  const currentFiltered = currentData
    ? { ...currentData, measurements: quarantine.kept, ...(quarantine.summary ? { quarantineNote: quarantine.summary } : {}) }
    : currentData;
  const hasData = measurementData.length > 0;
  const effectiveStep: WorkflowStep = hasData ? currentStep : 'upload';

  const tabs: { id: WorkflowStep; label: string; icon: React.ReactNode }[] = [
    { id: 'upload',        label: 'Upload',        icon: <Upload className="h-4 w-4" /> },
    { id: 'analysis',      label: 'Analyse',       icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'visualization', label: 'Visualisation', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'models',        label: 'Modèles',       icon: <Sparkles className="h-4 w-4" /> },
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

        {libraryStatus === 'loading' && (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-white/5 border border-white/10 rounded-lg px-4 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> Chargement de vos relevés…
          </div>
        )}
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
              <QuarantineBar result={quarantine} settings={quarantineSettings} />
              {currentFiltered ? (
                <MeasurementAnalysis data={currentFiltered} dateRange={currentRange} onDateRangeChange={setCurrentRange} />
              ) : (
                <p className="text-center py-8 text-slate-500">Aucune donnée pour ce fichier</p>
              )}
            </div>
          </Card>
        )}

        {/* Modèles d'analyse */}
        {currentStep === 'models' && hasData && (
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
              <QuarantineBar result={quarantine} settings={quarantineSettings} />
              {currentFiltered ? (
                <AnalysisModelsPanel
                  data={currentFiltered}
                  title={measurementLabel(currentData, currentDataIndex)}
                  dateRange={currentRange}
                  onDateRangeChange={setCurrentRange}
                />
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
                    : 'Les sous-compteurs expliquent-ils l\'arrivée ? Le relevé du compteur général est comparé à la somme des départs mesurés : part non mesurée, double comptage, capteur mal câblé.'}
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
            <QuarantineBar result={quarantine} settings={quarantineSettings} />
            <Card className="p-6 bg-white/5 border-white/10">
              <MeasurementCharts
                measurements={quarantine.kept}
                unit={currentData?.unit ?? currentData?.kpis?.unit ?? 'W'}
                label={currentData?.metric_label ?? 'Valeur'}
                quantityKind={currentData?.quantity_kind}
                title={currentData ? measurementLabel(currentData, currentDataIndex) : undefined}
                siblings={measurementData.map((d, i) => ({
                  label: measurementLabel(d, i),
                  measurements: d.measurements ?? [],
                  unit: d.unit ?? d.kpis?.unit,
                  quantityKind: d.quantity_kind,
                }))}
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
