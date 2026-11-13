-- Add reference_senelec_id to audit_billing_params
-- Allows selecting a SENELEC Excel facture as reference instead of an OCR invoice

ALTER TABLE audit_billing_params
  ADD COLUMN IF NOT EXISTS reference_senelec_id UUID;
