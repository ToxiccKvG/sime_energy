// ============================================================
// IOT MODULE — Dashboard temps réel multi-sites
// Page par défaut du module IOT : vue globale Supabase avec polling 30s
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, RefreshCw, Pause, Play, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  fetchLatestSnapshot, fetchDevices, fetchEnergyByDevice,
  fetchHourlyHeatmap, fetchCalendarActivity, computeAlerts,
  DEFAULT_FILTERS,
  type ShellyClRow, type Device, type EnergyAgg, type HeatmapCell, type CalendarDay, type Alert,
  type Filters,
} from '@/lib/iot-dashboard-service';
import { FilterBar } from './dashboard/FilterBar';
import { KPIBand } from './dashboard/KPIBand';
import { TopConsumersCard } from './dashboard/TopConsumersCard';
import { StatusGridCard } from './dashboard/StatusGridCard';
import { EnergyFlowCard } from './dashboard/EnergyFlowCard';
import { PhaseQualityCard } from './dashboard/PhaseQualityCard';
import { HeatmapCard } from './dashboard/HeatmapCard';
import { CalendarCard } from './dashboard/CalendarCard';
import { SensorsCard } from './dashboard/SensorsCard';
import { AlertsCard } from './dashboard/AlertsCard';

const POLL_INTERVAL_MS = 30_000;

export function DashboardTab() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [snapshot, setSnapshot] = useState<ShellyClRow[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [energyAgg, setEnergyAgg] = useState<EnergyAgg[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compteur "il y a Xs"
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const [snap, devs, energy, heat, cal] = await Promise.all([
        fetchLatestSnapshot(filters),
        fetchDevices(
          filters.sites.length > 0 ? filters.sites : undefined,
          filters.families.length > 0 ? filters.families : undefined,
        ),
        fetchEnergyByDevice(filters, filters.period),
        fetchHourlyHeatmap(filters, filters.period === 'live' || filters.period === '1h' ? '24h' : filters.period),
        fetchCalendarActivity(filters),
      ]);
      if (ctrl.signal.aborted) return;
      setSnapshot(snap);
      setAllDevices(devs);
      setEnergyAgg(energy);
      setHeatmap(heat);
      setCalendarDays(cal);
      setAlerts(computeAlerts(snap, devs));
      setLastUpdate(new Date());
    } catch (e) {
      console.error('[Dashboard] fetchAll error:', e);
      if (!ctrl.signal.aborted) {
        const msg = e instanceof Error
          ? e.message
          : (e as any)?.message ?? JSON.stringify(e);
        setError(msg);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [filters]);

  // Fetch initial + à chaque changement de filtres
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Polling 30s — uniquement en mode live
  useEffect(() => {
    if (paused || filters.period !== 'live') return;
    const id = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll, paused, filters.period]);

  // Compteur d'alertes par site (pour KPIBand)
  const alertsBySite = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of alerts) map[a.site] = (map[a.site] ?? 0) + 1;
    return map;
  }, [alerts]);

  const alertDeviceIds = useMemo(() => new Set(alerts.map(a => a.device_id)), [alerts]);

  const isHistoric = filters.period !== 'live';
  const showAcademy = filters.sites.length === 0 || filters.sites.includes('Académie CER2E');
  const ageSec = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000) : null;

  return (
    <div className="space-y-3">
      {/* Barre de statut */}
      <div className="flex items-center justify-between gap-3 px-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
            isHistoric
              ? 'bg-amber-600/30 border-amber-500/50'
              : 'bg-blue-600/30 border-blue-500/50'
          }`}>
            {isHistoric
              ? <History className="h-4 w-4 text-amber-400" />
              : <LayoutDashboard className="h-4 w-4 text-blue-400" />
            }
          </div>
          <div>
            <h2 className="text-white font-bold text-base flex items-center gap-2">
              {isHistoric ? 'Historique de consommation' : 'Dashboard temps réel'}
              {isHistoric && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0">
                  Wh / kWh
                </Badge>
              )}
            </h2>
            <p className="text-slate-500 text-xs">
              {isHistoric
                ? 'Consommation cumulée · phases A/B/C · Supabase'
                : 'Vue globale Shelly Cloud · 2 sites · polling Supabase 30 s'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 text-blue-400">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Chargement…
            </span>
          ) : lastUpdate ? (
            <span className="text-slate-400">
              {isHistoric
                ? <span className="text-slate-400">Données chargées</span>
                : <>Dernière MAJ il y a <span className="text-white font-medium">{ageSec}s</span></>
              }
            </span>
          ) : (
            <span className="text-slate-500">En attente…</span>
          )}
          {!isHistoric && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-white"
              onClick={() => setPaused(p => !p)}
              title={paused ? 'Reprendre le polling' : 'Mettre en pause'}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-white"
            onClick={fetchAll} disabled={loading} title="Forcer une actualisation">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filtres sticky */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Erreur */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-red-400 text-sm">
          Erreur de chargement : {error}
        </div>
      )}

      {/* Section 1 : KPIs globaux */}
      <KPIBand
        snapshot={snapshot}
        allDevices={allDevices}
        alertsBySite={alertsBySite}
        period={filters.period}
        energyAgg={energyAgg}
      />

      {/* Section 4 + 5 : Flux PV (Académie) + Qualité réseau */}
      {showAcademy && (
        <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-3">
          <EnergyFlowCard snapshot={snapshot} energyAgg={energyAgg} period={filters.period} />
          <PhaseQualityCard snapshot={snapshot} />
        </div>
      )}

      {/* Section 2 + 9 : Top consommateurs + Alertes */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-3">
        <TopConsumersCard snapshot={snapshot} energyAgg={energyAgg} period={filters.period} />
        <AlertsCard alerts={alerts} />
      </div>

      {/* Section 3 : État appareils */}
      <StatusGridCard snapshot={snapshot} allDevices={allDevices} alertDeviceIds={alertDeviceIds} />

      {/* Section 8 : Capteurs */}
      <SensorsCard snapshot={snapshot} />

      {/* Section 6 + 7 : Heatmap + Calendrier */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-3">
        <HeatmapCard cells={heatmap} />
        <CalendarCard days={calendarDays} />
      </div>
    </div>
  );
}
