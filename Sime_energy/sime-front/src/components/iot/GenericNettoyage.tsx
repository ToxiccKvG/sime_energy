import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, CheckCircle2, Columns, Download, Eraser, Filter, Replace,
  RotateCcw, ScanLine, Search, Trash2, Wand2, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type GenericRow = Record<string, unknown>;
type ColType = 'date' | 'num' | 'text';
type IssueType = 'missing' | 'duplicates_exact' | 'duplicates_key' | 'outliers' | 'negatives' | 'invalid_dates';
type FillMethod = 'empty' | 'zero' | 'mean' | 'forward';

interface Issue {
  id: IssueType;
  count: number;
  description: string;
  detail?: string;
  ignored: boolean;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const normalized = s.replace(/\s/g, '').replace(',', '.');
    const n = Number(normalized);
    return isFinite(n) ? n : null;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function inferColType(col: string, rows: GenericRow[]): ColType {
  const sample = rows.slice(0, 50).map(r => r[col]).filter(v => !isEmpty(v));
  if (sample.length === 0) return 'text';
  const dateHits = sample.filter(v => toDate(v) !== null).length;
  const numHits = sample.filter(v => toNum(v) !== null).length;
  if (dateHits / sample.length >= 0.8) return 'date';
  if (numHits / sample.length >= 0.8) return 'num';
  return 'text';
}

function computeStats(values: number[]) {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  return { mean, std, min, max };
}

function safeString(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? '');
}

function rowKey(row: GenericRow, cols: string[]): string {
  return cols.map(c => safeString(row[c])).join('||');
}

function pickLikelyKeyColumn(columns: string[]): string | null {
  const candidates = ['device_id', 'id', 'device', 'nom', 'name', 'Temps', 'Date', 'timestamp', 'ts', 'ts_heure'];
  for (const c of candidates) {
    const exact = columns.find(x => x === c);
    if (exact) return exact;
    const loose = columns.find(x => x.toLowerCase() === c.toLowerCase());
    if (loose) return loose;
  }
  return null;
}

