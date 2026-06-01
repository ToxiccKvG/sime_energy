import { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Hash, Calendar, Type, Database,
  Tag, ChevronDown, FileText, Zap,
} from 'lucide-react';
import { extraireTextePDF, parserFactureEnergie } from '@/lib/iot-pdf-engine';
import type { FactureParsee } from '@/lib/iot-pdf-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIOT } from './IOTContext';
import type { ImportedFile, ShellyRow, ProfilMi } from './shared';
import { PROFIL_MI_LABELS, COLONNES_PROFIL_SHELLY } from './shared';
import { parseShellyRow, profilMiToShellyRow, detecterFormatShelly, parseShellySectionCSV } from '@/lib/iot-profil-engine';
import { transformRowsToProfilMi, transformHoraireToProfilMi } from '@/lib/iot-supabase-service';

type FileType = 'shelly' | 'autre';

// ---- Entrée PDF facture ----
interface PDFEntry {
  file: File;
  status: 'loading' | 'done' | 'error';
  error?: string;
  parsed?: FactureParsee;
  // champs éditables (override du parsing)
  editKwh: string;
  editFcfa: string;
  editEur: string;
  editDebut: string;
  editFin: string;
  editKva: string;
  editNumClient: string;
}

const ROWS_PER_PAGE = 50;

// Onglets PROFIL Mi reconnus dans les fichiers Shelly multi-sheets
const PROFIL_SHEET_PATTERNS: { pattern: RegExp; profilMi: ProfilMi }[] = [
  { pattern: /SENELEC|M1/i,   profilMi: 'M1_SENELEC' },
  { pattern: /SELECTEUR|M2/i, profilMi: 'M2_SELECTEUR' },
  { pattern: /CHARGE|M3/i,    profilMi: 'M3_CHARGE' },
  { pattern: /GROUPE|M4/i,    profilMi: 'M4_GROUPE' },
  { pattern: /PV|M5/i,        profilMi: 'M5_PV' },
];

const PROFIL_MI_COLORS: Record<ProfilMi, string> = {
  M1_SENELEC:   '#3b82f6',
  M2_SELECTEUR: '#a855f7',
  M3_CHARGE:    '#ef4444',
  M4_GROUPE:    '#f97316',
  M5_PV:        '#eab308',
};

interface SheetData {
  name: string;
  columns: string[];
  preview: Record<string, unknown>[];
  rawData: Record<string, unknown>[];   // données complètes pour import
  rowCount: number;
  profilMi?: ProfilMi;                  // profil Mi détecté depuis le nom de l'onglet
  isShelly: boolean;
}

interface FileEntry {
  file: File;
  type: FileType;
  sourceIds: string[];   // multi-sélection : 0..N sources liées
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  sheets: SheetData[];
  activeSheet: number;
  page: number;
  detected?: string;
  deviceLocation?: string;
  deviceRoom?: string;
}

// ---- Détection type de colonne ----
function detectColType(col: string, rows: Record<string, unknown>[]): 'date' | 'number' | 'text' {
  const sample = rows.slice(0, 20).map(r => r[col]).filter(v => v != null && v !== '');
  if (sample.length === 0) return 'text';
  if (sample.every(v => v instanceof Date)) return 'date';
  if (sample.every(v => typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(v)))) return 'date';
  if (sample.every(v => !isNaN(Number(v)))) return 'number';
  return 'text';
}

const COL_TYPE_ICON: Record<string, React.ReactNode> = {
  date:   <Calendar className="h-3 w-3 text-blue-400" />,
  number: <Hash className="h-3 w-3 text-green-400" />,
  text:   <Type className="h-3 w-3 text-slate-400" />,
};
const COL_TYPE_COLOR: Record<string, string> = {
  date:   'text-blue-300',
  number: 'text-green-300',
  text:   'text-slate-300',
};

