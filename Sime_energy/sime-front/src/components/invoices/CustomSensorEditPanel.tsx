/**
 * Panneau d'édition d'un capteur personnalisé existant.
 * Contrairement à CustomSensorMapper (création), pas de fichier à déposer :
 * les colonnes sont modifiées en texte libre directement.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateCustomSensor, guessQuantityKind, type CustomSensor, type ExtraCol, type QuantityKind } from '@/lib/custom-sensor-service';

interface CustomSensorEditPanelProps {
  sensor: CustomSensor;
  onSaved: (sensor: CustomSensor) => void;
  onCancel: () => void;
}

const EMPTY_EXTRA: ExtraCol = { label: '', col: '' };

const QUANTITY_KIND_OPTIONS: { value: QuantityKind; label: string; hint: string }[] = [
  { value: 'power', label: 'Puissance instantanée (W, kW…)', hint: 'Le cumul total sera calculé par intégration dans le temps (→ énergie)' },
  { value: 'energy', label: 'Énergie déjà cumulable (Wh, kWh…)', hint: 'Le cumul total sera la simple somme des échantillons' },
  { value: 'other', label: 'Autre (ppm, °C, %…)', hint: 'Pas de cumul total affiché — une somme n\'aurait pas de sens physique' },
];

export function CustomSensorEditPanel({ sensor, onSaved, onCancel }: CustomSensorEditPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(sensor.name);
  const [timestampCol, setTimestampCol] = useState(sensor.timestamp_col);
  const [timestampFormat, setTimestampFormat] = useState(sensor.timestamp_format ?? '');
  const [valueCol, setValueCol] = useState(sensor.value_col);
  const [unit, setUnit] = useState(sensor.unit);
  const [metricLabel, setMetricLabel] = useState(sensor.metric_label);
  const [extraCols, setExtraCols] = useState<ExtraCol[]>(sensor.extra_cols ?? []);
  const [keepNegative, setKeepNegative] = useState(sensor.keep_negative);
  const [quantityKind, setQuantityKind] = useState<QuantityKind>(sensor.quantity_kind ?? 'energy');
  // Si le capteur a déjà un type de grandeur explicite, on ne le réécrase pas
  // silencieusement en changeant l'unité — seuls les capteurs legacy (créés avant
  // ce champ) profitent de la suggestion automatique.
  const [quantityKindTouched, setQuantityKindTouched] = useState(sensor.quantity_kind !== undefined);

  const handleUnitChange = (v: string) => {
    setUnit(v);
    if (!quantityKindTouched) setQuantityKind(guessQuantityKind(v));
  };

  const handleSave = async () => {
    if (!name || !timestampCol || !valueCol || !unit || !metricLabel) {
      toast({ title: 'Formulaire incomplet', description: 'Remplissez tous les champs obligatoires (*)', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const saved = await updateCustomSensor(sensor.id, {
        name,
        timestamp_col: timestampCol,
        timestamp_format: timestampFormat || undefined,
        value_col: valueCol,
        unit,
        metric_label: metricLabel,
        extra_cols: extraCols.filter((e) => e.col && e.label),
        keep_negative: keepNegative,
        quantity_kind: quantityKind,
      });
      toast({ title: 'Capteur mis à jour', description: `« ${saved.name} » a été modifié` });
      onSaved(saved);
    } catch (err) {
      toast({ title: 'Erreur de mise à jour', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 border border-blue-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-white font-medium text-sm">Modifier le capteur</h4>
        <button className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> Annuler
        </button>
      </div>

      <Field label="Nom du capteur *">
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="ex: Compteur Hall RDC" className="bg-white/5 border-white/20 text-white" />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Colonne timestamp *">
          <Input value={timestampCol} onChange={(e) => setTimestampCol(e.target.value)}
            className="bg-white/5 border-white/20 text-white font-mono text-sm" />
        </Field>

        <Field label="Format timestamp" hint="Laisser vide pour détection auto">
          <Input value={timestampFormat} onChange={(e) => setTimestampFormat(e.target.value)}
            placeholder="ex: %d/%m/%Y %H:%M" className="bg-white/5 border-white/20 text-white font-mono text-sm" />
        </Field>

        <Field label="Colonne grandeur principale *">
          <Input value={valueCol} onChange={(e) => setValueCol(e.target.value)}
            className="bg-white/5 border-white/20 text-white font-mono text-sm" />
        </Field>

        <Field label="Libellé de la grandeur *">
          <Input value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)}
            placeholder="ex: Puissance active" className="bg-white/5 border-white/20 text-white" />
        </Field>

        <Field label="Unité *">
          <Input value={unit} onChange={(e) => handleUnitChange(e.target.value)}
            placeholder="ex: W, kWh, ppm, °C" className="bg-white/5 border-white/20 text-white" />
        </Field>

        <Field label="Valeurs négatives">
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={keepNegative} onChange={(e) => setKeepNegative(e.target.checked)}
              className="w-4 h-4 accent-blue-500" />
            <span className="text-slate-300 text-sm">Conserver (injection réseau, retour…)</span>
          </label>
        </Field>

        <Field label="Type de grandeur" hint={QUANTITY_KIND_OPTIONS.find((o) => o.value === quantityKind)?.hint}>
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
            <Input
              value={ec.col}
              onChange={(e) => setExtraCols((p) => p.map((x, j) => j === i ? { ...x, col: e.target.value } : x))}
              placeholder="Colonne"
              className="bg-white/5 border-white/20 text-white text-sm font-mono flex-1"
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

      <Button onClick={handleSave} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Enregistrer les modifications
      </Button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
