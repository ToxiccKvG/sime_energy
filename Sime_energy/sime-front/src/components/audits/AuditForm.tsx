import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Audit } from '@/types/audit';
import {
  createAudit, updateAudit,
  createAuditSite, updateAuditSite, deleteAuditSite,
  createAuditBuilding, updateAuditBuilding,
  getAuditSites,
} from '@/lib/audit-service';
import { createLevel, getZones, createZone, updateZone, getZoneBuildings } from '@/lib/inventory-service';
import { NIVEAU_OPTIONS } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputField, TextareaField, YesNoField } from './AuditFormFields';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Save, Plus, Trash2, MapPin, Building2,
  Factory, Briefcase, HelpCircle, ChevronDown, ChevronRight, Layers, FolderOpen,
} from 'lucide-react';
import AuditQuestionnaire from './AuditQuestionnaire';

const BUILDING_TYPES = [
  'Administratif',
  'Industriel / Usine',
  'Commercial / Retail',
  'Hôtel / Hébergement',
  'Hôpital / Clinique',
  'École / Université',
  'Résidentiel',
  'Entrepôt / Logistique',
  'Restauration',
  'Sport / Loisirs',
  'Atelier / Maintenance',
  'Mixte',
  'Autre',
];

interface AuditFormProps {
  audit?: Audit;
  onSave: (audit: Partial<Audit>) => void;
  onCancel: () => void;
}

interface FormZone {
  id?: string;
  name: string;
  description?: string;
  buildings: FormBuilding[];
}

interface FormSite {
  id?: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  zones: FormZone[];
}

interface FormBuilding {
  id?: string;
  name: string;
  type: string;
  surfaceTerrain?: number;
  surfaceBatie?: number;
  surfaceToiture?: number;
  levels: string[]; // étages sélectionnés (ex: ['RDC', 'R+1', 'R+2'])
  // Sections Sites/Usines
  structureBati?: Record<string, any>;
  enveloppe?: Record<string, any>;
  amenagement?: Record<string, any>;
}

const CVC_OPTIONS = [
  '1. Chauffage', '2. Clim', '3. Ventilation',
  '4. Froid adiabat', '5. Refroid. évap.', '6. Sans cond.', '7. Chauffe + refroid',
];

const SENEGAL_REGIONS = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Louga', 'Diourbel', 'Fatick',
  'Kaolack', 'Ziguinchor', 'Kolda', 'Tambacounda', 'Matam', 'Kaffrine',
  'Sédhiou', 'Kédougou',
];

const SENEGAL_VILLES = [
  'Dakar', 'Pikine', 'Guédiawaye', 'Rufisque', 'Bargny',
  'Thiès', 'Mbour', 'Tivaouane', 'Saly',
  'Saint-Louis', 'Dagana', 'Podor',
  'Louga', 'Linguère', 'Kébémer',
  'Diourbel', 'Mbacké', 'Touba', 'Bambey',
  'Fatick', 'Gossas', 'Foundiougne',
  'Kaolack', 'Nioro du Rip', 'Guinguinéo',
  'Ziguinchor', 'Bignona', 'Oussouye',
  'Kolda', 'Vélingara',
  'Tambacounda', 'Bakel', 'Goudiry',
  'Matam', 'Kanel',
  'Kaffrine', 'Birkilane',
  'Sédhiou', 'Bounkiling',
  'Kédougou', 'Saraya',
  'Autre',
];

const ORIENTATION_OPTIONS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
const TYPE_TOIT_OPTIONS = ['Tôle ondulée', 'Béton (dalle)', 'Tuiles', 'Fibrociment', 'Chaume', 'Mixte', 'Autre'];
const TYPE_VITRAGE_OPTIONS = ['Simple vitrage', 'Double vitrage', 'Simple vitrage teinté', 'Polycarbonate', 'Sans vitrage significatif', 'Autre'];
const FORME_JURIDIQUE_OPTIONS = ['SARL', 'SA', 'SNC', 'GIE', 'EURL', 'Établissement public', 'EPIC', 'Autre'];

