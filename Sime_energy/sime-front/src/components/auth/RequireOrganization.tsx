/**
 * Accès à la plateforme réservé aux membres d'une organisation.
 *
 * Décision du 21/10/2026 : accès sur invitation seulement. Un compte
 * connecté qui n'appartient à aucune organisation (ancien compte créé par
 * l'inscription libre, invitation pas encore acceptée) voit cette page au
 * lieu de la plateforme. Les règles en base refusent de toute façon ses
 * lectures ; la page lui explique quoi faire.
 */

import type { ReactNode } from 'react';
import { Loader2, LogOut, MailQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/auth/AuthLayout';

export function RequireOrganization({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { organization, loading } = useOrganization();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f111a]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!organization) {
    return (
      <AuthLayout title="En attente d'invitation" subtitle="Accès à la plateforme sur invitation">
        <div className="space-y-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <MailQuestion className="h-6 w-6 shrink-0 text-primary" />
            <p>
              Le compte <span className="font-semibold text-white">{user?.email}</span> n'appartient encore à aucune
              organisation. Demandez à un admin de votre organisation de vous inviter, puis ouvrez le lien qu'il vous
              transmettra.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full h-11 border-white/20 text-white hover:bg-white/5 gap-2"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return <>{children}</>;
}
