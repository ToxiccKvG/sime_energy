import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Loader2, RefreshCw, Zap, BarChart3, Activity, Tag, Pencil } from 'lucide-react';
import type { SelectionNode } from '@/pages/Inventaire';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getInventorySnapshot } from '@/lib/inventory-service';
import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { formatEnergy, formatPower, formatNumber } from '@/lib/format';

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtKwh = formatEnergy;
const fmtKw  = formatPower;
const fmtNum = formatNumber;

// ── Aggregation types ─────────────────────────────────────────────────────────

interface CategoryStat {
  categoryId:   string;
  categoryName: string;
  color:        string;
  nb:           number;
  totalPowerW:  number;
  kwhAn:        number;
  pct:          number;
}

interface GroupStat {
  label:       string;
  kwhAn:       number;
  totalPowerW: number;
  nb:          number;
  entityId?:   string;  // id of this entity (room/level/building/zone/site)
  parentId?:   string;  // parent entity id for SelectionNode context
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function buildCategoryStats(items: EquipmentSnapshot[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const e of items) {
    const key = e.categoryId || '__none__';
    if (!map.has(key)) {
      map.set(key, {
        categoryId:   e.categoryId,
        categoryName: e.categoryName,
        color:        e.categoryColor,
        nb:           0,
        totalPowerW:  0,
        kwhAn:        0,
        pct:          0,
      });
    }
    const s = map.get(key)!;
    s.nb          += e.quantity;
    s.totalPowerW += e.totalPowerW ?? 0;
    s.kwhAn       += e.kwhPerYear  ?? 0;
  }

  const totalKwh   = Array.from(map.values()).reduce((s, c) => s + c.kwhAn, 0);
  const totalPower = Array.from(map.values()).reduce((s, c) => s + c.totalPowerW, 0);

  return Array.from(map.values())
    .map(s => ({
      ...s,
      pct: totalKwh > 0
        ? (s.kwhAn       / totalKwh)   * 100
        : totalPower > 0 ? (s.totalPowerW / totalPower) * 100 : 0,
    }))
    .sort((a, b) => (b.kwhAn || b.totalPowerW) - (a.kwhAn || a.totalPowerW));
}

type GroupBy = 'room' | 'level' | 'zone' | 'building' | 'site';

function buildGroupStats(items: EquipmentSnapshot[], by: GroupBy): GroupStat[] {
  const map = new Map<string, GroupStat>();

  for (const e of items) {
    const key =
      by === 'room'     ? (e.roomId     || e.roomCode)     :
      by === 'level'    ? (e.levelId    || e.levelName)    :
      by === 'zone'     ? (e.zoneId     || e.zoneName)     :
      by === 'building' ? (e.buildingId || e.buildingName) :
      (e.siteId || e.siteName);

    if (!key) continue;

    const label =
      by === 'room'     ? e.roomCode + (e.roomService ? ` — ${e.roomService}` : '') :
      by === 'level'    ? e.levelName    :
      by === 'zone'     ? e.zoneName     :
      by === 'building' ? e.buildingName :
      e.siteName;

    const entityId =
      by === 'room'     ? e.roomId     :
      by === 'level'    ? e.levelId    :
      by === 'zone'     ? e.zoneId     :
      by === 'building' ? e.buildingId :
      e.siteId;

    const parentId =
      by === 'room'     ? e.levelId    :
      by === 'level'    ? e.buildingId :
      by === 'zone'     ? e.siteId     :
      undefined;

    if (!map.has(key)) map.set(key, { label, kwhAn: 0, totalPowerW: 0, nb: 0, entityId, parentId });
    const g = map.get(key)!;
    g.kwhAn       += e.kwhPerYear  ?? 0;
    g.totalPowerW += e.totalPowerW ?? 0;
    g.nb          += e.quantity;
  }

  return Array.from(map.values())
    .sort((a, b) => (b.kwhAn || b.totalPowerW) - (a.kwhAn || a.totalPowerW))
    .slice(0, 12);
}

// ── Custom Recharts tooltips ──────────────────────────────────────────────────

const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as CategoryStat;
  return (
    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2.5 shadow-xl text-xs">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
        <span className="text-slate-100 font-semibold">{d.categoryName}</span>
      </div>
      <div className="pl-4 text-slate-400 space-y-0.5">
        <div>Énergie : <span className="text-slate-200">{fmtKwh(d.kwhAn)}/an</span></div>
        <div>Puissance : <span className="text-slate-200">{fmtKw(d.totalPowerW)}</span></div>
        <div>Équipements : <span className="text-slate-200">{fmtNum(d.nb)}</span></div>
        <div>Part : <span className="font-semibold" style={{ color: d.color }}>{d.pct.toFixed(1)}%</span></div>
      </div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as GroupStat;
  return (
    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2.5 shadow-xl text-xs">
      <p className="text-slate-100 font-semibold mb-1.5 truncate max-w-[200px]">{label}</p>
      <div className="text-slate-400 space-y-0.5">
        <div>Énergie : <span className="text-slate-200">{fmtKwh(d.kwhAn)}/an</span></div>
        <div>Puissance : <span className="text-slate-200">{fmtKw(d.totalPowerW)}</span></div>
        <div>Équipements : <span className="text-slate-200">{fmtNum(d.nb)}</span></div>
      </div>
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-[#1a1d2e] rounded-xl p-4 border border-slate-800/60 flex items-start gap-3">
      <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${color}22` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-100 leading-none truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── TCD table cell helper ─────────────────────────────────────────────────────

function TdNum({ v, unit = '', dash = false }: { v: number; unit?: string; dash?: boolean }) {
  if (dash && v === 0) return <td className="text-right px-3 py-2 text-slate-600">—</td>;
  return (
    <td className="text-right px-3 py-2 text-slate-300 tabular-nums">
      {formatNumber(v, v >= 10 ? 0 : 2)}{unit && <span className="text-slate-500 text-[10px] ml-1">{unit}</span>}
    </td>
  );
}

// ── TCD ÉCLAIRAGE ─────────────────────────────────────────────────────────────

function TcdEclairage({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      level: string; building: string; levelId: string; buildingId: string;
      nbLuminaires: number; nbLampes: number; powerW: number; surface: number; kwhAn: number;
    }>();
    for (const e of items) {
      const m = e.metadata;
      const key = e.levelId || e.levelName;
      if (!map.has(key)) {
        map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nbLuminaires: 0, nbLampes: 0, powerW: 0, surface: 0, kwhAn: 0 });
      }
      const r = map.get(key)!;
      r.nbLuminaires += m.nbLuminaires ?? 0;
      r.nbLampes     += e.quantity;
      r.powerW       += e.totalPowerW ?? 0;
      r.surface      += m.surfaceLocale ?? 0;
      r.kwhAn        += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    nbLuminaires: acc.nbLuminaires + r.nbLuminaires,
    nbLampes: acc.nbLampes + r.nbLampes,
    powerW: acc.powerW + r.powerW,
    surface: acc.surface + r.surface,
    kwhAn: acc.kwhAn + r.kwhAn,
  }), { nbLuminaires: 0, nbLampes: 0, powerW: 0, surface: 0, kwhAn: 0 }), [rows]);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/50">
        <p className="text-xs font-semibold text-slate-300">TCD Éclairage — par étage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Nb luminaires</th>
              <th className="text-right px-3 py-2.5 font-medium">Nb lampes</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (W)</th>
              <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
              <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                <td className="px-3 py-2 text-slate-400">{r.building}</td>
                <TdNum v={r.nbLuminaires} />
                <TdNum v={r.nbLampes} />
                <TdNum v={r.powerW} unit="W" />
                <TdNum v={r.surface} unit="m²" dash />
                <TdNum v={r.surface > 0 ? r.powerW / r.surface : 0} unit="W/m²" dash />
                <TdNum v={r.kwhAn} unit="kWh" dash />
                {onNavigateTo && (
                  <td className="px-1 py-2 text-center">
                    <button
                      onClick={() => r.levelId && onNavigateTo({ type: 'level', id: r.levelId, buildingId: r.buildingId })}
                      title="Voir dans le Cadastre"
                      className="p-1 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
              <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
              <TdNum v={totals.nbLuminaires} />
              <TdNum v={totals.nbLampes} />
              <TdNum v={totals.powerW} unit="W" />
              <TdNum v={totals.surface} unit="m²" />
              <TdNum v={totals.surface > 0 ? totals.powerW / totals.surface : 0} unit="W/m²" dash />
              <TdNum v={totals.kwhAn} unit="kWh" dash />
              {onNavigateTo && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TCD CLIMATISATION ─────────────────────────────────────────────────────────

function TcdClimatisation({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      level: string; building: string; levelId: string; buildingId: string;
      nb: number; elecW: number; frigoW: number; copSum: number; copCount: number;
      surface: number; volumeM3: number; kwhAn: number;
    }>();
    for (const e of items) {
      const m = e.metadata;
      const key = e.levelId || e.levelName;
      if (!map.has(key)) {
        map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nb: 0, elecW: 0, frigoW: 0, copSum: 0, copCount: 0, surface: 0, volumeM3: 0, kwhAn: 0 });
      }
      const r = map.get(key)!;
      r.nb     += e.quantity;
      r.elecW  += e.totalPowerW ?? 0;
      r.frigoW += (m.puissanceFrigoW ?? 0);
      if (m.cop && m.cop > 0) { r.copSum += m.cop; r.copCount++; }
      r.surface  += m.surfaceClim ?? 0;
      r.volumeM3 += m.volumeM3 ?? 0;
      r.kwhAn    += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.elecW - a.elecW);
  }, [items]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    nb: acc.nb + r.nb,
    elecW: acc.elecW + r.elecW,
    frigoW: acc.frigoW + r.frigoW,
    surface: acc.surface + r.surface,
    volumeM3: acc.volumeM3 + r.volumeM3,
    kwhAn: acc.kwhAn + r.kwhAn,
  }), { nb: 0, elecW: 0, frigoW: 0, surface: 0, volumeM3: 0, kwhAn: 0 }), [rows]);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/50">
        <p className="text-xs font-semibold text-slate-300">TCD Climatisation — par étage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Unités</th>
              <th className="text-right px-3 py-2.5 font-medium">kW élec.</th>
              <th className="text-right px-3 py-2.5 font-medium">kW frigo.</th>
              <th className="text-right px-3 py-2.5 font-medium">EER moy.</th>
              <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
              <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const eerMoy = r.copCount > 0 ? r.copSum / r.copCount : 0;
              return (
                <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                  <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                  <td className="px-3 py-2 text-slate-400">{r.building}</td>
                  <TdNum v={r.nb} />
                  <TdNum v={r.elecW / 1000} unit="kW" />
                  <TdNum v={r.frigoW / 1000} unit="kW" dash />
                  <TdNum v={eerMoy} dash />
                  <TdNum v={r.surface} unit="m²" dash />
                  <TdNum v={r.surface > 0 ? r.elecW / r.surface : 0} unit="W/m²" dash />
                  <TdNum v={r.kwhAn} unit="kWh" dash />
                  {onNavigateTo && (
                    <td className="px-1 py-2 text-center">
                      <button
                        onClick={() => r.levelId && onNavigateTo({ type: 'level', id: r.levelId, buildingId: r.buildingId })}
                        title="Voir dans le Cadastre"
                        className="p-1 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
              <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
              <TdNum v={totals.nb} />
              <TdNum v={totals.elecW / 1000} unit="kW" />
              <TdNum v={totals.frigoW / 1000} unit="kW" dash />
              <td className="text-right px-3 py-2 text-slate-600">—</td>
              <TdNum v={totals.surface} unit="m²" />
              <TdNum v={totals.surface > 0 ? totals.elecW / totals.surface : 0} unit="W/m²" dash />
              <TdNum v={totals.kwhAn} unit="kWh" dash />
              {onNavigateTo && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TCD AUTRES CHARGES ────────────────────────────────────────────────────────

function TcdAutresCharges({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {
  // By level
  const byLevel = useMemo(() => {
    const map = new Map<string, { level: string; building: string; levelId: string; buildingId: string; nb: number; powerW: number; kwhAn: number; }>();
    for (const e of items) {
      const key = e.levelId || e.levelName;
      if (!map.has(key)) map.set(key, { level: e.levelName, building: e.buildingName, levelId: e.levelId, buildingId: e.buildingId, nb: 0, powerW: 0, kwhAn: 0 });
      const r = map.get(key)!;
      r.nb     += e.quantity;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  // By category (metadata.categorie)
  const byCategorie = useMemo(() => {
    const map = new Map<string, { cat: string; nb: number; powerW: number; kwhAn: number; }>();
    for (const e of items) {
      const cat = (e.metadata.categorie as string) || 'Non renseigné';
      if (!map.has(cat)) map.set(cat, { cat, nb: 0, powerW: 0, kwhAn: 0 });
      const r = map.get(cat)!;
      r.nb     += e.quantity;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.powerW - a.powerW);
  }, [items]);

  if (byLevel.length === 0) return <EmptyTcd />;

  return (
    <div className="space-y-4">
      {/* By level */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Autres Charges — par étage</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Étage</th>
              <th className="text-left px-3 py-2.5 font-medium">Bâtiment</th>
              <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              {onNavigateTo && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {byLevel.map((r, i) => (
              <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                <td className="px-4 py-2 text-slate-200 font-medium">{r.level}</td>
                <td className="px-3 py-2 text-slate-400">{r.building}</td>
                <TdNum v={r.nb} />
                <TdNum v={r.powerW / 1000} unit="kW" />
                <TdNum v={r.kwhAn} unit="kWh" dash />
                {onNavigateTo && (
                  <td className="px-1 py-2 text-center">
                    <button
                      onClick={() => r.levelId && onNavigateTo({ type: 'level', id: r.levelId, buildingId: r.buildingId })}
                      title="Voir dans le Cadastre"
                      className="p-1 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By categorie */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Autres Charges — par sous-catégorie</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/40">
              <th className="text-left px-4 py-2.5 font-medium">Sous-catégorie</th>
              <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
              <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
              <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
              <th className="px-4 py-2.5 w-32">Répartition</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const total = byCategorie.reduce((s, r) => s + r.powerW, 0);
              return byCategorie.map((r, i) => (
                <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                  <td className="px-4 py-2 text-slate-200">{r.cat}</td>
                  <TdNum v={r.nb} />
                  <TdNum v={r.powerW / 1000} unit="kW" />
                  <TdNum v={r.kwhAn} unit="kWh" dash />
                  <td className="px-4 py-2">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all duration-700"
                        style={{ width: `${total > 0 ? Math.min((r.powerW / total) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── BILAN GLOBAL ──────────────────────────────────────────────────────────────

function BilanGlobal({ items }: { items: EquipmentSnapshot[] }) {
  const stats = useMemo(() => buildCategoryStats(items), [items]);

  if (stats.length === 0) return <EmptyTcd />;

  const totalKwhAn = stats.reduce((s, c) => s + c.kwhAn, 0);
  const totalPowerKw = stats.reduce((s, c) => s + c.totalPowerW, 0) / 1000;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / jour</p>
          <p className="text-xl font-bold text-slate-100">{fmtKwh(totalKwhAn / 365)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/jour moyen</p>
        </div>
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / mois</p>
          <p className="text-xl font-bold text-slate-100">{fmtKwh(totalKwhAn / 12)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/mois moyen</p>
        </div>
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs text-slate-500 mb-1">Énergie totale / an</p>
          <p className="text-xl font-bold text-emerald-400">{fmtKwh(totalKwhAn)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">kWh/an</p>
        </div>
      </div>

      {/* Bilan table */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Bilan global — répartition par usage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Usage</th>
                <th className="text-right px-3 py-2.5 font-medium">Nombre</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/jour</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/mois</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                <th className="text-right px-3 py-2.5 font-medium w-14">Part</th>
                <th className="px-4 py-2.5 w-28">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr
                  key={s.categoryId}
                  className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-200">{s.categoryName}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">{fmtNum(s.nb)}</td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {formatNumber(s.totalPowerW / 1000, 2)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn / 365) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn / 12) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300 font-medium tabular-nums">
                    {s.kwhAn > 0 ? fmtKwh(s.kwhAn) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 font-semibold tabular-nums" style={{ color: s.color }}>
                    {s.pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
                <td className="px-4 py-2.5 text-slate-300">Total</td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {fmtNum(stats.reduce((s, c) => s + c.nb, 0))}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {formatNumber(totalPowerKw, 2)}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn / 365) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn / 12) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-200 tabular-nums">
                  {totalKwhAn > 0 ? fmtKwh(totalKwhAn) : '—'}
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300">100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── ANALYSE ZONES ─────────────────────────────────────────────────────────────

const ZONE_PALETTE = [
  '#14b8a6','#6366f1','#f59e0b','#10b981','#ec4899',
  '#8b5cf6','#3b82f6','#f97316','#06b6d4','#84cc16',
];

interface ZoneStat {
  zoneId:  string;
  zoneName: string;
  siteName: string;
  siteId:  string;
  powerW:  number;
  kwhAn:   number;
  nb:      number;
  surface: number;      // sum of unique buildings' surface_batie in this zone
  color:   string;
  cats:    Record<string, number>;  // categoryName → kwhAn (or powerW if no kwh)
  dominant: string;
}

const ZoneStackedTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2.5 shadow-xl text-xs max-w-[220px]">
      <p className="text-slate-100 font-semibold mb-2 truncate">{label}</p>
      {[...payload].reverse().map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-slate-400 truncate">{p.dataKey}</span>
          </div>
          <span className="text-slate-200 tabular-nums ml-2">{fmtKwh(p.value)}</span>
        </div>
      ))}
      <div className="mt-2 pt-1.5 border-t border-slate-700/40 flex justify-between">
        <span className="text-slate-500">Total</span>
        <span className="text-slate-100 font-semibold tabular-nums">{fmtKwh(total)}</span>
      </div>
    </div>
  );
};

function ZoneAnalyse({ items, onNavigateTo }: { items: EquipmentSnapshot[]; onNavigateTo?: (sel: SelectionNode) => void }) {

  const { zoneStats, allCategories, catColorMap, hasZones, hasSurface, hasKwh, totalKwh } = useMemo(() => {
    const zMap  = new Map<string, ZoneStat>();
    const cCol  = new Map<string, string>();   // categoryName → color
    const zBlds = new Map<string, Set<string>>(); // zoneId → Set<buildingId>
    const bSurf = new Map<string, number>();   // buildingId → surface_batie

    let colorIdx = 0;
    for (const e of items) {
      if (!e.zoneId) continue;

      if (!zMap.has(e.zoneId)) {
        zMap.set(e.zoneId, {
          zoneId: e.zoneId, zoneName: e.zoneName, siteName: e.siteName, siteId: e.siteId,
          powerW: 0, kwhAn: 0, nb: 0, surface: 0,
          color: ZONE_PALETTE[colorIdx++ % ZONE_PALETTE.length],
          cats: {}, dominant: '',
        });
        zBlds.set(e.zoneId, new Set());
      }

      const z = zMap.get(e.zoneId)!;
      z.powerW += e.totalPowerW ?? 0;
      z.kwhAn  += e.kwhPerYear  ?? 0;
      z.nb     += e.quantity;

      const cat = e.categoryName || 'Non catégorisé';
      z.cats[cat] = (z.cats[cat] ?? 0) + (e.kwhPerYear || e.totalPowerW || 0);
      cCol.set(cat, e.categoryColor || '#64748b');

      if (e.buildingId) {
        zBlds.get(e.zoneId)!.add(e.buildingId);
        if (e.buildingSurface > 0) bSurf.set(e.buildingId, e.buildingSurface);
      }
    }

    // Compute surface per zone (sum of unique buildings)
    for (const [zId, bSet] of zBlds) {
      const z = zMap.get(zId)!;
      z.surface = Array.from(bSet).reduce((s, bId) => s + (bSurf.get(bId) ?? 0), 0);
    }

    // Dominant category
    for (const z of zMap.values()) {
      const sorted = Object.entries(z.cats).sort(([, a], [, b]) => b - a);
      z.dominant = sorted[0]?.[0] ?? '—';
    }

    const stats = Array.from(zMap.values()).sort((a, b) => b.kwhAn - a.kwhAn);
    const cats  = Array.from(
      stats.reduce((set, z) => { Object.keys(z.cats).forEach(c => set.add(c)); return set; }, new Set<string>())
    ).sort((a, b) => {
      const totA = stats.reduce((s, z) => s + (z.cats[a] ?? 0), 0);
      const totB = stats.reduce((s, z) => s + (z.cats[b] ?? 0), 0);
      return totB - totA;
    });

    const totalK = stats.reduce((s, z) => s + z.kwhAn, 0);

    return {
      zoneStats:   stats,
      allCategories: cats,
      catColorMap:   cCol,
      hasZones:      stats.length > 0,
      hasSurface:    stats.some(z => z.surface > 0),
      hasKwh:        totalK > 0,
      totalKwh:      totalK,
    };
  }, [items]);

  if (!hasZones) {
    return (
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 py-16 flex flex-col items-center gap-3 text-slate-600">
        <BarChart3 className="w-8 h-8 opacity-20" />
        <p className="text-xs">Aucune zone trouvée — assignez des bâtiments à des zones dans le module Inventaire</p>
      </div>
    );
  }

  const dataKey: 'kwhAn' | 'powerW' = hasKwh ? 'kwhAn' : 'powerW';
  const topZone = zoneStats[0];
  const topDense = hasSurface
    ? [...zoneStats].sort((a, b) => (b.surface > 0 ? b.powerW / b.surface : 0) - (a.surface > 0 ? a.powerW / a.surface : 0))[0]
    : null;

  // Stacked bar data
  const stackedData = zoneStats.map(z => ({
    label: z.zoneName.length > 18 ? z.zoneName.slice(0, 17) + '…' : z.zoneName,
    _fullLabel: z.zoneName,
    _zoneId: z.zoneId,
    _siteId: z.siteId,
    ...Object.fromEntries(allCategories.map(c => [c, z.cats[c] ?? 0])),
  }));

  // Radar chart data (normalise each axis 0–100)
  const radarData = zoneStats.length >= 3 ? (() => {
    const maxPow  = Math.max(...zoneStats.map(z => z.powerW), 0.001);
    const maxKwh  = Math.max(...zoneStats.map(z => z.kwhAn), 0.001);
    const maxNb   = Math.max(...zoneStats.map(z => z.nb),    0.001);
    const maxWm2  = Math.max(...zoneStats.map(z => z.surface > 0 ? z.powerW / z.surface : 0), 0.001);
    return [
      { metric: 'Puissance',   ...Object.fromEntries(zoneStats.map(z => [z.zoneName, Math.round((z.powerW / maxPow) * 100)])) },
      { metric: 'Énergie',     ...Object.fromEntries(zoneStats.map(z => [z.zoneName, Math.round((z.kwhAn  / maxKwh)  * 100)])) },
      { metric: 'Équipements', ...Object.fromEntries(zoneStats.map(z => [z.zoneName, Math.round((z.nb     / maxNb)   * 100)])) },
      ...(hasSurface ? [{ metric: 'Densité W/m²', ...Object.fromEntries(zoneStats.map(z => [z.zoneName, Math.round(((z.surface > 0 ? z.powerW / z.surface : 0) / maxWm2) * 100)])) }] : []),
    ];
  })() : null;

  return (
    <div className="space-y-4">

      {/* ── KPI row ── */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Zones analysées" value={String(zoneStats.length)}
          sub={`sur ${[...new Set(zoneStats.map(z => z.siteName))].length} site(s)`}
          icon={BarChart3} color="#14b8a6" />
        <KPICard label="Zone la + consommatrice" value={topZone.zoneName}
          sub={hasKwh ? fmtKwh(topZone.kwhAn) + '/an' : fmtKw(topZone.powerW)}
          icon={Zap} color="#f59e0b" />
        {topDense && topDense.surface > 0 ? (
          <KPICard label="Zone la + dense" value={topDense.zoneName}
            sub={`${formatNumber(topDense.powerW / topDense.surface, 1)} W/m²`}
            icon={Activity} color="#ec4899" />
        ) : (
          <KPICard label="Catégorie dominante" value={topZone.dominant}
            sub="dans la zone principale"
            icon={Tag} color="#6366f1" />
        )}
        <KPICard label="Potentiel d'économies"
          value={zoneStats.length > 1
            ? `${Math.round(((zoneStats[0].kwhAn - zoneStats[zoneStats.length - 1].kwhAn) / Math.max(zoneStats[0].kwhAn, 1)) * 100)}%`
            : '—'}
          sub="écart max/min entre zones"
          icon={Tag} color="#10b981" />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Stacked horizontal bar: zone × catégorie */}
        <div className="col-span-3 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">
            Composition énergétique — {hasKwh ? 'kWh/an' : 'puissance kW'} par zone et catégorie
          </p>
          <ResponsiveContainer width="100%" height={Math.max(zoneStats.length * 36 + 32, 180)}>
            <BarChart
              data={stackedData}
              layout="vertical"
              margin={{ top: 0, right: 60, left: 4, bottom: 0 }}
              onClick={(d) => {
                if (!onNavigateTo || !d?.activePayload?.[0]) return;
                const row = d.activePayload[0].payload;
                if (row._zoneId) onNavigateTo({ type: 'zone', id: row._zoneId, siteId: row._siteId || '' });
              }}
            >
              <CartesianGrid horizontal={false} stroke="rgba(71,85,105,0.12)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => hasKwh ? fmtKwh(v) : fmtKw(v)} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickLine={false} axisLine={false} />
              <Tooltip content={<ZoneStackedTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8, color: '#64748b' }}
                formatter={(v) => <span style={{ color: '#94a3b8' }}>{v}</span>}
              />
              {allCategories.map(cat => (
                <Bar
                  key={cat} dataKey={cat} stackId="stack"
                  fill={catColorMap.get(cat) ?? '#64748b'}
                  maxBarSize={22}
                  style={{ cursor: onNavigateTo ? 'pointer' : 'default' }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut: zone share */}
        <div className="col-span-2 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">
            Part de chaque zone — {hasKwh ? 'énergie kWh/an' : 'puissance kW'}
          </p>
          <div className="relative h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={zoneStats} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={76}
                  paddingAngle={2} dataKey={dataKey} isAnimationActive>
                  {zoneStats.map((z, i) => (
                    <Cell
                      key={z.zoneId} fill={z.color} stroke="transparent"
                      style={{ cursor: onNavigateTo ? 'pointer' : 'default' }}
                      onClick={() => onNavigateTo?.({ type: 'zone', id: z.zoneId, siteId: z.siteId })}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as ZoneStat;
                    const pct = totalKwh > 0 ? (d.kwhAn / totalKwh * 100) : 0;
                    return (
                      <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                          <span className="text-slate-100 font-semibold">{d.zoneName}</span>
                        </div>
                        <div className="text-slate-400 space-y-0.5">
                          <div>Énergie : <span className="text-slate-200">{fmtKwh(d.kwhAn)}/an</span></div>
                          <div>Puissance : <span className="text-slate-200">{fmtKw(d.powerW)}</span></div>
                          <div>Part : <span className="font-semibold" style={{ color: d.color }}>{pct.toFixed(1)}%</span></div>
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-sm font-bold text-slate-100 leading-none">
                  {hasKwh ? fmtKwh(totalKwh) : fmtKw(zoneStats.reduce((s, z) => s + z.powerW, 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">total</p>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
            {zoneStats.map(z => {
              const pct = totalKwh > 0 ? z.kwhAn / totalKwh * 100 : z.powerW / (zoneStats.reduce((s, x) => s + x.powerW, 0) || 1) * 100;
              return (
                <div key={z.zoneId}
                  className={`flex items-center gap-2 text-xs group ${onNavigateTo ? 'cursor-pointer hover:bg-slate-800/40 rounded px-1 -mx-1 transition-colors' : ''}`}
                  onClick={() => onNavigateTo?.({ type: 'zone', id: z.zoneId, siteId: z.siteId })}
                >
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: z.color }} />
                  <span className="text-slate-400 flex-1 truncate">{z.zoneName}</span>
                  <span className="font-semibold tabular-nums" style={{ color: z.color }}>{pct.toFixed(1)}%</span>
                  <span className="text-slate-500 w-16 text-right tabular-nums">{hasKwh ? fmtKwh(z.kwhAn) : fmtKw(z.powerW)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Radar chart (≥3 zones) ── */}
      {radarData && (
        <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-1">
            Profil énergétique comparé — indice normalisé (100 = max de la sélection)
          </p>
          <p className="text-[10px] text-slate-600 mb-3">
            Un profil large indique une zone à fort potentiel d'optimisation
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} margin={{ top: 8, right: 32, left: 32, bottom: 8 }}>
              <PolarGrid stroke="rgba(71,85,105,0.25)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
              {zoneStats.slice(0, 6).map(z => (
                <Radar
                  key={z.zoneId} name={z.zoneName} dataKey={z.zoneName}
                  stroke={z.color} fill={z.color} fillOpacity={0.08}
                  strokeWidth={1.5}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
                      <p className="text-slate-300 font-medium mb-1">{label}</p>
                      {payload.map((p: any) => (
                        <div key={p.dataKey} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                          <span className="text-slate-400">{p.dataKey}</span>
                          <span className="text-slate-200 ml-auto tabular-nums">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Densité surfacique W/m² par zone ── */}
      {hasSurface && (() => {
        const densData = [...zoneStats]
          .filter(z => z.surface > 0)
          .sort((a, b) => (b.powerW / b.surface) - (a.powerW / a.surface))
          .map(z => ({
            label: z.zoneName.length > 20 ? z.zoneName.slice(0, 19) + '…' : z.zoneName,
            wm2:   parseFloat((z.powerW / z.surface).toFixed(1)),
            kwhmAn: z.kwhAn > 0 ? parseFloat((z.kwhAn / z.surface).toFixed(0)) : 0,
            color: z.color,
          }));
        if (densData.length === 0) return null;
        const maxWm2 = densData[0].wm2;
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
              <p className="text-xs font-semibold text-slate-300 mb-3">Puissance surfacique — W/m²</p>
              <ResponsiveContainer width="100%" height={Math.max(densData.length * 32 + 24, 140)}>
                <BarChart data={densData} layout="vertical" margin={{ top: 0, right: 56, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="rgba(71,85,105,0.12)" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v} W/m²`} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <p className="text-slate-200 font-semibold mb-1">{label}</p>
                        <p className="text-amber-400">{payload[0].value} W/m²</p>
                      </div>
                    );
                  }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="wm2" radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{ position: 'right', fill: '#64748b', fontSize: 10, formatter: (v: number) => `${v} W/m²` }}>
                    {densData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
              <p className="text-xs font-semibold text-slate-300 mb-3">Intensité énergétique — kWh/m²/an</p>
              <ResponsiveContainer width="100%" height={Math.max(densData.length * 32 + 24, 140)}>
                <BarChart data={densData} layout="vertical" margin={{ top: 0, right: 72, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="rgba(71,85,105,0.12)" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v} kWh/m²`} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#0f111a] border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <p className="text-slate-200 font-semibold mb-1">{label}</p>
                        <p className="text-emerald-400">{payload[0].value} kWh/m²/an</p>
                      </div>
                    );
                  }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="kwhmAn" radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{ position: 'right', fill: '#64748b', fontSize: 10, formatter: (v: number) => v > 0 ? `${v} kWh/m²` : '' }}>
                    {densData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* ── Tableau de bord zones ── */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Tableau de bord — classement des zones</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Zone</th>
                <th className="text-left px-3 py-2.5 font-medium">Site</th>
                <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                {hasSurface && <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>}
                {hasSurface && <th className="text-right px-3 py-2.5 font-medium">W/m²</th>}
                <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                {hasSurface && <th className="text-right px-3 py-2.5 font-medium">kWh/m²/an</th>}
                <th className="text-right px-3 py-2.5 font-medium">% total</th>
                <th className="text-left px-3 py-2.5 font-medium">Catégorie dominante</th>
                <th className="px-4 py-2.5 w-24">Priorité</th>
              </tr>
            </thead>
            <tbody>
              {zoneStats.map((z, i) => {
                const pct    = totalKwh > 0 ? (z.kwhAn / totalKwh) * 100 : 0;
                const wm2    = z.surface > 0 ? z.powerW / z.surface : 0;
                const kwhmAn = z.surface > 0 ? z.kwhAn  / z.surface : 0;
                return (
                  <tr key={z.zoneId}
                    className={`border-b border-slate-800/30 transition-colors ${i % 2 === 1 ? 'bg-slate-800/10' : ''} ${onNavigateTo ? 'hover:bg-teal-900/10 cursor-pointer' : 'hover:bg-slate-800/20'}`}
                    onClick={() => onNavigateTo?.({ type: 'zone', id: z.zoneId, siteId: z.siteId })}
                  >
                    <td className="px-4 py-2.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: z.color }}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: z.color }} />
                        <span className="text-slate-200 font-medium">{z.zoneName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{z.siteName}</td>
                    <TdNum v={z.nb} />
                    <TdNum v={z.powerW / 1000} unit="kW" />
                    {hasSurface && (
                      <td className={`text-right px-3 py-2.5 tabular-nums ${z.surface > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                        {z.surface > 0 ? `${formatNumber(z.surface, 0)} m²` : '—'}
                      </td>
                    )}
                    {hasSurface && (
                      <td className={`text-right px-3 py-2.5 font-semibold tabular-nums ${wm2 > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {wm2 > 0 ? `${formatNumber(wm2, 1)} W/m²` : '—'}
                      </td>
                    )}
                    <td className="text-right px-3 py-2.5 text-slate-300 font-medium tabular-nums">
                      {hasKwh ? fmtKwh(z.kwhAn) : '—'}
                    </td>
                    {hasSurface && (
                      <td className={`text-right px-3 py-2.5 tabular-nums ${kwhmAn > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {kwhmAn > 0 ? `${formatNumber(kwhmAn, 0)} kWh/m²` : '—'}
                      </td>
                    )}
                    <td className="text-right px-3 py-2.5 font-semibold tabular-nums" style={{ color: z.color }}>
                      {pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColorMap.get(z.dominant) ?? '#64748b' }} />
                        <span className="text-slate-400 text-[10px] truncate max-w-[100px]">{z.dominant}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, background: z.color }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── TCD DENSITÉ SURFACIQUE ────────────────────────────────────────────────────

function TcdDensite({ items }: { items: EquipmentSnapshot[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      building: string; site: string; surface: number;
      powerW: number; kwhAn: number; nb: number;
    }>();
    for (const e of items) {
      const key = e.buildingId || e.buildingName;
      if (!map.has(key)) {
        map.set(key, {
          building: e.buildingName, site: e.siteName,
          surface: e.buildingSurface ?? 0,
          powerW: 0, kwhAn: 0, nb: 0,
        });
      }
      const r = map.get(key)!;
      r.powerW += e.totalPowerW ?? 0;
      r.kwhAn  += e.kwhPerYear  ?? 0;
      r.nb     += e.quantity;
    }
    return Array.from(map.values())
      .sort((a, b) => {
        const da = a.surface > 0 ? a.powerW / a.surface : 0;
        const db = b.surface > 0 ? b.powerW / b.surface : 0;
        return db - da;
      });
  }, [items]);

  const totalSurface = rows.reduce((s, r) => s + r.surface, 0);
  const totalPower   = rows.reduce((s, r) => s + r.powerW, 0);
  const totalKwh     = rows.reduce((s, r) => s + r.kwhAn, 0);
  const hasSurface   = rows.some(r => r.surface > 0);

  if (rows.length === 0) return <EmptyTcd />;

  return (
    <div className="space-y-4">
      {!hasSurface && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-xs text-amber-300">
          Aucune surface bâtie renseignée. Renseignez "Surface bâtie (m²)" dans la fiche bâtiment du Projet pour calculer la densité surfacique.
        </div>
      )}

      {/* KPIs surfaciques */}
      {hasSurface && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Surface bâtie totale</p>
            <p className="text-xl font-bold text-slate-100">{formatNumber(totalSurface, 0)} m²</p>
            <p className="text-[10px] text-slate-600 mt-0.5">tous bâtiments cumulés</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Puissance surfacique moy.</p>
            <p className="text-xl font-bold text-amber-400">
              {totalSurface > 0 ? formatNumber(totalPower / totalSurface, 1) : '—'} W/m²
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">puissance installée / surface</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
            <p className="text-xs text-slate-500 mb-1">Intensité énergétique moy.</p>
            <p className="text-xl font-bold text-emerald-400">
              {totalSurface > 0 ? formatNumber(totalKwh / totalSurface, 0) : '—'} kWh/m²/an
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">énergie annuelle / surface</p>
          </div>
        </div>
      )}

      {/* Table densité par bâtiment */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Densité énergétique — par bâtiment</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Bâtiment</th>
                <th className="text-left px-3 py-2.5 font-medium">Site</th>
                <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
                <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                <th className="text-right px-3 py-2.5 font-medium">kWh/m²/an</th>
                <th className="px-4 py-2.5 w-28">Densité relative</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxWm2 = Math.max(...rows.map(r => r.surface > 0 ? r.powerW / r.surface : 0), 0.001);
                return rows.map((r, i) => {
                  const wm2 = r.surface > 0 ? r.powerW / r.surface : 0;
                  const kwhmAn = r.surface > 0 ? r.kwhAn / r.surface : 0;
                  return (
                    <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                      <td className="px-4 py-2 text-slate-200 font-medium">{r.building}</td>
                      <td className="px-3 py-2 text-slate-400">{r.site}</td>
                      <TdNum v={r.nb} />
                      <TdNum v={r.powerW / 1000} unit="kW" />
                      <td className={`text-right px-3 py-2 tabular-nums ${r.surface > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                        {r.surface > 0 ? `${formatNumber(r.surface, 0)} m²` : '—'}
                      </td>
                      <td className={`text-right px-3 py-2 font-semibold tabular-nums ${wm2 > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {wm2 > 0 ? `${formatNumber(wm2, 1)} W/m²` : '—'}
                      </td>
                      <TdNum v={r.kwhAn} unit="kWh" dash />
                      <td className={`text-right px-3 py-2 tabular-nums ${kwhmAn > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {kwhmAn > 0 ? `${formatNumber(kwhmAn, 0)} kWh/m²` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-700"
                            style={{ width: `${maxWm2 > 0 ? Math.min((wm2 / maxWm2) * 100, 100) : 0}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
              <tr className="bg-slate-800/25 font-semibold border-t border-slate-700/40">
                <td className="px-4 py-2 text-slate-300" colSpan={2}>Total</td>
                <TdNum v={rows.reduce((s, r) => s + r.nb, 0)} />
                <TdNum v={totalPower / 1000} unit="kW" />
                <td className="text-right px-3 py-2 text-slate-300 tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalSurface, 0)} m²` : '—'}
                </td>
                <td className="text-right px-3 py-2 text-amber-400 font-bold tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalPower / totalSurface, 1)} W/m²` : '—'}
                </td>
                <TdNum v={totalKwh} unit="kWh" dash />
                <td className="text-right px-3 py-2 text-emerald-400 font-bold tabular-nums">
                  {totalSurface > 0 ? `${formatNumber(totalKwh / totalSurface, 0)} kWh/m²` : '—'}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-site comparison — only if multiple sites */}
      {(() => {
        const siteMap = new Map<string, { site: string; surface: number; powerW: number; kwhAn: number; nb: number; buildings: number }>();
        for (const r of rows) {
          if (!siteMap.has(r.site)) siteMap.set(r.site, { site: r.site, surface: 0, powerW: 0, kwhAn: 0, nb: 0, buildings: 0 });
          const s = siteMap.get(r.site)!;
          s.surface  += r.surface;
          s.powerW   += r.powerW;
          s.kwhAn    += r.kwhAn;
          s.nb       += r.nb;
          s.buildings++;
        }
        const siteRows = Array.from(siteMap.values()).sort((a, b) => b.powerW - a.powerW);
        if (siteRows.length <= 1) return null;
        return (
          <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/50">
              <p className="text-xs font-semibold text-slate-300">Comparatif — tous les sites</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800/40">
                    <th className="text-left px-4 py-2.5 font-medium">Site</th>
                    <th className="text-right px-3 py-2.5 font-medium">Bâtiments</th>
                    <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                    <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Surface (m²)</th>
                    <th className="text-right px-3 py-2.5 font-medium">W/m²</th>
                    <th className="text-right px-3 py-2.5 font-medium">kWh/an</th>
                    <th className="text-right px-3 py-2.5 font-medium">kWh/m²/an</th>
                    <th className="text-right px-3 py-2.5 font-medium">% Puissance</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((s, i) => {
                    const wm2  = s.surface > 0 ? s.powerW / s.surface : 0;
                    const kwh2 = s.surface > 0 ? s.kwhAn / s.surface : 0;
                    const pct  = totalPower > 0 ? (s.powerW / totalPower) * 100 : 0;
                    return (
                      <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}>
                        <td className="px-4 py-2.5 text-slate-200 font-medium">{s.site}</td>
                        <TdNum v={s.buildings} />
                        <TdNum v={s.nb} />
                        <TdNum v={s.powerW / 1000} unit="kW" />
                        <td className={`text-right px-3 py-2.5 tabular-nums ${s.surface > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                          {s.surface > 0 ? `${formatNumber(s.surface, 0)} m²` : '—'}
                        </td>
                        <td className={`text-right px-3 py-2.5 font-semibold tabular-nums ${wm2 > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                          {wm2 > 0 ? `${formatNumber(wm2, 1)} W/m²` : '—'}
                        </td>
                        <TdNum v={s.kwhAn} unit="kWh" dash />
                        <td className={`text-right px-3 py-2.5 tabular-nums ${kwh2 > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {kwh2 > 0 ? `${formatNumber(kwh2, 0)} kWh/m²` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-slate-400 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Empty TCD ─────────────────────────────────────────────────────────────────

function EmptyTcd() {
  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 py-16 flex flex-col items-center gap-3 text-slate-600">
      <BarChart3 className="w-8 h-8 opacity-20" />
      <p className="text-xs">Aucun équipement dans cette catégorie</p>
    </div>
  );
}

// ── VUE D'ENSEMBLE ────────────────────────────────────────────────────────────

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'room',     label: 'Par Pièce' },
  { id: 'level',    label: 'Par Étage' },
  { id: 'zone',     label: 'Par Zone' },
  { id: 'building', label: 'Par Bâtiment' },
  { id: 'site',     label: 'Par Site' },
];

function VueEnsemble({ filtered, categoryStats, topGroups, groupLabel, groupBy, kpis, hasKwhData, dataKey, hasZones, manualGroupBy, setManualGroupBy, onRefresh, onNavigateTo }: {
  filtered: EquipmentSnapshot[];
  categoryStats: CategoryStat[];
  topGroups: GroupStat[];
  groupLabel: string;
  groupBy: GroupBy;
  kpis: { nb: number; kw: number; kwh: number; cats: number; rooms: number; };
  hasKwhData: boolean;
  dataKey: 'kwhAn' | 'totalPowerW';
  hasZones: boolean;
  manualGroupBy: GroupBy | null;
  setManualGroupBy: (v: GroupBy | null) => void;
  onRefresh: () => void;
  onNavigateTo?: (sel: SelectionNode) => void;
}) {
  return (
    <>
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          label="Équipements actifs"
          value={fmtNum(kpis.nb)}
          sub={`${kpis.rooms} pièce${kpis.rooms > 1 ? 's' : ''}`}
          icon={Activity}
          color="#6366f1"
        />
        <KPICard
          label="Puissance installée"
          value={fmtKw(kpis.kw)}
          sub="total équipements EN service"
          icon={Zap}
          color="#f59e0b"
        />
        <KPICard
          label="Énergie estimée"
          value={fmtKwh(kpis.kwh)}
          sub={hasKwhData ? 'par an' : 'heures non renseignées — affichage kW'}
          icon={BarChart3}
          color="#10b981"
        />
        <KPICard
          label="Catégories"
          value={String(kpis.cats)}
          sub={`${fmtNum(categoryStats.length)} actives dans la sélection`}
          icon={Tag}
          color="#8b5cf6"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Donut — répartition par catégorie */}
        <div className="col-span-2 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">
            Répartition · {hasKwhData ? 'énergie kWh/an' : 'puissance kW installée'}
          </p>
          {categoryStats.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-600 text-xs">Aucune donnée</div>
          ) : (
            <>
              <div className="relative h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      cx="50%" cy="50%"
                      innerRadius={54} outerRadius={82}
                      paddingAngle={2}
                      dataKey={dataKey}
                      isAnimationActive
                    >
                      {categoryStats.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-base font-bold text-slate-100 leading-none">
                      {hasKwhData ? fmtKwh(kpis.kwh) : fmtKw(kpis.kw)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">total estimé</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {categoryStats.map(s => (
                  <div key={s.categoryId} className="flex items-center gap-2 text-xs group">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-400 flex-1 truncate">{s.categoryName}</span>
                    <span className="font-semibold tabular-nums" style={{ color: s.color }}>
                      {s.pct.toFixed(1)}%
                    </span>
                    <span className="text-slate-500 tabular-nums w-20 text-right">
                      {hasKwhData ? fmtKwh(s.kwhAn) : fmtKw(s.totalPowerW)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Horizontal bar — top consommateurs */}
        <div className="col-span-3 bg-[#1a1d2e] rounded-xl border border-slate-800/60 p-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <p className="text-xs font-semibold text-slate-300">
              Top consommateurs · par {groupLabel.toLowerCase()}
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {GROUP_OPTIONS.filter(o => o.id !== 'zone' || hasZones).map(o => (
                <button
                  key={o.id}
                  onClick={() => setManualGroupBy(manualGroupBy === o.id ? null : o.id)}
                  className={`h-5 px-2 rounded text-[10px] font-medium transition-colors ${
                    groupBy === o.id
                      ? 'bg-indigo-600/80 text-white'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {topGroups.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-600 text-xs">Aucune donnée</div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(topGroups.length * 30 + 24, 180)}
            >
              <BarChart
                data={topGroups}
                layout="vertical"
                margin={{ top: 0, right: 56, left: 4, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="rgba(71,85,105,0.12)" />
                <XAxis
                  type="number"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => hasKwhData ? fmtKwh(v) : fmtKw(v)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={116}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar
                  dataKey={dataKey}
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  style={{ cursor: onNavigateTo ? 'pointer' : 'default' }}
                  onClick={(data: GroupStat) => {
                    if (!onNavigateTo || !data.entityId) return;
                    if (groupBy === 'room' && data.parentId)
                      onNavigateTo({ type: 'room', id: data.entityId, levelId: data.parentId });
                    else if (groupBy === 'level' && data.parentId)
                      onNavigateTo({ type: 'level', id: data.entityId, buildingId: data.parentId });
                  }}
                  label={{
                    position: 'right',
                    fill: '#64748b',
                    fontSize: 10,
                    formatter: (v: number) => hasKwhData ? fmtKwh(v) : fmtKw(v),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Bilan table ── */}
      <div className="bg-[#1a1d2e] rounded-xl border border-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/50">
          <p className="text-xs font-semibold text-slate-300">Bilan global — par catégorie</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40">
                <th className="text-left px-4 py-2.5 font-medium">Catégorie</th>
                <th className="text-right px-3 py-2.5 font-medium">Équipements</th>
                <th className="text-right px-3 py-2.5 font-medium">Puissance (kW)</th>
                <th className="text-right px-3 py-2.5 font-medium">Énergie (kWh/an)</th>
                <th className="text-right px-3 py-2.5 font-medium w-16">Part</th>
                <th className="px-4 py-2.5 w-36">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map((s, i) => (
                <tr
                  key={s.categoryId}
                  className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${i % 2 === 1 ? 'bg-slate-800/10' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-200">{s.categoryName}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">{fmtNum(s.nb)}</td>
                  <td className="text-right px-3 py-2.5 text-slate-400 tabular-nums">
                    {formatNumber(s.totalPowerW / 1000, 2)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300 font-medium tabular-nums">
                    {hasKwhData ? fmtKwh(s.kwhAn) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 font-semibold tabular-nums" style={{ color: s.color }}>
                    {s.pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {categoryStats.length > 0 && (
                <tr className="bg-slate-800/25 font-semibold">
                  <td className="px-4 py-2.5 text-slate-300">Total</td>
                  <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                    {fmtNum(categoryStats.reduce((s, c) => s + c.nb, 0))}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300 tabular-nums">
                    {formatNumber(categoryStats.reduce((s, c) => s + c.totalPowerW, 0) / 1000, 2)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-200 tabular-nums">
                    {hasKwhData ? fmtKwh(kpis.kwh) : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-slate-300">100%</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface InventaireVizProps {
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
