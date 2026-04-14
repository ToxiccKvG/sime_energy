// ============================================================
// IOT MODULE — Onglet Nettoyage de données
// Toutes les opérations de data-cleaning type Excel
// ============================================================

import { useMemo, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Trash2, Download, RotateCcw, Search, Filter, Eye, EyeOff,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle,
  CheckSquare, Square, Copy, RefreshCw, Replace,
  ChevronLeft, ChevronRight, Columns, Eraser,
  FileSpreadsheet, Hash, Calendar, Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import type { ShellyRow } from './shared';
import { parseShellyRow } from '@/lib/iot-profil-engine';

// ---- Définition des colonnes ----

type ColType = 'date' | 'num' | 'text';

interface ColDef {
  key: keyof ShellyRow;
  label: string;
  type: ColType;
  editable: boolean;
  defaultVisible: boolean;
  width?: number;
}

const COLUMNS: ColDef[] = [
  { key: 'date',                label: 'Date',          type: 'date',  editable: true,  defaultVisible: true,  width: 100 },
  { key: 'jour',                label: 'Jour',          type: 'text',  editable: false, defaultVisible: true,  width: 80 },
  { key: 'kwhTotal',            label: 'kWh Total',     type: 'num',   editable: true,  defaultVisible: true,  width: 90 },
  { key: 'kwhNet',              label: 'kWh Net',       type: 'num',   editable: true,  defaultVisible: true,  width: 90 },
  { key: 'kwhRetourTotal',      label: 'kWh Retour',    type: 'num',   editable: true,  defaultVisible: true,  width: 90 },
  { key: 'puissKwTotal',        label: 'Puiss. kW',     type: 'num',   editable: true,  defaultVisible: true,  width: 90 },
  { key: 'kwhA',                label: 'Ph A',          type: 'num',   editable: true,  defaultVisible: true,  width: 80 },
  { key: 'kwhB',                label: 'Ph B',          type: 'num',   editable: true,  defaultVisible: true,  width: 80 },
  { key: 'kwhC',                label: 'Ph C',          type: 'num',   editable: true,  defaultVisible: true,  width: 80 },
  { key: 'jourActivites',       label: 'Activités',     type: 'text',  editable: true,  defaultVisible: true,  width: 110 },
  { key: 'trancheTarification', label: 'Tranche',       type: 'text',  editable: true,  defaultVisible: true,  width: 130 },
  { key: 'saison',              label: 'Saison',        type: 'text',  editable: true,  defaultVisible: false, width: 90 },
  { key: 'periodeclimatique',   label: 'Pér. clim.',    type: 'text',  editable: false, defaultVisible: false, width: 130 },
  { key: 'periode',             label: 'Pér. jour',     type: 'text',  editable: false, defaultVisible: false, width: 100 },
  { key: 'montantEnergie',      label: 'Montant FCFA',  type: 'num',   editable: false, defaultVisible: true,  width: 110 },
  { key: 'kwhCumTotal',         label: 'kWh Cum.',      type: 'num',   editable: false, defaultVisible: false, width: 90 },
  { key: 'profil',              label: 'Profil',        type: 'text',  editable: true,  defaultVisible: false, width: 90 },
  { key: 'heuresEnsoleillement',label: 'Ensoleil.',     type: 'text',  editable: false, defaultVisible: false, width: 130 },
  { key: 'heuresTravail',       label: 'H. Travail',    type: 'text',  editable: false, defaultVisible: false, width: 130 },
  { key: 'whTotal',             label: 'Wh Total',      type: 'num',   editable: true,  defaultVisible: false, width: 80 },
  { key: 'whRetourTotal',       label: 'Wh Retour',     type: 'num',   editable: true,  defaultVisible: false, width: 90 },
];

// Options pour les champs enum
const ENUM_OPTIONS: Partial<Record<keyof ShellyRow, string[]>> = {
  jourActivites:       ['Jour ouvré', 'Weekend', 'Jour férié'],
  trancheTarification: ['Heure creuse', 'Heure de pointe'],
  saison:              ['Sèche', 'Hivernage'],
  periodeclimatique:   ['Période de fraîcheur', 'Période chaude'],
  profil:              ['CHARGE', 'SOUTIRAGE'],
  periode:             ['Nuit', 'Matin', 'Après-midi', 'Soir'],
  heuresEnsoleillement:['En ensoleillement', 'Hors ensoleillement'],
  heuresTravail:       ["Heures d'activités", 'Heures hors activités'],
};

// ---- Types filtres / état ----

interface Filters {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  typeJour: string[]; // valeurs de jourActivites
  tranche: string[];
  kwhMin: string;
  kwhMax: string;
}

interface SortConfig { key: keyof ShellyRow; dir: 'asc' | 'desc' }
interface EditCell { filteredIdx: number; col: keyof ShellyRow }

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '',
  typeJour: [], tranche: [],
  kwhMin: '', kwhMax: '',
};

