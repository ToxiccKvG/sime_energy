-- Module Paramètres SENELEC — configuration contractuelle par audit/site
-- 1 config par (audit_id, site_id) — upsert via billing-params-service.ts

CREATE TABLE IF NOT EXISTS audit_billing_params (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  site_id                 UUID NOT NULL REFERENCES audit_sites(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id),
  numero_contrat          TEXT,
  domaine_tension         TEXT NOT NULL DEFAULT 'BT'
                          CHECK (domaine_tension IN ('BT', 'MT', 'HT')),
  categorie_tarifaire     TEXT NOT NULL DEFAULT 'DPP',
  grille_annee            INTEGER NOT NULL DEFAULT 2023
                          CHECK (grille_annee IN (2017, 2019, 2023, 2026)),
  puissance_souscrite_kw  NUMERIC,
  puissance_transfo_kva   NUMERIC,
  comptage_position       TEXT DEFAULT 'secondaire'
                          CHECK (comptage_position IN ('primaire', 'secondaire')),
  reference_invoice_id    UUID REFERENCES audit_invoices(id),
  periode_reference_jours INTEGER DEFAULT 30,
  intervalle_mesure_min   INTEGER DEFAULT 1
                          CHECK (intervalle_mesure_min IN (1, 5, 10, 15, 30)),
  source_mesure           TEXT DEFAULT 'shelly'
                          CHECK (source_mesure IN ('shelly', 'fluke', 'scada', 'sunny_portal', 'autre')),
  has_transformateur      BOOLEAN DEFAULT false,
  tco_applicable          BOOLEAN DEFAULT true,
  tva_applicable          BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (audit_id, site_id)
);

ALTER TABLE audit_billing_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_params_select"
  ON audit_billing_params FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "billing_params_insert"
  ON audit_billing_params FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "billing_params_update"
  ON audit_billing_params FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "billing_params_delete"
  ON audit_billing_params FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));
