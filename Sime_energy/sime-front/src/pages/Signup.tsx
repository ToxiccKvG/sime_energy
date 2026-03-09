import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ChevronRight, Check, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function Signup() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Champs d'usage supprimés pour simplifier le formulaire
  const [createOrgName, setCreateOrgName] = useState('');
  const [createOrgDescription, setCreateOrgDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInvited, setIsInvited] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Vérifier si l'utilisateur arrive depuis une invitation
  useEffect(() => {
    // Vérifier les hash fragments (Supabase utilise souvent #access_token=...)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    // Vérifier aussi les query params
    const token = searchParams.get('token'); // conservé si besoin ultérieur
    const emailParam = searchParams.get('email');
    const inviteType = searchParams.get('type');

    // Si c'est une invitation ou un callback Supabase
    if (type === 'invite' || inviteType === 'invite' || accessToken) {
      setIsInvited(true);
      
      // Si l'email est dans les paramètres, le pré-remplir
      if (emailParam) {
        setEmail(emailParam);
        setInvitedEmail(emailParam);
      } else if (accessToken) {
        // Essayer d'extraire l'email du token (nécessite de décoder le JWT)
        try {
          // Le token JWT contient l'email dans le payload
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          if (payload.email) {
            setEmail(payload.email);
            setInvitedEmail(payload.email);
          } else {
            toast({
              title: 'Invitation incomplète',
              description: 'Email introuvable dans le lien. Réouvrez le lien d\'invitation.',
              variant: 'destructive',
            });
          }
        } catch (e) {
          console.warn('Impossible d\'extraire l\'email du token');
          toast({
            title: 'Invitation incomplète',
            description: 'Impossible de récupérer l\'email depuis le lien d\'invitation.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Invitation incomplète',
          description: 'Email manquant. Utilisez le lien d\'invitation reçu par email.',
          variant: 'destructive',
        });
      }
    }
  }, [searchParams, toast]);
  // Pré-remplir l'organisation depuis le profil (ex. métadonnées d'invitation)
  useEffect(() => {
    if (user?.user_metadata?.organization_name) {
      setOrganization(user.user_metadata.organization_name);
    }
  }, [user]);

  // Validation et navigation
  const canProceedToStep2 = () => {
    if (!email.trim()) return false;
    // Valider le mot de passe (même pour les invitations, l'utilisateur doit le définir)
    if (!password.trim() || !confirmPassword.trim()) return false;
    if (password !== confirmPassword) return false;
    if (password.length < 6) return false;
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && !canProceedToStep2()) {
      if (!email.trim()) {
        toast({
          title: 'Erreur',
          description: 'Veuillez entrer votre email',
          variant: 'destructive',
        });
      } else if (!password.trim() || !confirmPassword.trim()) {
        toast({
          title: 'Erreur',
          description: 'Veuillez entrer un mot de passe',
          variant: 'destructive',
        });
      } else if (password !== confirmPassword) {
        toast({
          title: 'Erreur',
          description: 'Les mots de passe ne correspondent pas',
          variant: 'destructive',
        });
      } else if (password.length < 6) {
        toast({
          title: 'Erreur',
          description: 'Le mot de passe doit contenir au moins 6 caractères',
          variant: 'destructive',
        });
      }
      return;
    }

    // Plus de step 2 "Utilisation" : on passe directement au profil
    setStep(step + 1);
  };

  const handleCreateOrganization = async () => {
    if (!createOrgName.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer le nom de l\'organisation',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Erreur',
        description: 'Utilisateur non trouvé',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const slug = createOrgName.toLowerCase().replace(/\s+/g, '-');
      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            name: createOrgName,
            slug,
            description: createOrgDescription || undefined,
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Organisation créée',
        description: `${createOrgName} a été créée avec succès`,
      });

      navigate('/');
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors de la création de l\'organisation',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation finale
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir votre nom et prénom',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Si c'est une invitation, l'utilisateur est déjà connecté (session créée par /auth)
      if (isInvited && user) {
        // Mettre à jour le mot de passe ET les métadonnées utilisateur
        // Faire deux appels séparés pour éviter les conflits
        const { error: passwordError } = await supabase.auth.updateUser({
          password: password,
        });

        if (passwordError) {
          console.error('Erreur mot de passe:', passwordError);
          throw passwordError;
        }

        // Mettre à jour les métadonnées utilisateur
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone || undefined,
            organization: organization || undefined,
            usage_type: usageType,
            use_case: useCase,
          },
        });

        if (updateError) {
          console.error('Erreur métadonnées:', updateError);
          throw updateError;
        }

        // Si l'utilisateur a été invité à rejoindre une organisation, l'ajouter automatiquement
        const organizationId = user.user_metadata?.organization_id;
        if (organizationId) {
          const { error: orgError } = await supabase
            .from('organization_users')
            .insert([
              {
                organization_id: organizationId,
                user_id: user.id,
                role: 'member',
              },
            ]);

          if (orgError && orgError.code !== '23505') { // 23505 = déjà membre (unique constraint)
            console.warn('Erreur ajout à l\'organisation:', orgError);
            // On ne bloque pas l'inscription si l'ajout à l'organisation échoue
          } else if (!orgError) {
            const organizationName = user.user_metadata?.organization_name || 'l\'organisation';
            toast({
              title: 'Organisation rejointe',
              description: `Vous avez rejoint ${organizationName} avec succès`,
            });
          }
        }

        toast({
          title: 'Profil complété',
          description: 'Votre compte a été finalisé avec succès',
        });

        // Rediriger vers l'accueil
        navigate('/');
      } else {
        // Inscription normale
        await signUp(email, password, {
          first_name: firstName,
          last_name: lastName,
          phone: phone || undefined,
          organization: organization || undefined,
          usage_type: usageType,
          use_case: useCase,
        });
        toast({
          title: 'Inscription réussie',
          description: 'Vérifiez votre email pour confirmer votre compte',
        });
        navigate('/login');
      }
    } catch (error) {
      console.error('Erreur inscription:', error);
      toast({
        title: 'Erreur d\'inscription',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Stepper component
  const StepIndicator = ({ stepNumber, isActive, isCompleted, label }: any) => (
    <div className="flex flex-col items-center">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition ${
          isCompleted
            ? 'bg-green-500 text-white'
            : isActive
            ? 'bg-primary text-white'
            : 'bg-white/10 text-slate-400'
        }`}
      >
        {isCompleted ? <Check className="w-5 h-5" /> : stepNumber}
      </div>
      <p className="text-xs text-slate-400 mt-2 text-center w-16">{label}</p>
    </div>
  );

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoignez la plateforme SIME"
    >
      {/* Stepper (2 étapes) */}
      <div className="mb-8 flex items-start justify-between px-2">
        <StepIndicator stepNumber={1} isActive={step === 1} isCompleted={step > 1} label="Identifiants" />

        <div className={`flex-1 h-1 mx-2 mt-5 transition ${step > 1 ? 'bg-primary' : 'bg-white/10'}`}></div>

        <StepIndicator stepNumber={2} isActive={step === 2} isCompleted={step > 2} label="Profil" />
      </div>

      <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNextStep(); }} className="space-y-4">
        {/* Message d'invitation */}
        {isInvited && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Vous avez été invité !</p>
                <p className="text-xs text-slate-300 mt-1">
                  {invitedEmail 
                    ? `Créez votre compte avec l'email ${invitedEmail} pour accepter l'invitation.`
                    : 'Créez votre compte pour accepter l\'invitation.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 1: Email et Mot de passe */}
        {step === 1 && (
          <>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-slate-300">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="prenom.nom@cer2e.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isInvited}
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40 disabled:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isInvited && (
                <p className="text-xs text-slate-400 mt-1">
                  {invitedEmail
                    ? `Cet email provient de votre invitation et n'est pas modifiable`
                    : `Email requis. Réouvrez le lien d'invitation si l'email n'apparaît pas.`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-slate-300">Mot de passe</label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
              <p className="text-xs text-slate-400">Minimum 6 caractères</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm text-slate-300">Confirmer le mot de passe</label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>

            <Button
              type="button"
              onClick={handleNextStep}
              className="mt-4 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              Continuer <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}

        {/* ÉTAPE 2: Infos personnelles */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm text-slate-300">Prénom</label>
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
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm text-slate-300">Nom</label>
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

            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm text-slate-300">Téléphone (optionnel)</label>
              <Input
                id="phone"
                type="tel"
                placeholder="+33 6 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="organization" className="text-sm text-slate-300">Organisation</label>
              <Input
                id="organization"
                type="text"
                placeholder="Nom de l'organisation"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
              />
              <p className="text-xs text-slate-400">
                Pré-rempli depuis l'invitation si disponible. Vous pouvez le modifier.
              </p>
            </div>

            <div className="flex items-center pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-0 focus-visible:outline-none" 
                  required 
                />
                <span className="text-sm text-slate-300">J'accepte les conditions d'utilisation</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => setStep(2)}
                variant="outline"
                className="flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Retour
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? 'Création du compte...' : 'S\'inscrire'}
              </Button>
            </div>
          </>
        )}
      </form>

      <p className="text-center text-sm text-slate-400 mt-6">
        Vous avez déjà un compte?{' '}
        <a href="/login" className="text-primary font-semibold hover:underline">
          Se connecter
        </a>
      </p>
    </AuthLayout>
  );
}
