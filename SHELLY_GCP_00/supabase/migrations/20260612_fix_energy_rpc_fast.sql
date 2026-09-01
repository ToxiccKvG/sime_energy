-- ============================================================
--  FIX — fn_energy_by_device : rapide ET exact
--  À exécuter dans l'éditeur SQL Supabase (amctayugahwhxwytqiqf).
--
--  Problèmes corrigés :
--   1. "SET is not allowed in a non-volatile function" :
--      l'ancienne version était STABLE mais exécutait `SET LOCAL
--      statement_timeout` dans le corps → interdit. On utilise
--      désormais la clause de fonction `SET statement_timeout`
--      (compatible STABLE).
--   2. Timeout 30j : l'ancienne version faisait MAX(wh_tot)-MIN(wh_tot)
--      avec GROUP BY → scan complet de ~1,8M lignes sur 30j → timeout.
--      Nouvelle version : on ne lit que les DEUX bornes (première et
--      dernière lecture par appareil) via LATERAL sur l'index
--      (device_id, ts). Quelques seeks indexés au lieu d'un full scan.
--   3. Données réelles : le delta du compteur cumulatif wh_tot
--      traverse les trous de polling (le compteur Shelly continue de
--      compter même quand le polling rate des données), contrairement
--      à la somme des wh_conso horaires qui perd les heures manquantes.
--
--  La liste des appareils concernés est énumérée depuis
--  shelly_cl_horaire (peu de lignes, rapide) ; les bornes wh_tot sont
--  lues sur shelly_cl (table brute, index device_id+ts).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_energy_by_device(
  p_since      timestamptz,
  p_until      timestamptz,
  p_sites      text[] DEFAULT NULL,
  p_families   text[] DEFAULT NULL,
  p_device_ids text[] DEFAULT NULL
)
RETURNS TABLE(device_id text, name text, site text, device_family text, kwh float8)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = '55s'
AS $$
  WITH devs AS (
    -- Énumération rapide des appareils ayant des données sur la période
    -- (shelly_cl_horaire = ~quelques dizaines de lignes/appareil, pas 1440)
    SELECT DISTINCT h.device_id
    FROM shelly_cl_horaire h
    WHERE h.ts_heure >= (p_since AT TIME ZONE 'UTC')
      AND h.ts_heure <= (p_until AT TIME ZONE 'UTC')
      -- Seuls les compteurs d'énergie ont un wh_tot. Sans ce filtre, les LATERAL
      -- ci-dessous scannent en vain toutes les lignes des ~70 capteurs (wh_tot
      -- toujours NULL) à la recherche d'un wh_tot non-null → timeout sur 30j.
      AND h.device_family LIKE 'ENERGIE%'
      AND (p_sites      IS NULL OR h.site          = ANY(p_sites))
      AND (p_families   IS NULL OR h.device_family = ANY(p_families))
      AND (p_device_ids IS NULL OR h.device_id     = ANY(p_device_ids))
  )
  SELECT
    d.device_id,
    lastr.name,
    lastr.site,
    lastr.device_family,
    GREATEST(0, (lastr.last_w - firstr.first_w) / 1000.0) AS kwh
  FROM devs d
  -- Dernière lecture RÉELLE (wh_tot non NULL) de la période + métadonnées.
  -- Le filtre wh_tot IS NOT NULL est indispensable : certaines lignes de bord
  -- ont tous les champs énergie à NULL (device qui démarre) → sinon le delta
  -- partirait de 0 et renverrait le compteur entier (ex. caméra à 35 kWh/h).
  -- L'index partiel idx_shelly_cl_dev_ts_whtot (WHERE wh_tot IS NOT NULL) rend
  -- ce seek O(1) : l'index ne contient QUE les lignes non-NULL.
  CROSS JOIN LATERAL (
    SELECT s.wh_tot AS last_w, s.name, s.site, s.device_family
    FROM shelly_cl s
    WHERE s.device_id = d.device_id
      AND s.ts >= p_since AND s.ts <= p_until
      AND s.wh_tot IS NOT NULL
    ORDER BY s.ts DESC
    LIMIT 1
  ) lastr
  -- Première lecture réelle de la période
  CROSS JOIN LATERAL (
    SELECT s.wh_tot AS first_w
    FROM shelly_cl s
    WHERE s.device_id = d.device_id
      AND s.ts >= p_since AND s.ts <= p_until
      AND s.wh_tot IS NOT NULL
    ORDER BY s.ts ASC
    LIMIT 1
  ) firstr
  ORDER BY kwh DESC;
$$;

-- Index partiel REQUIS pour la rapidité : ne contient que les lignes wh_tot
-- non-NULL → les LATERAL ci-dessus deviennent de simples seeks O(1).
-- ⚠️ CREATE INDEX CONCURRENTLY ne peut PAS s'exécuter dans une transaction :
--    lancer cette commande SÉPARÉMENT (pas dans un bloc multi-instructions).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shelly_cl_dev_ts_whtot
  ON shelly_cl (device_id, ts) WHERE wh_tot IS NOT NULL;

-- Autorise l'appel via PostgREST (clé anon / utilisateur authentifié).
GRANT EXECUTE ON FUNCTION
  fn_energy_by_device(timestamptz, timestamptz, text[], text[], text[])
  TO anon, authenticated;

-- ── Vérification ─────────────────────────────────────────────────────────────
-- 30 jours (doit répondre en < 1 s et renvoyer des kWh cohérents) :
--   SELECT * FROM fn_energy_by_device(
--     '2026-05-13T00:00:00Z'::timestamptz,
--     '2026-06-11T23:59:59Z'::timestamptz) LIMIT 10;
-- Attendu (extrait) : M3_CHARGE_CONSOMMATION ≈ 6300 kWh, M1_SENELEC ≈ 3000 kWh.
