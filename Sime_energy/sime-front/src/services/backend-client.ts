import { supabase } from '@/lib/supabase';

/**
 * En-têtes de tout appel au backend FastAPI : le jeton Supabase de l'utilisateur
 * (le backend refuse les appels non authentifiés et contrôle l'organisation).
 */
export async function backendHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}
