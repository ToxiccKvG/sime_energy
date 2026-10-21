import type { SelectionNode, TreeData } from '@/pages/Inventaire';
import type { EquipmentCategory } from '@/types/inventory';
import { Breadcrumb } from './node-detail/Breadcrumb';
import { BuildingView } from './node-detail/BuildingView';
import { EmptyState } from './node-detail/EmptyState';
import { LevelView } from './node-detail/LevelView';
import { RoomView } from './node-detail/RoomView';
import { SiteView } from './node-detail/SiteView';
import { ZoneView } from './node-detail/ZoneView';

interface NodeDetailProps {
  selection: SelectionNode | null;
  treeData: TreeData;
  categories: EquipmentCategory[];
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshZones: (siteId: string) => Promise<void>;
  onRefreshBuildings: (zoneId: string) => Promise<void>;
  onRefreshLevels: (buildingId: string) => Promise<void>;
  onRefreshRooms: (levelId: string) => Promise<void>;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function NodeDetail({
  selection,
  treeData,
  categories,
  auditId,
  orgId,
  userId,
  onRefreshZones,
  onRefreshBuildings,
  onRefreshLevels,
  onRefreshRooms,
}: NodeDetailProps) {
  if (!selection) return <EmptyState />;

  // Build breadcrumb parts from selection
  const getBreadcrumb = () => {
    const site = (['site', 'zone', 'building'] as const).includes(selection.type as any)
      ? treeData.sites.find(s => s.id === (
          selection.type === 'site' ? selection.id :
          (selection as any).siteId
        ))
      : undefined;

    const zone = selection.type === 'zone'
      ? (treeData.zones[(selection as any).siteId] ?? []).find(z => z.id === selection.id)
      : selection.type === 'building'
        ? Object.values(treeData.zones).flat().find(z => z.id === (selection as any).zoneId)
        : undefined;

    const buildingId = selection.type === 'building' ? selection.id
      : selection.type === 'level' ? selection.buildingId
      : selection.type === 'room'
        ? Object.entries(treeData.levels).find(([, levels]) =>
            levels.some(l => l.id === selection.levelId)
          )?.[0]
        : undefined;

    const building = buildingId
      ? Object.values(treeData.buildings).flat().find(b => b.id === buildingId)
      : undefined;

    const level = selection.type === 'level'
      ? (treeData.levels[selection.buildingId] ?? []).find(l => l.id === selection.id)
      : selection.type === 'room'
        ? Object.values(treeData.levels).flat().find(l => l.id === selection.levelId)
        : undefined;

    const room = selection.type === 'room'
      ? (treeData.rooms[selection.levelId] ?? []).find(r => r.id === selection.id)
      : undefined;

    const parts = [];
    if (site) parts.push({ label: site.name, color: 'text-emerald-400' });
    if (zone) parts.push({ label: zone.name, color: 'text-teal-400' });
    if (building) parts.push({ label: building.building_name, color: 'text-blue-400' });
    if (level) parts.push({ label: `Étage ${level.name}`, color: 'text-violet-400' });
    if (room) parts.push({ label: room.code, color: 'text-amber-400' });
    return parts;
  };

  const breadcrumb = getBreadcrumb();
  const commonPanel = 'flex-1 overflow-y-auto flex flex-col gap-3 pb-6';

  if (selection.type === 'site') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <SiteView
          siteId={selection.id}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshZones={onRefreshZones}
        />
      </div>
    );
  }

  if (selection.type === 'zone') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <ZoneView
          zoneId={selection.id}
          siteId={selection.siteId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshBuildings={onRefreshBuildings}
          onRefreshZones={onRefreshZones}
        />
      </div>
    );
  }

  if (selection.type === 'building') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <BuildingView
          buildingId={selection.id}
          zoneId={selection.zoneId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshLevels={onRefreshLevels}
          onRefreshBuildings={onRefreshBuildings}
        />
      </div>
    );
  }

  if (selection.type === 'level') {
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <LevelView
          levelId={selection.id}
          buildingId={selection.buildingId}
          treeData={treeData}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshRooms={onRefreshRooms}
          onRefreshLevels={onRefreshLevels}
        />
      </div>
    );
  }

  if (selection.type === 'room') {
    // Resolve buildingId for the selected room (needed for heuresAn prefill)
    const roomBuildingId = Object.entries(treeData.levels).find(
      ([, levels]) => levels.some(l => l.id === selection.levelId)
    )?.[0] ?? '';
    return (
      <div className={commonPanel}>
        {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
        <RoomView
          roomId={selection.id}
          levelId={selection.levelId}
          buildingId={roomBuildingId}
          treeData={treeData}
          categories={categories}
          auditId={auditId}
          orgId={orgId}
          userId={userId}
          onRefreshRooms={onRefreshRooms}
        />
      </div>
    );
  }

  return <EmptyState />;
}
