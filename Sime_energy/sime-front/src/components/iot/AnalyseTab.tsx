import { useMemo, useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, AreaChart, Area,
} from 'recharts';
import {
  Filter, BarChart2, TrendingUp, Activity, Upload,
  FileSpreadsheet, X, ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIOT } from './IOTContext';
import { parseShellyRow, calculerStats, detecterFormatShelly } from '@/lib/iot-profil-engine';
import { JOURS_SEMAINE, MOIS_FR } from './shared';
import type { ShellyRow } from './shared';

type AnalyseMode = 'tcd' | 'profil_semaine' | 'distribution' | 'correlation' | 'serie';

const COULEURS = ['#a78bfa', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#06b6d4'];

// ---- Convertir données génériques en ShellyRow (format normalisé) ----
// Délègue à parseShellyRow en remappant les colonnes date/valeur
function genericToShellyRow(
  raw: Record<string, unknown>,
  dateCol: string,
  valueCol: string,
  joursFerier: { date: Date; actif: boolean }[],
): ShellyRow | null {
  // Construire un objet compatible avec le format Shelly attendu par parseShellyRow
  const remapped: Record<string, unknown> = {
    ...raw,
    Temps: raw[dateCol],
    'Wh_Total': typeof raw[valueCol] === 'number' ? (raw[valueCol] as number) * 1000 : 0,
  };
  // parseShellyRow est importé depuis iot-profil-engine et gère tous les champs
  return parseShellyRow(remapped, joursFerier as import('@/components/iot/shared').JourFerie[]);
}

// ---- Détection des colonnes numériques ----
function getNumericCols(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter(col => {
    const sample = rows.find(r => r[col] !== null && r[col] !== undefined)?.[col];
    return sample !== undefined && !isNaN(Number(sample));
  });
}

function getDateCols(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter(col => {
    const val = rows[0][col];
    if (!val) return false;
    if (val instanceof Date) return true;
    const s = String(val);
    return !isNaN(Date.parse(s)) || s.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/);
  });
}

