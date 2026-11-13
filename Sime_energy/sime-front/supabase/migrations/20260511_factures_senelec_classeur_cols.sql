-- Add spatial classification columns to factures_senelec
-- Allows assigning SENELEC Excel invoices to audit sites/zones/buildings in the Classeur

ALTER TABLE factures_senelec
  ADD COLUMN IF NOT EXISTS classeur_site_id     UUID,
  ADD COLUMN IF NOT EXISTS classeur_zone_id     UUID,
  ADD COLUMN IF NOT EXISTS classeur_building_id UUID;
