import { useMemo, useState, useEffect } from 'react';
import { exportMultiSheetXlsx } from '@/lib/excel-utils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Download, Zap, Calendar, Database, RefreshCw, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIOT } from './IOTContext';
import { analyserDonneesShelly, calculerStats } from '@/lib/iot-profil-engine';
import type { ShellyRow } from './shared';
import { supabase } from '@/lib/supabase';
import { fetchDisponibles } from '@/lib/iot-supabase-service';

// Format français : remplace . par ,
const fmtFr = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');

// ── Transformation shelly_cl_horaire → ShellyRow[] ────────────
interface HoraireRow {
  ts_heure: string;
  site: string;
  device_id: string;
  name: string | null;
  room?: string | null;
  device_family: string | null;
  wh_conso: number | null;
  wh_inj: number | null;
  power_w_moy: number | null;
  p_a_moy: number | null;
  p_b_moy: number | null;
  p_c_moy: number | null;
}

function horaireToShellyRows(rows: HoraireRow[]): ShellyRow[] {
  // Groupement par (date, device_id) pour conserver l'identité appareil
  const grouped = new Map<string, HoraireRow[]>();
  for (const r of rows) {
    const dateKey = r.ts_heure.substring(0, 10);
    const key = `${dateKey}|${r.device_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const result: ShellyRow[] = [];
  for (const [key, hrs] of grouped.entries()) {
    const dateKey = key.split('|')[0];
    const date = new Date(dateKey + 'T00:00:00');
    const dow = date.getDay();
    const month = date.getMonth();

    // Identité appareil (commune à toutes les heures du même device-jour)
    const head = hrs[0];
    const nomAppareil = head.name ?? head.device_id;
    const deviceLocation = head.site ?? undefined;
    const deviceRoom = head.room ?? undefined;

    const whTotal = hrs.reduce((s, r) => s + (r.wh_conso ?? (r.power_w_moy ?? 0)), 0);
    const whInj = hrs.reduce((s, r) => s + (r.wh_inj ?? 0), 0);
    const whA = hrs.reduce((s, r) => s + Math.max(0, r.p_a_moy ?? 0), 0);
    const whB = hrs.reduce((s, r) => s + Math.max(0, r.p_b_moy ?? 0), 0);
    const whC = hrs.reduce((s, r) => s + Math.max(0, r.p_c_moy ?? 0), 0);

    const kwhTotal = whTotal / 1000;
    const kwhInj = whInj / 1000;
    const kwhA = whA / 1000;
    const kwhB = whB / 1000;
    const kwhC = whC / 1000;
    const kwhNet = Math.max(0, kwhTotal - kwhInj);

    result.push({
      date,
      whPhaseA: whA, whPhaseB: whB, whPhaseC: whC, whTotal,
      whRetourA: 0, whRetourB: 0, whRetourC: 0, whRetourTotal: whInj,
      kwhA, kwhB, kwhC, kwhTotal,
      kwhRetourA: 0, kwhRetourB: 0, kwhRetourC: 0, kwhRetourTotal: kwhInj,
      kwhCumA: 0, kwhCumB: 0, kwhCumC: 0, kwhCumTotal: kwhTotal,
      kwhCumRetourA: 0, kwhCumRetourB: 0, kwhCumRetourC: 0, kwhCumRetourTotal: 0,
      puissKwA: kwhA / 24, puissKwB: kwhB / 24, puissKwC: kwhC / 24,
      puissKwTotal: kwhTotal / 24,
      puissKwRetourA: 0, puissKwRetourB: 0, puissKwRetourC: 0, puissKwRetourTotal: 0,
      kwhNet,
      jour: date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      mois: date.toLocaleDateString('fr-FR', { month: 'short' }),
      annee: date.getFullYear(),
      jourActivites: [0, 6].includes(dow) ? 'Weekend' : 'Jour ouvré',
      periodeclimatique: [11, 0, 1, 2].includes(month) ? 'Période de fraîcheur' : 'Période chaude',
      saison: [6, 7, 8, 9].includes(month) ? 'Hivernage' : 'Sèche',
      periode: 'Journée',
      profil: kwhInj > kwhTotal ? 'SOUTIRAGE' : 'CHARGE',
      isWeekend: [0, 6].includes(dow),
      isJourFerie: false,
      jourSemaine: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      nomAppareil,
      deviceLocation,
      deviceRoom,
    });
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

type ViewMode = 'journalier' | 'mensuel' | 'phases';
type ChartType = 'aire' | 'barres';

function KPICard({ label, value, unit, sub, color = 'blue' }: {
  label: string; value: string; unit: string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] ?? colorMap.blue}`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const SITES = ['Ma Maison', 'Académie CER2E'];

interface TooltipEntry { name: string; value: number | string; unit?: string; color?: string; fill?: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1a1d2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', minWidth: 190 }}>
      <p style={{ color: '#e2e8f0', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color || entry.fill || '#94a3b8', fontSize: 12, margin: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{entry.name}</span>
          <span style={{ fontWeight: 700 }}>{entry.value}{entry.unit ? ` ${entry.unit}` : ''}</span>
        </p>
      ))}
    </div>
  );
}

