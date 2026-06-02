import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Eye, EyeOff, AlertTriangle, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .regex(/[A-Z]/, 'Au moins une lettre majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirm: z.string().min(1, 'Confirmez votre mot de passe'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

// ─── Password strength ─────────────────────────────────────────────────────

function getStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: 'Très faible', color: '#ef4444' };
  if (score === 2) return { score, label: 'Faible', color: '#f97316' };
  if (score === 3) return { score, label: 'Moyen', color: '#eab308' };
  if (score === 4) return { score, label: 'Fort', color: '#22c55e' };
  return { score, label: 'Très fort', color: '#10b981' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const recoveryTokens = (location.state as { accessToken?: string; refreshToken?: string } | null);
  const [tokenState, setTokenState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password') ?? '';
  const strength = getStrength(passwordValue);

  // ── Load & validate recovery tokens (passed via React Router state) ────────
  useEffect(() => {
    const init = async () => {
      const accessToken = recoveryTokens?.accessToken;
      const refreshToken = recoveryTokens?.refreshToken;

      if (!accessToken || !refreshToken) {
        setTokenState('invalid');
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        setTokenState('invalid');
        return;
      }

      setTokenState('valid');
    };

    init();
  }, [recoveryTokens?.accessToken, recoveryTokens?.refreshToken]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async ({ password }: FormValues) => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message ?? 'Impossible de mettre à jour le mot de passe');
      return;
    }

    await supabase.auth.signOut();
    setDone(true);
  };

  // ── States ─────────────────────────────────────────────────────────────────

  if (tokenState === 'loading') {
    return (
      <AuthLayout title="Réinitialisation" subtitle="Vérification du lien…">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-slate-400">Validation du lien de récupération…</p>
        </div>
      </AuthLayout>
    );
  }

  if (tokenState === 'invalid') {
    return (
      <AuthLayout title="Lien expiré" subtitle="Le lien de récupération est invalide ou a expiré">
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border border-red-500/20 bg-red-500/8 px-5 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-300">Lien invalide ou expiré</p>
              <p className="text-xs text-slate-400">
                Les liens de réinitialisation sont valables 1 heure. Veuillez en demander un nouveau.
              </p>
            </div>
          </div>

          <Button
            asChild
            className="w-full h-11 bg-white/8 border border-white/10 text-white hover:bg-white/12"
            variant="ghost"
          >
            <Link to="/forgot-password">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Demander un nouveau lien
            </Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Mot de passe mis à jour" subtitle="Votre compte est sécurisé">
        <div className="space-y-6">
          {/* Success illustration */}
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-center text-sm text-slate-400">
              Votre mot de passe a été mis à jour avec succès.
              <br />
              Vous pouvez maintenant vous connecter.
            </p>
          </div>

          <Button
            onClick={() => navigate('/login')}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Se connecter
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <AuthLayout
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe sécurisé pour votre compte"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Shield header accent */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/6 px-4 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-xs text-slate-400">
            Utilisez un mot de passe unique, non réutilisé sur d'autres sites.
          </p>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label className="text-sm text-slate-300">Nouveau mot de passe</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('password')}
              className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-600 border-white/10 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/30"
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

          {/* Strength meter */}
          {passwordValue.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: i <= strength.score ? strength.color : 'rgba(255,255,255,0.08)',
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px]" style={{ color: strength.color }}>
                {strength.label}
              </p>
            </div>
          )}

          {errors.password && (
            <p className="text-xs text-red-400">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <label className="text-sm text-slate-300">Confirmer le mot de passe</label>
          <div className="relative">
            <Input
              type={showConfirm ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirm')}
              className="h-11 pr-11 bg-white/5 text-white placeholder:text-slate-600 border-white/10 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/30"
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
          {errors.confirm && (
            <p className="text-xs text-red-400">{errors.confirm.message}</p>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mise à jour…
            </span>
          ) : (
            'Mettre à jour le mot de passe'
          )}
        </Button>

        <p className="text-center text-xs text-slate-500">
          <Link to="/login" className="hover:text-slate-300 transition-colors underline underline-offset-2">
            Retour à la connexion
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
