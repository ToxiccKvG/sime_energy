import { cn } from '@/lib/utils';
import type { PVTableRow } from '@/types/audit';

// ─── SystemTableEditor (Section 8) ───────────────────────────────────────────

export function SystemTableEditor({ rows, onChange }: {
  rows: PVTableRow[];
  onChange: (rows: PVTableRow[]) => void;
}) {
  const update = (id: string, val: string) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, value: val } : r)));
  };

  const groups: string[] = [];
  rows.forEach((r) => { if (r.subGroup && !groups.includes(r.subGroup)) groups.push(r.subGroup); });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/60 bg-slate-900/40">
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[35%]">Sous-système</th>
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[40%]">Paramètre</th>
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[25%]">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const groupRows = rows.filter((r) => r.subGroup === group);
            return groupRows.map((row, i) => (
              <tr key={row.id} className={cn('border-b border-slate-700/40 last:border-0', i % 2 === 1 && 'bg-slate-800/20')}>
                {i === 0 && (
                  <td
                    rowSpan={groupRows.length}
                    className="px-3 py-2 text-xs font-semibold text-blue-300/80 bg-blue-500/5 border-r border-slate-700/40 align-top pt-3"
                  >
                    {group}
                  </td>
                )}
                <td className="px-3 py-2 text-slate-300">{row.label}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => update(row.id, e.target.value)}
                    placeholder="—"
                    className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                  />
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
