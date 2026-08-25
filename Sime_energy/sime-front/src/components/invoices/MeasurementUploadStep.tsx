import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, X, Settings2, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadMeasurementFile, MeasurementData } from '@/services/measurementService';
import { getCustomSensors, deleteCustomSensor, type CustomSensor, type CustomSensorInput } from '@/lib/custom-sensor-service';
import { CustomSensorMapper } from './CustomSensorMapper';
import { CustomSensorEditPanel } from './CustomSensorEditPanel';
import { useOrganization } from '@/context/OrganizationContext';

interface MeasurementUploadStepProps {
  onFilesUploaded: (data: MeasurementData[]) => void;
  isLoading?: boolean;
}

const BUILTIN_SENSORS: { value: string; label: string }[] = [
  { value: 'CA8335_TREND',     label: 'C.A 8335 — Qualité réseau (10 min)' },
  { value: 'CA8335_DEMAND',    label: 'C.A 8335 — Demande énergétique (5 min)' },
  { value: 'AIR_STATION_M100', label: 'Station qualité d\'air M100 (IAQ)' },
  { value: 'PV_SOLAREDGE',     label: 'PV SolarEdge — Puissance (15 min)' },
  { value: 'PV_HUAWEI',        label: 'PV Huawei FusionSolar — Bilan journalier' },
  { value: 'SHELLY',           label: 'Compteur Shelly — Énergie journalière' },
];

const NEW_CUSTOM_KEY = '__new_custom__';

type FileStatus = 'pending' | 'loading' | 'success' | 'error';

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

