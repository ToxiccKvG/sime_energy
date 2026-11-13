-- Migration: Add utilization_factor to audit_equipment
--
-- The utilization factor (0–1) represents the real-world usage pattern of an
-- equipment versus its nameplate power. For example, a washing machine draws
-- high power at start-up then drops during the wash cycle. The factor corrects
-- the annual consumption estimate accordingly.
--
-- DEFAULT 1.0 = no correction (backwards-compatible with all existing rows).
--
-- Formula: kWh/an = (P_W × qty × utilization_factor / 1000) × heures_an
--
-- Note: FORCE MOTRICE equipment already stores tauxCharge (% nominal load) in
-- metadata. utilization_factor is a separate, universal coefficient applied
-- on top — it represents cyclical on/off patterns, not the nominal load point.

ALTER TABLE audit_equipment
  ADD COLUMN IF NOT EXISTS utilization_factor FLOAT NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN audit_equipment.utilization_factor IS
  'Usage pattern coefficient (0–1). Corrects nameplate power to real operating power. Default 1.0 = no correction.';
