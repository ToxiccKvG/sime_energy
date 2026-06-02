import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOrganization } from "@/context/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function Compte() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, createOrganization, loading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // État des informations personnelles
  const [firstName, setFirstName] = useState(user?.user_metadata?.first_name || "");
  const [lastName, setLastName] = useState(user?.user_metadata?.last_name || "");
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [organizationName, setOrganizationName] = useState(user?.user_metadata?.organization || "");

  // État pour la création d'organisation
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");

  const [loading, setLoading] = useState(false);

  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    const email = user?.email || "user";
    return email.charAt(0).toUpperCase();
  };

  const fullName = firstName && lastName ? `${firstName} ${lastName}` : user?.email?.split("@")[0] || "Utilisateur";

  // Sauvegarder les modifications du profil
  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
          organization: organizationName,
        },
      });

      if (error) throw error;

      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été enregistrées avec succès",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la mise à jour",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Créer une nouvelle organisation
  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer le nom de l'organisation",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrg(true);
    try {
      await createOrganization(newOrgName, newOrgDescription);
      setNewOrgName("");
      setNewOrgDescription("");
      toast({
        title: "Succès",
        description: "Organisation créée avec succès",
      });
    } catch (error) {
      console.error("Error creating organization:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la création de l'organisation",
        variant: "destructive",
      });
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Erreur lors de la déconnexion",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-slate-50">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Mon compte</h1>
          <p className="mt-1 text-slate-400">Gérez vos informations personnelles</p>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10"
        >
          Se déconnecter
        </Button>
      </div>

      {/* Profil Header */}
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-white">{fullName}</CardTitle>
              <p className="text-sm text-slate-400">{user?.email}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Informations personnelles */}
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <User className="h-5 w-5" />
            Informations personnelles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-slate-200">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-slate-200">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-slate-200">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={user?.email}
              disabled
              className="bg-white/5 text-slate-300 border-white/10"
            />
            <p className="text-xs text-slate-500">Votre email ne peut pas être modifié ici</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-200">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
          </div>
          <Button
            onClick={handleSaveProfile}
            disabled={loading}
            className="w-full gap-2 md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer les modifications
          </Button>
        </CardContent>
      </Card>

      {/* Organisation */}
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="h-5 w-5" />
            Organisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {organization ? (
            <>
              <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Nom de l'organisation</p>
                  <p className="text-lg font-semibold text-white">{organization.name}</p>
                </div>
                {organization.description && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">Description</p>
                    <p className="text-sm text-slate-200">{organization.description}</p>
                  </div>
                )}
                {organization.slug && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">Slug</p>
                    <p className="text-sm font-mono text-slate-400">{organization.slug}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationNameMeta" className="text-slate-200">Nom pour les métadonnées</Label>
                <Input
                  id="organizationNameMeta"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Votre organisation"
                  className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
                />
                <p className="text-xs text-slate-500">Ce champ sauvegarde des métadonnées utilisateur supplémentaires</p>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={loading}
                variant="secondary"
                className="w-full gap-2 md:w-auto border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer les métadonnées
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-100">
                  Vous n'êtes pas encore membre d'une organisation. Créez une organisation ou contactez votre administrateur.
                </p>
              </div>
              <div className="space-y-4 border-t border-white/10 pt-4">
                <h3 className="font-semibold text-white">Créer une nouvelle organisation</h3>
                <div className="space-y-2">
                  <Label htmlFor="newOrgName" className="text-slate-200">Nom de l'organisation *</Label>
                  <Input
                    id="newOrgName"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="ex: Audit Énergétique SARL"
                    className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newOrgDescription" className="text-slate-200">Description (optionnel)</Label>
                  <Input
                    id="newOrgDescription"
                    value={newOrgDescription}
                    onChange={(e) => setNewOrgDescription(e.target.value)}
                    placeholder="Décrivez votre organisation"
                    className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
                  />
                </div>
                <Button
                  onClick={handleCreateOrganization}
                  disabled={creatingOrg || orgLoading}
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 md:w-auto"
                >
                  {(creatingOrg || orgLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Créer l'organisation
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
