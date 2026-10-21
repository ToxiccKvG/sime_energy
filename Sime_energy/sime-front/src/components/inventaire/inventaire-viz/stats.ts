import type { EquipmentSnapshot } from '@/lib/inventory-service';
import { formatEnergy, formatPower, formatNumber } from '@/lib/format';

// ── Formatters ────────────────────────────────────────────────────────────────

export const fmtKwh = formatEnergy;

export const fmtKw  = formatPower;

export const fmtNum = formatNumber;

// ── Aggregation types ─────────────────────────────────────────────────────────

export interface CategoryStat {
  categoryId:   string;
  categoryName: string;
  color:        string;
  nb:           number;
  totalPowerW:  number;
  kwhAn:        number;
  pct:          number;
}

export interface GroupStat {
  label:       string;
  kwhAn:       number;
  totalPowerW: number;
  nb:          number;
  entityId?:   string;  // id of this entity (room/level/building/zone/site)
  parentId?:   string;  // parent entity id for SelectionNode context
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

export function buildCategoryStats(items: EquipmentSnapshot[]): CategoryStat[] {
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

export type GroupBy = 'room' | 'level' | 'zone' | 'building' | 'site';

export function buildGroupStats(items: EquipmentSnapshot[], by: GroupBy): GroupStat[] {
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

// ── VUE D'ENSEMBLE ────────────────────────────────────────────────────────────

export const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'room',     label: 'Par Pièce' },
  { id: 'level',    label: 'Par Étage' },
  { id: 'zone',     label: 'Par Zone' },
  { id: 'building', label: 'Par Bâtiment' },
  { id: 'site',     label: 'Par Site' },
];
