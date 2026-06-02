-- Add "Zone" level between Site and Bâtiment in the inventory spatial hierarchy
-- Hierarchy: SITE → ZONE → BÂTIMENT → ÉTAGE → PIÈCE → ÉQUIPEMENTS

CREATE TABLE IF NOT EXISTS audit_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES audit_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zones_org_access" ON audit_zones
  USING (audit_id IN (
    SELECT a.id FROM audits a
    JOIN organization_users ou ON ou.organization_id = a.organization_id
    WHERE ou.user_id = auth.uid()
  ));

-- Add zone_id to audit_buildings (nullable — existing buildings without zone still valid)
ALTER TABLE audit_buildings ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES audit_zones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_audit_zones_site_id ON audit_zones(site_id);
CREATE INDEX IF NOT EXISTS idx_audit_buildings_zone_id ON audit_buildings(zone_id);
