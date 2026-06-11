-- ============================================================
--  FIX TIMEOUT : Index sur shelly_cl
--  À exécuter dans l'éditeur SQL Supabase (amctayugahwhxwytqiqf)
--
--  Problème : shelly_cl n'a aucun index → scans séquentiels
--  → "canceling statement due to statement timeout" (code 57014)
--
--  CONCURRENTLY = ne bloque pas les insertions pendant la création.
--  La création peut prendre 1–5 minutes selon la taille de la table.
--  Ne pas interrompre le script.
-- ============================================================


-- ── 1. Index principal sur ts ────────────────────────────────────────────────
--
--  Couvre : ORDER BY ts DESC, WHERE ts >= ?, WHERE ts BETWEEN ? AND ?
--  Utilisé par : check_supabase.py, fn_aggregate_horaire(), cron de purge
--
CREATE INDEX CONCURRENTLY IF NOT EXISTS shelly_cl_ts_idx
  ON shelly_cl (ts DESC);


-- ── 2. Index composite (site, ts) ───────────────────────────────────────────
--
--  Couvre : WHERE site = ? ORDER BY ts DESC
--  Utilisé par : Edge Function poll-shelly (getDbCache, getLastCounters)
--
CREATE INDEX CONCURRENTLY IF NOT EXISTS shelly_cl_site_ts_idx
  ON shelly_cl (site, ts DESC);


-- ── 3. Index composite (device_id, ts) ──────────────────────────────────────
--
--  Couvre : WHERE device_id = ? ORDER BY ts DESC
--  Utilisé par : getLastCounters dans poll-shelly
--
CREATE INDEX CONCURRENTLY IF NOT EXISTS shelly_cl_device_ts_idx
  ON shelly_cl (device_id, ts DESC);


-- ── Vérification post-création ───────────────────────────────────────────────
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'shelly_cl'
-- ORDER BY indexname;
