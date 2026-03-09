import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertTriangle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function Auth() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  // Gérer les callbacks Supabase (invitations, confirmations email, etc.)
  useEffect(() => {
    const handleAuthCallback = async () => {
      // Vérifier les hash fragments (Supabase utilise #access_token=...)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      const error = hashParams.get('error');
      const errorDescription = hashParams.get('error_description');

      if (error) {
        console.error('Erreur d\'authentification:', error, errorDescription);
        setErrorMessage(errorDescription || 'Lien expiré ou invalide. Demandez une nouvelle invitation.');
        setLoading(false);
        return;
      }

      // Si c'est une invitation ou un callback avec tokens
      if (accessToken && refreshToken) {
        try {
          // Créer la session avec les tokens
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('Erreur lors de la création de la session:', sessionError);
            setErrorMessage('Impossible de créer la session. Le lien est peut-être expiré.');
            setLoading(false);
            return;
          }

          // Si c'est une invitation (type=invite), rediriger vers signup pour compléter le profil
          if (type === 'invite') {
            // Récupérer l'email de l'utilisateur depuis la session
            const user = data.session?.user;
            const userEmail = user?.email || '';
            
            // Rediriger vers signup avec l'email en query param ET les tokens dans le hash
            // Cela permet à Signup de récupérer l'email facilement
            navigate(`/signup?email=${encodeURIComponent(userEmail)}&type=invite${window.location.hash}`);
          } else {
            // Sinon, rediriger vers l'accueil
            navigate('/');
          }
        } catch (err) {
          console.error('Erreur lors du traitement du callback:', err);
          setErrorMessage('Impossible de finaliser la connexion. Réessayez depuis le lien.');
          setLoading(false);
        }
      } else {
        // Pas de tokens : lien invalide / expiré
        setErrorMessage('Lien invalide ou expiré. Demandez une nouvelle invitation.');
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  if (loading) {
    return (
      <AuthLayout title="Traitement..." subtitle="Merci de patienter">
        <div className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-slate-300">Traitement de votre invitation...</p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (errorMessage) {
    return (
      <AuthLayout title="Lien d'authentification" subtitle="Une étape a échoué">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div>
                <CardTitle className="text-white">Lien invalide ou expiré</CardTitle>
                <CardDescription className="text-slate-300">
                  {errorMessage}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate('/login')}
            >
              Retour à la connexion
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  // Cas improbable : pas d'erreur mais pas de redirection (sûreté)
  return (
    <AuthLayout title="Redirection" subtitle="Nous vous redirigeons...">
      <div className="flex items-center justify-center py-10">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-slate-300">Redirection en cours...</p>
        </div>
      </div>
    </AuthLayout>
  );
}