export function ProfilChargeTab() {
  const { state } = useIOT();
  const { shellyRows: csvRows } = state;

  // ── Mode source ───────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<'csv' | 'supabase'>('csv');
  const [supabaseRows, setSupabaseRows] = useState<ShellyRow[]>([]);
  // Filtres multi-sélection
  const [sbSelectedSites, setSbSelectedSites] = useState<string[]>(['Académie CER2E']);
  const [sbSelectedRooms, setSbSelectedRooms] = useState<string[]>([]);
  const [sbSelectedDeviceIds, setSbSelectedDeviceIds] = useState<string[]>([]);
  // Catalogues disponibles (chargés depuis Supabase)
  const [sbAvailableRooms, setSbAvailableRooms] = useState<string[]>([]);
  const [sbDevices, setSbDevices] = useState<{ device_id: string; name: string; room: string | null; site: string }[]>([]);
  const [sbDateDebut, setSbDateDebut] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().substring(0, 10);
  });
  const [sbDateFin, setSbDateFin] = useState(() => new Date().toISOString().substring(0, 10));
  const [sbHeureDebut, setSbHeureDebut] = useState(0);
  const [sbHeureFin, setSbHeureFin] = useState(23);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  const shellyRows = sourceMode === 'supabase' ? supabaseRows : csvRows;

  // Catalogue complet garanti : fetchDisponibles() lit la liste statique des 31+32 appareils.
  // Room enrichie depuis shelly_cl (fenêtre 90j, query légère device_id+room uniquement).
  const loadDevices = async (sites: string[]) => {
    if (sites.length === 0) { setSbDevices([]); setSbAvailableRooms([]); return; }
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ devices: allDevices }, { data: roomData }] = await Promise.all([
      fetchDisponibles(),
      supabase
        .from('shelly_cl')
        .select('device_id, room')
        .in('site', sites)
        .not('room', 'is', null)
        .gte('ts', since90d)
        .limit(5000),
    ]);

    const roomByDevice = new Map<string, string>();
    for (const r of roomData ?? []) {
      if (r.room && !roomByDevice.has(r.device_id)) roomByDevice.set(r.device_id, r.room);
    }

    const devices = allDevices
      .filter(d => sites.includes(d.site))
      .map(d => ({ ...d, room: roomByDevice.get(d.device_id) ?? null }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));

    setSbDevices(devices);
    setSbSelectedDeviceIds([]);
    setSbSelectedRooms([]);
    const rooms = Array.from(new Set(devices.map(d => d.room).filter((r): r is string => Boolean(r)))).sort();
    setSbAvailableRooms(rooms);
  };

  const toggleSite = (site: string) => {
    setSbSelectedSites(prev => {
      const next = prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site];
      loadDevices(next);
      return next;
    });
    setSbSelectedRooms([]);
    setSbSelectedDeviceIds([]);
  };

  const toggleRoom = (room: string) => {
    setSbSelectedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
    setSbSelectedDeviceIds([]);
  };

  const toggleDevice = (id: string) =>
    setSbSelectedDeviceIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  // Charger les appareils automatiquement au passage en mode supabase
  useEffect(() => {
    if (sourceMode === 'supabase' && sbDevices.length === 0) loadDevices(sbSelectedSites);
  }, [sourceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Appareils visibles dans le filtre : filtrés par pièces sélectionnées
  const sbDevicesFiltered = sbSelectedRooms.length > 0
    ? sbDevices.filter(d => d.room && sbSelectedRooms.includes(d.room))
    : sbDevices;

  const loadFromSupabase = async () => {
    if (sbSelectedSites.length === 0) { setSbError('Sélectionnez au moins un site.'); return; }
    setSbLoading(true);
    setSbError(null);
    try {
      // Résoudre les device_ids : appareils sélectionnés > pièces sélectionnées > tous
      let deviceIds: string[] | undefined;
      if (sbSelectedDeviceIds.length > 0) {
        deviceIds = sbSelectedDeviceIds;
      } else if (sbSelectedRooms.length > 0) {
        deviceIds = sbDevices
          .filter(d => d.room && sbSelectedRooms.includes(d.room))
          .map(d => d.device_id);
        if (deviceIds.length === 0) { setSbError('Aucun appareil dans les pièces sélectionnées.'); setSbLoading(false); return; }
      }

      let query = supabase
        .from('shelly_cl_horaire')
        .select('ts_heure,site,device_id,name,device_family,wh_conso,wh_inj,power_w_moy,p_a_moy,p_b_moy,p_c_moy')
        .in('site', sbSelectedSites)
        .gte('ts_heure', `${sbDateDebut}T${String(sbHeureDebut).padStart(2, '0')}:00:00`)
        .lte('ts_heure', `${sbDateFin}T${String(sbHeureFin).padStart(2, '0')}:59:59`)
        .order('ts_heure', { ascending: true });
      if (deviceIds) query = query.in('device_id', deviceIds);

      // Mapping device_id → room depuis shelly_cl
      let roomQuery = supabase.from('shelly_cl').select('device_id,room')
        .in('site', sbSelectedSites).not('room', 'is', null).limit(5000);
      if (deviceIds) roomQuery = roomQuery.in('device_id', deviceIds);

      const [{ data, error }, { data: roomData }] = await Promise.all([query, roomQuery]);
      if (error) throw error;

      const roomMap = new Map<string, string>();
      for (const r of roomData ?? []) {
        if (r.room && !roomMap.has(r.device_id)) roomMap.set(r.device_id, r.room);
      }

      const enriched = ((data ?? []) as HoraireRow[]).map(r => ({
        ...r,
        room: roomMap.get(r.device_id) ?? null,
      }));

      const rows = horaireToShellyRows(enriched);
      setSupabaseRows(rows);
      if (rows.length === 0) setSbError('Aucune donnée pour cette sélection.');
    } catch (e) {
      setSbError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSbLoading(false);
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>('journalier');
  const [chartType, setChartType] = useState<ChartType>('aire');
  const [filterType, setFilterType] = useState<'tous' | 'ouvrés' | 'weekends' | 'fériés'>('tous');

  // Séries masquées dans les graphiques (clic sur la légende)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const isHidden = (key: string) => hiddenSeries.has(key);

  // Sélecteur multi-métriques affichées dans les graphiques journalier/mensuel
  type MetricKey = 'total' | 'net' | 'retour' | 'phaseA' | 'phaseB' | 'phaseC' | 'puissTotal' | 'puissA' | 'puissB' | 'puissC';
  const METRICS: { key: MetricKey; label: string; color: string; unit: string; mensuelKey?: string }[] = [
    { key: 'total', label: 'Consommation totale', color: '#3b82f6', unit: 'kWh', mensuelKey: 'kwhTotal' },
    { key: 'net', label: 'Énergie nette', color: '#06b6d4', unit: 'kWh', mensuelKey: 'kwhNet' },
    { key: 'retour', label: 'Énergie injectée (retour)', color: '#a78bfa', unit: 'kWh', mensuelKey: 'kwhRetour' },
    { key: 'phaseA', label: 'Phase A — Consommation', color: '#a855f7', unit: 'kWh' },
    { key: 'phaseB', label: 'Phase B — Consommation', color: '#f59e0b', unit: 'kWh' },
    { key: 'phaseC', label: 'Phase C — Consommation', color: '#ec4899', unit: 'kWh' },
    { key: 'puissTotal', label: 'Puissance totale', color: '#10b981', unit: 'kW' },
    { key: 'puissA', label: 'Puissance — Phase A', color: '#34d399', unit: 'kW' },
    { key: 'puissB', label: 'Puissance — Phase B', color: '#fbbf24', unit: 'kW' },
    { key: 'puissC', label: 'Puissance — Phase C', color: '#f87171', unit: 'kW' },
  ];
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(new Set(['total', 'net']));
  const toggleMetric = (k: MetricKey) =>
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const isMetric = (k: MetricKey) => selectedMetrics.has(k);

  // Filtrer les lignes
  const filteredRows = useMemo<ShellyRow[]>(() => {
    switch (filterType) {
      case 'ouvrés': return shellyRows.filter(r => !r.isWeekend && !r.isJourFerie);
      case 'weekends': return shellyRows.filter(r => r.isWeekend);
      case 'fériés': return shellyRows.filter(r => r.isJourFerie);
      default: return shellyRows;
    }
  }, [shellyRows, filterType]);

  const analyse = useMemo(() => analyserDonneesShelly(filteredRows), [filteredRows]);
  // const facturation = useMemo(
  //   () => calculerFacturationShelly(filteredRows, paramsTarif),
  //   [filteredRows, paramsTarif]
  // );
  const statsKwh = useMemo(
    () => calculerStats(filteredRows.map(r => r.kwhNet)),
    [filteredRows]
  );

  // Données graphique journalier
  const chartDataJournalier = useMemo(() =>
    filteredRows.map(r => ({
      date: (r.date instanceof Date ? r.date : new Date(r.date as string)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      total: +((r.kwhTotal ?? 0).toFixed(2)),
      net: +((r.kwhNet ?? 0).toFixed(2)),
      retour: +((r.kwhRetourTotal ?? 0).toFixed(2)),
      phaseA: +((r.kwhA ?? 0).toFixed(2)),
      phaseB: +((r.kwhB ?? 0).toFixed(2)),
      phaseC: +((r.kwhC ?? 0).toFixed(2)),
      puissTotal: +((r.puissKwTotal ?? 0).toFixed(3)),
      puissA: +((r.puissKwA ?? 0).toFixed(3)),
      puissB: +((r.puissKwB ?? 0).toFixed(3)),
      puissC: +((r.puissKwC ?? 0).toFixed(3)),
      isWeekend: r.isWeekend,
      isFerie: r.isJourFerie,
    })),
    [filteredRows]
  );

  // Données graphique mensuel
  const chartDataMensuel = useMemo(() =>
    Object.entries(analyse.parMois).map(([mois, data]) => ({
      mois,
      kwhTotal: +((data.kwhTotal ?? 0).toFixed(2)),
      kwhNet: +((data.kwhNet ?? 0).toFixed(2)),
      kwhRetour: +((data.kwhRetour ?? 0).toFixed(2)),
      nbJours: data.nbJours,
    })),
    [analyse]
  );

  // Export Excel
  const exportExcel = async () => {
    await exportMultiSheetXlsx(
      [
        {
          name: 'PROFIL CHARGE',
          data: filteredRows.map(r => ({
            'Date': (r.date instanceof Date ? r.date : new Date(r.date as string)).toLocaleDateString('fr-FR'),
            'Jour': r.jour,
            'Mois': r.mois,
            'Année': r.annee,
            'Wh Phase A': r.whPhaseA, 'Wh Phase B': r.whPhaseB, 'Wh Phase C': r.whPhaseC, 'Wh Total': r.whTotal,
            'Wh Retour A': r.whRetourA, 'Wh Retour B': r.whRetourB, 'Wh Retour C': r.whRetourC, 'Wh Retour Total': r.whRetourTotal,
            'kWh A': +((r.kwhA ?? 0).toFixed(3)), 'kWh B': +((r.kwhB ?? 0).toFixed(3)), 'kWh C': +((r.kwhC ?? 0).toFixed(3)), 'kWh Total': +((r.kwhTotal ?? 0).toFixed(3)),
            'kWh Retour A': +((r.kwhRetourA ?? 0).toFixed(3)), 'kWh Retour B': +((r.kwhRetourB ?? 0).toFixed(3)), 'kWh Retour C': +((r.kwhRetourC ?? 0).toFixed(3)), 'kWh Retour Total': +((r.kwhRetourTotal ?? 0).toFixed(3)),
            'kWh Cum Total': +((r.kwhCumTotal ?? 0).toFixed(3)),
            'Puiss. kW A': +((r.puissKwA ?? 0).toFixed(3)), 'Puiss. kW B': +((r.puissKwB ?? 0).toFixed(3)), 'Puiss. kW C': +((r.puissKwC ?? 0).toFixed(3)), 'Puiss. kW Total': +((r.puissKwTotal ?? 0).toFixed(3)),
            'kWh Net': +((r.kwhNet ?? 0).toFixed(3)),
            'Profil': r.profil,
          })),
        },
        {
          name: 'Mensuel',
          data: chartDataMensuel.map(m => ({
            'Mois': m.mois,
            'kWh Total': m.kwhTotal,
            'kWh Net': m.kwhNet,
            'kWh Retour': m.kwhRetour,
            'Nb jours': m.nbJours,
          })),
        },
      ],
      'profil_charge_shelly.xlsx'
    );
  };


  return (
    <div className="space-y-6">

      {/* ── Panneau source de données ─────────────────────────── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm font-medium">Source :</span>
          <button
            onClick={() => setSourceMode('csv')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sourceMode === 'csv'
                ? 'bg-blue-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            Fichiers importés {csvRows.length > 0 && <span className="ml-1 opacity-60">({csvRows.length}j)</span>}
          </button>
          <button
            onClick={() => { setSourceMode('supabase'); if (sbDevices.length === 0) loadDevices(sbSelectedSites); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sourceMode === 'supabase'
                ? 'bg-violet-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            <Database className="h-3.5 w-3.5" /> Supabase temps réel
          </button>
        </div>

        {sourceMode === 'supabase' && (
          <div className="flex flex-wrap items-end gap-3 pt-1">

            {/* ── Sites ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Sites {sbSelectedSites.length > 0 && <span className="text-violet-400">({sbSelectedSites.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-40 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedSites.length === 0 ? 'Tous les sites' : sbSelectedSites.join(', ')}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-[#1a1d2e] border-white/20" align="start">
                  {SITES.map(s => (
                    <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={sbSelectedSites.includes(s)} onChange={() => toggleSite(s)} className="accent-violet-500" />
                      {s}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Pièces ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Pièces {sbSelectedRooms.length > 0 && <span className="text-violet-400">({sbSelectedRooms.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-44 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedRooms.length === 0 ? 'Toutes les pièces' : `${sbSelectedRooms.length} pièce(s)`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-[#1a1d2e] border-white/20 max-h-60 overflow-y-auto" align="start">
                  {sbAvailableRooms.length === 0
                    ? <p className="text-slate-500 text-xs px-2 py-1">Aucune pièce disponible</p>
                    : sbAvailableRooms.map(r => (
                      <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5 cursor-pointer">
                        <input type="checkbox" checked={sbSelectedRooms.includes(r)} onChange={() => toggleRoom(r)} className="accent-violet-500" />
                        {r}
                      </label>
                    ))
                  }
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Appareils ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">
                Appareils {sbSelectedDeviceIds.length > 0 && <span className="text-violet-400">({sbSelectedDeviceIds.length})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/20 rounded-md text-white text-sm min-w-52 hover:bg-white/10">
                    <span className="flex-1 text-left truncate text-sm">
                      {sbSelectedDeviceIds.length === 0 ? `Tous (${sbDevicesFiltered.length})` : `${sbSelectedDeviceIds.length} appareil(s)`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 bg-[#1a1d2e] border-white/20 max-h-72 overflow-y-auto" align="start">
                  {sbDevicesFiltered.length === 0
                    ? <p className="text-slate-500 text-xs px-2 py-1">Aucun appareil disponible</p>
                    : (() => {
                        const bySite = sbDevicesFiltered.reduce<Record<string, typeof sbDevicesFiltered>>((acc, d) => {
                          (acc[d.site] ??= []).push(d); return acc;
                        }, {});
                        return Object.entries(bySite).map(([site, devs]) => (
                          <div key={site}>
                            {Object.keys(bySite).length > 1 && (
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide px-2 pt-2 pb-1">{site}</p>
                            )}
                            {devs.map(d => (
                              <label key={d.device_id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-white/5 cursor-pointer">
                                <input type="checkbox" checked={sbSelectedDeviceIds.includes(d.device_id)} onChange={() => toggleDevice(d.device_id)} className="accent-violet-500" />
                                <span className="flex-1 truncate">{d.name}</span>
                                {d.room && <span className="text-slate-500 shrink-0">{d.room}</span>}
                              </label>
                            ))}
                          </div>
                        ));
                      })()
                  }
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Dates ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Du</Label>
              <Input type="date" value={sbDateDebut} onChange={e => setSbDateDebut(e.target.value)}
                className="w-36 bg-white/5 border-white/20 text-white text-sm h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Au</Label>
              <Input type="date" value={sbDateFin} onChange={e => setSbDateFin(e.target.value)}
                className="w-36 bg-white/5 border-white/20 text-white text-sm h-8" />
            </div>

            {/* ── Heures ── */}
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">De</Label>
              <select value={sbHeureDebut} onChange={e => setSbHeureDebut(Number(e.target.value))}
                className="w-20 h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-[#1a1d2e]">{String(i).padStart(2, '0')}h</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">À</Label>
              <select value={sbHeureFin} onChange={e => setSbHeureFin(Number(e.target.value))}
                className="w-20 h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-[#1a1d2e]">{String(i).padStart(2, '0')}h</option>
                ))}
              </select>
            </div>

            {/* ── Chips sélection active ── */}
            {(sbSelectedRooms.length > 0 || sbSelectedDeviceIds.length > 0) && (
              <div className="flex flex-wrap gap-1 self-end pb-0.5">
                {sbSelectedRooms.map(r => (
                  <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs border border-violet-500/30">
                    {r}<button onClick={() => toggleRoom(r)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {sbSelectedDeviceIds.map(id => {
                  const d = sbDevices.find(x => x.device_id === id);
                  return d ? (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30">
                      {d.name}<button onClick={() => toggleDevice(id)}><X className="h-3 w-3" /></button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <Button size="sm" onClick={loadFromSupabase} disabled={sbLoading}
              className="bg-violet-600 hover:bg-violet-700 text-white h-8">
              {sbLoading
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />Chargement…</>
                : <><Database className="h-3.5 w-3.5 mr-1" />Charger</>}
            </Button>
            {sbError && <p className="text-red-400 text-xs self-center">{sbError}</p>}
            {supabaseRows.length > 0 && !sbLoading && (
              <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 self-center">
                {supabaseRows.length} jours chargés
              </Badge>
            )}
          </div>
        )}
      </div>

      {shellyRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Zap className="h-12 w-12 opacity-20 mb-4" />
          {sourceMode === 'csv'
            ? <><p className="text-lg font-medium">Aucune donnée Shelly 3EM</p>
              <p className="text-sm mt-1">Importez un fichier dans l'onglet <strong className="text-slate-400">Import</strong> ou basculez sur Supabase.</p></>
            : <><p className="text-lg font-medium">Aucune donnée chargée</p>
              <p className="text-sm mt-1">Sélectionnez un site et une période, puis cliquez sur <strong className="text-slate-400">Charger</strong>.</p></>
          }
        </div>
      )}

      {shellyRows.length > 0 && <>
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Consommation totale"
            value={analyse.totalKwhNet.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/\./g, ',')}
            unit="kWh net"
            sub={`${analyse.nbJours} jours`}
            color="blue"
          />
          <KPICard
            label="Moyenne journalière"
            value={fmtFr(analyse.moyenneJournaliere, 1).replace('.', ',')}
            unit="kWh/j"
            sub={`Max: ${fmtFr(analyse.maxJournalier, 0).replace('.', ',')} · Min: ${fmtFr(analyse.minJournalier, 0).replace('.', ',')}`}
            color="green"
          />
          <KPICard
            label="Énergie retournée"
            value={analyse.totalKwhRetour.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/\./g, ',')}
            unit="kWh"
            sub={`${((analyse.totalKwhRetour / analyse.totalKwhConsomme) * 100).toFixed(1).replace('.', ',')}% du brut`}
            color="purple"
          />
        </div>

        {/* Profil par type de jour */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Jours ouvrés', data: analyse.jourOuvre, color: 'text-blue-400' },
            { label: 'Week-ends', data: analyse.weekend, color: 'text-yellow-400' },
            { label: 'Jours fériés', data: analyse.ferieOuDimanche, color: 'text-purple-400' },
          ].map(({ label, data, color }) => (
            <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-3 text-center">
              <p className="text-slate-400 text-xs">{label}</p>
              <p className={`${color} text-xl font-bold mt-1`}>{fmtFr(data.kwhMoyen, 1)}</p>
              <p className="text-slate-500 text-xs">kWh moyen/j · {data.nbJours}j</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 bg-white/5 rounded-xl border border-white/10 p-4">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="journalier">Journalier</SelectItem>
              <SelectItem value="mensuel">Mensuel</SelectItem>
            </SelectContent>
          </Select>

          <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
            <SelectTrigger className="w-36 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="aire">Courbe / Aire</SelectItem>
              <SelectItem value="barres">Histogramme</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
            <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="tous">Tous les jours</SelectItem>
              <SelectItem value="ouvrés">Jours ouvrés</SelectItem>
              <SelectItem value="weekends">Week-ends</SelectItem>
              <SelectItem value="fériés">Jours fériés</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={exportExcel}
            >
              <Download className="h-4 w-4 mr-1" /> Export Excel
            </Button>
          </div>
        </div>

        {/* Graphique principal */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h3 className="text-white font-semibold">
              {viewMode === 'journalier' ? 'Profil de charge journalier' : 'Consommation mensuelle'}
            </h3>
            {/* Sélecteur multi-métriques (pills cliquables) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 text-xs mr-1">Métriques :</span>
              {METRICS.map(m => {
                const active = isMetric(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => toggleMetric(m.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? 'border-transparent text-white' : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30'
                      }`}
                    style={active ? { backgroundColor: m.color + '30', borderColor: m.color, color: m.color } : undefined}
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </button>
                );
              })}
              {selectedMetrics.size === 0 && (
                <span className="text-amber-400 text-xs ml-2">Aucune métrique sélectionnée</span>
              )}
            </div>
          </div>

          <ResponsiveContainer key={`${viewMode}-${chartType}`} width="100%" height={360}>
            {viewMode === 'mensuel' ? (
              <BarChart data={chartDataMensuel} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Mois', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" kWh"
                  label={{ value: 'Énergie (kWh)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                {METRICS.filter(m => m.mensuelKey && isMetric(m.key)).map(m => (
                  <Bar key={m.key} dataKey={m.mensuelKey!} name={m.label} fill={m.color} unit={m.unit}
                    radius={[4, 4, 0, 0]} hide={isHidden(m.mensuelKey!)} />
                ))}
              </BarChart>
            ) : chartType === 'aire' ? (
              <AreaChart data={chartDataJournalier} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd"
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Valeur', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                <ReferenceLine y={statsKwh.moyenne} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: `Moy. ${fmtFr(statsKwh.moyenne, 1)} kWh`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                {METRICS.filter(m => isMetric(m.key)).map(m => (
                  <Area key={m.key} type="monotone" dataKey={m.key} name={m.label} unit={m.unit}
                    stroke={m.color} fill={`${m.color}25`} strokeWidth={m.key === 'total' ? 2.5 : 1.5}
                    hide={isHidden(m.key)} />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={chartDataJournalier} margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd"
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ value: 'Valeur', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', cursor: 'pointer', paddingTop: 8 }}
                  onClick={(e) => toggleSeries(String(e.dataKey ?? ''))} />
                {METRICS.filter(m => isMetric(m.key)).map(m => (
                  <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} unit={m.unit}
                    radius={[2, 2, 0, 0]} hide={isHidden(m.key)} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Tableau de données journalières */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Données journalières
            </h3>
            <Badge variant="outline" className="border-white/20 text-slate-300">
              {filteredRows.length} jours
            </Badge>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[#1a1d2e] z-10">
                <tr>
                  {['Date', 'Jour', 'kWh Tot', 'kWh Ret', 'kWh Cum'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                  {/* Conso. par phase */}
                  <th className="px-2 py-2 text-right text-purple-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Conso. A</th>
                  <th className="px-2 py-2 text-right text-yellow-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Conso. B</th>
                  <th className="px-2 py-2 text-right text-pink-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Conso. C</th>
                  <th className="px-2 py-2 text-right text-cyan-400/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">kWh Net</th>
                  {/* Puissance par phase */}
                  <th className="px-2 py-2 text-right text-green-400/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Puiss. Tot</th>
                  <th className="px-2 py-2 text-right text-purple-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Puiss. A</th>
                  <th className="px-2 py-2 text-right text-yellow-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Puiss. B</th>
                  <th className="px-2 py-2 text-right text-pink-300/80 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Puiss. C</th>
                  <th className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10 text-[10px] uppercase tracking-wide">Profil</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  return (
                    <tr key={i} className={`border-t border-white/5 hover:bg-white/5 ${r.jourActivites === 'Jour férié' ? 'bg-purple-500/5' :
                        r.jourActivites === 'Weekend' ? 'bg-yellow-500/5' : ''
                      }`}>
                      <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{(r.date instanceof Date ? r.date : new Date(r.date as string)).toLocaleDateString('fr-FR')}</td>
                      <td className="px-2 py-1.5 text-slate-400">{r.jourSemaine}</td>
                      <td className="px-2 py-1.5 text-blue-400 text-right">{fmtFr(r.kwhTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-purple-400 text-right">{fmtFr(r.kwhRetourTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-slate-400 text-right">{fmtFr(r.kwhCumTotal, 1)}</td>
                      {/* Conso. par phase */}
                      <td className="px-2 py-1.5 text-purple-300 text-right">{fmtFr(r.kwhA, 2)}</td>
                      <td className="px-2 py-1.5 text-yellow-300 text-right">{fmtFr(r.kwhB, 2)}</td>
                      <td className="px-2 py-1.5 text-pink-300 text-right">{fmtFr(r.kwhC, 2)}</td>
                      <td className="px-2 py-1.5 text-cyan-400 text-right font-medium">{fmtFr(r.kwhNet, 2)}</td>
                      {/* Puissance par phase */}
                      <td className="px-2 py-1.5 text-green-400 text-right">{fmtFr(r.puissKwTotal, 2)}</td>
                      <td className="px-2 py-1.5 text-purple-300 text-right">{fmtFr(r.puissKwA, 2)}</td>
                      <td className="px-2 py-1.5 text-yellow-300 text-right">{fmtFr(r.puissKwB, 2)}</td>
                      <td className="px-2 py-1.5 text-pink-300 text-right">{fmtFr(r.puissKwC, 2)}</td>
                      <td className="px-2 py-1.5">
                        <Badge className={`border-0 text-[10px] ${r.profil === 'CHARGE' ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}>
                          {r.profil}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </>}
    </div>
  );
}
