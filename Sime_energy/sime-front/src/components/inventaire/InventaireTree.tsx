import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Building2,
  Layers,
  LayoutGrid,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SelectionNode, TreeData } from '@/pages/Inventaire';

interface InventaireTreeProps {
  treeData: TreeData;
  selection: SelectionNode | null;
  onSelect: (node: SelectionNode) => void;
  onExpandSite: (siteId: string) => Promise<void>;
  onExpandZone: (zoneId: string) => Promise<void>;
  onExpandBuilding: (buildingId: string) => Promise<void>;
  onExpandLevel: (levelId: string) => Promise<void>;
}

export function InventaireTree({
  treeData,
  selection,
  onSelect,
  onExpandSite,
  onExpandZone,
  onExpandBuilding,
  onExpandLevel,
}: InventaireTreeProps) {
  const [expandedSites,     setExpandedSites]     = useState<Set<string>>(new Set());
  const [expandedZones,     setExpandedZones]     = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [expandedLevels,    setExpandedLevels]    = useState<Set<string>>(new Set());
  const [loading,           setLoading]           = useState<Set<string>>(new Set());

  const addLoading    = (id: string) => setLoading(prev => new Set([...prev, id]));
  const removeLoading = (id: string) => setLoading(prev => { const s = new Set(prev); s.delete(id); return s; });

  const toggleSite = async (siteId: string) => {
    const next = new Set(expandedSites);
    if (next.has(siteId)) {
      next.delete(siteId);
    } else {
      next.add(siteId);
      if (treeData.zones[siteId] === undefined) {
        addLoading(siteId);
        await onExpandSite(siteId);
        removeLoading(siteId);
      }
    }
    setExpandedSites(next);
  };

  const toggleZone = async (zoneId: string) => {
    const next = new Set(expandedZones);
    if (next.has(zoneId)) {
      next.delete(zoneId);
    } else {
      next.add(zoneId);
      if (treeData.buildings[zoneId] === undefined) {
        addLoading(zoneId);
        await onExpandZone(zoneId);
        removeLoading(zoneId);
      }
    }
    setExpandedZones(next);
  };

  const toggleBuilding = async (buildingId: string) => {
    const next = new Set(expandedBuildings);
    if (next.has(buildingId)) {
      next.delete(buildingId);
    } else {
      next.add(buildingId);
      if (treeData.levels[buildingId] === undefined) {
        addLoading(buildingId);
        await onExpandBuilding(buildingId);
        removeLoading(buildingId);
      }
    }
    setExpandedBuildings(next);
  };

  const toggleLevel = async (levelId: string) => {
    const next = new Set(expandedLevels);
    if (next.has(levelId)) {
      next.delete(levelId);
    } else {
      next.add(levelId);
      if (treeData.rooms[levelId] === undefined) {
        addLoading(levelId);
        await onExpandLevel(levelId);
        removeLoading(levelId);
      }
    }
    setExpandedLevels(next);
  };

  const isSelected = (type: string, id: string) =>
    selection?.type === type && selection?.id === id;

  const Chevron = ({ id, expanded }: { id: string; expanded: boolean }) =>
    loading.has(id) ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
    ) : expanded ? (
      <ChevronDown className="w-3.5 h-3.5" />
    ) : (
      <ChevronRight className="w-3.5 h-3.5" />
    );

  return (
    <div className="w-72 flex-shrink-0 bg-[#1a1d2e] border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Structure ({treeData.sites.length} site{treeData.sites.length !== 1 ? 's' : ''})
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {treeData.sites.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm px-4">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Aucun site configuré pour ce projet
            </div>
          ) : (
            treeData.sites.map(site => (
              <div key={site.id}>
                {/* SITE */}
                <div
                  className={cn(
                    'flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors',
                    isSelected('site', site.id)
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'hover:bg-slate-700/40 text-slate-300'
                  )}
                >
                  <button
                    onClick={() => toggleSite(site.id)}
                    className="p-0.5 rounded hover:text-slate-100 text-slate-400 flex-shrink-0"
                  >
                    <Chevron id={site.id} expanded={expandedSites.has(site.id)} />
                  </button>
                  <button
                    onClick={() => onSelect({ type: 'site', id: site.id })}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  >
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                    <span className="text-sm font-medium truncate">{site.name}</span>
                  </button>
                </div>

                {/* ZONES */}
                {expandedSites.has(site.id) && (
                  <div className="ml-5 space-y-0.5 mt-0.5">
                    {(treeData.zones[site.id] ?? []).length === 0 && (
                      <p className="text-xs text-slate-600 px-2 py-1 italic">Aucune zone</p>
                    )}
                    {(treeData.zones[site.id] ?? []).map(zone => (
                      <div key={zone.id}>
                        <div
                          className={cn(
                            'flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors',
                            isSelected('zone', zone.id)
                              ? 'bg-teal-500/15 text-teal-300'
                              : 'hover:bg-slate-700/40 text-slate-300'
                          )}
                        >
                          <button
                            onClick={() => toggleZone(zone.id)}
                            className="p-0.5 rounded hover:text-slate-100 text-slate-400 flex-shrink-0"
                          >
                            <Chevron id={zone.id} expanded={expandedZones.has(zone.id)} />
                          </button>
                          <button
                            onClick={() => onSelect({ type: 'zone', id: zone.id, siteId: site.id })}
                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                          >
                            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />
                            <span className="text-sm truncate">{zone.name}</span>
                          </button>
                        </div>

                        {/* BUILDINGS */}
                        {expandedZones.has(zone.id) && (
                          <div className="ml-5 space-y-0.5 mt-0.5">
                            {(treeData.buildings[zone.id] ?? []).length === 0 && (
                              <p className="text-xs text-slate-600 px-2 py-1 italic">Aucun bâtiment</p>
                            )}
                            {(treeData.buildings[zone.id] ?? []).map(building => (
                              <div key={building.id}>
                                <div
                                  className={cn(
                                    'flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors',
                                    isSelected('building', building.id)
                                      ? 'bg-blue-500/15 text-blue-300'
                                      : 'hover:bg-slate-700/40 text-slate-300'
                                  )}
                                >
                                  <button
                                    onClick={() => toggleBuilding(building.id)}
                                    className="p-0.5 rounded hover:text-slate-100 text-slate-400 flex-shrink-0"
                                  >
                                    <Chevron id={building.id} expanded={expandedBuildings.has(building.id)} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      onSelect({
                                        type: 'building',
                                        id: building.id,
                                        zoneId: zone.id,
                                        siteId: site.id,
                                      })
                                    }
                                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                                  >
                                    <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                                    <span className="text-sm truncate">{building.building_name}</span>
                                  </button>
                                </div>

                                {/* LEVELS */}
                                {expandedBuildings.has(building.id) && (
                                  <div className="ml-5 space-y-0.5 mt-0.5">
                                    {(treeData.levels[building.id] ?? []).length === 0 && (
                                      <p className="text-xs text-slate-600 px-2 py-1 italic">Aucun étage</p>
                                    )}
                                    {(treeData.levels[building.id] ?? []).map(level => (
                                      <div key={level.id}>
                                        <div
                                          className={cn(
                                            'flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors',
                                            isSelected('level', level.id)
                                              ? 'bg-violet-500/15 text-violet-300'
                                              : 'hover:bg-slate-700/40 text-slate-300'
                                          )}
                                        >
                                          <button
                                            onClick={() => toggleLevel(level.id)}
                                            className="p-0.5 rounded hover:text-slate-100 text-slate-400 flex-shrink-0"
                                          >
                                            <Chevron id={level.id} expanded={expandedLevels.has(level.id)} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              onSelect({ type: 'level', id: level.id, buildingId: building.id })
                                            }
                                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                                          >
                                            <Layers className="w-3.5 h-3.5 flex-shrink-0 text-violet-400" />
                                            <span className="text-sm truncate">{level.name}</span>
                                          </button>
                                        </div>

                                        {/* ROOMS */}
                                        {expandedLevels.has(level.id) && (
                                          <div className="ml-5 space-y-0.5 mt-0.5">
                                            {(treeData.rooms[level.id] ?? []).length === 0 && (
                                              <p className="text-xs text-slate-600 px-2 py-1 italic">
                                                Aucune pièce
                                              </p>
                                            )}
                                            {(treeData.rooms[level.id] ?? []).map(room => (
                                              <button
                                                key={room.id}
                                                onClick={() =>
                                                  onSelect({ type: 'room', id: room.id, levelId: level.id })
                                                }
                                                className={cn(
                                                  'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                                                  isSelected('room', room.id)
                                                    ? 'bg-amber-500/15 text-amber-300'
                                                    : 'hover:bg-slate-700/40 text-slate-300'
                                                )}
                                              >
                                                <div className="w-4 flex-shrink-0" />
                                                <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                                                <span className="text-sm font-mono truncate">{room.code}</span>
                                                {room.service && (
                                                  <span className="text-xs text-slate-500 truncate">
                                                    {room.service}
                                                  </span>
                                                )}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
