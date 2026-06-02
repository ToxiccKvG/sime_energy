import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Check, Mail, Eye, EyeOff, ChevronRight, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface OrgOption {
  id: string;
  name: string;
}

export function Signup() {
  const [searchParams] = useSearchParams();

  // ── Shared state ──────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Normal signup extras ──────────────────────────────────────────────────
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // ── Invite flow state (preserved, untouched) ─────────────────────────────
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [isInvited, setIsInvited] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteTokens = (location.state as { accessToken?: string; refreshToken?: string } | null);
  const { toast } = useToast();

  // Fetch orgs for dropdown (unauthenticated — RLS is OFF on organizations)
  useEffect(() => {
    supabase
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setOrganizations(data || []);
        setOrgsLoading(false);
      });
  }, []);

  // Detect invite flow (preserved)
  useEffect(() => {
    const inviteType = searchParams.get('type');
    const emailParam = searchParams.get('email');
    const hasInviteToken = !!inviteTokens?.accessToken;
    if (inviteType === 'invite' && hasInviteToken) {
      setIsInvited(true);
      const resolvedEmail = emailParam || '';
      if (resolvedEmail) {
        setEmail(resolvedEmail);
        setInvitedEmail(resolvedEmail);
      }
    }
  }, [searchParams, inviteTokens?.accessToken]);

  useEffect(() => {
    if (user?.user_metadata?.organization_name) {
      setOrganization(user.user_metadata.organization_name);
    }
  }, [user]);

  // ── Invite flow handlers (preserved, untouched) ───────────────────────────
  const canProceedToStep2 = () => {
    if (!email.trim()) return false;
    if (!password.trim() || !confirmPassword.trim()) return false;
    if (password !== confirmPassword) return false;
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && !canProceedToStep2()) {
      if (!email.trim()) {
        toast({ title: 'Erreur', description: 'Veuillez entrer votre email', variant: 'destructive' });
      } else if (!password.trim() || !confirmPassword.trim()) {
        toast({ title: 'Erreur', description: 'Veuillez entrer un mot de passe', variant: 'destructive' });
      } else if (password !== confirmPassword) {
        toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      } else if (password.length < 8) {
        toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' });
      } else if (!/[A-Z]/.test(password)) {
        toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins une majuscule', variant: 'destructive' });
      } else if (!/[0-9]/.test(password)) {
        toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins un chiffre', variant: 'destructive' });
      }
      return;
    }
    setStep(step + 1);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez remplir votre nom et prénom', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const accessToken = inviteTokens?.accessToken;
      const refreshToken = inviteTokens?.refreshToken;
      if (!accessToken || !refreshToken) {
        throw new Error("Tokens d'invitation introuvables. Veuillez rouvrir le lien d'invitation.");
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      const sessionUser = sessionData.session?.user;
      if (!sessionUser) throw new Error('Impossible de créer la session.');
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: updateError } = await supabase.auth.updateUser({
        data: { first_name: firstName, last_name: lastName, phone: phone || undefined },
      });
      if (updateError) throw updateError;
      const organizationId = sessionUser.user_metadata?.organization_id;
      if (organizationId) {
        const { error: orgError } = await supabase
          .from('organization_users')
          .insert([{ organization_id: organizationId, user_id: sessionUser.id, role: 'member' }]);
        if (orgError && orgError.code !== '23505') {
          console.warn("Erreur ajout à l'organisation:", orgError);
        }
      }
      toast({ title: 'Compte créé', description: 'Bienvenue sur la plateforme SIME !' });
      navigate('/');
    } catch (error) {
      toast({
        title: "Erreur d'inscription",
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Normal signup submit ──────────────────────────────────────────────────
  const handleNormalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez remplir votre prénom et nom', variant: 'destructive' });
      return;
    }
    if (!email.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez entrer votre email', variant: 'destructive' });
      return;
    }
    if (!selectedOrgId) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner une organisation', variant: 'destructive' });
      return;
    }
    if (!password || !confirmPassword) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un mot de passe', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' });
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins une majuscule', variant: 'destructive' });
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins un chiffre', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        organization_id: selectedOrgId,
      });
      setSubmitted(true);
    } catch (error) {
      toast({
        title: "Erreur d'inscription",
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Render: success (email sent) ─────────────────────────────────────────
  if (submitted) {
    return (
      <AuthLayout title="Vérifiez votre boîte mail" subtitle="Un lien de confirmation vous a été envoyé">
        <div className="space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
            <Mail className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              Consultez l'email envoyé à{' '}
              <span className="font-semibold text-white">{email}</span> et cliquez
              sur le lien de confirmation pour activer votre compte.
            </p>
            <p className="text-xs text-slate-500">
              Après confirmation, vous serez redirigé vers la page de connexion.
            </p>
          </div>
          <Button
            onClick={() => navigate('/login')}
            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Retour à la connexion
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ── Render: normal signup (single screen) ────────────────────────────────
  if (!isInvited) {
    return (
      <AuthLayout title="Créer un compte" subtitle="Rejoignez la plateforme SIME">
        <form onSubmit={handleNormalSubmit} className="space-y-4">
          {/* Prénom + Nom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-sm text-slate-300">Prénom</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Jean"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-sm text-slate-300">Nom</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Dupont"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm text-slate-300">Email professionnel</Label>
            <Input
              id="email"
              type="email"
              placeholder="prenom.nom@cer2e.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
            />
          </div>

          {/* Organisation */}
          <div className="space-y-1.5">
            <Label htmlFor="org" className="text-sm text-slate-300">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Organisation
              </span>
            </Label>
            <select
              id="org"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              required
              disabled={orgsLoading}
              className="h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/70 focus:border-primary/40 disabled:opacity-50 [&>option]:bg-[#1a1d2e] [&>option]:text-white"
            >
              <option value="">— Sélectionner une organisation —</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {!orgsLoading && organizations.length === 0 && (
              <p className="text-xs text-amber-400">
                Aucune organisation disponible. Contactez l'administrateur.
              </p>
            )}
          </div>

          {/* Mot de passe */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm text-slate-300">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">8 caractères min, 1 majuscule, 1 chiffre</p>
          </div>

          {/* Confirmer mot de passe */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-sm text-slate-300">Confirmer le mot de passe</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || orgsLoading}
            className="mt-2 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? 'Création du compte...' : "S'inscrire"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Déjà un compte ?{' '}
          <a href="/login" className="font-semibold text-primary hover:underline">
            Se connecter
          </a>
        </p>
      </AuthLayout>
    );
  }

  // ── Render: invite flow (preserved, untouched) ────────────────────────────
  const StepIndicator = ({ stepNumber, isActive, isCompleted, label }: { stepNumber: number; isActive: boolean; isCompleted: boolean; label: string }) => (
    <div className="flex flex-col items-center">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition ${
        isCompleted ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-white' : 'bg-white/10 text-slate-400'
      }`}>
        {isCompleted ? <Check className="w-5 h-5" /> : stepNumber}
      </div>
      <p className="text-xs text-slate-400 mt-2 text-center w-16">{label}</p>
    </div>
  );

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez la plateforme SIME">
      <div className="mb-8 flex items-start justify-between px-2">
        <StepIndicator stepNumber={1} isActive={step === 1} isCompleted={step > 1} label="Identifiants" />
        <div className={`flex-1 h-1 mx-2 mt-5 transition ${step > 1 ? 'bg-primary' : 'bg-white/10'}`} />
        <StepIndicator stepNumber={2} isActive={step === 2} isCompleted={step > 2} label="Profil" />
      </div>

      <form
        onSubmit={step === 2 ? handleInviteSubmit : (e) => { e.preventDefault(); handleNextStep(); }}
        className="space-y-4"
      >
        {/* Invite banner */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Vous avez été invité !</p>
              <p className="text-xs text-slate-300 mt-1">
                {invitedEmail
                  ? `Créez votre compte avec l'email ${invitedEmail} pour accepter l'invitation.`
                  : "Créez votre compte pour accepter l'invitation."}
              </p>
            </div>
          </div>
        </div>

        {/* Step 1: Identifiants */}
        {step === 1 && (
          <>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Email</label>
              <Input
                type="email"
                placeholder="prenom.nom@cer2e.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isInvited}
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Mot de passe</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">8 caractères min, 1 majuscule, 1 chiffre</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Confirmer le mot de passe</label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" tabIndex={-1}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="button" onClick={handleNextStep} className="mt-4 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2">
              Continuer <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}

        {/* Step 2: Profil */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Prénom</label>
                <Input type="text" placeholder="Jean" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Nom</label>
                <Input type="text" placeholder="Dupont" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Téléphone (optionnel)</label>
              <Input type="tel" placeholder="+221 77 000 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40" />
            </div>
            <div className="flex items-center pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-0 focus-visible:outline-none" required />
                <span className="text-sm text-slate-300">J'accepte les conditions d'utilisation</span>
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" onClick={() => setStep(1)} variant="outline" className="flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10">
                Retour
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                {loading ? 'Création du compte...' : "S'inscrire"}
              </Button>
            </div>
          </>
        )}
      </form>

      <p className="text-center text-sm text-slate-400 mt-6">
        Vous avez déjà un compte ?{' '}
        <a href="/login" className="text-primary font-semibold hover:underline">Se connecter</a>
      </p>
    </AuthLayout>
  );
}
