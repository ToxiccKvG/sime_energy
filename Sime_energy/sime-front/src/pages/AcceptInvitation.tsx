import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle, LogIn } from 'lucide-react';
import { acceptInvitation, getInvitationByCode } from '@/lib/organization-invitation-service';
import type { OrganizationInvitation } from '@/lib/organization-invitation-service';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<OrganizationInvitation | null>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const code = searchParams.get('code');

  useEffect(() => {
    const loadInvitation = async () => {
      if (!code) {
        setError('Code d\'invitation manquant');
        setLoading(false);
        return;
      }

      try {
        const inv = await getInvitationByCode(code);
        if (!inv) {
          setError('Code d\'invitation invalide ou expiré');
          setLoading(false);
          return;
        }

        setInvitation(inv);

        // Fetch organization details
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', inv.organization_id)
          .single();

        if (orgError) throw orgError;
        setOrganization(org);
      } catch (err) {
        console.error('Error loading invitation:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'invitation');
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [code]);

  const handleAcceptInvitation = async () => {
    if (!invitation || !user?.id) {
      toast({
        title: 'Erreur',
        description: 'Informations manquantes',
        variant: 'destructive',
      });
      return;
    }

    setAccepting(true);
    try {
      await acceptInvitation(invitation.code, user.id);
      toast({
        title: 'Succès',
        description: `Vous avez rejoint ${organization?.name}!`,
      });
      navigate('/');
    } catch (err) {
      console.error('Error accepting invitation:', err);
      toast({
        title: 'Erreur',
        description: err instanceof Error ? err.message : 'Erreur lors de l\'acceptation de l\'invitation',
        variant: 'destructive',
      });
    } finally {
      setAccepting(false);
    }
  };

  if (!user) {
    return (
      <AuthLayout title="Invitation" subtitle="Connexion requise">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Connexion requise</CardTitle>
            <CardDescription className="text-slate-300">
              Vous devez être connecté pour accepter une invitation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => navigate('/login')}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              Se connecter
            </Button>
            <p className="text-xs text-center text-slate-400">
              Pas encore de compte ?{' '}
              <a href="/signup" className="text-primary hover:underline font-semibold">
                S'inscrire
              </a>
            </p>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (loading) {
    return (
      <AuthLayout title="Invitation" subtitle="Chargement en cours">
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-slate-300">Chargement de l'invitation...</p>
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Invitation" subtitle="Une erreur est survenue">
        <Card className="bg-white/5 border-red-500/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <div>
                <CardTitle className="text-white">Erreur</CardTitle>
                <CardDescription className="text-slate-300">{error}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full h-11 border-white/20 text-white hover:bg-white/5"
            >
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (!invitation || !organization) {
    return (
      <AuthLayout title="Invitation" subtitle="Invitation introuvable">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Invitation introuvable</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/')}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Retour
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Invitation" subtitle="Rejoindre l'organisation">
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <CardTitle className="text-white">Invitation trouvée !</CardTitle>
          </div>
          <CardDescription className="text-slate-300">
            Vous êtes invité à rejoindre une organisation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-white/5 p-4 rounded-lg border border-white/10 space-y-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Organisation</p>
              <p className="text-lg font-semibold text-white">{organization.name}</p>
            </div>
            {organization.description && (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Description</p>
                <p className="text-sm text-slate-300">{organization.description}</p>
              </div>
            )}
            {invitation.invited_email && (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Email invité</p>
                <p className="text-sm text-white">{invitation.invited_email}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm text-slate-300 mb-3">
              Vous êtes connecté en tant que :
            </p>
            <p className="font-semibold text-white">{user.email}</p>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleAcceptInvitation}
              disabled={accepting}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Acceptation en cours...
                </>
              ) : (
                'Accepter l\'invitation'
              )}
            </Button>
            <Button
              onClick={() => navigate('/')}
              disabled={accepting}
              variant="outline"
              className="w-full h-11 border-white/20 text-white hover:bg-white/5"
            >
              Plus tard
            </Button>
          </div>

          <p className="text-xs text-center text-slate-400">
            En acceptant, vous rejoindrez l'organisation et accèderez à ses audits.
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
