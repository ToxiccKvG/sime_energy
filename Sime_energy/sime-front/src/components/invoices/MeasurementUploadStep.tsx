import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, X, Settings2, Pencil, Trash2, Check, Sparkles, Database, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadMeasurementFile, MeasurementData, measurementLabel } from '@/services/measurementService';
import { toDate } from '@/services/measurementStats';
import { getCustomSensors, deleteCustomSensor, findSensorBySignature, type CustomSensor, type CustomSensorInput } from '@/lib/custom-sensor-service';
import { parseExcelBuffer } from '@/lib/excel-utils';
import { filesFromDataTransfer, filesFromInput, isImportable, directoryInputProps } from '@/lib/folder-import';
import { CustomSensorMapper } from './CustomSensorMapper';
import { CustomSensorEditPanel } from './CustomSensorEditPanel';
import { useOrganization } from '@/context/OrganizationContext';

interface MeasurementUploadStepProps {
  onFilesUploaded: (data: MeasurementData[]) => void;
  isLoading?: boolean;
  /** Relevés déjà chargés dans la session (liste « Relevés chargés »). */
  loaded?: MeasurementData[];
  onRename?: (index: number, alias: string) => void;
  onRemove?: (index: number) => void;
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
const ACCEPT_RE = /\.(csv|xls|xlsx)$/i;

/**
 * Devine le capteur d'après le nom du fichier (exports nommés par les
 * appareils/portails eux-mêmes). Renvoie undefined si rien ne colle : l'utilisateur
 * choisit alors à la main.
 */
function guessSensorType(fileName: string): string | undefined {
  const n = fileName.toLowerCase();
  if (/trend/.test(n)) return 'CA8335_TREND';
  if (/demand/.test(n)) return 'CA8335_DEMAND';
  if (/air\s*station|m100|iaq/.test(n)) return 'AIR_STATION_M100';
  if (/solaredge|pv-|photovolta/.test(n)) return 'PV_SOLAREDGE';
  if (/fusionsolar|huawei|statistiques quotidiennes/.test(n)) return 'PV_HUAWEI';
  if (/shelly|consumption|consommation/.test(n)) return 'SHELLY';
  return undefined;
}

function sensorLabel(type: string, customSensors: CustomSensor[]): string {
  return BUILTIN_SENSORS.find((b) => b.value === type)?.label ?? customSensors.find((c) => c.id === type)?.name ?? type;
}

type FileStatus = 'pending' | 'loading' | 'success' | 'error';

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
  /** Capteur propre à ce fichier (deviné au dépôt, modifiable) ; sinon celui du sélecteur global. */
  sensorType?: string;
  guessed?: boolean;
  /** D'où vient la devinette : nom du fichier, ou en-têtes identiques à un capteur enregistré. */
  guessedBy?: 'name' | 'signature';
}

