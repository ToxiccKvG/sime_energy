-- ============================================================
--  IOT MODULE — Migration Supabase
--  SIME Energy · Module IoT v4
--  Date : 2026-04-07
--  Projet cible : sime-front (amctayugahwhxwytqiqf)
--
--  Architecture deux projets :
--  - SHELLY_GCP_00 (qsnzfavkxkvdtywxrspk) : collecte temps réel → table readings
--  - sime-front (amctayugahwhxwytqiqf)    : analyse, multi-tenant → tables iot_*
--
--  Ce fichier crée dans sime-front :
--    1. iot_readings       — Miroir des readings Shelly avec contexte organisation
--    2. iot_sites          — Relie un site Shelly à une organisation SIME
--    3. iot_sources        — Points de mesure M1–M5
--    4. iot_tarifs         — Grilles tarifaires (Senelec K1/K2, CIE, SONABEL, custom)
--    5. iot_calendrier     — Jours fériés par site
--    6. iot_simulations    — Scénarios d'optimisation sauvegardés
--    7. iot_exports_log    — Historique des exports
--
--  Vue créée :
--    - iot_mesures_enrichies — iot_readings + 17 colonnes calculées
--
--  Edge Function à mettre à jour (SHELLY_GCP_00) :
--    - poll-shelly : écrire aussi dans sime-front.iot_readings avec organization_id
-- ============================================================


-- ============================================================
--  1. TABLE iot_readings
--
--  Miroir de la table readings (SHELLY_GCP_00), enrichie avec
--  le contexte organisation et le point de mesure M1–M5.
--  Alimentée par la Edge Function poll-shelly mise à jour.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_readings (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    iot_site_id         UUID,           -- FK ajoutée après création de iot_sites

    -- ── Identification appareil (identique à readings SHELLY_GCP_00) ──────
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    site                TEXT,           -- Nom du site Shelly Cloud (ex: "Académie CER2E")
    device_id           TEXT NOT NULL,
    device_type         TEXT,
    name                TEXT,           -- Nom affiché dans l'app Shelly
    room                TEXT,
    state               TEXT,           -- 'on' | 'off' | 'offline'

    -- ── Point de mesure (M1–M5) ───────────────────────────────────────────
    source_code         TEXT CHECK (source_code IN ('M1','M2','M3','M4','M5')),

    -- ── Puissances (W) ────────────────────────────────────────────────────
    power               DOUBLE PRECISION,   -- Puissance active W (canal principal)
    power_a             DOUBLE PRECISION,   -- Phase A
    power_b             DOUBLE PRECISION,   -- Phase B
    power_c             DOUBLE PRECISION,   -- Phase C
    total_power         DOUBLE PRECISION,   -- Somme des phases W

    -- ── Tensions (V) ──────────────────────────────────────────────────────
    voltage             DOUBLE PRECISION,
    voltage_a           DOUBLE PRECISION,
    voltage_b           DOUBLE PRECISION,
    voltage_c           DOUBLE PRECISION,

    -- ── Courants (A) ──────────────────────────────────────────────────────
    current_a           DOUBLE PRECISION,
    current_b           DOUBLE PRECISION,
    current_c           DOUBLE PRECISION,

    -- ── Énergie ───────────────────────────────────────────────────────────
    energy_total        DOUBLE PRECISION,   -- Énergie cumulée Wh

    -- ── Capteurs environnementaux ─────────────────────────────────────────
    temperature         DOUBLE PRECISION,
    humidity            DOUBLE PRECISION,
    battery_level       INTEGER,
    concentration_ppm   INTEGER,

    -- ── Données brutes (optionnel, pour debug) ────────────────────────────
    raw                 JSONB
);

