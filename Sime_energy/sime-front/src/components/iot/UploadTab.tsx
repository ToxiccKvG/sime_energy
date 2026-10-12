import { useRef, useState, useCallback } from 'react';
import { parseExcelBuffer } from '@/lib/excel-utils';
import {
  Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Hash, Calendar, Type, Database,
  FileText, Zap, FolderOpen,
} from 'lucide-react';
import { filesFromDataTransfer, filesFromInput, directoryInputProps } from '@/lib/folder-import';

const ACCEPT_RE = /\.(csv|xlsx|xls|pdf)$/i;
import { extraireTextePDF, parserFactureEnergie } from '@/lib/iot-pdf-engine';
import type { FactureParsee } from '@/lib/iot-pdf-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIOT } from './IOTContext';
import type { ImportedFile, ShellyRow } from './shared';
import { COLONNES_PROFIL_SHELLY } from './shared';
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

// Onglets PROFIL Mi reconnus dans les fichiers Shelly multi-sheets — même
// vocabulaire que les rôles d'appareils (M1 = réseau, quel que soit le
// distributeur ; « SENELEC » n'est gardé que comme motif de détection des
// anciens fichiers).
type ProfilMi = 'M1_RESEAU' | 'M2_SELECTEUR' | 'M3_CHARGE' | 'M4_GROUPE' | 'M5_PV';
const PROFIL_SHEET_PATTERNS: { pattern: RegExp; profilMi: ProfilMi }[] = [
  { pattern: /RESEAU|SENELEC|M1/i, profilMi: 'M1_RESEAU' },
  { pattern: /SELECTEUR|M2/i,      profilMi: 'M2_SELECTEUR' },
  { pattern: /CHARGE|M3/i,         profilMi: 'M3_CHARGE' },
  { pattern: /GROUPE|M4/i,         profilMi: 'M4_GROUPE' },
  { pattern: /PV|M5/i,             profilMi: 'M5_PV' },
];

const PROFIL_MI_COLORS: Record<ProfilMi, string> = {
  M1_RESEAU:    '#3b82f6',
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
function readSheet(rawRows: unknown[][]): { columns: string[]; rows: Record<string, unknown>[] } {
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
                  <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none text-[0.625rem] font-mono">{absIdx + 1}</td>
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
  const { state, addFile, setShellyRows } = useIOT();
  const inputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pdfEntries, setPdfEntries] = useState<PDFEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Page par entrée en cours (clé = file.name + sheet index)
  const [entryPages, setEntryPages] = useState<Record<string, number>>({});

  const pageKey = (entry: FileEntry) => `${entry.file.name}-${entry.activeSheet}`;

  // ---- Lecture complète d'un fichier ----
  const processFile = useCallback(async (file: File, type: FileType): Promise<FileEntry> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target!.result as ArrayBuffer;
          const wb = await parseExcelBuffer(buffer);

          const sheets: SheetData[] = wb.sheetNames
            // Ignorer les feuilles techniques
            .filter(n => !n.startsWith('~') && !n.toLowerCase().includes('legende') && !n.toLowerCase().includes('jours fériés'))
            .map(name => {
              const rawRows = wb.getRows(name);
              const { columns, rows } = readSheet(rawRows);
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
            resolve({ file, type, status: 'error', error: 'Fichier vide ou format non reconnu', sheets: [], activeSheet: 0, page: 0 });
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

          resolve({ file, type, status: 'done', sheets, activeSheet, page: 0, detected: detectedType });
        } catch (err) {
          resolve({ file, type, status: 'error', error: err instanceof Error ? err.message : String(err), sheets: [], activeSheet: 0, page: 0 });
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

  const handleFiles = useCallback(async (files: FileList | File[]) => {
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
    const newEntries: FileEntry[] = dataFiles.map(f => ({
      file: f,
      type: 'shelly' as FileType,
      status: 'pending' as const,
      sheets: [],
      activeSheet: 0,
      page: 0,
    }));
    setEntries(prev => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      setEntries(prev => prev.map(e => e.file === entry.file ? { ...e, status: 'processing' } : e));
      const processed = await processFile(entry.file, entry.type);
      setEntries(prev => prev.map(e => e.file === entry.file ? processed : e));
    }
  }, [processFile, processPDFFile]);

  // ---- Import facture PDF vers le contexte ----
  const handleImportPDF = useCallback((entry: PDFEntry) => {
    const kwh   = parseFloat(entry.editKwh)   || 0;
    const fcfa  = parseFloat(entry.editFcfa)  || undefined;
    const eur   = parseFloat(entry.editEur)   || undefined;
    const kva   = parseFloat(entry.editKva)   || undefined;
    const debut = entry.editDebut ? new Date(entry.editDebut) : undefined;
    const fin   = entry.editFin   ? new Date(entry.editFin)   : undefined;

    const id = crypto.randomUUID(); // clé de iot_files (uuid)
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

    const id = crypto.randomUUID(); // clé de iot_files (uuid)
    const importedFile: ImportedFile = {
      id,
      name: entry.file.name,
      type: entry.type,
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
      // Enrichir chaque ligne avec l'identité de l'appareil (à défaut : nom du fichier)
      const fallbackName = entry.file.name.replace(/\.(csv|xlsx|xls)$/i, '');
      const shellyRows = parsed.map(r => ({
        ...r,
        nomAppareil:    r.nomAppareil    ?? fallbackName,
        deviceLocation: r.deviceLocation ?? entry.deviceLocation ?? undefined,
        deviceRoom:     r.deviceRoom     ?? entry.deviceRoom     ?? undefined,
      }));

      setShellyRows([...state.shellyRows, ...shellyRows]);
    }

    setEntries(prev => prev.filter(e => e.file !== entry.file));
  }, [addFile, setShellyRows, state]);

  const patchEntry = useCallback((file: File, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.file === file ? { ...e, ...patch } : e));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Dossiers compris (parcours récursif) ; fichiers système et verrous Excel exclus
    void filesFromDataTransfer(e.dataTransfer, ACCEPT_RE).then(files => { if (files.length > 0) handleFiles(files); });
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
          onChange={(e) => { const fs = filesFromInput(e.target.files, ACCEPT_RE); if (fs.length) handleFiles(fs); e.target.value = ''; }}
        />
        <input
          ref={dirInputRef}
          type="file"
          multiple
          className="hidden"
          {...directoryInputProps()}
          onChange={(e) => { const fs = filesFromInput(e.target.files, ACCEPT_RE); if (fs.length) handleFiles(fs); e.target.value = ''; }}
        />
        <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
        <p className="text-white font-medium text-lg">Glisser-déposer ou cliquer pour importer</p>
        <p className="text-slate-400 text-sm mt-1">CSV, XLSX, XLS — Shelly 3EM &nbsp;·&nbsp; PDF — Factures énergie &nbsp;·&nbsp; plusieurs fichiers ou un dossier entier</p>
        <p className="text-slate-600 text-xs mt-1">Fichiers multi-feuilles supportés · En-têtes doubles Shelly détectés automatiquement · Sous-dossiers parcourus</p>
        <Button type="button" size="sm" variant="outline"
          className="mt-4 border-white/20 text-slate-200 hover:bg-white/10"
          onClick={(e) => { e.stopPropagation(); dirInputRef.current?.click(); }}>
          <FolderOpen className="h-4 w-4 mr-1.5" /> Importer un dossier
        </Button>
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
                              <span className="text-green-500 text-[0.5625rem]">✓</span>
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
