import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Activity, Package, FileArchive, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SchemaDesignerStep } from '@/components/invoices/SchemaDesignerStep';

interface AuditDetailTabsProps {
  invoiceCount: number;
  measureCount: number;
  equipmentCount: number;
}

export function AuditDetailTabs({ 
  invoiceCount, 
  measureCount, 
  equipmentCount
}: AuditDetailTabsProps) {
  return (
    <Tabs defaultValue="factures" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
        <TabsTrigger value="factures" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
          <FileText className="h-4 w-4" />
          Factures SENELEC ({invoiceCount})
        </TabsTrigger>
        <TabsTrigger value="mesures" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
          <Activity className="h-4 w-4" />
          Mesures ({measureCount})
        </TabsTrigger>
        <TabsTrigger value="schema" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
          <Zap className="h-4 w-4" />
          Schéma électrique
        </TabsTrigger>
        <TabsTrigger value="inventaire" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
          <Package className="h-4 w-4" />
          Inventaire ({equipmentCount})
        </TabsTrigger>
        <TabsTrigger value="documents" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
          <FileArchive className="h-4 w-4" />
          Documents
        </TabsTrigger>
      </TabsList>

      <div className="mt-6">
        <TabsContent value="factures" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Factures SENELEC</h3>
                <p className="text-sm text-muted-foreground">Gestion et traitement des factures électriques</p>
              </div>
              <Button>Voir toutes les factures</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Example invoice cards */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="default">OCR Vérifié</Badge>
                    <span className="text-xs text-muted-foreground">12/01/2025</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="font-semibold text-foreground">Facture SENELEC #1234</div>
                  <div className="text-sm text-muted-foreground">Jan 2025</div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Montant</span>
                    <span className="font-semibold text-foreground">287,500 FCFA</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Confiance</span>
                    <Progress value={95} className="h-1 flex-1" />
                    <span className="text-xs font-medium text-foreground">95%</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">En attente</Badge>
                    <span className="text-xs text-muted-foreground">15/01/2025</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="font-semibold text-foreground">Facture SENELEC #1235</div>
                  <div className="text-sm text-muted-foreground">Fév 2025</div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Montant</span>
                    <span className="font-semibold text-foreground">312,000 FCFA</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Confiance</span>
                    <Progress value={88} className="h-1 flex-1" />
                    <span className="text-xs font-medium text-foreground">88%</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[180px] text-center">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Ajouter des factures</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mesures" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Données de mesures</h3>
                <p className="text-sm text-muted-foreground">Capteurs et relevés énergétiques</p>
              </div>
              <Button>Analyser les mesures</Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Graphiques et données de mesures à implémenter</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="mt-0">
          <div className="space-y-4">
            <SchemaDesignerStep />
          </div>
        </TabsContent>

        <TabsContent value="inventaire" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Inventaire des équipements</h3>
                <p className="text-sm text-muted-foreground">Site → Bâtiment → Étage → Pièce → Équipements</p>
              </div>
              <Button>Gérer l'inventaire</Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Arborescence inventaire à implémenter</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Documents et pièces jointes</h3>
                <p className="text-sm text-muted-foreground">Rapports, photos terrain, documents associés</p>
              </div>
              <Button>Ajouter des documents</Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Gestionnaire de documents à implémenter</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}