-- Index optimisés pour les requêtes IoT (séries temporelles)
CREATE INDEX IF NOT EXISTS idx_iot_readings_org_time
    ON iot_readings(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_iot_readings_site_time
    ON iot_readings(iot_site_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_iot_readings_device_time
    ON iot_readings(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_iot_readings_source_time
    ON iot_readings(source_code, timestamp DESC);

ALTER TABLE iot_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_readings: lecture organisation"
    ON iot_readings FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "iot_readings: insertion service"
    ON iot_readings FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
    );

-- Purge automatique 90 jours (cohérence avec SHELLY_GCP_00)
-- À activer via pg_cron si disponible :
-- SELECT cron.schedule('purge-iot-readings', '0 3 * * *',
--   $$DELETE FROM iot_readings WHERE timestamp < NOW() - INTERVAL '90 days'$$);


-- ============================================================
--  2. TABLE iot_sites
--
--  Relie un site Shelly Cloud (champ "site" dans iot_readings)
--  à une organisation SIME et un audit.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_sites (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    audit_id            UUID REFERENCES audits(id) ON DELETE SET NULL,

    -- Identifiant Shelly Cloud (correspond au champ "site" dans iot_readings)
    shelly_site_name    TEXT NOT NULL,

    nom                 TEXT NOT NULL,
    adresse             TEXT,
    pays                TEXT NOT NULL DEFAULT 'Sénégal',
    fournisseur_reseau  TEXT NOT NULL DEFAULT 'Senelec',

    -- Tarif actif pour ce site (FK ajoutée après création de iot_tarifs)
    tarif_actif_id      UUID,

    actif               BOOLEAN NOT NULL DEFAULT true,
    created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, shelly_site_name)
);

CREATE TRIGGER iot_sites_updated_at
    BEFORE UPDATE ON iot_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Maintenant qu'iot_sites existe, on peut ajouter la FK sur iot_readings
ALTER TABLE iot_readings
    ADD CONSTRAINT fk_iot_readings_site
    FOREIGN KEY (iot_site_id) REFERENCES iot_sites(id) ON DELETE SET NULL;

ALTER TABLE iot_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_sites: lecture"
    ON iot_sites FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_sites: création"
    ON iot_sites FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        ) AND created_by = auth.uid()
    );

CREATE POLICY "iot_sites: modification"
    ON iot_sites FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_sites: suppression"
    ON iot_sites FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_iot_sites_org ON iot_sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_iot_sites_shelly ON iot_sites(shelly_site_name);


