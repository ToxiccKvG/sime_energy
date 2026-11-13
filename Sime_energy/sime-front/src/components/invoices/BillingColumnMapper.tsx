import { useMemo, useState } from 'react';
import { DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, FileSpreadsheet, RotateCcw,
} from 'lucide-react';
import {
  BILLING_TEMPLATE_COLUMNS, BillingColumnDef, BillingColumnKey, ColumnGroup,
} from './billing-import.types';
import {
  DateFormat, MAPPING_BLOCKING_KEYS, SourceColumn, coerceCell, getMappingIssues,
} from './billing-column-mapping';
import type { MappingState } from './useBillingImport';

// ─── Constants ────────────────────────────────────────────────────────────────

const IGNORE = '__ignore__';

const GROUP_ORDER: ColumnGroup[] = ['Identité', 'Facture', 'Index', 'Énergie', 'Puissance', 'Tarif', 'Réactif', 'Site', 'Calculé'];

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: 'Automatique (JJ/MM par défaut)',
  DMY: 'JJ/MM/AAAA',
  MDY: 'MM/JJ/AAAA',
};

const LABEL_BY_KEY = new Map<BillingColumnKey, string>(BILLING_TEMPLATE_COLUMNS.map(c => [c.key, c.label]));

function triggerId(key: BillingColumnKey) {
  return `mapping-${key}`;
}

function sourceName(col: SourceColumn) {
  return `${col.letter} · ${col.label || '(sans en-tête)'}`;
}

