/**
 * Mapper de colonnes pour créer un capteur personnalisé.
 * L'utilisateur dépose un fichier CSV/Excel, sélectionne les colonnes
 * pour le timestamp et les grandeurs, puis sauvegarde en base ou analyse
 * directement.
 */

import { useCallback, useRef, useState } from 'react';
import { parseExcelBuffer } from '@/lib/excel-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, Upload, Plus, Trash2, Save, Zap, AlertCircle, Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveCustomSensor, guessQuantityKind, type CustomSensor, type CustomSensorInput, type ExtraCol, type QuantityKind } from '@/lib/custom-sensor-service';
import { useOrganization } from '@/context/OrganizationContext';

interface CustomSensorMapperProps {
  onAnalyze: (file: File, config: CustomSensorInput) => Promise<void>;
  onSaved: (sensor: CustomSensor) => void;
}

interface FileColumns {
  file: File;
  columns: string[];
  preview: Record<string, unknown>[];
}

const EMPTY_EXTRA: ExtraCol = { label: '', col: '' };

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
  const [timestampFormat, setTimestampFormat] = useState('');
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
      let columns: string[] = [];
      let preview: Record<string, unknown>[] = [];

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = await parseExcelBuffer(buf);
        const sheetName = wb.sheetNames[0];
        const rows = wb.getRows(sheetName) as unknown[][];
        if (rows.length > 0) {
          columns = (rows[0] as string[]).map((h, i) => (h ? String(h).trim() : `col_${i}`));
          preview = rows.slice(1, 6).map((r) => {
            const row: Record<string, unknown> = {};
            columns.forEach((c, i) => { row[c] = (r as unknown[])[i] ?? null; });
            return row;
          });
        }
      } else {
        // CSV
        const text = await file.text();
        const lines = text.split('\n').filter(Boolean);
        const firstLine = lines[0] ?? '';
        const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
        columns = firstLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
        preview = lines.slice(1, 6).map((line) => {
          const vals = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, unknown> = {};
          columns.forEach((c, i) => { row[c] = vals[i] ?? null; });
          return row;
        });
      }

      setFileData({ file, columns, preview });
      // Auto-fill: guess timestamp column
      const tsGuess = columns.find((c) => /time|date|heure|ts|timestamp/i.test(c));
      if (tsGuess) setTimestampCol(tsGuess);
    } catch (err) {
      toast({ title: 'Erreur de lecture', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      timestamp_format: timestampFormat || undefined,
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
      setFileData(null); setName(''); setTimestampCol(''); setTimestampFormat('');
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
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            Les champs marqués * sont obligatoires
          </p>

          {/* Nom du capteur */}
          <Field label="Nom du capteur *">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ex: Compteur Hall RDC" className="bg-white/5 border-white/20 text-white" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Colonne timestamp */}
            <Field label="Colonne timestamp *">
              <ColSelect cols={cols} value={timestampCol} onChange={setTimestampCol} placeholder="Sélectionnez…" />
            </Field>

            {/* Format (optionnel) */}
            <Field label="Format timestamp" hint="Laisser vide pour détection auto">
              <Input value={timestampFormat} onChange={(e) => setTimestampFormat(e.target.value)}
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
                <ColSelect
                  cols={cols}
                  value={ec.col}
                  onChange={(v) => setExtraCols((p) => p.map((x, j) => j === i ? { ...x, col: v } : x))}
                  placeholder="Colonne…"
                />
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
            {extraCols.length === 0 && (
              <p className="text-slate-600 text-xs">Aucune — les colonnes supplémentaires apparaissent dans les graphiques multi-séries.</p>
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
