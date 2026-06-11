// Le client admin (service_role) ne doit jamais être instancié côté frontend —
// toute opération privilégiée doit passer par une Edge Function Supabase.
export const supabaseAdmin = null;
