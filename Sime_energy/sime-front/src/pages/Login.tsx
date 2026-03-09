import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast({
        title: "Connexion réussie",
        description: "Bienvenue!",
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Erreur de connexion",
        description:
          error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Accédez à la plateforme interne SIME"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div className="space-y-2">
          <label className="text-sm text-slate-300">Mot de passe</label>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-0 focus-visible:outline-none"
            />
            Me garder connecté
          </label>
          <a
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            Mot de passe oublié ?
          </a>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="mt-4 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? "Connexion en cours..." : "Se connecter"}
        </Button>
      </form>

    </AuthLayout>
  );
}