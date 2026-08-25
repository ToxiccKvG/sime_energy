-- Migration : classification des types de dispositifs Shelly + canaux multi-relais
-- Remplace FAMILY_BY_TYPE et les entrées "_N" d'ID_FALLBACK (codés en dur dans poll-shelly/index.ts)
-- Permet à un admin de classifier un nouveau type de matériel Shelly ou de définir
-- les canaux d'une prise/switch multi-relais depuis la plateforme, sans redéploiement.

-- ============================================================
-- Table shelly_device_types — remplace FAMILY_BY_TYPE
-- ============================================================

CREATE TABLE IF NOT EXISTS shelly_device_types (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type   TEXT        NOT NULL UNIQUE,
  device_family TEXT        NOT NULL CHECK (device_family IN
    ('ENERGIE_3PH','ENERGIE_2PH','ENERGIE_1PH','LUMIERE','CAPTEUR_ENV','ETAT')),
  label         TEXT,
  match_prefix  BOOLEAN     DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_shelly_device_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shelly_device_types_updated_at ON shelly_device_types;
CREATE TRIGGER trg_shelly_device_types_updated_at
  BEFORE UPDATE ON shelly_device_types
  FOR EACH ROW EXECUTE FUNCTION update_shelly_device_types_updated_at();

ALTER TABLE shelly_device_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelly_device_types_authenticated_rw" ON shelly_device_types;
CREATE POLICY "shelly_device_types_authenticated_rw" ON shelly_device_types
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed : migre les entrées actuelles de FAMILY_BY_TYPE (zéro régression)
INSERT INTO shelly_device_types (device_type, device_family) VALUES
  ('SHEM-3','ENERGIE_3PH'),('SPEM-003CEBEU','ENERGIE_3PH'),('SPEM-003CEBEU400','ENERGIE_3PH'),
  ('SHEM','ENERGIE_2PH'),('SPEM-002CEBEU50','ENERGIE_2PH'),
  ('SNPL-00112EU','ENERGIE_1PH'),('SNPM-001PCEU16','ENERGIE_1PH'),('S3PM-001PCEU16','ENERGIE_1PH'),
  ('S3PL-00112EU','ENERGIE_1PH'),('S4PL-00416EU','ENERGIE_1PH'),('SPSW-104PE16EU','ENERGIE_1PH'),
  ('S3PB-O3AR000001','ENERGIE_1PH'),('S3PL-30110EU','ENERGIE_1PH'),
  ('SHCB-1','LUMIERE'),('SHBDUO-1','LUMIERE'),('SHDM-2','LUMIERE'),
  ('SBHT-003C','CAPTEUR_ENV'),('S3SN-0U12A','CAPTEUR_ENV'),('SHGS-1','CAPTEUR_ENV'),('SBWS-90CM','CAPTEUR_ENV'),
  ('SBDW-002C','ETAT'),('SBBT-002C','ETAT'),('SBMO-003Z','ETAT'),('SHMOS-02','ETAT'),
  ('S3SW-001P8EU','ETAT'),('LOQED','ETAT')
ON CONFLICT (device_type) DO NOTHING;

-- ============================================================
-- Table shelly_device_channels — remplace les entrées "_N" d'ID_FALLBACK
-- ============================================================

CREATE TABLE IF NOT EXISTS shelly_device_channels (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_device_id TEXT        NOT NULL,
  channel_number   INT         NOT NULL,
  channel_name     TEXT        NOT NULL,
  site             TEXT        NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (parent_device_id, channel_number)
);

CREATE OR REPLACE FUNCTION update_shelly_device_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shelly_device_channels_updated_at ON shelly_device_channels;
CREATE TRIGGER trg_shelly_device_channels_updated_at
  BEFORE UPDATE ON shelly_device_channels
  FOR EACH ROW EXECUTE FUNCTION update_shelly_device_channels_updated_at();

ALTER TABLE shelly_device_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelly_device_channels_authenticated_rw" ON shelly_device_channels;
CREATE POLICY "shelly_device_channels_authenticated_rw" ON shelly_device_channels
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed : migre les canaux virtuels actuellement codés en dur dans ID_FALLBACK
INSERT INTO shelly_device_channels (parent_device_id, channel_number, channel_name, site) VALUES
  ('c45bbee265f5', 1, 'ECL hall-séjour-cuisine', 'Ma Maison'),
  ('34987a68c520', 1, '2) Prise 2', 'Académie CER2E'),
  ('206ef102b9c4', 1, '2) Télé', 'Académie CER2E'),
  ('34987a68c520', 2, '3) Prise 3', 'Académie CER2E'),
  ('206ef102b9c4', 2, '3) Woyofal', 'Académie CER2E'),
  ('206ef102b9c4', 3, '4) Caméra', 'Académie CER2E'),
  ('34987a68c520', 3, '4) Prise 4', 'Académie CER2E'),
  ('08f9e0e4d080', 1, 'M4_Groupe électrogène (canal 2)', 'Académie CER2E')
ON CONFLICT (parent_device_id, channel_number) DO NOTHING;
