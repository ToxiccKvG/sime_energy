// ============================================================
// Service — Gestion des comptes Shelly Cloud
// CRUD sur la table shelly_accounts + test de connexion.
// ============================================================

import { supabase } from '@/lib/supabase';

// auth_key n'est jamais lu par le front (column-level GRANT côté DB,
// cf. migration 20260720_shelly_accounts_column_security.sql) — seul
// un aperçu masqué (6 derniers caractères) est exposé.
export interface ShellyAccount {
  id: string;
  site: string;
  label: string | null;
  auth_key_last6: string | null;
  server_url: string;
  actif: boolean;
  last_poll_at: string | null;
  last_poll_status: 'ok' | 'error' | null;
  last_error_msg: string | null;
  created_at: string;
  updated_at: string;
}

const SAFE_COLUMNS =
  'id, site, label, server_url, actif, last_poll_at, last_poll_status, last_error_msg, created_at, updated_at, auth_key_last6';

// Payload de création/édition : auth_key optionnelle — absente ou vide,
// on conserve la clé existante (édition) ; obligatoire à la création,
// vérifié côté UI.
export interface ShellyAccountInput {
  site: string;
  label: string | null;
  auth_key?: string;
  server_url: string;
  actif: boolean;
}

export interface TestResult {
  ok: boolean;
  nb_devices?: number;
  error?: string;
}

// ── Lecture ───────────────────────────────────────────────────

export async function fetchAccounts(): Promise<ShellyAccount[]> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .select(SAFE_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ShellyAccount[];
}

// ── Création ──────────────────────────────────────────────────
// auth_key est requise à la création (vérifié côté UI avant l'appel).
// INSERT simple, pas d'upsert : ON CONFLICT DO UPDATE exige le droit de
// LIRE auth_key, que `authenticated` n'a pas (column-level GRANT) — Postgres
// refusait alors toute création (« permission denied for table »). Un site
// déjà existant se modifie via updateAccount.

export async function createAccount(account: ShellyAccountInput): Promise<ShellyAccount> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .insert(account)
    .select(SAFE_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ShellyAccount;
}

// ── Mise à jour partielle ─────────────────────────────────────
// Si patch.auth_key est absent/vide, la clé existante est conservée
// (l'appelant ne doit inclure auth_key que si l'utilisateur en saisit
// une nouvelle — voir ParametresTab.handleSave).

export async function updateAccount(
  id: string,
  patch: Partial<ShellyAccountInput>
): Promise<ShellyAccount> {
  const { data, error } = await supabase
    .from('shelly_accounts')
    .update(patch)
    .eq('id', id)
    .select(SAFE_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ShellyAccount;
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
// Toujours via l'Edge Function : auth_key ne doit jamais transiter
// par le code du front pour un compte déjà enregistré (voir
// testSavedAccount). testNewAccount reste nécessaire pour valider
// une clé en cours de saisie, pas encore sauvegardée.

export async function testSavedAccount(accountId: string): Promise<TestResult> {
  const { data, error } = await supabase.functions.invoke('test-shelly-account', {
    body: { account_id: accountId },
  });
  if (error) return { ok: false, error: String(error) };
  return data as TestResult;
}

export async function testNewAccount(auth_key: string, server_url: string): Promise<TestResult> {
  const { data, error } = await supabase.functions.invoke('test-shelly-account', {
    body: { auth_key, server_url },
  });
  if (error) return { ok: false, error: String(error) };
  return data as TestResult;
}

// ── Utilitaire affichage ──────────────────────────────────────

// Message lisible pour une erreur Supabase/PostgREST (objet, pas une Error :
// String(e) donnait « [object Object] »).
export function accountErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23505') return 'Ce nom de site existe déjà : choisis un autre nom, ou modifie le compte existant.';
  if (err?.code === '42501') return 'Droits insuffisants : seul un administrateur peut gérer les connexions Shelly.';
  if (err?.message) return err.message;
  return String(e);
}

export function maskAuthKey(last6: string | null): string {
  if (!last6) return '••••••••••••';
  return `••••••••••••[${last6}]`;
}
