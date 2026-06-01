import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, AreaChart, Area, Legend,
} from 'recharts';
import {
  Filter, BarChart2, TrendingUp, Activity, Upload,
  FileSpreadsheet, X, ChevronDown, ChevronUp, Download,
  Database, CheckSquare, Square, RefreshCw, Zap,
  Maximize2, Minimize2, ChevronRight, Layers, FileText,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useIOT } from './IOTContext';
import { ProfilChargeTab } from './ProfilChargeTab';
import { parseShellyRow, profilMiToShellyRow, calculerStats, detecterFormatShelly, parseShellySectionCSV } from '@/lib/iot-profil-engine';
import { transformRowsToProfilMi, transformHoraireToProfilMi, exporterDonneesSupabase, getColonnesParGroupe, fetchDisponibles } from '@/lib/iot-supabase-service';
import { JOURS_SEMAINE, MOIS_FR, PROFIL_MI_LABELS, COLONNES_PROFIL_SHELLY } from './shared';
import type { ShellyRow, ProfilMi } from './shared';

type AnalyseMode = 'courbe' | 'tcd' | 'profil_semaine' | 'distribution' | 'correlation' | 'serie';

const COULEURS = ['#a78bfa', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#06b6d4'];

type MetricKey =
  | 'kwhTotal' | 'kwhNet' | 'kwhRetourTotal'
  | 'kwhA' | 'kwhB' | 'kwhC'
  | 'kwhRetourA' | 'kwhRetourB' | 'kwhRetourC'
  | 'puissKwTotal' | 'puissKwA' | 'puissKwB' | 'puissKwC'
  | 'montantEnergie' | 'montantEnergieRetour';

type MetricGroup = 'Énergie' | 'Phase A' | 'Phase B' | 'Phase C' | 'Puissance' | 'Coût' ;

const METRIQUES: { key: MetricKey; label: string; unit: string; color: string; group: MetricGroup }[] = [
  // ÉNERGIE — Totaux
  { key: 'kwhTotal',             label: 'Consommation totale',       unit: 'kWh',  color: '#3b82f6', group: 'Énergie' },
  { key: 'kwhNet',               label: 'Énergie nette',             unit: 'kWh',  color: '#a78bfa', group: 'Énergie' },
  { key: 'kwhRetourTotal',       label: 'Énergie injectée (retour)', unit: 'kWh',  color: '#ec4899', group: 'Énergie' },
  // PAR PHASE — Soutirage
  { key: 'kwhA',                 label: 'Phase A — Consommation',    unit: 'kWh',  color: '#22c55e', group: 'Phase A' },
  { key: 'kwhB',                 label: 'Phase B — Consommation',    unit: 'kWh',  color: '#f59e0b', group: 'Phase B' },
  { key: 'kwhC',                 label: 'Phase C — Consommation',    unit: 'kWh',  color: '#ec4899', group: 'Phase C' },
  // PAR PHASE — Retour réseau
  { key: 'kwhRetourA',           label: 'Phase A — Retour réseau',   unit: 'kWh',  color: '#34d399', group: 'Phase A' },
  { key: 'kwhRetourB',           label: 'Phase B — Retour réseau',   unit: 'kWh',  color: '#fbbf24', group: 'Phase B' },
  { key: 'kwhRetourC',           label: 'Phase C — Retour réseau',   unit: 'kWh',  color: '#f472b6', group: 'Phase C' },
  // PUISSANCE
  { key: 'puissKwTotal',         label: 'Puissance totale',          unit: 'kW',   color: '#06b6d4', group: 'Puissance' },
  { key: 'puissKwA',             label: 'Puissance — Phase A',       unit: 'kW',   color: '#67e8f9', group: 'Puissance' },
  { key: 'puissKwB',             label: 'Puissance — Phase B',       unit: 'kW',   color: '#fde047', group: 'Puissance' },
  { key: 'puissKwC',             label: 'Puissance — Phase C',       unit: 'kW',   color: '#fda4af', group: 'Puissance' },
  // COÛT
  { key: 'montantEnergie',       label: 'Coût consommation',         unit: 'FCFA', color: '#facc15', group: 'Coût' },
  { key: 'montantEnergieRetour', label: 'Crédit retour réseau',      unit: 'FCFA', color: '#a3e635', group: 'Coût' },
];

const RAW_PAGE_SIZE = 50;
const FS_PAGE_SIZE = 100;

const PROFIL_MI_COLORS: Record<ProfilMi, string> = {
  M1_SENELEC: '#3b82f6',
  M2_SELECTEUR: '#a855f7',
  M3_CHARGE: '#ef4444',
  M4_GROUPE: '#f97316',
  M5_PV: '#eab308',
};

const PROFILS_MI: ProfilMi[] = ['M1_SENELEC', 'M2_SELECTEUR', 'M3_CHARGE', 'M4_GROUPE', 'M5_PV'];

const DEFAULT_SUPABASE_COLUMNS = [
  'Temps',
  // Énergie consommée par phase + total
  'kWh_Total', 'kWh_PhA', 'kWh_PhB', 'kWh_PhC',
  // Énergie retour réseau (injection PV)
  'kWh_RetourTotal', 'kWh_RetourA', 'kWh_RetourB', 'kWh_RetourC',
  // Puissance instantanée (kW)
  'kW_Total', 'kW_PhA', 'kW_PhB', 'kW_PhC',
  'kW_RetourTotal', 'kW_RetourA', 'kW_RetourB', 'kW_RetourC',
  // Classifieurs
  'Date', 'Jour', 'Mois', 'Annee', 'Heure',
  'Jour_activites', 'Saison', 'Profil', 'Nom',
  'Appareil', 'Emplacement', 'Piece',
];

const DEFAULT_COLUMN_GROUPS = {
  entree: ['Temps'],
  calcule: [
    'kWh_Total', 'kWh_PhA', 'kWh_PhB', 'kWh_PhC',
    'kWh_RetourTotal', 'kWh_RetourA', 'kWh_RetourB', 'kWh_RetourC',
    'kW_Total', 'kW_PhA', 'kW_PhB', 'kW_PhC',
    'kW_RetourTotal', 'kW_RetourA', 'kW_RetourB', 'kW_RetourC',
  ],
  classifieur: [
    'Date', 'Jour', 'Mois', 'Annee', 'Heure',
    'Jour_activites', 'Saison', 'Profil', 'Nom',
    'Appareil', 'Emplacement', 'Piece',
  ],
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: 10,
  color: '#e2e8f0',
};

const TOOLTIP_LABEL_STYLE = { color: '#f8fafc', fontWeight: 600 };

const tcdFormatter = (value: number | string, name: string): [string, string] => {
  const meta = METRIQUES.find(m => m.label === name) ?? METRIQUES.find(m => m.key === name);
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  const fmtd = isFinite(n) ? fmtFr(n, 3) : String(value);
  return [meta?.unit ? `${fmtd} ${meta.unit}` : fmtd, meta?.label ?? name];
};

function SerieTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color?: string; payload: Record<string, unknown> }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { appareil: string; emplacement: string; piece: string; isWeekend: boolean; isFerie: boolean };
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 space-y-1 text-xs min-w-[200px]">
      <p style={TOOLTIP_LABEL_STYLE} className="text-sm">{label}</p>
      {payload.map((p, i) => {
        const metaMatch = METRIQUES.find(m => p.name?.includes(m.label)) ?? METRIQUES.find(m => m.key === p.name);
        return (
          <p key={i} className="text-slate-300 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1">{p.name}</span>
            <span className="text-white font-semibold ml-auto">
              {typeof p.value === 'number' ? fmtFr(p.value, 3) : p.value}
              {metaMatch?.unit && <span className="text-slate-400 font-normal ml-1">{metaMatch.unit}</span>}
            </span>
          </p>
        );
      })}
      {d.appareil && <p className="text-slate-400 pt-1 border-t border-white/10">Appareil : <span className="text-cyan-300">{d.appareil}</span></p>}
      {d.emplacement && <p className="text-slate-400">Site : <span className="text-yellow-300">{d.emplacement}</span></p>}
      {d.piece && <p className="text-slate-400">Pièce : <span className="text-purple-300">{d.piece}</span></p>}
      {(d.isWeekend || d.isFerie) && (
        <p className="text-orange-400 font-medium">{d.isFerie ? 'Jour férié' : 'Week-end'}</p>
      )}
    </div>
  );
}

function formatAxisMetric(key: MetricKey): string {
  const m = METRIQUES.find(m => m.key === key);
  return m ? `${m.label} (${m.unit})` : key;
}

function reviveStoredShellyRows(rows: Record<string, unknown>[]): ShellyRow[] {
  return rows.map((row) => ({
    ...row,
    date: toDate(row.date),
  })) as ShellyRow[];
}

// ---- Utilitaires ----
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : fallback;
}

// Format français : remplace le . décimal par une virgule (ex: 13.455 → 13,455)
function fmtFr(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

function fmt3(v: unknown): string {
  return fmtFr(safeNum(v, 0), 3);
}

function fmt2(v: unknown): string {
  return fmtFr(safeNum(v, 0), 2);
}

function fmt1(v: unknown): string {
  return fmtFr(safeNum(v, 0), 1);
}

function fmt0(v: unknown): string {
  return fmtFr(safeNum(v, 0), 0);
}

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

function genericToShellyRow(
  raw: Record<string, unknown>,
  dateCol: string,
  valueCol: string,
  joursFerier: { date: Date; actif: boolean }[],
): ShellyRow | null {
  const remapped: Record<string, unknown> = {
    ...raw,
    Temps: raw[dateCol],
    'Wh_Total': typeof raw[valueCol] === 'number' ? (raw[valueCol] as number) * 1000 : 0,
  };
  return parseShellyRow(remapped, joursFerier as import('@/components/iot/shared').JourFerie[]);
}

// ============================================================
// PANNEAU : Sélecteur de profil Mi
// ============================================================
function ProfilMiSelector({
  selected,
  onChange,
  sources,
}: {
  selected: ProfilMi | 'tous';
  onChange: (p: ProfilMi | 'tous') => void;
  sources: import('./shared').Source[];
}) {
  // Sources par profil Mi (pour afficher quelles sources correspondent)
  const sourcesByProfil: Partial<Record<ProfilMi, import('./shared').Source[]>> = {};
  for (const s of sources) {
    if (!s.actif) continue;
    if (s.profilMi) {
      if (!sourcesByProfil[s.profilMi]) sourcesByProfil[s.profilMi] = [];
      sourcesByProfil[s.profilMi]!.push(s);
    }
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="h-4 w-4 text-blue-400" />
        <h4 className="text-white font-medium text-sm">Profil d'analyse (Mi)</h4>
        <span className="text-slate-500 text-xs ml-1">— lié aux sources configurées</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Tous les profils */}
        <button
          onClick={() => onChange('tous')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
            ${selected === 'tous'
              ? 'bg-slate-600 text-white border-slate-500'
              : 'text-slate-400 border-white/15 hover:bg-white/5 hover:text-white'}`}
        >
          Tous
        </button>
        {/* Profils Mi */}
        {PROFILS_MI.map(p => {
          const isActive = selected === p;
          const nbSources = sourcesByProfil[p]?.length ?? 0;
          const color = PROFIL_MI_COLORS[p];
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                ${isActive ? 'text-white' : 'text-slate-400 border-white/15 hover:bg-white/5 hover:text-white'}`}
              style={isActive
                ? { backgroundColor: color + '30', borderColor: color + '60', color }
                : {}}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {p.split('_')[0]}
              <span className="hidden md:inline text-slate-500 font-normal">
                &nbsp;— {PROFIL_MI_LABELS[p].split('—')[1]?.trim()}
              </span>
              {nbSources > 0 && (
                <Badge
                  className="text-xs border-0 ml-1 h-4 px-1"
                  style={{ backgroundColor: color + '30', color }}
                >
                  {nbSources}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
      {/* Sources du profil sélectionné */}
      {selected !== 'tous' && sourcesByProfil[selected] && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sourcesByProfil[selected]!.map(s => (
            <Badge key={s.id} className="text-xs bg-white/10 text-slate-300 border-0">
              <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: s.couleur }} />
              {s.nom} · {s.capteur}
            </Badge>
          ))}
        </div>
      )}
      {selected !== 'tous' && !sourcesByProfil[selected] && (
        <p className="text-slate-600 text-xs mt-2">Aucune source n'est configurée pour ce profil</p>
      )}
    </div>
  );
}

