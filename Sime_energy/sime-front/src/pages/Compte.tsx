import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Building2, Shield, Loader2, Zap, Target, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOrganization } from "@/context/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { inviteUserByEmail } from "@/lib/invite-service";

export default function Compte() {
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

  // Infos d'utilisation depuis les métadonnées
  const usageType = user?.user_metadata?.usage_type;
  const useCase = user?.user_metadata?.use_case;
  const [loading, setLoading] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // État du changement de mot de passe
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Générer les initiales
  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    const email = user?.email || "user";
    return email.charAt(0).toUpperCase();
  };

  const fullName = firstName && lastName ? `${firstName} ${lastName}` : user?.email?.split("@")[0] || "Utilisateur";

  // Formater le type d'utilisation
  const getUsageTypeLabel = () => {
    const labels: Record<string, string> = {
      solo: "En solo",
      team: "En équipe",
      enterprise: "Entreprise",
    };
    return labels[usageType] || usageType;
  };

  // Formater le cas d'utilisation
  const getUseCaseLabel = () => {
    const labels: Record<string, string> = {
      audits: "Réaliser des audits",
      management: "Gérer les données",
      both: "Les deux",
    };
    return labels[useCase] || useCase;
  };

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

  // Changer le mot de passe
  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre mot de passe actuel",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    setSavingPassword(true);
    try {
      // Vérifier que le mot de passe actuel est correct
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (authError) {
        toast({
          title: "Erreur",
          description: "Mot de passe actuel incorrect",
          variant: "destructive",
        });
        setSavingPassword(false);
        return;
      }

      // Changer le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      toast({
        title: "Mot de passe changé",
        description: "Votre mot de passe a été mis à jour avec succès",
      });

      // Réinitialiser les champs
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors du changement de mot de passe",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt!",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Erreur lors de la déconnexion",
        variant: "destructive",
      });
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      toast({
        title: "Email requis",
        description: "Veuillez saisir un email à inviter.",
        variant: "destructive",
      });
      return;
    }

    if (!organization?.id) {
      toast({
        title: "Erreur",
        description: "Vous devez appartenir à une organisation pour inviter des utilisateurs.",
        variant: "destructive",
      });
      return;
    }

    setInviting(true);
    try {
      // Passer l'organization_id dans les métadonnées pour que l'utilisateur rejoigne automatiquement l'organisation
      const response = await inviteUserByEmail(inviteEmail.trim(), {
        organization_id: organization.id,
        organization_name: organization.name,
      });
      toast({
        title: "Invitation envoyée",
        description: response.message || `Un email a été envoyé à ${inviteEmail}`,
      });
      setInviteEmail("");
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'envoyer l'invitation",
        variant: "destructive",
      });
    } finally {
      setInviting(false);
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
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-100">
                  Vous n'êtes pas encore membre d'une organisation. Créez-en une pour commencer à auditer.
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Invitations */}
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Send className="h-5 w-5" />
            Invitations utilisateur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">
            Envoyez une invitation par email. Le destinataire recevra un email pour créer son compte et définir son mot de passe.
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              type="email"
              placeholder="inviter@exemple.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="md:flex-1 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
            <Button
              onClick={handleInviteUser}
              disabled={inviting || !inviteEmail.trim()}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {inviting ? "Envoi..." : "Inviter"}
            </Button>
          </div>

        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-slate-200">Mot de passe actuel</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
            <p className="text-xs text-slate-500">Entrez votre mot de passe actuel pour confirmer votre identité</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-slate-200">Nouveau mot de passe</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
            <p className="text-xs text-slate-500">Minimum 6 caractères</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-200">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={savingPassword}
            variant="secondary"
            className="w-full gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 md:w-auto"
          >
            {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Changer le mot de passe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
