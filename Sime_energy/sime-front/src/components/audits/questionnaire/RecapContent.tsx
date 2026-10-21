import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PVQuestionnaire } from '@/types/audit';
import {
  QUESTIONNAIRE_SCHEMA, WOYOFAL_CODE_LABELS, OBIS_BY_KEY, obisOptionLabel,
} from '@/constants/pv-questionnaire-schema';
import { SECTION_COLORS } from './section-colors';

export function RecapContent({ questionnaire }: { questionnaire: PVQuestionnaire }) {
  return (
    <div className="space-y-3 text-sm">
      {QUESTIONNAIRE_SCHEMA.map((schema, i) => {
        const sec = questionnaire.sections[i];
        if (!sec) return null;

        const filledFields = schema.fields?.filter((f) => sec.fields[f.id] && f.id !== 'localisation_lat' && f.id !== 'localisation_lng') ?? [];
        const hasCoords = sec.fields['localisation_lat'] && sec.fields['localisation_lng'];
        const filledRows = sec.tableRows?.filter((r) => {
          if (r.readings && r.readings.length > 0) return r.readings.some((rd) => rd.value);
          return !!r.value;
        }) ?? [];
        const checkedItems = sec.checkboxItems?.filter((c) => c.checked) ?? [];
        const checkedExtra = sec.extraCheckboxItems?.filter((c) => c.checked) ?? [];
        const sectionCf = (sec.customFields ?? []).filter((f) => f.key || f.value);
        const filledSessions = (sec.mesureSessions ?? []).filter((s) => s.readings.length > 0);

        if (!filledFields.length && !hasCoords && !filledRows.length && !checkedItems.length && !checkedExtra.length && !sec.freeText && !sectionCf.length && !filledSessions.length) return null;

        const color = SECTION_COLORS[i % SECTION_COLORS.length];

        return (
          <div key={schema.id} className="rounded-lg border border-slate-700/50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border-b border-slate-700/50">
              <span className={cn('flex items-center justify-center h-5 w-5 rounded text-xs font-bold bg-slate-700/80', color)}>{i + 1}</span>
              <span className="text-xs font-medium text-slate-300">{schema.title}</span>
            </div>
            <div className="p-3 bg-slate-800/20 space-y-2.5">
              {(filledFields.length > 0 || hasCoords) && (
                <div className="overflow-x-auto rounded border border-slate-700/40">
                  <table className="w-full text-xs">
                    <tbody>
                      {filledFields.map((f, fi) => (
                        <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                          <td className="px-3 py-1.5 text-slate-400 w-[42%]">{f.label}</td>
                          <td className="px-3 py-1.5 text-slate-200 whitespace-pre-wrap">{sec.fields[f.id]}</td>
                        </tr>
                      ))}
                      {hasCoords && (
                        <tr className="border-b border-slate-700/30 last:border-0">
                          <td className="px-3 py-1.5 text-slate-400">Coordonnées GPS</td>
                          <td className="px-3 py-1.5 text-blue-300">
                            {parseFloat(sec.fields['localisation_lat']).toFixed(5)}, {parseFloat(sec.fields['localisation_lng']).toFixed(5)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {filledRows.length > 0 && (
                <div className="overflow-x-auto rounded border border-slate-700/40">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-900/30">
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Paramètre</th>
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Date / Heure</th>
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filledRows.flatMap((r) => {
                        const readings = r.readings?.filter((rd) => rd.value)
                          ?? (r.value ? [{ id: r.id + '_v', dateTime: r.dateTime, value: r.value }] : []);
                        return readings.map((rd, rdIdx) => (
                          <tr key={rd.id || r.id + rdIdx} className={cn('border-b border-slate-700/30 last:border-0', rdIdx % 2 === 1 && 'bg-slate-800/20')}>
                            <td className="px-3 py-1.5 text-slate-300">{rdIdx === 0 ? r.label : ''}</td>
                            <td className="px-3 py-1.5 text-slate-400">{rd.dateTime || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-200">{rd.value}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filledSessions.map((session) => {
                const isW = session.type === 'WOYOFAL';
                return (
                  <div key={session.id} className={cn('overflow-x-auto rounded border', isW ? 'border-amber-500/25' : 'border-blue-500/25')}>
                    <div className={cn('flex items-center gap-2 px-3 py-1.5 border-b', isW ? 'bg-amber-500/5 border-amber-500/20' : 'bg-blue-500/5 border-blue-500/20')}>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', isW ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300')}>
                        {session.type}
                      </span>
                      <span className="text-xs font-medium text-slate-300">{session.label}</span>
                      {session.dateTime && <span className="text-[10px] text-slate-500">{session.dateTime}</span>}
                    </div>
                    {isW ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-amber-500/20 bg-amber-500/5">
                            <th className="px-3 py-1.5 text-left font-medium text-amber-400/70">Code Woyofal</th>
                            <th className="px-3 py-1.5 text-left font-medium text-amber-400/70">Valeur relevée</th>
                          </tr>
                        </thead>
                        <tbody>
                          {session.readings.map((r, ri) => r.kind === 'woyofal' && (
                            <tr key={r.id} className={cn('border-b last:border-0', ri % 2 === 1 && 'bg-amber-500/5')}>
                              <td className="px-3 py-1.5 text-slate-300">
                                <span className="font-mono">{r.code}</span>
                                {WOYOFAL_CODE_LABELS[r.code] && <span className="text-slate-400"> — {WOYOFAL_CODE_LABELS[r.code]}</span>}
                              </td>
                              <td className="px-3 py-1.5 text-slate-200">{r.valeur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-blue-500/20 bg-blue-500/5">
                            <th className="px-3 py-1.5 text-left font-medium text-blue-400/70">Paramètre</th>
                            <th className="px-3 py-1.5 text-left font-medium text-blue-400/70">Date et heure</th>
                            <th className="px-3 py-1.5 text-left font-medium text-blue-400/70">Valeur relevée</th>
                          </tr>
                        </thead>
                        <tbody>
                          {session.readings.map((r, ri) => r.kind === 'index' && (
                            <tr key={r.id} className={cn('border-b last:border-0', ri % 2 === 1 && 'bg-blue-500/5')}>
                              <td className="px-3 py-1.5 text-slate-300 align-top">{r.key}</td>
                              <td className="px-3 py-1.5 text-slate-400 align-top whitespace-nowrap">{r.date || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-200 align-top">
                                {r.subValues && r.subValues.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {r.subValues.map((sv) => {
                                      const e = OBIS_BY_KEY[sv.code];
                                      return (
                                        <div key={sv.id}>
                                          <span className="font-mono text-blue-300/80">{e ? obisOptionLabel(e) : sv.code}</span>
                                          {e?.libelle && <span className="text-slate-500"> · {e.libelle}</span>}
                                          <span className="text-slate-500"> = </span>
                                          <span>{sv.valeur || '—'}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : r.valeur || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              {checkedItems.length > 0 && (
                <div className="space-y-1">
                  {schema.checkboxLabel && <p className="text-xs text-slate-500 uppercase tracking-wide">{schema.checkboxLabel}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {checkedItems.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20">
                        {c.label}{c.comment && <span className="text-blue-400/60"> — {c.comment}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {checkedExtra.length > 0 && (
                <div className="space-y-1">
                  {schema.extraCheckboxLabel && <p className="text-xs text-slate-500 uppercase tracking-wide">{schema.extraCheckboxLabel}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {checkedExtra.map((c) => (
                      <span key={c.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sec.freeText && (
                <div className="space-y-1">
                  {schema.freeTextLabel && <p className="text-xs text-slate-500">{schema.freeTextLabel}</p>}
                  <p className="text-xs text-slate-300 bg-slate-800/40 rounded px-3 py-2 whitespace-pre-wrap">{sec.freeText}</p>
                </div>
              )}

              {sectionCf.length > 0 && (
                <div className="overflow-x-auto rounded border border-violet-500/20">
                  <table className="w-full text-xs">
                    <tbody>
                      {sectionCf.map((f, fi) => (
                        <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                          <td className="px-3 py-1.5 text-violet-300/70 w-[42%]">{f.key}</td>
                          <td className="px-3 py-1.5 text-slate-200">{f.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {questionnaire.customFields.filter((f) => f.key || f.value).length > 0 && (
        <div className="rounded-lg border border-violet-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
            <Settings2 className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-medium text-violet-300">Champs personnalisés globaux</span>
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {questionnaire.customFields.filter((f) => f.key || f.value).map((f, fi) => (
                  <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                    <td className="px-3 py-1.5 text-violet-300/70 w-[42%]">{f.key}</td>
                    <td className="px-3 py-1.5 text-slate-200">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