export function AuditForm({ audit, onSave, onCancel }: AuditFormProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [sites, setSites] = useState<FormSite[]>([]);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [expandedBuilding, setExpandedBuilding] = useState<number | null>(null);
  // Track original IDs per site to detect deletions on update
  const originalSiteIds = useRef<Set<string>>(new Set());

  // Dynamic table rows — stored in general_info JSONB on save
  const [consommationsEnergie, setConsommationsEnergie] = useState<any[]>(
    (audit as any)?.generalInfo?.consommationsEnergie ?? [
      { type: 'Électricité achetée', unite: 'kWh', a1Qte: '', a1Cout: '', a2Qte: '', a2Cout: '', a3Qte: '', a3Cout: '' },
      { type: 'Gasoil', unite: 'L', a1Qte: '', a1Cout: '', a2Qte: '', a2Cout: '', a3Qte: '', a3Cout: '' },
      { type: 'Eau', unite: 'm³', a1Qte: '', a1Cout: '', a2Qte: '', a2Cout: '', a3Qte: '', a3Cout: '' },
    ]
  );
  const [problemesEff, setProblemesEff] = useState<any[]>(
    (audit as any)?.generalInfo?.problemesEff ?? [
      { designation: "Coupures d'électricité", frequence: '', duree: '' },
      { designation: "Coupures d'eau", frequence: '', duree: '' },
      { designation: 'Ruptures de carburant', frequence: '', duree: '' },
      { designation: 'Tension électrique anormale', frequence: '', duree: '' },
    ]
  );
  const [productions, setProductions] = useState<any[]>(
    (audit as any)?.generalInfo?.specifique?.productions ?? []
  );
  const [procedesEqs, setProcedesEqs] = useState<any[]>(
    (audit as any)?.generalInfo?.specifique?.procedesEqs ?? []
  );
  const [dechets, setDechets] = useState<any[]>(
    (audit as any)?.generalInfo?.specifique?.dechets ?? []
  );
  const [responsablesEnergie, setResponsablesEnergie] = useState<any[]>(
    (audit as any)?.personnel?.responsableEnergie ?? []
  );
  const [pointsFocaux, setPointsFocaux] = useState<any[]>(
    (audit as any)?.personnel?.pointFocal ?? []
  );
  const [effectifs, setEffectifs] = useState<any[]>(
    (audit as any)?.personnel?.employes?.length > 0
      ? (audit as any).personnel.employes
      : [
          { categorie: 'Permanent', hommes: '', femmes: '', cadres: '' },
          { categorie: 'Saisonnier', hommes: '', femmes: '', cadres: '' },
          { categorie: 'Journalier', hommes: '', femmes: '', cadres: '' },
        ]
  );

  // Navigate between tabs (skip specifique if no clientType yet)
  const TAB_ORDER = ['basic', 'general', 'specifique', 'personnel', 'sites'];
  const goToNextTab = () => {
    let idx = TAB_ORDER.indexOf(activeTab) + 1;
    if (idx < TAB_ORDER.length) setActiveTab(TAB_ORDER[idx]);
  };

  const [formData, setFormData] = useState<Partial<Audit>>(audit || {
    name: '',
    color: '#3b82f6',
    status: 'planned',
    clientType: undefined,
    startDate: new Date().toISOString().split('T')[0],
    completionPercentage: 0,
    generalInfo: {
      nomEtablissement: '',
      siege: '',
      adresse: '',
      telephone: '',
      email: '',
      formeJuridique: 'SARL',
      capital: 0,
      ninea: '',
      secteur: '',
      ca: 0,
      anneeCreation: new Date().getFullYear(),
      miseService: '',
      exportatrice: false,
      marches: '',
    },
    personnel: {
      dg: '',
      dt: '',
      responsableEnergie: [],
      pointFocal: [],
      employes: [],
      programmeOperations: {
        quartsJour: 0,
        heuresQuart: 0,
        horaires: '',
        activiteSaisonniere: false,
        maintenance: false,
      },
    },
    capacites: { usines: [] },
  });

  const [newSite, setNewSite]     = useState<FormSite>({ name: '', address: '', zones: [] });
  const [newZone, setNewZone]     = useState<FormZone>({ name: '', description: '', buildings: [] });
  const [newBuilding, setNewBuilding] = useState<FormBuilding>({ name: '', type: '', levels: [] });

  // Load existing sites → zones → buildings when editing
  useEffect(() => {
    if (!audit?.id) return;
    setLoadingSites(true);
    getAuditSites(audit.id)
      .then(async (dbSites) => {
        if (!dbSites || dbSites.length === 0) return;
        const siteIds = new Set<string>();
        const formSites = await Promise.all(
          dbSites.map(async (s) => {
            siteIds.add(s.id);
            const dbZones = await getZones(s.id).catch(() => []);
            const zones: FormZone[] = await Promise.all(
              (dbZones ?? []).map(async (z) => {
                const dbBuildings = await getZoneBuildings(z.id).catch(() => []);
                const buildings: FormBuilding[] = (dbBuildings ?? []).map(b => ({
                  id: b.id,
                  name: b.building_name,
                  type: b.building_type || '',
                  surfaceTerrain: b.surface_terrain,
                  surfaceBatie: b.surface_batie,
                  surfaceToiture: b.surface_toiture,
                  levels: [],
                }));
                return { id: z.id, name: z.name, description: z.description || '', buildings } as FormZone;
              })
            );
            return {
              id: s.id, name: s.name, address: s.address || '',
              latitude: s.latitude, longitude: s.longitude, zones,
            } as FormSite;
          })
        );
        originalSiteIds.current = siteIds;
        setSites(formSites);
      })
      .catch(console.error)
      .finally(() => setLoadingSites(false));
  }, [audit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- HANDLERS ----

  const handleGeneralChange = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, generalInfo: { ...prev.generalInfo!, [field]: value } }));

  const handlePersonnelChange = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, personnel: { ...prev.personnel!, [field]: value } }));

  const handleProgrammeChange = (field: string, value: any) =>
    setFormData(prev => ({
      ...prev,
      personnel: {
        ...prev.personnel!,
        programmeOperations: { ...prev.personnel!.programmeOperations, [field]: value },
      },
    }));

  const handleSpecifiqueChange = (field: string, value: any) =>
    setFormData(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo!,
        specifique: { ...(prev.generalInfo as any)?.specifique, [field]: value },
      },
    }));

  const ABOVE_GROUND = ['RDC', 'R+1', 'R+2', 'R+3', 'R+4', 'R+5', 'R+6', 'R+7', 'R+8', 'R+9', 'R+10', 'R+11', 'R+12', 'R+13', 'R+14', 'R+15'];
  const BELOW_GROUND = ['R-2', 'R-1'];

  const handleSelectLevel = (level: string) => {
    if (level === 'Mezzanine' || level === 'Terrasse') {
      setNewBuilding(prev => ({
        ...prev,
        levels: prev.levels.includes(level)
          ? prev.levels.filter(l => l !== level)
          : [...prev.levels, level],
      }));
      return;
    }
    if (ABOVE_GROUND.includes(level)) {
      const idx = ABOVE_GROUND.indexOf(level);
      const range = ABOVE_GROUND.slice(0, idx + 1);
      setNewBuilding(prev => {
        const already = range.every(l => prev.levels.includes(l));
        const others = prev.levels.filter(l => !ABOVE_GROUND.includes(l));
        return { ...prev, levels: already ? others : [...others, ...range] };
      });
    } else if (BELOW_GROUND.includes(level)) {
      const idx = BELOW_GROUND.indexOf(level);
      const range = BELOW_GROUND.slice(idx);
      setNewBuilding(prev => {
        const already = range.every(l => prev.levels.includes(l));
        const others = prev.levels.filter(l => !BELOW_GROUND.includes(l));
        return { ...prev, levels: already ? others : [...others, ...range] };
      });
    }
  };

  const handleNewBuildingSection = (section: 'structureBati' | 'enveloppe' | 'amenagement', field: string, value: any) => {
    setNewBuilding(prev => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, any> || {}), [field]: value },
    }));
  };

  const DAYS_OF_WEEK = [
    { key: 'lundi', label: 'Lundi' },
    { key: 'mardi', label: 'Mardi' },
    { key: 'mercredi', label: 'Mercredi' },
    { key: 'jeudi', label: 'Jeudi' },
    { key: 'vendredi', label: 'Vendredi' },
    { key: 'samedi', label: 'Samedi' },
    { key: 'dimanche', label: 'Dimanche' },
  ] as const;

  const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2).toString().padStart(2, '0');
    const m = i % 2 === 0 ? '00' : '30';
    return `${h}:${m}`;
  });

  const DEFAULT_HORAIRES = {
    lundi: { enabled: true, start: '08:00', end: '17:00' },
    mardi: { enabled: true, start: '08:00', end: '17:00' },
    mercredi: { enabled: true, start: '08:00', end: '17:00' },
    jeudi: { enabled: true, start: '08:00', end: '17:00' },
    vendredi: { enabled: true, start: '08:00', end: '17:00' },
    samedi: { enabled: false, start: '08:00', end: '12:00' },
    dimanche: { enabled: false, start: '08:00', end: '12:00' },
  };

  const getHoraires = () => {
    const raw = formData.personnel?.programmeOperations.horaires;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'lundi' in (raw as object)) {
      return raw as typeof DEFAULT_HORAIRES;
    }
    return DEFAULT_HORAIRES;
  };

  const handleHoraireDay = (day: string, field: 'enabled' | 'start' | 'end', value: boolean | string) => {
    const current = getHoraires();
    handleProgrammeChange('horaires', {
      ...current,
      [day]: { ...current[day as keyof typeof current], [field]: value },
    });
  };

  const handleAddSite = () => {
    if (!newSite.name || !newSite.address) {
      toast({ title: 'Erreur', description: 'Veuillez remplir le nom et l\'adresse du site', variant: 'destructive' });
      return;
    }
    let siteToAdd: FormSite = { ...newSite, zones: [] };
    if (newZone.name) {
      const zone: FormZone = {
        ...newZone,
        buildings: newBuilding.name ? [{ ...newBuilding }] : [],
      };
      siteToAdd = { ...siteToAdd, zones: [zone] };
    }
    setSites(prev => [...prev, siteToAdd]);
    setNewSite({ name: '', address: '', zones: [] });
    setNewZone({ name: '', description: '', buildings: [] });
    setNewBuilding({ name: '', type: '', levels: [] });
    setExpandedZone(null);
  };

  const handleBuildingSection = (buildingIdx: number, section: 'structureBati' | 'enveloppe' | 'amenagement', field: string, value: any) => {
    setNewZone(prev => {
      const buildings = [...prev.buildings];
      buildings[buildingIdx] = {
        ...buildings[buildingIdx],
        [section]: { ...buildings[buildingIdx][section], [field]: value },
      };
      return { ...prev, buildings };
    });
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({ title: 'Erreur', description: 'Veuillez remplir le nom du projet', variant: 'destructive' });
      return;
    }
    if (!user?.id || !organization?.id) {
      toast({ title: 'Erreur', description: 'Informations utilisateur/organisation manquantes', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Merge dynamic tables into generalInfo before save
      const enrichedFormData = {
        ...formData,
        generalInfo: {
          ...formData.generalInfo,
          consommationsEnergie,
          problemesEff,
          specifique: {
            ...(formData.generalInfo as any)?.specifique,
            productions,
            procedesEqs,
            dechets,
          },
        } as any,
        personnel: {
          ...formData.personnel,
          responsableEnergie: responsablesEnergie,
          pointFocal: pointsFocaux,
          employes: effectifs,
        } as any,
      };
      let auditId: string;
      if (audit?.id) {
        const updated = await updateAudit(audit.id, enrichedFormData);
        auditId = updated.id;

        // Sync sites: delete removed, update existing, create new
        const currentSiteIds = new Set(sites.filter(s => s.id).map(s => s.id!));
        for (const deletedId of originalSiteIds.current) {
          if (!currentSiteIds.has(deletedId)) {
            await deleteAuditSite(deletedId);
          }
        }
        for (const site of sites) {
          if (site.id) {
            await updateAuditSite(site.id, {
              name: site.name, address: site.address,
              latitude: site.latitude, longitude: site.longitude,
            });
            for (const zone of site.zones) {
              let zoneId: string;
              if (zone.id) {
                await updateZone(zone.id, { name: zone.name, description: zone.description });
                zoneId = zone.id;
              } else {
                const createdZone = await createZone(auditId, site.id, zone.name, zone.description);
                zoneId = createdZone.id;
              }
              for (const building of zone.buildings) {
                if (building.id) {
                  await updateAuditBuilding(building.id, {
                    building_name: building.name,
                    building_type: building.type || undefined,
                    surface_terrain: building.surfaceTerrain,
                    surface_batie: building.surfaceBatie,
                    surface_toiture: building.surfaceToiture,
                  });
                } else {
                  const createdBuilding = await createAuditBuilding(site.id, auditId, {
                    building_name: building.name,
                    building_type: building.type || undefined,
                    surface_terrain: building.surfaceTerrain,
                    surface_batie: building.surfaceBatie,
                    surface_toiture: building.surfaceToiture,
                    zone_id: zoneId,
                  });
                  if (createdBuilding?.id && building.levels.length > 0) {
                    const orderedLevels = NIVEAU_OPTIONS.filter(n => building.levels.includes(n));
                    for (let i = 0; i < orderedLevels.length; i++) {
                      await createLevel(auditId, createdBuilding.id, orderedLevels[i], i);
                    }
                  }
                }
              }
            }
          } else {
            const createdSite = await createAuditSite(auditId, {
              name: site.name, address: site.address,
              latitude: site.latitude, longitude: site.longitude, status: 'planned',
            });
            for (const zone of site.zones) {
              const createdZone = await createZone(auditId, createdSite.id, zone.name, zone.description);
              for (const building of zone.buildings) {
                const createdBuilding = await createAuditBuilding(createdSite.id, auditId, {
                  building_name: building.name,
                  building_type: building.type || undefined,
                  surface_terrain: building.surfaceTerrain,
                  surface_batie: building.surfaceBatie,
                  surface_toiture: building.surfaceToiture,
                  zone_id: createdZone.id,
                });
                if (createdBuilding?.id && building.levels.length > 0) {
                  const orderedLevels = NIVEAU_OPTIONS.filter(n => building.levels.includes(n));
                  for (let i = 0; i < orderedLevels.length; i++) {
                    await createLevel(auditId, createdBuilding.id, orderedLevels[i], i);
                  }
                }
              }
            }
          }
        }
        toast({ title: 'Succès', description: 'Projet mis à jour' });
      } else {
        const created = await createAudit(enrichedFormData, organization.id, user.id);
        auditId = created.id;
        for (const site of sites) {
          const createdSite = await createAuditSite(auditId, {
            name: site.name, address: site.address,
            latitude: site.latitude, longitude: site.longitude, status: 'planned',
          });
          for (const zone of site.zones) {
            const createdZone = await createZone(auditId, createdSite.id, zone.name, zone.description);
            for (const building of zone.buildings) {
              const createdBuilding = await createAuditBuilding(createdSite.id, auditId, {
                building_name: building.name,
                building_type: building.type || undefined,
                surface_terrain: building.surfaceTerrain,
                surface_batie: building.surfaceBatie,
                surface_toiture: building.surfaceToiture,
                zone_id: createdZone.id,
              });
              if (createdBuilding?.id && building.levels.length > 0) {
                const orderedLevels = NIVEAU_OPTIONS.filter(n => building.levels.includes(n));
                for (let i = 0; i < orderedLevels.length; i++) {
                  await createLevel(auditId, createdBuilding.id, orderedLevels[i], i);
                }
              }
            }
          }
        }
        toast({ title: 'Succès', description: 'Projet créé' });
      }
      onSave(formData);
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error?.message || 'Erreur lors de l\'enregistrement',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const clientType = formData.clientType;
  const specifique = (formData.generalInfo as any)?.specifique || {};
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-100 truncate">
              {audit ? 'Modifier le projet' : 'Créer un projet'}
            </h2>
            <p className="text-sm text-slate-400 hidden sm:block">
              {audit ? 'Mettez à jour les informations du projet' : 'Définissez le type de client puis renseignez les informations'}
            </p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700 shrink-0">
          <Save className="mr-2 h-4 w-4" />
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="grid min-w-max sm:w-full sm:min-w-0 grid-cols-5 bg-slate-800/60">
          <TabsTrigger value="basic">Projet</TabsTrigger>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="specifique">
            {clientType === 'INDUSTRIE' ? 'Industrie' : clientType === 'SERVICES' ? 'Services' : 'Spécifique'}
          </TabsTrigger>
          <TabsTrigger value="personnel">Personnel</TabsTrigger>
          <TabsTrigger value="sites">Sites & Bâtiments</TabsTrigger>
        </TabsList>
        </div>

        {/* ---- ONGLET PROJET ---- */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          {/* Type de client */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Type de client</CardTitle>
              <CardDescription>Sélectionnez le type pour adapter le formulaire</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* INDUSTRIE */}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, clientType: 'INDUSTRIE' }))}
                  className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                    clientType === 'INDUSTRIE'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Factory className="h-10 w-10" />
                  <div>
                    <p className="font-semibold text-lg">INDUSTRIE</p>
                    <p className="text-xs mt-1 text-slate-500">Usines, sites industriels, procédés de fabrication</p>
                  </div>
                  {clientType === 'INDUSTRIE' && (
                    <Badge className="absolute top-2 right-2 bg-orange-500/20 text-orange-400 border-orange-500/30">Sélectionné</Badge>
                  )}
                </button>

                {/* SERVICES */}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, clientType: 'SERVICES' }))}
                  className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                    clientType === 'SERVICES'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Briefcase className="h-10 w-10" />
                  <div>
                    <p className="font-semibold text-lg">SERVICES</p>
                    <p className="text-xs mt-1 text-slate-500">Hôtels, hôpitaux, écoles, bureaux, tertiaire</p>
                  </div>
                  {clientType === 'SERVICES' && (
                    <Badge className="absolute top-2 right-2 bg-blue-500/20 text-blue-400 border-blue-500/30">Sélectionné</Badge>
                  )}
                </button>

                {/* AUTRE */}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, clientType: 'AUTRE' }))}
                  className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                    clientType === 'AUTRE'
                      ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <HelpCircle className="h-10 w-10" />
                  <div>
                    <p className="font-semibold text-lg">AUTRE</p>
                    <p className="text-xs mt-1 text-slate-500">Commerce, artisanat, mixte, autre activité</p>
                  </div>
                  {clientType === 'AUTRE' && (
                    <Badge className="absolute top-2 right-2 bg-violet-500/20 text-violet-400 border-violet-500/30">Sélectionné</Badge>
                  )}
                </button>
              </div>

              {clientType === 'AUTRE' && (
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Préciser le type d'établissement</Label>
                  <Input
                    placeholder="ex: Commerce, Artisanat, Agro-industrie, Mixte…"
                    value={(formData.generalInfo as any)?.clientTypeAutre || ''}
                    onChange={e => handleGeneralChange('clientTypeAutre', e.target.value)}
                    className="bg-slate-700/50 border-slate-600 text-slate-100"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Infos de base */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Informations du projet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputField
                label="Nom du projet"
                field="name"
                value={formData.name}
                onChange={(_, v) => setFormData(prev => ({ ...prev, name: v }))}
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Couleur</Label>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="h-10 w-full rounded border border-slate-600 cursor-pointer bg-transparent"
                  />
                </div>
                <InputField
                  label="Date de début"
                  field="startDate"
                  type="date"
                  value={formData.startDate?.split('T')[0]}
                  onChange={(_, v) => setFormData(prev => ({ ...prev, startDate: v }))}
                />
                <InputField
                  label="Responsable"
                  field="responsable"
                  value={formData.responsable}
                  onChange={(_, v) => setFormData(prev => ({ ...prev, responsable: v }))}
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end pt-2">
            <Button onClick={goToNextTab} className="bg-blue-600 hover:bg-blue-500 text-white px-6">
              Suivant <span className="ml-1">→</span>
            </Button>
          </div>
        </TabsContent>

        {/* ---- ONGLET GÉNÉRAL (champs communs) ---- */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Informations de l'établissement</CardTitle>
              <CardDescription>Champs communs INDUSTRIE & SERVICES</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Ref Za" field="refZa" value={(formData.generalInfo as any)?.refZa} onChange={handleGeneralChange} />
                <InputField label="Nom établissement" field="nomEtablissement" value={formData.generalInfo?.nomEtablissement} onChange={handleGeneralChange} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Siège (ville)</Label>
                  <Select value={formData.generalInfo?.siege || ''} onValueChange={v => handleGeneralChange('siege', v)}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                      <SelectValue placeholder="Sélectionner une ville…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d2e] border-slate-700 max-h-60">
                      {SENEGAL_VILLES.map(v => (
                        <SelectItem key={v} value={v} className="text-slate-100 focus:bg-slate-700/50">{v}</SelectItem>
                      ))}
                      <SelectItem value="__autre__" className="text-slate-400 focus:bg-slate-700/50 italic">Autre (hors Sénégal)…</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.generalInfo?.siege === '__autre__' && (
                    <Input
                      placeholder="Saisir la ville…"
                      value={(formData.generalInfo as any)?.siegeLibre || ''}
                      onChange={e => handleGeneralChange('siegeLibre', e.target.value)}
                      className="mt-1.5 bg-slate-700/50 border-slate-600 text-slate-100 text-sm"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Province / Région des sites</Label>
                  <Select value={(formData.generalInfo as any)?.province || ''} onValueChange={v => handleGeneralChange('province', v)}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                      <SelectValue placeholder="Sélectionner une région…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d2e] border-slate-700">
                      {SENEGAL_REGIONS.map(r => (
                        <SelectItem key={r} value={r} className="text-slate-100 focus:bg-slate-700/50">{r}</SelectItem>
                      ))}
                      <SelectItem value="__autre__" className="text-slate-400 focus:bg-slate-700/50 italic">Autre (hors Sénégal)…</SelectItem>
                    </SelectContent>
                  </Select>
                  {(formData.generalInfo as any)?.province === '__autre__' && (
                    <Input
                      placeholder="Saisir la région / province…"
                      value={(formData.generalInfo as any)?.provinceLibre || ''}
                      onChange={e => handleGeneralChange('provinceLibre', e.target.value)}
                      className="mt-1.5 bg-slate-700/50 border-slate-600 text-slate-100 text-sm"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Date de création" field="dateCreation" type="date" value={(formData.generalInfo as any)?.dateCreation} onChange={handleGeneralChange} />
                <InputField label="Effectifs" field="effectifs" type="number" value={(formData.generalInfo as any)?.effectifs} onChange={handleGeneralChange} />
                <InputField label="MACS" field="macs" value={(formData.generalInfo as any)?.macs} onChange={handleGeneralChange} />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300 text-sm">Forme juridique</Label>
                <Select value={formData.generalInfo?.formeJuridique || ''} onValueChange={v => handleGeneralChange('formeJuridique', v)}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-slate-700">
                    {FORME_JURIDIQUE_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt} className="text-slate-100 focus:bg-slate-700/50">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-3">Direction & Contacts</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField label="Directeur Général" field="dg" value={formData.personnel?.dg} onChange={handlePersonnelChange} />
                  <InputField label="Resp. Technique" field="dt" value={formData.personnel?.dt} onChange={handlePersonnelChange} />
                  <InputField label="Resp. Énergie" field="respEnergie" value={(formData.generalInfo as any)?.respEnergie} onChange={handleGeneralChange} />
                  <InputField label="Responsable Achat" field="respAchat" value={(formData.generalInfo as any)?.respAchat} onChange={handleGeneralChange} />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-3">Financier & Énergie</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <InputField label="Montant M1 (FCFA)" field="montantM1" type="number" value={(formData.generalInfo as any)?.montantM1} onChange={handleGeneralChange} />
                  <InputField label="Montant M2 (FCFA)" field="montantM2" type="number" value={(formData.generalInfo as any)?.montantM2} onChange={handleGeneralChange} />
                  <InputField label="Montant M3 (FCFA)" field="montantM3" type="number" value={(formData.generalInfo as any)?.montantM3} onChange={handleGeneralChange} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <InputField label="Chiffres d'affaires (FCFA)" field="ca" type="number" value={formData.generalInfo?.ca} onChange={handleGeneralChange} />
                  <InputField label="Programmes d'épargne" field="programmesEpargne" value={(formData.generalInfo as any)?.programmesEpargne} onChange={handleGeneralChange} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <InputField label="Contrats / Fournisseurs énergie" field="contratsEnergie" value={(formData.generalInfo as any)?.contratsEnergie} onChange={handleGeneralChange} />
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-sm">Fréquence maintenance</Label>
                    <Select value={(formData.personnel as any)?.programmeOperations?.frequenceMaintenance || ''} onValueChange={v => handleProgrammeChange('frequenceMaintenance', v)}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-slate-700">
                        {['Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Autre'].map(o => (
                          <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Contact & identification */}
              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-3">Identification légale & Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField label="Adresse" field="adresse" value={formData.generalInfo?.adresse} onChange={handleGeneralChange} />
                  <InputField label="Téléphone" field="telephone" value={formData.generalInfo?.telephone} onChange={handleGeneralChange} />
                  <InputField label="Email" field="email" value={formData.generalInfo?.email} onChange={handleGeneralChange} />
                  <InputField label="NINEA" field="ninea" value={formData.generalInfo?.ninea} onChange={handleGeneralChange} />
                  <InputField label="Capital (FCFA)" field="capital" type="number" value={formData.generalInfo?.capital} onChange={handleGeneralChange} />
                  <InputField label="Secteur d'activité" field="secteur" value={formData.generalInfo?.secteur} onChange={handleGeneralChange} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <InputField label="Date de mise en service" field="miseService" type="date" value={formData.generalInfo?.miseService} onChange={handleGeneralChange} />
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Société exportatrice</Label>
                    <div className="flex gap-4">
                      {['Oui', 'Non'].map(opt => (
                        <div key={opt} className="flex items-center gap-2">
                          <Checkbox
                            checked={!!formData.generalInfo?.exportatrice === (opt === 'Oui')}
                            onCheckedChange={() => handleGeneralChange('exportatrice', opt === 'Oui')}
                          />
                          <span className="text-sm text-slate-300">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <InputField label="Marchés couverts (zones/pays)" field="marches" value={formData.generalInfo?.marches} onChange={handleGeneralChange} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consommations d'énergies */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Consommations d'énergies — 3 dernières années
              </CardTitle>
              <CardDescription>Fournir copies de factures énergies achetées / mois</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 pr-2 font-medium">Type d'énergie</th>
                      <th className="text-left py-2 pr-2 font-medium w-20">Unité</th>
                      {['Année 1', 'Année 2', 'Année 3'].map(y => (
                        <React.Fragment key={y}>
                          <th className="text-right py-2 px-1 font-medium text-xs">{y} Qté</th>
                          <th className="text-right py-2 px-1 font-medium text-xs">{y} Coût</th>
                        </React.Fragment>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {consommationsEnergie.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-1.5 pr-2">
                          <Input value={row.type} onChange={e => setConsommationsEnergie(prev => prev.map((r,j) => j===i ? {...r, type: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs text-slate-100" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input value={row.unite} onChange={e => setConsommationsEnergie(prev => prev.map((r,j) => j===i ? {...r, unite: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-16 text-slate-100" />
                        </td>
                        {(['a1Qte','a1Cout','a2Qte','a2Cout','a3Qte','a3Cout'] as const).map(f => (
                          <td key={f} className="py-1.5 px-1">
                            <Input type="number" value={row[f]} onChange={e => setConsommationsEnergie(prev => prev.map((r,j) => j===i ? {...r, [f]: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-24 text-right text-slate-100" placeholder="0" />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setConsommationsEnergie(prev => prev.filter((_,j) => j!==i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-400 hover:bg-slate-700"
                onClick={() => setConsommationsEnergie(prev => [...prev, { type: '', unite: '', a1Qte: '', a1Cout: '', a2Qte: '', a2Cout: '', a3Qte: '', a3Cout: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une ligne
              </Button>
            </CardContent>
          </Card>

          {/* Problèmes d'efficacité énergétique */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Problèmes d'efficacité énergétique
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 font-medium">Désignation</th>
                      <th className="text-left py-2 px-2 font-medium">Fréquence</th>
                      <th className="text-left py-2 px-2 font-medium">Durée</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {problemesEff.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-1.5 pr-2">
                          <Input value={row.designation} onChange={e => setProblemesEff(prev => prev.map((r,j) => j===i ? {...r, designation: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs text-slate-100" />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input value={row.frequence} onChange={e => setProblemesEff(prev => prev.map((r,j) => j===i ? {...r, frequence: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-28 text-slate-100" placeholder="ex: 2x/mois" />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input value={row.duree} onChange={e => setProblemesEff(prev => prev.map((r,j) => j===i ? {...r, duree: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-28 text-slate-100" placeholder="ex: 2h" />
                        </td>
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setProblemesEff(prev => prev.filter((_,j) => j!==i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button variant="outline" size="sm" className="mt-2 border-slate-600 text-slate-400 hover:bg-slate-700"
                  onClick={() => setProblemesEff(prev => [...prev, { designation: '', frequence: '', duree: '' }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
                </Button>
              </div>
              <div className="border-t border-slate-700 pt-3 space-y-3">
                <TextareaField label="Contraintes influant sur l'efficacité énergétique" field="contraintesEfficacite" value={(formData.generalInfo as any)?.contraintesEfficacite} onChange={handleGeneralChange} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Diagnostic énergétique précédent ?</Label>
                    <div className="flex gap-4">
                      {['Oui', 'Non'].map(opt => (
                        <div key={opt} className="flex items-center gap-2">
                          <Checkbox checked={(formData.generalInfo as any)?.diagnosticPrecedent === opt.toLowerCase()} onCheckedChange={() => handleGeneralChange('diagnosticPrecedent', opt.toLowerCase())} />
                          <span className="text-sm text-slate-300">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(formData.generalInfo as any)?.diagnosticPrecedent === 'oui' && (
                    <InputField label="Taux de réalisation des recommandations (%)" field="tauxRealisationReco" type="number" value={(formData.generalInfo as any)?.tauxRealisationReco} onChange={handleGeneralChange} />
                  )}
                </div>
                {(formData.generalInfo as any)?.diagnosticPrecedent === 'oui' && (
                  <TextareaField label="Résultats du diagnostic précédent" field="resultatsDiagnostic" value={(formData.generalInfo as any)?.resultatsDiagnostic} onChange={handleGeneralChange} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Programme d'extension */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Programme d'extension et/ou de réorientation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Programme d'extension prévu ?</Label>
                <div className="flex gap-4">
                  {['Oui', 'Non'].map(opt => (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox checked={(formData.generalInfo as any)?.programmeExtension?.existe === (opt === 'Oui')} onCheckedChange={() => handleGeneralChange('programmeExtension', { ...(formData.generalInfo as any)?.programmeExtension, existe: opt === 'Oui' })} />
                      <span className="text-sm text-slate-300">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(formData.generalInfo as any)?.programmeExtension?.existe && (
                <>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Échéance</Label>
                    <div className="flex gap-4">
                      {["D'ici 1 à 2 ans", 'Entre 3 et 5 ans', 'Entre 6 et 10 ans'].map(opt => (
                        <div key={opt} className="flex items-center gap-2">
                          <Checkbox checked={(formData.generalInfo as any)?.programmeExtension?.echeance === opt} onCheckedChange={() => handleGeneralChange('programmeExtension', { ...(formData.generalInfo as any)?.programmeExtension, echeance: opt })} />
                          <span className="text-sm text-slate-300">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Description du programme</Label>
                    <textarea rows={3} value={(formData.generalInfo as any)?.programmeExtension?.description || ''} onChange={e => handleGeneralChange('programmeExtension', { ...(formData.generalInfo as any)?.programmeExtension, description: e.target.value })} className="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Impact en besoins énergétiques</Label>
                    <textarea rows={2} value={(formData.generalInfo as any)?.programmeExtension?.impactEnergetique || ''} onChange={e => handleGeneralChange('programmeExtension', { ...(formData.generalInfo as any)?.programmeExtension, impactEnergetique: e.target.value })} className="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ---- QUESTIONNAIRE PV ---- */}
          <AuditQuestionnaire
            value={(formData.generalInfo as any)?.pvQuestionnaires ?? []}
            onChange={(qs) => handleGeneralChange('pvQuestionnaires', qs)}
          />

          <div className="flex justify-end pt-2">
            <Button onClick={goToNextTab} className="bg-blue-600 hover:bg-blue-500 text-white px-6">
              Suivant <span className="ml-1">→</span>
            </Button>
          </div>
        </TabsContent>

        {/* ---- ONGLET SPÉCIFIQUE ---- */}
        <TabsContent value="specifique" className="space-y-4 mt-4">

          {/* Surfaces, Volumes & Capacités */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                Surfaces, Volumes & Capacités
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Surface (m²)" field="surface" type="number" value={specifique?.surface} onChange={handleSpecifiqueChange} />
                <InputField label="Volume (m³)" field="volume" type="number" value={specifique?.volume} onChange={handleSpecifiqueChange} />
                <InputField label="Capacités utilis." field="capacitesUtilis" value={specifique?.capacitesUtilis} onChange={handleSpecifiqueChange} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Surface brute (m²)" field="surfaceBrute" type="number" value={specifique?.surfaceBrute} onChange={handleSpecifiqueChange} />
                <InputField label="Surface nette (m²)" field="surfaceNette" type="number" value={specifique?.surfaceNette} onChange={handleSpecifiqueChange} />
                <InputField label="Surface totale (m²)" field="surfaceTotal" type="number" value={specifique?.surfaceTotal} onChange={handleSpecifiqueChange} />
              </div>
              <InputField label="Capacités vérandas" field="capacitesVerandas" value={specifique?.capacitesVerandas} onChange={handleSpecifiqueChange} />
            </CardContent>
          </Card>

          {/* Abonnement & Contrats SENELEC */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                Abonnement & Contrats SENELEC
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Type d'abonnement</Label>
                  <Select value={specifique?.typeContrat || ''} onValueChange={v => handleSpecifiqueChange('typeContrat', v)}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                      <SelectValue placeholder="Sélectionner…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d2e] border-slate-700">
                      <SelectItem value="PPP" className="text-slate-100 focus:bg-slate-700/50">PPP — Professionnel Petite Puissance</SelectItem>
                      <SelectItem value="PMP" className="text-slate-100 focus:bg-slate-700/50">PMP — Professionnel Moyenne Puissance</SelectItem>
                      <SelectItem value="PGP" className="text-slate-100 focus:bg-slate-700/50">PGP — Professionnel Grande Puissance</SelectItem>
                      <SelectItem value="MT" className="text-slate-100 focus:bg-slate-700/50">MT — Moyenne Tension</SelectItem>
                      <SelectItem value="HT" className="text-slate-100 focus:bg-slate-700/50">HT — Haute Tension</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Type de tarif (MT / HT)</Label>
                  <Select
                    value={specifique?.typeTarif || ''}
                    onValueChange={v => handleSpecifiqueChange('typeTarif', v)}
                    disabled={!['MT', 'HT'].includes(specifique?.typeContrat ?? '')}
                  >
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100 disabled:opacity-40">
                      <SelectValue placeholder="MT / HT uniquement…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d2e] border-slate-700">
                      <SelectItem value="TCU" className="text-slate-100 focus:bg-slate-700/50">TCU — Tarif Courte Utilisation</SelectItem>
                      <SelectItem value="TG" className="text-slate-100 focus:bg-slate-700/50">TG — Tarif Général</SelectItem>
                      <SelectItem value="TLU" className="text-slate-100 focus:bg-slate-700/50">TLU — Tarif Longue Utilisation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InputField label="Puissance souscrite (kW)" field="puissanceSouscrite" type="number" value={specifique?.puissanceSouscrite} onChange={handleSpecifiqueChange} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Contrats env." field="contratsEnv" value={specifique?.contratsEnv} onChange={handleSpecifiqueChange} />
                <InputField label="Contrats élec." field="contratsElec" value={specifique?.contratsElec} onChange={handleSpecifiqueChange} />
                <InputField label="Contrats carburant" field="contratsCarburant" value={specifique?.contratsCarburant} onChange={handleSpecifiqueChange} />
              </div>
            </CardContent>
          </Card>

          {/* Activité & Équipements */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <Factory className="h-4 w-4 text-orange-400" />
                Activité & Équipements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Usinage" field="usinage" value={specifique?.usinage} onChange={handleSpecifiqueChange} />
                <InputField label="Forges" field="forges" value={specifique?.forges} onChange={handleSpecifiqueChange} />
                <InputField label="Assemblages" field="assemblages" value={specifique?.assemblages} onChange={handleSpecifiqueChange} />
                <InputField label="Montage" field="montage" value={specifique?.montage} onChange={handleSpecifiqueChange} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Puissance électrique (kW)" field="puissanceElectrique" type="number" value={specifique?.puissanceElectrique} onChange={handleSpecifiqueChange} />
                <InputField label="Puissance thermique (kW)" field="puissanceThermique" type="number" value={specifique?.puissanceThermique} onChange={handleSpecifiqueChange} />
              </div>
            </CardContent>
          </Card>

          {/* Productions M1/M2/M3 */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <Factory className="h-4 w-4 text-orange-400" />
                Productions — 3 dernières années
              </CardTitle>
              <CardDescription>Fournir le journal de suivi et d'exploitation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 pr-2 font-medium">Produit principal</th>
                      <th className="text-left py-2 pr-2 font-medium">Capacité nominale</th>
                      <th className="text-left py-2 pr-2 font-medium w-20">Unité</th>
                      <th className="text-right py-2 px-1 font-medium">Année 1</th>
                      <th className="text-right py-2 px-1 font-medium">Année 2</th>
                      <th className="text-right py-2 px-1 font-medium">Année 3</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {productions.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        {(['produit','capaciteNominale','unite'] as const).map(f => (
                          <td key={f} className="py-1.5 pr-2">
                            <Input value={row[f] || ''} onChange={e => setProductions(prev => prev.map((r,j) => j===i ? {...r, [f]: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs text-slate-100" />
                          </td>
                        ))}
                        {(['annee1','annee2','annee3'] as const).map(f => (
                          <td key={f} className="py-1.5 px-1">
                            <Input type="number" value={row[f] || ''} onChange={e => setProductions(prev => prev.map((r,j) => j===i ? {...r, [f]: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-24 text-right text-slate-100" placeholder="0" />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setProductions(prev => prev.filter((_,j) => j!==i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-400 hover:bg-slate-700"
                onClick={() => setProductions(prev => [...prev, { produit: '', capaciteNominale: '', unite: '', annee1: '', annee2: '', annee3: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un produit
              </Button>
            </CardContent>
          </Card>

          {/* Procédés & Équipements de fabrication */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <Factory className="h-4 w-4 text-orange-400" />
                Procédés & Équipements de fabrication
              </CardTitle>
              <CardDescription>Décrire les équipements par étape de procédé — fournir le schéma de procédé</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700">
                      {['Procédé/Étape','Équipement','Année fab.','Mise en svc','Type énergie','P. Élec (kW)','P. Therm (kW)','Capacité nominale','Autres infos'].map(h => (
                        <th key={h} className="text-left py-2 pr-2 font-medium">{h}</th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {procedesEqs.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        {(['procede','equipement','anneeFab','anneeService','typeEnergie','puissanceElec','puissanceTherm','capaciteNominale','autresInfos'] as const).map(f => (
                          <td key={f} className="py-1.5 pr-1">
                            <Input value={row[f] || ''} onChange={e => setProcedesEqs(prev => prev.map((r,j) => j===i ? {...r, [f]: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs min-w-[80px] text-slate-100" />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setProcedesEqs(prev => prev.filter((_,j) => j!==i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-400 hover:bg-slate-700"
                onClick={() => setProcedesEqs(prev => [...prev, { procede: '', equipement: '', anneeFab: '', anneeService: '', typeEnergie: '', puissanceElec: '', puissanceTherm: '', capaciteNominale: '', autresInfos: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un équipement
              </Button>
            </CardContent>
          </Card>

          {/* Valorisation énergétique des déchets */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Valorisation énergétique des déchets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 pr-2 font-medium">Type de déchet</th>
                      <th className="text-left py-2 pr-2 font-medium">Quantité mensuelle</th>
                      <th className="text-left py-2 pr-2 font-medium">Destination actuelle</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {dechets.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        {(['type','quantiteMensuelle','destination'] as const).map(f => (
                          <td key={f} className="py-1.5 pr-2">
                            <Input value={row[f] || ''} onChange={e => setDechets(prev => prev.map((r,j) => j===i ? {...r, [f]: e.target.value} : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs text-slate-100" />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setDechets(prev => prev.filter((_,j) => j!==i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-400 hover:bg-slate-700"
                onClick={() => setDechets(prev => [...prev, { type: '', quantiteMensuelle: '', destination: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
              </Button>
            </CardContent>
          </Card>

          {/* Systèmes CVC */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                Systèmes CVC — Capacités max
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Capacité max chauffage (kW)" field="capaciteMaxChauffe" type="number" value={specifique?.capaciteMaxChauffe} onChange={handleSpecifiqueChange} />
                <InputField label="Capacité max froid (kW)" field="capaciteMaxFroid" type="number" value={specifique?.capaciteMaxFroid} onChange={handleSpecifiqueChange} />
                <InputField label="Capacité max ventil. (kW)" field="capaciteMaxVentil" type="number" value={specifique?.capaciteMaxVentil} onChange={handleSpecifiqueChange} />
              </div>
            </CardContent>
          </Card>

          {/* Efficacité & SME */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                Efficacité énergétique & SME
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TextareaField label="Problèmes d'efficacité énergétique" field="problemesEfficacite" value={specifique?.problemesEfficacite} onChange={handleSpecifiqueChange} />
              <TextareaField label="Optimisation énergétique des déchets" field="optimisationDechets" value={specifique?.optimisationDechets} onChange={handleSpecifiqueChange} />
              <InputField label="Système management énergie" field="systemeMgmtEnergie" value={specifique?.systemeMgmtEnergie} onChange={handleSpecifiqueChange} />
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button onClick={goToNextTab} className="bg-blue-600 hover:bg-blue-500 text-white px-6">
              Suivant <span className="ml-1">→</span>
            </Button>
          </div>
        </TabsContent>

        {/* ---- ONGLET PERSONNEL ---- */}
        <TabsContent value="personnel" className="space-y-4 mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Management & Personnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Directeur Général" field="dg" value={formData.personnel?.dg} onChange={handlePersonnelChange} />
                <InputField label="Directeur Technique" field="dt" value={formData.personnel?.dt} onChange={handlePersonnelChange} />
              </div>
              <div className="space-y-4 border-t border-slate-700 pt-4">
                <h3 className="font-semibold text-slate-200">Programme d'opérations</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-sm">Quarts par jour</Label>
                    <Select value={String(formData.personnel?.programmeOperations.quartsJour || '')} onValueChange={v => handleProgrammeChange('quartsJour', Number(v))}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-slate-700">
                        {[1, 2, 3].map(n => (
                          <SelectItem key={n} value={String(n)} className="text-slate-100 focus:bg-slate-700/50">{n} quart{n > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-sm">Heures par quart</Label>
                    <Select value={String(formData.personnel?.programmeOperations.heuresQuart || '')} onValueChange={v => handleProgrammeChange('heuresQuart', Number(v))}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-slate-700">
                        {[4, 6, 7, 8, 10, 12].map(n => (
                          <SelectItem key={n} value={String(n)} className="text-slate-100 focus:bg-slate-700/50">{n}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm">Horaires de travail</Label>
                  <div className="rounded-lg border border-slate-700 overflow-hidden">
                    {DAYS_OF_WEEK.map(({ key, label }) => {
                      const schedule = getHoraires();
                      const day = schedule[key as keyof typeof schedule];
                      return (
                        <div key={key} className={`flex items-center gap-3 px-3 py-2 border-b border-slate-700/60 last:border-0 ${day.enabled ? 'bg-slate-800/30' : 'bg-slate-900/20 opacity-60'}`}>
                          <Checkbox
                            checked={day.enabled}
                            onCheckedChange={(v) => handleHoraireDay(key, 'enabled', !!v)}
                          />
                          <span className="w-20 text-sm text-slate-300 font-medium">{label}</span>
                          <Select
                            value={day.start}
                            onValueChange={v => handleHoraireDay(key, 'start', v)}
                            disabled={!day.enabled}
                          >
                            <SelectTrigger className="w-24 h-7 bg-slate-700/50 border-slate-600 text-slate-100 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1d2e] border-slate-700 max-h-48">
                              {TIME_SLOTS.map(t => <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50 text-xs">{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-slate-500 text-xs">→</span>
                          <Select
                            value={day.end}
                            onValueChange={v => handleHoraireDay(key, 'end', v)}
                            disabled={!day.enabled}
                          >
                            <SelectTrigger className="w-24 h-7 bg-slate-700/50 border-slate-600 text-slate-100 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1d2e] border-slate-700 max-h-48">
                              {TIME_SLOTS.map(t => <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50 text-xs">{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <YesNoField label="Activité saisonnière" field="activiteSaisonniere" value={formData.personnel?.programmeOperations.activiteSaisonniere || false} onChange={handleProgrammeChange} />
                {formData.personnel?.programmeOperations.activiteSaisonniere && (
                  <TextareaField label="Saisons d'activités" field="saisonsActivites" value={formData.personnel?.programmeOperations.saisonsActivites} onChange={handleProgrammeChange} />
                )}
                <YesNoField label="Périodes de maintenance programmée" field="maintenance" value={formData.personnel?.programmeOperations.maintenance || false} onChange={handleProgrammeChange} />
                {formData.personnel?.programmeOperations.maintenance && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-slate-300 text-sm">Fréquence de maintenance</Label>
                      <Select value={formData.personnel?.programmeOperations.frequenceMaintenance || ''} onValueChange={v => handleProgrammeChange('frequenceMaintenance', v)}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                          <SelectValue placeholder="Sélectionner…" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-slate-700">
                          {['Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Autre'].map(o => (
                            <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-300 text-sm">Durée de maintenance</Label>
                      <Select value={formData.personnel?.programmeOperations.dureeMaintenance || ''} onValueChange={v => handleProgrammeChange('dureeMaintenance', v)}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100">
                          <SelectValue placeholder="Sélectionner…" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-slate-700">
                          {['1 jour', '3 jours', '1 semaine', '2 semaines', '1 mois', 'Autre'].map(o => (
                            <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Responsables Énergie & Points Focaux */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Responsable(s) Énergie & Point(s) Focal</CardTitle>
              <CardDescription>Contacts clés pour la mission d'audit (NOM / POSTE / TÉL / EMAIL)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Responsable(s) Énergie</p>
                  <Button variant="outline" size="sm" className="h-7 border-slate-600 text-slate-400 hover:bg-slate-700"
                    onClick={() => setResponsablesEnergie(prev => [...prev, { nom: '', position: '', tel: '', email: '' }])}>
                    <Plus className="h-3 w-3 mr-1" /> Ajouter
                  </Button>
                </div>
                {responsablesEnergie.length === 0 && (
                  <p className="text-xs text-slate-600 italic py-1">Aucun responsable énergie ajouté</p>
                )}
                {responsablesEnergie.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-center">
                    <Input placeholder="Nom" value={r.nom || ''} onChange={e => setResponsablesEnergie(prev => prev.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <Input placeholder="Poste" value={r.position || ''} onChange={e => setResponsablesEnergie(prev => prev.map((x, j) => j === i ? { ...x, position: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <Input placeholder="Téléphone" value={r.tel || ''} onChange={e => setResponsablesEnergie(prev => prev.map((x, j) => j === i ? { ...x, tel: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <div className="flex gap-1">
                      <Input placeholder="Email" value={r.email || ''} onChange={e => setResponsablesEnergie(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-red-400 flex-shrink-0" onClick={() => setResponsablesEnergie(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Point(s) Focal</p>
                  <Button variant="outline" size="sm" className="h-7 border-slate-600 text-slate-400 hover:bg-slate-700"
                    onClick={() => setPointsFocaux(prev => [...prev, { nom: '', position: '', tel: '', email: '' }])}>
                    <Plus className="h-3 w-3 mr-1" /> Ajouter
                  </Button>
                </div>
                {pointsFocaux.length === 0 && (
                  <p className="text-xs text-slate-600 italic py-1">Aucun point focal ajouté</p>
                )}
                {pointsFocaux.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-center">
                    <Input placeholder="Nom" value={r.nom || ''} onChange={e => setPointsFocaux(prev => prev.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <Input placeholder="Poste" value={r.position || ''} onChange={e => setPointsFocaux(prev => prev.map((x, j) => j === i ? { ...x, position: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <Input placeholder="Téléphone" value={r.tel || ''} onChange={e => setPointsFocaux(prev => prev.map((x, j) => j === i ? { ...x, tel: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                    <div className="flex gap-1">
                      <Input placeholder="Email" value={r.email || ''} onChange={e => setPointsFocaux(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} className="bg-slate-700/50 border-slate-600 h-8 text-sm text-slate-100" />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-red-400 flex-shrink-0" onClick={() => setPointsFocaux(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Effectifs */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Effectifs du personnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 pr-2 font-medium">Catégorie</th>
                      <th className="text-right py-2 px-2 font-medium">Hommes</th>
                      <th className="text-right py-2 px-2 font-medium">Femmes</th>
                      <th className="text-right py-2 px-2 font-medium">Cadres</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {effectifs.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-1.5 pr-2">
                          <Input value={row.categorie || ''} onChange={e => setEffectifs(prev => prev.map((r, j) => j === i ? { ...r, categorie: e.target.value } : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs text-slate-100" />
                        </td>
                        {(['hommes', 'femmes', 'cadres'] as const).map(f => (
                          <td key={f} className="py-1.5 px-2">
                            <Input type="number" value={row[f] || ''} onChange={e => setEffectifs(prev => prev.map((r, j) => j === i ? { ...r, [f]: e.target.value } : r))} className="bg-slate-700/50 border-slate-600 h-7 text-xs w-20 text-right text-slate-100" placeholder="0" />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-red-400" onClick={() => setEffectifs(prev => prev.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-400 hover:bg-slate-700"
                onClick={() => setEffectifs(prev => [...prev, { categorie: '', hommes: '', femmes: '', cadres: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une catégorie
              </Button>
            </CardContent>
          </Card>

          {/* SME */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                Système de Management de l'Énergie (SME)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">SME en place ?</Label>
                <div className="flex gap-4">
                  {['Oui', 'Non'].map(opt => (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        checked={(formData.personnel as any)?.sme?.existe === (opt === 'Oui')}
                        onCheckedChange={() => handlePersonnelChange('sme', { ...(formData.personnel as any)?.sme, existe: opt === 'Oui' })}
                      />
                      <span className="text-sm text-slate-300">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(formData.personnel as any)?.sme?.existe && (
                <>
                  <InputField label="Norme / Référentiel (ex: ISO 50001)" field="smeNorme" value={(formData.personnel as any)?.sme?.norme} onChange={(_, v) => handlePersonnelChange('sme', { ...(formData.personnel as any)?.sme, norme: v })} />
                  <InputField label="Indicateurs de performance énergétique (IPE)" field="smeIpe" value={(formData.personnel as any)?.sme?.ipe} onChange={(_, v) => handlePersonnelChange('sme', { ...(formData.personnel as any)?.sme, ipe: v })} />
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-sm">Observations SME</Label>
                    <textarea
                      rows={2}
                      placeholder="Observations sur le SME..."
                      value={(formData.personnel as any)?.sme?.observations || ''}
                      onChange={e => handlePersonnelChange('sme', { ...(formData.personnel as any)?.sme, observations: e.target.value })}
                      className="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button onClick={goToNextTab} className="bg-blue-600 hover:bg-blue-500 text-white px-6">
              Suivant <span className="ml-1">→</span>
            </Button>
          </div>
        </TabsContent>

        {/* ---- ONGLET SITES & BÂTIMENTS ---- */}
        <TabsContent value="sites" className="space-y-4 mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <MapPin className="h-5 w-5 text-emerald-400" />
                Nouveau site / usine
              </CardTitle>
              <CardDescription>Remplissez les informations puis cliquez sur Enregistrer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Site */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" /> Site
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Nom du site *</Label>
                    <Input placeholder="ex: Usine principale" value={newSite.name} onChange={e => setNewSite(prev => ({ ...prev, name: e.target.value }))} className="bg-slate-700/50 border-slate-600 text-slate-100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Adresse *</Label>
                    <Input placeholder="ex: Route de Rufisque, Dakar" value={newSite.address} onChange={e => setNewSite(prev => ({ ...prev, address: e.target.value }))} className="bg-slate-700/50 border-slate-600 text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Zone (optional) */}
              <div className="border-t border-slate-700/60 pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-500 flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5" /> Zone / Secteur
                  <span className="text-slate-600 font-normal normal-case tracking-normal">— optionnel</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Nom de la zone</Label>
                    <Input placeholder="ex: Zone Maternité" value={newZone.name} onChange={e => setNewZone(prev => ({ ...prev, name: e.target.value }))} className="bg-slate-700/50 border-slate-600 text-slate-100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Description</Label>
                    <Input placeholder="ex: Soins, consultations…" value={newZone.description || ''} onChange={e => setNewZone(prev => ({ ...prev, description: e.target.value }))} className="bg-slate-700/50 border-slate-600 text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Bâtiment (optional) */}
              <div className="border-t border-slate-700/60 pt-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Bâtiment
                  <span className="text-slate-600 font-normal normal-case tracking-normal">— optionnel</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Nom du bâtiment</Label>
                    <Input placeholder="ex: Bâtiment A" value={newBuilding.name} onChange={e => setNewBuilding(prev => ({ ...prev, name: e.target.value }))} className="bg-slate-700/50 border-slate-600 text-slate-100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Type</Label>
                    <Select value={newBuilding.type} onValueChange={v => setNewBuilding(prev => ({ ...prev, type: v }))}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-slate-700">{BUILDING_TYPES.map(t => <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 3-group level picker */}
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-violet-400" />
                    Niveaux
                    {newBuilding.levels.length > 0 && <span className="text-violet-400 font-medium">— {newBuilding.levels.length} sélectionné{newBuilding.levels.length > 1 ? 's' : ''}</span>}
                  </Label>
                  <p className="text-xs text-slate-500 italic">Sélectionner un étage inclut automatiquement tous les niveaux inférieurs</p>
                  <div className="flex gap-4 items-start">
                    {/* Sous-sols */}
                    <div className="space-y-1.5 shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium text-center">Sous-sols</p>
                      <div className="flex flex-col gap-1.5">
                        {['R-2', 'R-1'].map(n => {
                          const sel = newBuilding.levels.includes(n);
                          return (
                            <button key={n} type="button" onClick={() => handleSelectLevel(n)}
                              className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all border ${sel ? 'bg-violet-600/30 border-violet-500/60 text-violet-300' : 'bg-slate-800/50 border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500'}`}
                            >{n}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="w-px self-stretch bg-slate-700" />
                    {/* Étages */}
                    <div className="flex-1 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Étages</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['RDC', 'R+1', 'R+2', 'R+3', 'R+4', 'R+5', 'R+6', 'R+7', 'R+8', 'R+9', 'R+10', 'R+11', 'R+12', 'R+13', 'R+14', 'R+15'].map(n => {
                          const sel = newBuilding.levels.includes(n);
                          return (
                            <button key={n} type="button" onClick={() => handleSelectLevel(n)}
                              className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all border ${sel ? 'bg-violet-600/30 border-violet-500/60 text-violet-300' : 'bg-slate-800/50 border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500'}`}
                            >{n}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="w-px self-stretch bg-slate-700" />
                    {/* Spéciaux */}
                    <div className="space-y-1.5 shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium text-center">Spéciaux</p>
                      <div className="flex flex-col gap-1.5">
                        {['Mezzanine', 'Terrasse'].map(n => {
                          const sel = newBuilding.levels.includes(n);
                          return (
                            <button key={n} type="button" onClick={() => handleSelectLevel(n)}
                              className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all border ${sel ? 'bg-violet-600/30 border-violet-500/60 text-violet-300' : 'bg-slate-800/50 border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500'}`}
                            >{n}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <SiteSection title="Structure bâti (Outil 2b — Expert)" color="orange">
                  <div className="grid grid-cols-3 gap-3">
                    <NumField label="Surface terrain (m²)" value={newBuilding.surfaceTerrain} onChange={v => setNewBuilding(prev => ({ ...prev, surfaceTerrain: v }))} />
                    <NumField label="Surface bâtie (m²)" value={newBuilding.surfaceBatie} onChange={v => setNewBuilding(prev => ({ ...prev, surfaceBatie: v }))} />
                    <NumField label="Surface toiture (m²)" value={newBuilding.surfaceToiture} onChange={v => setNewBuilding(prev => ({ ...prev, surfaceToiture: v }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumField label="Montant M1 (FCFA)" value={newBuilding.structureBati?.montantM1} onChange={v => handleNewBuildingSection('structureBati', 'montantM1', v)} />
                    <NumField label="Montant M2 (FCFA)" value={newBuilding.structureBati?.montantM2} onChange={v => handleNewBuildingSection('structureBati', 'montantM2', v)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">État</Label>
                    <div className="flex gap-4">
                      {['EN service', 'Hors Service'].map(opt => (
                        <div key={opt} className="flex items-center gap-2">
                          <Checkbox checked={newBuilding.structureBati?.etat === opt} onCheckedChange={() => handleNewBuildingSection('structureBati', 'etat', opt)} />
                          <span className="text-sm text-slate-300">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </SiteSection>

                <SiteSection title="Enveloppe du bâtiment" color="blue">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">Orientation</Label>
                      <Select value={newBuilding.enveloppe?.orientation || ''} onValueChange={v => handleNewBuildingSection('enveloppe', 'orientation', v)}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100 h-8 text-sm"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-slate-700">{ORIENTATION_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">Type de toit</Label>
                      <Select value={newBuilding.enveloppe?.typeToit || ''} onValueChange={v => handleNewBuildingSection('enveloppe', 'typeToit', v)}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100 h-8 text-sm"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-slate-700">{TYPE_TOIT_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <StrField label="Revêtement toit" value={newBuilding.enveloppe?.revetementToit} onChange={v => handleNewBuildingSection('enveloppe', 'revetementToit', v)} />
                    <StrField label="Couleur toit" value={newBuilding.enveloppe?.couleurToit} onChange={v => handleNewBuildingSection('enveloppe', 'couleurToit', v)} />
                    <StrField label="Couleur fenêtres" value={newBuilding.enveloppe?.couleurFenetres} onChange={v => handleNewBuildingSection('enveloppe', 'couleurFenetres', v)} />
                    <StrField label="Couleur murs extérieurs" value={newBuilding.enveloppe?.couleurMursExt} onChange={v => handleNewBuildingSection('enveloppe', 'couleurMursExt', v)} />
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">Type de vitrage</Label>
                      <Select value={newBuilding.enveloppe?.typeVitrage || ''} onValueChange={v => handleNewBuildingSection('enveloppe', 'typeVitrage', v)}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-100 h-8 text-sm"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                        <SelectContent className="bg-[#1a1d2e] border-slate-700">{TYPE_VITRAGE_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <StrField label="Composition murs" value={newBuilding.enveloppe?.compositionMurs} onChange={v => handleNewBuildingSection('enveloppe', 'compositionMurs', v)} />
                  </div>
                </SiteSection>

                <SiteSection title="Aménagement du bâtiment" color="emerald">
                  <div className="grid grid-cols-3 gap-3">
                    <StrField label="Secteur" value={newBuilding.amenagement?.secteur} onChange={v => handleNewBuildingSection('amenagement', 'secteur', v)} />
                    <StrField label="Fonction" value={newBuilding.amenagement?.fonction} onChange={v => handleNewBuildingSection('amenagement', 'fonction', v)} />
                    <StrField label="Usage" value={newBuilding.amenagement?.usage} onChange={v => handleNewBuildingSection('amenagement', 'usage', v)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Système CVC</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {CVC_OPTIONS.map(opt => {
                        const selected: string[] = newBuilding.amenagement?.systemeCVC || [];
                        return (
                          <div key={opt} className="flex items-center gap-2">
                            <Checkbox
                              checked={selected.includes(opt)}
                              onCheckedChange={(checked) => {
                                const next = checked ? [...selected, opt] : selected.filter(s => s !== opt);
                                handleNewBuildingSection('amenagement', 'systemeCVC', next);
                              }}
                            />
                            <span className="text-xs text-slate-300">{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <NumField label="Taux de fréquence (%)" value={newBuilding.amenagement?.tauxFrequence} onChange={v => handleNewBuildingSection('amenagement', 'tauxFrequence', v)} />
                </SiteSection>
              </div>

              <Button onClick={handleAddSite} className="w-full bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" /> Enregistrer ce site
              </Button>
            </CardContent>
          </Card>

          {/* Loading existing sites */}
          {loadingSites && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
              <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              Chargement des sites existants…
            </div>
          )}

          {/* Liste des sites enregistrés */}
          {!loadingSites && sites.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-100">Sites enregistrés ({sites.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sites.map((site, idx) => (
                  <div key={idx} className="border border-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                          <h4 className="font-semibold text-slate-200">{site.name}</h4>
                        </div>
                        <p className="text-sm text-slate-400 ml-5">{site.address}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSites(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                    {site.zones.length > 0 && (
                      <div className="mt-3 space-y-2 ml-5">
                        {site.zones.map((z, zi) => (
                          <div key={zi} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <FolderOpen className="h-3 w-3 text-teal-400" />
                              <span className="text-xs font-medium text-teal-300">{z.name}</span>
                            </div>
                            {z.buildings.length > 0 && (
                              <div className="ml-4 flex flex-wrap gap-1.5">
                                {z.buildings.map((b, bi) => (
                                  <Badge key={bi} variant="outline" className="border-slate-600 text-slate-400 text-[10px]">
                                    <Building2 className="h-2.5 w-2.5 mr-1" />{b.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- HELPERS ----

function SiteSection({ title, color, children }: { title: string; color: 'orange' | 'blue' | 'emerald'; children: React.ReactNode }) {
  const colors = { orange: 'text-orange-400 border-orange-500/30 bg-orange-500/5', blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5', emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  return (
    <div className={`rounded-lg border p-3 space-y-3 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase">{title}</p>
      {children}
    </div>
  );
}

function StrField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-400 text-xs">{label}</Label>
      <Input value={value || ''} onChange={e => onChange(e.target.value)} className="bg-slate-700/50 border-slate-600 h-8 text-sm" />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-400 text-xs">{label}</Label>
      <Input type="number" value={value ?? ''} onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : undefined)} className="bg-slate-700/50 border-slate-600 h-8 text-sm" />
    </div>
  );
}