export function MeasurementUploadStep({ onFilesUploaded, isLoading = false, loaded = [], onRename, onRemove }: MeasurementUploadStepProps) {
  const { organization } = useOrganization();
  const inputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
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

  // Un fichier non reconnu par son nom peut l'être par ses en-têtes : si un
  // capteur enregistré a été créé sur un fichier aux mêmes colonnes, c'est le
  // même appareil. Lecture des seuls en-têtes, en arrière-plan.
  const recognizeBySignature = useCallback(async (file: File) => {
    if (customSensors.length === 0) return;
    try {
      const wb = await parseExcelBuffer(await file.arrayBuffer());
      const header = (wb.getRows(wb.sheetNames[0])[0] ?? []) as unknown[];
      const columns = header.map((h, i) => (h != null && String(h).trim() ? String(h).trim() : `col_${i}`));
      const match = findSensorBySignature(customSensors, columns);
      if (!match) return;
      setEntries((prev) => prev.map((e) =>
        e.file === file && !e.sensorType ? { ...e, sensorType: match.id, guessed: true, guessedBy: 'signature' } : e));
    } catch { /* fichier illisible : l'erreur sortira au traitement */ }
  }, [customSensors]);

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter((f) => isImportable(f, ACCEPT_RE));
    const rejected = files.length - valid.length;
    if (rejected > 0) {
      toast({ title: 'Fichiers ignorés', description: `${rejected} fichier(s) ignoré(s) — seuls CSV, XLS, XLSX sont acceptés (fichiers système et verrous Excel exclus)` });
    }
    if (valid.length === 0) return;
    const toRecognize: File[] = [];
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => e.file.name));
      const news = valid.filter((f) => !existing.has(f.name)).map((file) => {
        const guess = guessSensorType(file.name);
        if (!guess) toRecognize.push(file);
        return { file, status: 'pending' as FileStatus, sensorType: guess, guessed: !!guess, guessedBy: guess ? 'name' as const : undefined };
      });
      return [...prev, ...news];
    });
    for (const f of toRecognize) void recognizeBySignature(f);
  }, [toast, recognizeBySignature]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(filesFromInput(e.target.files, ACCEPT_RE));
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Dossiers compris : parcours récursif, parasites exclus
    void filesFromDataTransfer(e.dataTransfer, ACCEPT_RE).then(addFiles);
  }, [addFiles]);

  const removeEntry = (name: string) => setEntries((prev) => prev.filter((e) => e.file.name !== name));

  const patchStatus = (name: string, patch: Partial<FileEntry>) =>
    setEntries((prev) => prev.map((e) => e.file.name === name ? { ...e, ...patch } : e));

  // Résoudre la config d'un capteur (custom ou built-in)
  const resolveSensor = (type: string | undefined): { type: string; config?: CustomSensorInput } | null => {
    if (!type) return null;
    const custom = customSensors.find((c) => c.id === type);
    if (custom) return { type: 'CUSTOM', config: custom };
    return { type };
  };
  const entrySensor = (e: FileEntry) => e.sensorType || sensorType;

  const handleUpload = async () => {
    const pending = entries.filter((e) => e.status !== 'success');
    if (pending.length === 0) {
      toast({ title: 'Erreur', description: 'Aucun fichier à traiter', variant: 'destructive' });
      return;
    }
    const missing = pending.filter((e) => !resolveSensor(entrySensor(e)));
    if (missing.length > 0) {
      toast({ title: 'Capteur manquant', description: `Choisissez un type de capteur pour : ${missing.map((e) => e.file.name).join(', ')}`, variant: 'destructive' });
      return;
    }

    setUploading(true);
    const results: MeasurementData[] = [];
    let errors = 0;

    for (const entry of pending) {
      const resolved = resolveSensor(entrySensor(entry))!;
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
  const pendingEntries = entries.filter((e) => e.status !== 'success');
  const canUpload = pendingEntries.length > 0 && pendingEntries.every((e) => !!entrySensor(e)) && !busy;

  return (
    <div className="space-y-5">
      {/* Sélecteur capteur */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-200">Type de capteur <span className="text-slate-500 font-normal">(valeur par défaut pour les fichiers non reconnus)</span></label>
        <Select value={showMapper ? NEW_CUSTOM_KEY : sensorType} onValueChange={handleSensorChange}>
          <SelectTrigger className="bg-white/5 border-white/20 text-white">
            <SelectValue placeholder="Deviné d'après le nom du fichier — ou choisissez ici…" />
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
              ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" multiple className="hidden"
              onChange={handleInputChange} disabled={busy} />
            <input ref={dirInputRef} type="file" multiple className="hidden" {...directoryInputProps()}
              onChange={handleInputChange} disabled={busy} />
            <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
            <p className="text-white font-medium text-lg">Glisser-déposer ou cliquer pour importer</p>
            <p className="text-slate-400 text-sm mt-1">CSV, XLS, XLSX — plusieurs fichiers ou un dossier entier (sous-dossiers compris)</p>
            <p className="text-slate-500 text-xs mt-2 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" /> Le capteur est deviné d'après le nom du fichier ou ses colonnes ; le sélecteur ci-dessus sert de valeur par défaut.
            </p>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              className="mt-4 border-white/20 text-slate-200 hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); dirInputRef.current?.click(); }}>
              <FolderOpen className="h-4 w-4 mr-1.5" /> Importer un dossier
            </Button>
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
                    {entry.status !== 'success' && (
                      <select
                        value={entry.sensorType ?? ''}
                        onChange={(e) => patchStatus(entry.file.name, { sensorType: e.target.value || undefined, guessed: false })}
                        disabled={busy}
                        title={entry.guessedBy === 'signature' ? 'Capteur reconnu : mêmes colonnes qu\'un capteur enregistré' : entry.guessed ? 'Capteur deviné d\'après le nom du fichier' : 'Capteur pour ce fichier'}
                        className={`text-xs rounded-md px-2 py-1.5 bg-white/5 border max-w-[220px] ${entry.guessed ? 'border-blue-500/50 text-blue-300' : entrySensor(entry) ? 'border-white/20 text-slate-200' : 'border-amber-500/50 text-amber-300'}`}
                      >
                        <option value="" className="bg-[#1a1d2e]">{sensorType ? `(défaut) ${sensorLabel(sensorType, customSensors)}` : '— choisir un capteur —'}</option>
                        <optgroup label="Capteurs intégrés" className="bg-[#1a1d2e]">
                          {BUILTIN_SENSORS.map((t) => <option key={t.value} value={t.value} className="bg-[#1a1d2e]">{t.label}</option>)}
                        </optgroup>
                        {customSensors.length > 0 && (
                          <optgroup label="Mes capteurs" className="bg-[#1a1d2e]">
                            {customSensors.map((c) => <option key={c.id} value={c.id} className="bg-[#1a1d2e]">{c.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                    )}
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
                {uploading ? 'Traitement en cours…' : `Traiter ${pendingEntries.length} fichier(s)`}
              </Button>
              <Button variant="outline" className="border-white/20 text-slate-300 hover:bg-white/5"
                onClick={() => setEntries([])} disabled={busy}>
                Vider
              </Button>
            </div>
          )}

          {/* Relevés déjà chargés dans la session */}
          {loaded.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-blue-400" /> Relevés chargés ({loaded.length})
              </h4>
              <div className="space-y-1.5">
                {loaded.map((d, i) => (
                  <LoadedRow key={i} data={d} index={i} customSensors={customSensors} onRename={onRename} onRemove={onRemove} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


/* ---- Ligne d'un relevé déjà chargé : nom (alias éditable), capteur, mesures, période ---- */
function LoadedRow({
  data, index, customSensors, onRename, onRemove,
}: {
  data: MeasurementData; index: number; customSensors: CustomSensor[];
  onRename?: (index: number, alias: string) => void; onRemove?: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const n = data.measurements?.length ?? 0;
  const first = n ? toDate(String(data.measurements![0].timestamp)) : null;
  const last = n ? toDate(String(data.measurements![n - 1].timestamp)) : null;
  const fmt = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '—');
  const commit = () => { onRename?.(index, draft); setEditing(false); };

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/5">
      <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={data.file_name ?? 'Nom du relevé'}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              className="h-7 flex-1 px-2 rounded-md bg-white/5 border border-blue-500/50 text-white text-sm" />
            <button className="text-emerald-400 hover:text-emerald-300" onClick={commit} title="Valider"><Check className="h-4 w-4" /></button>
            <button className="text-slate-500 hover:text-white" onClick={() => setEditing(false)} title="Annuler"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <p className="text-sm text-white truncate">
            {measurementLabel(data, index)}
            {data.alias && data.file_name && <span className="text-slate-500 text-xs ml-1.5">{data.file_name}</span>}
          </p>
        )}
        <p className="text-xs text-slate-500 truncate">
          {data.sensor_type ? sensorLabel(data.sensor_type, customSensors) : 'Capteur inconnu'}
          {' · '}{n.toLocaleString('fr-FR')} mesures · {fmt(first)} → {fmt(last)}
          {data.metric_label ? ` · ${data.metric_label} (${data.unit ?? '—'})` : ''}
        </p>
      </div>
      {onRename && !editing && (
        <button className="text-slate-400 hover:text-blue-400 transition-colors shrink-0" onClick={() => { setDraft(data.alias ?? ''); setEditing(true); }} title="Renommer">
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {onRemove && (
        <button className="text-slate-400 hover:text-red-400 transition-colors shrink-0" onClick={() => onRemove(index)} title="Retirer de la session">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