-- ============================================================
--  3. TABLE iot_sources
--
--  Mappe chaque device_id Shelly à un point de mesure M1–M5.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_sources (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    iot_site_id     UUID NOT NULL REFERENCES iot_sites(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- M1=réseau, M2=ATS/sélecteur, M3=charge/TGBD, M4=groupe élec., M5=PV+batterie
    code            TEXT NOT NULL CHECK (code IN ('M1','M2','M3','M4','M5')),

    -- device_id Shelly — NULL si source déduite (ex: M5 = M2 - M1)
    device_id       TEXT,

    nom             TEXT NOT NULL,
    type            TEXT NOT NULL,    -- 'reseau' | 'ats' | 'charge' | 'generateur' | 'pv_batterie'
    capteur         TEXT,             -- 'Shelly 3EM' | 'SMA' | 'Fluke' | 'Voltcraft' | 'DENT' | 'Sentinel 8' | 'Déduit'
    couleur         TEXT DEFAULT '#378ADD',
    actif           BOOLEAN NOT NULL DEFAULT true,
    ordre           INTEGER NOT NULL DEFAULT 0,

    -- Si M5 est déduit (pas de capteur direct) : M5 = M2 - M1
    est_deduit      BOOLEAN NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(iot_site_id, code)
);

CREATE TRIGGER iot_sources_updated_at
    BEFORE UPDATE ON iot_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE iot_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_sources: lecture"
    ON iot_sources FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_sources: création"
    ON iot_sources FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_sources: modification"
    ON iot_sources FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_sources: suppression"
    ON iot_sources FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_iot_sources_site ON iot_sources(iot_site_id);
CREATE INDEX IF NOT EXISTS idx_iot_sources_device ON iot_sources(device_id);


-- ============================================================
--  4. TABLE iot_tarifs
--
--  Grilles tarifaires complètes :
--  - GP_MT (Moyenne Tension) niveaux 1 à 4
--  - BT (Basse Tension) niveaux 1 à 4
--  - 9 conditions de tarification (modèle XLSX)
--  - Multi-réseau : Senelec, CIE, SONABEL, NEPA, STEG, custom
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_tarifs (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    fournisseur             TEXT NOT NULL,    -- 'Senelec' | 'CIE' | 'SONABEL' | 'NEPA' | 'STEG' | 'Custom'
    pays                    TEXT NOT NULL,
    devise                  TEXT NOT NULL DEFAULT 'XOF',
    symbole_devise          TEXT NOT NULL DEFAULT 'FCFA',

    -- Mode tarifaire
    mode_tarif              TEXT NOT NULL DEFAULT 'GP_MT',  -- 'GP_MT' | 'BT'
    niveau_gp_mt            INTEGER,  -- 1=K1 | 2=K2 | 3=HC+HP différenciés | 4=pondéré
    niveau_bt               INTEGER,  -- 1=Tr1 | 2=Tr2 | 3=Tr3 | 4=moyen

    -- Tarifs Moyenne Tension (devise/kWh)
    tarif_k1                NUMERIC(10,4),   -- K1 BT toutes heures (ex: 140.74 FCFA)
    tarif_k2_hc             NUMERIC(10,4),   -- K2 heure creuse     (ex: 140 FCFA)
    tarif_k2_hp             NUMERIC(10,4),   -- K2 heure de pointe  (ex: 232 FCFA)
    tarif_k2_hn             NUMERIC(10,4),   -- K2 heure normale (CIE uniquement)
    tarif_k2_pondere        NUMERIC(10,4),   -- Coût moyen pondéré calculé (~155 FCFA)

    -- Plages HP/HC (format TIME)
    heure_debut_hp          TIME DEFAULT '19:00:00',
    heure_fin_hp            TIME DEFAULT '23:00:00',
    heure_debut_hn          TIME,            -- CIE : plage heure normale
    heure_fin_hn            TIME,

    -- Tarifs Basse Tension (devise/kWh)
    tarif_bt_tranche1       NUMERIC(10,4),   -- ex: 82 FCFA (petite conso résidentielle)
    tarif_bt_tranche2       NUMERIC(10,4),
    tarif_bt_tranche3       NUMERIC(10,4),
    tarif_bt_moyen          NUMERIC(10,4),

    -- Charges fixes et taxes
    prime_fixe_mensuelle    NUMERIC(12,2),   -- devise/mois selon puissance souscrite
    puissance_souscrite_kva NUMERIC(8,2),
    tva_pct                 NUMERIC(5,2) DEFAULT 18.00,
    taxe_communale_pct      NUMERIC(5,2) DEFAULT 0,
    cos_phi_seuil           NUMERIC(4,3) DEFAULT 0.85,

    -- Coût réel mis à jour depuis facture importée (OCR)
    cout_unitaire_reel      NUMERIC(10,4),   -- devise/kWh = total facture ÷ kWh
    cout_reel_calcule_at    TIMESTAMPTZ,

    actif                   BOOLEAN NOT NULL DEFAULT true,
    notes                   TEXT,

    created_by              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER iot_tarifs_updated_at
    BEFORE UPDATE ON iot_tarifs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE iot_tarifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_tarifs: lecture"
    ON iot_tarifs FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_tarifs: création"
    ON iot_tarifs FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        ) AND created_by = auth.uid()
    );

CREATE POLICY "iot_tarifs: modification"
    ON iot_tarifs FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_tarifs: suppression"
    ON iot_tarifs FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_iot_tarifs_org ON iot_tarifs(organization_id);

-- FK iot_sites → iot_tarifs (maintenant que iot_tarifs existe)
ALTER TABLE iot_sites
    ADD CONSTRAINT fk_iot_sites_tarif
    FOREIGN KEY (tarif_actif_id) REFERENCES iot_tarifs(id) ON DELETE SET NULL;


-- ============================================================
--  5. TABLE iot_calendrier
--
--  Jours fériés et événements spéciaux par site.
--  Les fériés fixes sénégalais sont pré-insérés via l'interface.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_calendrier (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    iot_site_id     UUID REFERENCES iot_sites(id) ON DELETE CASCADE,
    -- NULL = s'applique à tous les sites de l'organisation

    date_ferie      DATE NOT NULL,
    nom             TEXT NOT NULL,
    pays            TEXT NOT NULL DEFAULT 'Sénégal',
    type_ferie      TEXT NOT NULL DEFAULT 'fixe',   -- 'fixe' | 'variable' | 'evenement'
    recurrent       BOOLEAN NOT NULL DEFAULT true,   -- répété chaque année à la même date

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, iot_site_id, date_ferie)
);

