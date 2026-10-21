import { supabase } from '@/lib/supabase';

// Compte de l'utilisateur connecté (profil, mot de passe).
// Les fonctions renvoient la réponse Supabase telle quelle ; l'appelant gère l'erreur.

export function updateCurrentUserMetadata(data: Record<string, unknown>) {
  return supabase.auth.updateUser({ data });
}

export function updateCurrentUserPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

// Ré-authentification : vérifie le mot de passe actuel avant d'en changer.
export function verifyPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
