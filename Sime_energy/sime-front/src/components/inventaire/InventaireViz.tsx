import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, RefreshCw, BarChart3 } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getInventorySnapshot } from '@/lib/inventory-service';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { BilanGlobal } from './inventaire-viz/BilanGlobal';
import { TcdAutresCharges } from './inventaire-viz/TcdAutresCharges';
import { TcdClimatisation } from './inventaire-viz/TcdClimatisation';
import { TcdDensite } from './inventaire-viz/TcdDensite';
import { TcdEclairage } from './inventaire-viz/TcdEclairage';
import { VueEnsemble } from './inventaire-viz/VueEnsemble';
import { GroupBy, buildCategoryStats, buildGroupStats } from './inventaire-viz/stats';

// ── Main component ─────────────────────────────────────────────────────────────

interface InventaireVizProps {
  auditId: string;
  onNavigateTo?: (sel: SelectionNode) => void;
}

type VizTab = 'overview' | 'eclairage' | 'clim' | 'autres' | 'bilan' | 'densite';

export function InventaireViz({ auditId, onNavigateTo }: InventaireVizProps) {
  const [snapshot,         setSnapshot]         = useState<EquipmentSnapshot[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [activeTab,        setActiveTab]        = useState<VizTab>('overview');
  const [filterSiteId,     setFilterSiteId]     = useState('');
  const [filterBuildingId, setFilterBuildingId] = useState('');
  const [filterLevelId,    setFilterLevelId]    = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [activeOnly,       setActiveOnly]       = useState(true);
  const [manualGroupBy,    setManualGroupBy]    = useState<GroupBy | null>(null);

  const fetchSnapshot = useCallback(() => {
    if (!auditId) return;
    setLoading(true);
    getInventorySnapshot(auditId)
      .then(setSnapshot)
      .catch(err => toast.error('Erreur chargement: ' + err.message))
      .finally(() => setLoading(false));
  }, [auditId]);

  useEffect(() => {
    setFilterSiteId('');
    setFilterBuildingId('');
    setFilterLevelId('');
    setFilterCategoryId('');
    setManualGroupBy(null);
    fetchSnapshot();
  }, [auditId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset manual groupBy when scope filters change
  useEffect(() => { setManualGroupBy(null); }, [filterSiteId, filterBuildingId, filterLevelId]);

  // ── Unique values for filter dropdowns ─────────────────────────────────
  const sites = useMemo(() => {
    const seen = new Set<string>();
    return snapshot
      .filter(e => e.siteId && !seen.has(e.siteId) && seen.add(e.siteId))
      .map(e => ({ id: e.siteId, name: e.siteName }));
  }, [snapshot]);

  const buildings = useMemo(() => {
    const seen = new Set<string>();
    return snapshot
      .filter(e =>
        e.buildingId &&
        (!filterSiteId || e.siteId === filterSiteId) &&
        !seen.has(e.buildingId) && seen.add(e.buildingId),
      )
      .map(e => ({ id: e.buildingId, name: e.buildingName }));
  }, [snapshot, filterSiteId]);

  const levels = useMemo(() => {
    const seen = new Set<string>();
    return snapshot
      .filter(e =>
        e.levelId &&
        (!filterBuildingId || e.buildingId === filterBuildingId) &&
        !seen.has(e.levelId) && seen.add(e.levelId),
      )
      .map(e => ({ id: e.levelId, name: e.levelName }));
  }, [snapshot, filterBuildingId]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return snapshot
      .filter(e => e.categoryId && !seen.has(e.categoryId) && seen.add(e.categoryId))
      .map(e => ({ id: e.categoryId, name: e.categoryName, color: e.categoryColor }));
  }, [snapshot]);

  // ── Filtered dataset ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = snapshot;
    if (activeOnly)        data = data.filter(e => e.status === 'EN service');
    if (filterSiteId)      data = data.filter(e => e.siteId     === filterSiteId);
    if (filterBuildingId)  data = data.filter(e => e.buildingId === filterBuildingId);
    if (filterLevelId)     data = data.filter(e => e.levelId    === filterLevelId);
    if (filterCategoryId)  data = data.filter(e => e.categoryId === filterCategoryId);
    return data;
  }, [snapshot, activeOnly, filterSiteId, filterBuildingId, filterLevelId, filterCategoryId]);

  // ── Per-category filtered subsets for TCD tabs ──────────────────────────
  const filteredEclairage = useMemo(() =>
    filtered.filter(e => e.categoryName.toUpperCase().includes('CLAIRAGE')), [filtered]);
  const filteredClim = useMemo(() =>
    filtered.filter(e => e.categoryName.toUpperCase().includes('CLIM')), [filtered]);
  const filteredAutres = useMemo(() =>
    filtered.filter(e => {
      const n = e.categoryName.toUpperCase();
      return n.includes('DIVERS') || n.includes('APPAREILS') || n.includes('AUTRES');
    }), [filtered]);

  // ── Aggregations ────────────────────────────────────────────────────────
  const categoryStats = useMemo(() => buildCategoryStats(filtered), [filtered]);

  const hasZones = useMemo(() => snapshot.some(e => !!e.zoneId), [snapshot]);

  const autoGroupBy: GroupBy = filterLevelId   ? 'room'
    : filterBuildingId ? 'level'
    : filterSiteId     ? 'building'
    : sites.length > 1 ? 'site'
    : 'level';

  const groupBy: GroupBy = manualGroupBy ?? autoGroupBy;

  const GROUP_LABELS: Record<GroupBy, string> = {
    room:     'Pièces',
    level:    'Étages',
    zone:     'Zones',
    building: 'Bâtiments',
    site:     'Sites',
  };
  const groupLabel = GROUP_LABELS[groupBy];

  const topGroups = useMemo(() => buildGroupStats(filtered, groupBy), [filtered, groupBy]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    nb:   filtered.reduce((s, e) => s + e.quantity, 0),
    kw:   filtered.reduce((s, e) => s + (e.totalPowerW ?? 0), 0),
    kwh:  filtered.reduce((s, e) => s + (e.kwhPerYear  ?? 0), 0),
    cats: new Set(filtered.map(e => e.categoryId).filter(Boolean)).size,
    rooms: new Set(filtered.map(e => e.roomId).filter(Boolean)).size,
  }), [filtered]);

  const hasKwhData = kpis.kwh > 0;
  const dataKey: 'kwhAn' | 'totalPowerW'    = hasKwhData ? 'kwhAn' : 'totalPowerW';

  // ── Loading / empty ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!snapshot.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
        <BarChart3 className="w-12 h-12 opacity-20" />
        <p className="text-sm font-medium text-slate-400">Aucun équipement recensé</p>
        <p className="text-xs">Commencez par ajouter des équipements dans l'onglet Cadastre</p>
      </div>
    );
  }

  const VIZ_TABS: { id: VizTab; label: string }[] = [
    { id: 'overview',  label: 'Vue d\'ensemble' },
    { id: 'eclairage', label: 'TCD Éclairage' },
    { id: 'clim',      label: 'TCD Climatisation' },
    { id: 'autres',    label: 'TCD Autres Charges' },
    { id: 'densite',   label: 'Densité surfacique' },
    { id: 'bilan',     label: 'Bilan Global' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto space-y-4 pb-6 pr-1">

      {/* ── Site pills — visible above everything when multiple sites ── */}
      {sites.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap border-b border-slate-800/60 pb-3 mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mr-1">Site</span>
          <button
            onClick={() => { setFilterSiteId(''); setFilterBuildingId(''); setFilterLevelId(''); }}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-all ${
              !filterSiteId
                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            Global
          </button>
          {sites.map(s => (
            <button
              key={s.id}
              onClick={() => { setFilterSiteId(s.id); setFilterBuildingId(''); setFilterLevelId(''); }}
              className={`h-7 px-3 rounded-full text-xs font-medium transition-all ${
                filterSiteId === s.id
                  ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Scope selectors — cascade (building/level when site is selected) */}

        {filterSiteId && buildings.length > 1 && (
          <Select
            value={filterBuildingId || '__all__'}
            onValueChange={v => {
              setFilterBuildingId(v === '__all__' ? '' : v);
              setFilterLevelId('');
            }}
          >
            <SelectTrigger className="h-7 w-40 text-xs bg-[#1a1d2e] border-slate-700 text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-slate-700">
              <SelectItem value="__all__" className="text-slate-100 text-xs focus:bg-slate-700/50">Tous les bâtiments</SelectItem>
              {buildings.map(b => (
                <SelectItem key={b.id} value={b.id} className="text-slate-100 text-xs focus:bg-slate-700/50">{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {filterBuildingId && levels.length > 1 && (
          <Select
            value={filterLevelId || '__all__'}
            onValueChange={v => setFilterLevelId(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-7 w-36 text-xs bg-[#1a1d2e] border-slate-700 text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-slate-700">
              <SelectItem value="__all__" className="text-slate-100 text-xs focus:bg-slate-700/50">Tous les étages</SelectItem>
              {levels.map(l => (
                <SelectItem key={l.id} value={l.id} className="text-slate-100 text-xs focus:bg-slate-700/50">{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {filterSiteId && (buildings.length > 1 || filterBuildingId) && (
          <div className="w-px h-5 bg-slate-700/50 mx-1" />
        )}

        {/* Category filter pills — only on overview */}
        {activeTab === 'overview' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategoryId('')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
                !filterCategoryId
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-slate-800/70 text-slate-400 hover:bg-slate-700/60'
              }`}
            >Toutes</button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setFilterCategoryId(prev => prev === c.id ? '' : c.id)}
                className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                  filterCategoryId === c.id
                    ? 'text-white'
                    : 'bg-slate-800/70 text-slate-400 hover:bg-slate-700/60'
                }`}
                style={filterCategoryId === c.id ? { background: c.color } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setActiveOnly(v => !v)}
            className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
              activeOnly ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800/70 text-slate-400'
            }`}
          >
            {activeOnly ? 'EN service' : 'Tous statuts'}
          </button>
          <Button
            variant="ghost" size="sm"
            onClick={fetchSnapshot}
            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex border-b border-slate-800 -mb-1">
        {VIZ_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-indigo-500 text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'overview' && (
        <VueEnsemble
          filtered={filtered}
          categoryStats={categoryStats}
          topGroups={topGroups}
          groupLabel={groupLabel}
          groupBy={groupBy}
          kpis={kpis}
          hasKwhData={hasKwhData}
          dataKey={dataKey}
          hasZones={hasZones}
          manualGroupBy={manualGroupBy}
          setManualGroupBy={setManualGroupBy}
          onRefresh={fetchSnapshot}
          onNavigateTo={onNavigateTo}
        />
      )}
      {activeTab === 'eclairage' && <TcdEclairage items={filteredEclairage} onNavigateTo={onNavigateTo} />}
      {activeTab === 'clim'      && <TcdClimatisation items={filteredClim} onNavigateTo={onNavigateTo} />}
      {activeTab === 'autres'    && <TcdAutresCharges items={filteredAutres} onNavigateTo={onNavigateTo} />}
      {activeTab === 'densite'   && <TcdDensite items={filtered} />}
      {activeTab === 'bilan'     && <BilanGlobal items={filtered} />}

    </div>
  );
}
