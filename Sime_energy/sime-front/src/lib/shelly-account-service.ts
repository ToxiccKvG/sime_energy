// ============================================================
// Service — Gestion des comptes Shelly Cloud
// CRUD sur la table shelly_accounts + test de connexion.
// ============================================================

import { supabase } from '@/lib/supabase';

export interface ShellyAccount {
  id: string;
  site: string;
  label: string | null;
  auth_key: string;
  server_url: string;
  actif: boolean;
  last_poll_at: string | null;
  last_poll_status: 'ok' | 'error' | null;
  last_error_msg: string | null;
  created_at: string;
  updated_at: string;
}

export type ShellyAccountInput = Omit<ShellyAccount, 'id' | 'created_at' | 'updated_at'>;

export interface TestResult {
  ok: boolean;
  nb_devices?: number;
  error?: string;
}

// ── Lecture ───────────────────────────────────────────────────

export async function fetchAccounts(): Promise<ShellyAccount[]> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Création / mise à jour ────────────────────────────────────

export async function upsertAccount(account: ShellyAccountInput): Promise<ShellyAccount> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .upsert(account, { onConflict: 'site' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Mise à jour partielle ─────────────────────────────────────

export async function updateAccount(
  id: string,
  patch: Partial<ShellyAccountInput>
): Promise<ShellyAccount> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Suppression ───────────────────────────────────────────────

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('shelly_accounts').delete().eq('id', id);
  if (error) throw error;
}

// ── Toggle actif/inactif ──────────────────────────────────────

export async function toggleAccount(id: string, actif: boolean): Promise<void> {
  const { error } = await supabase
    .from('shelly_accounts')
    .update({ actif })
    .eq('id', id);
  if (error) throw error;
}

// ── Test de connexion ─────────────────────────────────────────
// Appelle l'API Shelly Cloud via l'Edge Function pour éviter les problèmes CORS.
// Si l'Edge Function n'est pas disponible, tente l'appel direct (dev uniquement).

export async function testAccount(auth_key: string, server_url: string): Promise<TestResult> {
  try {
    // Tentative via Edge Function (production)
    const { data, error } = await supabase.functions.invoke('test-shelly-account', {
      body: { auth_key, server_url },
    });
    if (!error && data) return data as TestResult;
  } catch {
    // Edge Function absente → fallback appel direct (dev local)
  }

  // Fallback direct (peut échouer à cause du CORS en prod)
  try {
    const resp = await fetch(`${server_url}/interface/device/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `auth_key=${encodeURIComponent(auth_key)}`,
    });
    const json = await resp.json();
    if (json?.isok) {
      const devices = json?.data?.deviceList ?? [];
      return { ok: true, nb_devices: devices.length };
    }
    return { ok: false, error: JSON.stringify(json?.errors ?? 'Réponse invalide') };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── Utilitaire affichage ──────────────────────────────────────

export function maskAuthKey(key: string): string {
  if (!key || key.length < 6) return '••••••••••••';
  return `••••••••••••[${key.slice(-6)}]`;
}