// ============================================================
export function AnalyseTab() {
  const { state } = useIOT();
  const { shellyRows, joursFerier, paramsTarif } = state;

  // ---- Import direct ----
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localRows, setLocalRows] = useState<ShellyRow[]>([]);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState<string>('');
  const [valueCol, setValueCol] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [mappingNeeded, setMappingNeeded] = useState(false);

  // Source active: local si chargé, sinon contexte
  const activeRows = localRows.length > 0 ? localRows : shellyRows;
  const dataSource = localRows.length > 0 ? fileName : shellyRows.length > 0 ? 'Données importées (contexte)' : null;

  // ---- Analyse ----
  const [mode, setMode] = useState<AnalyseMode>('serie');
  const [tcdLigne, setTcdLigne] = useState<'mois' | 'jouSemaine' | 'typeJour'>('mois');
  const [showFeries, setShowFeries] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);

  // ---- Parse le fichier ----
  const parseFile = useCallback((file: File) => {
    setLoading(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });

        // Chercher l'onglet le plus pertinent
        let sheetName = wb.SheetNames[0];
        const candidates = wb.SheetNames.filter(n =>
          n.toLowerCase().includes('profil') ||
          n.toLowerCase().includes('données') ||
          n.toLowerCase().includes('data') ||
          n.toLowerCase().includes('mesure')
        );
        if (candidates.length > 0) sheetName = candidates[0];

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: null, raw: false, dateNF: 'YYYY-MM-DD',
        }).filter(r => Object.values(r).some(v => v !== null));

        if (rows.length === 0) { setLoading(false); return; }

        const cols = Object.keys(rows[0]);
        setAllColumns(cols);
        setRawData(rows);

        // Tentative détection automatique format Shelly
        const detect = detecterFormatShelly(cols);
        if (detect.isShelly) {
          const parsed = rows
            .map(r => parseShellyRow(r, joursFerier, paramsTarif))
            .filter((r): r is ShellyRow => r !== null);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else {
          // Besoin de mapping manuel
          const dateCandidates = getDateCols(rows);
          const numCandidates = getNumericCols(rows);
          setDateCol(dateCandidates[0] ?? cols[0]);
          setValueCol(numCandidates[0] ?? cols[1]);
          setMappingNeeded(true);
        }
      } catch {
        // ignore parse errors
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [joursFerier]);

  // ---- Appliquer le mapping ----
  const applyMapping = () => {
    if (!dateCol || !valueCol) return;
    const parsed = rawData
      .map(r => genericToShellyRow(r, dateCol, valueCol, joursFerier))
      .filter((r): r is ShellyRow => r !== null);
    setLocalRows(parsed);
    setMappingNeeded(false);
  };

  const clearLocal = () => {
    setLocalRows([]); setRawData([]); setAllColumns([]);
    setFileName(''); setMappingNeeded(false);
  };

  // ---- Charger un fichier déjà importé ----
  const loadFromImported = useCallback((f: import('./shared').ImportedFile) => {
    if (f.rawData.length === 0) return;
    const cols = f.columns;
    setAllColumns(cols);
    setRawData(f.rawData);
    setFileName(f.name);
    const detect = detecterFormatShelly(cols);
    if (detect.isShelly) {
      const parsed = f.rawData
        .map(r => parseShellyRow(r, joursFerier, paramsTarif))
        .filter((r): r is ShellyRow => r !== null);
      setLocalRows(parsed);
      setMappingNeeded(false);
    } else {
      const dateCandidates = getDateCols(f.rawData);
      const numCandidates = getNumericCols(f.rawData);
      setDateCol(dateCandidates[0] ?? cols[0]);
      setValueCol(numCandidates[0] ?? cols[1]);
      setMappingNeeded(true);
    }
    setShowImport(true);
  }, [joursFerier, paramsTarif]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ---- Export données actives ----
  const exportCSV = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(activeRows.map(r => ({
      Date: r.date.toLocaleDateString('fr-FR'),
      Jour: r.jourSemaine,
      'kWh Total': r.kwhTotal.toFixed(3),
      'kWh Net': r.kwhNet.toFixed(3),
      'kWh Retour': r.kwhRetourTotal.toFixed(3),
      'Phase A': r.kwhA.toFixed(3),
      'Phase B': r.kwhB.toFixed(3),
      'Phase C': r.kwhC.toFixed(3),
      Ferié: r.isJourFerie ? 'Oui' : '',
      Weekend: r.isWeekend ? 'Oui' : '',
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Données');
    XLSX.writeFile(wb, `analyse_${fileName || 'export'}.xlsx`);
  };

  // ---- Calculs ----
  const filteredRows = useMemo(() => {
    let rows = activeRows;
    if (!showFeries) rows = rows.filter(r => !r.isJourFerie);
    if (!showWeekends) rows = rows.filter(r => !r.isWeekend);
    return rows;
  }, [activeRows, showFeries, showWeekends]);

  const stats = useMemo(
    () => calculerStats(filteredRows.map(r => r.kwhNet)),
    [filteredRows]
  );

  const serieData = useMemo(() =>
    filteredRows.map(r => ({
      date: r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      valeur: +r.kwhNet.toFixed(2),
      isWeekend: r.isWeekend,
      isFerie: r.isJourFerie,
    })), [filteredRows]);

  const tcdData = useMemo(() => {
    if (filteredRows.length === 0) return [];
    if (tcdLigne === 'mois') {
      const byMois: Record<string, number[]> = {};
      for (const r of filteredRows) {
        const key = `${MOIS_FR[r.date.getMonth()]} ${r.date.getFullYear()}`;
        if (!byMois[key]) byMois[key] = [];
        byMois[key].push(r.kwhNet);
      }
      return Object.entries(byMois).map(([label, vals]) => ({
        label,
        total: +vals.reduce((s, v) => s + v, 0).toFixed(2),
        moyenne: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
        max: +Math.max(...vals).toFixed(2),
        min: +Math.min(...vals).toFixed(2),
        n: vals.length,
      }));
    }
    if (tcdLigne === 'jouSemaine') {
      const byJour: Record<string, number[]> = {};
      for (const r of filteredRows) {
        if (!byJour[r.jourSemaine]) byJour[r.jourSemaine] = [];
        byJour[r.jourSemaine].push(r.kwhNet);
      }
      return JOURS_SEMAINE.map(jour => {
        const vals = byJour[jour] ?? [];
        return {
          label: jour,
          total: +vals.reduce((s, v) => s + v, 0).toFixed(2),
          moyenne: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : 0,
          max: vals.length ? +Math.max(...vals).toFixed(2) : 0,
          min: vals.length ? +Math.min(...vals).toFixed(2) : 0,
          n: vals.length,
        };
      });
    }
    const types = [
      { key: 'Jours ouvrés', rows: filteredRows.filter(r => !r.isWeekend && !r.isJourFerie) },
      { key: 'Samedis', rows: filteredRows.filter(r => r.date.getDay() === 6) },
      { key: 'Dimanches', rows: filteredRows.filter(r => r.date.getDay() === 0) },
      { key: 'Jours fériés', rows: filteredRows.filter(r => r.isJourFerie) },
    ];
    return types.map(({ key, rows }) => ({
      label: key,
      total: +rows.reduce((s, r) => s + r.kwhNet, 0).toFixed(2),
      moyenne: rows.length ? +(rows.reduce((s, r) => s + r.kwhNet, 0) / rows.length).toFixed(2) : 0,
      max: rows.length ? +Math.max(...rows.map(r => r.kwhNet)).toFixed(2) : 0,
      min: rows.length ? +Math.min(...rows.map(r => r.kwhNet)).toFixed(2) : 0,
      n: rows.length,
    }));
  }, [filteredRows, tcdLigne]);

  const profilSemaineData = useMemo(() =>
    JOURS_SEMAINE.map((jour, idx) => {
      const rows = filteredRows.filter(r => r.date.getDay() === idx);
      return {
        jour,
        kwhMoyen: rows.length ? +(rows.reduce((s, r) => s + r.kwhNet, 0) / rows.length).toFixed(2) : 0,
        n: rows.length,
      };
    }), [filteredRows]);

  const distributionData = useMemo(() => {
    if (filteredRows.length < 2) return [];
    const vals = filteredRows.map(r => r.kwhNet);
    const dmin = Math.min(...vals), dmax = Math.max(...vals);
    const step = (dmax - dmin) / 10;
    if (step === 0) return [];
    const classes = Array.from({ length: 10 }, (_, i) => ({
      label: `${(dmin + i * step).toFixed(0)}–${(dmin + (i + 1) * step).toFixed(0)}`,
      count: 0, min: dmin + i * step, max: dmin + (i + 1) * step,
    }));
    for (const v of vals) {
      const idx = Math.min(Math.floor((v - dmin) / step), 9);
      classes[idx].count++;
    }
    return classes;
  }, [filteredRows]);

  const correlationData = useMemo(() =>
    filteredRows.map(r => ({
      x: r.date.getDay(),
      y: +r.kwhNet.toFixed(2),
    })), [filteredRows]);

  // ============================================================
  return (
    <div className="space-y-4">

      {/* ---- Zone d'import direct ---- */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
          onClick={() => setShowImport(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-400" />
            <span className="text-white font-medium text-sm">Importer un fichier pour analyse</span>
            {dataSource && (
              <Badge className="bg-blue-600/30 text-blue-300 border-0 text-xs ml-2">
                {localRows.length > 0 ? `${localRows.length} lignes · ${fileName}` : dataSource}
              </Badge>
            )}
          </div>
          {showImport ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showImport && (
          <div className="border-t border-white/10 p-4 space-y-4">

            {/* Fichiers déjà importés */}
            {state.files.length > 0 && (
              <div className="space-y-2">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Fichiers importés</p>
                {state.files.map(f => {
                  const isActive = fileName === f.name && localRows.length > 0;
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors
                        ${isActive ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/3 hover:bg-white/5'}`}
                    >
                      <FileSpreadsheet className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{f.name}</p>
                        <p className="text-slate-500 text-xs">{f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} col.</p>
                      </div>
                      {isActive ? (
                        <Badge className="bg-blue-600/30 text-blue-300 border-0 text-xs">Actif</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                          onClick={() => loadFromImported(f)}
                        >
                          Charger
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
              />
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-400 text-sm">Chargement...</p>
                </div>
              ) : (
                <>
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                  <p className="text-white text-sm font-medium">Glisser-déposer ou cliquer</p>
                  <p className="text-slate-500 text-xs mt-1">CSV, XLSX, XLS — Shelly 3EM, données génériques</p>
                </>
              )}
            </div>

            {/* Mapping colonnes */}
            {mappingNeeded && rawData.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
                <p className="text-yellow-400 text-sm font-medium">
                  Format non reconnu automatiquement — sélectionnez les colonnes
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Colonne date / temps</Label>
                    <Select value={dateCol} onValueChange={setDateCol}>
                      <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-white/20">
                        {allColumns.map(c => (
                          <SelectItem key={c} value={c} className="text-white text-sm">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Colonne valeur (kWh / W / ...)</Label>
                    <Select value={valueCol} onValueChange={setValueCol}>
                      <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-white/20">
                        {getNumericCols(rawData).map(c => (
                          <SelectItem key={c} value={c} className="text-white text-sm">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Aperçu */}
                <div className="overflow-x-auto rounded-lg border border-white/10 max-h-40">
                  <table className="min-w-full text-xs">
                    <thead className="bg-white/5 sticky top-0">
                      <tr>
                        {allColumns.slice(0, 6).map(c => (
                          <th key={c} className={`px-3 py-2 text-left font-medium whitespace-nowrap
                            ${c === dateCol ? 'text-blue-400' : c === valueCol ? 'text-green-400' : 'text-slate-400'}`}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          {allColumns.slice(0, 6).map(c => (
                            <td key={c} className="px-3 py-1.5 text-slate-400 whitespace-nowrap">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={applyMapping}
                  disabled={!dateCol || !valueCol}
                >
                  Analyser ces données
                </Button>
              </div>
            )}

            {/* Fichier chargé */}
            {localRows.length > 0 && !mappingNeeded && (
              <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <FileSpreadsheet className="h-5 w-5 text-green-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{fileName}</p>
                  <p className="text-slate-400 text-xs">{localRows.length} lignes chargées</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:bg-red-500/10"
                  onClick={clearLocal}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Pas de données ---- */}
      {activeRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <BarChart2 className="h-16 w-16 opacity-20 mb-4" />
          <p className="text-lg font-medium">Aucune donnée à analyser</p>
          <p className="text-sm mt-1">
            Importez un fichier ci-dessus ou via l'onglet <strong className="text-slate-400">Import</strong>
          </p>
        </div>
      )}

      {activeRows.length > 0 && (
        <>
          {/* Barre mode + filtres */}
          <div className="flex flex-wrap items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-3">
            <div className="flex gap-1">
              {[
                { key: 'serie', icon: <Activity className="h-3.5 w-3.5" />, label: 'Série' },
                { key: 'tcd', icon: <BarChart2 className="h-3.5 w-3.5" />, label: 'TCD' },
                { key: 'profil_semaine', icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Semaine' },
                { key: 'distribution', icon: <Filter className="h-3.5 w-3.5" />, label: 'Distribution' },
                { key: 'correlation', icon: <Activity className="h-3.5 w-3.5" />, label: 'Corrélation' },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setMode(key as AnalyseMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${mode === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <div className="flex items-center gap-2">
                <Switch id="fe2" checked={showFeries} onCheckedChange={setShowFeries} className="data-[state=checked]:bg-purple-500 scale-75" />
                <Label htmlFor="fe2" className="text-slate-400 text-xs">Fériés</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="we2" checked={showWeekends} onCheckedChange={setShowWeekends} className="data-[state=checked]:bg-yellow-500 scale-75" />
                <Label htmlFor="we2" className="text-slate-400 text-xs">WE</Label>
              </div>
              <Badge variant="outline" className="border-white/20 text-slate-400 text-xs">
                {filteredRows.length} pts
              </Badge>
              <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 px-2" onClick={exportCSV}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ---- Série temporelle ---- */}
          {mode === 'serie' && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm">Série temporelle</h3>
                  <span className="text-slate-500 text-xs">
                    {valueCol ? `Colonne : ${valueCol}` : 'kWh Net'}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={serieData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <ReferenceLine y={stats.moyenne} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{ value: `Moy. ${stats.moyenne.toFixed(1)}`, fill: '#f59e0b', fontSize: 10 }} />
                    <Area type="monotone" dataKey="valeur" name="Valeur" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Stats rapides */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {[
                  { label: 'Moyenne', value: stats.moyenne.toFixed(2), color: 'text-blue-400' },
                  { label: 'Médiane', value: stats.mediane.toFixed(2), color: 'text-cyan-400' },
                  { label: 'Écart-type', value: stats.ecartType.toFixed(2), color: 'text-purple-400' },
                  { label: 'P25', value: stats.p25.toFixed(2), color: 'text-green-400' },
                  { label: 'P75', value: stats.p75.toFixed(2), color: 'text-yellow-400' },
                  { label: 'Maximum', value: stats.max.toFixed(2), color: 'text-orange-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
                    <p className="text-slate-500 text-xs">{s.label}</p>
                    <p className={`${s.color} font-bold text-sm mt-1`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- TCD ---- */}
          {mode === 'tcd' && (
            <div className="space-y-4">
              <div className="flex gap-3 items-center">
                <span className="text-slate-400 text-sm">Regrouper par :</span>
                <Select value={tcdLigne} onValueChange={(v) => setTcdLigne(v as typeof tcdLigne)}>
                  <SelectTrigger className="w-44 bg-white/5 border-white/20 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-white/20">
                    <SelectItem value="mois">Mois</SelectItem>
                    <SelectItem value="jouSemaine">Jour de semaine</SelectItem>
                    <SelectItem value="typeJour">Type de jour</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={tcdData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }}
                      angle={tcdLigne === 'mois' ? -25 : 0} textAnchor={tcdLigne === 'mois' ? 'end' : 'middle'} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>
                      {tcdData.map((_, i) => <Cell key={i} fill={COULEURS[i % COULEURS.length]} />)}
                    </Bar>
                    <Bar dataKey="moyenne" name="Moyenne" radius={[4, 4, 0, 0]} fill="#06b6d4" opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      {['Catégorie', 'N', 'Total', 'Moyenne/j', 'Max', 'Min'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tcdData.map((row, i) => (
                      <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                        <td className="px-4 py-2.5 text-white font-medium">{row.label}</td>
                        <td className="px-4 py-2.5 text-slate-400">{row.n}</td>
                        <td className="px-4 py-2.5 text-blue-400 font-medium">{row.total.toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-2.5 text-cyan-400">{row.moyenne.toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-2.5 text-green-400">{row.max.toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-2.5 text-slate-400">{row.min.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                      <td className="px-4 py-2.5 text-white">TOTAL</td>
                      <td className="px-4 py-2.5 text-slate-400">{tcdData.reduce((s, r) => s + r.n, 0)}</td>
                      <td className="px-4 py-2.5 text-blue-400">{tcdData.reduce((s, r) => s + r.total, 0).toLocaleString('fr-FR')}</td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Profil semaine ---- */}
          {mode === 'profil_semaine' && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h3 className="text-white font-semibold text-sm mb-4">Moyenne par jour de semaine</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="jour" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <ReferenceLine y={stats.moyenne} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Bar dataKey="kwhMoyen" name="Moy." radius={[4, 4, 0, 0]}>
                      {profilSemaineData.map((_, i) => (
                        <Cell key={i} fill={i === 0 || i === 6 ? '#a78bfa' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  ['Moyenne', stats.moyenne.toFixed(2), 'text-blue-400'],
                  ['Médiane', stats.mediane.toFixed(2), 'text-cyan-400'],
                  ['Écart-type', stats.ecartType.toFixed(2), 'text-purple-400'],
                  ['P25', stats.p25.toFixed(2), 'text-green-400'],
                  ['P75', stats.p75.toFixed(2), 'text-yellow-400'],
                  ['Max', stats.max.toFixed(2), 'text-orange-400'],
                ].map(([label, val, color]) => (
                  <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
                    <p className="text-slate-500 text-xs">{label}</p>
                    <p className={`${color} font-bold text-sm mt-1`}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Distribution ---- */}
          {mode === 'distribution' && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h3 className="text-white font-semibold text-sm mb-4">Distribution (histogramme)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={distributionData} margin={{ top: 5, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Bar dataKey="count" name="Nb jours" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {distributionData.map((d, i) => (
                        <Cell key={i} fill={d.min < stats.p25 ? '#a78bfa' : d.min < stats.p75 ? '#3b82f6' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-3 text-xs">
                {[
                  { color: 'bg-purple-500', label: `Faible (< ${stats.p25.toFixed(0)})` },
                  { color: 'bg-blue-500', label: 'Normal (P25–P75)' },
                  { color: 'bg-yellow-500', label: `Élevé (> ${stats.p75.toFixed(0)})` },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5 text-slate-400">
                    <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Corrélation ---- */}
          {mode === 'correlation' && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h3 className="text-white font-semibold text-sm mb-4">Consommation vs Jour de semaine</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="x" domain={[0, 6]}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={(v) => JOURS_SEMAINE[v]} />
                    <YAxis type="number" dataKey="y" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      formatter={(v: number, name) => [
                        name === 'y' ? v : JOURS_SEMAINE[v as number],
                        name === 'y' ? 'Valeur' : 'Jour',
                      ]}
                    />
                    <Scatter data={correlationData} fill="#3b82f6" opacity={0.7} r={3} />
                    <ReferenceLine y={stats.moyenne} stroke="#f59e0b" strokeDasharray="4 4" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h4 className="text-white font-medium text-sm mb-3">Courbe de tendance hebdomadaire</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="jour" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="kwhMoyen" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                    <ReferenceLine y={stats.moyenne} stroke="#f59e0b" strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