export function GenericNettoyage({
  initialRows,
  fileName,
  onSave,
}: {
  initialRows: GenericRow[];
  fileName: string;
  onSave: (rows: GenericRow[]) => void;
}) {
  const [rows, setRows] = useState<GenericRow[]>(initialRows);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [hasAnalysed, setHasAnalysed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [undoStack, setUndoStack] = useState<GenericRow[][]>([]);
  const [showTransformer, setShowTransformer] = useState(false);
  const [showFR, setShowFR] = useState(false);
  const [highlightOutliers, setHighlightOutliers] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [keyCol, setKeyCol] = useState<string>('');

  const columns = useMemo(() => {
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    return cols;
  }, [rows]);

  const colTypes = useMemo(() => {
    const map: Record<string, ColType> = {};
    for (const col of columns) map[col] = inferColType(col, rows);
    return map;
  }, [columns, rows]);

  const defaultVisibleCols = useMemo(() => {
    if (columns.length === 0) return new Set<string>();
    const likely = pickLikelyKeyColumn(columns);
    const base = new Set<string>(columns.slice(0, 12));
    if (likely) base.add(likely);
    return base;
  }, [columns]);

  const visibleCols = useMemo(() => {
    if (selectedCols.size === 0) return defaultVisibleCols;
    return selectedCols;
  }, [defaultVisibleCols, selectedCols]);

  const pushUndo = useCallback((r: GenericRow[]) => {
    setUndoStack(s => [...s.slice(-9), r]);
  }, []);

  const doUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRows(prev);
    setPage(0);
  }, [undoStack]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        columns.some(c => safeString(row[c]).toLowerCase().includes(q))
      );
    }
    return r;
  }, [rows, search, columns]);

  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const analyse = useCallback(() => {
    if (rows.length === 0) return;
    const found: Omit<Issue, 'ignored'>[] = [];

    // Missing values (global)
    let missing = 0;
    for (const row of rows) {
      for (const col of columns) if (isEmpty(row[col])) missing++;
    }
    if (missing > 0) {
      found.push({
        id: 'missing',
        count: missing,
        description: `${missing} valeur(s) manquante(s)`,
        detail: `Sur ${rows.length.toLocaleString('fr-FR')} lignes × ${columns.length} colonnes`,
      });
    }

    // Invalid dates
    const dateCols = columns.filter(c => colTypes[c] === 'date');
    let invalidDates = 0;
    for (const c of dateCols) {
      for (const row of rows) {
        const v = row[c];
        if (isEmpty(v)) continue;
        if (toDate(v) === null) invalidDates++;
      }
    }
    if (invalidDates > 0) {
      found.push({
        id: 'invalid_dates',
        count: invalidDates,
        description: `${invalidDates} date(s) invalide(s)`,
        detail: dateCols.length ? `Colonnes dates: ${dateCols.slice(0, 5).join(', ')}${dateCols.length > 5 ? '…' : ''}` : undefined,
      });
    }

    // Duplicates exact
    const seen = new Set<string>();
    let dupExact = 0;
    const keyCols = columns;
    for (const row of rows) {
      const k = rowKey(row, keyCols);
      if (seen.has(k)) dupExact++;
      else seen.add(k);
    }
    if (dupExact > 0) {
      found.push({
        id: 'duplicates_exact',
        count: dupExact,
        description: `${dupExact} doublon(s) exact(s)`,
      });
    }

    // Duplicates by key column (if chosen)
    if (keyCol) {
      const map = new Map<string, number>();
      for (const row of rows) {
        const k = safeString(row[keyCol]);
        if (!k) continue;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      const dup = [...map.values()].filter(c => c > 1).reduce((s, c) => s + (c - 1), 0);
      if (dup > 0) {
        found.push({
          id: 'duplicates_key',
          count: dup,
          description: `${dup} doublon(s) sur la clé "${keyCol}"`,
        });
      }
    }

    // Negatives / Outliers (numeric)
    const numCols = columns.filter(c => colTypes[c] === 'num');
    let negatives = 0;
    let outliers = 0;
    for (const c of numCols) {
      const vals = rows.map(r => toNum(r[c])).filter((v): v is number => v !== null);
      const { mean, std } = computeStats(vals);
      const threshold = mean + 3 * std;
      for (const row of rows) {
        const n = toNum(row[c]);
        if (n === null) continue;
        if (n < 0) negatives++;
        if (std > 0 && n > threshold) outliers++;
      }
    }
    if (negatives > 0) {
      found.push({ id: 'negatives', count: negatives, description: `${negatives} valeur(s) négative(s)` });
    }
    if (outliers > 0) {
      found.push({ id: 'outliers', count: outliers, description: `${outliers} valeur(s) aberrante(s) (z-score)` });
    }

    setIssues(found.map(i => ({ ...i, ignored: false })));
    setHasAnalysed(true);
  }, [rows, columns, colTypes, keyCol]);

  const ignoreIssue = useCallback((id: IssueType) => {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, ignored: true } : i));
  }, []);

  const doRemoveExactDuplicates = useCallback(() => {
    if (rows.length === 0) return;
    const seen = new Set<string>();
    const unique: GenericRow[] = [];
    for (const row of rows) {
      const k = rowKey(row, columns);
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(row);
      }
    }
    pushUndo(rows);
    setRows(unique);
    ignoreIssue('duplicates_exact');
    setPage(0);
  }, [rows, columns, pushUndo, ignoreIssue]);

  const doRemoveKeyDuplicates = useCallback((keep: 'first' | 'last') => {
    if (!keyCol) return;
    const map = new Map<string, GenericRow>();
    const out: GenericRow[] = [];
    if (keep === 'first') {
      for (const row of rows) {
        const k = safeString(row[keyCol]);
        if (!k) { out.push(row); continue; }
        if (!map.has(k)) { map.set(k, row); out.push(row); }
      }
    } else {
      const idx = new Map<string, number>();
      for (let i = 0; i < rows.length; i++) {
        const k = safeString(rows[i][keyCol]);
        if (!k) continue;
        idx.set(k, i);
      }
      const keepIdx = new Set(idx.values());
      for (let i = 0; i < rows.length; i++) {
        const k = safeString(rows[i][keyCol]);
        if (!k) out.push(rows[i]);
        else if (keepIdx.has(i)) out.push(rows[i]);
      }
    }
    pushUndo(rows);
    setRows(out);
    ignoreIssue('duplicates_key');
    setPage(0);
  }, [rows, keyCol, pushUndo, ignoreIssue]);

  const doFillMissing = useCallback((method: FillMethod) => {
    pushUndo(rows);
    if (method === 'empty') {
      setRows(rows.map(r => ({ ...r })));
      ignoreIssue('missing');
      return;
    }
    const numCols = columns.filter(c => colTypes[c] === 'num');
    const means: Record<string, number> = {};
    for (const c of numCols) {
      const vals = rows.map(r => toNum(r[c])).filter((v): v is number => v !== null);
      means[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    const filled = rows.map((row, i) => {
      const next: GenericRow = { ...row };
      for (const c of columns) {
        if (!isEmpty(next[c])) continue;
        if (colTypes[c] === 'num') {
          next[c] = method === 'zero' ? 0 : means[c] ?? 0;
        } else if (colTypes[c] === 'text') {
          next[c] = '';
        } else if (colTypes[c] === 'date') {
          if (method === 'forward' && i > 0) next[c] = rows[i - 1][c] ?? '';
          else next[c] = '';
        }
      }
      return next;
    });
    setRows(filled);
    ignoreIssue('missing');
  }, [rows, columns, colTypes, pushUndo, ignoreIssue]);

  const doFixNegatives = useCallback(() => {
    const numCols = columns.filter(c => colTypes[c] === 'num');
    pushUndo(rows);
    setRows(rows.map(row => {
      const next = { ...row };
      for (const c of numCols) {
        const n = toNum(next[c]);
        if (n !== null && n < 0) next[c] = 0;
      }
      return next;
    }));
    ignoreIssue('negatives');
  }, [rows, columns, colTypes, pushUndo, ignoreIssue]);

  const doDeleteOutliers = useCallback(() => {
    const numCols = columns.filter(c => colTypes[c] === 'num');
    const thresholds: Record<string, number> = {};
    for (const c of numCols) {
      const vals = rows.map(r => toNum(r[c])).filter((v): v is number => v !== null);
      const { mean, std } = computeStats(vals);
      thresholds[c] = mean + 3 * std;
    }
    const filtered = rows.filter(row => {
      for (const c of numCols) {
        const n = toNum(row[c]);
        if (n !== null && thresholds[c] && n > thresholds[c] && thresholds[c] !== 0) return false;
      }
      return true;
    });
    pushUndo(rows);
    setRows(filtered);
    ignoreIssue('outliers');
    setPage(0);
  }, [rows, columns, colTypes, pushUndo, ignoreIssue]);

  const exportFile = useCallback((format: 'xlsx' | 'csv_fr') => {
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Nettoyage');
      XLSX.writeFile(wb, `nettoyage_${fileName}.xlsx`);
    } else {
      const sep = ';';
      const headers = columns.join(sep);
      const csvRows = rows.map(r => columns.map(c => {
        let v = safeString(r[c] ?? '');
        if (colTypes[c] === 'num') v = v.replace('.', ',');
        return v.includes(sep) || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(sep));
      const csv = '\uFEFF' + [headers, ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `nettoyage_${fileName}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  }, [rows, fileName, columns, colTypes]);

  // Find & Replace
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frCol, setFrCol] = useState<string>('all');
  const [frCase, setFrCase] = useState(false);

  const doFindReplace = useCallback(() => {
    if (!frFind) return;
    const cols = frCol === 'all' ? columns : [frCol];
    pushUndo(rows);
    setRows(rows.map(row => {
      const next = { ...row };
      for (const c of cols) {
        const raw = safeString(next[c]);
        const found = frCase ? raw.includes(frFind) : raw.toLowerCase().includes(frFind.toLowerCase());
        if (!found) continue;
        const replaced = frCase
          ? raw.split(frFind).join(frReplace)
          : raw.replace(new RegExp(frFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), frReplace);
        next[c] = colTypes[c] === 'num' ? (toNum(replaced) ?? replaced) : replaced;
      }
      return next;
    }));
  }, [frFind, frReplace, frCol, frCase, rows, columns, colTypes, pushUndo]);

  // Transformer (mass update)
  const [trCol, setTrCol] = useState<string>('');
  const [trOp, setTrOp] = useState<'trim' | 'dot_comma' | 'comma_dot' | 'to_number' | 'to_date'>('trim');
  const trColType = trCol ? colTypes[trCol] : 'text';

  const doTransform = useCallback(() => {
    if (!trCol) return;
    pushUndo(rows);
    setRows(rows.map(row => {
      const next = { ...row };
      const raw = next[trCol];
      const s = safeString(raw);
      if (trOp === 'trim') next[trCol] = typeof raw === 'string' ? raw.trim() : s.trim();
      if (trOp === 'dot_comma') next[trCol] = s.replace(/\./g, ',');
      if (trOp === 'comma_dot') next[trCol] = s.replace(/,/g, '.');
      if (trOp === 'to_number') next[trCol] = toNum(raw) ?? raw;
      if (trOp === 'to_date') next[trCol] = toDate(raw) ?? raw;
      return next;
    }));
  }, [rows, trCol, trOp, pushUndo]);

  const outlierMap = useMemo(() => {
    const numCols = columns.filter(c => colTypes[c] === 'num');
    const thresholds: Record<string, number> = {};
    for (const c of numCols) {
      const vals = rows.map(r => toNum(r[c])).filter((v): v is number => v !== null);
      const { mean, std } = computeStats(vals);
      thresholds[c] = mean + 3 * std;
    }
    return thresholds;
  }, [rows, columns, colTypes]);

  const activeIssues = issues.filter(i => !i.ignored);
  const nbProblems = activeIssues.length;

  // Init key col once
  const didInitRef = useRef(false);
  if (!didInitRef.current && columns.length > 0) {
    didInitRef.current = true;
    const k = pickLikelyKeyColumn(columns);
    if (k) setKeyCol(k);
    setTrCol(columns[0] ?? '');
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Nettoyage générique</p>
          <p className="text-slate-500 text-xs mt-0.5">{fileName} · {rows.length.toLocaleString('fr-FR')} lignes · {columns.length} colonnes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
            onClick={analyse}>
            <ScanLine className="h-3.5 w-3.5 mr-1" /> Scanner
          </Button>
          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-500 text-white"
            onClick={() => onSave(rows)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Sauvegarder
          </Button>
          <div className="relative group">
            <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10">
              <Download className="h-3.5 w-3.5 mr-1" /> Export ▾
            </Button>
            <div className="absolute top-full right-0 mt-1 w-52 bg-[#1a1d2e] border border-white/20 rounded-xl shadow-xl z-20 hidden group-hover:block">
              <button onClick={() => exportFile('xlsx')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white rounded-t-xl">Excel (.xlsx)</button>
              <button onClick={() => exportFile('csv_fr')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white rounded-b-xl">CSV FR (; + virgule)</button>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostic */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-3 ${nbProblems > 0 ? 'bg-amber-500/10 border-b border-amber-500/20' : hasAnalysed ? 'bg-green-500/10 border-b border-green-500/20' : 'bg-white/5 border-b border-white/10'}`}>
          <div className="flex items-center gap-2">
            {nbProblems > 0 ? <AlertTriangle className="h-5 w-5 text-amber-400" /> : hasAnalysed ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <ScanLine className="h-5 w-5 text-slate-400" />}
            <span className={`font-semibold text-sm ${nbProblems > 0 ? 'text-amber-300' : hasAnalysed ? 'text-green-300' : 'text-white'}`}>
              {!hasAnalysed ? 'Prêt à scanner' : nbProblems > 0 ? `${nbProblems} problème(s) détecté(s)` : 'Aucun problème détecté'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-slate-500 text-xs">Clé</Label>
            <select value={keyCol} onChange={e => setKeyCol(e.target.value)}
              className="h-8 bg-white/5 border border-white/20 text-white text-xs rounded-md px-2">
              <option value="">—</option>
              {columns.map(c => <option key={c} value={c} className="bg-[#1a1d2e]">{c}</option>)}
            </select>
          </div>
        </div>

        {nbProblems > 0 && (
          <div className="divide-y divide-white/5">
            {activeIssues.find(i => i.id === 'missing') && (() => {
              const iss = activeIssues.find(i => i.id === 'missing')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Eraser className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('missing')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <span className="text-slate-500 text-xs">Remplir :</span>
                    {(['empty', 'zero', 'mean', 'forward'] as FillMethod[]).map(m => (
                      <Button key={m} size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                        onClick={() => doFillMissing(m)}>
                        {m === 'empty' ? 'Ne rien faire' : m === 'zero' ? '→ 0' : m === 'mean' ? '→ Moyenne' : '→ Reporter précédent'}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {activeIssues.find(i => i.id === 'duplicates_exact') && (() => {
              const iss = activeIssues.find(i => i.id === 'duplicates_exact')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Trash2 className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{iss.count}</Badge>
                      </div>
                    </div>
                    <button onClick={() => ignoreIssue('duplicates_exact')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30"
                      onClick={doRemoveExactDuplicates}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer les doublons exacts
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('duplicates_exact')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {activeIssues.find(i => i.id === 'duplicates_key') && (() => {
              const iss = activeIssues.find(i => i.id === 'duplicates_key')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Trash2 className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{iss.count}</Badge>
                      </div>
                      <p className="text-slate-500 text-xs ml-6">Choisir une colonne “Clé” en haut pour activer ce contrôle.</p>
                    </div>
                    <button onClick={() => ignoreIssue('duplicates_key')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={() => doRemoveKeyDuplicates('first')}>
                      Conserver 1ère occurrence
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30"
                      onClick={() => doRemoveKeyDuplicates('last')}>
                      Conserver dernière occurrence
                    </Button>
                  </div>
                </div>
              );
            })()}

            {activeIssues.find(i => i.id === 'negatives') && (() => {
              const iss = activeIssues.find(i => i.id === 'negatives')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">{iss.count}</Badge>
                      </div>
                    </div>
                    <button onClick={() => ignoreIssue('negatives')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={doFixNegatives}>
                      Mettre à zéro
                    </Button>
                  </div>
                </div>
              );
            })()}

            {activeIssues.find(i => i.id === 'outliers') && (() => {
              const iss = activeIssues.find(i => i.id === 'outliers')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Wand2 className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-orange-500/20 text-orange-300 border-0 text-[10px]">{iss.count}</Badge>
                      </div>
                    </div>
                    <button onClick={() => ignoreIssue('outliers')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30"
                      onClick={doDeleteOutliers}>
                      Supprimer les lignes aberrantes
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-xl border border-white/10 p-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Rechercher…"
            className="pl-8 bg-white/5 border-white/20 text-white text-sm h-8" />
        </div>

        <Button size="sm" variant={showFilters ? 'default' : 'outline'}
          className={`h-8 border-white/20 ${showFilters ? 'bg-blue-600 text-white' : 'text-white hover:bg-white/10'}`}
          onClick={() => setShowFilters(v => !v)}>
          <Filter className="h-3.5 w-3.5 mr-1" /> Filtres
        </Button>

        <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowColPicker(v => !v)}>
          <Columns className="h-3.5 w-3.5 mr-1" /> Colonnes
        </Button>

        <div className="flex items-center gap-1.5">
          <Switch checked={highlightOutliers} onCheckedChange={setHighlightOutliers} className="data-[state=checked]:bg-orange-500 h-4 w-7" />
          <Label className="text-slate-400 text-xs cursor-pointer whitespace-nowrap">Aberrantes</Label>
        </div>

        <div className="w-px h-6 bg-white/10" />

        <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowFR(v => !v)}>
          <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer
        </Button>

        <Button size="sm" variant={showTransformer ? 'default' : 'outline'}
          className={`h-8 border-white/20 ${showTransformer ? 'bg-violet-600 text-white' : 'text-white hover:bg-white/10'}`}
          onClick={() => setShowTransformer(v => !v)}>
          <Wand2 className="h-3.5 w-3.5 mr-1" /> Transformer
        </Button>

        <Button size="sm" variant="ghost" className="h-8 text-slate-400 hover:text-white hover:bg-white/10"
          disabled={undoStack.length === 0} onClick={doUndo}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Annuler
          {undoStack.length > 0 && <Badge className="ml-1 h-4 text-[10px] bg-white/10 border-0 px-1">{undoStack.length}</Badge>}
        </Button>
      </div>

      {showColPicker && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-medium">Colonnes visibles</p>
            <div className="flex gap-2">
              <button onClick={() => setSelectedCols(new Set(columns))} className="text-xs text-blue-400 hover:text-blue-300">Tout afficher</button>
              <button onClick={() => setSelectedCols(new Set())} className="text-xs text-slate-400 hover:text-slate-300">Par défaut</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {columns.map(col => (
              <label key={col} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={visibleCols.has(col)} onChange={e => setSelectedCols(prev => {
                  const next = new Set(prev.size === 0 ? Array.from(defaultVisibleCols) : Array.from(prev));
                  e.target.checked ? next.add(col) : next.delete(col);
                  return next;
                })} className="accent-blue-500" />
                <span className="text-slate-300 truncate" title={col}>{col}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showFR && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Rechercher</Label>
            <Input value={frFind} onChange={e => setFrFind(e.target.value)} className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Remplacer par</Label>
            <Input value={frReplace} onChange={e => setFrReplace(e.target.value)} className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="min-w-44">
            <Label className="text-slate-400 text-xs mb-1 block">Colonne</Label>
            <select value={frCol} onChange={e => setFrCol(e.target.value)} className="w-full h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
              <option value="all">Toutes</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={frCase} onChange={e => setFrCase(e.target.checked)} className="accent-blue-500" />
            <Label className="text-slate-400 text-xs cursor-pointer">Casse exacte</Label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white h-8" onClick={doFindReplace} disabled={!frFind}>
              <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer tout
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-8" onClick={() => setShowFR(false)}>
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {showTransformer && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-slate-400 text-xs mb-1 block">Colonne</Label>
              <select value={trCol} onChange={e => setTrCol(e.target.value)} className="h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2 min-w-[180px]">
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-slate-600 text-[11px] mt-1">Type détecté: {trColType}</p>
            </div>
            <div>
              <Label className="text-slate-400 text-xs mb-1 block">Opération</Label>
              <select value={trOp} onChange={e => setTrOp(e.target.value as typeof trOp)} className="h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2 min-w-[220px]">
                <option value="trim">Trim (supprimer espaces)</option>
                <option value="dot_comma">. → ,</option>
                <option value="comma_dot">, → .</option>
                <option value="to_number">Convertir en nombre</option>
                <option value="to_date">Convertir en date</option>
              </select>
            </div>
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-500 text-white ml-auto" onClick={doTransform} disabled={!trCol}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> Appliquer
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: '62vh' }}>
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#131520' }}>
              <tr>
                <th className="w-10 px-2 py-2 text-slate-600 border-b border-r border-white/10 bg-white/5 text-right font-normal select-none">#</th>
                {columns.filter(c => visibleCols.has(c)).map(col => (
                  <th key={col} className="px-3 py-2 text-left border-b border-r border-white/10 bg-white/5 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">{col}</span>
                    <span className="text-slate-600 ml-2 text-[10px]">{colTypes[col]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => {
                const idx = safePage * PAGE_SIZE + i;
                return (
                  <tr key={idx} className={`border-t border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.015]'} hover:bg-white/5`}>
                    <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 font-mono text-[10px] select-none">{idx + 1}</td>
                    {columns.filter(c => visibleCols.has(c)).map(col => {
                      const v = row[col];
                      const isOutlier = highlightOutliers && colTypes[col] === 'num' && (() => {
                        const n = toNum(v);
                        const th = outlierMap[col];
                        return n !== null && th && th !== 0 && n > th;
                      })();
                      const disp = v instanceof Date ? v.toLocaleString('fr-FR') : safeString(v);
                      return (
                        <td key={col} className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[240px] truncate ${colTypes[col] === 'num' ? 'text-right font-mono text-emerald-300/80' : colTypes[col] === 'date' ? 'text-blue-300/80' : 'text-slate-400'} ${isOutlier ? '!text-orange-400 font-bold' : ''}`}
                          title={disp.length > 30 ? disp : undefined}>
                          {disp}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={columns.filter(c => visibleCols.has(c)).length + 1} className="px-4 py-12 text-center text-slate-500">
                    Aucune ligne ne correspond
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/[0.02]">
          <span className="text-slate-500 text-xs">
            {filteredRows.length === 0 ? 'Aucune ligne' : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filteredRows.length)} sur ${filteredRows.length.toLocaleString('fr-FR')}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">Page {safePage + 1}/{totalPages}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

