import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { User, Bell, Monitor, Shield, Building2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';

const Parametres = () => {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleSaveProfile = () => {
    toast.success('Profil mis à jour avec succès');
  };

  const handleSaveNotifications = () => {
    toast.success('Préférences de notification sauvegardées');
  };

  const handleSaveDisplay = () => {
    toast.success('Préférences d\'affichage sauvegardées');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Paramètres</h1>
        <p className="mt-1 text-muted-foreground">
          Gérez les paramètres de votre compte et de l'application
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-6">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="display">
            <Monitor className="h-4 w-4 mr-2" />
            Affichage
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="organization">
            <Building2 className="h-4 w-4 mr-2" />
            Organisation
          </TabsTrigger>
          <TabsTrigger value="regional">
            <Globe className="h-4 w-4 mr-2" />
            Régional
          </TabsTrigger>
        </TabsList>

        {/* Profil */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Informations du profil</CardTitle>
              <CardDescription>
                Mettez à jour vos informations personnelles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" placeholder="Marie" defaultValue="Marie" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" placeholder="Diop" defaultValue="Diop" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="marie.diop@example.com" defaultValue="marie.diop@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" type="tel" placeholder="+221 XX XXX XX XX" defaultValue="+221 77 123 45 67" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <Input id="role" placeholder="Ingénieur énergétique" defaultValue="Ingénieur énergétique" disabled />
              </div>
              <Separator />
              <Button onClick={handleSaveProfile}>Sauvegarder les modifications</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Préférences de notification</CardTitle>
              <CardDescription>
                Gérez comment vous souhaitez recevoir les notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notifications par email</Label>
                  <p className="text-sm text-muted-foreground">
                    Recevez des alertes pour les activités importantes
                  </p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notifications push</Label>
                  <p className="text-sm text-muted-foreground">
                    Recevez des notifications dans votre navigateur
                  </p>
                </div>
                <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Types de notifications</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch id="notif-invoices" defaultChecked />
                    <Label htmlFor="notif-invoices" className="text-sm font-normal">
                      Nouvelles factures importées
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="notif-actions" defaultChecked />
                    <Label htmlFor="notif-actions" className="text-sm font-normal">
                      Actions et tâches assignées
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="notif-measures" defaultChecked />
                    <Label htmlFor="notif-measures" className="text-sm font-normal">
                      Nouvelles mesures disponibles
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="notif-reports" />
                    <Label htmlFor="notif-reports" className="text-sm font-normal">
                      Rapports générés
                    </Label>
                  </div>
                </div>
              </div>
              <Separator />
              <Button onClick={handleSaveNotifications}>Sauvegarder les préférences</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Affichage */}
        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Préférences d'affichage</CardTitle>
              <CardDescription>
                Personnalisez l'apparence de l'application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mode sombre</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer le thème sombre pour l'interface
                  </p>
                </div>
                <Switch 
                  checked={theme === 'dark'} 
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} 
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="language">Langue</Label>
                <Select defaultValue="fr">
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="wo">Wolof</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="density">Densité de l'interface</Label>
                <Select defaultValue="comfortable">
                  <SelectTrigger id="density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compacte</SelectItem>
                    <SelectItem value="comfortable">Confortable</SelectItem>
                    <SelectItem value="spacious">Spacieuse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultView">Vue par défaut au démarrage</Label>
                <Select defaultValue="dashboard">
                  <SelectTrigger id="defaultView">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="audits">Audits</SelectItem>
                    <SelectItem value="invoices">Factures</SelectItem>
                    <SelectItem value="measures">Mesures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <Button onClick={handleSaveDisplay}>Sauvegarder les préférences</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sécurité */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Sécurité</CardTitle>
              <CardDescription>
                Gérez la sécurité de votre compte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-3">Modifier le mot de passe</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                      <Input id="currentPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                      <Input id="newPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                      <Input id="confirmPassword" type="password" />
                    </div>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Authentification à deux facteurs</h4>
                <p className="text-sm text-muted-foreground">
                  Ajoutez une couche de sécurité supplémentaire à votre compte
                </p>
                <Button variant="outline">Activer 2FA</Button>
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Sessions actives</h4>
                <p className="text-sm text-muted-foreground">
                  Gérez les appareils connectés à votre compte
                </p>
                <Button variant="outline">Voir les sessions</Button>
              </div>
              <Separator />
              <Button>Mettre à jour le mot de passe</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organisation */}
        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres de l'organisation</CardTitle>
              <CardDescription>
                Gérez les informations de votre organisation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nom de l'organisation</Label>
                <Input id="orgName" placeholder="SIME Energy" defaultValue="SIME Energy" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgAddress">Adresse</Label>
                <Input id="orgAddress" placeholder="Dakar, Sénégal" defaultValue="Dakar, Sénégal" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgPhone">Téléphone</Label>
                <Input id="orgPhone" type="tel" placeholder="+221 XX XXX XX XX" defaultValue="+221 33 123 45 67" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgEmail">Email de contact</Label>
                <Input id="orgEmail" type="email" placeholder="contact@sime.sn" defaultValue="contact@sime.sn" />
              </div>
              <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Membres de l'équipe</h4>
                  <p className="text-sm text-muted-foreground">
                    Gérez les utilisateurs et leurs rôles
                  </p>
                  <Button variant="outline">Gérer les membres</Button>
                </div>
              <Separator />
              <Button>Sauvegarder les modifications</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Régional */}
        <TabsContent value="regional">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres régionaux</CardTitle>
              <CardDescription>
                Configurez les préférences spécifiques à votre région
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone">Fuseau horaire</Label>
                <Select defaultValue="africa/dakar">
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="africa/dakar">Africa/Dakar (GMT+0)</SelectItem>
                    <SelectItem value="africa/abidjan">Africa/Abidjan (GMT+0)</SelectItem>
                    <SelectItem value="africa/lagos">Africa/Lagos (GMT+1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateFormat">Format de date</Label>
                <Select defaultValue="dd/mm/yyyy">
                  <SelectTrigger id="dateFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dd/mm/yyyy">JJ/MM/AAAA</SelectItem>
                    <SelectItem value="mm/dd/yyyy">MM/JJ/AAAA</SelectItem>
                    <SelectItem value="yyyy-mm-dd">AAAA-MM-JJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Devise</Label>
                <Select defaultValue="xof">
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xof">XOF (Franc CFA)</SelectItem>
                    <SelectItem value="eur">EUR (Euro)</SelectItem>
                    <SelectItem value="usd">USD (Dollar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="units">Système d'unités</Label>
                <Select defaultValue="metric">
                  <SelectTrigger id="units">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Métrique (kWh, °C)</SelectItem>
                    <SelectItem value="imperial">Impérial (BTU, °F)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <Button>Sauvegarder les préférences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Parametres;