function fmtRaw(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/** Aperçu de la 1re valeur de la colonne source telle qu'elle sera importée. */
function previewValue(def: BillingColumnDef, source: SourceColumn | undefined, dateFormat: DateFormat) {
  if (!source) return null;
  const raw = source.samples[0];
  if (raw === undefined) return { text: 'Colonne vide', invalid: false };
  const { value, skipped, invalid } = coerceCell(raw, def.type, dateFormat);
  if (skipped) return { text: '« - » non applicable', invalid: false };
  if (invalid) return { text: `« ${fmtRaw(raw)} » illisible`, invalid: true };
  if (value instanceof Date) {
    return { text: value.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }), invalid: false };
  }
  if (typeof value === 'number') return { text: value.toLocaleString('fr-FR'), invalid: false };
  return { text: fmtRaw(value) || '—', invalid: false };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  state: MappingState;
  isBuilding: boolean;
  error: string | null;
  onSelectSheet: (sheetName: string) => void;
  onHeaderRowChange: (headerRow: number) => void;
  onDateFormatChange: (dateFormat: DateFormat) => void;
  onFieldChange: (key: BillingColumnKey, sourceIndex: number | null) => void;
  onResetAuto: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function BillingColumnMapper({
  state, isBuilding, error,
  onSelectSheet, onHeaderRowChange, onDateFormatChange, onFieldChange, onResetAuto, onBack, onContinue,
}: Props) {
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [showBlocking, setShowBlocking] = useState(false);
  // Saisie libre de la ligne d'en-tête, appliquée à la validation (Entrée / perte de focus)
  const [headerDraft, setHeaderDraft] = useState<string | null>(null);

  const { mapping, origin, columns, dateFormat } = state;
  const issues = useMemo(() => getMappingIssues(mapping), [mapping]);
  const columnByIndex = useMemo(() => new Map(columns.map(c => [c.index, c])), [columns]);

  const usedIndexes = useMemo(() => {
    const s = new Set<number>();
    for (const idx of Object.values(mapping)) if (idx != null) s.add(idx);
    return s;
  }, [mapping]);
  const unusedColumns = columns.filter(c => !usedIndexes.has(c.index));

  const groups = useMemo(() => GROUP_ORDER.map(group => ({
    group,
    fields: BILLING_TEMPLATE_COLUMNS.filter(c => c.group === group && (!onlyUnmapped || mapping[c.key] == null)),
  })).filter(g => g.fields.length > 0), [mapping, onlyUnmapped]);

  const totalFields = BILLING_TEMPLATE_COLUMNS.length;
  const blockingKeys = new Set(issues.blocking.map(c => c.key));

  function commitHeaderRow() {
    if (headerDraft == null) return;
    const n = parseInt(headerDraft, 10);
    if (!isNaN(n) && n >= 1 && n - 1 !== state.headerRow) onHeaderRowChange(n - 1);
    setHeaderDraft(null);
  }

  function handleContinue() {
    if (issues.blocking.length > 0) {
      setShowBlocking(true);
      setOnlyUnmapped(false);
      // Laisse le temps à la liste de se réafficher avant de déplacer le focus
      requestAnimationFrame(() => document.getElementById(triggerId(issues.blocking[0].key))?.focus());
      return;
    }
    onContinue();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── En-tête ── */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.08] shrink-0">
        <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Correspondance des colonnes
        </DialogTitle>
        <p className="text-xs text-slate-500 mt-1 truncate">
          {state.fileName} · {columns.length} colonne{columns.length > 1 ? 's' : ''} détectée{columns.length > 1 ? 's' : ''} · {state.dataRowCount.toLocaleString('fr-FR')} ligne{state.dataRowCount > 1 ? 's' : ''} de données
        </p>
      </div>

      {/* ── Réglages de lecture ── */}
      <div className="px-5 py-3 border-b border-white/[0.08] shrink-0 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <label htmlFor="mapping-sheet" className="text-[11px] font-medium text-slate-400 mb-1 block">Feuille</label>
          <Select value={state.sheetName} onValueChange={onSelectSheet}>
            <SelectTrigger id="mapping-sheet" className="w-48 h-8 text-xs bg-[#13162a] border-white/10 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
              {state.workbook.SheetNames.map(name => (
                <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="mapping-header-row" className="text-[11px] font-medium text-slate-400 mb-1 block">Ligne d'en-tête</label>
          <div className="flex items-center gap-2">
            <Input
              id="mapping-header-row"
              type="number"
              inputMode="numeric"
              min={1}
              value={headerDraft ?? String(state.headerRow + 1)}
              onChange={e => setHeaderDraft(e.target.value)}
              onBlur={commitHeaderRow}
              onKeyDown={e => { if (e.key === 'Enter') commitHeaderRow(); }}
              aria-describedby="mapping-header-hint"
              className="w-20 h-8 text-xs bg-[#13162a] border-white/10 text-slate-200 tabular-nums"
            />
            <span id="mapping-header-hint" className="text-[11px] text-slate-500">
              {state.headerRow === state.detectedHeaderRow
                ? 'détectée automatiquement'
                : (
                  <button
                    type="button"
                    onClick={() => onHeaderRowChange(state.detectedHeaderRow)}
                    className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  >
                    revenir à la ligne {state.detectedHeaderRow + 1} (détectée)
                  </button>
                )}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="mapping-date-format" className="text-[11px] font-medium text-slate-400 mb-1 block">Dates saisies en texte</label>
          <Select value={dateFormat} onValueChange={v => onDateFormatChange(v as DateFormat)}>
            <SelectTrigger id="mapping-date-format" className="w-56 h-8 text-xs bg-[#13162a] border-white/10 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
              {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map(f => (
                <SelectItem key={f} value={f} className="text-xs">{DATE_FORMAT_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="ml-auto text-xs text-slate-400 tabular-nums" role="status">
          <span className="font-semibold text-slate-100">{issues.mappedCount}</span> / {totalFields} champs associés
          {issues.missingRequired.length > 0 && (
            <span className="text-amber-400"> · {issues.missingRequired.length} requis manquant{issues.missingRequired.length > 1 ? 's' : ''}</span>
          )}
        </p>
      </div>

      {/* ── Bandeaux ── */}
      <div className="px-5 pt-3 space-y-2 shrink-0 empty:hidden">
        {state.isStandard && issues.blocking.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <p className="text-xs text-emerald-200">Template SENELEC standard reconnu : toutes les colonnes sont associées. Vous pouvez continuer.</p>
          </div>
        )}
        {showBlocking && issues.blocking.length > 0 && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-500/[0.08] border border-red-500/20 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-px" aria-hidden="true" />
            <p className="text-xs text-red-200">
              Associez ces champs avant de continuer, ils servent à dater et identifier chaque facture :{' '}
              <span className="font-semibold">{issues.blocking.map(c => c.label).join(', ')}</span>.
            </p>
          </div>
        )}
        {issues.missingRequired.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-px" aria-hidden="true" />
            <p className="text-xs text-amber-200">
              Champs requis sans colonne : {issues.missingRequired.map(c => c.label).join(', ')}.
              Les factures seront signalées incomplètes dans l'aperçu ; la résolution auto peut en recalculer une partie (TVA, nombre de jours…).
            </p>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-500/[0.08] border border-red-500/20 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-px" aria-hidden="true" />
            <p className="text-xs text-red-200 break-all">{error}</p>
          </div>
        )}
      </div>

      {/* ── Corps : champs SIMEE ← colonnes du fichier ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ScrollArea className="min-h-0">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="hidden md:grid grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,200px)] gap-3 flex-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Champ SIMEE</span>
                <span>Colonne du fichier</span>
                <span>Aperçu 1re ligne</span>
              </div>
              <div className="flex rounded-lg border border-white/10 p-0.5 shrink-0" role="group" aria-label="Filtrer les champs">
                {[{ v: false, l: 'Tous' }, { v: true, l: 'Non associés' }].map(opt => (
                  <button
                    key={opt.l}
                    type="button"
                    aria-pressed={onlyUnmapped === opt.v}
                    onClick={() => setOnlyUnmapped(opt.v)}
                    className={[
                      'h-6 px-2.5 text-[11px] rounded-md transition-colors',
                      onlyUnmapped === opt.v ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300',
                    ].join(' ')}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            {groups.length === 0 && (
              <p className="text-xs text-slate-500 py-8 text-center">Tous les champs sont associés.</p>
            )}

            {groups.map(({ group, fields }) => (
              <section key={group} className="mb-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1">{group}</h3>
                <div className="space-y-0.5">
                  {fields.map(def => {
                    const idx = mapping[def.key];
                    const source = idx != null ? columnByIndex.get(idx) : undefined;
                    const preview = previewValue(def, source, dateFormat);
                    const sharedWith = idx != null ? (issues.shared.get(idx) ?? []).filter(k => k !== def.key) : [];
                    const isBlocking = MAPPING_BLOCKING_KEYS.includes(def.key);
                    const flagged = showBlocking && blockingKeys.has(def.key);
                    return (
                      <div
                        key={def.key}
                        className={[
                          'grid grid-cols-1 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,200px)] items-center gap-x-3 gap-y-1 px-2 py-1.5 rounded-lg',
                          flagged ? 'bg-red-500/[0.06]' : 'hover:bg-white/[0.02]',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <label htmlFor={triggerId(def.key)} className="text-xs text-slate-200 truncate">{def.label}</label>
                          {isBlocking ? (
                            <span className="shrink-0 text-[10px] px-1.5 rounded bg-red-500/10 text-red-300">Indispensable</span>
                          ) : def.computed ? (
                            <span className="shrink-0 text-[10px] px-1.5 rounded bg-sky-500/10 text-sky-300">Calculé si absent</span>
                          ) : def.required ? (
                            <span className="shrink-0 text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-300">Requis</span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 min-w-0">
                          <Select
                            value={idx != null ? String(idx) : IGNORE}
                            onValueChange={v => onFieldChange(def.key, v === IGNORE ? null : Number(v))}
                          >
                            <SelectTrigger
                              id={triggerId(def.key)}
                              aria-invalid={flagged || undefined}
                              className={[
                                'h-8 text-xs bg-[#13162a] text-slate-200 min-w-0',
                                flagged ? 'border-red-500/50' : 'border-white/10',
                                idx == null ? 'text-slate-500' : '',
                              ].join(' ')}
                            >
                              {/* Libellé explicite : sans l'exemple affiché dans la liste */}
                              <SelectValue>{source ? sourceName(source) : '— Ignorer —'}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-[#0b0d14] border-white/10 text-white max-h-80">
                              <SelectItem value={IGNORE} className="text-xs text-slate-400">— Ignorer —</SelectItem>
                              {columns.map(c => (
                                <SelectItem key={c.index} value={String(c.index)} className="text-xs">
                                  {sourceName(c)}
                                  {c.samples[0] !== undefined && (
                                    <span className="text-slate-500"> — ex. {fmtRaw(c.samples[0])}</span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {origin[def.key] && (
                            <span
                              className="shrink-0 text-[10px] px-1.5 rounded bg-emerald-500/10 text-emerald-300"
                              title={origin[def.key] === 'exact' ? 'En-tête identique au template' : 'Associé via un intitulé proche'}
                            >
                              auto
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 text-[11px] leading-tight">
                          {preview && (
                            <p className={['truncate tabular-nums', preview.invalid ? 'text-amber-400' : 'text-slate-400'].join(' ')}>
                              {preview.invalid && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-px" aria-hidden="true" />}
                              {preview.text}
                            </p>
                          )}
                          {sharedWith.length > 0 && (
                            <p className="truncate text-slate-500">aussi utilisée pour {sharedWith.map(k => LABEL_BY_KEY.get(k)).join(', ')}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>

        {/* ── Colonnes du fichier non utilisées ── */}
        <aside className="hidden lg:flex flex-col min-h-0 border-l border-white/[0.08]">
          <div className="px-4 pt-3 pb-2 shrink-0">
            <h3 className="text-xs font-semibold text-slate-300">Colonnes ignorées ({unusedColumns.length})</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Colonnes du fichier qui ne seront pas importées.</p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <ul className="px-4 pb-3 space-y-1.5">
              {unusedColumns.length === 0 && (
                <li className="text-[11px] text-slate-500">Toutes les colonnes du fichier sont utilisées.</li>
              )}
              {unusedColumns.map(c => (
                <li key={c.index} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <p className="text-xs text-slate-300 truncate">
                    <span className="text-slate-500 tabular-nums mr-1.5">{c.letter}</span>
                    {c.label || <span className="italic text-slate-500">(sans en-tête)</span>}
                  </p>
                  {c.samples.length > 0 && (
                    <p className="text-[11px] text-slate-500 truncate">ex. {c.samples.map(fmtRaw).join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>
      </div>

      {/* ── Pied ── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-8 px-3 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Changer de fichier
          </button>
          <button
            type="button"
            onClick={onResetAuto}
            className="h-8 px-3 text-xs rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Réinitialiser l'auto-détection
          </button>
        </div>
        <button
          type="button"
          onClick={handleContinue}
          disabled={isBuilding}
          className="h-8 px-4 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5"
        >
          {isBuilding
            ? <><span className="w-3 h-3 rounded-full border border-black/30 border-t-black animate-spin" aria-hidden="true" />Continuer vers l'aperçu</>
            : <>Continuer vers l'aperçu<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></>
          }
        </button>
      </div>
    </div>
  );
}
