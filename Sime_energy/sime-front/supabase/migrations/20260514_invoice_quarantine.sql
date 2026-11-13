-- Add quarantine columns to audit_invoices
-- Used by the Simulateur to flag invoices where |delta%| > threshold
ALTER TABLE audit_invoices
  ADD COLUMN IF NOT EXISTS is_quarantined       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quarantine_reason    TEXT,
  ADD COLUMN IF NOT EXISTS quarantine_delta_pct FLOAT;
