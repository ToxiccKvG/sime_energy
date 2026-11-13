import { Plus, X } from 'lucide-react';

// ─── SectionCustomFieldsBuilder (per-section) ────────────────────────────────

export function SectionCustomFieldsBuilder({ fields, onChange }: {
  fields: { id: string; key: string; value: string }[];
  onChange: (fields: { id: string; key: string; value: string }[]) => void;
}) {
  const addRow = () => onChange([...fields, { id: crypto.randomUUID(), key: '', value: '' }]);
  const removeRow = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const updateRow = (id: string, field: 'key' | 'value', val: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

  return (
    <div className="pt-3 border-t border-slate-700/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Champs additionnels</span>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Ajouter une ligne
        </button>
      </div>
      {fields.length > 0 && (
        <div className="space-y-1.5">
          {fields.map((f) => (
            <div key={f.id} className="flex gap-2 items-center group">
              <input
                type="text"
                value={f.key}
                onChange={(e) => updateRow(f.id, 'key', e.target.value)}
                placeholder="Clé / Libellé"
                className="flex-1 rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
              <input
                type="text"
                value={f.value}
                onChange={(e) => updateRow(f.id, 'value', e.target.value)}
                placeholder="Valeur"
                className="flex-1 rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
              <button
                type="button"
                onClick={() => removeRow(f.id)}
                className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
