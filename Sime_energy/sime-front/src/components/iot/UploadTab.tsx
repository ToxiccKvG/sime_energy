import { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Hash, Calendar, Type, Database,
  Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIOT } from './IOTContext';
import type { ImportedFile, ShellyRow } from './shared';
import { parseShellyRow, detecterFormatShelly } from '@/lib/iot-profil-engine';
import { parseFacturationRow } from '@/lib/iot-facturation-engine';
import type { LigneFacturation } from './shared';

type FileType = 'shelly' | 'facturation' | 'autre';

const ROWS_PER_PAGE = 50;

interface SheetData {
  name: string;
  columns: string[];
  preview: Record<string, unknown>[]; // 200 premières lignes pour l'affichage
  rowCount: number;
}

interface FileEntry {
  file: File;
  type: FileType;
  sourceId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  sheets: SheetData[];
  activeSheet: number;
  page: number;
  detected?: string;
}

// ---- Détection du type d'une colonne ----
function detectColType(col: string, rows: Record<string, unknown>[]): 'date' | 'number' | 'text' {
  const sample = rows.slice(0, 20).map(r => r[col]).filter(v => v != null && v !== '');
  if (sample.length === 0) return 'text';
  const isDate = sample.every(v => typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(v)));
  if (isDate) return 'date';
  const isNum = sample.every(v => !isNaN(Number(v)));
  if (isNum) return 'number';
  return 'text';
}

const COL_TYPE_ICON = {
  date:   <Calendar className="h-3 w-3 text-blue-400" />,
  number: <Hash className="h-3 w-3 text-green-400" />,
  text:   <Type className="h-3 w-3 text-slate-400" />,
};
const COL_TYPE_COLOR = {
  date:   'text-blue-300',
  number: 'text-green-300',
  text:   'text-slate-300',
};

