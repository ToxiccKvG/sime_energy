-- Add type_fonctionnel to audit_rooms
-- Drives which building_type_params row to use for operating hours prefill
ALTER TABLE audit_rooms ADD COLUMN IF NOT EXISTS type_fonctionnel TEXT;

-- Parametric operating hours config per building × functional type
-- One row = one "zone type" (Bureau, Salle de cours, Labo…) inside a building
-- Drives auto-prefill of heures_fonct_par_an in equipment forms
CREATE TABLE IF NOT EXISTS building_type_params (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID    NOT NULL REFERENCES audit_buildings(id) ON DELETE CASCADE,
  audit_id    UUID    NOT NULL,  -- kept for RLS joins (mirrors audit_buildings.audit_id)
  type_fonctionnel TEXT NOT NULL,

  -- Calendar base
  jours_non_travailles INTEGER NOT NULL DEFAULT 104,  -- weekends + congés
  jours_feries         INTEGER NOT NULL DEFAULT 5,
  jours_fraicheur      INTEGER NOT NULL DEFAULT 60,   -- days where A/C not needed

  -- Correction coefficients (0–1)
  correction_fraicheur NUMERIC NOT NULL DEFAULT 0.9,
  correction_weekend   NUMERIC NOT NULL DEFAULT 1.0,
  correction_ferie     NUMERIC NOT NULL DEFAULT 1.0,
  correction_ouvres    NUMERIC NOT NULL DEFAULT 0.8,  -- effective occupation rate

  -- Daily hours per equipment category (h/day)
  tps_ecl     NUMERIC NOT NULL DEFAULT 8,
  tps_clim    NUMERIC NOT NULL DEFAULT 8,
  tps_inform  NUMERIC NOT NULL DEFAULT 8,
  tps_electrom NUMERIC NOT NULL DEFAULT 24, -- continuous (365j)
  tps_serveur  NUMERIC NOT NULL DEFAULT 24, -- continuous (365j)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (building_id, type_fonctionnel)
);

-- RLS
ALTER TABLE building_type_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can select building_type_params"
  ON building_type_params FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can insert building_type_params"
  ON building_type_params FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can update building_type_params"
  ON building_type_params FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can delete building_type_params"
  ON building_type_params FOR DELETE
  USING (auth.uid() IS NOT NULL);
