-- ============================================================
--  FIX COMPLET — shelly_cl_horaire + shelly_accounts + RPC
--  À exécuter dans l'éditeur SQL Supabase (amctayugahwhxwytqiqf)
--  Exécuter les blocs UN PAR UN dans l'ordre.
-- ============================================================


-- ── BLOC 1 : Corriger fn_aggregate_horaire ───────────────────
-- Avant : AVG(COALESCE(power_w,0)) → valeur en Watts, pas en Wh,
--         et les colonnes wh_inj / power_w_moy / p_a_moy… restaient NULL.
-- Après : delta MAX-MIN sur les compteurs cumulatifs (Wh réels),
--         AVG sur les moyennes de puissance, toutes les colonnes remplies.

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
  IF p_since IS NULL THEN
    p_since := date_trunc('hour', NOW() - INTERVAL '2 hours');
  END IF;
  IF p_until IS NULL THEN
    p_until := date_trunc('hour', NOW()) + INTERVAL '1 hour';
  END IF;

  INSERT INTO shelly_cl_horaire (
    ts_heure, site, device_id, name, device_type, device_family,
    wh_conso, wh_inj,
    power_w_moy, power_w_max,
    p_a_moy, p_b_moy, p_c_moy,
    v_a_moy, v_b_moy, v_c_moy, voltage_v_moy,
    nb_mesures
  )
  SELECT
    date_trunc('hour', ts AT TIME ZONE 'UTC')          AS ts_heure,
    MAX(site)                                          AS site,
    device_id,
    MAX(name)                                          AS name,
    MAX(device_type)                                   AS device_type,
    MAX(device_family)                                 AS device_family,
    -- delta du compteur Wh cumulatif sur l'heure → Wh réellement consommés
    GREATEST(0, MAX(wh_tot)  - MIN(wh_tot))            AS wh_conso,
    -- delta du compteur retour (injection solaire)
    GREATEST(0, MAX(wh_rtot) - MIN(wh_rtot))           AS wh_inj,
    -- moyennes de puissance (W) — NULL ignorés, pas de COALESCE(0)
    AVG(power_w)                                       AS power_w_moy,
    MAX(power_w)                                       AS power_w_max,
    AVG(p_a)                                           AS p_a_moy,
    AVG(p_b)                                           AS p_b_moy,
    AVG(p_c)                                           AS p_c_moy,
    AVG(v_a)                                           AS v_a_moy,
    AVG(v_b)                                           AS v_b_moy,
    AVG(v_c)                                           AS v_c_moy,
    AVG(voltage_v)                                     AS voltage_v_moy,
    COUNT(*)                                           AS nb_mesures
  FROM shelly_cl
  WHERE ts >= p_since AND ts < p_until
  GROUP BY ts_heure, device_id
  ON CONFLICT (ts_heure, device_id)
  DO UPDATE SET
    name          = EXCLUDED.name,
    device_type   = EXCLUDED.device_type,
    device_family = EXCLUDED.device_family,
    wh_conso      = EXCLUDED.wh_conso,
    wh_inj        = EXCLUDED.wh_inj,
    power_w_moy   = EXCLUDED.power_w_moy,
    power_w_max   = EXCLUDED.power_w_max,
    p_a_moy       = EXCLUDED.p_a_moy,
    p_b_moy       = EXCLUDED.p_b_moy,
    p_c_moy       = EXCLUDED.p_c_moy,
    v_a_moy       = EXCLUDED.v_a_moy,
    v_b_moy       = EXCLUDED.v_b_moy,
    v_c_moy       = EXCLUDED.v_c_moy,
    voltage_v_moy = EXCLUDED.voltage_v_moy,
    nb_mesures    = EXCLUDED.nb_mesures;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ── BLOC 2 : Backfill complet (remplace les anciennes valeurs erronées) ──────
-- Prend ~1-2 min. Toutes les anciennes lignes wh_conso=0 seront corrigées.

SELECT fn_aggregate_horaire(
  '2026-01-01T00:00:00Z'::timestamptz,
  NOW()
) AS lignes_mises_a_jour;


-- ── BLOC 3 : Ajouter les colonnes manquantes à shelly_accounts ──────────────
-- L'Edge Function poll-shelly écrit last_poll_at/status/error_msg
-- mais ces colonnes n'existaient pas → les mises à jour échouaient silencieusement.

ALTER TABLE shelly_accounts
  ADD COLUMN IF NOT EXISTS last_poll_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_poll_status text,
  ADD COLUMN IF NOT EXISTS last_error_msg   text;


-- ── BLOC 4 : Créer la RPC fn_energy_by_device ───────────────────────────────
-- Calcul précis kWh par appareil sur une plage de dates,
-- via delta MAX(wh_tot)-MIN(wh_tot) sur shelly_cl (pas de dépendance à horaire).
-- Utilisée par le dashboard modes 7j/30j.

CREATE OR REPLACE FUNCTION fn_energy_by_device(
  p_since      timestamptz,
  p_until      timestamptz,
  p_sites      text[] DEFAULT NULL,
  p_families   text[] DEFAULT NULL,
  p_device_ids text[] DEFAULT NULL
)
RETURNS TABLE(device_id text, name text, site text, device_family text, kwh float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '30000'; -- évite le timeout PostgREST sur 30j
  RETURN QUERY
  SELECT
    sc.device_id,
    MAX(sc.name)          AS name,
    MAX(sc.site)          AS site,
    MAX(sc.device_family) AS device_family,
    GREATEST(0, (MAX(sc.wh_tot) - MIN(sc.wh_tot)) / 1000.0) AS kwh
  FROM shelly_cl sc
  WHERE sc.ts >= p_since
    AND sc.ts <= p_until
    AND sc.wh_tot IS NOT NULL
    AND (p_sites      IS NULL OR sc.site          = ANY(p_sites))
    AND (p_families   IS NULL OR sc.device_family = ANY(p_families))
    AND (p_device_ids IS NULL OR sc.device_id     = ANY(p_device_ids))
  GROUP BY sc.device_id
  ORDER BY kwh DESC;
END;
$$;


-- ── Vérification ─────────────────────────────────────────────────────────────
-- Après avoir exécuté les 4 blocs, vérifie les résultats :

-- Lignes horaire avec wh_conso > 0 :
-- SELECT COUNT(*) FROM shelly_cl_horaire WHERE wh_conso > 0;

-- Test RPC :
-- SELECT * FROM fn_energy_by_device(NOW()-INTERVAL '7 days', NOW()) LIMIT 10;

-- Colonnes shelly_accounts :
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'shelly_accounts';