const PAGE_SIZE = 50;

// ---- Helpers fichiers bruts ----

const FILE_PAGE_SIZE = 50;

function detectColType(col: string, rows: Record<string, unknown>[]): 'date' | 'number' | 'text' {
  const sample = rows.slice(0, 20).map(r => r[col]).filter(v => v != null && v !== '');
  if (sample.length === 0) return 'text';
  if (sample.every(v => typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(v)))) return 'date';
  if (sample.every(v => !isNaN(Number(v)))) return 'number';
  return 'text';
}

const COL_TYPE_ICON = {
  date:   <Calendar className="h-3 w-3 text-blue-400" />,
  number: <Hash className="h-3 w-3 text-green-400" />,
  text:   <Type className="h-3 w-3 text-slate-400" />,
};
const COL_TYPE_COLOR = {
  date: 'text-blue-300', number: 'text-green-300', text: 'text-slate-300',
};

// ---- Helpers ----

function formatCell(row: ShellyRow, col: keyof ShellyRow): string {
  const v = row[col];
  if (v instanceof Date) return v.toLocaleDateString('fr-FR');
  if (typeof v === 'number') return isNaN(v) ? '' : v.toFixed(col === 'montantEnergie' ? 0 : 3);
  return String(v ?? '');
}

function rawValue(row: ShellyRow, col: keyof ShellyRow): string {
  const v = row[col];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  return String(v ?? '');
}

function computeStats(values: number[]): { mean: number; std: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return { mean, std, min: Math.min(...values), max: Math.max(...values) };
}

// ---- Composant principal ----