// ── Familles d'appareils connues (schema.sql SHELLY_GCP_00) ────
const DEVICE_FAMILY_OPTIONS = [
  { value: '', label: 'Toutes les familles' },
  { value: 'ENERGIE_3PH', label: 'ENERGIE_3PH — Shelly 3EM / Pro 3EM' },
  { value: 'ENERGIE_2PH', label: 'ENERGIE_2PH — Shelly 2EM / Pro 2EM' },
  { value: 'ENERGIE_1PH', label: 'ENERGIE_1PH — Shelly EM / PM / Plug' },
  { value: 'LUMIERE', label: 'LUMIERE — Dimmer / Bulb' },
  { value: 'CAPTEUR_ENV', label: 'CAPTEUR_ENV — H&T / Gas / CO₂' },
  { value: 'ETAT', label: 'ETAT — Relais / Prise / Contact' },
];

// ============================================================
// PANNEAU : Export Supabase
// ============================================================
function SupabaseExportPanel({
  profilMi,
  sources,
  onDataLoaded,
}: {
  profilMi: ProfilMi | 'tous';
  sources: import('./shared').Source[];
  onDataLoaded: (rows: Record<string, unknown>[], colonnes: string[]) => void;
}) {
  // ── Dates par défaut : 7 derniers jours ──────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [open, setOpen] = useState(true);
  const [showColumnsForm, setShowColumnsForm] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<'entree' | 'calcule' | 'classifieur', boolean>>({
    entree: false,
    calcule: false,
    classifieur: false,
  });
  const [selectedCols, setSelectedCols] = useState<Set<string>>(() =>
    new Set(DEFAULT_SUPABASE_COLUMNS)
  );

  // Granularité des données
  const [granularite, setGranularite] = useState<'horaire' | 'minute'>('horaire');

  // Filtres — site vide = tous les sites
  const [site, setSite] = useState('');
  const [deviceFamily, setDeviceFamily] = useState('ENERGIE_3PH');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [dateDebut, setDateDebut] = useState(sevenDaysAgoStr);
  const [dateFin, setDateFin] = useState(todayStr);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  // ── Données dynamiques depuis Supabase ───────────────────────
  const [disponibles, setDisponibles] = useState<{
    sites: string[];
    devices: { name: string; device_id: string; device_family: string; site: string }[];
    deviceFamilies?: string[];
  }>({ sites: [], devices: [] });
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    setLoadingMeta(true);
    fetchDisponibles().then(d => {
      setDisponibles(d);
      setLoadingMeta(false);
    });
  }, []);

  const siteDeviceCounts = disponibles.devices.reduce<Record<string, number>>((acc, d) => {
    const key = d.site || 'Sans site';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Appareils filtrés par site + famille + recherche
  const devicesFiltres = disponibles.devices.filter(d =>
    (!site || d.site === site) &&
    (!deviceFamily || d.device_family === deviceFamily) &&
    (!deviceSearch || d.name.toLowerCase().includes(deviceSearch.toLowerCase()))
  );

  const devicesBySite = devicesFiltres.reduce<Record<string, typeof devicesFiltres>>((acc, d) => {
    const key = d.site || 'Sans site';
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});


  // Sources liées au profil Mi sélectionné (pour affichage / suggestion auto)
  const linkedSources = sources.filter(s =>
    profilMi !== 'tous' ? (s.profilMi === profilMi && s.actif) : false
  );

  const groupes = getColonnesParGroupe();
  const GROUPE_LABELS = { entree: "Données d'entrée", calcule: 'Données calculées', classifieur: 'Classifieurs' };

  useEffect(() => {
    const availableIds = new Set(devicesFiltres.map(d => d.device_id));
    setSelectedDeviceIds(prev => prev.filter(id => availableIds.has(id)));
  }, [site, deviceFamily, deviceSearch, disponibles.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCol = (key: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectGroupe = (keys: string[], select: boolean) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      keys.forEach(k => select ? next.add(k) : next.delete(k));
      return next;
    });
  };

  const handleFetch = async () => {
    setLoading(true);
    setErreur(null);
    const colonnes = Array.from(selectedCols);
    const result = await exporterDonneesSupabase({
      colonnes,
      granularite,
      site: site.trim() || undefined,
      deviceFamily: deviceFamily || undefined,
      deviceIds: selectedDeviceIds.length > 0 ? selectedDeviceIds : undefined,
      dateDebut: dateDebut || undefined,
      dateFin: dateFin || undefined,
      limit,
    });
    setLoading(false);
    if (result.erreur) {
      setErreur(result.erreur);
    } else {
      setResultCount(result.total);
      onDataLoaded(result.rows, colonnes);
    }
  };

  const resetToDefaultColumns = () => setSelectedCols(new Set(DEFAULT_SUPABASE_COLUMNS));
  const toggleExpandedGroup = (group: 'entree' | 'calcule' | 'classifieur') =>
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  const toggleDeviceId = (deviceId: string) =>
    setSelectedDeviceIds(prev => prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-green-400" />
          <span className="text-white font-medium text-sm">Charger depuis Supabase</span>
          {resultCount !== null && (
            <Badge className="bg-green-500/20 text-green-400 border-0 text-xs ml-2">
              {resultCount.toLocaleString('fr-FR')} ligne(s)
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>


      {open && (
        <div className="border-t border-white/10 p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div className="space-y-4">
              {/* Suggestion depuis profil Mi */}
              {profilMi !== 'tous' && linkedSources.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                  <span className="text-blue-300 text-xs font-medium">Sources liées à {profilMi} :</span>
                  {linkedSources.map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const linked = (s.linkedSourceIds ?? [])
                          .map(id => sources.find(x => x.id === id))
                          .filter((x): x is import('./shared').Source => Boolean(x))
                          .filter(x => x.actif);

                        // Source groupée : PV+ -> (PV+, PV1, PV2...) | SENELEC+ -> (SENELEC, SENELEC1, ...)
                        const expandedNameSet = new Set([s, ...linked].map(x => x.nom).filter(Boolean));

                        const matches = disponibles.devices
                          .filter(d => (!site || d.site === site) && expandedNameSet.has(d.name))
                          .map(d => d.device_id);
                        if (matches.length > 0) {
                          setSelectedDeviceIds(prev => Array.from(new Set([...prev, ...matches])));
                        } else {
                          setDeviceSearch(s.nom || [...expandedNameSet][0] || '');
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30"
                      title={`Filtrer par nom : ${s.nom}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.couleur }} />
                      {s.nom}
                    </button>
                  ))}
                  <span className="text-slate-500 text-xs">Cliquez pour pré-remplir l'appareil</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="md:col-span-2 xl:col-span-1">
                  <Label className="text-slate-400 text-xs mb-1 block">Granularité</Label>
                  <div className="flex items-center gap-2">
                    {(['horaire', 'minute'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGranularite(g)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                          ${granularite === g
                            ? 'bg-green-600/30 text-green-300 border-green-500/50'
                            : 'text-slate-400 border-white/15 hover:text-white hover:bg-white/5'}`}
                      >
                        {g === 'horaire' ? 'Horaire' : 'Minute'}
                      </button>
                    ))}
                  </div>
                  <p className="text-slate-500 text-[11px] mt-1">
                    {granularite === 'horaire' ? 'Recommandé pour l’analyse' : 'Plus lourd, données brutes'}
                  </p>
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">
                    Site
                    {loadingMeta && <RefreshCw className="inline h-3 w-3 ml-1 animate-spin text-slate-500" />}
                  </Label>
                  <select
                    value={site}
                    onChange={e => { setSite(e.target.value); setSelectedDeviceIds([]); }}
                    className="w-full h-9 bg-white/5 border border-white/20 text-white text-xs rounded-md px-2"
                  >
                    <option value="" className="bg-[#1a1d2e]">Tous les sites</option>
                    {disponibles.sites.map(s => (
                      <option key={s} value={s} className="bg-[#1a1d2e]">
                        {s} ({siteDeviceCounts[s] ?? 0} appareils)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Famille d'appareil</Label>
                  <select
                    value={deviceFamily}
                    onChange={e => setDeviceFamily(e.target.value)}
                    className="w-full h-9 bg-white/5 border border-white/20 text-white text-xs rounded-md px-2"
                  >
                    {DEVICE_FAMILY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value} className="bg-[#1a1d2e]">{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 xl:col-span-3">
                  <Label className="text-slate-400 text-xs mb-1 block">
                    Appareils
                    <span className="text-slate-500 ml-1">
                      ({devicesFiltres.length} disponible{devicesFiltres.length > 1 ? 's' : ''} / {disponibles.devices.length} au total)
                    </span>
                  </Label>
                  <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-3">
                    <Input
                      value={deviceSearch}
                      onChange={e => setDeviceSearch(e.target.value)}
                      placeholder={loadingMeta ? 'Chargement…' : 'Rechercher un appareil...'}
                      className="h-9 text-xs bg-white/5 border-white/20 text-white"
                    />
                    {selectedDeviceIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDeviceIds.map(id => {
                          const device = disponibles.devices.find(d => d.device_id === id);
                          if (!device) return null;
                          return (
                            <Badge key={id} className="bg-blue-600/20 text-blue-300 border-0 text-xs">
                              {device.name}
                              <button className="ml-1 text-blue-200" onClick={() => toggleDeviceId(id)}>x</button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <div className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-[#0f111a]/40">
                      {Object.entries(devicesBySite).length > 0 ? (
                        Object.entries(devicesBySite).map(([siteName, devs]) => (
                          <div key={siteName} className="border-b border-white/5 last:border-b-0">
                            <div className="px-3 py-2 text-xs font-medium text-slate-300 bg-white/5">
                              {siteName} ({devs.length} appareil{devs.length > 1 ? 's' : ''})
                            </div>
                            <div className="p-2 space-y-1">
                              {devs.map(d => {
                                const checked = selectedDeviceIds.includes(d.device_id);
                                return (
                                  <label key={d.device_id} className="flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-300 hover:bg-white/5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDeviceId(d.device_id)}
                                      className="accent-blue-500"
                                    />
                                    <span className="flex-1 min-w-0 truncate">{d.name}</span>
                                    <span className="text-slate-500">{d.device_family}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-xs text-slate-500">Aucun appareil trouvé pour ce filtre.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Date début</Label>
                  <Input
                    type="date"
                    value={dateDebut}
                    onChange={e => setDateDebut(e.target.value)}
                    className="h-9 text-xs bg-white/5 border-white/20 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Date fin</Label>
                  <Input
                    type="date"
                    value={dateFin}
                    onChange={e => setDateFin(e.target.value)}
                    className="h-9 text-xs bg-white/5 border-white/20 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Limite</Label>
                  <select
                    value={limit ?? ''}
                    onChange={e => setLimit(e.target.value === '' ? undefined : parseInt(e.target.value))}
                    className="w-full h-9 bg-white/5 border border-white/20 text-white text-xs rounded-md px-2"
                  >
                    <option value="" className="bg-[#1a1d2e]">Illimité</option>
                    {[1000, 5000, 10000, 25000, 50000].map(n => (
                      <option key={n} value={n} className="bg-[#1a1d2e]">{n.toLocaleString('fr-FR')} lignes</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white/3 rounded-xl border border-white/10 p-4 space-y-3">
              <div>
                <p className="text-white text-sm font-medium">Colonnes à charger</p>
                <p className="text-slate-500 text-xs mt-1">
                  Les colonnes habituelles sont sélectionnées par défaut.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-600/20 text-blue-300 border-0 text-xs">
                  {selectedCols.size} colonne(s)
                </Badge>
                <Badge className="bg-white/10 text-slate-300 border-0 text-xs">
                  Preset habituel
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/20 text-white hover:bg-white/10"
                  onClick={() => setShowColumnsForm(v => !v)}
                >
                  {showColumnsForm ? 'Masquer la personnalisation' : 'Personnaliser les colonnes'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-slate-400 hover:text-white hover:bg-white/10"
                  onClick={resetToDefaultColumns}
                >
                  Colonnes habituelles
                </Button>
              </div>

              <p className="text-slate-500 text-xs">
                {site && <span>Site : <span className="text-slate-300">{site}</span> · </span>}
                {deviceFamily && <span>Famille : <span className="text-slate-300">{deviceFamily}</span> · </span>}
                {selectedDeviceIds.length > 0 && <span>Appareils : <span className="text-slate-300">{selectedDeviceIds.length}</span></span>}
                {!site && !deviceFamily && selectedDeviceIds.length === 0 && <span>Aucun filtre spécifique appliqué</span>}
              </p>

              <Button
                className="w-full bg-green-600 hover:bg-green-500 text-white"
                onClick={handleFetch}
                disabled={loading || selectedCols.size === 0}
              >
                {loading
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Chargement...</>
                  : <><Database className="h-4 w-4 mr-2" /> Charger dans TCD</>}
              </Button>
            </div>
          </div>

          {showColumnsForm && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide">
                  Personnalisation des colonnes ({selectedCols.size} / {COLONNES_PROFIL_SHELLY.length})
                </p>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300"
                    onClick={resetToDefaultColumns}
                  >
                    Habituel
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => setSelectedCols(new Set(COLONNES_PROFIL_SHELLY.map(c => c.key)))}
                  >
                    Tout
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={() => setSelectedCols(new Set())}
                  >
                    Aucun
                  </button>
                </div>
              </div>

              {(['entree', 'calcule', 'classifieur'] as const).map(groupe => {
                const cols = groupes[groupe];
                const keys = cols.map(c => c.key);
                const nbSelected = keys.filter(k => selectedCols.has(k)).length;
                const allSelected = nbSelected === keys.length;
                const defaultKeys = DEFAULT_COLUMN_GROUPS[groupe];
                const extraCols = cols.filter(col => !defaultKeys.includes(col.key as never));
                return (
                  <div key={groupe} className="bg-white/3 rounded-lg border border-white/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 text-xs font-medium">{GROUPE_LABELS[groupe]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">{nbSelected}/{keys.length}</span>
                        <button
                          className="text-xs text-slate-400 hover:text-white"
                          onClick={() => selectGroupe(keys, !allSelected)}
                        >
                          {allSelected ? 'Tout décocher' : 'Tout cocher'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {cols.filter(col => defaultKeys.includes(col.key as never)).map(col => {
                        const isSelected = selectedCols.has(col.key);
                        return (
                          <button
                            key={col.key}
                            onClick={() => toggleCol(col.key)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all border
                              ${isSelected
                                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                : 'text-slate-500 border-white/10 hover:text-slate-300 hover:border-white/20'}`}
                          >
                            {isSelected
                              ? <CheckSquare className="h-3 w-3 shrink-0" />
                              : <Square className="h-3 w-3 shrink-0" />}
                            {col.label}
                            {col.unite && <span className="text-slate-600 text-[10px]">({col.unite})</span>}
                          </button>
                        );
                      })}
                    </div>

                    {extraCols.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <button
                          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
                          onClick={() => toggleExpandedGroup(groupe)}
                        >
                          {expandedGroups[groupe] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {expandedGroups[groupe] ? 'Masquer les autres colonnes' : 'Afficher les autres colonnes'}
                        </button>
                        {expandedGroups[groupe] && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {extraCols.map(col => {
                              const isSelected = selectedCols.has(col.key);
                              return (
                                <button
                                  key={col.key}
                                  onClick={() => toggleCol(col.key)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all border
                                    ${isSelected
                                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                      : 'text-slate-500 border-white/10 hover:text-slate-300 hover:border-white/20'}`}
                                >
                                  {isSelected
                                    ? <CheckSquare className="h-3 w-3 shrink-0" />
                                    : <Square className="h-3 w-3 shrink-0" />}
                                  {col.label}
                                  {col.unite && <span className="text-slate-600 text-[10px]">({col.unite})</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {erreur && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {erreur}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export function AnalyseTab() {
  const { state, setActiveTab, setShellyRows } = useIOT();
  const { shellyRows, joursFerier, sources, files, selectedFileId } = state;

  // ---- Profil Mi actif ----
  const [profilMiActif, setProfilMiActif] = useState<ProfilMi | 'tous'>('tous');

  // ---- Ref graphiques + export PDF ----
  const chartRef = useRef<HTMLDivElement>(null);
  const [exportingPDF, setExportingPDF] = useState(false);

  const exportPDF = useCallback(async () => {
    if (!chartRef.current) return;
    setExportingPDF(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0f111a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 80);
      doc.text(`IOT — Analyse · ${new Date().toLocaleDateString('fr-FR')}`, 14, 10);
      const imgH = (canvas.height / canvas.width) * (pageW - 20);
      const maxH = pageH - 20;
      doc.addImage(imgData, 'PNG', 10, 16, pageW - 20, Math.min(imgH, maxH));
      doc.save(`iot_analyse_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportingPDF(false);
    }
  }, []);

  // ---- Import fichier ----
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

  // ---- Données Supabase chargées ----
  const [supabaseRows, setSupabaseRows] = useState<ShellyRow[]>([]);
  const [supabaseFileName, setSupabaseFileName] = useState<string>('');

  // ---- Panneau qualité : visible seulement si des anomalies existent ----
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  // true quand les données viennent de la bibliothèque (fichier déjà nettoyé) — pas de rapport qualité
  const [dataFromLibrary, setDataFromLibrary] = useState(false);

  // Source active: supabase > local > contexte
  const activeRows = supabaseRows.length > 0 ? supabaseRows
    : localRows.length > 0 ? localRows : shellyRows;
  const dataSource = supabaseRows.length > 0 ? `Supabase (${supabaseFileName})`
    : localRows.length > 0 ? fileName
      : shellyRows.length > 0 ? 'Données importées (contexte)' : null;

  // ---- Analyse ----
  const [mode, setMode] = useState<AnalyseMode>('courbe');
  const [serieMetrics, setSerieMetrics] = useState<Set<MetricKey>>(new Set(['kwhTotal']));
  const toggleSerieMetric = (k: MetricKey) =>
    setSerieMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  // Métrique principale (pour stats + ligne moyenne) : la première sélectionnée
  const primarySerieMetric = useMemo<MetricKey>(() => {
    const arr = Array.from(serieMetrics);
    return (arr[0] ?? 'kwhTotal') as MetricKey;
  }, [serieMetrics]);
  const [tcdLigne, setTcdLigne] = useState<'mois' | 'jouSemaine' | 'typeJour'>('mois');
  const [showFeries, setShowFeries] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);

  // ---- Power BI states ----
  const [fullscreenTCD, setFullscreenTCD] = useState(false);
  const [tcdMetrics, setTcdMetrics] = useState<Set<MetricKey>>(new Set(['kwhTotal', 'kwhNet']));
  const toggleTcdMetric = (k: MetricKey) =>
    setTcdMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
      return next;
    });
  const primaryTcdMetric = (Array.from(tcdMetrics)[0] ?? 'kwhTotal') as MetricKey;
  const [crossFilter, setCrossFilter] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [slicerSaison, setSlicerSaison] = useState<string[]>([]);
  const [slicerPeriode, setSlicerPeriode] = useState<string[]>([]);
  const [slicerTypeJour, setSlicerTypeJour] = useState<string[]>([]);
  const [showRawData, setShowRawData] = useState(false);
  const [rawPage, setRawPage] = useState(0);
  const [fsPage, setFsPage] = useState(0);

  // Séries masquées dans les graphiques (clic sur la légende)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const isHidden = (key: string) => hiddenSeries.has(key);

  // ============================================================
  // RAPPORT QUALITÉ (anomalies) + solutions Nettoyage
  // ============================================================

  type DataIssueType =
    | 'duplicates_day'
    | 'duplicates_exact'
    | 'zeros'
    | 'outliers'
    | 'gaps'
    | 'negatives'
    | 'phase_mismatch';

  interface DataIssue {
    id: DataIssueType;
    count: number;
    description: string;
    detail?: string;
  }

  const OUTLIER_SIGMA = 2.5;
  function analyserRowsForReport(rows: ShellyRow[]): DataIssue[] {
    const issues: DataIssue[] = [];
    if (rows.length === 0) return issues;

    // Doublons par jour
    const dateMap = new Map<string, number>();
    for (const r of rows) {
      const k = toDate(r.date).toISOString().slice(0, 10);
      dateMap.set(k, (dateMap.get(k) ?? 0) + 1);
    }
    const dupDates = [...dateMap.entries()].filter(([, c]) => c > 1);
    if (dupDates.length > 0) {
      const total = dupDates.reduce((s, [, c]) => s + c - 1, 0);
      issues.push({
        id: 'duplicates_day',
        count: total,
        description: `${total} doublon${total > 1 ? 's' : ''} par date (jour)`,
        detail: `${dupDates.length} date${dupDates.length > 1 ? 's' : ''} concernée${dupDates.length > 1 ? 's' : ''} — ex. : ${dupDates.slice(0, 3).map(([d]) => d).join(', ')}`,
      });
    }

    // Doublons exacts (timestamp)
    const dtMap = new Map<string, number>();
    for (const r of rows) {
      const k = toDate(r.date).toISOString();
      dtMap.set(k, (dtMap.get(k) ?? 0) + 1);
    }
    const dupExact = [...dtMap.values()].filter(c => c > 1).reduce((s, c) => s + c - 1, 0);
    if (dupExact > 0) {
      issues.push({
        id: 'duplicates_exact',
        count: dupExact,
        description: `${dupExact} doublon${dupExact > 1 ? 's' : ''} exacts (même date et heure)`,
      });
    }

    // Zéros (ligne vide)
    const zeros = rows.filter(r => r.kwhTotal === 0 && r.kwhNet === 0);
    if (zeros.length > 0) {
      issues.push({
        id: 'zeros',
        count: zeros.length,
        description: `${zeros.length} ligne${zeros.length > 1 ? 's' : ''} vide${zeros.length > 1 ? 's' : ''} (kWh Total et Net = 0)`,
        detail: `Première : ${toDate(zeros[0].date).toLocaleDateString('fr-FR')}`,
      });
    }

    // Outliers
    const kwhVals = rows.map(r => r.kwhNet);
    const { moyenne, ecartType } = calculerStats(kwhVals);
    const threshold = moyenne + OUTLIER_SIGMA * ecartType;
    const outliers = rows.filter(r => ecartType > 0 && r.kwhNet > threshold);
    if (outliers.length > 0) {
      issues.push({
        id: 'outliers',
        count: outliers.length,
        description: `${outliers.length} valeur${outliers.length > 1 ? 's' : ''} aberrante${outliers.length > 1 ? 's' : ''} (kWh Net > ${threshold.toFixed(1)})`,
        detail: `Seuil ≈ moy(${moyenne.toFixed(2)}) + ${OUTLIER_SIGMA}σ(${ecartType.toFixed(2)})`,
      });
    }

    // Négatifs
    const negRows = rows.filter(r => r.kwhTotal < 0 || r.kwhNet < 0);
    if (negRows.length > 0) {
      issues.push({
        id: 'negatives',
        count: negRows.length,
        description: `${negRows.length} valeur${negRows.length > 1 ? 's' : ''} négative${negRows.length > 1 ? 's' : ''} (kWh Total ou Net < 0)`,
      });
    }

    // Trous temporels (jours)
    const sortedByDate = [...rows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
    let gaps = 0;
    const gapExamples: string[] = [];
    for (let i = 1; i < sortedByDate.length; i++) {
      const prev = toDate(sortedByDate[i - 1].date);
      const cur = toDate(sortedByDate[i].date);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      if (diffDays > 1) {
        gaps += (diffDays - 1);
        if (gapExamples.length < 5) gapExamples.push(`${prev.toISOString().slice(0, 10)} → ${cur.toISOString().slice(0, 10)}`);
      }
    }
    if (gaps > 0) {
      issues.push({
        id: 'gaps',
        count: gaps,
        description: `${gaps} jour${gaps > 1 ? 's' : ''} manquant${gaps > 1 ? 's' : ''} dans la série`,
        detail: gapExamples.length ? `Ex: ${gapExamples.join(' · ')}` : undefined,
      });
    }

    // Incohérence phases vs total
    const phaseMismatch = rows.filter(r => {
      const sum = r.kwhA + r.kwhB + r.kwhC;
      return r.kwhTotal > 0 && Math.abs(sum - r.kwhTotal) > 0.05;
    });
    if (phaseMismatch.length > 0) {
      issues.push({
        id: 'phase_mismatch',
        count: phaseMismatch.length,
        description: `${phaseMismatch.length} incohérence${phaseMismatch.length > 1 ? 's' : ''} entre phases et total kWh`,
        detail: `kWhA + kWhB + kWhC ≠ kWhTotal (écart > 0.05 kWh)`,
      });
    }

    return issues;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qualityIssues = useMemo(() => analyserRowsForReport(activeRows), [activeRows]);
  const hasIssues = qualityIssues.length > 0;

  // Panneau qualité : afficher seulement pour les imports manuels avec anomalies,
  // jamais pour les fichiers chargés depuis la bibliothèque
  useEffect(() => {
    setShowQualityPanel(hasIssues && !dataFromLibrary);
  }, [hasIssues, dataFromLibrary]);

  const solutions = useMemo(() => {
    const map: Record<DataIssueType, { title: string; steps: string[]; cta?: string }> = {
      duplicates_day: {
        title: 'Doublons par jour',
        steps: [
          'Aller dans l’onglet Nettoyage.',
          'Cliquer “Procéder au Nettoyage” sur le fichier concerné.',
          'Dans la section Diagnostic, utiliser “Conserver : première occurrence” ou “dernière occurrence”.',
          'Re-scanner pour vérifier que l’anomalie a disparu.',
        ],
      },
      duplicates_exact: {
        title: 'Doublons exacts',
        steps: [
          'Onglet Nettoyage → Diagnostic.',
          'Cliquer “Supprimer les copies exactes”.',
          'Re-scanner.',
        ],
      },
      zeros: {
        title: 'Lignes vides (kWh=0)',
        steps: [
          'Onglet Nettoyage → Diagnostic → “Lignes vides”.',
          'Choisir une méthode : “Moyenne”, “Reporter précédent”, ou “Interpolation linéaire”.',
          'Re-scanner puis exporter si besoin.',
        ],
      },
      outliers: {
        title: 'Valeurs aberrantes',
        steps: [
          'Onglet Nettoyage → activer la mise en évidence “Aberrantes” pour repérer les pics.',
          'Dans Diagnostic → Outliers : soit “Supprimer les lignes”, soit “Remplacer par la moyenne”.',
          'Re-scanner.',
        ],
      },
      negatives: {
        title: 'Valeurs négatives',
        steps: [
          'Onglet Nettoyage → Diagnostic → “Valeurs négatives”.',
          'Choisir : “Mettre à zéro” ou “Valeur absolue” selon le sens métier.',
          'Re-scanner.',
        ],
      },
      gaps: {
        title: 'Jours manquants',
        steps: [
          'Onglet Nettoyage → Diagnostic → “Trous temporels”.',
          'Cliquer “Voir les dates manquantes”.',
          'Décider une stratégie métier: réimporter la période manquante, ou accepter la coupure (pas de comblement automatique).',
        ],
      },
      phase_mismatch: {
        title: 'Phases ≠ Total',
        steps: [
          'Onglet Nettoyage → Diagnostic → “Incohérence phases”.',
          'Cliquer “Recalculer kWh Total depuis les phases”.',
          'Re-scanner.',
        ],
      },
    };

    return qualityIssues.map(i => ({
      id: i.id,
      title: map[i.id].title,
      steps: map[i.id].steps,
    }));
  }, [qualityIssues]);

  const parseImportedFileToShellyRows = useCallback((file: import('./shared').ImportedFile): ShellyRow[] => {
    if (file.rawData.length === 0) return [];

    if (file.statut === 'nettoyé') {
      return reviveStoredShellyRows(file.rawData);
    }

    const detect = detecterFormatShelly(file.columns);
    if (detect.format === 'shelly_excel') {
      return file.rawData
        .map(r => parseShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'profil_mi') {
      return file.rawData
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'supabase_cl') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profilRows = transformRowsToProfilMi(file.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
      return profilRows
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'supabase_horaire') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profilRows = transformHoraireToProfilMi(file.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
      return profilRows
        .map(r => profilMiToShellyRow(r, joursFerier))
        .filter((r): r is ShellyRow => r !== null);
    }
    if (detect.format === 'shelly_section') {
      return parseShellySectionCSV(file.rawData, joursFerier);
    }
    return [];
  }, [joursFerier]);

  // ---- Callback Supabase ----
  const handleSupabaseData = useCallback((rows: Record<string, unknown>[], _colonnes: string[]) => {
    if (rows.length === 0) return;
    setDataFromLibrary(false); // import Supabase manuel → rapport qualité actif
    const parsed = rows
      .map(r => profilMiToShellyRow(r, joursFerier))
      .filter((r): r is ShellyRow => r !== null);
    if (parsed.length > 0) {
      setSupabaseRows(parsed);
      setSupabaseFileName(
        profilMiActif !== 'tous'
          ? `Supabase — ${PROFIL_MI_LABELS[profilMiActif]}`
          : 'Supabase — Tous appareils',
      );
    }
  }, [joursFerier, profilMiActif]);

  // ---- Parse fichier ----
  const parseFile = useCallback((file: File) => {
    setDataFromLibrary(false); // import manuel → rapport qualité actif
    setLoading(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
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
        const detect = detecterFormatShelly(cols);
        if (detect.format === 'shelly_excel') {
          const parsed = rows
            .map(r => parseShellyRow(r, joursFerier))
            .filter((r): r is ShellyRow => r !== null);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else if (detect.format === 'profil_mi') {
          const parsed = rows
            .map(r => profilMiToShellyRow(r, joursFerier))
            .filter((r): r is ShellyRow => r !== null);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else if (detect.format === 'supabase_cl') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const profilRows = transformRowsToProfilMi(rows as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          const parsed = profilRows
            .map(r => profilMiToShellyRow(r, joursFerier))
            .filter((r): r is ShellyRow => r !== null);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else if (detect.format === 'supabase_horaire') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const profilRows = transformHoraireToProfilMi(rows as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          const parsed = profilRows
            .map(r => profilMiToShellyRow(r, joursFerier))
            .filter((r): r is ShellyRow => r !== null);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else if (detect.format === 'shelly_section') {
          const parsed = parseShellySectionCSV(rows, joursFerier);
          setLocalRows(parsed);
          setMappingNeeded(false);
        } else {
          const dateCandidates = getDateCols(rows);
          const numCandidates = getNumericCols(rows);
          setDateCol(dateCandidates[0] ?? cols[0]);
          setValueCol(numCandidates[0] ?? cols[1]);
          setMappingNeeded(true);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [joursFerier]);

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

  const clearSupabase = () => {
    setSupabaseRows([]); setSupabaseFileName('');
  };

  const loadFromImported = useCallback((f: import('./shared').ImportedFile) => {
    if (f.rawData.length === 0) return;
    const cols = f.columns;
    setAllColumns(cols); setRawData(f.rawData); setFileName(f.name);
    const parsed = parseImportedFileToShellyRows(f);
    if (parsed.length > 0) {
      setLocalRows(parsed); setMappingNeeded(false);
      setShowImport(false); // collapse import panel → charts visible directly
    } else {
      const dateCandidates = getDateCols(f.rawData);
      const numCandidates = getNumericCols(f.rawData);
      setDateCol(dateCandidates[0] ?? cols[0]);
      setValueCol(numCandidates[0] ?? cols[1]);
      setMappingNeeded(true);
      setShowImport(true); // expand only when user must configure column mapping
    }
  }, [parseImportedFileToShellyRows]);

  useEffect(() => {
    if (!selectedFileId) return;
    const file = files.find(f => f.id === selectedFileId);
    if (!file) return;
    setDataFromLibrary(true); // données depuis la bibliothèque → pas de rapport qualité
    loadFromImported(file);
    setSupabaseRows([]);
    setSupabaseFileName('');
    setMode('tcd');
  }, [selectedFileId, files, loadFromImported]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ---- Export CSV ----
  const exportCSV = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(activeRows.map(r => ({
      Date: toDate(r.date).toLocaleDateString('fr-FR'),
      Jour: r.jourSemaine,
      'kWh Total': fmt3(r.kwhTotal),
      'kWh Net': fmt3(r.kwhNet),
      'kWh Retour': r.kwhRetourTotal.toFixed(3),
      'Phase A': fmt3(r.kwhA),
      'Phase B': fmt3(r.kwhB),
      'Phase C': fmt3(r.kwhC),
      Profil: profilMiActif !== 'tous' ? profilMiActif : 'Tous',
      Ferié: r.isJourFerie ? 'Oui' : '',
      Weekend: r.isWeekend ? 'Oui' : '',
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Données');
    XLSX.writeFile(wb, `tcd_${profilMiActif}_${fileName || 'export'}.xlsx`);
  };

  // ---- Calculs ----
  const filteredRows = useMemo(() => {
    // Exclure SEULEMENT les lignes où TOUTES les mesures énergétiques ET de puissance sont nulles
    // (sinon on filtre par erreur les flux d'injection ou de monitoring)
    let rows = activeRows.filter(r =>
      (r.kwhTotal ?? 0) > 0 ||
      (r.kwhRetourTotal ?? 0) > 0 ||
      (r.kwhA ?? 0) > 0 || (r.kwhB ?? 0) > 0 || (r.kwhC ?? 0) > 0 ||
      (r.kwhRetourA ?? 0) > 0 || (r.kwhRetourB ?? 0) > 0 || (r.kwhRetourC ?? 0) > 0 ||
      (r.puissKwTotal ?? 0) > 0
    );
    // Si le filtrage strict élimine tout, on garde tout (cas monitoring/capteurs)
    if (rows.length === 0) rows = activeRows;
    if (!showFeries) rows = rows.filter(r => !r.isJourFerie);
    if (!showWeekends) rows = rows.filter(r => !r.isWeekend);
    return rows;
  }, [activeRows, showFeries, showWeekends]);

  // Slicers Power BI (saison, tranche, type de jour)
  const slicerRows = useMemo(() => {
    let rows = filteredRows;
    if (slicerSaison.length) rows = rows.filter(r => slicerSaison.includes(r.saison ?? ''));
    if (slicerPeriode.length) rows = rows.filter(r => slicerPeriode.includes(r.trancheTarification));
    if (slicerTypeJour.length) {
      rows = rows.filter(r => {
        const t = r.isJourFerie ? 'Jours fériés'
          : r.jourSemaine === 'Sam' ? 'Samedis'
            : r.jourSemaine === 'Dim' ? 'Dimanches'
              : 'Jours ouvrés';
        return slicerTypeJour.includes(t);
      });
    }
    return rows;
  }, [filteredRows, slicerSaison, slicerPeriode, slicerTypeJour]);

  // Cross-filter : lignes correspondant au label sélectionné
  const crossFilteredRows = useMemo(() => {
    if (!crossFilter) return slicerRows;
    if (tcdLigne === 'mois') {
      return slicerRows.filter(r => {
        const key = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        return key === crossFilter;
      });
    }
    if (tcdLigne === 'jouSemaine') return slicerRows.filter(r => r.jourSemaine === crossFilter);
    const typeMap: Record<string, (r: ShellyRow) => boolean> = {
      'Jours ouvrés': r => !r.isWeekend && !r.isJourFerie,
      'Samedis': r => toDate(r.date).getDay() === 6,
      'Dimanches': r => toDate(r.date).getDay() === 0,
      'Jours fériés': r => r.isJourFerie,
    };
    return typeMap[crossFilter] ? slicerRows.filter(typeMap[crossFilter]) : slicerRows;
  }, [slicerRows, crossFilter, tcdLigne]);

  const stats = useMemo(() => {
    const vals = filteredRows
      .map(r => safeNum((r as unknown as Record<string, unknown>)[primarySerieMetric] as number, NaN))
      .filter(v => typeof v === 'number' && isFinite(v));
    return calculerStats(vals);
  }, [filteredRows, primarySerieMetric]);

  const serieData = useMemo(() =>
    filteredRows.map(r => {
      const obj: Record<string, unknown> = {
        date: toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        consommation: +r.kwhTotal.toFixed(3),
        isWeekend: r.isWeekend,
        isFerie: r.isJourFerie,
        appareil: r.nomAppareil ?? '',
        emplacement: r.deviceLocation ?? '',
        piece: r.deviceRoom ?? '',
      };
      // Toutes les métriques disponibles dans la même ligne (pour multi-séries)
      for (const m of METRIQUES) {
        obj[m.key] = +(((r as unknown as Record<string, unknown>)[m.key] as number) ?? 0).toFixed(2);
      }
      return obj;
    }), [filteredRows]);

  // Sélecteur de type de graphique
  type ChartType = 'bar' | 'line' | 'area' | 'pie_like';
  const [chartType, setChartType] = useState<ChartType>('bar');

  const getVal = (r: ShellyRow): number => (r[primaryTcdMetric] as number) ?? 0;

  const buildTcdGroup = (rows: ShellyRow[], key: string) => {
    const vals = rows.map(getVal);
    const perMetric: Record<string, number> = {};
    for (const mk of tcdMetrics) {
      const mvs = rows.map(r => (r[mk] as number) ?? 0);
      perMetric[mk] = +mvs.reduce((s, v) => s + v, 0).toFixed(2);
    }
    return {
      label: key,
      ...perMetric,
      total: +vals.reduce((s, v) => s + v, 0).toFixed(2),
      moyenne: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : 0,
      max: vals.length ? +vals.reduce((a, v) => Math.max(a, v), -Infinity).toFixed(2) : 0,
      min: vals.length ? +vals.reduce((a, v) => Math.min(a, v), Infinity).toFixed(2) : 0,
      n: vals.length,
    };
  };

  const tcdData = useMemo(() => {
    const src = slicerRows;
    if (src.length === 0) return [];

    // Drill-down : si un mois est sélectionné, afficher les jours de ce mois
    if (drillMonth) {
      const byDay: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        const mKey = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        if (mKey !== drillMonth) continue;
        const dKey = toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        if (!byDay[dKey]) byDay[dKey] = [];
        byDay[dKey].push(r);
      }
      return Object.entries(byDay).map(([label, rows]) => buildTcdGroup(rows, label));
    }

    if (tcdLigne === 'mois') {
      const byMois: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        const key = `${MOIS_FR[toDate(r.date).getMonth()]} ${toDate(r.date).getFullYear()}`;
        if (!byMois[key]) byMois[key] = [];
        byMois[key].push(r);
      }
      return Object.entries(byMois).map(([label, rows]) => buildTcdGroup(rows, label));
    }
    if (tcdLigne === 'jouSemaine') {
      const byJour: Record<string, ShellyRow[]> = {};
      for (const r of src) {
        if (!byJour[r.jourSemaine]) byJour[r.jourSemaine] = [];
        byJour[r.jourSemaine].push(r);
      }
      return JOURS_SEMAINE.map(jour => buildTcdGroup(byJour[jour] ?? [], jour));
    }
    const types = [
      { key: 'Jours ouvrés', rows: src.filter(r => !r.isWeekend && !r.isJourFerie) },
      { key: 'Samedis', rows: src.filter(r => toDate(r.date).getDay() === 6) },
      { key: 'Dimanches', rows: src.filter(r => toDate(r.date).getDay() === 0) },
      { key: 'Jours fériés', rows: src.filter(r => r.isJourFerie) },
    ];
    return types.map(({ key, rows }) => buildTcdGroup(rows, key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slicerRows, tcdLigne, tcdMetrics, drillMonth]);

  // Stacked data phases A/B/C par mois
  // Série temporelle par phase (granularité = jour) — style Shelly Cloud
  const stackedData = useMemo(() => {
    const byDate = new Map<string, { d: Date; a: number; b: number; c: number }>();
    for (const r of slicerRows) {
      const d = toDate(r.date);
      const key = d.toISOString().slice(0, 10);
      const cur = byDate.get(key) ?? { d, a: 0, b: 0, c: 0 };
      cur.a += r.kwhA ?? 0;
      cur.b += r.kwhB ?? 0;
      cur.c += r.kwhC ?? 0;
      byDate.set(key, cur);
    }
    return Array.from(byDate.values())
      .sort((x, y) => x.d.getTime() - y.d.getTime())
      .map(({ d, a, b, c }) => ({
        label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        'Phase A': +a.toFixed(2),
        'Phase B': +b.toFixed(2),
        'Phase C': +c.toFixed(2),
        'Total':   +(a + b + c).toFixed(2),
      }));
  }, [slicerRows]);

  const profilSemaineData = useMemo(() =>
    JOURS_SEMAINE.map((jour, idx) => {
      const rows = filteredRows.filter(r => toDate(r.date).getDay() === idx);
      return {
        jour,
        kwhMoyen: rows.length ? +(rows.reduce((s, r) => s + r.kwhNet, 0) / rows.length).toFixed(2) : 0,
        n: rows.length,
      };
    }), [filteredRows]);

  const distributionData = useMemo(() => {
    if (filteredRows.length < 2) return [];
    const vals = filteredRows
      .map(r => r.kwhNet)
      .filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length < 2) return [];
    const dmin = vals.reduce((a, v) => Math.min(a, v), Infinity), dmax = vals.reduce((a, v) => Math.max(a, v), -Infinity);
    const step = (dmax - dmin) / 10;
    if (!isFinite(step) || step <= 0) return [];
    const classes = Array.from({ length: 10 }, (_, i) => ({
      label: `${(dmin + i * step).toFixed(0)}–${(dmin + (i + 1) * step).toFixed(0)}`,
      count: 0, min: dmin + i * step, max: dmin + (i + 1) * step,
    }));
    for (const v of vals) {
      const rawIdx = Math.floor((v - dmin) / step);
      if (!isFinite(rawIdx)) continue;
      const idx = Math.max(0, Math.min(rawIdx, 9));
      const bucket = classes[idx];
      if (bucket) bucket.count++;
    }
    return classes;
  }, [filteredRows]);

  const correlationData = useMemo(() =>
    filteredRows.map(r => ({ x: toDate(r.date).getDay(), y: +fmt2(r.kwhNet) })),
    [filteredRows]);

  // ---- Couleur du profil actif ----
  const profilColor = profilMiActif !== 'tous' ? PROFIL_MI_COLORS[profilMiActif] : '#3b82f6';

  // ============================================================
  return (
    <>
      <div className="space-y-4">

        {/* ---- Sélecteur de profil Mi ---- */}
        <ProfilMiSelector
          selected={profilMiActif}
          onChange={setProfilMiActif}
          sources={sources}
        />

        {/* ---- Export Supabase ---- */}
        <SupabaseExportPanel
          profilMi={profilMiActif}
          sources={sources}
          onDataLoaded={handleSupabaseData}
        />

        {/* ---- Rapport qualité + solutions ---- */}
        {activeRows.length > 0 && showQualityPanel && (
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className={`flex items-center justify-between px-4 py-3 ${hasIssues ? 'bg-amber-500/10 border-b border-amber-500/20' : 'bg-green-500/10 border-b border-green-500/20'}`}>
              <div className="flex items-center gap-2">
                {hasIssues ? <Filter className="h-4 w-4 text-amber-400" /> : <CheckSquare className="h-4 w-4 text-green-400" />}
                <span className={`text-sm font-semibold ${hasIssues ? 'text-amber-300' : 'text-green-300'}`}>
                  Rapport qualité des données
                </span>
                <span className="text-slate-500 text-xs">
                  · {activeRows.length.toLocaleString('fr-FR')} lignes
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
                  onClick={() => {
                    if (activeRows.length > 0) setShellyRows(activeRows);
                    setShowQualityPanel(false);
                    setActiveTab('nettoyage');
                  }}>
                  Aller au Nettoyage
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-slate-400 hover:text-white hover:bg-white/10"
                  onClick={() => {
                    setLocalRows([]);
                    setRawData([]);
                    setAllColumns([]);
                    setFileName('');
                    setMappingNeeded(false);
                    setSupabaseRows([]);
                    setSupabaseFileName('');
                    setShowQualityPanel(false);
                  }}>
                  Annuler
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {!hasIssues ? (
                <p className="text-slate-400 text-sm">
                  Aucune anomalie majeure détectée. Tu peux quand même passer par `Nettoyage` pour filtrer/éditer/exporter.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {qualityIssues.map(iss => (
                      <Badge key={iss.id} className="bg-amber-500/15 text-amber-300 border border-amber-500/20 text-xs">
                        {iss.description}
                      </Badge>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-blue-400" />
                        <span className="text-white text-sm font-semibold">Solutions détaillées</span>
                      </div>
                      <span className="text-slate-500 text-xs">Actions à exécuter dans l’onglet Nettoyage</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {solutions.map(sol => {
                        const issue = qualityIssues.find(i => i.id === sol.id);
                        return (
                          <div key={sol.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-sm font-medium">{sol.title}</span>
                                  {issue && (
                                    <Badge className="bg-white/10 text-slate-300 border-0 text-[10px]">
                                      {issue.count}
                                    </Badge>
                                  )}
                                </div>
                                {issue?.detail && <p className="text-slate-500 text-xs mt-1">{issue.detail}</p>}
                              </div>
                            </div>
                            <ol className="mt-3 ml-5 list-decimal space-y-1 text-slate-300 text-xs">
                              {sol.steps.map((s, idx) => (
                                <li key={idx} className="leading-relaxed">{s}</li>
                              ))}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---- Import fichier local ---- */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            onClick={() => setShowImport(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-400" />
              <span className="text-white font-medium text-sm">Importer un fichier local (CSV / XLSX)</span>
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
              {/* Données Supabase actives */}
              {supabaseRows.length > 0 && (
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  <Database className="h-5 w-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{supabaseFileName}</p>
                    <p className="text-slate-400 text-xs">{supabaseRows.length} lignes chargées depuis Supabase</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={clearSupabase}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

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
                        ${isActive ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:bg-white/5'}`}
                      >
                        <FileSpreadsheet className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{f.name}</p>
                          <p className="text-slate-500 text-xs">{f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} col.</p>
                        </div>
                        {isActive
                          ? <Badge className="bg-blue-600/30 text-blue-300 border-0 text-xs">Actif</Badge>
                          : <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30" onClick={() => loadFromImported(f)}>Charger</Button>
                        }
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
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
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
                  <p className="text-yellow-400 text-sm font-medium">Format non reconnu — sélectionnez les colonnes</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-400 text-xs mb-1 block">Colonne date / temps</Label>
                      <Select value={dateCol} onValueChange={setDateCol}>
                        <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          {allColumns.map(c => <SelectItem key={c} value={c} className="text-white text-sm">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-400 text-xs mb-1 block">Colonne valeur (kWh / W)</Label>
                      <Select value={valueCol} onValueChange={setValueCol}>
                        <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          {getNumericCols(rawData).map(c => <SelectItem key={c} value={c} className="text-white text-sm">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10 max-h-40">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>{allColumns.slice(0, 6).map(c => (
                          <th key={c} className={`px-3 py-2 text-left font-medium whitespace-nowrap
                          ${c === dateCol ? 'text-blue-400' : c === valueCol ? 'text-green-400' : 'text-slate-400'}`}>{c}</th>
                        ))}</tr>
                      </thead>
                      <tbody>{rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          {allColumns.slice(0, 6).map(c => (
                            <td key={c} className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{String(row[c] ?? '')}</td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={applyMapping} disabled={!dateCol || !valueCol}>
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
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={clearLocal}>
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
              Chargez depuis <strong className="text-green-400">Supabase</strong>, importez un fichier, ou utilisez l'onglet <strong className="text-slate-400">Upload</strong>
            </p>
          </div>
        )}

        {activeRows.length > 0 && (
          <>
            {/* Barre mode + filtres */}
            <div className="flex flex-wrap items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-3">
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: 'courbe', icon: <Zap className="h-3.5 w-3.5" />, label: 'Courbe de charge' },
                  { key: 'serie', icon: <Activity className="h-3.5 w-3.5" />, label: 'Série temp.' },
                  { key: 'tcd', icon: <BarChart2 className="h-3.5 w-3.5" />, label: 'TCD' },
                  { key: 'profil_semaine', icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Semaine' },
                  { key: 'distribution', icon: <Filter className="h-3.5 w-3.5" />, label: 'Distribution' },
                  { key: 'correlation', icon: <Activity className="h-3.5 w-3.5" />, label: 'Corrélation' },
                ].map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setMode(key as AnalyseMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${mode === key ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    style={mode === key ? { backgroundColor: profilColor + '40', color: profilColor } : {}}
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
                {/* Source badge */}
                {dataSource && (
                  <Badge
                    className="text-xs border-0"
                    style={{ backgroundColor: profilColor + '20', color: profilColor }}
                  >
                    {profilMiActif !== 'tous' ? profilMiActif.split('_')[0] : 'Tous'}
                  </Badge>
                )}
                <Badge variant="outline" className="border-white/20 text-slate-400 text-xs">{filteredRows.length} pts</Badge>
                <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 px-2" onClick={exportCSV} title="Exporter CSV">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost"
                  className="text-slate-400 hover:text-red-400 h-7 px-2"
                  onClick={exportPDF}
                  disabled={exportingPDF}
                  title="Exporter graphique en PDF"
                >
                  {exportingPDF
                    ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                    : <FileText className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>

            <div ref={chartRef} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold text-sm">Espace visualisation</h3>
                  <p className="text-slate-500 text-xs mt-1">Zone dédiée aux graphiques et tableaux d'analyse.</p>
                </div>
                {mode === 'serie' && (
                  <div className="flex items-center gap-2 flex-wrap max-w-[65%] justify-end">
                    {/* Aperçu pills des métriques sélectionnées */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {METRIQUES.filter(m => serieMetrics.has(m.key)).slice(0, 5).map(m => (
                        <span key={m.key}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: m.color + '25', color: m.color }}
                          title={`${m.label} (${m.unit})`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                          {m.label.split(' — ').pop()?.split(' (')[0] ?? m.label}
                          <span className="opacity-60">{m.unit}</span>
                        </span>
                      ))}
                      {serieMetrics.size > 5 && (
                        <span className="text-[10px] text-slate-500">+{serieMetrics.size - 5}</span>
                      )}
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm"
                          className="bg-white/5 border-white/20 text-white text-sm h-8 gap-2">
                          <span className="text-slate-400 text-xs">Métriques :</span>
                          <span className="text-blue-300">{serieMetrics.size}</span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 bg-[#1a1d2e] border-white/20 p-2" align="end">
                        <div className="flex items-center justify-between px-2 py-1 mb-1">
                          <span className="text-slate-300 text-xs font-medium">Métriques à afficher</span>
                          <button
                            onClick={() => setSerieMetrics(serieMetrics.size === METRIQUES.length ? new Set() : new Set(METRIQUES.map(m => m.key)))}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {serieMetrics.size === METRIQUES.length ? 'Aucune' : 'Toutes'}
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                          {(['Énergie', 'Phase A', 'Phase B', 'Phase C', 'Puissance', 'Coût'] as MetricGroup[]).map(group => {
                            const groupMetrics = METRIQUES.filter(m => m.group === group);
                            if (groupMetrics.length === 0) return null;
                            return (
                              <div key={group}>
                                <div className="text-[10px] text-slate-500 uppercase tracking-wide px-2 mb-1">{group}</div>
                                {groupMetrics.map(m => {
                                  const checked = serieMetrics.has(m.key);
                                  return (
                                    <label
                                      key={m.key}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                                    >
                                      <Checkbox checked={checked} onCheckedChange={() => toggleSerieMetric(m.key)} />
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                      <span className="text-white text-xs flex-1 truncate">{m.label}</span>
                                      <span className="text-slate-500 text-[10px]">{m.unit}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {serieMetrics.size === 0 && (
                      <span className="text-amber-400 text-xs ml-1">Aucune métrique sélectionnée</span>
                    )}
                  </div>
                )}
              </div>

              {/* ---- Courbe de charge (ex-onglet Profil de charge) ---- */}
              {mode === 'courbe' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <ProfilChargeTab />
                </div>
              )}

              {/* ---- Série temporelle ---- */}
              {mode === 'serie' && (
                <div className="space-y-4">
                  {/* Identité appareil */}
                  {(serieData[0]?.appareil || serieData[0]?.emplacement || serieData[0]?.piece) && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      {serieData[0].appareil && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                          <span className="text-cyan-500 font-normal">name</span>&nbsp;{serieData[0].appareil}
                        </span>
                      )}
                      {serieData[0].emplacement && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                          <span className="text-yellow-500 font-normal">site</span>&nbsp;{serieData[0].emplacement}
                        </span>
                      )}
                      {serieData[0].piece && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                          <span className="text-purple-500 font-normal">room</span>&nbsp;{serieData[0].piece}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold text-sm">Série temporelle — {profilMiActif !== 'tous' ? PROFIL_MI_LABELS[profilMiActif] : 'Tous profils'}</h3>
                      <span className="text-slate-500 text-xs">{serieMetrics.size} métrique{serieMetrics.size > 1 ? 's' : ''}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={520}>
                      <AreaChart data={serieData} margin={{ top: 10, right: 30, bottom: 35, left: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: '#cbd5e1', fontSize: 10 }} interval="preserveStartEnd"
                          label={{ value: 'Temps (date)', position: 'insideBottom', offset: -5, fill: '#cbd5e1', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }}
                          tickFormatter={(v: number) => fmtFr(v, v >= 100 ? 0 : 1)}
                          label={{
                            value: (() => {
                              const units = Array.from(new Set(
                                METRIQUES.filter(m => serieMetrics.has(m.key)).map(m => m.unit)
                              ));
                              return units.length === 1 ? `Valeur (${units[0]})` : 'Valeur (multi-unités)';
                            })(),
                            angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 11, offset: 5,
                          }} />
                        <Tooltip content={<SerieTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 10 }}
                          onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                        <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4"
                          label={{ value: `Moy. ${fmt1(stats.moyenne)} ${METRIQUES.find(m => m.key === primarySerieMetric)?.unit ?? ''}`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                        {METRIQUES.filter(m => serieMetrics.has(m.key)).map(m => (
                          <Area key={m.key} type="monotone" dataKey={m.key} name={`${m.label} (${m.unit})`}
                            stroke={m.color} fill={`${m.color}25`}
                            strokeWidth={m.key === primarySerieMetric ? 2.5 : 1.5}
                            dot={false}
                            hide={isHidden(m.key)} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {[
                      { label: 'Moyenne', value: fmt2(stats.moyenne), color: 'text-blue-400' },
                      { label: 'Médiane', value: fmt2(stats.mediane), color: 'text-cyan-400' },
                      { label: 'Écart-type', value: fmt2(stats.ecartType), color: 'text-purple-400' },
                      { label: 'P25', value: fmt2(stats.p25), color: 'text-green-400' },
                      { label: 'P75', value: fmt2(stats.p75), color: 'text-yellow-400' },
                      { label: 'Maximum', value: fmt2(stats.max), color: 'text-orange-400' },
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
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select value={tcdLigne} onValueChange={(v) => { setTcdLigne(v as typeof tcdLigne); setDrillMonth(null); setCrossFilter(null); }}>
                        <SelectTrigger className="w-44 bg-white/5 border-white/20 text-white text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-white/20">
                          <SelectItem value="mois">Mois</SelectItem>
                          <SelectItem value="jouSemaine">Jour de semaine</SelectItem>
                          <SelectItem value="typeJour">Type de jour</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Sélecteur métrique (multi-select) */}
                      <div className="flex flex-wrap gap-1">
                        {METRIQUES.map(m => (
                          <button key={m.key} onClick={() => toggleTcdMetric(m.key)}
                            className={`px-2 py-1 rounded text-xs font-medium border transition-all ${tcdMetrics.has(m.key) ? 'border-transparent text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}
                            style={tcdMetrics.has(m.key) ? { backgroundColor: m.color + '30', borderColor: m.color + '60', color: m.color } : {}}
                          >{m.label}</button>
                        ))}
                      </div>
                      {/* Sélecteur type graphique */}
                      <div className="flex gap-1 border border-white/10 rounded-lg p-0.5">
                        {(['bar', 'line', 'area'] as ChartType[]).map(ct => (
                          <button key={ct} onClick={() => setChartType(ct)}
                            className={`px-2 py-0.5 rounded text-xs transition-all ${chartType === ct ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                          >{{ bar: 'Barres', line: 'Ligne', area: 'Aire' }[ct]}</button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setFullscreenTCD(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-xs transition-all"
                      title="Ouvrir en plein écran">
                      <Maximize2 className="h-3.5 w-3.5" /><span>Plein écran</span>
                    </button>
                  </div>

                  {/* Breadcrumb drill-down */}
                  {drillMonth && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="hover:text-white">Tous les mois</button>
                      <ChevronRight className="h-3 w-3" />
                      <span className="text-white font-medium">{drillMonth}</span>
                      <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="ml-1 text-slate-500 hover:text-white"><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* Slicers compacts */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {[
                      { label: 'Hivernage', set: setSlicerSaison, arr: slicerSaison },
                      { label: 'Sèche', set: setSlicerSaison, arr: slicerSaison },
                      { label: 'Jours ouvrés', set: setSlicerTypeJour, arr: slicerTypeJour },
                      { label: 'Samedis', set: setSlicerTypeJour, arr: slicerTypeJour },
                      { label: 'Dimanches', set: setSlicerTypeJour, arr: slicerTypeJour },
                      { label: 'Heure de pointe', set: setSlicerPeriode, arr: slicerPeriode },
                      { label: 'Heure creuse', set: setSlicerPeriode, arr: slicerPeriode },
                    ].map(({ label, set, arr }) => {
                      const active = arr.includes(label);
                      return (
                        <button key={label} onClick={() => set(prev => active ? prev.filter(x => x !== label) : [...prev, label])}
                          className={`px-2 py-0.5 rounded-full border transition-all ${active ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-slate-500 hover:text-white'}`}
                        >{label}</button>
                      );
                    })}
                    {(slicerSaison.length + slicerTypeJour.length + slicerPeriode.length) > 0 && (
                      <button onClick={() => { setSlicerSaison([]); setSlicerTypeJour([]); setSlicerPeriode([]); }}
                        className="px-2 py-0.5 rounded-full border border-red-500/30 text-red-400 hover:text-red-300 text-xs">✕ Reset</button>
                    )}
                  </div>

                  {/* Cross-filter banner */}
                  {crossFilter && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-blue-300">Filtré sur <span className="font-semibold">{crossFilter}</span> — {crossFilteredRows.length} lignes</span>
                      <button onClick={() => setCrossFilter(null)} className="ml-auto text-blue-500/60 hover:text-blue-300"><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* Graphique principal */}
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <ResponsiveContainer width="100%" height={280}>
                      {chartType === 'bar' ? (
                        <BarChart data={tcdData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}
                          onClick={(e) => {
                            if (!e?.activeLabel) return;
                            const lbl = e.activeLabel as string;
                            if (tcdLigne === 'mois' && !drillMonth) { setDrillMonth(lbl); setCrossFilter(lbl); }
                            else { setCrossFilter(prev => prev === lbl ? null : lbl); }
                          }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} angle={(tcdLigne === 'mois' || drillMonth) ? -25 : 0} textAnchor={(tcdLigne === 'mois' || drillMonth) ? 'end' : 'middle'} label={{ value: drillMonth ? 'Jour' : tcdLigne === 'mois' ? 'Mois' : tcdLigne === 'jouSemaine' ? 'Jour de semaine' : 'Type de jour', position: 'insideBottom', offset: -2, fill: '#cbd5e1', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} label={{ value: formatAxisMetric(primaryTcdMetric), angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={tcdFormatter} />
                          <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            return (
                              <Bar key={mk} dataKey={mk} name={meta?.label ?? mk} radius={[4, 4, 0, 0]} fill={meta?.color ?? profilColor} cursor="pointer" opacity={0.85}>
                                {mk === primaryTcdMetric && tcdData.map((entry, i) => (
                                  <Cell key={i} fill={crossFilter === entry.label ? '#f59e0b' : meta?.color ?? COULEURS[i % COULEURS.length]} opacity={crossFilter && crossFilter !== entry.label ? 0.35 : 1} />
                                ))}
                              </Bar>
                            );
                          })}
                        </BarChart>
                      ) : chartType === 'line' ? (
                        <LineChart data={tcdData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} label={{ value: drillMonth ? 'Jour' : tcdLigne === 'mois' ? 'Mois' : tcdLigne === 'jouSemaine' ? 'Jour de semaine' : 'Type de jour', position: 'insideBottom', offset: -2, fill: '#cbd5e1', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} label={{ value: formatAxisMetric(primaryTcdMetric), angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={tcdFormatter} />
                          <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            return <Line key={mk} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? profilColor} strokeWidth={2} dot={{ r: 4 }} />;
                          })}
                          <Line type="monotone" dataKey="moyenne" name="Moyenne" stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      ) : (
                        <AreaChart data={tcdData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} label={{ value: drillMonth ? 'Jour' : tcdLigne === 'mois' ? 'Mois' : tcdLigne === 'jouSemaine' ? 'Jour de semaine' : 'Type de jour', position: 'insideBottom', offset: -2, fill: '#cbd5e1', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} label={{ value: formatAxisMetric(primaryTcdMetric), angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={tcdFormatter} />
                          <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            return <Area key={mk} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? profilColor} fill={(meta?.color ?? profilColor) + '20'} strokeWidth={2} />;
                          })}
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {/* Tableau agrégé */}
                  <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          {['Catégorie', 'N'].map(h => <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium text-xs">{h}</th>)}
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            return <th key={mk} className="px-4 py-3 text-left font-medium text-xs" style={{ color: meta?.color }}>
                              {meta?.label ?? mk}{meta?.unit && <span className="text-slate-500 ml-1 font-normal">({meta.unit})</span>}
                            </th>;
                          })}
                          {['Moyenne', 'Max', 'Min'].map(h => {
                            const u = METRIQUES.find(m => m.key === primaryTcdMetric)?.unit;
                            return <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium text-xs">{h}{u && <span className="text-slate-500 ml-1 font-normal">({u})</span>}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {tcdData.map((row, i) => (
                          <tr key={i} onClick={() => setCrossFilter(prev => prev === row.label ? null : row.label)}
                            className={`border-t border-white/10 cursor-pointer transition-colors ${crossFilter === row.label ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                            <td className="px-4 py-2 text-white font-medium text-xs">{row.label}</td>
                            <td className="px-4 py-2 text-slate-400 text-xs">{row.n}</td>
                            {Array.from(tcdMetrics).map(mk => {
                              const meta = METRIQUES.find(m => m.key === mk);
                              return <td key={mk} className="px-4 py-2 font-medium text-xs" style={{ color: meta?.color }}>
                                {fmtFr((row as Record<string, number>)[mk] ?? 0, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                              </td>;
                            })}
                            <td className="px-4 py-2 text-cyan-400 text-xs">{fmtFr(row.moyenne, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                            <td className="px-4 py-2 text-green-400 text-xs">{fmtFr(row.max, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                            <td className="px-4 py-2 text-slate-400 text-xs">{fmtFr(row.min, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                          <td className="px-4 py-2 text-white text-xs">TOTAL</td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{tcdData.reduce((s, r) => s + r.n, 0)}</td>
                          {Array.from(tcdMetrics).map(mk => {
                            const meta = METRIQUES.find(m => m.key === mk);
                            const total = tcdData.reduce((s, r) => s + ((r as Record<string, number>)[mk] ?? 0), 0);
                            return <td key={mk} className="px-4 py-2 text-xs" style={{ color: meta?.color }}>
                              {fmtFr(total, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                            </td>;
                          })}
                          <td colSpan={3} />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Données brutes repliables */}
                  <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <button onClick={() => { setShowRawData(v => !v); setRawPage(0); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-slate-400" />
                        Données brutes ({(crossFilter ? crossFilteredRows : slicerRows).length} lignes)
                      </span>
                      {showRawData ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                    {showRawData && (() => {
                      const rows = crossFilter ? crossFilteredRows : slicerRows;
                      const pageRows = rows.slice(rawPage * RAW_PAGE_SIZE, (rawPage + 1) * RAW_PAGE_SIZE);
                      const totalPages = Math.ceil(rows.length / RAW_PAGE_SIZE);
                      return (
                        <div className="border-t border-white/10">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-white/5 sticky top-0">
                                <tr>{['Date', 'Heure', 'Jour', 'kWh Net', 'kWh Total', 'Ph A (kWh)', 'Ph B (kWh)', 'Ph C (kWh)', 'Puiss. (kW)', 'Saison', 'Type'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody>
                                {pageRows.map((r, i) => (
                                  <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                                    <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{toDate(r.date).toLocaleDateString('fr-FR')}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{toDate(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="px-3 py-1.5 text-slate-400">{r.jourSemaine}</td>
                                    <td className="px-3 py-1.5 text-purple-400 font-medium">{fmt3(r.kwhNet)}</td>
                                    <td className="px-3 py-1.5 text-blue-400">{fmt3(r.kwhTotal)}</td>
                                    <td className="px-3 py-1.5 text-green-400">{fmt3(r.kwhA)}</td>
                                    <td className="px-3 py-1.5 text-yellow-400">{fmt3(r.kwhB)}</td>
                                    <td className="px-3 py-1.5 text-pink-400">{fmt3(r.kwhC)}</td>
                                    <td className="px-3 py-1.5 text-cyan-400">{fmt3(r.puissKwTotal)}</td>
                                    <td className="px-3 py-1.5 text-slate-400">{r.saison}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{r.isJourFerie ? 'Férié' : r.isWeekend ? 'Weekend' : 'Ouvré'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-xs text-slate-400">
                              <span>{rawPage * RAW_PAGE_SIZE + 1}–{Math.min((rawPage + 1) * RAW_PAGE_SIZE, rows.length)} / {rows.length}</span>
                              <div className="flex gap-1">
                                <button disabled={rawPage === 0} onClick={() => setRawPage(p => p - 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">‹</button>
                                <button disabled={rawPage >= totalPages - 1} onClick={() => setRawPage(p => p + 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">›</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* ---- Profil semaine ---- */}
            {mode === 'profil_semaine' && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-white font-semibold text-sm mb-4">Moyenne par jour de semaine</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="jour" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                      <Bar dataKey="kwhMoyen" name="kwhNet" radius={[4, 4, 0, 0]}>
                        {profilSemaineData.map((_, i) => (
                          <Cell key={i} fill={i === 0 || i === 6 ? '#a78bfa' : profilColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    ['Moyenne', fmt2(stats.moyenne), 'text-blue-400'],
                    ['Médiane', fmt2(stats.mediane), 'text-cyan-400'],
                    ['Écart-type', fmt2(stats.ecartType), 'text-purple-400'],
                    ['P25', fmt2(stats.p25), 'text-green-400'],
                    ['P75', fmt2(stats.p75), 'text-yellow-400'],
                    ['Max', fmt2(stats.max), 'text-orange-400'],
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
                      <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Bar dataKey="count" name="Nb jours" radius={[4, 4, 0, 0]}>
                        {distributionData.map((d, i) => (
                          <Cell key={i} fill={d.min < safeNum(stats.p25, 0) ? '#a78bfa' : d.min < safeNum(stats.p75, 0) ? profilColor : '#f59e0b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-3 text-xs">
                  {[
                    { color: 'bg-purple-500', label: `Faible (< ${fmt0(stats.p25)})` },
                    { color: '', label: 'Normal (P25–P75)', style: { backgroundColor: profilColor } },
                    { color: 'bg-yellow-500', label: `Élevé (> ${fmt0(stats.p75)})` },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5 text-slate-400">
                      <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} style={l.style} />
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
                      <XAxis type="number" dataKey="x" domain={[0, 6]} tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={(v) => JOURS_SEMAINE[v]} />
                      <YAxis type="number" dataKey="y" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(v: number, name) => [
                          name === 'y' ? `${v} kWh` : JOURS_SEMAINE[v as number],
                          name === 'y' ? 'Énergie nette' : 'Jour',
                        ]}
                      />
                      <Scatter data={correlationData} fill={profilColor} opacity={0.7} r={3} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h4 className="text-white font-medium text-sm mb-3">Courbe de tendance hebdomadaire</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={profilSemaineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="jour" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Line type="monotone" dataKey="kwhMoyen" name="kwhNet" stroke={profilColor} strokeWidth={2} dot={{ fill: profilColor, r: 4 }} />
                      <ReferenceLine y={safeNum(stats.moyenne, 0)} stroke="#f59e0b" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================
        OVERLAY FULLSCREEN — Dashboard Power BI
    ============================================================ */}
      {fullscreenTCD && (
        <div className="fixed inset-0 z-50 bg-[#0f111a] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <BarChart2 className="h-4 w-4 text-purple-400" />
              <span className="text-white font-semibold text-sm">TCD — {dataSource ?? 'Aucune donnée'}</span>
              <span className="text-slate-500 text-xs">{slicerRows.length} lignes</span>
            </div>
            {/* Sélecteur métrique (multi-select) */}
            <div className="flex flex-wrap gap-1">
              {METRIQUES.map(m => (
                <button key={m.key} onClick={() => toggleTcdMetric(m.key)}
                  className="px-2.5 py-1 rounded text-xs font-medium border transition-all"
                  style={tcdMetrics.has(m.key)
                    ? { backgroundColor: m.color + '25', borderColor: m.color + '60', color: m.color }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: '#64748b' }}
                >{m.label}</button>
              ))}
            </div>
            {/* Type graphique */}
            <div className="flex gap-1 border border-white/10 rounded-lg p-0.5">
              {(['bar', 'line', 'area'] as ChartType[]).map(ct => (
                <button key={ct} onClick={() => setChartType(ct)}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${chartType === ct ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                >{{ bar: 'Barres', line: 'Ligne', area: 'Aire' }[ct]}</button>
              ))}
            </div>
            <button onClick={() => setFullscreenTCD(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs">
              <Minimize2 className="h-3.5 w-3.5" /><span>Réduire</span>
            </button>
          </div>

          {/* Slicers */}
          <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-white/5 bg-white/3 shrink-0 text-xs">
            <span className="text-slate-500 self-center mr-1">Filtres :</span>
            {[
              { label: 'Hivernage', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Sèche', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Période chaude', set: setSlicerSaison, arr: slicerSaison },
              { label: 'Jours ouvrés', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Samedis', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Dimanches', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Jours fériés', set: setSlicerTypeJour, arr: slicerTypeJour },
              { label: 'Heure de pointe', set: setSlicerPeriode, arr: slicerPeriode },
              { label: 'Heure creuse', set: setSlicerPeriode, arr: slicerPeriode },
            ].map(({ label, set, arr }) => {
              const active = arr.includes(label);
              return (
                <button key={label} onClick={() => set(prev => active ? prev.filter(x => x !== label) : [...prev, label])}
                  className={`px-2.5 py-0.5 rounded-full border transition-all ${active ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
                >{label}</button>
              );
            })}
            {(slicerSaison.length + slicerTypeJour.length + slicerPeriode.length) > 0 && (
              <button onClick={() => { setSlicerSaison([]); setSlicerTypeJour([]); setSlicerPeriode([]); }}
                className="px-2.5 py-0.5 rounded-full border border-red-500/30 text-red-400 hover:text-red-300">✕ Reset</button>
            )}
            {crossFilter && (
              <span className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                Filtre : <strong>{crossFilter}</strong>
                <button onClick={() => setCrossFilter(null)}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>

          {/* Corps scrollable */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Breadcrumb drill */}
            {drillMonth && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="hover:text-white">Tous les mois</button>
                <ChevronRight className="h-3 w-3" />
                <span className="text-white font-medium">{drillMonth}</span>
                <button onClick={() => { setDrillMonth(null); setCrossFilter(null); }} className="ml-1 text-slate-500 hover:text-white"><X className="h-3 w-3" /></button>
              </div>
            )}

            {/* Grille 2×2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart 1 : TCD principal */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-xs font-semibold">
                    {drillMonth ? `Jours — ${drillMonth}` : { mois: 'Par Mois', jouSemaine: 'Par Jour de semaine', typeJour: 'Par Type de jour' }[tcdLigne]}
                  </p>
                  <div className="flex gap-1">
                    {(['mois', 'jouSemaine', 'typeJour'] as const).map(v => (
                      <button key={v} onClick={() => { setTcdLigne(v); setDrillMonth(null); setCrossFilter(null); }}
                        className={`px-2 py-0.5 rounded text-xs border transition-all ${tcdLigne === v ? 'bg-white/15 border-white/20 text-white' : 'border-white/10 text-slate-500 hover:text-white'}`}
                      >{{ mois: 'Mois', jouSemaine: 'Semaine', typeJour: 'Type' }[v]}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  {chartType === 'bar' ? (
                    <BarChart data={tcdData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}
                      onClick={e => {
                        if (!e?.activeLabel) return;
                        const lbl = e.activeLabel as string;
                        if (tcdLigne === 'mois' && !drillMonth) { setDrillMonth(lbl); setCrossFilter(lbl); }
                        else setCrossFilter(prev => prev === lbl ? null : lbl);
                      }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={(tcdLigne === 'mois' || drillMonth) ? -25 : 0} textAnchor={(tcdLigne === 'mois' || drillMonth) ? 'end' : 'middle'} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                      {Array.from(tcdMetrics).map(mk => {
                        const meta = METRIQUES.find(m => m.key === mk);
                        return (
                          <Bar key={mk} dataKey={mk} name={meta?.label ?? mk} radius={[3, 3, 0, 0]} fill={meta?.color ?? profilColor} cursor="pointer" opacity={0.85}>
                            {mk === primaryTcdMetric && tcdData.map((entry, i) => (
                              <Cell key={i} fill={crossFilter === entry.label ? '#f59e0b' : meta?.color ?? COULEURS[i % COULEURS.length]} opacity={crossFilter && crossFilter !== entry.label ? 0.3 : 1} />
                            ))}
                          </Bar>
                        );
                      })}
                    </BarChart>
                  ) : chartType === 'line' ? (
                    <LineChart data={tcdData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                      {Array.from(tcdMetrics).map(mk => {
                        const meta = METRIQUES.find(m => m.key === mk);
                        return <Line key={mk} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? profilColor} strokeWidth={2} dot={{ r: 3 }} />;
                      })}
                      <Line type="monotone" dataKey="moyenne" name="Moy." stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  ) : (
                    <AreaChart data={tcdData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                      {Array.from(tcdMetrics).map(mk => {
                        const meta = METRIQUES.find(m => m.key === mk);
                        return <Area key={mk} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? profilColor} fill={(meta?.color ?? profilColor) + '20'} strokeWidth={2} />;
                      })}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Chart 2 : Phases A/B/C — séries temporelles superposées (style Shelly Cloud) */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <p className="text-white text-xs font-semibold mb-2">Répartition Phases A / B / C</p>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={stackedData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <defs>
                      <linearGradient id="phA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="phTot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-30} textAnchor="end" height={50} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} unit=" kWh" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#94a3b8' }}
                      formatter={(v: number, name: string) => [`${fmtFr(v, 3)} kWh`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer' }} onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                    <Area type="monotone" dataKey="Total"   stroke="#22c55e" fill="url(#phTot)" strokeWidth={2}   hide={isHidden('Total')} />
                    <Area type="monotone" dataKey="Phase A" stroke="#a855f7" fill="url(#phA)"   strokeWidth={1.5} hide={isHidden('Phase A')} />
                    <Area type="monotone" dataKey="Phase B" stroke="#f59e0b" fill="url(#phB)"   strokeWidth={1.5} hide={isHidden('Phase B')} />
                    <Area type="monotone" dataKey="Phase C" stroke="#06b6d4" fill="url(#phC)"   strokeWidth={1.5} hide={isHidden('Phase C')} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3 : Série temporelle cross-filtrée */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                <p className="text-white text-xs font-semibold mb-2">Série temporelle {crossFilter ? `— ${crossFilter}` : ''}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={(crossFilter ? crossFilteredRows : slicerRows).map(r => {
                    const obj: Record<string, unknown> = { date: toDate(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) };
                    for (const mk of tcdMetrics) obj[mk] = +((r[mk] as number) ?? 0).toFixed(2);
                    return obj;
                  })} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#cbd5e1', fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={tcdFormatter} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    {Array.from(tcdMetrics).map(mk => {
                      const meta = METRIQUES.find(m => m.key === mk);
                      return <Area key={mk} type="monotone" dataKey={mk} name={meta?.label ?? mk} stroke={meta?.color ?? profilColor} fill={(meta?.color ?? profilColor) + '15'} strokeWidth={2} dot={false} />;
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 4 : Tableau agrégé */}
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 overflow-auto">
                <p className="text-white text-xs font-semibold mb-2">Synthèse</p>
                <table className="min-w-full text-xs">
                  <thead><tr>
                    {['Catégorie', 'N'].map(h => <th key={h} className="px-3 py-1.5 text-left text-slate-400 font-medium">{h}</th>)}
                    {Array.from(tcdMetrics).map(mk => {
                      const meta = METRIQUES.find(m => m.key === mk);
                      return <th key={mk} className="px-3 py-1.5 text-left font-medium" style={{ color: meta?.color }}>
                        {meta?.label ?? mk}{meta?.unit && <span className="text-slate-500 ml-1 font-normal">({meta.unit})</span>}
                      </th>;
                    })}
                    {['Moy.', 'Max', 'Min'].map(h => {
                      const u = METRIQUES.find(m => m.key === primaryTcdMetric)?.unit;
                      return <th key={h} className="px-3 py-1.5 text-left text-slate-400 font-medium">{h}{u && <span className="text-slate-500 ml-1 font-normal">({u})</span>}</th>;
                    })}
                  </tr></thead>
                  <tbody>
                    {tcdData.map((row, i) => (
                      <tr key={i} onClick={() => setCrossFilter(prev => prev === row.label ? null : row.label)}
                        className={`border-t border-white/5 cursor-pointer ${crossFilter === row.label ? 'bg-yellow-500/10' : 'hover:bg-white/5'}`}>
                        <td className="px-3 py-1.5 text-white font-medium">{row.label}</td>
                        <td className="px-3 py-1.5 text-slate-400">{row.n}</td>
                        {Array.from(tcdMetrics).map(mk => {
                          const meta = METRIQUES.find(m => m.key === mk);
                          return <td key={mk} className="px-3 py-1.5 font-medium" style={{ color: meta?.color }}>
                            {fmtFr((row as Record<string, number>)[mk] ?? 0, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                          </td>;
                        })}
                        <td className="px-3 py-1.5 text-cyan-400">{fmtFr(row.moyenne, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                        <td className="px-3 py-1.5 text-green-400">{fmtFr(row.max, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                        <td className="px-3 py-1.5 text-slate-400">{fmtFr(row.min, 3)}<span className="opacity-50 ml-0.5">{METRIQUES.find(m => m.key === primaryTcdMetric)?.unit}</span></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/20 font-bold">
                      <td className="px-3 py-1.5 text-white">TOTAL</td>
                      <td className="px-3 py-1.5 text-slate-400">{tcdData.reduce((s, r) => s + r.n, 0)}</td>
                      {Array.from(tcdMetrics).map(mk => {
                        const meta = METRIQUES.find(m => m.key === mk);
                        const total = tcdData.reduce((s, r) => s + ((r as Record<string, number>)[mk] ?? 0), 0);
                        return <td key={mk} className="px-3 py-1.5" style={{ color: meta?.color }}>
                          {fmtFr(total, 3)}{meta?.unit && <span className="opacity-50 ml-0.5 font-normal">{meta.unit}</span>}
                        </td>;
                      })}
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Données brutes plein écran */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                <span className="text-white text-xs font-semibold flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  Données brutes — {(crossFilter ? crossFilteredRows : slicerRows).length} lignes
                  {crossFilter && <span className="text-yellow-400 font-normal">· filtrées sur {crossFilter}</span>}
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {fsPage * FS_PAGE_SIZE + 1}–{Math.min((fsPage + 1) * FS_PAGE_SIZE, (crossFilter ? crossFilteredRows : slicerRows).length)} / {(crossFilter ? crossFilteredRows : slicerRows).length}
                  <button disabled={fsPage === 0} onClick={() => setFsPage(p => p - 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">‹</button>
                  <button disabled={fsPage >= Math.ceil((crossFilter ? crossFilteredRows : slicerRows).length / FS_PAGE_SIZE) - 1} onClick={() => setFsPage(p => p + 1)} className="px-2 py-0.5 rounded bg-white/5 disabled:opacity-30 hover:bg-white/10">›</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/5 sticky top-0">
                    <tr>{['Date', 'Heure', 'Jour', 'Saison', 'Tranche', 'kWh Net', 'kWh Total', 'Ph A (kWh)', 'Ph B (kWh)', 'Ph C (kWh)', 'Puiss. (kW)'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {(crossFilter ? crossFilteredRows : slicerRows).slice(fsPage * FS_PAGE_SIZE, (fsPage + 1) * FS_PAGE_SIZE).map((r, i) => (
                      <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{toDate(r.date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{toDate(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-slate-400">{r.jourSemaine}</td>
                        <td className="px-3 py-1.5 text-slate-400">{r.saison}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.trancheTarification}</td>
                        <td className="px-3 py-1.5 text-purple-400 font-medium">{fmt3(r.kwhNet)}</td>
                        <td className="px-3 py-1.5 text-blue-400">{fmt3(r.kwhTotal)}</td>
                        <td className="px-3 py-1.5 text-green-400">{fmt3(r.kwhA)}</td>
                        <td className="px-3 py-1.5 text-yellow-400">{fmt3(r.kwhB)}</td>
                        <td className="px-3 py-1.5 text-pink-400">{fmt3(r.kwhC)}</td>
                        <td className="px-3 py-1.5 text-cyan-400">{fmt3(r.puissKwTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
