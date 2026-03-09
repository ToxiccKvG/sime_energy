import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Audit } from '@/types/audit';
import { createAudit, updateAudit, createAuditSite, createAuditBuilding } from '@/lib/audit-service';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputField, TextareaField, YesNoField } from './AuditFormFields';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save, Plus, Trash2, MapPin, Building2 } from 'lucide-react';

interface AuditFormProps {
  audit?: Audit;
  onSave: (audit: Partial<Audit>) => void;
  onCancel: () => void;
}

interface FormSite {
  id?: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  buildings: FormBuilding[];
}

interface FormBuilding {
  id?: string;
  name: string;
  type: string;
  surfaceTerrain?: number;
  surfaceBatie?: number;
  surfaceToiture?: number;
}

export function AuditForm({ audit, onSave, onCancel }: AuditFormProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [sites, setSites] = useState<FormSite[]>([]);
  const [editingSiteIndex, setEditingSiteIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState<Partial<Audit>>(audit || {
    name: '',
    color: '#3b82f6',
    status: 'planned',
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
    capacites: {
      usines: [],
    },
  });

  const [newSite, setNewSite] = useState<FormSite>({
    name: '',
    address: '',
    buildings: [],
  });

  const [newBuilding, setNewBuilding] = useState<FormBuilding>({
    name: '',
    type: '',
  });

  const handleGeneralChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo!,
        [field]: value,
      },
    }));
  };

  const handlePersonnelChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      personnel: {
        ...prev.personnel!,
        [field]: value,
      },
    }));
  };

  const handleProgrammeChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      personnel: {
        ...prev.personnel!,
        programmeOperations: {
          ...prev.personnel!.programmeOperations,
          [field]: value,
        },
      },
    }));
  };

  const handleAddBuilding = () => {
    if (!newBuilding.name || !newBuilding.type) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir le nom et le type du bâtiment",
        variant: "destructive",
      });
      return;
    }

    setNewSite(prev => ({
      ...prev,
      buildings: [...prev.buildings, newBuilding],
    }));
    setNewBuilding({ name: '', type: '' });
  };

  const handleRemoveBuilding = (index: number) => {
    setNewSite(prev => ({
      ...prev,
      buildings: prev.buildings.filter((_, i) => i !== index),
    }));
  };

  const handleAddSite = () => {
    if (!newSite.name || !newSite.address) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir le nom et l'adresse du site",
        variant: "destructive",
      });
      return;
    }

    setSites(prev => [...prev, newSite]);
    setNewSite({ name: '', address: '', buildings: [] });
  };

  const handleRemoveSite = (index: number) => {
    setSites(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir le nom de l'audit",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les informations de l'utilisateur",
        variant: "destructive",
      });
      return;
    }

    if (!organization?.id) {
      toast({
        title: "Erreur",
        description: "Vous devez être membre d'une organisation",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let auditId: string;

      if (audit?.id) {
        // Update existing audit
        const updated = await updateAudit(audit.id, formData);
        auditId = updated.id;
        toast({
          title: "Succès",
          description: "Audit mis à jour avec succès",
        });
      } else {
        // Create new audit
        const created = await createAudit(formData, organization.id, user.id);
        auditId = created.id;

        // Add sites and buildings
        for (const site of sites) {
          const createdSite = await createAuditSite(auditId, {
            name: site.name,
            address: site.address,
            latitude: site.latitude,
            longitude: site.longitude,
            status: 'planned',
          });

          for (const building of site.buildings) {
            await createAuditBuilding(createdSite.id, auditId, {
              building_name: building.name,
              building_type: building.type,
              surface_terrain: building.surfaceTerrain,
              surface_batie: building.surfaceBatie,
              surface_toiture: building.surfaceToiture,
            });
          }
        }

        toast({
          title: "Succès",
          description: "Audit créé avec succès",
        });
      }

      onSave(formData);
    } catch (error) {
      console.error('Error saving audit:', error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de l'enregistrement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              {audit ? 'Modifier l\'audit' : 'Créer un audit'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {audit ? 'Mettez à jour les informations de l\'audit' : 'Créez un nouvel audit et définissez les sites à auditer'}
            </p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Audit</TabsTrigger>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="personnel">Personnel</TabsTrigger>
          <TabsTrigger value="sites">Sites & Bâtiments</TabsTrigger>
        </TabsList>

        {/* Basic Audit Information */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informations de l'audit</CardTitle>
              <CardDescription>Informations de base de l'audit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputField
                label="Nom de l'audit"
                field="name"
                value={formData.name}
                onChange={(_, v) => setFormData(prev => ({ ...prev, name: v }))}
              />
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Couleur</Label>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="h-10 w-full rounded border cursor-pointer"
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
        </TabsContent>

        {/* General Information */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informations de l'établissement</CardTitle>
              <CardDescription>Détails généraux de l'entreprise/établissement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputField
                label="Nom de l'établissement"
                field="nomEtablissement"
                value={formData.generalInfo?.nomEtablissement}
                onChange={handleGeneralChange}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Siège"
                  field="siege"
                  value={formData.generalInfo?.siege}
                  onChange={handleGeneralChange}
                />
                <InputField
                  label="Secteur d'activité"
                  field="secteur"
                  value={formData.generalInfo?.secteur}
                  onChange={handleGeneralChange}
                />
              </div>
              <TextareaField
                label="Adresse"
                field="adresse"
                value={formData.generalInfo?.adresse}
                onChange={handleGeneralChange}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Téléphone"
                  field="telephone"
                  value={formData.generalInfo?.telephone}
                  onChange={handleGeneralChange}
                />
                <InputField
                  label="Email"
                  type="email"
                  field="email"
                  value={formData.generalInfo?.email}
                  onChange={handleGeneralChange}
                />
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <Label>Forme juridique</Label>
                  <div className="flex gap-4">
                    {["SARL", "SA", "Autres"].map(opt => (
                      <div key={opt} className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.generalInfo?.formeJuridique === opt}
                          onCheckedChange={() => handleGeneralChange("formeJuridique", opt)}
                        />
                        <span className="text-sm">{opt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <InputField
                  label="Montant du capital (FCFA)"
                  type="number"
                  field="capital"
                  value={formData.generalInfo?.capital}
                  onChange={handleGeneralChange}
                />
                <InputField
                  label="Année de création"
                  type="number"
                  field="anneeCreation"
                  value={formData.generalInfo?.anneeCreation}
                  onChange={handleGeneralChange}
                />
                <InputField
                  label="Numéro NINEA"
                  field="ninea"
                  value={formData.generalInfo?.ninea}
                  onChange={handleGeneralChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Chiffre d'affaires (année précédente FCFA)"
                  type="number"
                  field="ca"
                  value={formData.generalInfo?.ca}
                  onChange={handleGeneralChange}
                />
                <InputField
                  label="Date de mise en service"
                  type="date"
                  field="miseService"
                  value={formData.generalInfo?.miseService}
                  onChange={handleGeneralChange}
                />
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <Label>Société exportatrice</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.generalInfo?.exportatrice === true}
                        onCheckedChange={() => handleGeneralChange("exportatrice", true)}
                      />
                      <span className="text-sm">Oui</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.generalInfo?.exportatrice === false}
                        onCheckedChange={() => handleGeneralChange("exportatrice", false)}
                      />
                      <span className="text-sm">Non</span>
                    </div>
                  </div>
                </div>
              </div>

              <TextareaField
                label="Marchés couverts (zones/pays)"
                field="marches"
                value={formData.generalInfo?.marches}
                onChange={handleGeneralChange}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personnel Information */}
        <TabsContent value="personnel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Management & Personnel</CardTitle>
              <CardDescription>Informations sur la direction et l'organisation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Directeur Général"
                  field="dg"
                  value={formData.personnel?.dg}
                  onChange={handlePersonnelChange}
                />
                <InputField
                  label="Directeur Technique"
                  field="dt"
                  value={formData.personnel?.dt}
                  onChange={handlePersonnelChange}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Programme d'opérations</h3>
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label="Nombre de quarts par jour"
                    type="number"
                    field="quartsJour"
                    value={formData.personnel?.programmeOperations.quartsJour}
                    onChange={handleProgrammeChange}
                  />
                  <InputField
                    label="Nombre d'heures par quart"
                    type="number"
                    field="heuresQuart"
                    value={formData.personnel?.programmeOperations.heuresQuart}
                    onChange={handleProgrammeChange}
                  />
                </div>

                <TextareaField
                  label="Horaires de travail"
                  field="horaires"
                  value={formData.personnel?.programmeOperations.horaires}
                  onChange={handleProgrammeChange}
                />

                <YesNoField
                  label="Activité saisonnière"
                  field="activiteSaisonniere"
                  value={formData.personnel?.programmeOperations.activiteSaisonniere || false}
                  onChange={handleProgrammeChange}
                />

                {formData.personnel?.programmeOperations.activiteSaisonniere && (
                  <TextareaField
                    label="Saisons d'activités"
                    field="saisonsActivites"
                    value={formData.personnel?.programmeOperations.saisonsActivites}
                    onChange={handleProgrammeChange}
                  />
                )}

                <YesNoField
                  label="Périodes de maintenance programmée"
                  field="maintenance"
                  value={formData.personnel?.programmeOperations.maintenance || false}
                  onChange={handleProgrammeChange}
                />

                {formData.personnel?.programmeOperations.maintenance && (
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      label="Fréquence de maintenance"
                      field="frequenceMaintenance"
                      value={formData.personnel?.programmeOperations.frequenceMaintenance}
                      onChange={handleProgrammeChange}
                    />
                    <InputField
                      label="Durée de maintenance"
                      field="dureeMaintenance"
                      value={formData.personnel?.programmeOperations.dureeMaintenance}
                      onChange={handleProgrammeChange}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sites and Buildings */}
        <TabsContent value="sites" className="space-y-4">
          {/* Add New Site */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Ajouter un site
              </CardTitle>
              <CardDescription>Définissez les sites à auditer et leurs bâtiments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Nom du site"
                value={newSite.name}
                onChange={(e) => setNewSite(prev => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="Adresse du site"
                value={newSite.address}
                onChange={(e) => setNewSite(prev => ({ ...prev, address: e.target.value }))}
              />

              <div className="space-y-3 border-t pt-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Bâtiments du site ({newSite.buildings.length})
                </h4>

                {newSite.buildings.length > 0 && (
                  <div className="space-y-2">
                    {newSite.buildings.map((building, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-muted p-3 rounded-lg">
                        <div>
                          <p className="font-medium">{building.name}</p>
                          <p className="text-sm text-muted-foreground">{building.type}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveBuilding(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 bg-accent/50 p-3 rounded-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Nom du bâtiment"
                      value={newBuilding.name}
                      onChange={(e) => setNewBuilding(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <Input
                      placeholder="Type (usine, bureau, etc.)"
                      value={newBuilding.type}
                      onChange={(e) => setNewBuilding(prev => ({ ...prev, type: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Surface terrain (m²)"
                      type="number"
                      value={newBuilding.surfaceTerrain || ''}
                      onChange={(e) => setNewBuilding(prev => ({ ...prev, surfaceTerrain: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    />
                    <Input
                      placeholder="Surface bâtie (m²)"
                      type="number"
                      value={newBuilding.surfaceBatie || ''}
                      onChange={(e) => setNewBuilding(prev => ({ ...prev, surfaceBatie: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    />
                    <Input
                      placeholder="Surface toiture (m²)"
                      type="number"
                      value={newBuilding.surfaceToiture || ''}
                      onChange={(e) => setNewBuilding(prev => ({ ...prev, surfaceToiture: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    />
                  </div>
                  <Button onClick={handleAddBuilding} variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter ce bâtiment
                  </Button>
                </div>
              </div>

              <Button onClick={handleAddSite} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter ce site
              </Button>
            </CardContent>
          </Card>

          {/* Sites List */}
          {sites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sites ajoutés ({sites.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sites.map((site, idx) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{site.name}</h4>
                        <p className="text-sm text-muted-foreground">{site.address}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSite(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {site.buildings.length > 0 && (
                      <div className="bg-muted p-2 rounded space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Bâtiments ({site.buildings.length})</p>
                        {site.buildings.map((building, bIdx) => (
                          <div key={bIdx} className="text-sm bg-background p-2 rounded">
                            <p className="font-medium">{building.name}</p>
                            <p className="text-xs text-muted-foreground">{building.type}</p>
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