export function MeasurementUploadStep({ onFilesUploaded, isLoading = false }: MeasurementUploadStepProps) {
  const { organization } = useOrganization();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [sensorType, setSensorType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Capteurs personnalisés de l'organisation
  const [customSensors, setCustomSensors] = useState<CustomSensor[]>([]);
  const [showMapper, setShowMapper] = useState(false);
  const [editingSensor, setEditingSensor] = useState<CustomSensor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    getCustomSensors(organization.id)
      .then(setCustomSensors)
      .catch(() => {/* table peut ne pas exister encore en local */});
  }, [organization?.id]);

  const handleSensorChange = (value: string) => {
    if (value === NEW_CUSTOM_KEY) {
      setShowMapper(true);
      setSensorType('');
    } else {
      setShowMapper(false);
      setSensorType(value);
    }
  };

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter((f) => /\.(csv|xls|xlsx)$/i.test(f.name));
    const rejected = files.length - valid.length;
    if (rejected > 0) {
      toast({ title: 'Format non supporté', description: `${rejected} fichier(s) ignoré(s) — seuls CSV, XLS, XLSX sont acceptés`, variant: 'destructive' });
    }
    if (valid.length === 0) return;
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => e.file.name));
      const news = valid.filter((f) => !existing.has(f.name)).map((file) => ({ file, status: 'pending' as FileStatus }));
      return [...prev, ...news];
    });
  }, [toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeEntry = (name: string) => setEntries((prev) => prev.filter((e) => e.file.name !== name));

  const patchStatus = (name: string, patch: Partial<FileEntry>) =>
    setEntries((prev) => prev.map((e) => e.file.name === name ? { ...e, ...patch } : e));

  // Résoudre la config du capteur sélectionné (custom ou built-in)
  const getConfig = (): { type: string; config?: CustomSensorInput } | null => {
    if (!sensorType) return null;
    const custom = customSensors.find((c) => c.id === sensorType);
    if (custom) return { type: 'CUSTOM', config: custom };
    return { type: sensorType };
  };

  const handleUpload = async () => {
    const pending = entries.filter((e) => e.status !== 'success');
    if (pending.length === 0) {
      toast({ title: 'Erreur', description: 'Aucun fichier à traiter', variant: 'destructive' });
      return;
    }
    const resolved = getConfig();
    if (!resolved) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner un type de capteur', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const results: MeasurementData[] = [];
    let errors = 0;

    for (const entry of pending) {
      patchStatus(entry.file.name, { status: 'loading' });
      try {
        const data = await uploadMeasurementFile(entry.file, resolved.type, resolved.config);
        results.push(data);
        patchStatus(entry.file.name, { status: 'success' });
      } catch (err) {
        errors++;
        patchStatus(entry.file.name, { status: 'error', error: err instanceof Error ? err.message : 'Erreur inconnue' });
      }
    }

    setUploading(false);

    if (results.length > 0) {
      toast({ title: 'Mesures traitées', description: `${results.length} fichier(s) traité(s) avec succès` });
      onFilesUploaded(results);
      setEntries((prev) => prev.filter((e) => e.status !== 'success'));
      setSensorType('');
    }
    if (errors > 0) {
      toast({ title: 'Attention', description: `${errors} fichier(s) en erreur`, variant: 'destructive' });
    }
  };

  // Appelé par le mapper : analyser directement sans sauvegarder
  const handleMapperAnalyze = async (file: File, config: CustomSensorInput) => {
    const data = await uploadMeasurementFile(file, 'CUSTOM', config);
    onFilesUploaded([data]);
    setShowMapper(false);
  };

  // Appelé par le mapper : capteur sauvegardé en base
  const handleMapperSaved = (sensor: CustomSensor) => {
    setCustomSensors((prev) => [sensor, ...prev]);
    setSensorType(sensor.id);
    setShowMapper(false);
  };

  const handleEditSaved = (sensor: CustomSensor) => {
    setCustomSensors((prev) => prev.map((c) => c.id === sensor.id ? sensor : c));
    setEditingSensor(null);
  };

  const handleDeleteSensor = async (sensor: CustomSensor) => {
    if (!window.confirm(`Supprimer le capteur « ${sensor.name} » ? Cette action est irréversible.`)) return;
    setDeletingId(sensor.id);
    try {
      await deleteCustomSensor(sensor.id);
      setCustomSensors((prev) => prev.filter((c) => c.id !== sensor.id));
      if (sensorType === sensor.id) setSensorType('');
      toast({ title: 'Capteur supprimé', description: `« ${sensor.name} » a été supprimé` });
    } catch (err) {
      toast({ title: 'Erreur de suppression', description: String(err), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const busy = uploading || isLoading;
  const canUpload = entries.some((e) => e.status !== 'success') && !!sensorType && !busy;

  return (
    <div className="space-y-5">
      {/* Sélecteur capteur */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-200">Type de capteur</label>
        <Select value={showMapper ? NEW_CUSTOM_KEY : sensorType} onValueChange={handleSensorChange}>
          <SelectTrigger className="bg-white/5 border-white/20 text-white">
            <SelectValue placeholder="Sélectionnez un capteur…" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/20">
            <SelectGroup>
              <SelectLabel className="text-slate-500 text-xs">Capteurs intégrés</SelectLabel>
              {BUILTIN_SENSORS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-slate-200 focus:bg-white/10">
                  {t.label}
                </SelectItem>
              ))}
            </SelectGroup>

            {customSensors.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-slate-500 text-xs">Mes capteurs</SelectLabel>
                {customSensors.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-slate-200 focus:bg-white/10">
                    {c.name}
                    <span className="text-slate-500 ml-1.5 text-xs">{c.unit}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            <SelectGroup>
              <SelectItem value={NEW_CUSTOM_KEY} className="text-blue-400 focus:bg-blue-500/10">
                <Settings2 className="h-3.5 w-3.5 inline mr-1.5" />
                Créer un capteur personnalisé…
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Gestion des capteurs personnalisés existants */}
      {!showMapper && !editingSensor && customSensors.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Mes capteurs personnalisés</label>
          <div className="space-y-1.5">
            {customSensors.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.metric_label} · {c.unit}</p>
                </div>
                <button className="text-slate-400 hover:text-blue-400 transition-colors shrink-0"
                  onClick={() => setEditingSensor(c)} title="Modifier">
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="text-slate-400 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                  onClick={() => handleDeleteSensor(c)} disabled={deletingId === c.id} title="Supprimer">
                  {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Édition d'un capteur personnalisé */}
      {editingSensor && (
        <CustomSensorEditPanel
          sensor={editingSensor}
          onSaved={handleEditSaved}
          onCancel={() => setEditingSensor(null)}
        />
      )}

      {/* Mapper capteur personnalisé */}
      {showMapper && (
        <div className="bg-white/5 border border-blue-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-medium text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-blue-400" />
              Nouveau capteur personnalisé
            </h4>
            <button className="text-slate-500 hover:text-slate-300 text-xs" onClick={() => setShowMapper(false)}>
              Annuler
            </button>
          </div>
          <CustomSensorMapper onAnalyze={handleMapperAnalyze} onSaved={handleMapperSaved} />
        </div>
      )}

      {/* Zone de dépôt (masquée si le mapper ou l'édition est ouvert) */}
      {!showMapper && !editingSensor && (
        <>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all select-none
              ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}
              ${!sensorType ? 'opacity-50 pointer-events-none' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" multiple className="hidden"
              onChange={handleInputChange} disabled={busy} />
            <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
            <p className="text-white font-medium text-lg">Glisser-déposer ou cliquer pour importer</p>
            <p className="text-slate-400 text-sm mt-1">CSV, XLS, XLSX — multi-fichiers supportés</p>
            {!sensorType && (
              <p className="text-amber-400/80 text-xs mt-2">Sélectionnez d'abord un type de capteur</p>
            )}
          </div>

          {/* Liste des fichiers */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-200">{entries.length} fichier(s)</h4>
                {entries.some((e) => e.status === 'error') && (
                  <button className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    onClick={() => setEntries((prev) => prev.filter((e) => e.status !== 'error'))}>
                    Retirer les erreurs
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {entries.map((entry) => (
                  <div key={entry.file.name}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                      entry.status === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' :
                      entry.status === 'error'   ? 'bg-red-500/10 border-red-500/30' :
                      entry.status === 'loading' ? 'bg-blue-500/10 border-blue-500/30' :
                      'bg-white/5 border-white/10'
                    }`}
                  >
                    {entry.status === 'loading' && <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />}
                    {entry.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {entry.status === 'error'   && <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
                    {entry.status === 'pending' && <FileSpreadsheet className="h-4 w-4 text-slate-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.file.name}</p>
                      <p className="text-xs text-slate-500">
                        {(entry.file.size / 1024).toFixed(1)} KB
                        {entry.status === 'success' && <span className="text-emerald-400 ml-1">— traité</span>}
                        {entry.status === 'error' && entry.error && <span className="text-red-400 ml-1">— {entry.error}</span>}
                      </p>
                    </div>
                    {entry.status !== 'loading' && (
                      <button className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                        onClick={() => removeEntry(entry.file.name)} disabled={busy}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {entries.length > 0 && (
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={!canUpload}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {uploading ? 'Traitement en cours…' : `Traiter ${entries.filter((e) => e.status !== 'success').length} fichier(s)`}
              </Button>
              <Button variant="outline" className="border-white/20 text-slate-300 hover:bg-white/5"
                onClick={() => setEntries([])} disabled={busy}>
                Vider
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
