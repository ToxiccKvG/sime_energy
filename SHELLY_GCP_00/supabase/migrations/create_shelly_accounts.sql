-- Migration : table de gestion des comptes Shelly Cloud
-- Permet de modifier les credentials depuis la plateforme sans toucher au code.

CREATE TABLE IF NOT EXISTS shelly_accounts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  site        TEXT        NOT NULL UNIQUE,
  label       TEXT,
  auth_key    TEXT        NOT NULL,
  server_url  TEXT        NOT NULL,
  actif       BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_shelly_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shelly_accounts_updated_at ON shelly_accounts;
CREATE TRIGGER trg_shelly_accounts_updated_at
  BEFORE UPDATE ON shelly_accounts
  FOR EACH ROW EXECUTE FUNCTION update_shelly_accounts_updated_at();

-- RLS : lecture/écriture pour les utilisateurs authentifiés uniquement
ALTER TABLE shelly_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelly_accounts_authenticated_rw" ON shelly_accounts;
CREATE POLICY "shelly_accounts_authenticated_rw" ON shelly_accounts
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Pré-peupler avec les comptes Shelly Cloud.
-- Les auth_keys réelles sont dans Supabase Dashboard > Table Editor > shelly_accounts
-- ou dans Settings > Edge Functions > Secrets (variable SHELLY_ACCOUNTS).
-- NE PAS committer les auth_keys réelles dans git.
INSERT INTO shelly_accounts (site, label, auth_key, server_url) VALUES
  ('Ma Maison',      'Compte 1 — Ma Maison',      '<AUTH_KEY_MA_MAISON>',      'https://shelly-88-eu.shelly.cloud'),
  ('Académie CER2E', 'Compte 2 — Académie CER2E', '<AUTH_KEY_ACADEMIE_CER2E>', 'https://shelly-97-eu.shelly.cloud')
ON CONFLICT (site) DO NOTHING;
