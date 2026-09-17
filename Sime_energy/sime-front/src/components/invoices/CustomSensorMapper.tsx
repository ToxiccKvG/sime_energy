/**
 * Mapper de colonnes pour créer un capteur personnalisé.
 * L'utilisateur dépose un fichier CSV/Excel, sélectionne les colonnes
 * pour le timestamp et les grandeurs, puis sauvegarde en base ou analyse
 * directement.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { parseExcelBuffer, type SpreadsheetMeta } from '@/lib/excel-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, Upload, Plus, Trash2, Save, Zap, AlertCircle, Loader2, Sparkles, CalendarClock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  saveCustomSensor, guessQuantityKind, suggestMapping, previewTimestamps, columnsSignature,
  type CustomSensor, type CustomSensorInput, type ExtraCol, type QuantityKind,
} from '@/lib/custom-sensor-service';
import { useOrganization } from '@/context/OrganizationContext';

interface CustomSensorMapperProps {
  onAnalyze: (file: File, config: CustomSensorInput) => Promise<void>;
  onSaved: (sensor: CustomSensor) => void;
}

interface FileColumns {
  file: File;
  columns: string[];
  /** 5 premières lignes, pour le tableau d'aperçu. */
  preview: Record<string, unknown>[];
  /** Jusqu'à 2 000 lignes, pour l'aperçu des dates (première, dernière, pas). */
  sample: Record<string, unknown>[];
  meta: SpreadsheetMeta;
}

const EMPTY_EXTRA: ExtraCol = { label: '', col: '' };
const NO_TIME_COL = '__none__';

type DateOrder = 'auto' | 'dmy' | 'mdy';

/**
 * Construit le format strptime correspondant au choix jour-mois / mois-jour,
 * en reprenant le séparateur et la présence de l'heure/secondes du fichier :
 * c'est ce format qui est enregistré, le backend n'a rien à deviner.
 */
function formatFromOrder(order: DateOrder, sampleText: string): string {
  if (order === 'auto') return '';
  const m = sampleText.match(/^\s*\d{1,4}([-/.])\d{1,2}[-/.]\d{1,4}(?:[ T]+\d{1,2}:\d{2}(:\d{2})?)?/);
  if (!m) return '';
  const sep = m[1];
  const hasTime = /\d{1,2}:\d{2}/.test(sampleText);
  const hasSec = !!m[2];
  const date = order === 'dmy' ? `%d${sep}%m${sep}%Y` : `%m${sep}%d${sep}%Y`;
  return hasTime ? `${date} %H:%M${hasSec ? ':%S' : ''}` : date;
}

