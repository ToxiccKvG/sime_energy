import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, LayoutGrid } from 'lucide-react';
import { getAuditSites, AuditSiteDB } from '@/lib/audit-service';
import { getZones, getZoneBuildings, getLevels, getRooms } from '@/lib/inventory-service';
import type { InventoryZone, InventoryLevel, InventoryRoom } from '@/types/inventory';
import { InventaireTree } from '@/components/inventaire/InventaireTree';
import { NodeDetail } from '@/components/inventaire/NodeDetail';
import { InventaireViz } from '@/components/inventaire/InventaireViz';
import { InventaireNotes } from '@/components/inventaire/InventaireNotes';
import { useAudits } from '@/hooks/useAudits';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';

export type SelectionNode =
  | { type: 'site'; id: string }
  | { type: 'zone'; id: string; siteId: string }
  | { type: 'building'; id: string; zoneId: string; siteId: string }
  | { type: 'level'; id: string; buildingId: string }
  | { type: 'room'; id: string; levelId: string };

export interface TreeData {
  sites: AuditSiteDB[];
  zones: Record<string, InventoryZone[]>;
  buildings: Record<string, any[]>;
  levels: Record<string, InventoryLevel[]>;
  rooms: Record<string, InventoryRoom[]>;
}

const Inventaire = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { organization } = useOrganization();

  const [activeTab, setActiveTab] = useState<'cadastre' | 'viz' | 'notes'>('cadastre');
  const [selectedAuditId, setSelectedAuditId] = useState<string>(
    searchParams.get('auditId') || ''
  );
  const [selection, setSelection] = useState<SelectionNode | null>(null);
  const [treeData, setTreeData] = useState<TreeData>({
    sites: [],
    zones: {},
    buildings: {},
    levels: {},
    rooms: {},
  });

  const { data: audits = [] } = useAudits(organization?.id);
  const { data: categories = [] } = useEquipmentCategories(organization?.id);

  const { data: sitesData, isPending: loadingTree } = useQuery({
    queryKey: ['audit-sites', selectedAuditId],
    queryFn: () => getAuditSites(selectedAuditId),
    enabled: !!selectedAuditId,
  });

  // Sync sites from query into treeData
  useEffect(() => {
    if (sitesData !== undefined) {
      setTreeData(prev => ({ ...prev, sites: sitesData ?? [] }));
    }
  }, [sitesData]);

  const handleAuditChange = (auditId: string) => {
    setSelectedAuditId(auditId);
    setTreeData({ sites: [], zones: {}, buildings: {}, levels: {}, rooms: {} });
    setSelection(null);
    setSearchParams({ auditId });
  };

  // Lazy loaders — only fetch if not already cached
  const loadZones = useCallback(async (siteId: string) => {
    if (treeData.zones[siteId] !== undefined) return;
    try {
      const data = await getZones(siteId);
      setTreeData(prev => ({ ...prev, zones: { ...prev.zones, [siteId]: data } }));
    } catch {
      toast.error('Erreur chargement zones');
    }
  }, [treeData.zones]);

  const loadBuildings = useCallback(async (zoneId: string) => {
    if (treeData.buildings[zoneId] !== undefined) return;
    try {
      const data = await getZoneBuildings(zoneId);
      setTreeData(prev => ({ ...prev, buildings: { ...prev.buildings, [zoneId]: data ?? [] } }));
    } catch {
      toast.error('Erreur chargement bâtiments');
    }
  }, [treeData.buildings]);

  const loadLevels = useCallback(async (buildingId: string) => {
    if (treeData.levels[buildingId] !== undefined) return;
    try {
      const data = await getLevels(buildingId);
      setTreeData(prev => ({ ...prev, levels: { ...prev.levels, [buildingId]: data } }));
    } catch {
      toast.error('Erreur chargement étages');
    }
  }, [treeData.levels]);

  const loadRooms = useCallback(async (levelId: string) => {
    if (treeData.rooms[levelId] !== undefined) return;
    try {
      const data = await getRooms(levelId);
      setTreeData(prev => ({ ...prev, rooms: { ...prev.rooms, [levelId]: data } }));
    } catch {
      toast.error('Erreur chargement pièces');
    }
  }, [treeData.rooms]);

  // Refresh callbacks called after CRUD operations in NodeDetail
  const refreshZones = useCallback(async (siteId: string) => {
    try {
      const data = await getZones(siteId);
      setTreeData(prev => ({ ...prev, zones: { ...prev.zones, [siteId]: data } }));
    } catch {
      toast.error('Erreur rafraîchissement zones');
    }
  }, []);

  const refreshBuildings = useCallback(async (zoneId: string) => {
    try {
      const data = await getZoneBuildings(zoneId);
      setTreeData(prev => ({ ...prev, buildings: { ...prev.buildings, [zoneId]: data ?? [] } }));
    } catch {
      toast.error('Erreur rafraîchissement bâtiments');
    }
  }, []);

  const refreshLevels = useCallback(async (buildingId: string) => {
    try {
      const data = await getLevels(buildingId);
      setTreeData(prev => ({ ...prev, levels: { ...prev.levels, [buildingId]: data } }));
    } catch {
      toast.error('Erreur rafraîchissement étages');
    }
  }, []);

  const refreshRooms = useCallback(async (levelId: string) => {
    try {
      const data = await getRooms(levelId);
      setTreeData(prev => ({ ...prev, rooms: { ...prev.rooms, [levelId]: data } }));
    } catch {
      toast.error('Erreur rafraîchissement pièces');
    }
  }, []);

  const handleNavigateTo = useCallback((sel: SelectionNode) => {
    setActiveTab('cadastre');
    setSelection(sel);
  }, []);

  if (!organization) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inventaire Énergétique</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastre des équipements et installations</p>
        </div>

        <Select value={selectedAuditId} onValueChange={handleAuditChange}>
          <SelectTrigger className="w-full sm:w-64 bg-card border-border text-foreground">
            <SelectValue placeholder="Sélectionner un projet…" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {audits.map(a => (
              <SelectItem key={a.id} value={a.id} className="text-foreground focus:bg-accent">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: a.color || '#6366f1' }}
                  />
                  {a.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs — always visible, disabled when no project selected */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList className="flex-shrink-0 w-fit bg-transparent border-b border-border rounded-none px-0 gap-0">
          <TabsTrigger
            value="cadastre"
            disabled={!selectedAuditId}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
          >
            Cadastre
          </TabsTrigger>
          <TabsTrigger
            value="viz"
            disabled={!selectedAuditId}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
          >
            Visualisation
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            disabled={!selectedAuditId}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
          >
            Notes / Rapport
          </TabsTrigger>
        </TabsList>

        <TabsContent value="viz" className="flex-1 mt-0">
          <InventaireViz auditId={selectedAuditId} onNavigateTo={handleNavigateTo} />
        </TabsContent>

        <TabsContent value="notes" className="flex-1 mt-0">
          <div className="h-full bg-card border border-border/50 rounded-xl p-5 overflow-auto">
            <InventaireNotes auditId={selectedAuditId} />
          </div>
        </TabsContent>

        <TabsContent value="cadastre" className="flex-1 mt-0 min-h-0">
          {!selectedAuditId ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-lg font-medium">Sélectionner un projet</p>
                <p className="text-sm mt-1 text-muted-foreground">
                  Choisissez un projet pour accéder à son inventaire
                </p>
              </div>
            </div>
          ) : loadingTree ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-4 h-full">
              <InventaireTree
                treeData={treeData}
                selection={selection}
                onSelect={setSelection}
                onExpandSite={loadZones}
                onExpandZone={loadBuildings}
                onExpandBuilding={loadLevels}
                onExpandLevel={loadRooms}
              />
              <NodeDetail
                selection={selection}
                treeData={treeData}
                categories={categories}
                auditId={selectedAuditId}
                orgId={organization.id}
                userId={user?.id || ''}
                onRefreshZones={refreshZones}
                onRefreshBuildings={refreshBuildings}
                onRefreshLevels={refreshLevels}
                onRefreshRooms={refreshRooms}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Inventaire;
