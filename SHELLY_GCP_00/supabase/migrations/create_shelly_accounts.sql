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

-- Pré-peupler avec les 3 comptes existants
-- (remplacer les valeurs par celles du .env avant d'exécuter)
INSERT INTO shelly_accounts (site, label, auth_key, server_url) VALUES
  ('Ma Maison',      'Compte 1 — Ma Maison',      'MWY5NDU1dWlkEF970F841898E8150A8ACAC2A194A97237068E65120C14FD4545DCB84BE8DC0C76D2CD4525F59FA7', 'https://shelly-88-eu.shelly.cloud'),
  ('Académie CER2E', 'Compte 2 — Académie CER2E', 'MjI4MGY3dWlkA47CD089434DECBC1266C46BBD0DA4C848DB7425EE1DED728EF2E4EAA52538B5A6869D5C9F4A244E', 'https://shelly-97-eu.shelly.cloud')
ON CONFLICT (site) DO NOTHING;