ALTER TABLE iot_calendrier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_calendrier: lecture"
    ON iot_calendrier FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_calendrier: création"
    ON iot_calendrier FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_calendrier: modification"
    ON iot_calendrier FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_calendrier: suppression"
    ON iot_calendrier FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_iot_calendrier_org  ON iot_calendrier(organization_id);
CREATE INDEX IF NOT EXISTS idx_iot_calendrier_date ON iot_calendrier(date_ferie);


-- ============================================================
--  6. TABLE iot_simulations
--
--  Scénarios d'optimisation sauvegardés.
--  conditions (JSONB) stocke tous les paramètres du scénario.
--  Les résultats sont mis en cache pour affichage instantané.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_simulations (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    iot_site_id     UUID NOT NULL REFERENCES iot_sites(id) ON DELETE CASCADE,

    nom             TEXT NOT NULL,
    description     TEXT,
    actif           BOOLEAN NOT NULL DEFAULT true,

    -- Paramètres du scénario (JSON) — exemple :
    -- {
    --   "plage_horaire": {"debut": "08:00", "fin": "18:00"},
    --   "separer_hp_hc": true,
    --   "jours": ["ouvre"],          -- "ouvre" | "weekend" | "all"
    --   "exclure_feries": true,
    --   "coefficient": 1.0,
    --   "seuil_puissance_kw": 50,
    --   "exclure_aberrants": true,
    --   "tarif_id": "uuid",
    --   "sources": ["M1", "M3", "M5"],
    --   "periode": {"debut": "2026-01-01", "fin": "2026-03-31"}
    -- }
    conditions      JSONB NOT NULL DEFAULT '{}',

    -- Résultats en cache
    kwh_economises  NUMERIC(12,3),
    pct_reduction   NUMERIC(6,2),
    gain_devise     NUMERIC(14,2),
    resultats_detail JSONB,          -- détail par mois/source/tranche
    calcule_at      TIMESTAMPTZ,

    created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER iot_simulations_updated_at
    BEFORE UPDATE ON iot_simulations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE iot_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_simulations: lecture"
    ON iot_simulations FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_simulations: création"
    ON iot_simulations FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        ) AND created_by = auth.uid()
    );

CREATE POLICY "iot_simulations: modification"
    ON iot_simulations FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_simulations: suppression"
    ON iot_simulations FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_iot_simulations_site ON iot_simulations(iot_site_id);
CREATE INDEX IF NOT EXISTS idx_iot_simulations_org  ON iot_simulations(organization_id);


-- ============================================================
--  7. TABLE iot_exports_log
--
--  Historique de tous les exports générés.
-- ============================================================

CREATE TABLE IF NOT EXISTS iot_exports_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    iot_site_id     UUID REFERENCES iot_sites(id) ON DELETE SET NULL,

    type_export     TEXT NOT NULL,   -- 'xlsx' | 'csv' | 'pdf' | 'png' | 'svg'
    nom_fichier     TEXT NOT NULL,
    lien_storage    TEXT,            -- lien signé Supabase Storage
    taille_octets   INTEGER,
    parametres      JSONB DEFAULT '{}',

    generated_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE iot_exports_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iot_exports_log: lecture"
    ON iot_exports_log FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "iot_exports_log: création"
    ON iot_exports_log FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        ) AND generated_by = auth.uid()
    );

CREATE INDEX IF NOT EXISTS idx_iot_exports_org  ON iot_exports_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_iot_exports_date ON iot_exports_log(generated_at DESC);