// ============================================================
// LECTURE INTELLIGENTE D'UNE FEUILLE EXCEL
// Gère les fichiers Shelly avec 2 lignes d'en-tête :
//   Ligne 1 : groupes (DONNEES D'ENTREE - JOURNALIER, ...)
//   Ligne 2 : noms des colonnes (Temps, Wh_Phase A, ...)
//   Ligne 3+ : données
// ============================================================
function readSheet(ws: XLSX.WorkSheet): { columns: string[]; rows: Record<string, unknown>[] } {
  // 1. Lire toutes les lignes sans en-tête pour inspecter
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (rawRows.length === 0) return { columns: [], rows: [] };

  // 2. Détecter si on a 2 lignes d'en-tête (format Shelly PROFIL)
  //    Critère : la 1ère ligne a très peu de cellules non-nulles vs la 2ème
  const firstRow  = (rawRows[0] as unknown[]).map(v => v == null ? '' : String(v).trim());
  const secondRow = rawRows.length > 1 ? (rawRows[1] as unknown[]).map(v => v == null ? '' : String(v).trim()) : [];

  const firstNonEmpty  = firstRow.filter(Boolean).length;
  const secondNonEmpty = secondRow.filter(Boolean).length;

  // Si la 2ème ligne a significativement plus de cellules non-nulles → 2-row headers
  const hasTwoHeaderRows = secondNonEmpty > firstNonEmpty * 2 && secondNonEmpty >= 5;

  let headerRow: string[];
  let dataStartRow: number;

  if (hasTwoHeaderRows) {
    // Utiliser la ligne 2 comme en-têtes, données à partir de la ligne 3
    headerRow = secondRow.map((h, i) => {
      if (!h) return `col_${i}`;
      // Nettoyer les BOM et espaces
      return h.replace(/[\uFEFF\u200B]/g, '').trim();
    });
    dataStartRow = 2;
  } else {
    // En-tête normal sur la ligne 1
    headerRow = firstRow.map((h, i) => {
      if (!h) return `col_${i}`;
      return h.replace(/[\uFEFF\u200B]/g, '').trim();
    });
    dataStartRow = 1;
  }

  // 3. Construire les lignes de données
  const dataRows = rawRows.slice(dataStartRow);
  const rows = dataRows
    .map(raw => {
      const r = raw as unknown[];
      const obj: Record<string, unknown> = {};
      headerRow.forEach((h, i) => {
        obj[h] = r[i] ?? null;
      });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== null && v !== ''));

  // Déduplication des noms de colonnes
  const seen: Record<string, number> = {};
  const uniqueHeaders = headerRow.map(h => {
    if (seen[h] !== undefined) {
      seen[h]++;
      return `${h}_${seen[h]}`;
    }
    seen[h] = 0;
    return h;
  });

  return { columns: uniqueHeaders, rows };
}

// Détecte le ProfilMi depuis le nom d'une feuille Excel
function detectProfilMiFromSheet(name: string): ProfilMi | undefined {
  for (const { pattern, profilMi } of PROFIL_SHEET_PATTERNS) {
    if (pattern.test(name)) return profilMi;
  }
  return undefined;
}