function fmtStep(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)} h`;
  return `${(sec / 86400).toFixed(sec % 86400 ? 1 : 0)} j`;
}

const fmtDate = (d: Date) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const QUANTITY_KIND_OPTIONS: { value: QuantityKind; label: string; hint: string }[] = [
  { value: 'power', label: 'Puissance instantanée (W, kW…)', hint: 'Le cumul total sera calculé par intégration dans le temps (→ énergie)' },
  { value: 'energy', label: 'Énergie déjà cumulable (Wh, kWh…)', hint: 'Le cumul total sera la simple somme des échantillons' },
  { value: 'other', label: 'Autre (ppm, °C, %…)', hint: 'Pas de cumul total affiché — une somme n\'aurait pas de sens physique' },
];

export function CustomSensorMapper({ onAnalyze, onSaved }: CustomSensorMapperProps) {
  const { organization, loading: orgLoading } = useOrganization();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [fileData, setFileData] = useState<FileColumns | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [timestampCol, setTimestampCol] = useState('');
  const [timeCol, setTimeCol] = useState('');
  const [timestampFormat, setTimestampFormat] = useState('');
  const [dateOrder, setDateOrder] = useState<DateOrder>('auto');
  const [valueCol, setValueCol] = useState('');
  const [unit, setUnit] = useState('');
  const [metricLabel, setMetricLabel] = useState('');
  const [extraCols, setExtraCols] = useState<ExtraCol[]>([]);
  const [keepNegative, setKeepNegative] = useState(true);
  const [quantityKind, setQuantityKind] = useState<QuantityKind>('other');
  // Tant que l'utilisateur n'a pas choisi lui-même le type de grandeur, on le
  // déduit de l'unité tapée — évite qu'une puissance reste par défaut sur
  // "energy" (sommée) au lieu d'être intégrée dans le temps.
  const [quantityKindTouched, setQuantityKindTouched] = useState(false);

  const handleUnitChange = (v: string) => {
    setUnit(v);
    if (!quantityKindTouched) setQuantityKind(guessQuantityKind(v));
  };

  const readFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      // Un seul lecteur pour tout (xlsx, csv, tsv, export « .xls » texte) : il
      // saute le préambule des enregistreurs et en renvoie les métadonnées.
      const buf = await file.arrayBuffer();
      const wb = await parseExcelBuffer(buf);
      const rows = wb.getRows(wb.sheetNames[0]) as unknown[][];
      if (rows.length === 0) throw new Error('Aucune ligne lisible dans ce fichier.');

      const columns = (rows[0] as unknown[]).map((h, i) => (h != null && String(h).trim() ? String(h).trim() : `col_${i}`));
      const toObj = (r: unknown[]) => {
        const row: Record<string, unknown> = {};
        columns.forEach((c, i) => { row[c] = r[i] ?? null; });
        return row;
      };
      const sample = rows.slice(1, 2001).map(toObj);
      const preview = sample.slice(0, 5);
      setFileData({ file, columns, preview, sample, meta: wb.meta });

      // Pré-remplissage : tout reste modifiable, ce sont des valeurs par défaut.
      const sug = suggestMapping(columns, sample, wb.meta, file.name);
      setName(sug.name);
      setTimestampCol(sug.timestampCol);
      setTimeCol(sug.timeCol);
      setValueCol(sug.valueCol);
      setUnit(sug.unit);
      setMetricLabel(sug.metricLabel);
      setExtraCols(sug.extraCols);
      setTimestampFormat('');
      setDateOrder('auto');
      if (!quantityKindTouched) setQuantityKind(guessQuantityKind(sug.unit));
    } catch (err) {
      toast({ title: 'Erreur de lecture', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, quantityKindTouched]);

  // Aperçu des dates telles que le backend les lira (ordre jour/mois déduit ou forcé)
  const tsPreview = useMemo(() => {
    if (!fileData || !timestampCol) return null;
    const forced = dateOrder === 'dmy' ? true : dateOrder === 'mdy' ? false : null;
    return previewTimestamps(fileData.sample, timestampCol, timeCol, forced);
  }, [fileData, timestampCol, timeCol, dateOrder]);

  const firstTsText = useMemo(() => {
    if (!fileData || !timestampCol) return '';
    const r = fileData.sample[0]; if (!r) return '';
    return `${String(r[timestampCol] ?? '')} ${timeCol ? String(r[timeCol] ?? '') : ''}`.trim();
  }, [fileData, timestampCol, timeCol]);

  const handleDateOrder = (order: DateOrder) => {
    setDateOrder(order);
    setTimestampFormat(formatFromOrder(order, firstTsText));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (!name) missing.push('Nom du capteur');
    if (!timestampCol) missing.push('Colonne timestamp');
    if (!valueCol) missing.push('Colonne grandeur principale');
    if (!metricLabel) missing.push('Libellé de la grandeur');
    if (!unit) missing.push('Unité');
    if (!orgLoading && !organization?.id) missing.push('Organisation (aucune organisation associée à votre compte)');
    return missing;
  };

  const buildConfig = (): CustomSensorInput | null => {
    if (!organization?.id || !timestampCol || !valueCol || !unit || !metricLabel || !name) return null;
    return {
      organization_id: organization.id,
      name,
      timestamp_col: timestampCol,
      time_col: timeCol || null,
      timestamp_format: timestampFormat || undefined,
      columns_signature: fileData ? columnsSignature(fileData.columns) : null,
      value_col: valueCol,
      unit,
      metric_label: metricLabel,
      extra_cols: extraCols.filter((e) => e.col && e.label),
      keep_negative: keepNegative,
      quantity_kind: quantityKind,
    };
  };

  const reportIncomplete = () => {
    const missing = getMissingFields();
    toast({
      title: 'Formulaire incomplet',
      description: missing.length > 0 ? `Champ(s) manquant(s) : ${missing.join(', ')}` : 'Remplissez tous les champs obligatoires (*)',
      variant: 'destructive',
    });
  };

  const handleAnalyze = async () => {
    if (!fileData) return;
    const config = buildConfig();
    if (!config) { reportIncomplete(); return; }
    setLoading(true);
    try {
      await onAnalyze(fileData.file, config);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const config = buildConfig();
    if (!config) { reportIncomplete(); return; }
    setLoading(true);
    try {
      const saved = await saveCustomSensor(config);
      toast({ title: 'Capteur sauvegardé', description: `« ${saved.name} » ajouté à votre organisation` });
      onSaved(saved);
      // Reset
      setFileData(null); setName(''); setTimestampCol(''); setTimeCol(''); setTimestampFormat(''); setDateOrder('auto');
      setValueCol(''); setUnit(''); setMetricLabel(''); setExtraCols([]);
      setQuantityKind('other'); setQuantityKindTouched(false);
    } catch (err) {
      toast({ title: 'Erreur de sauvegarde', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const cols = fileData?.columns ?? [];

  return (
    <div className="space-y-5">
      {/* Zone de dépôt du fichier */}
      {!fileData ? (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
          {loading ? (
            <Loader2 className="mx-auto h-8 w-8 text-blue-400 animate-spin mb-2" />
          ) : (
            <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          )}
          <p className="text-white font-medium">Déposez un fichier exemple</p>
          <p className="text-slate-500 text-sm mt-1">CSV, XLS, XLSX — pour détecter les colonnes</p>
        </div>
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-4">
          {/* En-tête fichier */}
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{fileData.file.name}</p>
              <p className="text-slate-500 text-xs">{cols.length} colonnes détectées</p>
            </div>
            <button className="text-slate-500 hover:text-red-400 text-xs" onClick={() => setFileData(null)}>
              Changer
            </button>
          </div>

          {/* Aperçu colonnes */}
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="text-xs w-full">
              <thead className="bg-white/5">
                <tr>
                  {cols.slice(0, 6).map((c) => (
                    <th key={c} className="px-3 py-2 text-left text-slate-400 whitespace-nowrap font-medium">{c}</th>
                  ))}
                  {cols.length > 6 && <th className="px-3 py-2 text-slate-600">+{cols.length - 6}</th>}
                </tr>
              </thead>
              <tbody>
                {fileData.preview.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-white/[0.02]'}>
                    {cols.slice(0, 6).map((c) => (
                      <td key={c} className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[140px] truncate">
                        {row[c] == null ? '' : String(row[c])}
                      </td>
                    ))}
                    {cols.length > 6 && <td />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Formulaire de mapping (visible seulement si fichier chargé) */}
      {fileData && (
        <div className="space-y-4">
          <p className="text-slate-400 text-xs flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Champs pré-remplis d'après le fichier — vérifiez, corrigez si besoin. Les champs marqués * sont obligatoires.
          </p>

          {/* Nom du capteur */}
          <Field label="Nom du capteur *">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ex: Compteur Hall RDC" className="bg-white/5 border-white/20 text-white" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Colonne date / horodatage */}
            <Field label="Colonne date ou horodatage *">
              <ColSelect cols={cols} value={timestampCol} onChange={setTimestampCol} placeholder="Sélectionnez…" />
            </Field>

            {/* Colonne heure séparée (loggers DATE + TIME) */}
            <Field label="Colonne heure" hint="Seulement si l'heure est dans une colonne à part (loggers DATE / TIME)">
              <Select value={timeCol || NO_TIME_COL} onValueChange={(v) => setTimeCol(v === NO_TIME_COL ? '' : v)}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-white/20 max-h-60">
                  <SelectItem value={NO_TIME_COL} className="text-slate-400 focus:bg-white/10 text-sm">— aucune (l'heure est dans la colonne date) —</SelectItem>
                  {cols.filter((c) => c !== timestampCol).map((c) => (
                    <SelectItem key={c} value={c} className="text-slate-200 focus:bg-white/10 text-sm font-mono">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Aperçu des dates interprétées — lève l'ambiguïté 09-05 = 5 sept. (US) ou 9 mai (FR) */}
          {tsPreview && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${tsPreview.invalid > 0 && tsPreview.first === null ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300">
                <span className="flex items-center gap-1.5 text-white font-medium"><CalendarClock className="h-3.5 w-3.5 text-blue-400" /> Dates interprétées</span>
                {tsPreview.first && tsPreview.last ? (
                  <>
                    <span>du <span className="text-white">{fmtDate(tsPreview.first)}</span> au <span className="text-white">{fmtDate(tsPreview.last)}</span></span>
                    {tsPreview.stepSeconds != null && <span>pas <span className="text-white">{fmtStep(tsPreview.stepSeconds)}</span></span>}
                    <span>{tsPreview.total - tsPreview.invalid} relevé(s){fileData && fileData.sample.length >= 2000 ? ' (aperçu)' : ''}</span>
                    {tsPreview.invalid > 0 && <span className="text-amber-400">{tsPreview.invalid} illisible(s)</span>}
                  </>
                ) : (
                  <span className="text-red-300">Aucune date lisible dans « {timestampCol} »{timeCol ? ` + « ${timeCol} »` : ''} — vérifiez les colonnes ou indiquez le format.</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Ordre des dates :</span>
                {([['auto', tsPreview.dayFirst === null ? 'Auto (ambigu → jour-mois)' : tsPreview.dayFirst ? 'Auto : jour-mois' : 'Auto : mois-jour'], ['dmy', 'Jour-mois (FR)'], ['mdy', 'Mois-jour (US)']] as [DateOrder, string][]).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => handleDateOrder(v)}
                    className={`px-2 py-0.5 rounded border text-xs transition-colors ${dateOrder === v ? 'bg-blue-600/30 border-blue-500/50 text-blue-200' : 'border-white/15 text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    {l}
                  </button>
                ))}
                {tsPreview.dayFirst === null && dateOrder === 'auto' && (
                  <span className="text-amber-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Un seul jour, valeurs ≤ 12 : choisissez l'ordre si les dates ci-dessus sont fausses.</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Format (optionnel, rempli par le choix d'ordre) */}
            <Field label="Format timestamp" hint="Laisser vide pour détection auto — rempli automatiquement par le choix d'ordre ci-dessus">
              <Input value={timestampFormat} onChange={(e) => { setTimestampFormat(e.target.value); setDateOrder('auto'); }}
                placeholder="ex: %d/%m/%Y %H:%M" className="bg-white/5 border-white/20 text-white font-mono text-sm" />
            </Field>

            {/* Colonne valeur */}
            <Field label="Colonne grandeur principale *">
              <ColSelect cols={cols} value={valueCol} onChange={setValueCol} placeholder="Sélectionnez…" />
            </Field>

            {/* Libellé */}
            <Field label="Libellé de la grandeur *">
              <Input value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)}
                placeholder="ex: Puissance active" className="bg-white/5 border-white/20 text-white" />
            </Field>

            {/* Unité */}
            <Field label="Unité *">
              <Input value={unit} onChange={(e) => handleUnitChange(e.target.value)}
                placeholder="ex: W, kWh, ppm, °C" className="bg-white/5 border-white/20 text-white" />
            </Field>

            {/* Garder valeurs négatives */}
            <Field label="Valeurs négatives">
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={keepNegative} onChange={(e) => setKeepNegative(e.target.checked)}
                  className="w-4 h-4 accent-blue-500" />
                <span className="text-slate-300 text-sm">Conserver (injection réseau, retour…)</span>
              </label>
            </Field>

            {/* Type de grandeur (détermine le calcul du cumul total) */}
            <Field
              label="Type de grandeur"
              hint={QUANTITY_KIND_OPTIONS.find((o) => o.value === quantityKind)?.hint}
            >
              <Select
                value={quantityKind}
                onValueChange={(v) => { setQuantityKindTouched(true); setQuantityKind(v as QuantityKind); }}
              >
                <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-white/20">
                  {QUANTITY_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-slate-200 focus:bg-white/10 text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Colonnes supplémentaires */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Colonnes supplémentaires</label>
              <button
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                onClick={() => setExtraCols((p) => [...p, { ...EMPTY_EXTRA }])}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <p className="text-slate-600 text-xs">
              Mettez l'unité entre parenthèses si la grandeur en a une (ex. « Tension (V) ») — sinon elle sera traitée comme sans unité (ex. « Cos φ », un ratio).
            </p>
            {extraCols.map((ec, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Largeur bornée : sans ça le sélecteur prend toute la ligne et le libellé disparaît */}
                <div className="w-1/2 min-w-0 shrink-0">
                  <ColSelect
                    cols={cols}
                    value={ec.col}
                    onChange={(v) => setExtraCols((p) => p.map((x, j) => j === i ? { ...x, col: v } : x))}
                    placeholder="Colonne…"
                  />
                </div>
                <Input
                  value={ec.label}
                  onChange={(e) => setExtraCols((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  placeholder="ex: Cos φ, ou Tension (V)"
                  className="bg-white/5 border-white/20 text-white text-sm flex-1"
                />
                <button className="text-slate-500 hover:text-red-400 shrink-0"
                  onClick={() => setExtraCols((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {extraCols.length === 0 ? (
              <p className="text-slate-600 text-xs">Aucune — les colonnes supplémentaires apparaissent dans les graphiques multi-séries.</p>
            ) : (
              <p className="text-slate-600 text-xs">Proposées d'après les colonnes numériques du fichier — supprimez celles qui ne vous servent pas.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAnalyze} disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Analyser maintenant
            </Button>
            <Button onClick={handleSave} disabled={loading || !name}
              variant="outline" className="border-white/20 text-slate-200 hover:bg-white/10">
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder le capteur
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Sous-composants ---- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ColSelect({ cols, value, onChange, placeholder }: {
  cols: string[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm">
        <SelectValue placeholder={placeholder ?? 'Colonne…'} />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1d2e] border-white/20 max-h-60">
        {cols.map((c) => (
          <SelectItem key={c} value={c} className="text-slate-200 focus:bg-white/10 text-sm font-mono">
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