-- ============================================================
--  8. VUE iot_mesures_enrichies
--
--  Branchée sur iot_readings (local au projet sime-front).
--  Ajoute toutes les colonnes calculées du modèle Shelly 3EM XLSX :
--
--  - kw_a / kw_b / kw_c / kw_total     (W → kW)
--  - kwh_total                          (énergie en kWh)
--  - flux_energetique                   (Injection / Soutirage / Nul)
--  - jour_semaine                       (Lundi, Mardi…)
--  - mois_nom / annee
--  - heure_decimal                      (0.0 = minuit, 0.5 = midi)
--  - tranche_tarification               (Heure de pointe / Heure creuse)
--  - heures_ensoleillement              (Au fil du soleil / Hors ensoleillement)
--  - heures_travail                     (Heures d'activités / Heures hors activités)
--  - periode_journee                    (Nuit / Matin / Midi / Après-midi / Soir)
--  - periode_climatique                 (Fraîcheur / Chaleur / Forte chaleur)
--  - saison                             (Pluvieuse / Sèche)
-- ============================================================

CREATE OR REPLACE VIEW iot_mesures_enrichies AS
SELECT
    -- ── Identification ─────────────────────────────────────────────────────
    r.id,
    r.timestamp,
    r.organization_id,
    r.iot_site_id,
    r.site,
    r.device_id,
    r.device_type,
    r.name          AS device_name,
    r.room,
    r.state,

    -- ── Source M1–M5 ──────────────────────────────────────────────────────
    COALESCE(r.source_code, s.code)  AS source_code,
    s.nom           AS source_nom,
    s.type          AS source_type,
    s.couleur       AS source_couleur,

    -- ── Puissances W ──────────────────────────────────────────────────────
    r.power         AS w_total,
    r.power_a       AS w_a,
    r.power_b       AS w_b,
    r.power_c       AS w_c,
    r.total_power   AS w_sum_phases,

    -- ── Puissances kW ─────────────────────────────────────────────────────
    COALESCE(r.total_power, r.power, 0) / 1000.0   AS kw_total,
    COALESCE(r.power_a, 0) / 1000.0                AS kw_a,
    COALESCE(r.power_b, 0) / 1000.0                AS kw_b,
    COALESCE(r.power_c, 0) / 1000.0                AS kw_c,

    -- ── Tensions & courants ───────────────────────────────────────────────
    r.voltage,
    r.voltage_a,   r.voltage_b,   r.voltage_c,
    r.current_a,   r.current_b,   r.current_c,

    -- ── Énergie ───────────────────────────────────────────────────────────
    r.energy_total                          AS wh_total,
    COALESCE(r.energy_total, 0) / 1000.0   AS kwh_total,

    -- ── Flux énergétique ──────────────────────────────────────────────────
    CASE
        WHEN COALESCE(r.total_power, r.power) < 0  THEN 'Injection'
        WHEN COALESCE(r.total_power, r.power) > 0  THEN 'Soutirage'
        ELSE 'Nul'
    END AS flux_energetique,

    -- ── Décomposition temporelle (fuseau Africa/Dakar = UTC+0 toute l'année) ──
    r.timestamp::DATE                                               AS date_courte,
    TRIM(TO_CHAR(r.timestamp AT TIME ZONE 'Africa/Dakar', 'Day'))  AS jour_semaine,
    TO_CHAR(r.timestamp AT TIME ZONE 'Africa/Dakar', 'Mon')        AS mois_nom,
    EXTRACT(YEAR   FROM r.timestamp AT TIME ZONE 'Africa/Dakar')   AS annee,
    EXTRACT(MONTH  FROM r.timestamp AT TIME ZONE 'Africa/Dakar')   AS mois_num,
    EXTRACT(DOW    FROM r.timestamp AT TIME ZONE 'Africa/Dakar')   AS jour_semaine_num,
    -- 0.0 = minuit, 0.5 = 12h00, 0.79 ≈ 19h00
    (
        EXTRACT(HOUR   FROM r.timestamp AT TIME ZONE 'Africa/Dakar')
      + EXTRACT(MINUTE FROM r.timestamp AT TIME ZONE 'Africa/Dakar') / 60.0
      + EXTRACT(SECOND FROM r.timestamp AT TIME ZONE 'Africa/Dakar') / 3600.0
    ) AS heure_decimal,

    -- ── Tranche tarifaire Senelec K2 ──────────────────────────────────────
    -- HP : 19h00–22h59 | HC : tout le reste (00h–18h59 et 23h00–23h59)
    CASE
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') >= 19
         AND EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 23
        THEN 'Heure de pointe'
        ELSE 'Heure creuse'
    END AS tranche_tarification,

    -- ── Heures d'ensoleillement (08h–18h) ────────────────────────────────
    CASE
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') >= 8
         AND EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') <= 18
        THEN 'Au fil du soleil'
        ELSE 'Hors ensoleillement'
    END AS heures_ensoleillement,

    -- ── Heures de travail (Lun–Sam 08h–19h) ──────────────────────────────
    CASE
        WHEN EXTRACT(DOW  FROM r.timestamp AT TIME ZONE 'Africa/Dakar') BETWEEN 1 AND 6
         AND EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') >= 8
         AND EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 19
        THEN 'Heures d''activités'
        ELSE 'Heures hors activités'
    END AS heures_travail,

    -- ── Période de la journée (6 segments) ───────────────────────────────
    CASE
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 6   THEN 'Nuit'
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 12  THEN 'Matin'
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 14  THEN 'Midi'
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 18  THEN 'Après-midi'
        WHEN EXTRACT(HOUR FROM r.timestamp AT TIME ZONE 'Africa/Dakar') < 22  THEN 'Soir'
        ELSE 'Nuit'
    END AS periode_journee,

    -- ── Période climatique Afrique de l'Ouest ────────────────────────────
    CASE
        WHEN EXTRACT(MONTH FROM r.timestamp AT TIME ZONE 'Africa/Dakar') IN (12, 1, 2)
        THEN 'Période de fraîcheur'
        WHEN EXTRACT(MONTH FROM r.timestamp AT TIME ZONE 'Africa/Dakar') IN (3, 4, 5)
        THEN 'Période de chaleur'
        ELSE 'Période de forte chaleur'
    END AS periode_climatique,

    -- ── Saison ────────────────────────────────────────────────────────────
    CASE
        WHEN EXTRACT(MONTH FROM r.timestamp AT TIME ZONE 'Africa/Dakar') BETWEEN 7 AND 9
        THEN 'Saison pluvieuse'
        ELSE 'Saison sèche'
    END AS saison,

    -- ── Capteurs environnementaux ─────────────────────────────────────────
    r.temperature,
    r.humidity,
    r.battery_level,
    r.concentration_ppm

FROM iot_readings r
LEFT JOIN iot_sources s
    ON  s.device_id    = r.device_id
    AND s.iot_site_id  = r.iot_site_id
    AND s.actif        = true;


-- ============================================================
--  9. COMMENTAIRES
-- ============================================================

COMMENT ON TABLE iot_readings IS
    'Données temps réel des capteurs Shelly (miroir de readings dans SHELLY_GCP_00), enrichies avec organization_id et source M1–M5. Alimentée par la Edge Function poll-shelly.';

COMMENT ON TABLE iot_sites IS
    'Sites IoT SIME : relie un site Shelly Cloud à une organisation et un audit. Un site = un bâtiment/installation.';

COMMENT ON TABLE iot_sources IS
    'Points de mesure M1–M5 par site. M1=réseau public, M2=ATS, M3=charge/TGBD, M4=groupe électrogène, M5=PV+batterie.';

COMMENT ON TABLE iot_tarifs IS
    'Grilles tarifaires énergétiques. 9 conditions : GP_MT niveaux 1–4 (K1, K2, HC/HP, pondéré) + BT niveaux 1–4 (Tr1, Tr2, Tr3, moyen). Multi-réseau : Senelec, CIE, SONABEL, NEPA, STEG, custom.';

COMMENT ON TABLE iot_calendrier IS
    'Jours fériés et événements spéciaux par site. Utilisé pour classifier Jour ouvré / Weekend / Férié dans les analyses HP/HC.';

COMMENT ON TABLE iot_simulations IS
    'Scénarios d''optimisation énergétique. Conditions en JSONB, résultats mis en cache (kWh économisés, % réduction, gain en devise locale).';

COMMENT ON TABLE iot_exports_log IS
    'Historique des exports générés (Excel 7 onglets, CSV, PDF, PNG/SVG). Liens Supabase Storage re-téléchargeables.';

COMMENT ON VIEW iot_mesures_enrichies IS
    'Vue analytique sur iot_readings. Ajoute les 17 colonnes calculées du modèle Shelly 3EM XLSX : kW/kWh par phase, flux injection/soutirage, HP/HC Senelec, ensoleillement, période journée, climatique, saison.';