export function UploadTab() {
  const { state, addFile, setShellyRows, setFacturationRows, removeFile, setSourceData } = useIOT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPage, setExpandedPage] = useState<Record<string, number>>({});

  // ---- Lecture du fichier : toutes les feuilles ----
  const processFile = useCallback(async (file: File, type: FileType, sourceId: string): Promise<FileEntry> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });

          const sheets: SheetData[] = wb.SheetNames.map(name => {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
              defval: null, raw: false, dateNF: 'YYYY-MM-DD',
            });
            return {
              name,
              columns: rows.length > 0 ? Object.keys(rows[0]) : [],
              preview: rows.slice(0, 200),
              rowCount: rows.length,
            };
          });

          if (sheets.length === 0 || sheets[0].rowCount === 0) {
            resolve({ file, type, sourceId, status: 'error', error: 'Fichier vide ou format non reconnu', sheets: [], activeSheet: 0, page: 0 });
            return;
          }

          // Auto-sélection de la meilleure feuille selon le type
          let activeSheet = 0;
          if (type === 'shelly') {
            const idx = wb.SheetNames.findIndex(n =>
              n.toLowerCase().includes('profil') || n.toLowerCase().includes('données') || n.toLowerCase().includes('data')
            );
            if (idx >= 0) activeSheet = idx;
          } else if (type === 'facturation') {
            const idx = wb.SheetNames.findIndex(n =>
              n.toLowerCase().includes('tab_fact') || n.toLowerCase().includes('facturation') || n.toLowerCase().includes('données')
            );
            if (idx >= 0) activeSheet = idx;
          }

          const cols = sheets[activeSheet]?.columns ?? [];
          const detect = detecterFormatShelly(cols);
          const detected = detect.isShelly
            ? `Shelly 3EM détecté (${detect.hasRetour ? 'avec retour' : 'sans retour'})`
            : type === 'facturation' ? 'Données facturation'
            : `${cols.length} colonnes détectées`;

          resolve({ file, type, sourceId, status: 'done', sheets, activeSheet, page: 0, detected });
        } catch (err) {
          resolve({ file, type, sourceId, status: 'error', error: String(err), sheets: [], activeSheet: 0, page: 0 });
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    const defaultSourceId = state.sources[0]?.id ?? '';
    const newEntries: FileEntry[] = Array.from(files).map(f => ({
      file: f,
      type: (f.name.toLowerCase().includes('fact') ? 'facturation' : 'shelly') as FileType,
      sourceId: defaultSourceId,
      status: 'pending' as const,
      sheets: [],
      activeSheet: 0,
      page: 0,
    }));
    setEntries(prev => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      setEntries(prev => prev.map(e => e.file === entry.file ? { ...e, status: 'processing' } : e));
      const processed = await processFile(entry.file, entry.type, entry.sourceId);
      setEntries(prev => prev.map(e => e.file === entry.file ? { ...processed, sourceId: entry.sourceId } : e));
    }
  }, [processFile, state.sources]);

  // ---- Import : relit le fichier complet avec la feuille sélectionnée ----
  const handleImport = useCallback((entry: FileEntry) => {
    const selectedSheet = entry.sheets[entry.activeSheet];
    if (!selectedSheet) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[selectedSheet.name];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: null, raw: false, dateNF: 'YYYY-MM-DD',
      });

      const id = `${Date.now()}-${entry.file.name}`;
      const importedFile: ImportedFile = {
        id,
        name: entry.file.name,
        type: entry.type,
        sourceId: entry.sourceId || undefined,
        uploadedAt: new Date(),
        rowCount: rows.length,
        columns: selectedSheet.columns,
        preview: rows.slice(0, 10),
        rawData: rows,
      };
      addFile(importedFile);

      if (entry.type === 'shelly') {
        const shellyRows: ShellyRow[] = rows
          .map(r => parseShellyRow(r, state.joursFerier, state.paramsTarif))
          .filter((r): r is ShellyRow => r !== null);
        setShellyRows([...state.shellyRows, ...shellyRows]);
        if (entry.sourceId) {
          let cumKwh = 0;
          setSourceData(entry.sourceId, shellyRows.map(r => {
            cumKwh += r.kwhNet ?? 0;
            return {
              timestamp: r.date,
              sourceId: entry.sourceId!,
              puissanceKw: r.puissKwTotal ?? 0,
              energieKwh: r.kwhNet ?? 0,
              energieCumKwh: cumKwh,
            };
          }));
        }
      } else if (entry.type === 'facturation') {
        const factRows = rows.map((r, i) => ({
          id: `${id}-${i}`,
          ...parseFacturationRow(r),
        })) as LigneFacturation[];
        setFacturationRows([...state.facturationRows, ...factRows]);
      }

      setEntries(prev => prev.filter(e => e.file !== entry.file));
    };
    reader.readAsArrayBuffer(entry.file);
  }, [addFile, setShellyRows, setFacturationRows, setSourceData, state]);

  const patchEntry = useCallback((file: File, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.file === file ? { ...e, ...patch } : e));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-6">
      {/* Zone de dépôt */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
          ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
        <p className="text-white font-medium text-lg">Glisser-déposer ou cliquer pour importer</p>
        <p className="text-slate-400 text-sm mt-1">CSV, XLSX, XLS — Shelly 3EM, Facturation SENELEC</p>
      </div>

      {/* Fichiers en cours de traitement */}
      {entries.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-white font-semibold">Fichiers à configurer</h3>
          {entries.map((entry, idx) => {
            const activeSheetData = entry.sheets[entry.activeSheet];
            const totalPages = activeSheetData ? Math.ceil(activeSheetData.preview.length / ROWS_PER_PAGE) : 0;
            const pageRows = activeSheetData
              ? activeSheetData.preview.slice(entry.page * ROWS_PER_PAGE, (entry.page + 1) * ROWS_PER_PAGE)
              : [];

            return (
              <div key={idx} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                {/* En-tête fichier */}
                <div className="flex items-center gap-3 p-4 border-b border-white/10">
                  <FileSpreadsheet className="h-5 w-5 text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{entry.file.name}</p>
                    <p className="text-slate-400 text-xs">
                      {(entry.file.size / 1024).toFixed(1)} KB
                      {activeSheetData && ` · ${activeSheetData.rowCount.toLocaleString('fr-FR')} lignes · ${activeSheetData.columns.length} colonnes`}
                      {entry.detected && ` · ${entry.detected}`}
                    </p>
                  </div>
                  {entry.status === 'processing' && (
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {entry.status === 'done' && <CheckCircle className="h-5 w-5 text-green-400" />}
                  {entry.status === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => setEntries(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {entry.status === 'error' && (
                  <p className="px-4 py-3 text-red-400 text-sm">{entry.error}</p>
                )}

                {entry.status === 'done' && activeSheetData && (
                  <>
                    {/* Barre de configuration */}
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/10">
                      <Select
                        value={entry.type}
                        onValueChange={(val) => patchEntry(entry.file, { type: val as FileType })}
                      >
                        <SelectTrigger className="w-52 bg-white/5 border-white/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          <SelectItem value="shelly">Shelly 3EM — Profil de charge</SelectItem>
                          <SelectItem value="facturation">Facturation SENELEC</SelectItem>
                          <SelectItem value="autre">Autre / Générique</SelectItem>
                        </SelectContent>
                      </Select>

                      {entry.type !== 'facturation' && state.sources.length > 0 && (
                        <Select
                          value={entry.sourceId}
                          onValueChange={(val) => patchEntry(entry.file, { sourceId: val })}
                        >
                          <SelectTrigger className="w-44 bg-white/5 border-white/20 text-white text-sm h-8">
                            <SelectValue placeholder="Source…" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1d2e] border-white/20">
                            {state.sources.map(src => (
                              <SelectItem key={src.id} value={src.id} className="text-white">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.couleur }} />
                                  {src.nom}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <div className="ml-auto flex gap-2">
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-500 text-white h-8"
                          onClick={() => handleImport(entry)}
                        >
                          <Database className="h-3.5 w-3.5 mr-1.5" />
                          Importer {activeSheetData.rowCount.toLocaleString('fr-FR')} lignes
                        </Button>
                      </div>
                    </div>

                    {/* Onglets feuilles (style Excel) */}
                    {entry.sheets.length > 1 && (
                      <div className="flex gap-0.5 px-4 pt-3 border-b border-white/10 overflow-x-auto">
                        {entry.sheets.map((sheet, sheetIdx) => (
                          <button
                            key={sheetIdx}
                            onClick={() => patchEntry(entry.file, { activeSheet: sheetIdx, page: 0 })}
                            className={`px-3 py-1.5 text-xs whitespace-nowrap rounded-t border-b-2 transition-colors ${
                              entry.activeSheet === sheetIdx
                                ? 'border-blue-400 text-blue-400 bg-blue-400/10 font-medium'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <FileSpreadsheet className="h-3 w-3 inline mr-1 opacity-70" />
                            {sheet.name}
                            <span className="ml-1.5 text-slate-500 font-normal">
                              {sheet.rowCount.toLocaleString('fr-FR')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Tableau Excel-like */}
                    <div className="overflow-auto" style={{ maxHeight: '55vh' }}>
                      <table className="min-w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1d2e' }}>
                          {/* Ligne en-têtes colonnes */}
                          <tr>
                            {/* Numéro de ligne */}
                            <th className="w-10 px-2 py-2 text-slate-600 text-right border-b border-r border-white/10 font-normal select-none bg-white/5">
                              #
                            </th>
                            {activeSheetData.columns.map(col => {
                              const colType = detectColType(col, activeSheetData.preview);
                              return (
                                <th
                                  key={col}
                                  className="px-3 py-2 text-left border-b border-r border-white/10 whitespace-nowrap font-medium bg-white/5"
                                >
                                  <div className="flex items-center gap-1.5">
                                    {COL_TYPE_ICON[colType]}
                                    <span className={COL_TYPE_COLOR[colType]}>{col}</span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row, rowIdx) => {
                            const absIdx = entry.page * ROWS_PER_PAGE + rowIdx;
                            return (
                              <tr
                                key={rowIdx}
                                className={`hover:bg-blue-500/5 ${rowIdx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                              >
                                <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none text-[10px] font-mono">
                                  {absIdx + 1}
                                </td>
                                {activeSheetData.columns.map(col => {
                                  const val = String(row[col] ?? '');
                                  const colType = detectColType(col, activeSheetData.preview);
                                  return (
                                    <td
                                      key={col}
                                      className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[220px] truncate
                                        ${colType === 'number' ? 'text-right font-mono text-emerald-300/80' :
                                          colType === 'date' ? 'text-blue-300/80' : 'text-slate-400'}`}
                                      title={val.length > 30 ? val : undefined}
                                    >
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/3">
                      <span className="text-slate-500 text-xs">
                        Lignes {entry.page * ROWS_PER_PAGE + 1}–{Math.min((entry.page + 1) * ROWS_PER_PAGE, activeSheetData.preview.length)} affichées
                        {activeSheetData.rowCount > 200 && (
                          <span className="text-yellow-500/70 ml-1">
                            (prévisualisation 200/{activeSheetData.rowCount.toLocaleString('fr-FR')} — import = fichier complet)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">
                          Page {entry.page + 1}/{Math.max(totalPages, 1)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                          disabled={entry.page === 0}
                          onClick={() => patchEntry(entry.file, { page: entry.page - 1 })}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                          disabled={entry.page >= totalPages - 1}
                          onClick={() => patchEntry(entry.file, { page: entry.page + 1 })}
                        >
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
      )}

      {/* Fichiers déjà importés (persistés) */}
      {state.files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            Données importées ({state.files.length} fichier{state.files.length > 1 ? 's' : ''})
          </h3>
          {state.files.map(f => {
            const linkedSource = f.sourceId ? state.sources.find(s => s.id === f.sourceId) : null;
            const isExpanded = expandedId === f.id;
            const page = expandedPage[f.id] ?? 0;
            const totalPages = Math.ceil(f.rawData.length / ROWS_PER_PAGE);
            const pageRows = f.rawData.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

            return (
              <div key={f.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                {/* En-tête */}
                <div className="flex items-center gap-3 p-4">
                  <FileSpreadsheet className="h-5 w-5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{f.name}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <Badge variant="outline" className="text-xs border-white/20 text-slate-300">
                        {f.type === 'shelly' ? 'Shelly 3EM' : f.type === 'facturation' ? 'Facturation' : 'Autre'}
                      </Badge>
                      {linkedSource && (
                        <Badge
                          className="text-xs border-0"
                          style={{ backgroundColor: linkedSource.couleur + '25', color: linkedSource.couleur }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full mr-1 inline-block" style={{ backgroundColor: linkedSource.couleur }} />
                          {linkedSource.nom}
                        </Badge>
                      )}
                      <span className="text-slate-500 text-xs">
                        {f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} colonnes
                      </span>
                      <span className="text-slate-600 text-xs">
                        Importé le {f.uploadedAt instanceof Date
                          ? f.uploadedAt.toLocaleDateString('fr-FR')
                          : new Date(f.uploadedAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-8 gap-1.5 text-xs ${isExpanded ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    onClick={() => {
                      setExpandedId(isExpanded ? null : f.id);
                      setExpandedPage(prev => ({ ...prev, [f.id]: 0 }));
                    }}
                  >
                    {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {isExpanded ? 'Masquer' : 'Voir les données'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => {
                      if (isExpanded) setExpandedId(null);
                      removeFile(f.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Tableau de données */}
                {isExpanded && f.rawData.length > 0 && (
                  <>
                    <div className="overflow-auto border-t border-white/10" style={{ maxHeight: '55vh' }}>
                      <table className="min-w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1d2e' }}>
                          <tr>
                            <th className="w-10 px-2 py-2 text-slate-600 text-right border-b border-r border-white/10 font-normal select-none bg-white/5">
                              #
                            </th>
                            {f.columns.map(col => {
                              const colType = detectColType(col, f.rawData);
                              return (
                                <th key={col} className="px-3 py-2 text-left border-b border-r border-white/10 whitespace-nowrap font-medium bg-white/5">
                                  <div className="flex items-center gap-1.5">
                                    {COL_TYPE_ICON[colType]}
                                    <span className={COL_TYPE_COLOR[colType]}>{col}</span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row, rowIdx) => {
                            const absIdx = page * ROWS_PER_PAGE + rowIdx;
                            return (
                              <tr key={rowIdx} className={`hover:bg-blue-500/5 ${rowIdx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                                <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none text-[10px] font-mono">
                                  {absIdx + 1}
                                </td>
                                {f.columns.map(col => {
                                  const val = String(row[col] ?? '');
                                  const colType = detectColType(col, f.rawData);
                                  return (
                                    <td
                                      key={col}
                                      className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[220px] truncate
                                        ${colType === 'number' ? 'text-right font-mono text-emerald-300/80' :
                                          colType === 'date' ? 'text-blue-300/80' : 'text-slate-400'}`}
                                      title={val.length > 30 ? val : undefined}
                                    >
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/3">
                      <span className="text-slate-500 text-xs">
                        Lignes {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, f.rawData.length)} / {f.rowCount.toLocaleString('fr-FR')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">Page {page + 1}/{Math.max(totalPages, 1)}</span>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                          disabled={page === 0}
                          onClick={() => setExpandedPage(prev => ({ ...prev, [f.id]: page - 1 }))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                          disabled={page >= totalPages - 1}
                          onClick={() => setExpandedPage(prev => ({ ...prev, [f.id]: page + 1 }))}
                        >
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
      )}

      {/* État vide */}
      {state.files.length === 0 && entries.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <FileSpreadsheet className="mx-auto h-12 w-12 opacity-20 mb-3" />
          <p className="font-medium">Aucune donnée importée</p>
          <p className="text-xs mt-1">Importez un fichier Shelly 3EM ou de facturation SENELEC</p>
          <p className="text-xs mt-1 text-slate-600">Les données sont sauvegardées automatiquement</p>
        </div>
      )}
    </div>
  );
}
