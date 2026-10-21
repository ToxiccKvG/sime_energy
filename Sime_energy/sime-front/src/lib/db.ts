import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as client } from '@/lib/supabase';
import type { Database, Json } from '@/types/database';

// Même client que lib/supabase.ts, typé avec le schéma de la base (types/database.ts) :
// les requêtes sont vérifiées à la compilation (tables, colonnes, types des lignes).
export const supabase = client as SupabaseClient<Database>;

// Colonnes JSON (general_info, settings, fields...) : Supabase les type en Json générique.
// Ces deux fonctions marquent explicitement la frontière entre ce Json et nos types métier.
export function toJson<T>(value: T): Json {
  return value as unknown as Json;
}

export function fromJson<T>(value: unknown): T {
  return value as unknown as T;
}
