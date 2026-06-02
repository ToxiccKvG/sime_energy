-- ============================================================
--  FIX : Agrégation horaire shelly_cl_horaire
--  À exécuter dans l'éditeur SQL Supabase (amctayugahwhxwytqiqf)
--
--  Problème : shelly_cl_horaire était une table statique qui n'était
--  plus alimentée depuis le 2026-05-18. Ce script :
--   1. Ajoute la contrainte UNIQUE (ts_heure, device_id) si absente
--   2. Crée la fonction d'agrégation fn_aggregate_horaire()
--   3. Backfille le gap (2026-05-19 → maintenant)
--   4. Planifie l'agrégation automatique toutes les heures (cron)
-- ============================================================


-- ── 1. Contrainte UNIQUE pour le ON CONFLICT ─────────────────────────────────
--
--  Nécessaire pour que la fonction d'agrégation soit idempotente.
--  La commande est no-op si la contrainte existe déjà.
--
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shelly_cl_horaire_ts_device_uniq'
  ) THEN
    ALTER TABLE shelly_cl_horaire
      ADD CONSTRAINT shelly_cl_horaire_ts_device_uniq
      UNIQUE (ts_heure, device_id);
  END IF;
END;
$$;


-- ── 2. Fonction d'agrégation ─────────────────────────────────────────────────
--
--  Calcul : avg(power_w) W × 1 heure = Wh consommés dans l'heure.
--  Compatible tous types d'appareils (energy meters, lumières, capteurs).
--  Idempotent : INSERT … ON CONFLICT DO UPDATE.
--
CREATE OR REPLACE FUNCTION fn_aggregate_horaire(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  -- Fenêtre par défaut : les 2 dernières heures (avec chevauchement pour sécurité)
  IF p_since IS NULL THEN
    p_since := date_trunc('hour', NOW() - INTERVAL '2 hours');
  END IF;
  IF p_until IS NULL THEN
    p_until := date_trunc('hour', NOW()) + INTERVAL '1 hour';
  END IF;

  INSERT INTO shelly_cl_horaire (
    ts_heure,
    site,
    device_id,
    name,
    device_family,
    wh_conso
  )
  SELECT
    date_trunc('hour', ts AT TIME ZONE 'UTC')   AS ts_heure,
    site,
    device_id,
    MAX(name)                                    AS name,
    MAX(device_family)                           AS device_family,
    GREATEST(0, AVG(COALESCE(power_w, 0)))       AS wh_conso
    -- avg(power_w) W × 1h = Wh. Pour les compteurs d'énergie le delta
    -- wh_tot serait plus précis, mais avg(power_w) fonctionne pour tous
    -- types d'appareils et est suffisant pour les visualisations.
  FROM shelly_cl
  WHERE ts >= p_since
    AND ts <  p_until
    AND power_w IS NOT NULL
  GROUP BY 1, 2, 3
  ON CONFLICT (ts_heure, device_id)
  DO UPDATE SET
    wh_conso      = EXCLUDED.wh_conso,
    name          = EXCLUDED.name,
    device_family = EXCLUDED.device_family;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ── 3. Backfill du gap (2026-05-19 → maintenant) ─────────────────────────────
--
--  Exécuter cette commande une seule fois pour combler les données manquantes.
--  La fonction est idempotente — safe à ré-exécuter si nécessaire.
--
SELECT fn_aggregate_horaire(
  '2026-05-19T00:00:00Z'::timestamptz,
  NOW()
) AS lignes_inserees;


-- ── 4. Planification cron — toutes les heures à H+05 ────────────────────────
--
--  Supprime le job existant s'il existe, puis en crée un nouveau.
--
SELECT cron.unschedule('aggregate-shelly-cl-horaire');

SELECT cron.schedule(
  'aggregate-shelly-cl-horaire',
  '5 * * * *',
  $$SELECT fn_aggregate_horaire()$$
);


-- ── 5. Vérification post-exécution ──────────────────────────────────────────
--
-- SELECT MAX(ts_heure) AS derniere_heure_horaire FROM shelly_cl_horaire;
--
-- SELECT COUNT(*) AS nb_lignes_gap
--   FROM shelly_cl_horaire
--   WHERE ts_heure >= '2026-05-19';
--
-- SELECT * FROM cron.job WHERE jobname = 'aggregate-shelly-cl-horaire';
