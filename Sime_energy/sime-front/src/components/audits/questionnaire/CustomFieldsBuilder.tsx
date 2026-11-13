import { Plus, X, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── CustomFieldsBuilder ──────────────────────────────────────────────────────

export function CustomFieldsBuilder({ fields, onChange }: {
  fields: { id: string; key: string; value: string }[];
  onChange: (fields: { id: string; key: string; value: string }[]) => void;
}) {
  const addRow = () => onChange([...fields, { id: crypto.randomUUID(), key: '', value: '' }]);
  const removeRow = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const updateRow = (id: string, field: 'key' | 'value', val: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

  return (
    <div className="rounded-lg border border-dashed border-slate-600/60 bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-slate-300">Champs personnalisés</span>
        </div>
        <span className="text-xs text-slate-500">Ajoutez vos propres indicateurs</span>
      </div>
      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-900/40">
                <th className="px-3 py-2 text-left text-slate-400 font-medium w-[45%]">Clé / Libellé</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium">Valeur</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id} className={cn('border-b border-slate-700/40 last:border-0 group', i % 2 === 1 && 'bg-slate-800/20')}>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={f.key}
                      onChange={(e) => updateRow(f.id, 'key', e.target.value)}
                      placeholder="Ex: Irradiation annuelle"
                      className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => updateRow(f.id, 'value', e.target.value)}
                      placeholder="—"
                      className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(f.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-violet-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une ligne
      </button>
    </div>
  );
}