export function NettoyageTab() {
  const { state, setShellyRows } = useIOT();
  const { shellyRows } = state;

  // ---- Mode fichier local ----
  const [localRows, setLocalRows] = useState<ShellyRow[]>([]);
  const [localFileName, setLocalFileName] = useState<string | null>(null);

  // Source active pour toutes les opérations
  const activeRows: ShellyRow[] = localRows.length > 0 ? localRows : shellyRows;
  const setActiveRows = (rows: ShellyRow[] | ((prev: ShellyRow[]) => ShellyRow[])) => {
    if (localRows.length > 0) {
      setLocalRows(rows as ShellyRow[]);
    } else {
      setShellyRows(rows as ShellyRow[]);
    }
  };

  // ---- État local ----
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set()); // indices dans sorted
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key as string))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [page, setPage] = useState(0);
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editVal, setEditVal] = useState('');
  const [undoStack, setUndoStack] = useState<ShellyRow[][]>([]);
  const [highlightOutliers, setHighlightOutliers] = useState(false);
  // Trouver & Remplacer
  const [showFR, setShowFR] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frCol, setFrCol] = useState<string>('all');
  const [frCase, setFrCase] = useState(false);
  // Trous
  const [showGaps, setShowGaps] = useState(false);

  const editInputRef = useRef<HTMLInputElement>(null);

  // ---- Fichiers importés viewer ----
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [expandedFilePage, setExpandedFilePage] = useState<Record<string, number>>({});

  // ---- Charger un fichier importé pour nettoyage ----
  const loadFromImported = useCallback((f: import('./shared').ImportedFile) => {
    // 1. Tente de re-parser le rawData
    let rows: ShellyRow[] | null = null;
    if (f.rawData.length > 0) {
      const parsed = f.rawData
        .map(r => parseShellyRow(r, state.joursFerier, state.paramsTarif))
        .filter((r): r is ShellyRow => r !== null);
      if (parsed.length > 0) rows = parsed;
    }
    // 2. Fallback : utilise shellyRows déjà parsés (même données, déjà en mémoire)
    if (!rows || rows.length === 0) rows = [...shellyRows];
    // 3. Dernier recours : tableau vide (ne bloque pas l'UI)
    if (rows.length === 0) rows = [];

    setLocalRows(rows);
    setLocalFileName(f.name);
    setUndoStack([]);
    setSelectedIndices(new Set());
    setPage(0);
    setSearch('');
    setFilters(EMPTY_FILTERS);
  }, [shellyRows, state.joursFerier, state.paramsTarif]);

  // ---- Données dérivées ----

  const kwhStats = useMemo(() => computeStats(activeRows.map(r => r.kwhNet)), [activeRows]);
  const outlierThreshold = kwhStats.mean + 2.5 * kwhStats.std;

  const filtered = useMemo(() => {
    let rows = activeRows;

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        COLUMNS.some(c => {
          const v = formatCell(r, c.key).toLowerCase();
          return v.includes(q);
        })
      );
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      rows = rows.filter(r => r.date >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59);
      rows = rows.filter(r => r.date <= to);
    }
    if (filters.typeJour.length > 0) {
      rows = rows.filter(r => filters.typeJour.includes(r.jourActivites));
    }
    if (filters.tranche.length > 0) {
      rows = rows.filter(r => filters.tranche.includes(r.trancheTarification));
    }
    if (filters.kwhMin !== '') {
      const min = parseFloat(filters.kwhMin);
      rows = rows.filter(r => r.kwhNet >= min);
    }
    if (filters.kwhMax !== '') {
      const max = parseFloat(filters.kwhMax);
      rows = rows.filter(r => r.kwhNet <= max);
    }
    return rows;
  }, [activeRows, search, filters]);

  const sorted = useMemo(() => {
    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortConfig.key];
      const vb = b[sortConfig.key];
      let cmp = 0;
      if (va instanceof Date && vb instanceof Date) cmp = va.getTime() - vb.getTime();
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const selRows = [...selectedIndices].map(i => sorted[i]).filter(Boolean);
    return {
      total: activeRows.length,
      filtered: sorted.length,
      selected: selectedIndices.size,
      sumKwh: selRows.reduce((s, r) => s + r.kwhNet, 0),
      meanKwh: selRows.length ? selRows.reduce((s, r) => s + r.kwhNet, 0) / selRows.length : 0,
    };
  }, [activeRows.length, sorted, selectedIndices]);

  const gaps = useMemo(() => {
    if (activeRows.length < 2) return [];
    const sorted2 = [...activeRows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const missing: Date[] = [];
    for (let i = 1; i < sorted2.length; i++) {
      const prev = sorted2[i - 1].date;
      const curr = sorted2[i].date;
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays > 1) {
        for (let d = 1; d < diffDays; d++) {
          const m = new Date(prev);
          m.setDate(m.getDate() + d);
          missing.push(m);
        }
      }
    }
    return missing;
  }, [activeRows]);

  // ---- Undo ----
  const pushUndo = useCallback((rows: ShellyRow[]) => {
    setUndoStack(s => [...s.slice(-9), rows]);
  }, []);

  const doUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setActiveRows(prev);
    setSelectedIndices(new Set());
  }, [undoStack, setShellyRows]);

  // ---- Tri ----
  const doSort = useCallback((key: keyof ShellyRow) => {
    setSortConfig(s =>
      s?.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
    setPage(0);
    setSelectedIndices(new Set());
  }, []);

  // ---- Sélection ----
  const doSelectRow = useCallback((sortedIdx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(sortedIdx)) next.delete(sortedIdx);
      else next.add(sortedIdx);
      return next;
    });
  }, []);

  const doSelectAll = useCallback(() => {
    if (selectedIndices.size === sorted.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(sorted.map((_, i) => i)));
    }
  }, [selectedIndices.size, sorted]);

  // ---- Supprimer sélection ----
  const doDeleteSelected = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const toDelete = new Set([...selectedIndices].map(i => sorted[i]));
    pushUndo(activeRows);
    setActiveRows(activeRows.filter(r => !toDelete.has(r)));
    setSelectedIndices(new Set());
  }, [selectedIndices, sorted, activeRows, pushUndo]);

  // ---- Supprimer les doublons (par date) ----
  const doRemoveDuplicates = useCallback(() => {
    const seen = new Set<string>();
    const unique: ShellyRow[] = [];
    const dupes: ShellyRow[] = [];
    for (const r of activeRows) {
      const key = r.date.toISOString().slice(0, 10);
      if (seen.has(key)) { dupes.push(r); } else { seen.add(key); unique.push(r); }
    }
    if (dupes.length === 0) return;
    pushUndo(activeRows);
    setActiveRows(unique);
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo]);

  // ---- Remplir les valeurs nulles/zéro ----
  const doFillMissing = useCallback((method: 'zero' | 'mean' | 'forward') => {
    const numCols: (keyof ShellyRow)[] = ['kwhTotal', 'kwhNet', 'kwhRetourTotal', 'puissKwTotal', 'kwhA', 'kwhB', 'kwhC'];
    const means: Partial<Record<keyof ShellyRow, number>> = {};
    for (const col of numCols) {
      const vals = activeRows.map(r => r[col] as number).filter(v => v > 0);
      means[col] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    pushUndo(activeRows);
    setActiveRows(activeRows.map((r, i) => {
      const updated = { ...r };
      for (const col of numCols) {
        const v = r[col] as number;
        if (v === 0 || isNaN(v)) {
          if (method === 'zero') (updated as Record<string, unknown>)[col] = 0;
          else if (method === 'mean') (updated as Record<string, unknown>)[col] = means[col] ?? 0;
          else if (method === 'forward' && i > 0) {
            (updated as Record<string, unknown>)[col] = activeRows[i - 1][col];
          }
        }
      }
      return updated;
    }));
  }, [activeRows, pushUndo]);

  // ---- Trouver & Remplacer ----
  const frMatchCount = useMemo(() => {
    if (!frFind) return 0;
    const q = frCase ? frFind : frFind.toLowerCase();
    return activeRows.reduce((cnt, row) => {
      const cols = frCol === 'all' ? COLUMNS.map(c => c.key) : [frCol as keyof ShellyRow];
      return cnt + cols.filter(c => {
        const v = frCase ? formatCell(row, c) : formatCell(row, c).toLowerCase();
        return v.includes(q);
      }).length;
    }, 0);
  }, [frFind, frCase, frCol, activeRows]);

  const doFindReplace = useCallback(() => {
    if (!frFind) return;
    const cols = frCol === 'all'
      ? COLUMNS.filter(c => c.editable).map(c => c.key)
      : [frCol as keyof ShellyRow];
    pushUndo(activeRows);
    setActiveRows(activeRows.map(row => {
      const updated = { ...row };
      for (const col of cols) {
        const v = formatCell(row, col);
        const found = frCase ? v.includes(frFind) : v.toLowerCase().includes(frFind.toLowerCase());
        if (found) {
          const newVal = frCase
            ? v.split(frFind).join(frReplace)
            : v.replace(new RegExp(frFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), frReplace);
          const colDef = COLUMNS.find(c => c.key === col);
          if (colDef?.type === 'num') {
            const n = parseFloat(newVal);
            if (!isNaN(n)) (updated as Record<string, unknown>)[col] = n;
          } else {
            (updated as Record<string, unknown>)[col] = newVal;
          }
        }
      }
      return updated;
    }));
  }, [frFind, frReplace, frCol, frCase, activeRows, pushUndo]);

  // ---- Édition cellule ----
  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const targetRow = sorted[editCell.filteredIdx];
    if (!targetRow) { setEditCell(null); return; }
    const colDef = COLUMNS.find(c => c.key === editCell.col);
    if (!colDef) { setEditCell(null); return; }

    let newVal: unknown = editVal;
    if (colDef.type === 'num') {
      newVal = parseFloat(editVal);
      if (isNaN(newVal as number)) { setEditCell(null); return; }
    } else if (colDef.type === 'date') {
      const d = new Date(editVal);
      if (isNaN(d.getTime())) { setEditCell(null); return; }
      newVal = d;
    }

    pushUndo(activeRows);
    setActiveRows(activeRows.map(r =>
      r === targetRow ? { ...r, [editCell.col]: newVal } : r
    ));
    setEditCell(null);
  }, [editCell, editVal, sorted, activeRows, pushUndo]);

  // ---- Export ----
  const doExport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sorted.map(r => {
      const obj: Record<string, unknown> = {};
      COLUMNS.forEach(c => {
        obj[c.label] = c.type === 'date' && r[c.key] instanceof Date
          ? (r[c.key] as Date).toLocaleDateString('fr-FR')
          : r[c.key];
      });
      return obj;
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Données nettoyées');
    XLSX.writeFile(wb, 'iot_donnees_nettoyees.xlsx');
  }, [sorted]);

  // ---- Panneau fichiers importés (réutilisé dans vide + non-vide) ----
  const fichiersPannel = state.files.length > 0 && (
    <div className="space-y-2">
      <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-blue-400" />
        Fichiers importés ({state.files.length})
      </h3>
      {state.files.map(f => {
        const isExp = expandedFileId === f.id;
        const pg = expandedFilePage[f.id] ?? 0;
        const totalPg = Math.ceil(f.rawData.length / FILE_PAGE_SIZE);
        const pageRows = f.rawData.slice(pg * FILE_PAGE_SIZE, (pg + 1) * FILE_PAGE_SIZE);
        const linkedSource = f.sourceId ? state.sources.find(s => s.id === f.sourceId) : null;
        return (
          <div key={f.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <FileSpreadsheet className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{f.name}</p>
                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs border-white/20 text-slate-300 h-5">
                    {f.type === 'shelly' ? 'Shelly 3EM' : f.type === 'facturation' ? 'Facturation' : 'Autre'}
                  </Badge>
                  {linkedSource && (
                    <span className="text-xs" style={{ color: linkedSource.couleur }}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: linkedSource.couleur }} />
                      {linkedSource.nom}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">{f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} col.</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {f.type === 'shelly' && (
                  <Button
                    size="sm"
                    className={`h-7 text-xs gap-1 ${
                      localFileName === f.name
                        ? 'bg-green-600/30 text-green-300 border border-green-500/30'
                        : 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30'
                    }`}
                    onClick={() => {
                      if (localFileName === f.name) {
                        setLocalRows([]); setLocalFileName(null);
                      } else {
                        loadFromImported(f);
                      }
                    }}
                  >
                    {localFileName === f.name ? 'Décharger' : 'Nettoyer'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 gap-1.5 text-xs ${isExp ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  onClick={() => {
                    setExpandedFileId(isExp ? null : f.id);
                    setExpandedFilePage(prev => ({ ...prev, [f.id]: 0 }));
                  }}
                >
                  {isExp ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isExp ? 'Masquer' : 'Voir'}
                </Button>
              </div>
            </div>

            {isExp && f.rawData.length > 0 && (
              <>
                <div className="overflow-auto border-t border-white/10" style={{ maxHeight: '45vh' }}>
                  <table className="min-w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1d2e' }}>
                      <tr>
                        <th className="w-10 px-2 py-1.5 text-slate-600 text-right border-b border-r border-white/10 font-normal select-none bg-white/5">#</th>
                        {f.columns.map(col => {
                          const ct = detectColType(col, f.rawData);
                          return (
                            <th key={col} className="px-3 py-1.5 text-left border-b border-r border-white/10 whitespace-nowrap font-medium bg-white/5">
                              <div className="flex items-center gap-1">{COL_TYPE_ICON[ct]}<span className={COL_TYPE_COLOR[ct]}>{col}</span></div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, ri) => (
                        <tr key={ri} className={`hover:bg-blue-500/5 ${ri % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                          <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none font-mono text-[10px]">
                            {pg * FILE_PAGE_SIZE + ri + 1}
                          </td>
                          {f.columns.map(col => {
                            const val = String(row[col] ?? '');
                            const ct = detectColType(col, f.rawData);
                            return (
                              <td
                                key={col}
                                className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[200px] truncate
                                  ${ct === 'number' ? 'text-right font-mono text-emerald-300/80' : ct === 'date' ? 'text-blue-300/80' : 'text-slate-400'}`}
                                title={val.length > 30 ? val : undefined}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/3">
                  <span className="text-slate-500 text-xs">
                    {pg * FILE_PAGE_SIZE + 1}–{Math.min((pg + 1) * FILE_PAGE_SIZE, f.rawData.length)} / {f.rowCount.toLocaleString('fr-FR')} lignes
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">Page {pg + 1}/{Math.max(totalPg, 1)}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                      disabled={pg === 0}
                      onClick={() => setExpandedFilePage(prev => ({ ...prev, [f.id]: pg - 1 }))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                      disabled={pg >= totalPg - 1}
                      onClick={() => setExpandedFilePage(prev => ({ ...prev, [f.id]: pg + 1 }))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  // ---- Vide ----
  if (activeRows.length === 0) {
    return (
      <div className="space-y-6">
        {fichiersPannel || (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <Eraser className="h-16 w-16 opacity-20 mb-4" />
            <p className="text-lg font-medium">Aucune donnée à nettoyer</p>
            <p className="text-sm mt-1">Importez d'abord un fichier Shelly dans l'onglet <strong className="text-slate-400">Upload</strong></p>
          </div>
        )}
      </div>
    );
  }

  const allPageSelected = paged.length > 0 && paged.every((_, i) => selectedIndices.has(safePage * PAGE_SIZE + i));

  return (
    <div className="space-y-4">

      {/* ---- Fichiers importés ---- */}
      {fichiersPannel}

      {/* ---- Bannière mode fichier local ---- */}
      {localFileName && (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-green-300 text-sm font-medium">Nettoyage : {localFileName}</span>
            <Badge className="bg-green-600/20 text-green-300 border-0 text-xs">{localRows.length.toLocaleString('fr-FR')} lignes</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
              onClick={() => { setShellyRows(localRows); setLocalRows([]); setLocalFileName(null); }}
            >
              Sauvegarder dans le contexte
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-slate-400 hover:text-white"
              onClick={() => { setLocalRows([]); setLocalFileName(null); }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ---- Barre de stats ---- */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2">
          <span className="text-slate-400">Total </span>
          <span className="text-white font-bold">{stats.total.toLocaleString('fr-FR')}</span>
          <span className="text-slate-500"> lignes</span>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2">
          <span className="text-slate-400">Filtrées </span>
          <span className="text-blue-400 font-bold">{stats.filtered.toLocaleString('fr-FR')}</span>
        </div>
        {stats.selected > 0 && (
          <>
            <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 px-3 py-2">
              <span className="text-slate-400">Sélectionnées </span>
              <span className="text-blue-400 font-bold">{stats.selected}</span>
            </div>
            <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2">
              <span className="text-slate-400">Σ kWh Net </span>
              <span className="text-cyan-400 font-bold">{stats.sumKwh.toFixed(1)}</span>
              <span className="text-slate-500"> · Moy. </span>
              <span className="text-cyan-300">{stats.meanKwh.toFixed(1)}</span>
            </div>
          </>
        )}
        {gaps.length > 0 && (
          <button
            onClick={() => setShowGaps(v => !v)}
            className="bg-yellow-500/10 rounded-lg border border-yellow-500/30 px-3 py-2 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            {gaps.length} trou{gaps.length > 1 ? 'x' : ''} dans la série
          </button>
        )}
      </div>

      {/* ---- Trous dans la série ---- */}
      {showGaps && gaps.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
          <h4 className="text-yellow-400 font-medium text-sm mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Dates manquantes dans la série temporelle
          </h4>
          <div className="flex flex-wrap gap-2">
            {gaps.slice(0, 30).map((d, i) => (
              <Badge key={i} className="bg-yellow-500/10 text-yellow-300 border-yellow-500/20 border text-xs">
                {d.toLocaleDateString('fr-FR')}
              </Badge>
            ))}
            {gaps.length > 30 && <Badge className="bg-yellow-500/10 text-yellow-400 border-0">+{gaps.length - 30} autres</Badge>}
          </div>
        </div>
      )}

      {/* ---- Barre d'outils ---- */}
      <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-xl border border-white/10 p-3">
        {/* Recherche */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Rechercher dans toutes les colonnes…"
            className="pl-8 bg-white/5 border-white/20 text-white text-sm h-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={showFilters ? 'default' : 'outline'}
          className={`h-8 border-white/20 ${showFilters ? 'bg-blue-600 text-white' : 'text-white hover:bg-white/10'}`}
          onClick={() => setShowFilters(v => !v)}
        >
          <Filter className="h-3.5 w-3.5 mr-1" /> Filtres
          {(filters.typeJour.length + filters.tranche.length + (filters.dateFrom ? 1 : 0) + (filters.kwhMin || filters.kwhMax ? 1 : 0)) > 0 && (
            <Badge className="ml-1 h-4 min-w-4 text-[10px] bg-white/20 border-0 px-1">
              {filters.typeJour.length + filters.tranche.length + (filters.dateFrom ? 1 : 0) + (filters.kwhMin || filters.kwhMax ? 1 : 0)}
            </Badge>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowColPicker(v => !v)}
        >
          <Columns className="h-3.5 w-3.5 mr-1" /> Colonnes
        </Button>

        <div className="w-px h-6 bg-white/10" />

        {/* Outliers */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="outliers"
            checked={highlightOutliers}
            onCheckedChange={setHighlightOutliers}
            className="data-[state=checked]:bg-orange-500 h-4 w-7"
          />
          <Label htmlFor="outliers" className="text-slate-400 text-xs cursor-pointer whitespace-nowrap">
            Valeurs aberrantes
          </Label>
        </div>

        <div className="w-px h-6 bg-white/10" />

        <Button
          size="sm"
          variant="outline"
          className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowFR(v => !v)}
        >
          <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer
        </Button>

        {/* Menu Nettoyer */}
        <div className="relative group">
          <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Nettoyer ▾
          </Button>
          <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1d2e] border border-white/20 rounded-xl shadow-xl z-20 hidden group-hover:block">
            <button
              onClick={doRemoveDuplicates}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 rounded-t-xl"
            >
              <Copy className="h-4 w-4 text-slate-400" /> Supprimer les doublons
            </button>
            <button
              onClick={() => doFillMissing('zero')}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
            >
              <Square className="h-4 w-4 text-slate-400" /> Remplir valeurs vides → 0
            </button>
            <button
              onClick={() => doFillMissing('mean')}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
            >
              <CheckSquare className="h-4 w-4 text-slate-400" /> Remplir valeurs vides → moyenne
            </button>
            <button
              onClick={() => doFillMissing('forward')}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 rounded-b-xl"
            >
              <ArrowDown className="h-4 w-4 text-slate-400" /> Reporter valeur précédente
            </button>
          </div>
        </div>

        <Button
          size="sm"
          variant="destructive"
          className="h-8 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
          disabled={selectedIndices.size === 0}
          onClick={doDeleteSelected}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer ({selectedIndices.size})
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-slate-400 hover:text-white hover:bg-white/10"
          disabled={undoStack.length === 0}
          onClick={doUndo}
          title={`Annuler (${undoStack.length} action${undoStack.length > 1 ? 's' : ''})`}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Annuler
          {undoStack.length > 0 && <Badge className="ml-1 h-4 text-[10px] bg-white/10 border-0 px-1">{undoStack.length}</Badge>}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 border-white/20 text-white hover:bg-white/10 ml-auto"
          onClick={doExport}
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Export
        </Button>
      </div>

      {/* ---- Panneau Filtres ---- */}
      {showFilters && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date de</Label>
            <Input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(0); }}
              className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date à</Label>
            <Input type="date" value={filters.dateTo} onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(0); }}
              className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">kWh Net min</Label>
            <Input type="number" value={filters.kwhMin} onChange={e => { setFilters(f => ({ ...f, kwhMin: e.target.value })); setPage(0); }}
              placeholder="0" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">kWh Net max</Label>
            <Input type="number" value={filters.kwhMax} onChange={e => { setFilters(f => ({ ...f, kwhMax: e.target.value })); setPage(0); }}
              placeholder="∞" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Type de jour</Label>
            <div className="flex flex-col gap-1">
              {['Jour ouvré', 'Weekend', 'Jour férié'].map(v => (
                <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={filters.typeJour.includes(v)}
                    onChange={e => {
                      setFilters(f => ({ ...f, typeJour: e.target.checked ? [...f.typeJour, v] : f.typeJour.filter(x => x !== v) }));
                      setPage(0);
                    }}
                    className="accent-blue-500" />
                  <span className="text-slate-300">{v}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Tranche</Label>
            <div className="flex flex-col gap-1">
              {['Heure creuse', 'Heure de pointe'].map(v => (
                <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={filters.tranche.includes(v)}
                    onChange={e => {
                      setFilters(f => ({ ...f, tranche: e.target.checked ? [...f.tranche, v] : f.tranche.filter(x => x !== v) }));
                      setPage(0);
                    }}
                    className="accent-blue-500" />
                  <span className="text-slate-300">{v}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex items-end">
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white text-xs"
              onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}>
              Réinitialiser tous les filtres
            </Button>
          </div>
        </div>
      )}

      {/* ---- Sélecteur de colonnes ---- */}
      {showColPicker && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white text-sm font-medium">Colonnes visibles</h4>
            <div className="flex gap-2">
              <button onClick={() => setVisibleCols(new Set(COLUMNS.map(c => c.key as string)))}
                className="text-xs text-blue-400 hover:text-blue-300">Tout afficher</button>
              <button onClick={() => setVisibleCols(new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key as string)))}
                className="text-xs text-slate-400 hover:text-slate-300">Par défaut</button>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {COLUMNS.map(col => (
              <label key={col.key as string} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={visibleCols.has(col.key as string)}
                  onChange={e => setVisibleCols(prev => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(col.key as string); else next.delete(col.key as string);
                    return next;
                  })}
                  className="accent-blue-500" />
                <span className="text-slate-300">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ---- Trouver & Remplacer ---- */}
      {showFR && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Rechercher</Label>
            <Input value={frFind} onChange={e => setFrFind(e.target.value)}
              placeholder="Valeur à trouver…" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Remplacer par</Label>
            <Input value={frReplace} onChange={e => setFrReplace(e.target.value)}
              placeholder="Nouvelle valeur…" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="min-w-44">
            <Label className="text-slate-400 text-xs mb-1 block">Dans la colonne</Label>
            <select
              value={frCol}
              onChange={e => setFrCol(e.target.value)}
              className="w-full h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2"
            >
              <option value="all">Toutes les colonnes</option>
              {COLUMNS.filter(c => c.editable).map(c => (
                <option key={c.key as string} value={c.key as string}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="frCase" checked={frCase} onChange={e => setFrCase(e.target.checked)} className="accent-blue-500" />
            <Label htmlFor="frCase" className="text-slate-400 text-xs cursor-pointer">Respect. casse</Label>
          </div>
          <div className="flex items-center gap-2">
            {frMatchCount > 0 && (
              <span className="text-blue-400 text-xs">{frMatchCount} occurrence{frMatchCount > 1 ? 's' : ''}</span>
            )}
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white h-8" onClick={doFindReplace} disabled={!frFind}>
              <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer tout
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-8" onClick={() => setShowFR(false)}>
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ---- Tableau principal ---- */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#131520' }}>
              <tr>
                {/* Checkbox tout sélectionner */}
                <th className="w-8 px-2 py-2 border-b border-r border-white/10 bg-white/5">
                  <input type="checkbox" checked={allPageSelected} onChange={doSelectAll} className="accent-blue-500 cursor-pointer" />
                </th>
                {/* N° ligne */}
                <th className="w-10 px-2 py-2 text-slate-600 border-b border-r border-white/10 bg-white/5 text-right font-normal select-none">
                  #
                </th>
                {COLUMNS.filter(c => visibleCols.has(c.key as string)).map(col => {
                  const isSort = sortConfig?.key === col.key;
                  return (
                    <th
                      key={col.key as string}
                      onClick={() => doSort(col.key)}
                      className="px-3 py-2 text-left border-b border-r border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors select-none whitespace-nowrap"
                      style={{ minWidth: col.width }}
                    >
                      <div className="flex items-center gap-1">
                        <span className={isSort ? 'text-blue-300 font-semibold' : 'text-slate-300 font-medium'}>
                          {col.label}
                        </span>
                        {isSort
                          ? sortConfig.dir === 'asc'
                            ? <ArrowUp className="h-3 w-3 text-blue-400" />
                            : <ArrowDown className="h-3 w-3 text-blue-400" />
                          : <ArrowUpDown className="h-3 w-3 text-slate-600 opacity-0 group-hover:opacity-100" />
                        }
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, pageIdx) => {
                const sortedIdx = safePage * PAGE_SIZE + pageIdx;
                const isSelected = selectedIndices.has(sortedIdx);
                const isOutlier = highlightOutliers && row.kwhNet > outlierThreshold;

                return (
                  <tr
                    key={sortedIdx}
                    className={`border-t border-white/5 transition-colors ${
                      isSelected ? 'bg-blue-600/15' :
                      isOutlier  ? 'bg-orange-500/10' :
                      pageIdx % 2 === 0 ? '' : 'bg-white/[0.015]'
                    } hover:bg-white/5`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-1 border-r border-white/5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => doSelectRow(sortedIdx)}
                        className="accent-blue-500 cursor-pointer"
                      />
                    </td>
                    {/* N° ligne */}
                    <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 font-mono text-[10px] select-none">
                      {sortedIdx + 1}
                    </td>
                    {COLUMNS.filter(c => visibleCols.has(c.key as string)).map(col => {
                      const isEditing = editCell?.filteredIdx === sortedIdx && editCell?.col === col.key;
                      const isOutlierCell = highlightOutliers && col.key === 'kwhNet' && row.kwhNet > outlierThreshold;
                      const displayVal = formatCell(row, col.key);
                      const enumOpts = ENUM_OPTIONS[col.key];

                      if (isEditing) {
                        return (
                          <td key={col.key as string} className="px-0 py-0 border-r border-blue-400">
                            {enumOpts ? (
                              <select
                                autoFocus
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                className="w-full h-full px-2 py-1 bg-blue-900/50 border-0 text-white text-xs focus:outline-none"
                              >
                                {enumOpts.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                ref={editInputRef}
                                autoFocus
                                type={col.type === 'num' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                className="w-full px-2 py-1 bg-blue-900/50 border-0 text-white text-xs focus:outline-none"
                                style={{ minWidth: col.width }}
                              />
                            )}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key as string}
                          className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[200px] truncate
                            ${col.type === 'num' ? 'text-right font-mono' : ''}
                            ${col.key === 'kwhNet' ? 'text-cyan-300/80' :
                              col.key === 'kwhTotal' ? 'text-blue-300/80' :
                              col.key === 'kwhRetourTotal' ? 'text-purple-300/80' :
                              col.key === 'puissKwTotal' ? 'text-green-300/80' :
                              col.key === 'montantEnergie' ? 'text-yellow-300/80' :
                              col.key === 'date' ? 'text-slate-200' :
                              col.type === 'num' ? 'text-slate-300/70' : 'text-slate-400'}
                            ${isOutlierCell ? '!text-orange-400 font-bold' : ''}
                            ${col.editable ? 'cursor-pointer hover:bg-white/5' : ''}`}
                          onDoubleClick={() => {
                            if (!col.editable) return;
                            setEditCell({ filteredIdx: sortedIdx, col: col.key });
                            setEditVal(rawValue(row, col.key));
                          }}
                          title={col.editable ? 'Double-clic pour modifier' : undefined}
                        >
                          {col.key === 'jourActivites' ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              row.jourActivites === 'Jour férié' ? 'bg-purple-500/20 text-purple-300' :
                              row.jourActivites === 'Weekend'    ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-blue-500/15 text-blue-300'
                            }`}>
                              {displayVal}
                            </span>
                          ) : col.key === 'trancheTarification' ? (
                            <span className={`text-[10px] ${row.trancheTarification === 'Heure de pointe' ? 'text-orange-400' : 'text-slate-400'}`}>
                              {displayVal}
                            </span>
                          ) : col.key === 'profil' ? (
                            <Badge className={`border-0 text-[10px] py-0 ${row.profil === 'CHARGE' ? 'bg-blue-500/15 text-blue-300' : 'bg-orange-500/15 text-orange-300'}`}>
                              {displayVal}
                            </Badge>
                          ) : displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {paged.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.size + 3} className="px-4 py-12 text-center text-slate-500">
                    Aucune ligne ne correspond aux filtres appliqués
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ---- Pagination ---- */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/[0.02]">
          <span className="text-slate-500 text-xs">
            {sorted.length === 0 ? 'Aucune ligne' :
              `Lignes ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} sur ${sorted.length.toLocaleString('fr-FR')}`}
            {sorted.length < activeRows.length && (
              <span className="text-blue-400/70 ml-1">({activeRows.length.toLocaleString('fr-FR')} au total)</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">Page {safePage + 1}/{totalPages}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              disabled={safePage === 0} onClick={() => setPage(0)}>
              <ChevronLeft className="h-3.5 w-3.5" /><ChevronLeft className="h-3.5 w-3.5 -ml-2" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
              <ChevronRight className="h-3.5 w-3.5" /><ChevronRight className="h-3.5 w-3.5 -ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* ---- Légende ---- */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>Double-clic sur une cellule pour la modifier</span>
        {highlightOutliers && <span className="text-orange-400">● Valeurs aberrantes : kWh Net &gt; {outlierThreshold.toFixed(1)} (moy+2.5σ)</span>}
        <span className="ml-auto">kWh Net σ={kwhStats.std.toFixed(1)} · moy={kwhStats.mean.toFixed(1)} · min={kwhStats.min.toFixed(1)} · max={kwhStats.max.toFixed(1)}</span>
      </div>
    </div>
  );
}
