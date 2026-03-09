import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
      toast({
        title: "Email envoyé",
        description:
          "Consultez votre boîte de réception pour réinitialiser votre mot de passe.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Vérifiez votre boîte mail"
        subtitle="Nous venons d'envoyer un lien de réinitialisation."
      >
        <div className="space-y-6 text-slate-200">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-300">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <p className="text-sm text-slate-300">
            Consultez vos emails et suivez les instructions pour réinitialiser
            votre mot de passe.
          </p>

          <Button
            onClick={() => navigate("/login")}
            className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Retour à la connexion
          </Button>

          <p className="text-sm text-slate-400 text-center">
            Vous n'avez rien reçu ?{" "}
            <button
              onClick={() => setSent(false)}
              className="font-semibold text-primary hover:underline"
            >
              Renvoyer
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Mot de passe oublié ?"
      subtitle="Saisissez votre email professionnel pour recevoir un lien de réinitialisation."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-white">
        <div className="space-y-2">
          <label className="text-sm text-slate-300">Email professionnel</label>
          <Input
            type="email"
            placeholder="prenom.nom@cer2e.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="mt-2 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? "Envoi en cours..." : "Envoyer le lien"}
        </Button>
      </form>
    </AuthLayout>
  );
}