// ---- Composant TableauSheet ----
function TableauSheet({
  columns,
  rows,
  page,
  onPageChange,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  page: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const paged = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">Feuille vide ou non parsable</div>
    );
  }

  return (
    <>
      <div className="overflow-auto" style={{ maxHeight: '55vh' }}>
        <table className="min-w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1d2e' }}>
            <tr>
              <th className="w-10 px-2 py-2 text-slate-600 text-right border-b border-r border-white/10 font-normal select-none bg-white/5">#</th>
              {columns.map(col => {
                const colType = detectColType(col, rows);
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
            {paged.map((row, rowIdx) => {
              const absIdx = page * ROWS_PER_PAGE + rowIdx;
              return (
                <tr key={rowIdx} className={`hover:bg-blue-500/5 ${rowIdx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                  <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none text-[10px] font-mono">{absIdx + 1}</td>
                  {columns.map(col => {
                    const val = row[col];
                    const display = val instanceof Date
                      ? val.toLocaleDateString('fr-FR')
                      : val == null ? '' : String(val);
                    const colType = detectColType(col, rows);
                    return (
                      <td
                        key={col}
                        className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[220px] truncate
                          ${colType === 'number' ? 'text-right font-mono text-emerald-300/80' :
                            colType === 'date'   ? 'text-blue-300/80' : 'text-slate-400'}`}
                        title={display.length > 30 ? display : undefined}
                      >
                        {display}
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
          Lignes {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, rows.length)} sur {rows.length.toLocaleString('fr-FR')}
          {rows.length > 200 && (
            <span className="text-yellow-500/70 ml-1">(prévisualisation 200/{rows.length.toLocaleString('fr-FR')})</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">Page {page + 1}/{totalPages}</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
            disabled={page === 0} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
            disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export function UploadTab() {
  const { state, addFile, setShellyRows, removeFile, setSourceData } = useIOT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pdfEntries, setPdfEntries] = useState<PDFEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Page par entrée en cours (clé = file.name + sheet index)
  const [entryPages, setEntryPages] = useState<Record<string, number>>({});

  const pageKey = (entry: FileEntry) => `${entry.file.name}-${entry.activeSheet}`;

  // ---- Lecture complète d'un fichier ----
  const processFile = useCallback(async (file: File, type: FileType, sourceIds: string[]): Promise<FileEntry> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });

          const sheets: SheetData[] = wb.SheetNames
            // Ignorer les feuilles techniques
            .filter(n => !n.startsWith('~') && !n.toLowerCase().includes('legende') && !n.toLowerCase().includes('jours fériés'))
            .map(name => {
              const ws = wb.Sheets[name];
              const { columns, rows } = readSheet(ws);
              const detect = detecterFormatShelly(columns);
              const profilMi = detectProfilMiFromSheet(name);
              return {
                name,
                columns,
                preview: rows.slice(0, 200),
                rawData: rows,
                rowCount: rows.length,
                profilMi,
                isShelly: detect.isShelly,
              };
            })
            .filter(s => s.rowCount > 0);

          if (sheets.length === 0) {
            resolve({ file, type, sourceIds, status: 'error', error: 'Fichier vide ou format non reconnu', sheets: [], activeSheet: 0, page: 0 });
            return;
          }

          // Auto-sélection de la meilleure feuille
          let activeSheet = 0;
          if (type === 'shelly') {
            // Priorité : feuilles PROFIL Mi → feuilles avec colonnes Shelly
            const shellyIdx = sheets.findIndex(s => s.isShelly && s.profilMi);
            const anyShelly = sheets.findIndex(s => s.isShelly);
            if (shellyIdx >= 0) activeSheet = shellyIdx;
            else if (anyShelly >= 0) activeSheet = anyShelly;
          }

          const active = sheets[activeSheet];
          const detect = detecterFormatShelly(active.columns);
          const detectedType = detect.format === 'supabase_horaire' ? `Supabase horaire${active.profilMi ? ' · ' + active.profilMi : ''}`
            : detect.format === 'supabase_cl'      ? `Supabase minute${active.profilMi ? ' · ' + active.profilMi : ''}`
            : detect.format === 'profil_mi'        ? `PROFIL Mi${active.profilMi ? ' · ' + active.profilMi : ''}`
            : detect.format === 'shelly_excel'     ? `Shelly 3EM${active.profilMi ? ' · ' + active.profilMi : ''} (${detect.hasRetour ? 'avec retour' : 'sans retour'})`
            : `${active.columns.length} colonnes — format générique`;

          resolve({ file, type, sourceIds, status: 'done', sheets, activeSheet, page: 0, detected: detectedType });
        } catch (err) {
          resolve({ file, type, sourceIds, status: 'error', error: String(err), sheets: [], activeSheet: 0, page: 0 });
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  // ---- Traitement fichiers PDF ----
  const processPDFFile = useCallback(async (file: File) => {
    setPdfEntries(prev => prev.map(e => e.file === file ? { ...e, status: 'loading' } : e));
    try {
      const texte = await extraireTextePDF(file);
      const parsed = parserFactureEnergie(texte);
      setPdfEntries(prev => prev.map(e => e.file === file ? {
        ...e,
        status: 'done',
        parsed,
        editKwh:       parsed.consommationKwh != null ? String(parsed.consommationKwh) : '',
        editFcfa:      parsed.montantFcfa      != null ? String(parsed.montantFcfa)    : '',
        editEur:       parsed.montantEur       != null ? String(parsed.montantEur)     : '',
        editDebut:     parsed.periode ? parsed.periode.debut.toISOString().slice(0, 10) : '',
        editFin:       parsed.periode ? parsed.periode.fin.toISOString().slice(0, 10)   : '',
        editKva:       parsed.puissanceSouscrite != null ? String(parsed.puissanceSouscrite) : '',
        editNumClient: parsed.numeroClient ?? '',
      } : e));
    } catch (err) {
      setPdfEntries(prev => prev.map(e => e.file === file ? { ...e, status: 'error', error: String(err) } : e));
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    const allFiles = Array.from(files);
    const pdfFiles  = allFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    const dataFiles = allFiles.filter(f => !f.name.toLowerCase().endsWith('.pdf'));

    // Fichiers PDF → flux séparé
    if (pdfFiles.length > 0) {
      const newPDF: PDFEntry[] = pdfFiles.map(f => ({
        file: f, status: 'loading',
        editKwh: '', editFcfa: '', editEur: '',
        editDebut: '', editFin: '', editKva: '', editNumClient: '',
      }));
      setPdfEntries(prev => [...prev, ...newPDF]);
      for (const f of pdfFiles) await processPDFFile(f);
    }

    if (dataFiles.length === 0) return;
    const defaultSourceIds = state.sources[0]?.id ? [state.sources[0].id] : [];
    const newEntries: FileEntry[] = dataFiles.map(f => ({
      file: f,
      type: 'shelly' as FileType,
      sourceIds: defaultSourceIds,
      status: 'pending' as const,
      sheets: [],
      activeSheet: 0,
      page: 0,
    }));
    setEntries(prev => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      setEntries(prev => prev.map(e => e.file === entry.file ? { ...e, status: 'processing' } : e));
      const processed = await processFile(entry.file, entry.type, entry.sourceIds);
      setEntries(prev => prev.map(e => e.file === entry.file ? { ...processed, sourceIds: entry.sourceIds } : e));
    }
  }, [processFile, processPDFFile, state.sources]);

  // ---- Import facture PDF vers le contexte ----
  const handleImportPDF = useCallback((entry: PDFEntry) => {
    const kwh   = parseFloat(entry.editKwh)   || 0;
    const fcfa  = parseFloat(entry.editFcfa)  || undefined;
    const eur   = parseFloat(entry.editEur)   || undefined;
    const kva   = parseFloat(entry.editKva)   || undefined;
    const debut = entry.editDebut ? new Date(entry.editDebut) : undefined;
    const fin   = entry.editFin   ? new Date(entry.editFin)   : undefined;

    const id = `${Date.now()}-${entry.file.name}`;
    addFile({
      id,
      name: entry.file.name,
      type: 'facture',
      uploadedAt: new Date(),
      rowCount: 1,
      columns: ['periode_debut', 'periode_fin', 'consommation_kwh', 'montant_fcfa', 'montant_eur', 'puissance_kva', 'num_client'],
      preview: [{ periode_debut: entry.editDebut, periode_fin: entry.editFin, consommation_kwh: kwh, montant_fcfa: fcfa, montant_eur: eur, puissance_kva: kva, num_client: entry.editNumClient }],
      rawData: [{ periode_debut: entry.editDebut, periode_fin: entry.editFin, consommation_kwh: kwh, montant_fcfa: fcfa, montant_eur: eur, puissance_kva: kva, num_client: entry.editNumClient }],
      statut: 'original',
      taille: entry.file.size,
    });
    setPdfEntries(prev => prev.filter(e => e.file !== entry.file));
    void debut; void fin; // consommées dans rawData indirectement
  }, [addFile]);

  // ---- Import vers le contexte ----
  const handleImport = useCallback((entry: FileEntry) => {
    const sheet = entry.sheets[entry.activeSheet];
    if (!sheet) return;

    const id = `${Date.now()}-${entry.file.name}`;
    // Compat : sourceId = première source (héritage), sourceIds = toutes
    const primarySourceId = entry.sourceIds[0];
    const importedFile: ImportedFile = {
      id,
      name: entry.file.name,
      type: entry.type,
      sourceId: primarySourceId || undefined,
      uploadedAt: new Date(),
      rowCount: sheet.rawData.length,
      columns: sheet.columns,
      preview: sheet.rawData.slice(0, 10),
      rawData: sheet.rawData,
      statut: 'original',
      taille: entry.file.size,
      deviceLocation: entry.deviceLocation || undefined,
      deviceRoom: entry.deviceRoom || undefined,
    };
    addFile(importedFile);

    if (entry.type === 'shelly') {
      const detect = detecterFormatShelly(sheet.columns);
      let parsed: ShellyRow[] = [];
      try {
        if (detect.format === 'profil_mi') {
          parsed = sheet.rawData.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (detect.format === 'supabase_cl') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pr = transformRowsToProfilMi(sheet.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          parsed = pr.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (detect.format === 'supabase_horaire') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pr = transformHoraireToProfilMi(sheet.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          parsed = pr.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (detect.format === 'shelly_section') {
          parsed = parseShellySectionCSV(sheet.rawData, state.joursFerier);
        } else {
          parsed = sheet.rawData.map(r => parseShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        }
      } catch (e) {
        console.warn('[UploadTab] format-aware parse error, falling back to parseShellyRow:', e);
      }
      if (parsed.length === 0) {
        parsed = sheet.rawData.map(r => parseShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
      }
      // Enrichir chaque ligne avec l'identité de l'appareil (basée sur la 1ère source)
      const sourceName = state.sources.find(s => s.id === primarySourceId)?.nom
        ?? entry.file.name.replace(/\.(csv|xlsx|xls)$/i, '');
      const shellyRows = parsed.map(r => ({
        ...r,
        nomAppareil:    r.nomAppareil    ?? sourceName,
        deviceLocation: r.deviceLocation ?? entry.deviceLocation ?? undefined,
        deviceRoom:     r.deviceRoom     ?? entry.deviceRoom     ?? undefined,
      }));

      setShellyRows([...state.shellyRows, ...shellyRows]);

      // Diffuse les données dans toutes les sources sélectionnées
      for (const sid of entry.sourceIds) {
        let cumKwh = 0;
        setSourceData(sid, shellyRows.map(r => {
          cumKwh += r.kwhNet ?? 0;
          return {
            timestamp: r.date,
            sourceId: sid,
            puissanceKw: r.puissKwTotal ?? 0,
            energieKwh: r.kwhNet ?? 0,
            energieCumKwh: cumKwh,
          };
        }));
      }
    }

    setEntries(prev => prev.filter(e => e.file !== entry.file));
  }, [addFile, setShellyRows, setSourceData, state]);

  const patchEntry = useCallback((file: File, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.file === file ? { ...e, ...patch } : e));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // ============================================================
  return (
    <div className="space-y-6">
      {/* ---- Zone de dépôt ---- */}
      <div
        id="iot-drop-zone"
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
          accept=".csv,.xlsx,.xls,.pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
        <p className="text-white font-medium text-lg">Glisser-déposer ou cliquer pour importer</p>
        <p className="text-slate-400 text-sm mt-1">CSV, XLSX, XLS — Shelly 3EM &nbsp;·&nbsp; PDF — Factures énergie</p>
        <p className="text-slate-600 text-xs mt-1">Fichiers multi-feuilles supportés · En-têtes doubles Shelly détectés automatiquement</p>
      </div>

      {/* ---- Factures PDF ---- */}
      {pdfEntries.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-400" />
            <h3 className="text-white font-semibold">Factures énergie — vérification</h3>
          </div>
          {pdfEntries.map((entry, idx) => (
            <div key={idx} className="bg-white/5 rounded-xl border border-orange-500/20 overflow-hidden">
              {/* En-tête */}
              <div className="flex items-center gap-3 p-4 border-b border-white/10">
                <FileText className="h-5 w-5 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{entry.file.name}</p>
                  <p className="text-slate-400 text-xs">
                    {(entry.file.size / 1024).toFixed(1)} KB
                    {entry.parsed && (
                      <span className="text-orange-400/80"> · {entry.parsed.source}</span>
                    )}
                  </p>
                </div>
                {entry.status === 'loading' && (
                  <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                )}
                {entry.status === 'done'  && <CheckCircle className="h-5 w-5 text-green-400" />}
                {entry.status === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
                <Button size="sm" variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  onClick={() => setPdfEntries(prev => prev.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {entry.status === 'error' && (
                <p className="px-4 py-3 text-red-400 text-sm">{entry.error}</p>
              )}

              {entry.status === 'done' && (
                <div className="p-4 space-y-4">
                  <p className="text-slate-400 text-xs">
                    Vérifiez et corrigez les données extraites automatiquement depuis la facture PDF.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Consommation (kWh)</label>
                      <Input
                        type="number"
                        value={entry.editKwh}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editKwh: e.target.value } : pe))}
                        placeholder="ex: 1250"
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Montant FCFA</label>
                      <Input
                        type="number"
                        value={entry.editFcfa}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editFcfa: e.target.value } : pe))}
                        placeholder="ex: 87500"
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Montant EUR</label>
                      <Input
                        type="number"
                        value={entry.editEur}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editEur: e.target.value } : pe))}
                        placeholder="ex: 133.40"
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Puissance souscrite (kVA)</label>
                      <Input
                        type="number"
                        value={entry.editKva}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editKva: e.target.value } : pe))}
                        placeholder="ex: 36"
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Période — début</label>
                      <Input
                        type="date"
                        value={entry.editDebut}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editDebut: e.target.value } : pe))}
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs block mb-1">Période — fin</label>
                      <Input
                        type="date"
                        value={entry.editFin}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editFin: e.target.value } : pe))}
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-slate-500 text-xs block mb-1">N° client / contrat</label>
                      <Input
                        value={entry.editNumClient}
                        onChange={e => setPdfEntries(prev => prev.map((pe, i) => i === idx ? { ...pe, editNumClient: e.target.value } : pe))}
                        placeholder="Numéro de compte / référence"
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {entry.parsed?.texteComplet && (
                      <p className="text-slate-600 text-xs truncate max-w-[60%]">
                        Texte brut : {entry.parsed.texteComplet.slice(0, 120)}…
                      </p>
                    )}
                    <Button
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-500 text-white h-8 ml-auto"
                      onClick={() => handleImportPDF(entry)}
                      disabled={!entry.editKwh && !entry.editFcfa}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Enregistrer la facture
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- Fichiers en attente de configuration ---- */}
      {entries.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-white font-semibold">Fichiers à configurer</h3>
          {entries.map((entry, idx) => {
            const sheet = entry.sheets[entry.activeSheet];
            const pg = entryPages[pageKey(entry)] ?? 0;

            return (
              <div key={idx} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                {/* En-tête */}
                <div className="flex items-center gap-3 p-4 border-b border-white/10">
                  <FileSpreadsheet className="h-5 w-5 text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{entry.file.name}</p>
                    <p className="text-slate-400 text-xs">
                      {(entry.file.size / 1024).toFixed(1)} KB
                      {sheet && ` · ${sheet.rowCount.toLocaleString('fr-FR')} lignes · ${sheet.columns.length} colonnes`}
                      {entry.detected && <span className="text-green-400/80"> · {entry.detected}</span>}
                    </p>
                  </div>
                  {entry.status === 'processing' && (
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {entry.status === 'done'  && <CheckCircle className="h-5 w-5 text-green-400" />}
                  {entry.status === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
                  <Button size="sm" variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => setEntries(prev => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {entry.status === 'error' && (
                  <p className="px-4 py-3 text-red-400 text-sm">{entry.error}</p>
                )}

                {entry.status === 'done' && sheet && (
                  <>
                    {/* Barre de configuration */}
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/10">
                      {/* Type de données */}
                      <Select value={entry.type} onValueChange={(val) => patchEntry(entry.file, { type: val as FileType })}>
                        <SelectTrigger className="w-52 bg-white/5 border-white/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          <SelectItem value="shelly">Shelly 3EM — Profil de charge</SelectItem>
                          <SelectItem value="autre">Autre / Générique</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Sources liées (multi-sélection) */}
                      {state.sources.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm"
                              className="bg-white/5 border-white/20 text-white text-sm h-8 min-w-[12rem] justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-1 truncate">
                                {entry.sourceIds.length === 0 ? (
                                  <span className="text-slate-400">Aucune source</span>
                                ) : entry.sourceIds.length === 1 ? (
                                  (() => {
                                    const src = state.sources.find(s => s.id === entry.sourceIds[0]);
                                    if (!src) return <span className="text-slate-400">…</span>;
                                    return (
                                      <>
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: src.couleur }} />
                                        <span className="truncate">{src.nom}</span>
                                        {src.profilMi && <span className="text-slate-500 text-xs">· {src.profilMi.split('_')[0]}</span>}
                                      </>
                                    );
                                  })()
                                ) : (
                                  <>
                                    <div className="flex -space-x-1">
                                      {entry.sourceIds.slice(0, 3).map(sid => {
                                        const s = state.sources.find(x => x.id === sid);
                                        return s ? (
                                          <span key={sid} className="w-3 h-3 rounded-full border border-[#1a1d2e]" style={{ backgroundColor: s.couleur }} />
                                        ) : null;
                                      })}
                                    </div>
                                    <span className="text-xs">{entry.sourceIds.length} sources sélectionnées</span>
                                  </>
                                )}
                              </div>
                              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 bg-[#1a1d2e] border-white/20 p-2" align="start">
                            <div className="flex items-center justify-between px-2 py-1 mb-1">
                              <span className="text-slate-400 text-xs">Sources liées ({entry.sourceIds.length}/{state.sources.length})</span>
                              <button
                                onClick={() => patchEntry(entry.file, {
                                  sourceIds: entry.sourceIds.length === state.sources.length ? [] : state.sources.map(s => s.id),
                                })}
                                className="text-xs text-blue-400 hover:text-blue-300"
                              >
                                {entry.sourceIds.length === state.sources.length ? 'Aucune' : 'Toutes'}
                              </button>
                            </div>
                            <div className="max-h-72 overflow-y-auto space-y-0.5">
                              {state.sources.map(src => {
                                const checked = entry.sourceIds.includes(src.id);
                                return (
                                  <label
                                    key={src.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) => {
                                        const next = v
                                          ? [...entry.sourceIds, src.id]
                                          : entry.sourceIds.filter(id => id !== src.id);
                                        patchEntry(entry.file, { sourceIds: next });
                                      }}
                                    />
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.couleur }} />
                                    <span className="text-white text-sm flex-1 truncate">{src.nom}</span>
                                    {src.profilMi && (
                                      <span className="text-slate-500 text-xs">{src.profilMi.split('_')[0]}</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}

                      {/* Badges ProfilMi des sources sélectionnées */}
                      {entry.sourceIds.length > 0 && entry.sourceIds.map(sid => {
                        const src = state.sources.find(s => s.id === sid);
                        if (!src?.profilMi) return null;
                        return (
                          <Badge key={sid}
                            className="text-xs border-0 h-7 flex items-center gap-1"
                            style={{ backgroundColor: PROFIL_MI_COLORS[src.profilMi] + '25', color: PROFIL_MI_COLORS[src.profilMi] }}
                          >
                            <Tag className="h-3 w-3" />
                            {PROFIL_MI_LABELS[src.profilMi]}
                          </Badge>
                        );
                      })}

                      {/* Localisation appareil */}
                      <Input
                        value={entry.deviceLocation ?? ''}
                        onChange={e => patchEntry(entry.file, { deviceLocation: e.target.value })}
                        placeholder="Emplacement (ex: Salon)"
                        className="w-36 bg-white/5 border-white/20 text-white text-xs h-8 placeholder:text-slate-500"
                      />
                      <Input
                        value={entry.deviceRoom ?? ''}
                        onChange={e => patchEntry(entry.file, { deviceRoom: e.target.value })}
                        placeholder="Pièce / Zone"
                        className="w-32 bg-white/5 border-white/20 text-white text-xs h-8 placeholder:text-slate-500"
                      />

                      {/* Badge Shelly détecté */}
                      {sheet.isShelly && (
                        <Badge className="text-xs bg-green-500/15 text-green-400 border-0 h-7">
                          <CheckCircle className="h-3 w-3 mr-1" /> Shelly 3EM
                        </Badge>
                      )}

                      {/* Bouton import */}
                      <div className="ml-auto">
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-500 text-white h-8"
                          onClick={() => handleImport(entry)}
                          disabled={!sheet.isShelly && entry.type === 'shelly'}
                        >
                          <Database className="h-3.5 w-3.5 mr-1.5" />
                          Importer {sheet.rowCount.toLocaleString('fr-FR')} lignes
                        </Button>
                        {!sheet.isShelly && entry.type === 'shelly' && (
                          <p className="text-orange-400 text-xs mt-1">Format Shelly non reconnu dans cette feuille</p>
                        )}
                      </div>
                    </div>

                    {/* Onglets feuilles */}
                    {entry.sheets.length > 1 && (
                      <div className="flex gap-0.5 px-4 pt-3 border-b border-white/10 overflow-x-auto">
                        {entry.sheets.map((s, sheetIdx) => (
                          <button
                            key={sheetIdx}
                            onClick={() => {
                              patchEntry(entry.file, { activeSheet: sheetIdx });
                              setEntryPages(prev => ({ ...prev, [`${entry.file.name}-${sheetIdx}`]: 0 }));
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-t border-b-2 transition-colors ${
                              entry.activeSheet === sheetIdx
                                ? 'border-blue-400 text-blue-400 bg-blue-400/10 font-medium'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <FileSpreadsheet className="h-3 w-3 opacity-70" />
                            {s.name}
                            {s.profilMi && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROFIL_MI_COLORS[s.profilMi] }} />
                            )}
                            {s.isShelly && (
                              <span className="text-green-500 text-[9px]">✓</span>
                            )}
                            <span className="text-slate-500">{s.rowCount.toLocaleString('fr-FR')}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Tableau */}
                    <TableauSheet
                      columns={sheet.columns}
                      rows={sheet.preview}
                      page={pg}
                      onPageChange={(p) => setEntryPages(prev => ({ ...prev, [pageKey(entry)]: p }))}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}


      {/* ---- État vide ---- */}
      {state.files.length === 0 && entries.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <FileSpreadsheet className="mx-auto h-12 w-12 opacity-20 mb-3" />
          <p className="font-medium">Aucune donnée importée</p>
          <p className="text-xs mt-1">Importez un fichier Shelly 3EM</p>
          <p className="text-xs mt-1 text-slate-600">Les données sont sauvegardées automatiquement</p>
        </div>
      )}
    </div>
  );
}
