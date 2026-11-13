-- Classeur spatial pour audit_invoices
-- Permet de ranger chaque facture dans la hiérarchie Site → Zone → Bâtiment

ALTER TABLE audit_invoices
  ADD COLUMN IF NOT EXISTS classeur_site_id     UUID REFERENCES audit_sites(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classeur_zone_id     UUID REFERENCES audit_zones(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classeur_building_id UUID REFERENCES audit_buildings(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_classeur_site     ON audit_invoices(classeur_site_id);
CREATE INDEX IF NOT EXISTS idx_invoice_classeur_zone     ON audit_invoices(classeur_zone_id);
CREATE INDEX IF NOT EXISTS idx_invoice_classeur_building ON audit_invoices(classeur_building_id);
